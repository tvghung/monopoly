# Game board và tile visualization

## Định danh màn hình

| Thuộc tính | Giá trị AS-IS |
|---|---|
| Menu | Không có |
| List route | Không có |
| Detail route | Không có; tile detail là mặt sau inline của tile |
| URL entry | `/` |
| Điều kiện hiển thị | Activated Player hoặc explicit Spectator admission |
| Permission key | Không có |

## Code và component path

- Board shell và provider nội bộ: `apps/client/src/components/Board.tsx`.
- Tile, token, owner frame, mortgage/building marker: `apps/client/src/components/Tile.tsx`.
- Mặt sau tile: `apps/client/src/components/BackOfCard.tsx`.
- Vị trí token hiển thị: `apps/client/src/useSteppedPositions.ts`, `apps/client/src/displayPositionsContext.ts`.
- Context lật tile: `apps/client/src/cardFlipContext.ts`.
- Dữ liệu mặt trước: `apps/client/src/components/BoardInitState.ts`.
- Dữ liệu mặt sau: `apps/client/src/components/backOfCards.ts`.
- Dữ liệu game dùng chung: `packages/shared/src/tileState.ts`.
- Layout/style: `apps/client/src/components/style/Board.css`, `BackOfCard.css`.

## Service, state, context và socket

- Board đọc public room/game state, stable `playerId` và `role` từ `stateContext`.
- Board không đăng ký socket listener riêng; dữ liệu authoritative đến từ `update(PublicRoomState)` mà `App` xử lý theo revision.
- `displayPositionsContext` chứa vị trí đang hiển thị của từng player. `useSteppedPositions` dịch vị trí này dần tới `state.players[id].currentTile`.
- `cardFlipContext` chứa mảng `cardsBack` và reducer action `FLIP_CARD`.
- `sellPromptContext` được tạo tại Board để chuyển click từ property card sang modal trading.
- `LayoutGroup` và stable `layoutId` của token dùng Framer Motion cho chuyển động giữa tile.

## Phạm vi UI

- 40 tile theo index `0..39` quanh bốn cạnh bàn.
- Owner frame, trạng thái mortgaged, số house/hotel và token người chơi trên từng tile.
- Click tile để đổi giữa mặt trước và mặt sau.
- Khu vực giữa bàn chứa `Dice`, `Log` và `Dashboard`; nghiệp vụ chi tiết của các panel này nằm ở instruction riêng.

## Luồng hiện tại

1. Board tạo `actualPositions` từ `state.players[*].currentTile`.
2. `useSteppedPositions` giữ một bản vị trí hiển thị và bước từng ô về vị trí authoritative.
3. Board map dữ liệu 40 tile thành các vị trí CSS: start, cạnh dưới, trái, trên và phải.
4. `Tile` render token có vị trí hiển thị trùng tile hiện tại; nếu context chưa có vị trí thì fallback về `currentTile` từ server.
5. Click một tile đóng card đang mở và mở mặt sau của tile vừa click.
6. Click ngoài `.Tile` và `.tile-back--container` đóng card đang mở.
7. Event `update` thay committed public snapshot; owner frame, mortgage, building và token được render lại theo state mới.

## Rule và caveat

- Tile index là khóa kết nối xuyên suốt UI, shared data và server game logic; không đổi thứ tự một mảng độc lập.
- Bước token chạy mỗi `200ms`. Quãng tiến bình thường tối đa 12 ô được đi từng bước; khoảng cách lớn hơn hoặc chuyển động ngược được snap tới đích.
- Vị trí display cố ý trễ hơn server. `Dice`, buy prompt và turn marker dùng trạng thái settled/arrived này; thay thuật toán movement có thể đổi hành vi của các panel khác.
- `prefers-reduced-motion` làm transition token/card tức thời, nhưng interval trong `useSteppedPositions` vẫn chạy theo bước 200ms.
- Metadata tile hiện bị lặp tại ba nguồn: `BoardInitState.ts`, `backOfCards.ts`, `packages/shared/src/tileState.ts`.
- Có sai khác AS-IS ở tile 28: shared data là `Water Company`, còn hai nguồn UI hiển thị `Water Works`. Không được tự sửa sai khác này chỉ trong tài liệu; khi code thay đổi phải cập nhật mô tả và kiểm tra cả ba nguồn.
- `state.boardState.ownedProps` và `state.players` từ server là nguồn authoritative cho ownership/buildings/token. Các trường `ownedBy`/`houses` trong `BoardInitState.ts` không điều khiển state game realtime.
- Card special cũng có mặt sau thông tin; action property chỉ xuất hiện theo ownership và loại tile trong `BackOfCard`.
- Không có route detail cho tile, deep link hoặc browser history khi lật card.
- `socket.id` không được dùng làm token/owner identity; stable Player ID giữ nguyên qua refresh.
- Spectator có banner read-only và không thấy property/gameplay mutation actions.
- Khi reconnect, Board giữ snapshot nhưng overlay khóa mutation cho tới resume ACK.

## Tài liệu liên quan

- Rule nền Client: [`../monopoly.client.instructions.md`](../monopoly.client.instructions.md)
- Rule nền GameCore: [`../monopoly.game-core.instructions.md`](../monopoly.game-core.instructions.md)
- Contract state: [`../monopoly.contracts.instructions.md`](../monopoly.contracts.instructions.md), [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Dữ liệu board/card: [`../Shared/board-and-card-data.instruction.md`](../Shared/board-and-card-data.instruction.md)
- Movement và tile resolution: [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md), [`../GameCore/tile-cards-and-jail-resolution.instruction.md`](../GameCore/tile-cards-and-jail-resolution.instruction.md)
- Socket state update liên quan: [`../Api/socket-turn.instruction.md`](../Api/socket-turn.instruction.md), [`../Api/socket-building.instruction.md`](../Api/socket-building.instruction.md)
- Testcase: [`../testcase/client-state-sync-motion-and-accessibility.md`](../testcase/client-state-sync-motion-and-accessibility.md), [`../testcase/shared-contracts-and-board-data.md`](../testcase/shared-contracts-and-board-data.md)

## Quy tắc sửa và checklist kiểm thử

Khi sửa Board/Tile/movement, kiểm tra tối thiểu:

- Đủ đúng 40 tile, đúng index, tên, màu, giá và orientation.
- Owner frame, mortgage marker, house và hotel phản ánh đúng `ownedProps` sau `update`.
- Nhiều player cùng tile đều hiển thị; temporary disconnect không xóa token/Seat, còn explicit leave mới thay roster.
- Move 2–12 ô đi lần lượt, qua ô 39 về 0 đúng; jail/teleport/backward snap đúng AS-IS.
- Không cho roll tiếp, đổi turn marker hoặc hiện buy prompt trước thời điểm token settled/arrived.
- Click tile mở đúng card; click tile khác chỉ mở một card; click center/dashboard/log đóng card.
- Reduced-motion không dùng transition động và không phá state settlement.
- Kiểm tra đồng bộ ba nguồn tile data, đặc biệt tile 28 và index 0–39.
- Chạy typecheck, build, lint và hai testcase được liên kết ở trên.
