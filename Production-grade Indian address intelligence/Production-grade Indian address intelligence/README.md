# MDDS Address Platform (Village API)

Production-grade Indian address intelligence: a nationwide village/sub-district/district/state
hierarchy served through a rate-limited public API, with a B2B client portal, an admin console,
and analytics. Data is sourced from the Census 2011 Rural Directory (all-state Excel masters).

**Monorepo (npm workspaces)**

| Workspace    | Stack                                                                          | Port               |
| ------------ | ------------------------------------------------------------------------------ | ------------------ |
| `@mdds/api`  | Express 5 + TypeScript, Prisma/PostgreSQL, Zod, JWT, Upstash Redis, Helmet      | 3000               |
| `@mdds/web`  | React 19 + Vite 7, Tailwind CSS 4, React Router 7, TanStack Query, Zustand, Recharts | 5173 (dev)         |

## Features

- **Public data API** — search, typeahead autocomplete, and full hierarchy traversal
  (state → district → sub-district → village) with Redis response caching.
- **API key auth** — `X-API-Key` on every `/v1` request, plus `X-API-Key` + `X-API-Secret`
  verification for mutating calls; secrets are bcrypt-hashed, keys can be rotated.
- **Plans & rate limiting** — per-plan daily quota and per-key burst limit (per minute),
  enforced via Redis counters (Postgres fallback when Redis is unset), with
  `X-RateLimit-*` headers on every response.
- **Usage alerting & auto-suspend** — alerts at 80% / 95% / 100% of the daily limit,
  optional webhook email delivery, and an auto-suspend sweep.
- **Admin console** — user approval/plan management, temporary daily-limit overrides,
  state-level data access grants, API key management, per-user notes, request logs
  (masked IPs), and an operations dashboard (SLA, p95/p99, error rate, capacity, heatmap).
- **B2B client portal** — self-service API keys, usage charts, alerts, and account limits.
- **Every request is logged** — endpoint, method, status, response time, API key, user.

### Plans

| Plan      | Price       | Daily requests | Burst/min | Typical keys |
| --------- | ----------- | -------------- | --------- | ------------ |
| Free      | $0          | 5,000          | 100       | 5            |
| Premium   | $49/mo      | 50,000         | 500       | 25           |
| Pro       | $199/mo     | 300,000        | 2,000     | 100          |
| Unlimited | $499/mo     | 1,000,000      | 5,000     | unlimited    |

Admins can set per-user overrides (`dailyLimitOverride` / `limitOverrideExpiresAt`) that win
over the plan default.

## Project structure

```
apps/
  api/
    src/index.ts          # Express app: middleware, auth, all routes (API + admin + portal)
    src/redis.ts          # Upstash Redis client + cache helpers (optional)
    prisma/schema.prisma  # Data model (hierarchy, users, keys, logs, alerts, notes)
    prisma/migrations/    # Baseline migration (migration-managed schema)
    prisma/seed.ts        # Demo admin, sample villages, example API key
    prisma/import-india.ts# Bulk import of the all-India Excel dataset
    prisma/all-india-villages-master-list-excel/dataset/  # Census 2011 Rural Directory (.xls)
    scripts/db-verify.mjs # Post-migration validation queries (used by CI)
  web/
    src/App.tsx           # Routes: login, overview, admin, portal, docs, demo, pricing
    src/pages/            # Overview, AdminPanel, UserDetail, B2BPortal, ApiDocs, Demo, Pricing
delta-import.mjs          # Standalone delta re-import (skips already-imported state files)
.github/workflows/        # preview / staging / production deploy workflows
vercel.json               # Single-domain routing: SPA + /api, /v1, /auth → serverless API
```

## Run

1. `npm install`
2. `copy .env.example .env` (macOS/Linux: `cp .env.example .env`)
3. Set `DATABASE_URL` (and `SHADOW_DATABASE_URL` — a direct, unpooled connection — for `migrate dev`)
4. `npm run db:generate`
5. `npm run db:migrate`
6. `npm run db:seed`
7. Optional: `npm run db:import` to bulk-import the full India villages dataset
8. `npm run dev` → API on `http://localhost:3000`, web on `http://localhost:5173`

The database is migration-managed (see "Database Migration Strategy"). The initial state is
captured in `apps/api/prisma/migrations/`, so a fresh environment only needs `npm run db:deploy`
to apply all migrations.

`npm run db:seed` prints the admin credentials (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) and a ready-to-use
demo API key pair (`ak_…` / `as_…`).

### Environment variables

| Variable                | Where   | Purpose                                             |
| ----------------------- | ------- | --------------------------------------------------- |
| `PORT`                  | API     | API port (default 3000)                             |
| `DATABASE_URL`          | API     | Postgres connection (Neon in cloud)                 |
| `SHADOW_DATABASE_URL`   | API     | Direct connection for `prisma migrate dev`          |
| `JWT_SECRET`            | API     | Signs admin/portal bearer tokens                    |
| `APP_ORIGIN` / `CORS_ORIGINS` | API | Allowed browser origins                             |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | API | Seed admin account                              |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | API | Rate limits + caching (optional; Postgres fallback) |
| `EMAIL_WEBHOOK_URL`     | API     | Usage-alert emails (`{to, subject, text}` POST)     |
| `AUTO_SUSPEND_PCT`      | API     | Auto-suspend threshold (default 100)                |
| `VITE_API_URL` / `VITE_API_KEY` | Web | Backend origin and default key for the demo/docs UI |

## Scripts

| Script            | Purpose                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `npm run dev`     | Run API (port 3000) + Web (Vite, port 5173) with watch                 |
| `npm run build`   | Build both workspaces (`tsc` for API, `tsc && vite build` for web)     |
| `npm run db:generate` | Regenerate the Prisma Client                                       |
| `npm run db:migrate`  | Create & apply a migration in dev (`prisma migrate dev`)           |
| `npm run db:deploy`   | Apply pending migrations to a deployment DB (`migrate deploy`)     |
| `npm run db:status`   | Show migration status                                             |
| `npm run db:resolve`  | Mark a migration applied/rolled-back manually                    |
| `npm run db:seed`     | Seed demo accounts, states, and village data                     |
| `npm run db:import`   | Bulk-import the full India villages dataset from Excel            |

## API

Base URLs: `http://localhost:3000` locally, `https://api.villageapi.com` in production
(`/api/...` is also accepted and rewritten to the same routes).

**Auth**

- `POST /auth/login` — `{email, password}` → `{token, user}` (JWT, 24h)
- `POST /auth/register` — business email only (free providers rejected); accounts start as
  `PENDING_APPROVAL` and must be activated by an admin

**Public data (`X-API-Key` required)**

| Endpoint | Description |
| -------- | ----------- |
| `GET /v1/health` | Liveness + DB/Redis status (no auth) |
| `GET /v1/search?q=&state=&district=&subDistrict=&limit=` | Village search (limit 1–100, default 25) |
| `GET /v1/autocomplete?q=&hierarchyLevel=village\|subDistrict\|district\|state` | Typeahead |
| `GET /v1/states` | All states |
| `GET /v1/states/:id/districts` | Districts in a state |
| `GET /v1/districts/:id/subdistricts` | Sub-districts in a district |
| `GET /v1/subdistricts/:id/villages?page=&limit=` | Villages (default 500, max 10000) |

**Portal (JWT `Authorization: Bearer`)** — `/portal/api-keys` (list/create/delete/rotate),
`/portal/usage` (limits, 30-day volume, alerts).

**Admin (JWT, role `ADMIN`)** — `/admin/dashboard`, `/admin/users` (list/detail/update/delete),
`/admin/users/:id/{api-keys,notes,state-access,grant-all-states,limit-override}`,
`/admin/api-keys`, `/admin/api-logs`, `/admin/villages`, `/admin/alerts`.

**Response envelope**

```json
// success
{ "success": true, "count": 1, "data": { },
  "meta": { "requestId": "…", "responseTime": 12,
            "rateLimit": { "remaining": 4999, "limit": 5000, "reset": "…" } } }
// error
{ "success": false, "error": { "code": "RATE_LIMITED", "message": "…" },
  "meta": { "requestId": "…", "responseTime": 3 } }
```

`X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers accompany responses.
The interactive reference lives at `/docs` in the web app.

### Web app routes

| Route      | Access       | Purpose                                  |
| ---------- | ------------ | ---------------------------------------- |
| `/login`   | public       | Email/password sign-in                   |
| `/`        | any signed-in| Overview dashboard                       |
| `/admin/*` | ADMIN        | Users, logs, alerts, villages, dashboard |
| `/users/:id` | ADMIN      | Per-user detail (keys, usage, notes)     |
| `/portal/*`| signed-in    | B2B portal (keys, usage)                 |
| `/docs`    | public*      | API documentation                        |
| `/demo`    | public*      | Interactive demo client                  |
| `/pricing` | public*      | Plans & pricing                          |

\* Public when logged out; also reachable inside the app shell when signed in.

## Data import

- `npm run db:import` reads every `*.xls` / `*.ods` under
  `apps/api/prisma/all-india-villages-master-list-excel/dataset/` and upserts
  Country → State → District → SubDistrict → Village (Census 2011 codes).
- `node delta-import.mjs` is a faster re-run that skips state files already present in the DB
  (useful after a partial import). It is not wired into the workspace scripts.

## Deployment Environments (spec 12.2)

| Environment | URL                     | Purpose      | Auto-deploy                              |
| ----------- | ----------------------- | ------------ | ---------------------------------------- |
| Preview     | `{pr-number}.vercel.app` | Code review   | On PR creation (`.github/workflows/preview.yml`) |
| Staging     | `staging.villageapi.com` | QA testing    | On merge to `develop` (`.github/workflows/staging.yml`) |
| Production  | `api.villageapi.com`     | Live traffic  | On merge to `main` (`.github/workflows/production.yml`) |

- Git flow: feature branches → PR (preview) → merge to `develop` (staging) → release to `main` (production).
- `vercel.json` at the repo root builds both workspaces and routes the SPA plus the `/api`, `/v1`,
  and `/auth` endpoints to the API serverless function on a **single domain**.
- The Vercel serverless bundle includes the generated Prisma client and `schema.prisma` only —
  seed data and import scripts are excluded (`functions.includeFiles`).

### Required CI secrets

| Secret                     | Used by                          | Description                                   |
| -------------------------- | -------------------------------- | --------------------------------------------- |
| `VERCEL_TOKEN`             | all workflows                    | Vercel access token                           |
| `VERCEL_ORG_ID`            | all workflows                    | Vercel team/org id                            |
| `VERCEL_PROJECT_ID`        | preview + production             | Vercel project id (production)                |
| `VERCEL_STAGING_PROJECT_ID`| staging                          | Vercel project id (staging)                   |
| `STAGING_DATABASE_URL`     | staging                          | Staging Postgres (Neon) connection            |
| `PROD_DATABASE_URL`        | production                       | Production Postgres (Neon) connection         |
| `STAGING_VITE_API_URL` / `PROD_VITE_API_URL` | staging / production | Public origin used at build time   |

Per-environment project settings on Vercel also need `DATABASE_URL`, `JWT_SECRET`,
`APP_ORIGIN`, `CORS_ORIGINS` (and `ADMIN_EMAIL`/`ADMIN_PASSWORD` for the seed admin) matching
their environment, plus `EMAIL_WEBHOOK_URL`/`AUTO_SUSPEND_PCT` if alerting is configured.

## Database Migration Strategy (spec 12.3)

**Process**

1. **Create the migration file**
   `npm run db:migrate` (i.e. `prisma migrate dev --name <description>`) in `apps/api`.
   Review the generated SQL in `apps/api/prisma/migrations/`.
2. **Test on the staging database** — merged code pushes to `develop`, and
   `.github/workflows/staging.yml` runs `prisma migrate deploy` on `STAGING_DATABASE_URL`,
   then `node apps/api/scripts/db-verify.mjs` (validation queries).
3. **Run on production during a maintenance window** — `.github/workflows/production.yml`
   runs `prisma migrate status`, `prisma migrate deploy` on `PROD_DATABASE_URL`, then the
   same verification queries, before the release goes live.
4. **Verify data integrity** — `apps/api/scripts/db-verify.mjs` checks core table row counts,
   readable migration history, and that no migration is left in a pending state.
5. **Rollback plan** — documented below and re-checked in the PR that changes the schema.

**Safety**

- **Migrations are reversible** — each migration acts on one feature; destructive changes are
  split into a separate, reversible migration (e.g. rename = add column → backfill → switch →
  drop old). The rollback SQL (the `down` for that migration) is described in the PR body.
- **Backups before production migrations** — Neon provides automatic point-in-time recovery
  (continuous backups). Before a production maintenance window, additionally snapshot with
  `pg_dump "$PROD_DATABASE_URL" > backup_$(date +%F).sql`, or restore to a Neon branch for an
  isolated rehearsal.
- **Transactional** — Prisma runs each migration inside a transaction (all-or-nothing), so a
  failure leaves the schema unchanged (`_prisma_migrations` records unfinished migrations).
- **Failing fast** — if `migrate deploy` fails on production, the workflow stops *before* the
  Vercel release, so the old code keeps serving while the DB is unchanged.

**Rollback plan**

1. **Code first**: hotfix the old version back through `develop` → `main`; because DB migrations
   are forward-compatible with the previous code (additive), the app can run immediately.
2. **Data migration rollback**: if the applied migration cannot safely stay, run its documented
   `down` SQL in a transaction, then mark it `prisma migrate resolve --rolled-back <migration>`.
3. **Full DB restore**: as a last resort, restore the pre-window backup (Neon PITR or the
   `pg_dump` snapshot) — all-or-nothing per migration guarantees a consistent restore point.

**Local dev**

- `prisma migrate dev` needs a shadow database. On Neon (or any provider whose pooled URL cannot
  create databases) set `SHADOW_DATABASE_URL` to a *direct* (non-pooled) connection string.
- Never point `migrate dev` or `db push` at staging/production — use `npm run db:deploy`.
