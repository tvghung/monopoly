# Shared architectural instructions

## Authority and identity

- The desktop host's server process is authoritative. Its `InMemoryPersistenceStore` is the production room/session/offer store. A process restart starts empty; no state is restored from disk, client storage, cloud state or another player.
- `PlayerId` is a stable UUID; `socket.id` is a connection identifier. Commands derive the actor from authenticated `socket.data.playerId`.
- The client keeps raw reconnect tokens scoped to the server authority and room code. The server keeps only SHA-256 hashes in RAM and never emits hashes, tokens, hidden deck order or private offer terms in public state.
- Newest authenticated connection wins. A stale disconnect cannot change the current player's presence. Disconnect is not leave; explicit leave revokes the session and removes the seat.

## Command contract

1. Parse the inbound payload with shared runtime schema.
2. Resolve the actor and room from authenticated socket state.
3. Serialize commands for a room, clone its snapshot and validate domain rules.
4. Commit room/session/offer changes atomically through the in-memory transaction queue and expected-version check. A failure discards the draft.
5. Only after commit, send typed ACK and public/private projections (exception: `resume session` ACKs before its presence
   broadcast, `apps/server/src/socket/session.ts`). `room:<roomId>` is public; `player:<playerId>` is private.

Absolute deadlines remain in the live room/offer state so a connected host can recover from client disconnects and delayed timers. Presence, socket mapping and timer handles are runtime only. Deadline recovery never crosses a host process restart.

## Hosting

- Electron owns the utility-process server and optional bundled Cloudflare Quick Tunnel. LAN hosting works without Cloudflare. The host renderer uses loopback; LAN browsers use an advertised private IPv4 URL; online browsers use the public HTTPS origin.
- Complete invitation URLs contain the endpoint and validated room code, so the optional registry is not needed to join by link. The host displays an online link only after the public route and room probe succeed.
- A helper crash is terminal for the match. Tunnel loss leaves the same live RAM match intact; a replacement tunnel hostname requires a replacement invitation link.
- The desktop shell retains `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a typed preload whitelist and the `app://` path guard.
- Electron main gives the Host renderer a process-scoped capability for its selected room code. The server checks it before any new-room pending admission; existing-room Guests bind to that room ID and cannot recreate it after deletion. Admission and HTTP limits are keyed by the TCP peer (`apps/server/src/socket/clientIdentity.ts`); `CF-Connecting-IP` is read only from the loopback peer of an Online Host (`OTB_ONLINE_ROOM_CODE`, set by the bundled tunnel connector), never `X-Forwarded-For` or `True-Client-IP`. Per-connection and process-wide counters (`apps/server/src/socket/admissionLimiter.ts`) bound the limiter state.

See [Persistence](./Persistence/README.md), [API hosting](./Api/http-runtime.instruction.md), [architecture decisions](./ARCHITECTURE_DECISIONS.md) and [test evidence](./testcase/README.md).

## Terminology

- **Committed**: applied to the in-RAM room aggregate by the room command executor; only then ACKed and broadcast.
- **Reconnect / resume**: a client returning to the same living host process with its reconnect token.
- **Host process exit** (close, crash, restart): every room, session, offer and deadline is lost; nothing is restored.
- **In-process server restart** (some tests): a new server object reusing the same in-memory store; it is not a host process restart.
- **RELEASED / CURRENT DEVELOPMENT**: see the [Documentation Hub](../README.md#lifecycle-and-scope-labels). Existing GameCore, UI and shared-contract rules continue to apply unless they specifically describe the retired durable database or cross-restart recovery.
