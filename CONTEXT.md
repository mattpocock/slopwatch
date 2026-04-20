# Slopwatch

Self-hosted, on-prem observability platform for coding agents. See [`research/v1-architecture-decisions.md`](./research/v1-architecture-decisions.md) and [`research/coding-agent-ingestion.md`](./research/coding-agent-ingestion.md).

## Language

**Coding agent**:
An AI coding tool that runs on a developer's machine (Claude Code, Codex CLI, Pi, OpenCode, Copilot CLI).
_Avoid_: assistant, bot, AI tool.

**Session**:
One logical run of one coding agent for one developer in one cwd, containing a DAG of turns.
_Avoid_: conversation, chat, run.

**Turn**:
One user message plus the full assistant response, including all tool-use loops inside it.
_Avoid_: message, exchange, step.

**Model request**:
One HTTP call the agent makes to the model provider during a turn.
_Avoid_: API call, inference, completion.

**Subagent**:
A coding agent spawned by another coding agent (e.g. via Claude Code's Task tool), treated as a child session.
_Avoid_: sub-task, nested agent, delegate.

**Listener**:
The per-agent integration that observes one coding agent on a developer's machine, normalizes its events, and ships them to the Server — one per supported coding agent.
_Avoid_: sidecar, adapter, capturer, probe, collector.

**Server**:
The single self-hosted process that receives events from Listeners, stores them in Postgres, serves the dashboard, and hosts the admin plane — one per organization.
_Avoid_: backend, hub, daemon, collector.

**User**:
A person with an identity in one Slopwatch organization — may run coding agents, review sessions, administer the Server, or any combination.
_Avoid_: developer, member, account. ("Developer" is a role a **User** plays when running a coding agent; not every **User** is a developer.)

## Relationships

- A **Session** contains a DAG of **Turns**; most agents produce a linear DAG, Pi can branch.
- A **Turn** contains zero or more **Model requests**.
- A **Subagent** is a **Session** whose `parent_session_id` points to the spawning **Session** and whose `spawned_by_turn_id` points to the **Turn** that launched it.
- A **Listener** produces **Sessions**, **Turns**, and **Model requests** for exactly one **Coding agent**; it runs either as a subprocess (Claude Code, Codex, Copilot) or as an in-process extension (Pi, OpenCode).
- Many **Listeners** POST to one **Server**; the **Server** is the only component that talks to Postgres.

## Example dialogue

> **DRI:** "This **Session** cost $14 — where did it go?"
> **Dev:** "Most of it was one **Turn** where the agent did 22 tool calls; each was a **Model request** charged separately. The rest is a **Subagent** I spawned with the Task tool — it's a child **Session** with its own cost."

## Flagged ambiguities

- "turn" was used early to mean "one API call to the model" — resolved: that's a **Model request**. A **Turn** is the user-visible cycle and can contain many **Model requests**.
- "session" in Pi has branches; these are **not** separate **Sessions** but nodes in a single **Session**'s DAG.
- Resumes (Codex `codex resume`, Pi resume, Claude Code compaction-continue) are unresolved — defer until v1 is running.
- "listener" collides with in-agent event-listener terminology (Pi `pi.on(...)`, OpenCode plugin events). Accepted for now; revisit if docs get confusing.
- "user" vs "developer" — resolved: the entity is **User**; "developer" is a role (the subset of **Users** who run coding agents observed by Slopwatch). The prototype leaderboard column labelled "Developer" is a role-filtered view of **Users**, not a separate entity.
