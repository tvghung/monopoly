# Checklist — shared contracts và board/card data

## Nguồn hành vi

- [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- [`../Shared/board-and-card-data.instruction.md`](../Shared/board-and-card-data.instruction.md)
- Code: `packages/shared/src/`, state fixtures ở `apps/server/src/rooms.ts`, `apps/client/src/App.tsx`, `apps/server/src/game.test.ts`.

## Coverage hiện tại

- `[AUTO-EXISTING]` TypeScript typecheck kiểm tra consumer compile; game tests cover một phần rent/card effects.
- `[MISSING-AUTO]` Chưa có automated data-integrity test cho board length/groups/index/card target hoặc parity với client tables.

## Checklist

### Contract/state shape

- [ ] `[MANUAL]` `pnpm typecheck` pass sau khi đổi type/event và không có local duplicate event signature ngoài shared contract.
- [ ] `[MANUAL]` `GameState` field mới/đổi được cập nhật trong server `freshState`, client `initialState` và test `makeState`.
- [ ] `[MANUAL]` Client `AppSocket` nghe `ServerToClientEvents` và emit `ClientToServerEvents`; server aliases dùng thứ tự generic ngược đúng Socket.IO API.
- [ ] `[MANUAL]` Event mới có cả emit/listener runtime tương ứng; xóa event không để wrapper/hook/listener mồ côi.
- [ ] `[AS-IS CAVEAT]` Gửi payload sai kiểu từ raw Socket client để xác nhận runtime handler không dựa riêng vào TypeScript.

### Board invariants

- [ ] `[MANUAL]` `tileState` có đúng 40 index `0..39`; mọi player position, owned property key và card target nằm trong range.
- [ ] `[MANUAL]` Mọi `colorGroups` index trỏ đến `normal` tile cùng màu, có price/rent/rent tiers/house cost.
- [ ] `[MANUAL]` Railroad indices `5,15,25,35`, utility `12,28`, GO `0`, Jail `10` khớp dữ liệu và game core.
- [ ] `[MANUAL]` Mọi `rentTiers` của buildable street có 5 mức; level 5 tương ứng hotel.
- [ ] `[MANUAL]` Chance/Chest card chỉ dùng effect được `GameCard` và `applyCard` hỗ trợ; mọi absolute target hợp lệ.

### Client duplicate data

- [ ] `[AS-IS CAVEAT]` Ghi nhận drift hiện tại: shared index 20 `Free Parking` nhưng `BoardInitState` để label rỗng; shared index 28 `Water Company` nhưng client ghi `Water Works`.
- [ ] `[MANUAL]` Khi đổi tile economics, đối chiếu `tileState.ts`, `BoardInitState.ts`, `backOfCards.ts`, Buy/Sell prompt và BackOfCard.
- [ ] `[MISSING-AUTO]` Chưa có parity test với allow-list cho drift cố ý; khi sửa board data phải đối chiếu thủ công ba bảng thay vì giả định chúng hoàn toàn giống nhau.

### Card behavior

- [ ] `[AUTO-EXISTING]` Reward/penalty, collect/pay-each, jail card, go-to-jail và relative wrap giữ đúng mutation.
- [ ] `[AS-IS CAVEAT]` Draw là random có hoàn lại; Get Out of Jail card không bị loại khỏi deck; absolute/relative movement không resolve tile đích.
- [ ] `[MISSING-AUTO]` Mỗi card record được chạy qua effect test/data validation, gồm destination và money conservation khi transfer giữa players.

## Regression commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
