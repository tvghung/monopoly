# Socket, Standard Mode state và transfer contracts

## Code nguồn

- `packages/shared/src/types.ts`
- `packages/shared/src/events.ts`
- `packages/shared/src/socketSchemas.ts`
- `packages/shared/src/index.ts`

## Identity/protocol

- Stable aliases: `PlayerId`, `RoomId`, `SessionId`, `OfferId`, `AuctionId`,
  `GameCardId` và operation IDs cần cho durable continuation.
- `RoomStatus`: `LOBBY | IN_PROGRESS | FINISHED`; `RoomRole`:
  `PLAYER | SPECTATOR`.
- `SOCKET_PROTOCOL_VERSION = 2`; v1 nhận `UPGRADE_REQUIRED`, không chạy legacy
  state/payload.
- Stable public ID không phải credential. Raw reconnect token không thuộc
  `PublicRoomState`, `GameState`, `SocketData`, log hoặc snapshot.

## Standard Mode aggregate

Public/persisted types dùng stable IDs và phân biệt hidden state:

- Turn: `doublesStreak`; successful `completeTurnResolution` outcome
  `EXTRA_ROLL | ADVANCE_TURN` (`null` cho blocker/stale hoặc internal
  `NO_TURN_CHANGE` completion);
  `TurnInfo.pendingPropertyDecision` biểu diễn buy wait
  và mỗi payment/auction wait nhúng `PendingTurnContinuation`.
- `PendingTurnContinuation.resume.kind` là internal durable instruction:
  `COMPLETE_TURN`, `MOVE_STORED_DICE` hoặc `NO_TURN_CHANGE`. Kind cuối chỉ dùng khi
  Bank auction của một non-current forfeit kết thúc, để không advance lượt của
  Player khác.
- Payment: `PaymentQueue` giữ `orderedClaims: DebtClaim[]`, `activeClaimIndex`,
  `continuation` và `actionDeadlineAt`. Mỗi claim bắt buộc có `debtorPlayerId`,
  `creditor: 'PLAYER' | 'BANK'`, optional `creditorPlayerId`, `amount`,
  `remainingAmount`, `source`; `claimId` và optional `status` là metadata
  idempotency/recovery.
- Auction: `Auction.kind = PROPERTY | BUILDING`; stable `auctionId`, participant,
  bid/pass, target/continuation và absolute `endsAt`.
- Bank: durable `BankPropertyAuctionQueue`; optional `BuildingContention` với
  `reservedUnit: { buildingType: 'HOUSE' | 'HOTEL'; quantity: 1 }`. Available 32
  Nhà/12 Khách Sạn là derived state, không persist counter song song.
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
BANKRUPTCY_TO_PLAYER
RETURN_TO_BANK
BANK_AUCTION_AWARD
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
- Turn/buy/jail/property/building/auction/payment/trade command actor lấy từ
  `socket.data.playerId`.
- Auction bid/pass dùng cùng typed path cho `PROPERTY | BUILDING`, còn target/kind
  được revalidate từ authoritative auction state.
- Public `update(PublicRoomState)` tách khỏi private offer/session delivery.
- Không có `new player`, dummy payload hoặc client-supplied actor.

## Runtime schemas và boundaries

- Zod strict objects validate name/room/token/UUID/tile/money/chat/trade bundle và
  exact argument count; domain vẫn authorize role/turn/owner/debt/state sau parse.
- Public projector whitelist room/roster/game fields và scrub exact `DeckState`,
  credentials, private offer rows và internal continuation details không cần cho UI.
- Client bỏ stale revision; server commit PostgreSQL trước ACK/broadcast.

## Tests

- Protocol v2 mismatch; payload/ACK compile/runtime validation.
- Strict `TradeBundle`, auction kinds, debt/payment and snapshot v2 validation.
- Public no-leak assertion cho token/hash/session/private offer/exact deck order.
- Socket actor spoof/spectator rejection và save-failure no-publish.
