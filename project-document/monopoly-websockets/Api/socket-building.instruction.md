# Building và mortgage Socket instruction

## Phạm vi AS-IS

Đây là Socket event module tương đương controller cho xây/bán house hoặc hotel và mortgage/unmortgage property. Handler mỏng; phần lớn guard nghiệp vụ nằm trong `game/property.ts`.

- Socket.IO path: `/socket.io` mặc định.
- Namespace: `/` mặc định.
- Function đăng ký: `registerBuildingHandlers(io, socket)`.
- Handler: `apps/server/src/socket/building.ts:10-50`.
- Core service: `apps/server/src/game/property.ts:4-95`.

## Auth và permission

Không có auth hoặc permission key. Quyền thực thi là state guard:

| Mức/action | Guard hiện tại |
|---|---|
| Module/handler | Room phải tồn tại; nếu `boardState.winner` đã có thì return. |
| Tất cả action | `state.players[socket.id]` và property phải tồn tại; sender phải là owner. |
| `build house` | Street buildable, full color group, không tile nào trong group mortgaged, target dưới level 5, build-even, đủ tiền. |
| `sell house` | Target có house và đang ở mức house cao nhất trong group để giữ sell-even. |
| `mortgage property` | Target chưa mortgaged, target không có house và mortgage value dương. |
| `unmortgage property` | Target đang mortgaged và owner đủ half-price cộng 10%, làm tròn lên. |

## Action, service và outbound

| Inbound event | Function service | Mutation thành công | Outbound |
|---|---|---|---|
| `build house(tileID)` | `buildHouse(state, socket.id, tileID)` | Trừ `houseCost`, tăng `owned.houses`; level 5 được log là hotel. | Luôn phát `update` sau service, kể cả service no-op. |
| `sell house(tileID)` | `sellHouse(...)` | Giảm houses, hoàn `floor(houseCost / 2)`. | `update` tới room. |
| `mortgage property(tileID)` | `mortgageProperty(...)` | Set `mortgaged = true`, cộng `floor(price / 2)`. | `update` tới room. |
| `unmortgage property(tileID)` | `unmortgageProperty(...)` | Set `mortgaged = false`, trừ `ceil((price / 2) * 1.1)`. | `update` tới room. |

## Logic kinh tế liên quan

- `ownsFullGroup`: mọi tile trong `colorGroups[color]` phải cùng owner: `game/property.ts:4-9`.
- `streetRent`: mortgage trả 0; có house dùng rent tier; monopoly chưa build gấp đôi base rent: `game/property.ts:11-20`.
- Tile metadata và color groups là dữ liệu dùng chung: `packages/shared/src/tileState.ts:3-301`.
- Client mirror một phần rule để disable button, nhưng server service vẫn là enforcement source: `apps/client/src/components/BackOfCard.tsx:25-67`.

## Caveat cần giữ đúng khi sửa

- Không yêu cầu game đã start hoặc đúng lượt; owner được quản lý property bất kỳ lúc nào trước khi có winner.
- Mortgage chỉ kiểm tra `houses` trên chính target tile. Code không bắt owner bán hết houses ở các tile khác cùng color group trước khi mortgage target không có house.
- Listing open market không chặn build/sell/mortgage, và building module không tự xóa listing.
- `sellHouse` không check lại full-group ownership; nó cho phép bán house đã tồn tại nếu sender vẫn owner target và even-sell pass.
- Invalid/no-op action vẫn làm handler broadcast full state; không có error/ACK giải thích lý do.
- Service mutate state trực tiếp và không gọi `checkBalance`; build đã chặn thiếu tiền nên action này không chủ động tạo balance âm.

## Liên kết chéo

- Client property management: [`../Client/property-management.instruction.md`](../Client/property-management.instruction.md)
- Client board: [`../Client/game-board.instruction.md`](../Client/game-board.instruction.md)
- GameCore property economy: [`../GameCore/property-economy.instruction.md`](../GameCore/property-economy.instruction.md)
- Shared board/state: [`../Shared/board-and-card-data.instruction.md`](../Shared/board-and-card-data.instruction.md), [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Testcase: [`../testcase/property-economy.md`](../testcase/property-economy.md)

## Quy tắc sửa và kiểm thử

Khi sửa module này phải kiểm tra:

- Owner/non-owner, invalid tile và winner guard cho cả bốn event.
- Full monopoly, mortgage trong group, build-even/sell-even và level 0-5.
- Đủ/thiếu balance, build cost, sell refund, mortgage value và unmortgage rounding.
- Rent khi mortgage, monopoly chưa build và từng house/hotel tier.
- Property đang được list hoặc chuyển owner qua trading.
- Server guard và trạng thái disabled/title của `BackOfCard` không lệch nhau.
- Chạy property tests tại `apps/server/src/game.test.ts:120-265` và thêm Socket integration test khi đổi handler/event.
