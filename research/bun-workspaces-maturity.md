# Bun workspaces maturity (April 2026)

Research notes supporting the decision to use Bun workspaces for the Slopwatch monorepo instead of pnpm + Turbo.

## What works well

- **`workspace:*` protocol** with full glob patterns (including negation like `!packages/**/test/**`) and publish-time version rewriting (`workspace:^` → `^1.0.1`).
- **Install speed**: ~8× faster than pnpm on cold installs.
- **`--filter` flag** for `bun install` and `bun run`, with glob + negation + path-based selectors. `--workspaces` runs a script across every package.
- **Catalogs** shipped in Bun 1.3 (`catalog:` protocol in root `package.json`) — pnpm-catalog parity on paper.
- **Isolated installs** (default since 1.3) give strict per-package dependency visibility similar to pnpm.

## Rough edges vs pnpm

- **Isolated + catalog bugs** ([#23615](https://github.com/oven-sh/bun/issues/23615)): catalog fails to dedupe compatible semver ranges; cache leaks stale versions across reinstalls. Workaround: use the hoisted linker.
- **Re-install perf regression** ([#25799](https://github.com/oven-sh/bun/issues/25799)): `bun i` on an already-installed repo is ~70× slower than pnpm (as of 1.3.4, Feb 2026).
- **Hoisting control** weaker — [#7547](https://github.com/oven-sh/bun/issues/7547) (always-hoist behavior) is a long-standing complaint.
- **No built-in task graph / caching** — `--filter` runs scripts but there's no topological ordering with change detection or remote cache. Turbo/Nx territory.
- **Selective resolutions / overrides** exist but are less battle-tested than pnpm's `pnpm.overrides`.
- Peer deps: closer to npm's permissive model than pnpm's strict one.

## Production usage

Small-to-medium monorepos ship on Bun workspaces alone. Larger teams pair Bun (as PM + runtime) with Turborepo for caching and task orchestration. Turbo and Nx both officially support Bun as the underlying package manager in 2026.

## Verdict for Slopwatch

Six packages (server + 5 listeners + shared schema) with a clear fan-out doesn't need a task graph. `bun run --filter` covers dev/test/build fan-out.

**Precautions:**

1. Stay on the **hoisted linker** (`linker = "hoisted"` in `bunfig.toml`) until #23615 closes — isolated + catalog is the current landmine.
2. Avoid catalogs short-term; use pinned versions in the root `package.json` until the dedupe bug is fixed.

**Add Turborepo later** if/when (a) CI build times hurt, (b) remote caching is wanted, (c) cross-package task ordering gets fiddly. Migration is cheap — Turbo layers on top without changing the workspace layout.

## Sources

- [Bun docs: Workspaces](https://bun.com/docs/pm/workspaces)
- [Issue #23615 — isolated + catalog bugs](https://github.com/oven-sh/bun/issues/23615)
- [Issue #25799 — 70× slower reinstalls](https://github.com/oven-sh/bun/issues/25799)
- [Issue #7547 — always-hoist behavior](https://github.com/oven-sh/bun/issues/7547)
- [hy2k.dev — Bun install: isolated vs hoisted (Oct 2025)](https://hy2k.dev/en/blog/2025/10-15-bun-install-isolated-vs-hoisted/)
- [Bun Package Manager Reality Check 2026](https://vocal.media/01/bun-package-manager-reality-check-2026)
- [PkgPulse: pnpm vs Bun vs npm 2026](https://www.pkgpulse.com/blog/pnpm-vs-bun-vs-npm-2026)
- [Nx: Set Up Bun with Mise on CI](https://nx.dev/docs/guides/nx-cloud/use-bun)
