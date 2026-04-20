# Developer Leaderboard: Design Decisions

Design decisions extracted from the prototype's user-facing table — the **Leaderboard** (`prototype/src/widgets.jsx` → `LeaderboardTable`, backed by `prototype/src/data.jsx` → `USERS` / `LEADERBOARD`). This is the dashboard's top-level "who is doing what, and at what cost" surface.

Companion to [`v1-architecture-decisions.md`](./v1-architecture-decisions.md) (backend/data model) and [`coding-agent-ingestion.md`](./coding-agent-ingestion.md) (capture surfaces).

---

## What it is

A ranked table of developers in the org, sorted by today's spend descending. One row per user. The prototype ships with 12 rows — intended scale is "a team / org roster," not "all humans ever."

Distinct from the **Live Sessions** table, which is keyed by session (many per user, ephemeral). The Leaderboard is keyed by user (one per person, persistent). Both surface the same underlying `user` handle, but answer different questions:

- *Live Sessions*: "what's running right now?"
- *Leaderboard*: "who is spending / working the most?"

---

## Resolved design decisions

### 1. Label the column "Developer," not "User"

The data model key is `user` / `handle`, but the rendered header is **Developer**. The product is aimed at engineering orgs watching coding-agent usage; "developer" is the role the table is about. "User" is an implementation detail.

**Consequence.** Elsewhere in the UI (search placeholder: *"Search sessions, users…"*), `user` still leaks through. Either normalize to "developer" everywhere, or accept "user" as the generic term and "developer" as the contextual one. Prototype is inconsistent — pick one for v1.

### 2. Identity = name + handle + team + avatar hue

Each user record carries:

- `name` (display, e.g. "Mira Chen")
- `handle` (mono, `@mira.chen` — stable key, used by sessions/fanouts to reference)
- `team` (free-form string: "Core", "Payments", "Infra", "Growth", "Platform")
- `avatarHue` (0–360, deterministic per user, drives a colored initials avatar)

Team is **modeled on the user**, not inferred from sessions or repos. This implies a `Team` entity or at minimum a `team` field on the user record — which ties into the unresolved "DRI scoping: per team or per org" question in `v1-architecture-decisions.md` §Open questions.

**Avatar is a hue, not an uploaded image.** No image hosting, no GDPR-shaped photo problem, and still visually distinct enough to scan a 12-row table. Initials + colored background — same pattern as Linear / GitHub fallbacks.

### 3. Primary sort key is today's spend

The table is always sorted by `spend` descending. There is no sort control in the prototype — the ranking *is* the point. "Who cost the org the most money today" is the headline question.

Rank column shows zero-padded two-digit position (`01`, `02`, …) — reads as a hard ordinal, not a score.

### 4. Three density modes, progressively dropping columns

The table renders at three densities, each a strict subset of the previous:

| Column     | Dense | Balanced | Sparse |
| ---------- | :---: | :------: | :----: |
| Rank       |  ✓    |    ✓     |        |
| Developer  |  ✓    |    ✓     |   ✓    |
| Today (spark) | ✓  |    ✓     |        |
| Spend      |  ✓    |    ✓     |   ✓    |
| Share      |  ✓    |    ✓     |        |
| Sessions   |  ✓    |    ✓     |   ✓    |
| Turns      |  ✓    |    ✓     |        |
| Requests   |  ✓    |          |        |
| Top agent  |  ✓    |    ✓     |   ✓    |
| 7d Δ       |  ✓    |    ✓     |   ✓    |

The sparse view keeps: identity, money, session count, primary agent, trend. That's the "five-second answer" set. Dense view is for power users scanning rows.

The Developer cell *itself* also densifies: in dense mode the secondary line (`@handle · team`) is hidden, avatar shrinks from 22px → 18px. Density is not just column visibility — it's per-cell too.

### 5. Three usage metrics at different granularities: Sessions, Turns, Requests

These map directly onto the v1 data model hierarchy:

- **Session** — logical run of one agent for one dev in one cwd.
- **Turn** — one user message + the full assistant response (incl. tool-use loop).
- **Model request** — one HTTP call to a provider during a Turn.

Surfacing all three in the leaderboard is a deliberate bet: different readers care about different granularities. A DRI wondering "how many distinct pieces of work" reads Sessions. A manager asking "how intensely is this person driving" reads Turns. A cost nerd correlating to spend reads Requests. Collapsing to one number would force a premature editorial choice.

### 6. Money is the anchor metric; it gets two visual treatments

- **Spend** (right-aligned, tabular numerals, high-contrast text) — the precise number.
- **Share** (horizontal bar, normalized to the top spender) — the proportion at a glance.

Both are present in dense/balanced view. They answer different questions — "how much" vs "what fraction of total." Share uses `max(spend)` as the denominator (so rank-1 is always a full bar), not total org spend — this emphasizes relative distribution between developers, not each dev's share of the org.

### 7. Hourly sparkline per user ("Today" column)

24 data points per user, one per hour. Seeded per `handle` so the shape is stable across reloads. Shown in dense/balanced, hidden in sparse.

This requires the backend to either:

- Maintain an hourly rollup per user (cheap query, stale-by-up-to-1h), or
- Compute on demand from the Model requests table (expensive at org scale).

Implication: an **hourly user-spend rollup table** is probably required for v1. Not yet documented in the data-model research — flag as an open question.

### 8. "Top agent" column, not full breakdown

Each user gets a single `topAgent` shown as a colored chip. The breakdown-by-agent lives in the separate **Spend by Agent** widget (org-level, not per-user).

The per-user × per-agent matrix is *not* surfaced on the leaderboard. Decision: leaderboard answers "who," the spend-by-agent chart answers "what tool." Crossing them is a drill-down, not a table column. Avoids the 5-agent wide table problem.

### 9. 7-day delta as trend, colored

`delta` is a signed fraction (e.g. `+0.23` = up 23% vs last week). Rendered as a percentage with sign, green for positive, red for negative.

Notable: **positive is green** regardless of metric. On a spend leaderboard, "+40% week-over-week" arguably warrants a warning color, not success. The prototype treats "more activity = good" — which is a product stance (Slopwatch celebrates usage) rather than a neutral one (spend going up is neither inherently good nor bad). Worth re-examining before v1.

### 10. Row affordances: hover highlight, cursor: pointer

Every row highlights on hover (`--surface-2` background) and shows a pointer cursor. The click target isn't wired up in the prototype, but the affordance commits to **clicking a row drills into that developer's detail view**. That detail view isn't drawn yet — open question.

### 11. Typography: tabular numerals, mono for identifiers, uppercase small headers

- All numeric cells use `mono tnum` (JetBrains Mono + `font-variant-numeric: tabular-nums`) — columns align digit-for-digit, scannable.
- Identifiers (`@handle`, session IDs) are also mono — signals "this is a stable key, not prose."
- Column headers are uppercase, 2px smaller than body, letter-spaced 0.07em — conventional "data-table" header styling (Linear / Stripe Sigma / Datadog).

Body text for names uses proportional font at `--font-ui`. The mono/proportional split is the primary typographic signal for "data vs. label."

### 12. No inline actions, no multi-select, no filters

The leaderboard is **read-only scannable**, not a workbench. No checkboxes, no row-level action menu, no column filters in the table itself. Filtering/searching happens at the shell level ("Search sessions, users…" in the top bar).

This is consistent with the DRI-as-queryer proposal (v1 arch doc §Review model): the leaderboard is one of several ways to *enter* a queryable firehose, not a mutation surface.

---

## Implied backend requirements

Reading the leaderboard backwards into the data model, the backend needs to serve, per user, per day:

- Aggregate `spend`, `sessions_count`, `turns_count`, `requests_count`.
- A 24-point hourly sparkline of spend.
- `top_agent` (mode of agent across today's sessions).
- `delta_7d` (this-7d-total vs previous-7d-total, as a fraction).

And per user (static):

- `name`, `handle`, `team`, `avatar_hue`.

Call this a **`user_daily_rollup`** + **`user_hourly_rollup`** pair. Neither is written up in `v1-architecture-decisions.md` yet.

---

## Open questions

1. **"Developer" vs "user" naming.** Pick one; the prototype uses both. Ties into whether the product's vocabulary distinguishes "person who is being observed" from "person logged into the dashboard" (they overlap but aren't identical — a DRI is a user who may not be a reviewed developer on their own team).
2. **Team modeling.** Is `team` a free-form string on the user, or a first-class `Team` entity with its own DRI? Unresolved in the architecture doc; the leaderboard commits to *at least* a string.
3. **Click-through target.** Where does a row click go? A per-user "all their sessions today" view? A longer-range profile? Not drawn.
4. **Delta color semantics.** Green-for-up is cheerful but misleading on a spend metric. Consider neutral (both directions gray), or invert for cost columns specifically.
5. **Hourly rollup table.** The sparkline demands it — confirm the schema and retention.
6. **Sort/filter controls.** Currently implicit (spend desc, today). Will v1 need "sort by turns," "filter to team," "last 7d instead of today"? If yes, the density-based column-hiding model interacts awkwardly with user-chosen column sets.
7. **Scaling past a roster.** 12 rows is a roster; 500+ rows is a directory. Pagination, virtualization, and a "show only active today" filter all become necessary. The prototype doesn't commit.
