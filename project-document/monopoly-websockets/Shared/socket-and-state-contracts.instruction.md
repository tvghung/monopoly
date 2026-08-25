# Socket, Standard Mode state và transfer contracts

## Code nguồn

- `packages/shared/src/types.ts`
- `packages/shared/src/events.ts`
- `packages/shared/src/socketSchemas.ts`
- `packages/shared/src/index.ts`

## Identity/protocol

- Stable aliases: `PlayerId`, `RoomId`, `SessionId`, `OfferId`, `GameCardId` và
  operation IDs cần cho durable continuation.
- `RoomStatus`: `LOBBY | IN_PROGRESS | FINISHED`; `RoomRole`:
  `PLAYER | SPECTATOR`.
- `SOCKET_PROTOCOL_VERSION = 8`; older clients nhận `UPGRADE_REQUIRED`, không chạy legacy
  state/payload.
- `CharacterId` và `PlayerColorId` là stable shared appearance IDs. `set appearance`
  nhận strict character-only, color-only hoặc combined payload; empty/unknown keys
  bị từ chối.
- Stable public ID không phải credential. Raw reconnect token không thuộc
  `PublicRoomState`, `GameState`, `SocketData`, log hoặc snapshot.

## Standard Mode aggregate

Public/persisted types dùng stable IDs và phân biệt hidden state:

- Turn không còn `doublesStreak`/extra-roll. `TurnInfo` biểu diễn purchase hoặc
  same-landing development wait bằng operation ID và `PendingTurnContinuation`.
- `PendingTurnContinuation.resume.kind` chỉ còn các hướng tiếp tục cần cho card,
  jail và payment recovery; không có auction continuation.
- Payment: `PaymentQueue` giữ `orderedClaims: DebtClaim[]`, `activeClaimIndex`,
  `continuation` và `actionDeadlineAt`. Mỗi claim bắt buộc có `debtorPlayerId`,
  `creditor: 'PLAYER' | 'BANK'`, optional `creditorPlayerId`, `amount`,
  `remainingAmount`, `source`; `claimId` và optional `status` là metadata
  idempotency/recovery.
- Payment shortfall giữ `orderedClaims`, `activeClaimIndex`, absolute deadline và
  deterministic forced-sale proposal (tối đa một proposal trong snapshot).
- Cards: private persisted `GamePrivateState.decks.chance.drawPile` và
  `.chest.drawPile`; Player giữ `heldJailFreeCardIds`. Public projection chỉ lộ
  counts cần cho UI, không lộ holder IDs/order/card kế tiếp. `PendingCardInteraction`
  is durable and operation-scoped with `AWAITING_DRAW`/`REVEALED`, optional
  `revealedCardId`, continuation and deadline; `draw card` and `dismiss card` are
  authoritative commit/ACK commands.
- `BoardState.gameplayEvents` is a bounded public semantic stream for
  `MONEY_TRANSFER`, `PROPERTY_TRANSFER`, `PASS_GO`, `SENT_TO_JAIL`,
  `JAIL_ROLL_FAILED` and `JAIL_RELEASED`. `GamePrivateState` additionally stores
  per-player private gameplay lanes and `completedCardOperations`.
- `BoardState.activityFeed` is a separate bounded public typed tail for the
  existing Log surface. Server producers append join/chat/dice/property/money/
  development/card/jail/bankruptcy/start/finish facts with monotonic sequence and
  UUID identity; clients never infer categories from legacy HTML logs.
- Jail wait progress (`jailOpponentRoundsElapsed`) là state authoritative, được giữ
  nguyên qua payment/restart; không có third-failed-roll hoặc stored-dice state.

`PersistedGameState`/room snapshot V8 chứa durable fields trên và bỏ `loaded`, presence,
credential, socket ID, countdown tick/timer handle. `BoardState.gameStartedAt?: string | null`
là ISO timestamp authoritative được set tại transition `LOBBY -> IN_PROGRESS`; `freshState()`
dùng `null`, schema chấp nhận missing/null để hydrate snapshot cũ, và public projection
giữ giá trị này cho compatibility/public state. Board client hiện không render center timer
và không cần đưa timestamp vào scene render model. Client không tự khởi tạo timestamp từ
mount/reconnect.

`BoardState.rollSequence` là public durable non-negative safe integer. Fresh state
starts at `0`; historical V5 → V6 migration 007 also starts at `0` without
reconstructing historical rolls. Current V7 → V8 migration 009 initializes an empty
activity baseline without reconstructing history. The server increments it once after accepted dice generation
inside the gameplay transaction, including jail attempts but excluding
starting-player tie-breaks, rejected commands, and rolled-back transactions.

## Transfer/trading

`PropertyTransferPolicy` là:

```text
VOLUNTARY
RETURN_TO_BANK
BANK_PURCHASE
FORCED_SALE
```

`TradeBundle` có hai side `offered` và `requested`; mỗi side biểu diễn money,
property IDs và jail-free `GameCardId`s. Không có Nhà/Khách Sạn trực tiếp trong bundle.
Runtime schema yêu cầu:

- amount là integer không âm trong bundle; offer tổng thể phải trao ít nhất một
  asset và không cho cùng asset xuất hiện hai phía.
- tile `0..39`, unique card/property IDs và bounded money.
- buyer/owner/actor không được lấy từ client payload; server derive từ authenticated
  session và authoritative ownership.

Private offer vẫn có stable `offerId`, participants, status và absolute expiry;
persisted row chứa complete canonical terms để accept/restart không phụ thuộc client
hay board label hiện tại.

## Events/ACK

- Mọi state-changing inbound kết thúc bằng typed `AckCallback<T>`; success chỉ sau
  commit và có protocol/revision, failure có stable code/message/retryable.
- Turn/buy/jail/property/payment/trade command actor lấy từ
  `socket.data.playerId`.
- Buy/development/forced-sale payloads chỉ mang operation/claim/proposal IDs; tile,
  owner, seller, buyer and price đều được derive từ snapshot.
- Public `update(PublicRoomState)` tách khỏi private offer/session delivery.
- `play again` is a no-payload, host-only command accepted only in `FINISHED`; it
  resets the same room through the canonical fresh-state path and ACKs only after
  the committed `FINISHED → LOBBY` transition. No `new player` payload or
  client-supplied actor is accepted.

## Runtime schemas và boundaries

- Zod strict objects validate name/room/token/UUID/tile/money/chat/trade bundle và
  exact argument count; domain vẫn authorize role/turn/owner/debt/state sau parse.
- Public projector whitelist room/roster/game fields và scrub exact `DeckState`,
  credentials, private offer rows và internal continuation details không cần cho UI.
- Client bỏ stale revision; server commit PostgreSQL trước ACK/broadcast.

## Tests

- Protocol v8 mismatch; payload/ACK compile/runtime validation, including `play again`.
- Strict appearance/`TradeBundle`, payment shortfall, landing decision, durable card
  interaction, semantic lanes and snapshot v7 validation.
- Strict board snapshot validation cho `activityFeed`, `gameStartedAt` optional/null và compatibility với
  snapshot cũ không có field; start timestamp persistence/public projection.
- Public no-leak assertion cho token/hash/session/private offer/exact deck order and
  hidden pre-reveal card state; activity projection remains spectator-safe.
- Socket actor spoof/spectator rejection và save-failure no-publish.
