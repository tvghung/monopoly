# Rule nền GameCore

## Phạm vi

Áp dụng cho room aggregate/factory tại `apps/server/src/rooms.ts` và luật game tại
`apps/server/src/game/`. Persistence/orchestration nằm ở services/repository, không
được trộn Socket.IO hoặc SQL vào domain functions.

## Identity và aggregate

- Mọi player reference là stable `PlayerId`, không phải `socket.id`.
- `GameState.players`, turn order/current player, ownership and market,
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
| Turn/payment shortfall/bankruptcy/winner/recovery | `game/turn.ts`, `game/dice.ts`, `game/payment.ts` | [GameCore/turn-movement-and-bankruptcy.instruction.md](./GameCore/turn-movement-and-bankruptcy.instruction.md) |
| Tile/card/jail | `game/tiles.ts` | [GameCore/tile-cards-and-jail-resolution.instruction.md](./GameCore/tile-cards-and-jail-resolution.instruction.md) |
| Property economy | `game/property.ts` | [GameCore/property-economy.instruction.md](./GameCore/property-economy.instruction.md) |
| Forced sale | `game/payment.ts`, `game/bankruptcy.ts`, `socket/debt.ts` | [testcase/payment-shortfall-and-forced-sale.md](./testcase/payment-shortfall-and-forced-sale.md) |

## Lifecycle rules

- First activated Seat is host; new Seat is unready.
- Lobby capacity is 2–4 for start; all active Seats must be connected and ready.
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

## Turn/payment deadline rules

- Offline current Player receives persisted configured recovery deadline (default
  60 seconds).
- Reconnect before committed expiry clears marker and preserves exact turn.
- Expiry resolves a pending purchase as Do Not Buy or a development prompt as Skip;
  otherwise it advances the turn.
- Payment shortfall expiry sells owned properties in deterministic tile order and
  eliminates the debtor only after all sellable properties are exhausted.
- Forced-sale proposal persists its proposal ID and absolute expiry inside the
  snapshot; only the seller and selected buyer receive its terms.
- Deadline callbacks must match operation ID/turn/deadline/version before mutation.

## Standard Mode

- Board Việt Nam giữ index `0..39`, 2d6 server-authoritative, 1500 units ban đầu và
  200 units khi đi qua/đáp Xuất Phát; tiền chỉ scale khi format sang VNĐ.
- Đổ đôi không cấp thêm lượt. Mỗi landing được resolve một lần; landing property
  của chính player tạo pending development decision với level tại thời điểm đáp.
- Payment không tự làm balance âm rồi xóa player. `PaymentQueue`/`DebtClaim` giữ
  creditor/source; player được thanh lý tài sản hợp lệ trước khi khai phá sản.
- Forced sale to Bank and forced sale to another active player use separate transfer
  policies; forfeit `LEFT` first settles an active payer and then returns remaining
  assets to the Bank without proceeds.
- Houses/hotels have no finite Bank inventory or colour-group/even-building gate;
  property invariant remains 0..5, non-street properties have zero buildings.
- Deck order/jail-free ownership là authoritative private state và phải giữ nguyên
  qua reconnect/restart.

## Kiểm tra

```bash
pnpm --filter @monopoly/server test
pnpm typecheck
pnpm lint
```

Room/deadline changes also require Socket and restart integration tests.
