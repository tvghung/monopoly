# Own the Block room registry (optional)

A Cloudflare Worker with two SQLite-backed Durable Objects that maps an Online room code (`OTB-XXXXXX`) to the host's current
public tunnel origin. It is **discovery only**: it never sees game state, players, chat, reconnect tokens or credentials of the
game. LAN play and Online play by invitation link work without it; it adds bare-code lookup across networks and a stable
`/join?room=CODE` page that survives a new tunnel hostname.

## API

| Route | Who | Result |
| --- | --- | --- |
| `GET /healthz` | anyone | `{ok:true}` |
| `GET /join[?room=CODE]` | anyone | static page: type a code, it is looked up here and the host's own invitation page opens |
| `GET /v1/rooms/:code` | anyone (CORS `*`) | `{roomCode, target:{kind:'socket-io-https', endpoint}, expiresAt}` or 404 |
| `POST /v1/rooms/:code/reserve` | host (new random Bearer owner token) | `{proof, expiresAt}` (180 s), 409 when the code is held |
| `POST /v1/rooms/:code/activate` | owner | verifies `<endpoint>/_otb/registry-proof` answers the reserved proof, then leases 90 s |
| `POST /v1/rooms/:code/renew` / `suspend`, `DELETE /v1/rooms/:code` | owner | keep alive (every 30 s), hide the endpoint during tunnel loss, revoke on quit |

Owner tokens are stored as SHA-256 only. Each client IP (hashed `CF-Connecting-IP`) gets 60 lookups and 12 writes per minute.
Only `https://<name>.trycloudflare.com` origins without port, path, query or credentials are accepted (the shipped
connectivity adapter); another adapter needs its origin rule here and in `packages/shared/src/endpointPolicy.ts`.

## Deploy (owner action — needs a Cloudflare account; the Workers Free plan supports SQLite Durable Objects)

```bash
npx wrangler login
npx wrangler deploy --config services/room-registry/wrangler.jsonc
```

Then give the builds the Worker URL (for example `https://own-the-block-room-registry.<account>.workers.dev`):

- for a local desktop run: environment variable `OWN_THE_BLOCK_REGISTRY_URL=<url>`;
- for packaged releases: the GitHub repository variable `OWN_THE_BLOCK_REGISTRY_URL`, which the desktop build writes into
  `resources/online-config.json` (HTTPS only; an empty value ships builds without bare-code lookup).

Free-plan limits (Cloudflare docs, checked 2026-10-09): 100,000 requests and 100,000 SQLite rows written per day; each hosted
room renews every 30 s, so roughly 30 rooms hosted all day fit the write budget. Over the limit, lookups fail until 00:00 UTC
and the host shows "share the link or QR" — links keep working.

## Test

```bash
node --test services/room-registry/src/index.test.mjs
```
