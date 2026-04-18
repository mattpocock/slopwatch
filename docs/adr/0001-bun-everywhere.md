# Bun as the sole runtime and toolchain

Bun is the runtime and toolchain for the Listener, the Server, development, and tests. `bun build --compile` produces the single-binary Server and the no-Node escape-hatch Listener. Node is not used as a dev runtime; Node SEA is not used for distribution.

## Why

- The audience is TypeScript developers, so Node is almost always present. The Listener can ship primarily as a TS package, with the Bun-compiled binary as a fallback.
- Standardizing dev-and-ship on one runtime avoids the "works on my Node, crashes in compiled Bun" divergence a split would create.
- Bun's `--compile` is more mature than Node SEA in 2026 and gives a cleaner single-binary story, which matches the single-binary-app + externally-operated-Postgres deployment shape.

## Rejected

- **Node everywhere + Node SEA for distribution.** SEA is rougher and still produces ~80MB binaries — no real size win.
- **Node for dev, Bun only for `--compile`.** Runtime divergence between dev and shipped artifact is a nasty debugging class.
- **A compiled language (Rust or Go) for the Listener and/or Server.** Smaller and faster-starting binaries, but Pi and OpenCode require in-process extensions loaded into their own JS/TS runtimes — those two adapters are TS no matter what. Any compiled choice therefore forces a permanent hybrid stack with a wire-schema-sync tax (`NormalEvent` maintained in two languages) paid on every feature. Hook-contract research established that Listener cold start is not on the user-visible REPL critical path, so the compiled-language perf advantage doesn't land anywhere the user notices.

## Consequence

We are on the hook for Bun's compatibility quirks on the four surfaces we rely on: the Postgres client (`pg`), file-watching, local IPC (Unix sockets / Windows named pipes), and OS keychain access. Validate these before significant code is written against them; if any is broken on Bun, revisit this decision rather than working around it.
