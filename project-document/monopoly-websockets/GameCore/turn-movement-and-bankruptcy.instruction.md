# Turn, movement, bankruptcy và winner

## Phạm vi và code nguồn

- Dice/movement: `apps/server/src/game/dice.ts`.
- Turn/bankruptcy/winner: `apps/server/src/game/turn.ts`.
- Start, roll, buy handlers: `apps/server/src/socket/turn.ts`.
- Public barrel: `apps/server/src/game/index.ts`.

## Exports/functions

- `rollDice()`: tạo hai số nguyên độc lập từ 1 đến 6 ở server.
- `movePlayer(state, playerId, steps)`: tiến player; khi đạt/vượt index 40 thì trừ 40, cộng 200 và ghi log qua GO.
- `checkBalance(state, advanceTurn?)`: loại player có balance `< 1`, chuyển họ sang `finishedPlayers`, thả property/listing, rồi kiểm tra winner.
- `checkWinner(state)`: set winner khi game đã start, chưa có winner, chỉ còn một active player và đã có ít nhất một finished player.
- `nextTurn(state)`: gọi `checkBalance`, chuyển sang player kế tiếp có wrap, reset `hasMoved` và `turnInfo`.

## Socket flows liên quan

- `start game`: set `gameStarted`, ghi log, gọi `nextTurn`, broadcast.
- `roll dice`: yêu cầu sender là active player, game đã start, đúng current player và chưa move; server roll, move rồi resolve tile.
- `buy property`: yêu cầu active/current player và `turnInfo.canBuyProp`; kiểm tra affordability, trừ tiền, tạo `OwnedProp`, gọi `nextTurn` rồi broadcast.

## Invariants và mutations

- Dice là server-authoritative; client không gửi kết quả dice hoặc vị trí mới.
- `hasMoved` chặn roll lặp trong cùng turn. Unowned buyable tile giữ turn ở trạng thái chờ buy/decline; các tile đã resolve thường gọi `nextTurn` ngay.
- Mua property khởi tạo `houses: 0`, `mortgaged: false`, owner/color theo socket player.
- Bankruptcy dùng ngưỡng `< 1`, không phải `< 0`; balance đúng 0 bị loại.
- Khi loại current player trong `checkBalance`, code chọn một vị trí tiền nhiệm trước khi có thể gọi `nextTurn` để hand-off.
- Winner là snapshot `{ name, color }` trong board state và chỉ được set một lần.

## Caveat AS-IS

- `start game` không có host/admin permission, không kiểm tra sender là active player, số người tối thiểu hay game đã start. Gọi lại sẽ chạy `nextTurn` thêm lần nữa.
- `movePlayer` chỉ trừ 40 một lần; đủ cho dice 2–12 hiện tại nhưng không phải hàm wrap tổng quát cho bước rất lớn/âm.
- Landing đúng GO cũng nhận 200 vì điều kiện là `from + steps < 40`.
- Không có luật được roll lại khi double hoặc đi jail sau ba double; UI chỉ hiển thị nhãn DOUBLE.
- Winner không phải global action lock. Một số handler như building có guard winner, nhưng turn/trading/chat không cùng một guard tổng quát.
- Disconnect không đi qua `checkBalance`; xem caveat hand-off/winner ở [`room-lifecycle.instruction.md`](room-lifecycle.instruction.md).

## Consumers và liên kết chéo

- Tile outcome: [`tile-cards-and-jail-resolution.instruction.md`](tile-cards-and-jail-resolution.instruction.md).
- Player/turn Socket API: [`../Api/socket-turn.instruction.md`](../Api/socket-turn.instruction.md).
- Client turn controls: [`../Client/turn-actions.instruction.md`](../Client/turn-actions.instruction.md).
- Game status UI: [`../Client/game-status.instruction.md`](../Client/game-status.instruction.md).

## Kiểm thử khi sửa

- Unit hiện có cover movement/GO, next-turn wrap, bankruptcy release và winner/no-winner trong `apps/server/src/game.test.ts`.
- Chưa có automation cho start/roll/buy authority guards, repeated start hoặc Socket broadcast.
- Thực hiện [`../testcase/turn-movement-buy-and-jail.md`](../testcase/turn-movement-buy-and-jail.md) và [`../testcase/game-status-bankruptcy-and-winner.md`](../testcase/game-status-bankruptcy-and-winner.md).
- Chạy `pnpm typecheck`, `pnpm lint`, `pnpm test`.
