# Slopwatch v1 Architecture Decisions

Partial notes from a design interview. Captures decisions reached so far and the questions still open. Pick up from the open questions list.

Companion to [`coding-agent-ingestion.md`](./coding-agent-ingestion.md) (capture-surface research) and [`../CONTEXT.md`](../CONTEXT.md) (glossary).

**Terminology note.** Earlier drafts of this document used "sidecar" / "slopwatch-capture" for the on-machine capture component and "backend" / "slopwatch-server" for the self-hosted process. The canonical names are now **Listener** and **Server** respectively (see `CONTEXT.md`). Older phrasings below are left intact for historical clarity; treat the glossary as authoritative.

---

## Resolved decisions

### 1. Deployment model: team/org, self-hosted, on-prem mandatory

One mode. No SaaS. No local-only fallback. Solo use is a degenerate "team of one" that falls out for free — not a separate product.

**Why.** Sessions are understood to be public within the org when a developer is plugged in. That trust/visibility model is team-shaped from day one. Building solo-first would mean redesigning identity, visibility, and the DRI review flow later, which is exactly the expensive part to change.

### 2. Visibility: org-wide by default

When a dev opts into Slopwatch, their sessions become visible across the org. Individual privacy is explicitly traded for org-level value. On-prem self-hosting is the mitigation — data never leaves the org's infrastructure.

### 3. DRI (Directly Responsible Individual) is first-class

Per-team role who reviews sessions. Not an afterthought bolted onto a generic user model. Review semantics (below) are deliberately left open.

### 4. Live-spectate: ~5s polling, not push

A manager or DRI can watch a running session. Originally scoped to ~100ms via fs-watch + LISTEN/NOTIFY; downgraded to **HTTP polling every ~5s, with `visibilitychange` triggering refresh on tab focus**.

**Why downgraded.** Polling eliminates pub/sub, SSE, and WebSocket infrastructure. Backend stays stateless HTTP. 5s is still "a human watching another human code" — the real-time budget is generous for this use case. Faster can be added later without schema changes.

### 5. Capture model: per-session sidecar spawned by hook; no always-on daemon

The on-machine capture component is **not** a pre-existing background daemon. It is a per-session subprocess whose lifecycle is driven by the agent's own hook/extension system.

- **Claude Code / Codex / Copilot**: `SessionStart` hook launches `slopwatch-capture --session-id=... --agent=...` as a detached subprocess. That subprocess tails the agent's JSONL, receives subsequent hook fires on a local socket, POSTs normalized events to the backend, exits on `SessionEnd`.
- **Pi / OpenCode**: in-process extension/plugin loaded into the agent itself. Posts directly to the backend. No subprocess at all.

**Why.** A pure "hook fires curl" model is insufficient — hooks don't carry full message content (Claude Code / Codex / Copilot) and nothing streams between hook fires while the model is generating. A pre-existing daemon solves that, but introduces a "dev forgot to start it" failure mode and a non-trivial install ceremony (launchd/systemd/Windows service). The per-session sidecar threads the needle: the hook *is* the trigger that starts the process, so forgetting is impossible, and the process lives only during sessions — no always-on footprint.

**Consequence.** Concurrent sessions run concurrent subprocesses. They're cheap and independent. If coalescing becomes valuable (shared auth refresh, connection dedup), an optional always-on helper is a v2 addition that doesn't require changing the hook contract.

### 6. Auth: admin-minted per-user bearer tokens

OIDC is out of scope for v1. Instead:

1. Admin opens the self-hosted backend's admin UI, clicks "Add user," types a name + email.
2. Backend mints a long-lived bearer token. Admin hands it to the dev out-of-band (Slack, email).
3. Dev runs `slopwatch login <token>`. Sidecar stores it in the OS keychain (file fallback with 0600 perms on headless Linux).
4. Sidecar sends it as `Authorization: Bearer ...` on every request.

**Why.** OIDC device flow against an org IdP is the "right" answer but expensive to build for v1. Admin-minted tokens give trustworthy identity (each token bound to a user record), clean revocation, and a clean upgrade path: OIDC later becomes "another issuer of the same kind of token." The sidecar's auth surface stays a bearer token the whole time.

**Rejected.** A single shared org secret + git-config-email as claimed identity. Lighter to build but poisons the data — "whose session is this really?" is the exact question the product exists to answer, so the identity claim can't be spoofable during the validation period.

### 7. Deployment topology: single-binary app + externally-operated Postgres

One Go/Rust binary containing backend HTTP server + embedded frontend static assets. Points at a Postgres URL via flag/env var. Postgres is **not** embedded, not SQLite, not optional — it's a separate deployable unit the admin operates.

**Why separate.** The database must outlive app-version changes, be backed up independently, and be reasoned about as its own asset. Embedded SQLite would couple those lifecycles.

**What the admin does.** Provisions a Postgres instance (existing one, RDS, self-hosted, whatever they already know how to run). Runs `./slopwatch-server --db=postgres://...`. That's it.

**Rejected.** Docker Compose as the default shape (too opinionated about where Postgres comes from). K8s manifests as the only option (excludes smaller orgs). SQLite-default hybrid (violates the "separate deployable" constraint).

### 9. Session data model: DAG of turns inside one session

A **Session** is the logical run of one coding agent for one developer in one cwd. It contains a **directed acyclic graph of Turns** — linear for Claude Code / Codex / Copilot / OpenCode, a real tree for Pi.

- **Branches** (Pi) are nodes in the DAG, not separate Sessions. The data model stores `parent_turn_id` on each Turn. "The active leaf" is what live-spectate follows.
- **Subagents** (e.g. Claude Code Task tool) are **child Sessions** with `parent_session_id` + `spawned_by_turn_id`. Reviewed and queried independently.
- **Two units inside a Session**: a **Turn** is one user message + the full assistant response including all tool-use loops. A **Model request** is one HTTP call to the provider during a Turn; many Model requests per Turn. The cost dashboard sums Model requests; the DRI reviews Turns.
- **Resumes** (Codex `codex resume`, Pi resume, Claude Code compaction-continue) are **deliberately unresolved** until v1 is running — the right shape is hard to see in the abstract, and deferring costs nothing because each of the five agents treats resume differently anyway. Revisit with real data.

**Why DAG-inside-session instead of branch-as-separate-session.** Modeling every Pi branch as its own Session inflates session counts ("Alice ran 6 sessions today" when she meant "I explored 6 alternatives in one session"), breaks live-spectate URLs at every branch point, and forces review UIs to re-aggregate across rows. Keeping the DAG internal means the non-branching agents see a degenerate linear DAG (free), while Pi gets honest tree structure without polluting the top-level schema.

**Rejected.** Flattening subagents into the parent Session's Turns. Loses the "how is my Explore subagent behaving this week" query, which is exactly the kind of thing a DRI wants to ask.

### 8. Live-spectate implementation: stateless polling over Postgres

- Sidecar POSTs events to backend; backend writes to Postgres with a per-session monotonic `event_seq`.
- Watching browser calls `GET /sessions/:id/events?since_seq=N` every ~5s and on tab-focus.
- Backend is stateless — any replica can serve any query.

**Why.** Matches the single-binary + Postgres constraint. No LISTEN/NOTIFY, no pub/sub, no in-memory watcher tables. Horizontal scaling later comes free.

---

## Tentative / proposed but not confirmed

### Review model (proposed, not accepted)

Interview exited before this was resolved. The proposal on the table:

- **Session lifecycle**: `active → ended`. Nothing more on the session itself.
- **Review state lives on a separate `ReviewItem` entity**, orthogonal to session state.
- **DRI is a queryer, not a recipient**: inbox starts empty; DRI pulls from a firehose filtered by configurable heuristics (cost, team, unreviewed-first).
- **Review unit is turn-level comments**, not session-level verdicts. Schema: `review_comments(session_id, turn_seq, author_id, body, created_at)` plus `session_reviews(session_id, reviewer_id, reviewed_at)`.
- **Notifications are pull-only in v1**. Email/Slack push is v2.

The open question that blocked this: **is DRI a queryer (as proposed) or a recipient (sessions get assigned/routed to a DRI on end)?** The data model differs materially between the two.

---

## Open questions — pick up here

Roughly in priority order for continuing the design:

1. **DRI shape** (blocks the review schema). Four edges surfaced mid-grill but unresolved:
   - **Queryer vs recipient**: DRI pulls from a filterable firehose, or sessions get auto-routed to a DRI's inbox on end?
   - **Scoping**: DRI per team (requires a `Team` entity) or per org?
   - **Attribute vs identity**: can one user be DRI for multiple teams and a reviewed dev on the same team?
   - **Permission boundary vs accountability marker**: given org-wide visibility, is the only DRI-specific power "mark session as reviewed," or do DRIs also gate who can view/comment/spectate?
2. **Raw agent-specific payload storage.** NormalEvent keeps the original raw event for fidelity. Store as JSONB alongside normalized events in Postgres, or offload to an S3-compatible blob store with a pointer in Postgres? Depends on expected payload sizes and how often raw is actually read.
3. **Data retention and pruning.** Keep everything forever? TTL-based deletion? Per-team retention policy? Archival to cold storage?
4. **Sidecar buffering when backend is unreachable.** Local append-only log on disk? How much? What happens when it fills?
5. **NormalEvent schema specifics.** The research enumerates the categories (Session, Turn, Message, Tool event, Model request, raw payload) but the exact fields, especially for tricky cases (Pi's DAG, Codex resumes, Claude Code compaction, subagent transcripts), are not drawn.
6. **Schema-drift handling per agent.** Claude Code JSONL is undocumented; Copilot JSONL is undocumented; Pi has bumped schema v1→v2→v3. Adapters need a version detection + pin strategy. What does "adapter doesn't recognize this version" do — fail closed, fail open with warning, partial capture?
7. **Frontend stack.** Bundled into the binary as static assets — but React SPA? Server-rendered? HTMX? Affects dev velocity and the "single binary" build pipeline.
8. **Backend language/runtime.** Go, Rust, Node? Affects sidecar consistency (same language across sidecar + backend?) and the in-process TypeScript extensions for Pi/OpenCode (those *must* be JS/TS).
9. **Sidecar language.** Must run on dev machines across macOS/Linux/Windows with minimal install friction. Node (available wherever the agents are installed)? Go (single static binary per OS)? Rust (same)?
10. **`npx slopwatch install` flow.** Detect installed agents, wire up per-agent hooks/extensions idempotently, store backend URL + token. Exact UX not drawn.
11. **Identity binding beyond the token.** Does the sidecar send extra context (git email, OS user, hostname, cwd, repo)? Which of those are useful for the DRI view vs. noise?
12. **Cost/token tracking.** Codex and Claude Code emit token usage; Copilot JSONL probably does too. Normalizing across providers (OpenAI vs Anthropic pricing, cached tokens, reasoning tokens) is its own small project.
13. **Admin UI scope.** Minimally: add/revoke users, view system health, configure retention. What else needs to be in v1?

---

## Architectural shape, as of this document

```
┌───────────────────────────────┐        ┌───────────────────────────┐
│ Developer machine             │        │ Org-operated self-hosted  │
│                               │        │                           │
│  Coding agent (Claude Code,   │        │  slopwatch-server         │
│  Codex, Pi, OpenCode, Copilot)│        │  (single binary)          │
│   │                           │        │   - HTTP API              │
│   │ hook fires / plugin loads │        │   - Static frontend       │
│   ▼                           │        │   - Stateless             │
│  slopwatch-capture            │──POST─▶│                           │
│  (per-session subprocess,     │ events │          │                │
│   or in-process extension     │        │          ▼                │
│   for Pi/OpenCode)            │◀polls──│  Postgres (separate       │
│                               │        │  deployable, org-operated)│
└───────────────────────────────┘        └───────────────────────────┘

                              ▲
                              │ polling GET /sessions/:id/events?since_seq=N
                              │
                   ┌──────────┴──────────┐
                   │ Browser tab         │
                   │ (DRI / manager /    │
                   │  dev themselves)    │
                   └─────────────────────┘
```
