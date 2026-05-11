# Flashcards sync service

A small Node service that lets the flashcards web app sync its FSRS state,
collections, and review history across devices. It is fully optional — the
web app still works in pure-localStorage mode if no sync service is
configured.

- **Stack:** Node 22 / Hono / Postgres / kysely / zod / vitest
- **Image:** `ghcr.io/gjcourt/flashcards-sync`
- **Source:** `server/` in `gjcourt/flashcards`

## Quickstart

```bash
cd server
npm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/flashcards npm run dev
```

The service listens on `:8080` by default. `GET /healthz` should return `ok`.

Migrations run at startup; bring an empty Postgres database and the service
will create the schema on first boot.

## Build & test

```bash
npm run build       # tsc -> dist/
npm test            # vitest, in-memory via pg-mem
npm run lint
npm run format:check
```

## Environment variables

| Var              | Default       | Notes                            |
| ---------------- | ------------- | -------------------------------- |
| `DATABASE_URL`   | (required)    | Postgres connection string       |
| `AUTH_MODE`      | `single-user` | `single-user` or `jwt`           |
| `SINGLE_USER_ID` | `local`       | Used in single-user mode         |
| `PORT`           | `8080`        |                                  |
| `LOG_LEVEL`      | `info`        | `debug`, `info`, `warn`, `error` |
| `NODE_ENV`       | `development` | `production` in container        |

## Auth modes

### `single-user` (default)

Every request is mapped to `SINGLE_USER_ID`. Use this for a single-tenant
deployment behind a trusted gateway (Cloudflare Access, Tailscale, etc.).

### `jwt`

The service reads the `CF-Access-Jwt-Assertion` header and uses the `email`
claim as the user id.

> **Security TODO:** This first cut does **NOT** verify the JWT signature.
> It assumes Cloudflare Access (or an equivalent verifying gateway) is
> upstream and has already validated the token before forwarding the
> request. **If you expose this service without a verifying gateway in
> front, you MUST add signature verification** — see
> [`src/auth.ts`](./src/auth.ts) for the exact location.

## API

### `GET /healthz`

Returns `200 ok` when the DB is reachable. `500 db unreachable` otherwise.

### `POST /api/sync`

#### Request

```json
{
  "since": 0,
  "mutations": {
    "cardStates": [
      { "id": "fin-card-1", "fsrs": { "stability": 1.4, "last_review": "2026-05-09T12:00:00Z" } }
    ],
    "collections": [
      {
        "id": "col-systems",
        "name": "System design",
        "deckIds": ["sd-caching", "sd-queues"],
        "createdAt": 1746796800000,
        "updatedAt": 1746796800000,
        "deletedAt": null
      }
    ],
    "reviews": [{ "cardId": "fin-card-1", "ratedAt": 1746796800000, "rating": 3 }]
  }
}
```

- `since` (epoch millis): the `now` returned by the previous successful sync,
  or `0` for a full bootstrap.
- `mutations.*` are all optional and default to `[]`.

#### Response

```json
{
  "now": 1746796800123,
  "cardStates": [
    {
      "id": "fin-card-1",
      "fsrs": { "stability": 1.4, "last_review": "2026-05-09T12:00:00Z" },
      "updatedAt": 1746796800123
    }
  ],
  "collections": [
    {
      "id": "col-systems",
      "name": "System design",
      "deckIds": ["sd-caching"],
      "createdAt": 1,
      "updatedAt": 1746796800123,
      "deletedAt": null
    }
  ],
  "reviews": [{ "cardId": "fin-card-1", "ratedAt": 1746796800000, "rating": 3 }]
}
```

The client should persist `response.now` and pass it as the next request's
`since`. Rows freshly written by THIS request are included in the bootstrap
case (`since=0`); on subsequent syncs (`since=<previous now>`) the response
window excludes them.

#### Errors

| Status | Body                                                               |
| ------ | ------------------------------------------------------------------ |
| 400    | `{ "error": "invalid json" }`                                      |
| 400    | `{ "error": "invalid request", "details": [...] }`                 |
| 401    | `{ "error": "missing CF-Access-Jwt-Assertion header" }` (jwt mode) |
| 500    | `{ "error": "internal error" }`                                    |

## Conflict resolution

- **Card states:** last-write-wins on `fsrs.last_review` (ISO 8601 per
  `ts-fsrs`). If one side is null, the non-null side wins. If both are
  null, the existing row is kept (server is conservative on new-state
  writes).
- **Collections:** last-write-wins on `mutation.updatedAt`. Soft-deleted
  via `deletedAt`. Tombstones are returned to other devices so they can
  remove the local copy.
- **Reviews:** append-only, idempotent on
  `(user_id, card_id, rated_at)` via `ON CONFLICT DO NOTHING`.

## Schema

See [`migrations/0001_init.sql`](./migrations/0001_init.sql). Three tables:

- `card_states (user_id, card_id, fsrs jsonb, updated_at)`
- `collections (user_id, collection_id, data jsonb, updated_at, deleted_at)`
- `reviews (user_id, card_id, rated_at, rating)`

Migrations are applied at startup and tracked in `schema_migrations`.
Applying twice is a no-op.

## Deployment notes (running it elsewhere)

1. Bring a Postgres instance and create an empty database. The service
   bootstraps its own schema on first boot.
2. Set `DATABASE_URL` and either `SINGLE_USER_ID` (for single-tenant) or
   `AUTH_MODE=jwt` (behind a verifying JWT gateway).
3. Front it with a TLS-terminating gateway (Cloudflare Access, Caddy,
   Tailscale serve, an Envoy gateway, etc.). The service itself listens
   on plain HTTP `:8080`.
4. Add a liveness probe against `GET /healthz`.
5. If you scale beyond one replica, you must front it with a sticky-free
   load balancer — there is no in-process state.

## Image tags

The image is built and pushed on every merge to `main`. Tags:

- `latest`
- `YYYY-MM-DD` (e.g. `2026-05-09`)
- `YYYY-MM-DD-<short-sha>` (e.g. `2026-05-09-abc1234`)

Pin to the date or date+sha tag for production.
