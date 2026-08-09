# Vòng đời room và player state

## Phạm vi và code nguồn

- Room registry/state factory: `apps/server/src/rooms.ts`.
- Join/disconnect transport flow: `apps/server/src/socket/player.ts`.
- Auction timer cleanup: `apps/server/src/socket/auction.ts`.
- Shared shape: `packages/shared/src/types.ts`.

## Exports và entry points

- `Room`: `{ id, state, colors, auctionTimer? }`.
- `normalizeRoomId(raw)`: giữ chữ/số/dấu `-`, tối đa 20 ký tự, uppercase; giá trị rỗng thành `LOBBY`.
- `getOrCreateRoom(id)`: lấy room hiện có hoặc tạo state/colors mới.
- `getRoom(id?)`: chỉ lookup, không tạo.
- `deleteRoom(id)`: xóa khỏi registry.
- Socket entries: `new player`, `disconnect` trong `registerPlayerHandlers`.

## State khởi tạo

- `gameStarted: false`, `players: []`, `finishedPlayers: {}`.
- `currentPlayer: { id: '', hasMoved: false }`.
- Logs rỗng, dice `0/0`, ownership/open market rỗng, `winner: null`, `auction: null`.
- Player map rỗng, `turnInfo: {}`, `loaded: true`.
- Pool màu theo thứ tự array `black, white, orange, red, blue, green, yellow`; join lấy bằng `pop()`, hết pool dùng `grey`.

## Luồng mutation chính

### Join

1. Normalize room id, cho socket join Socket.IO room và gán `socket.data.roomId`.
2. Tạo/lấy room.
3. Nếu cùng socket đã có trong player map, không tạo lại; chỉ broadcast `update`.
4. Nếu game chưa start, sanitize tên (fallback `Player`), tạo player ở tile 0, balance 1500, chưa jail, chưa có jail card; cập nhật `boardState.players`.
5. Nếu game đã start, socket không được thêm vào player map; log thông báo và hoạt động như spectator.
6. Broadcast toàn state cho room.

### Disconnect

- Trả màu của active/finished player về pool và xóa record.
- Xóa property ownership và open-market listing do socket đó sở hữu/bán.
- Cập nhật `boardState.players` từ player map.
- Nếu không còn active player: clear auction interval nếu có rồi xóa room.
- Nếu auction đang chạy: loại socket khỏi `active`/`passed`; nếu họ đang dẫn đầu thì reset bid và mở lại lượt pass; có thể kết thúc auction khi không còn người cần hành động.

## Invariants

- Registry là `Map` private trong process; mỗi room giữ một object `GameState` riêng và mutate tại chỗ.
- Mọi handler ngoài `new player` tìm room bằng `socket.data.roomId`; không tự tạo room.
- `boardState.players` phải phản ánh keys hiện còn trong `state.players` sau join/disconnect/bankruptcy.
- Auction interval thuộc `Room`, không nằm trong serialized `GameState`.

## Caveat AS-IS

- Không có persistence/reconnect seat. Restart/redeploy hoặc room hết player làm mất toàn bộ game.
- Không có shared adapter/store cho nhiều server process; room registry và auction timer chỉ tồn tại trong một process.
- Sau game start, “join” là spectator nhưng vẫn có thể chat; code không có role object riêng cho spectator.
- Không có giới hạn player; player thứ tám trở đi nhận fallback `grey` khi pool hết.
- Disconnect active current player không gọi `nextTurn` và không sửa `currentPlayer.id`; disconnect cũng không gọi `checkWinner`. Đây là behavior/risk hiện tại, không được mô tả là đã tự hand-off hoặc đã tuyên bố winner.
- Một socket gửi lại `new player` với room khác không có flow rời Socket.IO room cũ; UI hiện chỉ submit join một lần.

## Consumers và liên kết chéo

- Player Socket API: [`../Api/socket-player.instruction.md`](../Api/socket-player.instruction.md).
- Auction cleanup: [`auction.instruction.md`](auction.instruction.md).
- State contract: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md).
- Client join: [`../Client/join-room.instruction.md`](../Client/join-room.instruction.md).

## Kiểm thử khi sửa

- Automation hiện có chỉ cover `sanitizeName`; chưa có unit/integration test cho registry, room isolation, join/disconnect hoặc timer cleanup.
- Thực hiện [`../testcase/join-room-and-player-lifecycle.md`](../testcase/join-room-and-player-lifecycle.md).
- Nếu sửa disconnect trong auction, chạy thêm [`../testcase/auction.md`](../testcase/auction.md).
- Chạy `pnpm typecheck`, `pnpm lint`, `pnpm test`.
