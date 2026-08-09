# Rule nền GameCore

## Phạm vi

Áp dụng cho:

- `apps/server/src/rooms.ts`
- `apps/server/src/game/`

Đọc sau [monopoly.shared.instructions.md](./monopoly.shared.instructions.md), rồi mở [GameCore/README.md](./GameCore/README.md) và instruction đúng nhóm logic.

## Vai trò và điểm vào

`apps/server/src/game/index.ts` là barrel public mà Socket handlers và test suite import. GameCore chứa các function mutate `GameState`, tính rent/movement, resolve tile/card/jail, quản lý turn/bankruptcy/winner và auction domain.

`apps/server/src/rooms.ts` giữ registry room và fresh state. Đây là runtime state store in-memory, không phải repository/database.

Không gọi toàn bộ GameCore là pure: dice dùng `Math.random`, log dùng thời gian hiện tại, còn hầu hết function mutate state truyền vào.

## Module map

| Trách nhiệm | Code | Instruction |
| --- | --- | --- |
| Room registry, fresh state, room ID | `apps/server/src/rooms.ts` | [GameCore/room-lifecycle.instruction.md](./GameCore/room-lifecycle.instruction.md) |
| Balance, bankruptcy, winner, turn, dice movement | `apps/server/src/game/turn.ts`, `apps/server/src/game/dice.ts` | [GameCore/turn-movement-and-bankruptcy.instruction.md](./GameCore/turn-movement-and-bankruptcy.instruction.md) |
| Tile, rent dispatch, cards, jail roll | `apps/server/src/game/tiles.ts` | [GameCore/tile-cards-and-jail-resolution.instruction.md](./GameCore/tile-cards-and-jail-resolution.instruction.md) |
| Monopoly, street rent, build/sell, mortgage | `apps/server/src/game/property.ts` | [GameCore/property-economy.instruction.md](./GameCore/property-economy.instruction.md) |
| Auction state và finalize | `apps/server/src/game/auction.ts` | [GameCore/auction.instruction.md](./GameCore/auction.instruction.md) |
| Log timestamp và input safety helper | `apps/server/src/game/text.ts` | Liên kết từ API chat và các instruction consumer |

## State model và mutation

- `GameState.boardState` giữ game lifecycle, player order, current player, log, dice, owned properties, open market, winner và auction.
- `GameState.players` giữ active player records; bankrupt player chuyển sang `finishedPlayers`.
- `turnInfo.canBuyProp` là transient state chờ buy hoặc auction decision.
- Game functions mutate object được truyền vào; caller chịu trách nhiệm broadcast state.
- `nextTurn` gọi `checkBalance`, chọn player kế tiếp, reset `hasMoved` và xóa `turnInfo`.
- `checkBalance` có thể xóa player, property và listing rồi gọi `checkWinner`.

Không thêm transaction/audit/persistence semantics vào tài liệu khi code không có.

## Invariants và rule nền hiện tại

- Board có index 0–39; movement forward wrap qua 40.
- Pass GO bằng dice movement trả `$200M`; card absolute movement xử lý tiền bằng field card riêng.
- Không có rule được thêm lượt khi ra doubles.
- Street rent: mortgage = 0; unbuilt monopoly = 2× base; có house/hotel dùng rent tier.
- Build cần full color group, không mortgage trong group, build-even, tối đa level 5 và đủ tiền.
- Sell house theo sell-even và hoàn nửa house cost.
- Mortgage trả nửa property price; unmortgage trả nửa giá + 10%, làm tròn lên.
- Winner chỉ được set khi game đã start, còn đúng một active player và đã có ít nhất một finished player.
- Auction state bắt đầu 30 giây; finalize trao property cho highest bidder nếu có.

Chi tiết và caveat của từng rule nằm trong instruction leaf, không nhân bản toàn bộ ở đây.

## Hard-coded board dependencies

Ngoài `tileState`, code có các index mang ý nghĩa đặc biệt:

- 0: GO.
- 10: Jail.
- 12 và 28: utilities.
- 5, 15, 25, 35: railroads.
- Card destinations trong `chanceCards.ts`.
- Client presentation arrays theo cùng thứ tự 0–39.

Khi đổi board order/index, phải rà Shared data, GameCore hard-coded indices, client arrays, docs và testcase.

## Ranh giới với transport

- Socket handler lấy room/actor và thực hiện runtime guards trước khi gọi GameCore.
- GameCore function cũng có các owner/existence/business guards riêng tùy function.
- Caller quyết định gửi `update`, private event hoặc không phản hồi.
- Không đưa Socket.IO object vào game-domain functions trừ logic timer/broadcast hiện nằm ở transport auction helper.

File GameCore instruction phải liên kết ngược tới Api và Client consumers để tránh sửa rule chỉ ở một phía.

## Unit test hiện có

`apps/server/src/game.test.ts` hiện kiểm thử 39 case cho:

- Sanitization.
- Movement/pass GO.
- Monopoly/rent/build/sell/mortgage.
- Jail roll.
- Card effects và tile resolution.
- Turn, bankruptcy và winner.
- Auction finalization.

Chưa có automated coverage cho room lifecycle, Socket integration, HTTP runtime hoặc client UI.

## Quy tắc sửa GameCore

1. Giữ mutation order hiện tại trừ khi yêu cầu thay đổi rõ ràng.
2. Thêm/sửa unit test cho valid, rejected và boundary behavior của function.
3. Rà handler caller, client presentation và shared types/data.
4. Cập nhật GameCore index/instruction, Api/Client cross-links và testcase trong cùng lần sửa.
5. Nếu thay đổi state lifecycle hoặc persistence model, cập nhật root README và `CLAUDE.md`.

## Kiểm tra bắt buộc

```bash
pnpm --filter @monopoly/server typecheck
pnpm --filter @monopoly/server test
pnpm lint
```

Thực hiện thêm checklist liên quan trong [testcase/README.md](./testcase/README.md).
