# flashcards — spaced-repetition flashcards app (FSRS)

## Overview

A React + Vite spaced-repetition flashcards web app (using `ts-fsrs`), served
as static assets from nginx in the homelab and reachable behind Cloudflare
Access. The image bakes both a multi-deck build at `/` and a NATO-locked
single-deck build at `/nato/`. A separate **sync service** (`server/`, Hono +
Postgres via kysely) provides optional cross-device sync.

## Layout

- `src/` — React SPA (Vite).
- `server/` — sync service (`@flashcards/sync`, Hono + Postgres), own
  `package.json`/lockfile.
- `public/`, `index.html` — static entry.
- `Dockerfile` — SPA image (nginx). `Dockerfile.sync` — sync-service image.
- `nginx.conf` — runtime web server config.
- `.github/workflows/` — `ci.yml` (build/test/lint/format), `image.yml`,
  `image-sync.yml`.

## Develop

Node per `.nvmrc` (>= 22 for the sync service). Install with `npm ci`.

SPA (repo root):

- `npm run dev` — Vite dev server. `npm run preview` — preview a build.
- `npm run build` — `tsc -b && vite build`. Locked variant:
  `VITE_LOCKED_DECK=nato BASE_PATH=/nato/ npm run build`.
- `npm test` — Vitest. `npm run lint` — ESLint.
  `npm run format:check` / `npm run format` — Prettier.

Sync service (`server/`, run `npm ci` there):

- `npm run dev` / `npm start` — run the service.
- `npm run build` — `tsc`. `npm test` — Vitest. `npm run lint` — ESLint.

CI (`.github/workflows/ci.yml`) runs build (incl. the locked variant), test,
lint, and format:check for both the SPA and the sync service on every pull
request.

## Container image & deploy

Two images are built and pushed on push to `main` (and `workflow_dispatch`):

- `image.yml` → `ghcr.io/gjcourt/flashcards` (SPA / nginx).
- `image-sync.yml` → `ghcr.io/gjcourt/flashcards-sync` (from `Dockerfile.sync`).

Both publish tags `YYYY-MM-DD`, `YYYY-MM-DD-<sha7>` (immutable pin tag), and
`latest`. Homelab deploy manifests and pins live in the `homelab` repo under
`apps/base/flashcards/` and `apps/base/flashcards-sync/` (plus
`apps/{production,staging}/...`). Roll forward by bumping the pinned tag there.

## Conventions

- All changes go through a branch and pull request; never commit directly to
  `main`, and never merge with admin/bypass.
- Keep `image.yml` and `image-sync.yml` tag schemes in sync.
