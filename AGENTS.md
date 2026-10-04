# MenuPlanner — guide for coding agents

A self-hosted family meal planner (Bun + TypeScript monorepo). Read this file
before working in the repo; README.md has the user-facing documentation.

## Using the app (meal-planning workflows)

When the user asks for meal-planning help — plan a week, add a recipe — use
the workflows in `agent-workflows/`. They talk to the running app through the
`mp` CLI (`bun run mp <command>`, see `scripts/mp.ts`), configured by
`MENUPLANNER_URL` / `MENUPLANNER_TOKEN` in the environment or a gitignored
`.mp.env`. Never edit the SQLite database directly.

| Request | Workflow |
|---------|----------|
| "Plan next week", "make a menu" | `agent-workflows/plan-week.md` |
| "Add this recipe", "import <url>" | `agent-workflows/add-recipe.md` |

Both Claude Code (`.claude/skills/`) and Codex (`.agents/skills/`) expose these
as skills with thin wrappers pointing at the shared docs. Edit the docs in
`agent-workflows/`, not the wrappers; `scripts/workflows.test.ts` checks that the
wrappers, the commands, and the JSON examples stay in sync.

## Working on the code

- Layout: `apps/backend` (Hono + tRPC + Drizzle on `bun:sqlite`), `apps/frontend`
  (React 19 + Vite, plain CSS), `packages/shared` (`@menu/shared`: pure logic and
  zod schemas used by both and by the CLI), `scripts/` (`mp` CLI).
- Commands: `bun install`, `bun run test`, `bun run typecheck`, `bun run build`,
  `bun run dev:backend` / `bun run dev:frontend`, `bun run seed:demo`.
- Schema changes go in **both** `apps/backend/src/db/schema.ts` and the
  idempotent SQL in `apps/backend/src/db/migrate.ts`.
- The agent REST API lives in `apps/backend/src/rest/v1.ts`; keep `scripts/mp.ts`
  and the workflow docs in step with it.
- UI is phone-first: base CSS targets ~390px, wider layouts are min-width media
  queries, tap targets ≥ 44px, inputs ≥ 16px text.
- Style: 2-space indent, no semicolons, single quotes, `.js` import suffixes.
  Comments explain why, not what.
- Every change goes through a PR, and every PR updates README.md so it
  describes exactly what exists.
