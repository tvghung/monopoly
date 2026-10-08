# Checklist — 2v2 Teamplay (protocol 11, snapshot 10)

Luật và trạng thái: [../GameCore/team-play.instruction.md](../GameCore/team-play.instruction.md). Mỗi dòng dưới đây trỏ tới file test
thật. Các dòng `[PG]` lịch sử đã ngừng áp dụng sau khi chuyển sang RAM; hàng `[MANUAL-E2E]` chưa tick vì chưa có người quan sát.
Manual UAT: SKIPPED BY RELEASE DECISION for 1.3.0, and not performed for 1.4.0. Mobile E2E and visual capture are also non-blocking for these releases.

## Lobby, đội và appearance

- [x] `[SOCKET]` `socket.teamplay.integration.test.ts` › "2v2 lobby": join chia xen kẽ và mọi phòng bắt đầu ở Solo với đội mặc định; chỉ
  host đổi mode, chỉ ở lobby, mode đổi thật reset Ready của mọi người; sang 2v2 áp màu đội; mascot trùng đồng đội bị xóa; lệnh team chỉ
  chạy khi mode là 2v2.
- [x] `[SOCKET]` cùng file: đổi màu đội chỉ thành viên đội mình, từ chối màu đội kia, chỉ reset Ready đội đó; hai lựa chọn màu đồng thời
  được room executor xếp thứ tự (đúng một đội thắng màu); tên đội: mọi thành viên chỉ đổi được tên đội mình (host cũng vậy, payload không có `teamId`), qua
  `sanitizeName`, không reset Ready.
- [x] `[SOCKET]` cùng file: appearance 2v2 từ chối `color` và mascot trùng đồng đội nhưng cho đội kia trùng; Solo giữ nguyên; không có ghế thứ ba trong một đội.
- [x] `[SOCKET]` cùng file: start 2v2 chỉ khi đúng 4 người, mỗi đội 2, ready và có mascot; từ chối < 4 (không còn 3v1 vì mỗi đội chỉ có 2 ghế).
- [x] `[SOCKET]` `socket.lobbySeats.integration.test.ts` › "2v2 lobby seats": ghế của bốn người vào phòng và public projection; `move to seat` sang ghế trống của đội
  kia (màu mới, mascot trùng bị xóa, chỉ người di chuyển mất Ready) và của đội mình (không đổi gì ngoài ghế); từ chối ghế đã có người/ghế của mình/Solo/ván đã bắt
  đầu; hai lệnh đồng thời vào một ghế chỉ một lệnh thắng; `request seat swap` chưa di chuyển ai, chỉ người được xin mới trả lời được, đồng ý đổi cả hai ghế (màu, Ready
  cả hai, mascot trùng), đổi chỗ đồng đội không reset Ready; mỗi người một yêu cầu mở, từ chối/hủy; yêu cầu vô hiệu khi một bên di chuyển, rời, bị mời ra, đổi mode, bắt
  đầu ván; người kết nối lại vẫn thấy yêu cầu; ghế quyết định thứ tự lượt; Play Again xếp lại hai ghế mỗi đội. `teamLobby.test.ts`: các hàm thuần (thứ tự ghế,
  chuẩn hóa ghế, di chuyển/đổi chỗ, dọn yêu cầu).
- [x] `[SOCKET]` cùng file › "removing a player from the lobby": `kick player` chỉ host, chỉ ở sảnh (Solo và 2v2), không tự mời mình, không mời người lạ; ghế được giải phóng,
  session bị thu hồi (token cũ `SESSION_REVOKED`), kết nối của người bị mời nhận `removed from room` và không còn quyền gửi lệnh, người offline vẫn mời được, và họ vào lại
  được bằng mã phòng vào đúng ghế vừa trống.
- [x] `[CLIENT]` `components/Lobby.teamplay.test.tsx`: control Solo/2v2 chỉ host, hai vùng đội, tên đội (Enter/Escape/trống/20 ký tự), màu đội và
  màu bị khóa, mascot đồng đội bị khóa, lý do start. `components/lobby/startReadiness.test.ts` (lý do 2v2).
- [x] `[CLIENT]` `components/Lobby.teamplay.test.tsx` › "Lobby seat cells": đúng hai ô mỗi đội theo thứ tự ghế, ghế trống nằm đúng ô của nó (một thành viên ở ghế 1 đứng sau ô
  trống), ghế trùng lấy ô trống đầu và không ai bị ẩn. "Lobby seat swap controls": nút đổi chỗ ở mọi ghế trừ ghế của chính mình; "Chuyển sang chỗ trống N của đội <tên>" gọi
  `onMoveToSeat(teamId, teamSlot)` (kể cả ghế còn lại của đội mình); "Đổi chỗ với <tên>" gọi `onRequestSeatSwap(targetPlayerId)`; host có đúng nút như khách; không có nút ở
  Solo hoặc khi người xem không có ghế; tất cả bị khóa khi `busy`.
- [x] `[CLIENT]` cùng file › "pending seat swap": "Đang chờ <tên> trả lời" kèm Hủy chỉ cho người xin; "Yêu cầu đổi chỗ đã kết thúc." khi yêu cầu biến mất mà ghế không đổi (không báo khi
  đổi thật, tự hủy hay bị thay). "seat swap request for the viewer": `alertdialog` trung tâm "<tên> muốn đổi chỗ với bạn", chữ hệ quả cho cùng đội và khác đội, Đồng ý/Từ chối/Escape gọi
  `onRespondSeatSwap(requesterPlayerId, accept)`, tự đóng khi phòng bỏ yêu cầu, yêu cầu cũ nhất trước, không hiện cho người khác hay cho người xin đã rời, nút khóa khi `busy`.
- [x] `[CLIENT]` cùng file › "Lobby kick" (và `Lobby.test.tsx` › "Lobby kick (Solo)"): dấu ✕ chỉ host và không bao giờ ở ghế của host, nhãn "Mời <tên> ra khỏi phòng", hộp xác nhận trước,
  `onKickPlayer(playerId)` chỉ sau "Mời ra", Hủy và Escape không gửi gì, câu hỏi tự đóng khi người đó rời, khóa khi `busy`, không dùng `window.confirm`. "Lobby team name and colour":
  chỉ đội của người xem có ô sửa tên (host không sửa tên đội kia, khách sửa đội mình); `onSetTeamName(name)` chỉ mang tên.
- [x] `[CLIENT]` `App.test.tsx` › "App 2v2 lobby commands": payload `set game mode {mode}`, `set team name {name}`, `set team color {color}`, `move to seat {teamId, teamSlot}`,
  `request seat swap {targetPlayerId}`, `cancel seat swap` (chỉ ACK), `respond seat swap {requesterPlayerId, accept}`, `kick player {playerId}`; trạng thái chờ chỉ hiện khi phòng liệt kê yêu cầu;
  lỗi ACK hiện ở `.lobby__error`; khối "being removed by the host": màn hình lỗi riêng, session bị xóa, không resume lại, về form vào phòng, về launcher trên desktop, gỡ listener khi unmount.
- [x] `[CLIENT]` `design-system/components/ConfirmationDialog/ConfirmationDialog.test.tsx`: tone nguy hiểm/trung tính, `aria-describedby`, handler, `busy` khóa cả hai nút, Escape và nút đóng.
- [x] `[CLIENT]` cửa sổ hồi sinh 5 lượt: `RevivePanel.test.tsx`, `game/team/teamView.test.ts`, `game/ui/hud/activityText.test.ts`, `game/ui/property/PlayerPortfolioModal.test.tsx` và `howToPlay/model.test.ts`
  theo `REVIVE_WINDOW_SURVIVOR_TURNS` ("Còn 5 lượt" xuống "Cơ hội cuối").

## Lượt chơi, tiền thuê, Team Investment

- [x] `[AUTO]` `game/teamplay.test.ts` › "alternating turn order": `A1,B1,A2,B2` bất kể ai đi trước, từ chối chia lệch, thứ tự giữ sau loại.
  `[SOCKET]` "alternates the teams in the persisted turn order".
- [x] `[AUTO]` `game/teamplay.test.ts` › "colour-set rent": Solo ×1,5 làm tròn xuống và nhân theo tier xây, khu chia đôi không có bonus, 2v2 ×2 theo đội
  (mọi cách chia, một người giữ cả khu, không ×2 khi chia với đối thủ), không bao giờ khóa xây Nhà, đối thủ thật sự trả tiền nhân. `v3.simplifiedRules.test.ts`
  giữ Solo.
- [x] `[AUTO]` › "railroad and utility aggregation": Ga/Công Ty cộng theo đội ở 2v2, Solo theo cá nhân, đối thủ không vào số đếm.
- [x] `[AUTO]` › "teammate rent exemption and Team Investment": đồng đội miễn thuê (street/Ga/Công Ty), đối thủ vẫn trả; decision cho người dừng chân kèm
  hotel; không có decision khi không đủ tiền một cấp hoặc trên Ga/Công Ty/đối thủ; bán công trình hoàn tiền cho chủ ô, người đầu tư không bán được.
  `[SOCKET]` "Team Investment" (người dừng chân trả, giữ chủ) và "never lets an opponent answer…".
- [x] `[AUTO]` › "cards still include teammates": thẻ "trả/thu mỗi người" vẫn tính đồng đội.

## Phá sản, hồi sinh, Emergency Rescue, thắng

- [x] `[AUTO]` › "individual bankruptcy and team elimination" và "explicit leave": phá sản từng người (tài sản về Bank), đội kia thắng ngay khi đội này hết
  active, thắng đội gồm cả người đã bị loại/đang có window, leave tường minh không mở window và 1v2 vẫn chơi tiếp.
- [x] `[AUTO]` › "revive": đúng năm cơ hội của người sống sót (lượt thứ 6 của họ là hết hạn) (kể cả lượt tù và lượt bị bỏ qua), không tính lượt của người khác hoặc lượt đang chạy khi
  window mở, 750K/300K/Xuất Phát/không tài sản/không thẻ, về đúng slot cũ và không có lượt thưởng, từ chối khi thiếu tiền/payment mở/ngoài lượt,
  cho phép khi còn quyết định mua/phát triển, mỗi người một lần, chỉ người sống sót của đội. `[SOCKET]` hồi sinh/từ chối/người bị loại chỉ xem + chat/
  leave tường minh không bao giờ hồi sinh.
- [x] `[AUTO]` › "Emergency Rescue": chỉ sau khi hết tài sản, phải đủ toàn bộ phần còn lại (không cứu một phần), trả thẳng cho creditor/Bank và không chạm ví
  người nợ, claim nợ chính rescuer không tốn tiền và không có cứu miễn phí, decline/hết hạn/rescuer rời/debtor rời → phá sản bình thường, chạy tiếp hàng đợi,
  hoàn tất lượt qua cùng continuation. `[SOCKET]` accept/decline/expire (scheduler) và restart giữa offer.
- [x] `[CLIENT]` `RescuePanel.test.tsx`, `RevivePanel.test.tsx`, `game/team/teamView.test.ts`, `PlayerCardList.test.tsx`/`playerCardSelectors.test.ts` (nhãn "Có thể hồi sinh",
  "Còn N lượt", "Cơ hội cuối", "Đã bị loại vĩnh viễn"), `WinnerBanner.test.tsx` (thắng đội, thành viên đã bị loại, "Đội đối thủ").
- [x] `[SOCKET]` "team win, then Play Again…": Play Again giữ mode/tên/màu/phân đội, xóa revive/win, host vẫn đổi mode.

## Snapshot, migration, persistence

- [x] `[AUTO]` `rooms.teamplay.test.ts`: schema v10 là phiên bản hiện tại, round-trip JSON, `assertTeamState` từ chối state hỏng (màu, slot, window, winner,
  rescue, hai người một ghế, yêu cầu đổi chỗ ngoài sảnh 2v2/trùng người xin/người không còn trong sảnh), `upgradeRoomSnapshotV8ToV9` và
  `upgradeRoomSnapshotV9ToV10` không mutate input và cho snapshot hợp lệ (ghế theo thứ tự vào phòng, không quá ghế 1), chia đội và chọn ghế khi join, public projection của
  team/ghế/revive/rescue. SQL migrations 010 và 011 chỉ còn là tài liệu lịch sử.
- [x] `[RAM]` Host giữ state 2v2 trong cùng process; restart host xóa phòng, ghế, rescue và token. Bằng chứng restart nằm trong packaged host proof.
- [x] `[AUTO]` `services/deadlineScheduler.test.ts`: rescue hết hạn được recover như decline; `config.test.ts` (`EMERGENCY_RESCUE_TIMEOUT_MS`);
  `rulesContract.test.ts`: các số 2v2 trong `rules.ts` (150/200, 750/300/5, 4 người, 20 chữ, 30 giây) và mặc định `emergencyRescueTimeoutMs` khớp server, bonus
  Solo do `streetRent` thật tính.

## Client hiển thị

- [x] `[CLIENT]` `deedCardModel.test.ts`, `PropertyDeedCard.test.tsx`, `TileOwnerHoverCard.test.tsx`, `tileAccessibility.test.ts`: dòng bonus đủ khu, chip đội,
  quan hệ, pip theo chủ, hover card chỉ 2v2, nhãn truy cập.
- [x] `[CLIENT]` `DecisionSheets.test.tsx` (Team Investment copy, gợi ý nhóm theo đội), `activityText.test.ts`, `TeamChip.test.tsx`, `PlayerPortfolioModal.test.tsx`.
- [x] `[CLIENT]` `howToPlay/model.test.ts`, `HowToPlay.test.tsx`: chương "Chơi đội 2v2" đọc số từ `rules.ts`; bonus đủ khu thay cho câu cũ.
- [x] `[CLIENT]` Design Lab (`design-lab/surfaces`): `lobby-2v2-host`, `lobby-2v2-guest`, `lobby-2v2-incomplete`, `lobby-2v2-second-seat`, `lobby-2v2-swap-pending`, `lobby-2v2-swap-request`, `lobby-kick-confirm`, `development-team-investment`, `revive-offer`,
  `rescue-offer`, `rescue-waiting`, `winner-team` (đã liệt kê trong `e2e/visual/captures.ts`, `surfaceCaptures.test.ts` giữ hai danh sách khớp) và kịch bản UAT
  `teams-2v2`/`teams-revive` (HUD bốn card theo đội, người phá sản có thể hồi sinh) trên bàn cờ thật. Đã xem bằng Browser pane ở desktop và 812×375: lobby không tràn ngang,
  hai ghế mỗi đội xếp chồng trong landscape thấp.
- [x] `[CLIENT]` `PresentationController.test.ts`: người được hồi sinh xuất hiện lại trong `LIVE_UPDATE` thì snap, không dựng animation.
- [ ] `[MANUAL-E2E]` Lobby 2v2 trên desktop và điện thoại ngang (hai vùng đội, đổi chỗ bằng bàn phím, reduced motion), một ván 2v2 đầy đủ có hồi sinh và cứu
  trợ trên thiết bị thật, đọc lại tiếng Việt của chương "Chơi đội 2v2", và mascot chủ ô trên cờ 3D (chưa có).
