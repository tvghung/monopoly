# Checklist — 2v2 Teamplay (protocol 10, snapshot 9)

Luật và trạng thái: [../GameCore/team-play.instruction.md](../GameCore/team-play.instruction.md). Mỗi dòng dưới đây trỏ tới file test
thật; dòng `[PG]` cần `TEST_DATABASE_URL` và bị skip nếu thiếu. Hàng `[MANUAL-E2E]` chưa tick vì chưa có người quan sát.
Manual UAT: SKIPPED BY RELEASE DECISION for 1.3.0. Mobile E2E and visual capture are also non-blocking for this release.

## Lobby, đội và appearance

- [x] `[SOCKET]` `socket.teamplay.integration.test.ts` › "2v2 lobby": join chia xen kẽ và mọi phòng bắt đầu ở Solo với đội mặc định; chỉ
  host đổi mode, chỉ ở lobby, mode đổi thật reset Ready của mọi người; sang 2v2 áp màu đội; mascot trùng đồng đội bị xóa; lệnh team chỉ
  chạy khi mode là 2v2.
- [x] `[SOCKET]` cùng file: đổi màu đội chỉ thành viên đội mình, từ chối màu đội kia, chỉ reset Ready đội đó; hai lựa chọn màu đồng thời
  được room executor xếp thứ tự (đúng một đội thắng màu); tên đội chỉ host, qua `sanitizeName`, không reset Ready.
- [x] `[SOCKET]` cùng file: swap chỉ host, màu mới theo đội mới, chỉ hai người bị reset Ready, mascot giữ nếu còn hợp lệ và bị xóa nếu trùng
  đồng đội mới; appearance 2v2 từ chối `color` và mascot trùng đồng đội nhưng cho đội kia trùng; Solo giữ nguyên.
- [x] `[SOCKET]` cùng file: start 2v2 chỉ khi đúng 4 người, mỗi đội 2, ready và có mascot; từ chối < 4 và 3v1.
- [x] `[CLIENT]` `components/Lobby.teamplay.test.tsx`: control Solo/2v2 chỉ host, hai vùng đội, tên đội (Enter/Escape/trống/20 ký tự), màu đội và
  màu bị khóa, luồng đổi chỗ (chọn, chọn đối tác, Escape/Hủy/bấm lại, không draggable), mascot đồng đội bị khóa, lý do start.
  `components/lobby/startReadiness.test.ts` (lý do 2v2), `App.test.tsx` › "lobby team commands" (payload gửi đi và lỗi ACK hiển thị).

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
- [x] `[AUTO]` › "revive": đúng ba cơ hội của người sống sót (kể cả lượt tù và lượt bị bỏ qua), không tính lượt của người khác hoặc lượt đang chạy khi
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

- [x] `[AUTO]` `rooms.teamplay.test.ts`: schema v9 là phiên bản hiện tại, round-trip JSON, `assertTeamState` từ chối state hỏng (màu, slot, window, winner,
  rescue), `upgradeRoomSnapshotV8ToV9` không mutate input và cho snapshot hợp lệ, chia đội khi join, public projection của team/revive/rescue.
  `persistence/migrations.test.ts` (checksum/thứ tự 010).
- [x] `[PG]` `socket.teamplay.postgres.integration.test.ts`: migration SQL 010 giống hệt helper TS trên PostgreSQL thật; ván 2v2 + revive window +
  rescue offer sống qua restart server trên cùng database. `socket.integration.test.ts` chạy chuỗi migration đến 010 và aggregate version.
- [x] `[AUTO]` `services/deadlineScheduler.test.ts`: rescue hết hạn được recover như decline; `config.test.ts` (`EMERGENCY_RESCUE_TIMEOUT_MS`);
  `rulesContract.test.ts`: các số 2v2 trong `rules.ts` (150/200, 750/300/3, 4 người, 20 chữ, 30 giây) và mặc định `emergencyRescueTimeoutMs` khớp server, bonus
  Solo do `streetRent` thật tính.

## Client hiển thị

- [x] `[CLIENT]` `deedCardModel.test.ts`, `PropertyDeedCard.test.tsx`, `TileOwnerHoverCard.test.tsx`, `tileAccessibility.test.ts`: dòng bonus đủ khu, chip đội,
  quan hệ, pip theo chủ, hover card chỉ 2v2, nhãn truy cập.
- [x] `[CLIENT]` `DecisionSheets.test.tsx` (Team Investment copy, gợi ý nhóm theo đội), `activityText.test.ts`, `TeamChip.test.tsx`, `PlayerPortfolioModal.test.tsx`.
- [x] `[CLIENT]` `howToPlay/model.test.ts`, `HowToPlay.test.tsx`: chương "Chơi đội 2v2" đọc số từ `rules.ts`; bonus đủ khu thay cho câu cũ.
- [x] `[CLIENT]` Design Lab (`design-lab/surfaces`): `lobby-2v2-host`, `lobby-2v2-guest`, `lobby-2v2-incomplete`, `development-team-investment`, `revive-offer`,
  `rescue-offer`, `rescue-waiting`, `winner-team` (đã liệt kê trong `e2e/visual/captures.ts`, `surfaceCaptures.test.ts` giữ hai danh sách khớp) và kịch bản UAT
  `teams-2v2`/`teams-revive` (HUD bốn card theo đội, người phá sản có thể hồi sinh) trên bàn cờ thật. Đã xem bằng Browser pane ở desktop và 812×375: lobby không tràn ngang,
  hai ghế mỗi đội xếp chồng trong landscape thấp.
- [x] `[CLIENT]` `PresentationController.test.ts`: người được hồi sinh xuất hiện lại trong `LIVE_UPDATE` thì snap, không dựng animation.
- [ ] `[MANUAL-E2E]` Lobby 2v2 trên desktop và điện thoại ngang (hai vùng đội, đổi chỗ bằng bàn phím, reduced motion), một ván 2v2 đầy đủ có hồi sinh và cứu
  trợ trên thiết bị thật, đọc lại tiếng Việt của chương "Chơi đội 2v2", và mascot chủ ô trên cờ 3D (chưa có).
