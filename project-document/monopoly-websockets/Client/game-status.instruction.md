# Game status: roster, start game và winner

## Định danh màn hình

| Thuộc tính | Giá trị AS-IS |
|---|---|
| Menu | Không có |
| List route | Không có |
| Detail route | Không có |
| Vị trí UI | Dashboard trong Board tại entry `/` |
| Permission key | Không có |

## Code và component path

- Dashboard composition và start button: `apps/client/src/components/Dashboard.tsx`.
- Danh sách active/bankrupt player: `apps/client/src/components/dashboard/PlayerList.tsx`.
- Winner modal: `apps/client/src/components/dashboard/WinnerBanner.tsx`.
- Format balance: `apps/client/src/components/dashboard/format.ts`.
- Modal motion dùng chung: `apps/client/src/components/dashboard/useModalMotion.ts`.
- Style: `apps/client/src/components/style/Dashboard.css`.
- Socket wrapper và global state: `apps/client/src/App.tsx`.

## Service, state, context và socket

- Dashboard, PlayerList và WinnerBanner đọc `GameState` từ `stateContext`.
- Dashboard đọc `displayPositionsContext` và giữ local `activePlayerId` để trì hoãn turn marker cho tới khi mọi token settled.
- Start button gọi `socketFunctions.startGame()`, emit event `start game` với payload chuỗi rỗng theo wrapper hiện tại.
- Không có event riêng cho roster, start result, bankrupt hoặc winner; tất cả đến qua `update`.
- Không có service, query cache hoặc state library khác.

## Phạm vi UI

- Dashboard shell chứa logo/ảnh, roster, các action panel và open market.
- `Players`: tên, màu, balance, jail badge, số jail card và marker `Turn`.
- `Bankrupt`: danh sách `finishedPlayers` khi có ít nhất một phần tử.
- Nút `Start game` trước khi game bắt đầu.
- Modal game-over thông báo tên và màu của winner.
- Các panel jail, buy, trading và auction được Dashboard compose nhưng logic nằm trong instruction riêng.

## Luồng hiện tại

1. Khi `state.loaded`, PlayerList map `state.players` thành active roster.
2. Player có `isJail` nhận badge lock; player có jail card nhận badge và số lượng.
3. `activePlayerId` chỉ cập nhật sang `boardState.currentPlayer.id` khi mọi display position đã khớp server position.
4. Nếu `finishedPlayers` có dữ liệu, dashboard render thêm danh sách `Bankrupt`.
5. Khi `state.loaded && !gameStarted`, dashboard render nút `Start game`.
6. Click nút emit `start game`; trạng thái sau đó đến qua `update`.
7. Khi `boardState.winner` khác `null`, WinnerBanner render modal game over.

## Rule và caveat

- Start button không kiểm tra host/owner/role ở client; mọi client có state loaded và game chưa start đều thấy nút. Handler server hiện chỉ cần socket đã gắn vào room, không kiểm tra host, active player, số người tối thiểu hoặc game đã start.
- PlayerList dùng key là socket/player ID; color và balance đều lấy từ state server.
- Turn marker cố ý có thể khác `boardState.currentPlayer.id` trong thời gian token animation chưa hoàn tất.
- `finishedPlayers` được trình bày là `Bankrupt`; đây là nhãn UI hiện tại cho mọi entry trong collection đó.
- Winner modal không có nút đóng, restart hoặc rematch trong code hiện tại.
- Không có UI xác nhận/error riêng cho start; handler hiện set `gameStarted`, ghi log, gọi `nextTurn` và gửi state mới.
- `start game` không idempotent ở server, nhưng nút biến mất sau update đầu tiên vì `gameStarted` đã true.
- Dashboard vẫn mount các panel con; mỗi panel tự quyết định render/null theo state của nó.
- Không có permission key, auth role hoặc menu route cho dashboard.

## Tài liệu liên quan

- Rule nền Client: [`../monopoly.client.instructions.md`](../monopoly.client.instructions.md)
- Contract state/event: [`../monopoly.contracts.instructions.md`](../monopoly.contracts.instructions.md), [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Socket player: [`../Api/socket-player.instruction.md`](../Api/socket-player.instruction.md)
- Socket turn/start: [`../Api/socket-turn.instruction.md`](../Api/socket-turn.instruction.md)
- Room lifecycle: [`../GameCore/room-lifecycle.instruction.md`](../GameCore/room-lifecycle.instruction.md)
- Turn và bankruptcy: [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md)
- Testcase: [`../testcase/game-status-bankruptcy-and-winner.md`](../testcase/game-status-bankruptcy-and-winner.md), [`../testcase/join-room-and-player-lifecycle.md`](../testcase/join-room-and-player-lifecycle.md), [`../testcase/client-state-sync-motion-and-accessibility.md`](../testcase/client-state-sync-motion-and-accessibility.md)

## Quy tắc sửa và checklist kiểm thử

Khi sửa dashboard/status, kiểm tra tối thiểu:

- Roster chỉ hiển thị sau khi state loaded và phản ánh player join/leave.
- Tên, màu, balance, jail badge và jail-card count đúng với state.
- Turn marker không đổi trước khi token animation settled; đổi đúng sau khi settled.
- `finishedPlayers` xuất hiện trong nhóm Bankrupt và không còn lẫn với active roster.
- Start button chỉ hiện trước game; click emit đúng một `start game`.
- Start với một player vẫn bắt đầu game theo AS-IS; start từ socket đã ở room phản ánh đúng state/log authoritative.
- Winner modal chỉ hiện khi `winner` có giá trị, dùng đúng name/color và không tự tạo restart flow.
- Reduced-motion áp dụng đúng cho winner modal.
- Chạy typecheck, build, lint và các testcase được liên kết ở trên.
