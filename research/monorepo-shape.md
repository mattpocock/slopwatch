# Monorepo shape

Decisions from the design session on how to lay out the Slopwatch repo. Pairs with [`bun-workspaces-maturity.md`](./bun-workspaces-maturity.md) (tooling research) and [ADR 0001](../docs/adr/0001-bun-everywhere.md) (Bun-everywhere).

## Decisions

### Monorepo, not multi-repo

Slopwatch ships a Server and five Listeners (Claude Code, Codex, Pi, OpenCode, Copilot) that all speak a shared wire schema. That fan-out is textbook monorepo territory — the shared schema needs to evolve in lockstep with the code that produces and consumes it.

### Bun workspaces, not pnpm + Turbo

ADR 0001 pins Bun as the sole runtime and toolchain. Bun workspaces cover `workspace:*` linking, `--filter` fan-out, and install for this size of repo. No Turbo for now; layer it on later if CI build times hurt or remote caching becomes worth it. Migration onto Turbo is cheap and doesn't change the layout.

### Hoisted linker, not isolated

Set `linker = "hoisted"` in `bunfig.toml`. Bun 1.3's isolated-linker + catalogs combo has an open dedupe/cache bug ([#23615](https://github.com/oven-sh/bun/issues/23615)); hoisted is the well-trodden path until that closes. Cost: we lose phantom-dependency detection — mitigate with a `knip` or `depcheck` pass in CI. Revisit once #23615 is fixed.

### Avoid catalogs for now

Same reason — pin versions directly in the root `package.json` until the catalog dedupe bug is resolved.

### Grouped layout (apps / listeners / packages)

```
apps/
  server/
listeners/
  claude-code/
  codex/
  pi/
  opencode/
  copilot/
packages/
  wire/
bunfig.toml
package.json         # workspaces: ["apps/*", "listeners/*", "packages/*"]
```

- `apps/` — deployable processes. Only `server` today; a standalone dashboard would land here.
- `listeners/` — the per-agent integrations, one package each. Visually obvious fan-out; `bun run --filter './listeners/*' test` targets the family.
- `packages/` — shared libraries. Follows the standard deployables-vs-libraries split that Turbo examples assume, so a later Turbo migration is frictionless.

### Fat `packages/wire`, not types-only

`packages/wire` holds both the `NormalEvent` schema and the typed Listener→Server client (send, retry/backoff, auth header, batching). Five listeners POSTing to the same endpoint with the same semantics shouldn't duplicate that code.

Watch-out: Pi and OpenCode run in-process inside their host agent's JS runtime. If host runtime constraints (fetch polyfills, stream shapes) make the fat client awkward there, split into `packages/wire-schema` + `packages/wire-client` and let those two listeners bring their own transport.

## Open questions

- Is each listener genuinely a separate package, or is there a `listener-core` with per-agent adapters? Deferred — pick once a second listener is actually being written and the duplication is visible.
- Whether to add `knip` / `depcheck` in CI immediately to compensate for hoisted mode, or wait until the first phantom-dep bug bites.
