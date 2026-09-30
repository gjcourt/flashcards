<!-- readme-type: service -->

# Flashcards

Local-first spaced-repetition flashcards scheduled with FSRS, with optional cross-device sync

Plain flashcard apps either show every card equally often or leave scheduling to the
user, so you waste time on cards you already know and under-review the ones you're
about to forget. Flashcards schedules each card with FSRS-4.5, tracking difficulty and
stability so review timing adapts per card. It ships four bundled decks (financial
terminology, NATO phonetic alphabet, system-design latency numbers, tech acronyms) and
lets you combine any of them into custom collections. The app runs entirely in the
browser against `localStorage`; an optional sync service carries progress across
devices.

**Status:** deployed on the homelab at flashcards.burntbytes.com since 2026-05; last
change 2026-08-11.

## Quick start

Needs: Node 22 (see `.nvmrc`).

```bash
git clone https://github.com/gjcourt/flashcards && cd flashcards
npm install
npm run dev
```

Then open http://localhost:5173.

## Usage

Review a deck from the home page, or jump straight to a route:

| Path               | What                                                          |
| ------------------ | ------------------------------------------------------------- |
| `/`                | Home — deck and collection tiles with due-count badges        |
| `/decks/:id`       | Single-deck review session                                    |
| `/decks/:id/cards` | Read-only browse of every card in a deck                      |
| `/collections/:id` | Review a saved collection (merged due queue across its decks) |
| `/all`             | Pseudo-collection: review across every bundled deck           |
| `/manage`          | Create/delete collections; reset all FSRS progress            |

During a review, `Space` flips the card and `1`–`4` rate it **Again** / **Hard** /
**Good** / **Easy**.

Add a deck by dropping a JSON file under `public/decks/` and listing it in the
manifest (`src/decks/load.ts` validates `id`/`term`/`definition`/`category` as
required and `example` as optional):

```json
{
  "id": "your-deck-id",
  "name": "Display Name",
  "description": "One-line description.",
  "path": "decks/your-deck-id.json"
}
```

Run the optional sync service locally to exercise cross-device sync end to end
(`vite.config.ts` proxies `/api/*` to it):

```bash
cd server
npm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/flashcards npm run dev
```

## Configuration

| Variable           | Default                 | Meaning                                                                                               |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `VITE_LOCKED_DECK` | (unset)                 | Build-time: lock the SPA to one deck id (e.g. `nato`); `/manage`, `/collections/*`, `/all` become 404 |
| `BASE_PATH`        | `/`                     | Build-time: Vite base path for the locked build (e.g. `/nato/`)                                       |
| `SYNC_DEV_TARGET`  | `http://localhost:8080` | Dev-only: where `vite.config.ts` proxies `/api/*`                                                     |

The sync service's own variables (`DATABASE_URL`, `AUTH_MODE`, `CF_ACCESS_*`, ...) are
documented in [server/README.md](server/README.md).

## How it works

The scheduler is [FSRS-4.5](https://github.com/open-spaced-repetition/ts-fsrs): each
card carries a difficulty and stability, and every rating (**Again** / **Hard** /
**Good** / **Easy**) recomputes them and the next due date so recall probability is
≈0.9 when the card is next shown. Card state, collections, and review history hydrate
synchronously from `localStorage` at boot — there's no async window where a fresh
rating can be clobbered — and the optional sync service (`server/`, Hono + Postgres)
overlays cross-device state on top via last-write-wins merges. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the component diagram, request/data flows, and
design decisions.

## Development

```bash
npm ci
npm run build          # tsc -b && vite build
npm test                # vitest run
npm run lint             # eslint .
npm run format:check     # prettier --check .
```

CI also builds the locked variant to catch `BASE_PATH`/`VITE_LOCKED_DECK` wiring
problems before merge:

```bash
BASE_PATH=/nato/ VITE_LOCKED_DECK=nato npm run build
```

The sync service has its own checks, run from `server/`:

```bash
cd server
npm ci
npm run build
npm test
npm run lint
npm run format:check
```

Conventions for contributors and agents: [AGENTS.md](AGENTS.md).

## Deployment

Runs on the homelab behind Cloudflare Access: the SPA at
[flashcards.burntbytes.com](https://flashcards.burntbytes.com/) (and the NATO-locked
build at `/nato/`), with the sync service handling `/api/*`. CI publishes
`ghcr.io/gjcourt/flashcards` and `ghcr.io/gjcourt/flashcards-sync` on every push to
`main`; manifests live in [gjcourt/homelab](https://github.com/gjcourt/homelab) under
`apps/{base,production,staging}/flashcards{,-sync}/` — see the
[flashcards runbook](https://github.com/gjcourt/homelab/blob/master/docs/operations/apps/flashcards.md)
and the
[flashcards-sync runbook](https://github.com/gjcourt/homelab/blob/master/docs/operations/apps/flashcards-sync.md).

## License

No licence file yet.
