# Socket và state contracts

## Code nguồn

- `packages/shared/src/types.ts`
- `packages/shared/src/events.ts`
- `packages/shared/src/socketSchemas.ts`
- `packages/shared/src/index.ts`

## Identity/lifecycle types

- Opaque aliases: `PlayerId`, `RoomId`, `RoomCode`, `SessionId`, `OfferId`,
  `AuctionId`.
- `RoomStatus`: `LOBBY | IN_PROGRESS | FINISHED`.
- `RoomRole`: `PLAYER | SPECTATOR`.
- Session and membership statuses explicitly model pending/active/revoked/expired
  and active/finished/left state.
- `SOCKET_PROTOCOL_VERSION` gates coordinated same-origin client/server deployment.

Stable ID is public identity, not a credential. Raw reconnect token is private bearer
material and never part of public DTO or SocketData.

## Public room/game state

`PublicRoomState` contains:

- protocol version and monotonic room `version`.
- internal room ID/code/status/host.
- `minPlayers=2`, `maxPlayers=7`.
- roster metadata: stable ID, name/color/join order/membership/ready and runtime
  connected projection.
- `GameState` keyed/referenced by stable IDs.

`Winner` carries stable player ID. `Auction` carries `auctionId` and ISO `endsAt`;
optional compatibility `timer` is derived by the public projector and is not durable.
`TurnRecovery` carries turn number, player ID and ISO deadline. `PersistedGameState`
omits client-only `loaded`.

## Session and admission DTO

- `join room({name, roomCode})` returns either pending player admission with raw
  token/expiry or an explicit spectator admission.
- `resume session({token})` activates/reclaims an existing Player and returns stable
  ID, public room and pending private offers.
- `set ready({ready})` and `leave room()` mutate lobby/lifecycle state.
- `session replaced` tells the superseded connection to stop reconnecting.

Invalid token is never silently converted to spectator/new player.

## Trading DTO

- Listing/make-offer requests contain only tile and positive integer price no greater
  than `2_147_483_647`.
- Accept/decline contains only `{offerId}`.
- `PrivateOffer` is authoritative: stable buyer/owner, tile/price, status,
  `createdAt`, `expiresAt`, `resolvedAt`.
- Multiple offers on the same tile are distinguishable by offer ID.

## Event contract

Every state-changing client event ends in `AckCallback<T>`. Success contains protocol
version and optional committed revision/data. Failure contains stable code/message
and `retryable`.

Server events:

- `update(PublicRoomState)`.
- `offer on prop`, `offer accepted`, `offer declined`, `offer expired`,
  `offer cancelled`.
- `session replaced`.

There is no `new player`, dummy start/buy payload or client-supplied actor field.

## SocketData

Runtime-only fields are internal room/player ID, role, session ID, connection
generation and optional `pendingAdmission` per-socket join lock. That boolean is
neither credential nor durable domain state. Raw token is forbidden; `socket.id`
remains transport identity only.

## Runtime schemas

Zod validates every event's first business argument:

- trimmed 1–20 character names and normalized room codes.
- base64url-like reconnect tokens.
- UUID stable IDs/offer actions.
- integer tile `0..39` and positive integer money up to `2_147_483_647`.
- bounded nonblank chat.
- strict objects reject unknown fields.
- exact argument shape requires one ACK callback; no-payload commands reject dummy
  payloads.

After schema parse, handler must still authorize actor/role/room/domain state.

## Public/private/persistence boundaries

- Public projector whitelists room/game fields and derives connected presence.
- Offer/session state is delivered privately, not nested into `update`.
- Persistent game snapshot excludes transport/presence/credentials/timer handles.
- Client discards stale revision; server broadcasts only after durable commit.

## Tests

- Contract/typecheck for event names, payloads and ACKs.
- Runtime schema cases for malformed UUID/tile/money/chat/unknown keys.
- Public serialization test proving no token/hash/session/private-offer leak.
- Socket integration for private targeting and actor spoof rejection.
