# AI Startup Lab Tycoon

A deterministic AI-lab management game (Civ × Game Dev Tycoon): run a research
labs, design and train foundation models, launch them into Chat / Developer
API / Enterprise products, and survive funding rounds, rivals, and incidents.
V1 is a sandbox — the first multimodal launch is a milestone, not a fixed win.

## Stack

Monorepo (pnpm + Turborepo):

- **`packages/engine`** — the pure, deterministic game engine. Component-based
  TypeScript, integer math, seeded RNG (no `Date`/`Math.random`/network). Runs
  headless; every transition is command-logged and replayable.
- **`packages/db`** — Cloudflare D1 schema (auth tables + one active run per
  user) with Drizzle.
- **`packages/api`** — oRPC routers, including authenticated `applyCommand`
  gameplay plus `getActiveRun` / `deleteActiveRun`.
- **`apps/server`** — Hono worker hosting Better Auth (anonymous sessions) and
  the oRPC/OpenAPI handlers.
- **`apps/web`** — TanStack Start dashboard (desktop grid + mobile tabs).
- **`apps/sim-cli`** — seeded balance/simulation CLI over the public engine API.
- **`packages/ui`** — shared shadcn/ui primitives and design tokens.

## Getting started

```bash
pnpm install
pnpm run dev        # web on :3001, API on :3000
```

Better Auth mints an **anonymous session** on first load (no signup UI in V1),
and one active run is autosaved per anonymous user to D1. Refresh/resume loads
that exact run; cross-user access is rejected; an integer `revision` gives
optimistic concurrency (stale writes surface a conflict, never silent
overwrite).

## Database

```bash
pnpm run db:generate   # Drizzle migration from packages/db schema
```

Runtime DB access uses the Cloudflare `DB` binding from
`packages/infra/alchemy.run.ts`. Alchemy provisions D1 and applies migrations
on deploy.

## Simulation CLI (balance)

```bash
pnpm --filter @ai-lab-tycoon/sim-cli sim -- --runs 10 --seed 42
pnpm --filter @ai-lab-tycoon/sim-cli sim -- --runs 50 --seed 42   # balance checkpoint
```

Four deterministic bots (`random`, `capability-rusher`, `evaluator`,
`efficiency-first`) drive the engine and print a machine-readable JSON line plus
a balance table (milestone reach, loss causes, week percentiles, compute
shortages, rival leads, funding rounds, foundation choices). `--runs` is
restricted to 10–50. The CLI asserts same-seed determinism on every run.

Balance results live in [`docs/V1_BALANCE_BASELINE.md`](docs/V1_BALANCE_BASELINE.md).

## Checks

```bash
pnpm run check         # Biome lint + format
pnpm run check-types   # TypeScript across workspaces
pnpm run test          # Engine Vitest suite
pnpm run build         # Production builds
```

## Deployment (Alchemy/Cloudflare)

```bash
pnpm run deploy    # staged deploy (web + server workers, D1)
pnpm run destroy
```

After the first deploy set `CORS_ORIGIN` in `apps/server/.env` to the exact
_deployed web origin_ and redeploy the server. `BETTER_AUTH_SECRET` is
required for every server deployment: set it to a random value of at least 32
characters in the environment used by `alchemy deploy` (for example, in
`apps/server/.env` or your deployment secret manager). The server fails closed
if the binding is absent or too short.

## V1 scope

Sandbox with no fixed win; 30–60 minute session; no authored story/advisors.
One to three teams; five resources (Cash, Compute, Insight, Trust, Hype);
Text → Assistant → Multimodal research tree; Chat / Developer API / Enterprise
products; two rivals plus a third in the Assistant era; Seed + Series A
funding; six incidents; mechanical reports as the only narrative output.
