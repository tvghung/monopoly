# 2v2 Teamplay — luật, trạng thái và vòng đời

Nguồn thẩm quyền của chế độ `TEAM_2V2`. Server quyết định mọi luật; client chỉ hiển thị
state công khai (`apps/client/src/game/team/teamView.ts`). Solo giữ nguyên, trừ một thay
đổi cố ý: sở hữu đủ một khu màu nhân tiền thuê **mọi ô street của khu** ×1,5 (làm tròn xuống);
xây Nhà không bao giờ bị khóa bởi bộ màu.

Code: `packages/shared/src/teams.ts`, `rules.ts`, `apps/server/src/game/team*.ts`,
`game/rescue*.ts`, `game/tiles.ts`, `game/property.ts`, `socket/team.ts`, `teamLobby.ts`,
`migrations/010_teamplay_v9.sql`, `migrations/011_lobby_seats_v10.sql`. Test: [testcase/team-play.md](../testcase/team-play.md).

## Mô hình team

- `GameMode = 'SOLO' | 'TEAM_2V2'` (`boardState.gameMode`), chỉ đổi được ở `LOBBY` bởi host.
- `TeamId = 'TEAM_1' | 'TEAM_2'`. Mọi `Player`, `FinishedPlayer`, `Winner` và `RoomPlayerMeta`
  mang `teamId` ổn định (Solo vẫn gán nhưng không dùng; join mới chia xen kẽ theo đội ít người hơn).
- `boardState.teams: TeamSettingsById` = `{ name, color }` mỗi đội. Tên mặc định `Team 1`/`Team 2`
  (tối đa `TEAM_NAME_MAX_LENGTH = 20`, qua `sanitizeName`), màu mặc định `red`/`blue`, **hai màu luôn khác nhau**.
- Mỗi `Player` có thêm `teamSlot` (0 hoặc 1): ghế của họ **trong đội** (`TeamSlot`, `TEAM_SLOTS`). Một sảnh 2v2 có 4 ghế
  (2 đội × 2 ghế); hai thành viên active của một đội trong `LOBBY` không bao giờ cùng ghế (`assertSeatState`; một sảnh vượt
  `MAX_PLAYERS` — chỉ phòng cũ — không được kiểm vì không thể bắt đầu). Người mới vào ngồi đội ít người hơn, ghế trống thấp nhất
  (`chooseJoinSeat`). Ghế chỉ có nghĩa ở sảnh: `startTeamMatch` xếp mỗi đội theo ghế, nên ghế 0 của đội đối thủ đi ngay sau
  người đi trước và ghế 1 đi cuối. `boardState.seatSwapRequests` là các yêu cầu đổi chỗ đang mở (công khai).
- `boardState.teamPlay: TeamPlayState` = `{ slotOrder, revivedPlayerIds, reviveWindows }`. `slotOrder`
  là thứ tự lượt ổn định `A1, B1, A2, B2` (người đi trước, đối thủ đầu, đồng đội, đối thủ thứ hai) và chỉ có
  trong ván 2v2 đang chạy; ở lobby/Solo là rỗng.
- `boardState.winningTeamId` + `winner` (đại diện: người active đầu tiên theo `slotOrder`). Cả hai thành viên
  của đội thắng đều là người thắng, kể cả người đã bị loại.
- Ownership vẫn là `PlayerId`; tiền luôn theo từng người. Không có ví chung.
- 2v2: `player.color` luôn bằng màu đội (mascot vẽ theo màu đội, màu cũng là accent ownership). Hai đồng đội
  không được trùng mascot; hai đội được trùng.
- Public projection (`services/publicState.ts`): `teams: PublicTeam[]` (kèm `memberPlayerIds` gồm cả người đã
  bị loại), `teamPlay: { revivedPlayerIds, reviveWindows }` (mỗi window có `survivorPlayerId`,
  `turnsRemaining`, `openedAtTurnNumber`), `winningTeamId`. `slotOrder` là private durable state.

## Lobby

| Command | Ai | Hiệu ứng |
| --- | --- | --- |
| `set game mode` `{mode}` | host | Đổi mode; **mọi người** mất Ready. Sang 2v2: áp màu đội cho mọi người và bỏ mascot trùng giữa đồng đội. |
| `set team name` `{name}` | thành viên active của **đội mình** | Đổi tên đội của chính mình (payload không có `teamId`: không ai, kể cả host, đổi được tên đội kia); không reset Ready. |
| `set team color` `{color}` | thành viên active của **đội mình** | Đổi màu đội (không được trùng màu đội kia); reset Ready cả đội đó. |
| `move to seat` `{teamId,teamSlot}` | thành viên active | Nhảy ngay vào một ghế **trống** (đội kia hoặc ghế còn lại của đội mình). Sang đội khác: đổi sang màu đội mới, mascot trùng đồng đội mới bị xóa (người ở lại giữ mascot), chỉ người di chuyển mất Ready; trong cùng đội chỉ đổi ghế. |
| `request seat swap` `{targetPlayerId}` | thành viên active | Xin đổi chỗ với một người khác; chưa có gì thay đổi. Mỗi người chỉ có một yêu cầu mở (yêu cầu mới thay yêu cầu cũ). |
| `cancel seat swap` | người xin | Rút yêu cầu của mình (không có gì để rút vẫn là thành công). |
| `respond seat swap` `{requesterPlayerId,accept}` | người được xin | Chỉ yêu cầu `requester → actor` đang mở mới tính. Đồng ý: hai người đổi ghế (sang đội khác thì như `move to seat` cho cả hai: màu, mascot, cả hai mất Ready; cùng đội chỉ đổi ghế). Từ chối: đóng yêu cầu. |

Host **không** có lệnh nào di chuyển người khác; `kick player` (host, chỉ `LOBBY`, cả Solo) là lệnh duy nhất của host lên người khác
([Api/socket-lobby.instruction.md](../Api/socket-lobby.instruction.md)). Yêu cầu đổi chỗ vô hiệu (bị xóa trong cùng commit) khi một bên di chuyển/đổi chỗ/rời/bị mời ra, khi đổi
mode và khi bắt đầu ván.
| `set appearance` | từng người | 2v2: chỉ `characterId`; từ chối `color` và mascot trùng đồng đội. |

Mọi command chỉ chạy trong `LOBBY`; command team chỉ chạy khi mode là 2v2. Mỗi đội chỉ có 2 ghế nên không có 3v1 trong sảnh. Start 2v2 cần đúng 4 active player, mỗi đội đúng 2, tất cả connected + ready, mascot
hợp lệ. `play again` giữ `gameMode`, `teams`, `teamId` từng người và màu đội; reset toàn bộ match state
(`teamPlay`, `winningTeamId`, windows) và xếp lại mỗi đội vào ghế 0, 1 theo thứ tự vào phòng; host vẫn đổi mode được trước khi start ván mới.

## Lượt chơi

`startTeamMatch` đặt `slotOrder` rồi `boardState.players = slotOrder`. Người bị loại chỉ bị lọc khỏi
thứ tự sống; `restoreTurnOrder` = `slotOrder` lọc theo người còn trong ván, nên người được hồi sinh trở lại **đúng
slot cũ**, không có lượt thưởng và không đổi `currentPlayer`.

## Tiền thuê

- Chủ ô là đồng đội của người dừng chân: **miễn tiền thuê tài sản** (street/railroad/utility). Thẻ và thuế vẫn
  tính, kể cả khi bên nhận là đồng đội.
- Bộ màu (`colorSetRentPercent`): Solo một người đủ khu → `SOLO_COLOR_SET_RENT_PERCENT = 150`; 2v2 hai đồng đội
  cùng giữ đủ khu (tổng hợp theo đội, mỗi người một phần) → `TEAM_COLOR_SET_RENT_PERCENT = 200`. Một người giữ đủ khu trong
  2v2 vẫn được ×2 (cả khu thuộc đội). Khu bị chia giữa hai đội không có bonus. `Math.floor(rent × percent / 100)`.
- Railroad/Utility: số lượng hiệu lực là số của **cả đội** (`effectiveRailroadOwnershipCount`,
  `effectiveUtilityOwnershipCount`) khi tính tiền thuê.

## Team Investment

Dừng ở street đồng đội sở hữu và có ít nhất một cấp xây trả được: tạo `PendingDevelopmentDecision` cho **người
dừng chân** (không phải chủ). Người này trả bằng tiền của mình; `ownedProps[tile].id` không đổi; activity
`PROPERTY_DEVELOPMENT` kèm `ownerPlayerId/ownerName`. Bán công trình hoàn tiền cho **chủ ô**. Không bật Team
Investment nếu không đủ tiền cho một cấp (không tạo decision vô nghĩa).

## Phá sản, hồi sinh, cứu trợ

- Phá sản theo từng người (`surrenderPlayerToBank`, `completeTurnResolution`). Đội thua ngay khi 0 active
  member (`checkTeamWinner` đóng mọi window và đặt `winningTeamId`).
- **Revive window**: người phá sản (`reason = 'BANKRUPT'`, không phải `LEFT`), chưa từng hồi sinh, đồng đội còn
  trong ván → window `{turnsRemaining: REVIVE_WINDOW_SURVIVOR_TURNS = 5, openedAtTurnNumber}` + activity `TEAM_REVIVE WINDOW_OPENED`.
  Mỗi lần **kết thúc lượt của người sống sót** (kể cả bị tù, bị bỏ qua vì disconnect — mọi handoff qua `nextTurn` →
  `consumeReviveTurn`) trừ 1; về 0 → `EXPIRED`, loại vĩnh viễn. Window mở trong lượt X chỉ tính từ lượt kế tiếp.
  Nghĩa là người sống sót được hồi sinh trước mỗi lần đổ xúc xắc của **5** lượt kế tiếp của chính họ; đến lượt thứ 6 của họ,
  người đã bị loại là loại vĩnh viễn (`REVIVE_WINDOW_SURVIVOR_TURNS = 5`).
- `revive teammate` (không payload; actor = socket player): chỉ trong lượt của chính người sống sót, trước khi
  roll hoặc trong lúc chờ quyết định mua/phát triển, không có payment/card/rescue đang chờ, đủ `REVIVE_COST = 750`.
  Trả cho Bank; người được hồi sinh về ô `Xuất Phát` với `REVIVE_STARTING_CASH = 300`, không tài sản, không thẻ,
  không tù, `revivedPlayerIds` ghi nhớ (mỗi người một lần), `finishedPlayers` → `players`, `membershipStatus`
  `FINISHED → ACTIVE`. Người bị loại chỉ xem/chat; `leave room` tường minh không bao giờ hồi sinh được (window đóng).
- **Emergency Rescue**: khi người nợ đã hết thứ có thể thanh lý và còn thiếu, `paymentResolution` mở
  `PaymentQueue.rescue` `{rescueId, debtorPlayerId, rescuerPlayerId, amount, expiresAt}` (`expiresAt` ==
  `actionDeadlineAt`, timeout `EMERGENCY_RESCUE_TIMEOUT_MS`, mặc định 30 000 ms). Chỉ đồng đội active đủ tiền cho
  **toàn bộ phần còn thiếu của mọi claim còn mở của người nợ** (claim nợ chính rescuer không tốn tiền) mới được hỏi; cứu một
  phần sẽ vẫn kết thúc bằng phá sản nên không có. `accept rescue` trả tiền trực tiếp
  cho creditor/Bank (`MONEY_TRANSFER reason RESCUE`), **không bao giờ qua ví người nợ**; `decline rescue`, hết hạn
  (`deadlineScheduler`), rescuer rời/mất điều kiện → rescue đóng và đi tiếp đường phá sản bình thường (không deadlock).
  Client chỉ gửi `rescueId`; amount/creditor luôn do queue của server quyết định.

## Snapshot, protocol, persistence

- `SOCKET_PROTOCOL_VERSION = 11`, `ROOM_SNAPSHOT_SCHEMA_VERSION = 10`. Migration `011_lobby_seats_v10.sql` thêm `Player.teamSlot` và
  `boardState.seatSwapRequests: []` (xem [Persistence](../Persistence/README.md)); migration `010_teamplay_v9.sql` nâng snapshot
  v8 (xem [Persistence](../Persistence/README.md)); helper TS `upgradeRoomSnapshotV8ToV9` tương đương SQL và được test so
  sánh với mẫu snapshot lịch sử. Các file SQL là tài liệu lịch sử, không chạy trong runtime hiện tại.
- `assertTeamState` (trong `assertRoomSnapshot`) validate: Solo không có team match state; 2v2 màu = màu đội, lobby
  không có match state, `slotOrder` 4 người xen kẽ, `boardState.players` = `slotOrder` lọc người còn sống, windows hợp lệ
  (người bị loại thật, đồng đội còn sống, chưa hồi sinh, `turnsRemaining` 1–5), winner/`winningTeamId` nhất quán,
  rescue khớp `planEmergencyRescue`.
- Trong một đời host, RAM giữ `teams`, `teamPlay`, `winningTeamId`, `PaymentQueue.rescue` và deadline absolute;
  `recoverRoomIfDue` xử lý deadline quá hạn khi command tiếp theo chạy. Khi host process dừng, toàn bộ phòng và token hết hiệu lực.

## Giới hạn đã biết

- Cờ 3D trên bàn chưa vẽ mascot chủ ô; thông tin chủ ô/đội nằm ở hover card, deed, modal và accessible label.
- `minimumSupportedVersion` của updater giữ `1.0.0`; nâng lên là quyết định phát hành của chủ sản phẩm.
