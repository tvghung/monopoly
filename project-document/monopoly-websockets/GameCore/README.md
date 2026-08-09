# GameCore — mục lục logic game phía server và vòng đời state

## Phạm vi

GameCore gồm state room in-memory và các hàm nghiệp vụ dưới `apps/server/src/game`. Socket handlers là lớp transport/authority gọi các hàm này; tài liệu chi tiết event nằm trong [`../Api/README.md`](../Api/README.md).

Không có model ORM, database, schema hay migration trong code hiện tại.

## Quy ước

- Một instruction tương ứng một nhóm invariant/mutation của game.
- Tên hàm và path trong bảng là symbol/path thật trong code.
- “Guard” chỉ được ghi khi handler hoặc hàm có điều kiện kiểm tra nhìn thấy được.
- Caveat mô tả AS-IS; không tự biến caveat thành flow đã triển khai.

## Thứ tự đọc

1. [`../README.md`](../README.md).
2. [`../monopoly.shared.instructions.md`](../monopoly.shared.instructions.md).
3. [`../monopoly.game-core.instructions.md`](../monopoly.game-core.instructions.md).
4. File README này.
5. Instruction đúng nhóm logic đang sửa.
6. Socket instruction liên quan trong [`../Api/README.md`](../Api/README.md).
7. Checklist tương ứng trong [`../testcase/README.md`](../testcase/README.md).

## Bảng ánh xạ

| Nhóm logic | Code chính | Exports/entry points | Instruction | Testcase |
|---|---|---|---|---|
| Room state, join/disconnect, room cleanup | `apps/server/src/rooms.ts`, `apps/server/src/socket/player.ts` | `Room`, `normalizeRoomId`, `getOrCreateRoom`, `getRoom`, `deleteRoom` | [`room-lifecycle.instruction.md`](room-lifecycle.instruction.md) | [`../testcase/join-room-and-player-lifecycle.md`](../testcase/join-room-and-player-lifecycle.md) |
| Dice, movement, turn, bankruptcy, winner, buy | `apps/server/src/game/dice.ts`, `apps/server/src/game/turn.ts`, `apps/server/src/socket/turn.ts` | `rollDice`, `movePlayer`, `checkBalance`, `checkWinner`, `nextTurn` | [`turn-movement-and-bankruptcy.instruction.md`](turn-movement-and-bankruptcy.instruction.md) | [`../testcase/turn-movement-buy-and-jail.md`](../testcase/turn-movement-buy-and-jail.md), [`../testcase/game-status-bankruptcy-and-winner.md`](../testcase/game-status-bankruptcy-and-winner.md) |
| Tile, rent dispatch, Chance/Chest, jail roll | `apps/server/src/game/tiles.ts`, `apps/server/src/socket/jail.ts` | `checkOwned`, `applyCard`, `resolveTile`, `handleJailRoll` | [`tile-cards-and-jail-resolution.instruction.md`](tile-cards-and-jail-resolution.instruction.md) | [`../testcase/turn-movement-buy-and-jail.md`](../testcase/turn-movement-buy-and-jail.md) |
| Monopoly, rent tiers, houses/hotel, mortgage | `apps/server/src/game/property.ts`, `apps/server/src/socket/building.ts` | `ownsFullGroup`, `streetRent`, `buildHouse`, `sellHouse`, `mortgageProperty`, `unmortgageProperty` | [`property-economy.instruction.md`](property-economy.instruction.md) | [`../testcase/property-economy.md`](../testcase/property-economy.md) |
| Auction state, bid/pass, countdown/finalize | `apps/server/src/game/auction.ts`, `apps/server/src/socket/auction.ts` | `startAuction`, `finalizeAuction`, `beginAuction`, `endAuction` | [`auction.instruction.md`](auction.instruction.md) | [`../testcase/auction.md`](../testcase/auction.md) |

## Quy tắc cập nhật

- Đổi game-state field phải cập nhật Shared contract và ba state fixture theo [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md).
- Đổi game-domain function phải cập nhật unit test trong `apps/server/src/game.test.ts` và instruction này trong cùng lần sửa.
- Đổi authority/validation/broadcast phải cập nhật Socket instruction tương ứng; không chôn transport rule vào GameCore doc.
- Đổi tile index/rent/card phải cập nhật [`../Shared/board-and-card-data.instruction.md`](../Shared/board-and-card-data.instruction.md).
- Thêm nhóm logic mới: thêm instruction, thêm dòng index và testcase tương ứng.
- Kiểm tra tối thiểu: `pnpm typecheck`, `pnpm lint`, `pnpm test`; thêm `pnpm build` nếu shared/client bị ảnh hưởng.
