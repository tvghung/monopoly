# Rule nền GameCore

## Phạm vi

Áp dụng cho room aggregate/factory tại `apps/server/src/rooms.ts` và luật game tại
`apps/server/src/game/`. Persistence/orchestration nằm ở services/repository, không
được trộn Socket.IO hoặc SQL vào domain functions.

## Identity và aggregate

- Mọi player reference là stable `PlayerId`, không phải `socket.id`.
- `GameState.players`, turn order/current player, ownership, market, auction,
  finished players và winner phải giữ reference consistency.
- Room metadata có lifecycle `LOBBY | IN_PROGRESS | FINISHED`, host ID, ready Seat
  metadata và monotonic aggregate version.
- `gameStarted` là compatibility projection từ room status, không phải lifecycle
  authority thứ hai.
- Persisted snapshot loại `loaded`, presence, SocketData, token, offers và timers.

## Module map

| Trách nhiệm | Code | Instruction |
| --- | --- | --- |
| Room/Seat/host/ready/leave | `rooms.ts`, lifecycle services | [GameCore/room-lifecycle.instruction.md](./GameCore/room-lifecycle.instruction.md) |
| Turn/doubles/payment/bankruptcy/winner/recovery | `game/turn.ts`, `game/dice.ts` | [GameCore/turn-movement-and-bankruptcy.instruction.md](./GameCore/turn-movement-and-bankruptcy.instruction.md) |
| Tile/card/jail | `game/tiles.ts` | [GameCore/tile-cards-and-jail-resolution.instruction.md](./GameCore/tile-cards-and-jail-resolution.instruction.md) |
| Property economy | `game/property.ts` | [GameCore/property-economy.instruction.md](./GameCore/property-economy.instruction.md) |
| Auction | `game/auction.ts` | [GameCore/auction.instruction.md](./GameCore/auction.instruction.md) |

## Lifecycle rules

- First activated Seat is host; new Seat is unready.
- Lobby capacity is 2–7 for start; all active Seats must be connected and ready.
- Only host transitions room once from lobby to in-progress.
- Disconnect preserves Seat/host/ready/assets. Explicit leave is a distinct durable
  domain command; lobby leave removes Seat, in-game leave is confirmed forfeit.
- Host transfer occurs on explicit leave to lowest remaining join order, not on
  transient disconnect.
- New no-token join after start is spectator; valid token reclaim is handled first.

## Mutation and durability boundary

GameCore mutates a draft passed by caller. Caller serializes commands, validates
aggregate references, commits by expected version and only then publishes. Domain
functions must not broadcast, ACK or assume persistence has already succeeded.

## Turn/auction deadline rules

- Offline current Player receives persisted configured recovery deadline (default
  60 seconds).
- Reconnect before committed expiry clears marker and preserves exact turn.
- Expiry starts auction when waiting on `canBuyProp`; otherwise advances the turn.
- Active auction owns progression and is not overridden by turn grace.
- Auction persists `auctionId` and absolute `endsAt`; bid may extend deadline to at
  least 15 seconds. Countdown is derived, not persisted per tick.
- Deadline callbacks must match operation ID/turn/deadline/version before mutation.

## Standard Mode

- Board Việt Nam giữ index `0..39`, 2d6 server-authoritative, 1500 units ban đầu và
  200 units khi đi qua/đáp Xuất Phát; tiền chỉ scale khi format sang VNĐ.
- `doublesStreak` sống theo turn. Sau khi tile/card/payment/auction resolution hoàn
  tất, `completeTurnResolution` trả `EXTRA_ROLL` cho doubles thứ nhất/hai hoặc
  `ADVANCE_TURN`; doubles thứ ba vào tù, không di chuyển.
- Payment không tự làm balance âm rồi xóa player. `PaymentQueue`/`DebtClaim` giữ
  creditor/source; player được thanh lý tài sản hợp lệ trước khi khai phá sản.
- Bankruptcy-to-player, return-to-bank, bank auction và voluntary trade dùng policy
  transfer riêng; forfeit `LEFT` không được giả làm bankruptcy.
- Nhà/Khách Sạn giới hạn 32/12 được derive từ board + một
  `BuildingContention.reservedUnit`; Bank-property auctions chạy tuần tự qua durable
  `BankPropertyAuctionQueue`.
- Deck order/jail-free ownership là authoritative private state và phải giữ nguyên
  qua reconnect/restart.

## Kiểm tra

```bash
pnpm --filter @monopoly/server test
pnpm typecheck
pnpm lint
```

Room/deadline changes also require Socket and restart integration tests.
