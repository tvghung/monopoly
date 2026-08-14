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
- `SOCKET_PROTOCOL_VERSION = 3`; older clients nhận `UPGRADE_REQUIRED`, không chạy legacy
  state/payload.
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
  counts cần cho UI, không lộ holder IDs/order/card kế tiếp.
- Jail third-failed-roll continuation phải giữ dice result qua payment/restart.

`PersistedGameState`/room snapshot chứa durable fields trên và bỏ `loaded`, presence,
credential, socket ID, countdown tick/timer handle.

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
- Không có `new player`, dummy payload hoặc client-supplied actor.

## Runtime schemas và boundaries

- Zod strict objects validate name/room/token/UUID/tile/money/chat/trade bundle và
  exact argument count; domain vẫn authorize role/turn/owner/debt/state sau parse.
- Public projector whitelist room/roster/game fields và scrub exact `DeckState`,
  credentials, private offer rows và internal continuation details không cần cho UI.
- Client bỏ stale revision; server commit PostgreSQL trước ACK/broadcast.

## Tests

- Protocol v3 mismatch; payload/ACK compile/runtime validation.
- Strict `TradeBundle`, payment shortfall, landing decision and snapshot v3 validation.
- Public no-leak assertion cho token/hash/session/private offer/exact deck order.
- Socket actor spoof/spectator rejection và save-failure no-publish.
