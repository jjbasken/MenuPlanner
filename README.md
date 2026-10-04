# MenuPlanner

A self-hosted family meal planner, built to be used mostly from a phone. Everyone in the household gets their own login and shares one plan.

> **Status:** early development. This release contains the foundation: accounts, the app shell and deployment. Meal planning features land in follow-up releases, and this README is updated with each one.

## Features

- **Separate logins, shared household data.**
  - The first account is created through a one-time setup screen protected by `BOOTSTRAP_TOKEN`, and it becomes the admin.
  - Admins add the rest of the family's logins, promote or demote admins, sign users out everywhere, and delete accounts. The last remaining admin can't be deleted.
- **Account settings:** change your display name or password. Changing your password signs out your other devices.
- **Phone-first, installable app (PWA):**
  - On phones, navigation is a bottom tab bar that respects iPhone safe areas; from tablet width up it moves to pill buttons in the header.
  - "Add to Home Screen" works on iOS and Android, with icons and a standalone display.
  - A service worker caches the app shell so it opens quickly.
- **Security:**
  - Passwords are hashed with Argon2id.
  - Failed logins and setup attempts are rate-limited, and a login for an unknown username takes as long as one for a real account.
  - Login tokens are revocable: logging out revokes that session, and admins can revoke all of a user's sessions.
  - The server refuses to start with a weak or placeholder `JWT_SECRET`.
  - nginx serves a strict CSP (all fonts and scripts are first-party) and HSTS.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime / package manager | [Bun](https://bun.sh) workspaces |
| Backend | [Hono](https://hono.dev) + [tRPC](https://trpc.io) 11, [zod](https://zod.dev) validation |
| Database | SQLite via `bun:sqlite` + [Drizzle ORM](https://orm.drizzle.team) |
| Auth | Argon2id (`Bun.password`), HS256 JWTs via [jose](https://github.com/panva/jose) |
| Frontend | React 19, React Router 7, TanStack Query, Vite 6, plain CSS |
| Fonts | Bricolage Grotesque, self-hosted via `@fontsource` |
| Serving | nginx (static files + `/api` proxy), Docker Compose, optional Cloudflare Tunnel |

## Project layout

```
apps/
  backend/            Hono + tRPC API server
    src/
      index.ts        Entry point: config checks, migrations, server
      app.ts          HTTP routes (/api/trpc/*, /health)
      router.ts       tRPC router (auth, users)
      routers/        auth.ts, users.ts
      db/             schema.ts (Drizzle), migrate.ts (idempotent SQL run at boot)
      lib/            jwt, rate limiting, input limits, secret helpers
    tests/            bun:test suites
    Dockerfile
  frontend/           React SPA
    src/
      routes/         LoginPage, SetupPage, SettingsPage
      components/     AppShell (header + tab bar), Icon, ProtectedRoute
      hooks/ lib/     auth, tRPC client, session storage
      index.css       Design tokens + phone-first styles
    public/           manifest.json, sw.js, icons
    nginx.conf, security-headers.conf, Dockerfile
packages/
  shared/             @menu/shared — pure TypeScript used by backend, frontend and CLI
    src/
      ingredients.ts  Combine a week's ingredients; unit conversion; kitchen formatting
      dates.ts        Local-calendar date helpers, Monday week starts, "push back" shifting
      plan.ts         Cook-night numbering ("1 of 3"), thaw-tonight reminders
      schemas.ts      zod schemas for recipes and weekly plans
      types.ts, limits.ts
    tests/
docker-compose.yml
.env.example
```

### Shared planning logic

`@menu/shared` has no I/O and is unit-tested on its own:

- **Ingredient aggregation:**
  - Ingredient names are matched ignoring case, spacing and simple plurals, so "Yellow onions" and "yellow onion" are the same item.
  - Volumes (tsp/tbsp/cup/fl oz/pint/quart/gallon/ml/l) and masses (oz/lb/g/kg) are converted to a common base and summed. The total is shown in a readable unit: imperial if any input was imperial, otherwise metric.
  - Units that can't be converted (cans, cloves, bunches…) are summed per unit and listed side by side, e.g. "8 oz + 2 cans".
  - Amounts use kitchen fractions (1½, ⅓). An amount that doesn't fit a measuring cup, like ⅜ cup, is shown in spoons instead: 6 tbsp.
  - Each combined item records which meals it came from.
- **Dates:** plans use plain `YYYY-MM-DD` dates in the household's local calendar, and weeks run Monday to Sunday. "Push back" moves tonight's meal and every later one by N days.
- **Plan helpers:** cook nights are numbered in date order. A freezer item linked to a meal produces a "Thaw tonight" reminder the evening before.
- **Schemas:** the zod input schemas for recipes and weekly plans. The API and the agent CLI will both validate against these.

The database schema already includes the tables for upcoming features: recipes, plans, the freezer, staples, shopping items and feedback. Only accounts are wired up so far.

## Running with Docker Compose

1. Copy `.env.example` to `.env` and fill in:
   - `JWT_SECRET`: required, at least 32 characters. Generate it with `openssl rand -base64 48`.
   - `BOOTSTRAP_TOKEN`: needed once, to create the first account. Generate it with `openssl rand -base64 24`.
   - `APP_UID` / `APP_GID`: optional. Set these to the owner of the data directory (`id -u` / `id -g`).
2. Start the app:

   ```bash
   mkdir -p data
   docker compose up -d --build
   ```

3. Open `http://localhost:3010`. Change the port with `MENU_PORT`; it's bound to `127.0.0.1` only. On a fresh database you're sent to **Set up MenuPlanner**: enter the `BOOTSTRAP_TOKEN` value to create the admin account. After that, add your family's logins under **Settings → Family logins**.

The SQLite database is stored in `./data/menu.sqlite`. Change the location with `DATA_PATH`.

### Cloudflare Tunnel (optional)

The `cloudflared` service only runs under the `tunnel` profile:

```bash
docker compose --profile tunnel up -d --build
```

Set `CLOUDFLARE_TUNNEL_TOKEN` in `.env`, and in the Cloudflare dashboard point the tunnel's public hostname at `http://menu-frontend:80`. nginx sends HSTS unconditionally because TLS is terminated at Cloudflare.

### Installing on a phone

Open the site over HTTPS (for example through the tunnel) and add it to the home screen. On iOS, use **Share → Add to Home Screen**; on Android, use **Install app**. It then opens full-screen like a native app.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | Signs login tokens. At least 32 characters, not a placeholder |
| `BOOTSTRAP_TOKEN` | For first-run setup | — | Must be entered to create the first (admin) account. Setup is closed permanently once any account exists |
| `DATABASE_URL` | No | in-memory | SQLite file path. Compose sets `/data/menu.sqlite`. Without it, nothing is saved |
| `PORT` | No | `3001` | Backend listen port |
| `MENU_PORT` | No | `3010` | Host port for the web UI (Compose) |
| `DATA_PATH` | No | `./data` | Host directory for the database (Compose) |
| `APP_UID` / `APP_GID` | No | `1000` | User the backend container runs as (Compose) |
| `CLOUDFLARE_TUNNEL_TOKEN` | With `--profile tunnel` | — | Cloudflare Tunnel connector token |

## Development

Requires Bun 1.3+.

```bash
bun install

# Terminal 1 — API on :3001
JWT_SECRET=$(openssl rand -base64 48) BOOTSTRAP_TOKEN=dev DATABASE_URL=./dev.sqlite bun run dev:backend

# Terminal 2 — Vite on :5173, proxying /api to :3001
bun run dev:frontend
```

| Command | What it does |
|---------|--------------|
| `bun run test` | `bun test` for `@menu/shared` and the backend (tRPC procedures run in-process against in-memory SQLite) |
| `bun run typecheck` | `tsc --noEmit` in every workspace |
| `bun run build` | Production frontend build into `apps/frontend/dist` |

GitHub Actions (`.github/workflows/ci.yml`) runs the typecheck, the tests, the frontend build, and both Docker image builds on every pull request.

Schema changes go in two places that must stay in step: `apps/backend/src/db/schema.ts` (Drizzle types) and `apps/backend/src/db/migrate.ts` (the idempotent SQL that actually creates tables at boot).

## License

[GNU General Public License v3.0](LICENSE)
