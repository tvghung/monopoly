# Turn Socket instruction

## Phạm vi AS-IS

Đây là Socket event module tương đương controller cho bắt đầu game, roll/move/resolve lượt và mua property vừa đáp xuống.

- Socket.IO path: `/socket.io` mặc định.
- Namespace: `/` mặc định.
- Function đăng ký: `registerTurnHandlers(io, socket)`.
- Handler: `apps/server/src/socket/turn.ts:13-83`.
- Event contract: `packages/shared/src/events.ts:21-28`.

## Auth và permission

| Mức/action | Permission/guard hiện tại |
|---|---|
| Module/controller | Không có auth và không có permission key. |
| `start game` | Chỉ yêu cầu `socket.data.roomId` trỏ tới room tồn tại; không kiểm tra host, active player, số người hoặc game đã start. |
| `roll dice` | Sender phải là active player; game đã start; đúng `currentPlayer.id`; `hasMoved === false`. |
| `buy property` | Sender phải là active player, đúng lượt, `turnInfo.canBuyProp === true`, đủ balance. |

## Action, inbound và outbound event

| Function/action | Inbound | Validation/guard | Service/mutation chính | Outbound |
|---|---|---|---|---|
| Start | `start game(payload)` | Chỉ có room guard; payload bị bỏ qua. | Set `gameStarted = true`, log, gọi `nextTurn`. | `update` tới room. |
| Roll/move | `roll dice` | Player tồn tại, game running, đúng lượt, chưa move. | `rollDice`; nếu jailed gọi `handleJailRoll`; nếu không set dice/hasMoved, `movePlayer`, `resolveTile`. | `update` tới room. |
| Buy landed property | `buy property(payload)` | Player, current turn, `canBuyProp`, đủ giá tile. | Trừ balance; tạo `ownedProps[currentTile]` với `houses: 0`, `mortgaged: false`; gọi `nextTurn`. | `update`; nhánh không đủ tiền cũng phát `update` sau log. |

Shared contract hiện khai báo `start game(payload: string)` và `buy property(payload: boolean)`, nhưng handler không dùng hai payload này. Client lần lượt gửi `''` và `true`: `apps/client/src/App.tsx:19,26`.

## Service và mutation nổi bật

| Concern | Code thật | Hành vi chính |
|---|---|---|
| Turn/bankruptcy/winner | `apps/server/src/game/turn.ts:4-75` | `checkBalance`, `checkWinner`, `nextTurn`; reset `hasMoved` và `turnInfo`. |
| Dice/movement | `apps/server/src/game/dice.ts:4-21` | Dice server-authoritative; move 40 tile và cộng `$200M` khi wrap/đáp đúng GO. |
| Tile resolution | `apps/server/src/game/tiles.ts:13-206` | Mua/rent/tax/card/company/railroad/jail và chuyển lượt. |
| Property price/table | `packages/shared/src/tileState.ts` | Giá, rent, tile type và build metadata. |
| Game state shape | `packages/shared/src/types.ts:93-140` | `currentPlayer`, `turnInfo`, `boardState`, `players`. |

## Luồng chính

1. `start game` đặt cờ started rồi gọi `nextTurn`; `nextTurn` chọn player kế tiếp theo `boardState.players`.
2. Current player phát `roll dice`; server sinh hai dice nên client không điều khiển số bước.
3. Player bình thường được move rồi resolve tile. Hầu hết kết quả tự chuyển lượt; property chưa có owner đặt `turnInfo.canBuyProp = true` và chờ mua hoặc auction.
4. `buy property` trừ giá niêm yết, tạo ownership rồi chuyển lượt.
5. Player trong jail đi qua `handleJailRoll`, không qua resolve tile bình thường.

## Caveat cần giữ đúng khi sửa

- Bất kỳ socket đã gắn vào room, kể cả spectator, có thể phát `start game`; server không có khái niệm host.
- `start game` không idempotent: phát lại tiếp tục gọi `nextTurn` và ghi log mới.
- Không có guard số người tối thiểu; game một player có thể start.
- Không có doubles-extra-turn hoặc three-doubles-to-jail rule.
- Khi thoát jail bằng dice, `handleJailRoll` di chuyển rồi gọi `nextTurn` nhưng không gọi `resolveTile`: `apps/server/src/game/tiles.ts:182-206`.
- `resolveTile` có thể gọi `nextTurn`, và `nextTurn` luôn chạy `checkBalance` trước khi chọn lượt mới.
- `buy property` không check riêng `gameStarted`/`hasMoved`; tính hợp lệ dựa vào current turn và `canBuyProp` đã được tile resolution đặt.
- Handler từ chối action bằng `return`, không ACK/error event.

## Liên kết chéo

- Client turn UI: [`../Client/turn-actions.instruction.md`](../Client/turn-actions.instruction.md)
- Client board/status: [`../Client/game-board.instruction.md`](../Client/game-board.instruction.md), [`../Client/game-status.instruction.md`](../Client/game-status.instruction.md)
- GameCore turn/movement: [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md)
- GameCore tile/jail: [`../GameCore/tile-cards-and-jail-resolution.instruction.md`](../GameCore/tile-cards-and-jail-resolution.instruction.md)
- Shared contracts/data: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md), [`../Shared/board-and-card-data.instruction.md`](../Shared/board-and-card-data.instruction.md)
- Testcase: [`../testcase/turn-movement-buy-and-jail.md`](../testcase/turn-movement-buy-and-jail.md), [`../testcase/game-status-bankruptcy-and-winner.md`](../testcase/game-status-bankruptcy-and-winner.md)

## Quy tắc sửa và kiểm thử

Khi sửa module này phải kiểm tra:

- Start lần đầu/lặp lại, active player so với spectator và room một/nhiều player.
- Roll bị chặn khi chưa start, sai lượt hoặc đã move; dice luôn từ server.
- Wrap/đáp GO, rent từng loại tile, tax, card, jail và bankruptcy sau resolve.
- Unowned property chờ đúng current player; mua đủ/thiếu tiền; ownership khởi tạo đúng.
- Thoát jail bằng doubles, sau hai round và roll không doubles.
- Full `update` chỉ tới đúng room; action bị guard không làm đổi state.
- Chạy `pnpm --filter @monopoly/server test` và `typecheck`; thêm Socket integration test khi đổi guard/event vì pure game tests không chứng minh listener wiring.
