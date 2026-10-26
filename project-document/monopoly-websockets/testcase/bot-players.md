# Checklist — Bot players (current protocol 14, snapshot 11; difficulty released in v1.8.0)

Rule: [GameCore/bot-players.instruction.md](../GameCore/bot-players.instruction.md). Full trace:
[ACCEPTANCE_MATRIX](../../own-the-block-vnext/ACCEPTANCE_MATRIX.md). Không test nào chơi trọn ván; trọn ván là
[USER_MANUAL_BOT_TEST_PLAN](../../own-the-block-vnext/USER_MANUAL_BOT_TEST_PLAN.md).

## Automated

- [x] `[AUTOMATED]` Thêm bot: Bot 1..3, Ready, mascot riêng, projection `kind: BOT` + `connected: true` (`socket.bots.integration.test.ts`).
- [x] `[AUTOMATED]` `requestId` lặp (tuần tự và đua) chỉ thêm một bot.
- [x] `[AUTOMATED]` Khách không thêm/xóa được bot; phòng không đổi version.
- [x] `[AUTOMATED]` Xóa bot: chỉ ghế BOT, xóa lần hai `NOT_FOUND`, `kick player` từ chối bot.
- [x] `[AUTOMATED]` Host + 3 bot: người mới `ROOM_FULL`, không đẩy bot; xóa bot thì vào được.
- [x] `[AUTOMATED]` Ghế cuối: đúng một trong join/add-bot đua nhau thắng.
- [x] `[AUTOMATED]` 2v2: bot giữ Ready + màu đội; xin đổi chỗ với bot đổi ngay; bot vào ghế host bấm.
- [x] `[AUTOMATED]` Start matrix (1H+0B từ chối, người chưa Ready, khách start, 1H+1B, 1H+3B), sau start khóa ghế, người lạ thành spectator.
- [x] `[AUTOMATED]` Host chuyển cho người, không cho bot; người cuối rời sảnh/ván thì phòng bị xóa.
- [x] `[AUTOMATED]` Chơi lại: bot Ready, người chưa, tiền reset, `matchId` mới.
- [x] `[AUTOMATED]` Snapshot JSON round trip (sảnh, đang chơi), không lưu timer; host là bot / bot chưa Ready bị từ chối.
- [x] `[AUTOMATED]` Driver: đổ một lần và mua; nhiều notify + driver thứ hai không lặp hiệu ứng; trả bail; đóng thẻ; bán tài sản rồi phá sản; nhận/từ chối offer (`socket.botDriver.integration.test.ts`).
- [x] `[AUTO]` CARD wait keeps the existing movement estimate and adds the shared 3-second revealed-card minimum; server still rejects an early bot close (`apps/server/src/bots/policy.test.ts`, `apps/server/src/game.test.ts`, `apps/server/src/socket.botDriver.integration.test.ts`).
- [x] `[AUTOMATED]` Lệnh bất hợp lệ của bot bị từ chối như người; bot chờ khi mọi người mất kết nối; hành động đang chờ bị bỏ khi ván kết thúc và chơi lại.
- [x] `[AUTOMATED]` Người mất kết nối khi thẻ đã lật: hết grace thì thẻ được áp dụng, ghế giữ nguyên.
- [x] `[AUTOMATED]` Policy: mua/không mua, xây, tù, nợ, rescue, forced sale, offer, revive, seed tái lập, một policy offline (`bots/policy.test.ts`).
- [x] `[AUTOMATED]` RELEASED v1.8.0 — difficulty defaults to MEDIUM, policy behavior for each level, and server host-only validation (`bots/policy.test.ts`, `socket.bots.integration.test.ts`).
- [x] `[AUTO][CLIENT]` Bot difficulty uses the LanguageSelector dropdown design; all five options stay localized and current, only a non-busy host can change it (`apps/client/src/components/Lobby.test.tsx`).
- [x] `[AUTOMATED]` Trước lần thử lại, driver đánh giá lại task/view hiện tại; sau một lệnh bị từ chối, driver chọn policy fallback. Test chứng minh fallback, giới hạn retry/parking và stale-task guard; không chứng minh retry chọn primary action mới từ view đã làm mới (`apps/server/src/bots/driver.ts`, `apps/server/src/bots/driver.test.ts`).
- [x] `[AUTOMATED]` Client: ghế bot, Thêm Bot chỉ host, phòng đầy ẩn nút, Xóa Bot không hỏi, start với bot (`Lobby.test.tsx`); chip Bot trên HUD (`PlayerCardList.test.tsx`).

## Manual

- [ ] `[MANUAL-E2E]` Sảnh A1–A8 và trọn ván B1–B8, mất kết nối/chơi lại C1–C7 trong USER_MANUAL_BOT_TEST_PLAN.
- [ ] `[MANUAL-E2E]` `[NOT RUN]` Manual full-game theo từng mức RELEASED v1.8.0 vẫn NOT RUN: chơi trọn một ván với bot ở từng mức `VERY_EASY`, `EASY`, `MEDIUM`,
  `HARD`, `VERY_HARD` (host đổi mức ở sảnh, khách chỉ xem; ghi lại hành vi mua/xây/offer và ván kết thúc không treo). NOT RUN.
- [x] [HISTORICAL — RELEASED v1.8.0] R-1 được xử lý bằng Socket protocol 12 → 13 vì bot difficulty và Income Tax 150 làm thay đổi contract. Strict handshake từ chối app v1.7.0 không tương thích bằng `UPGRADE_REQUIRED`. Release v1.10.0 hiện tại dùng protocol 14; assertion protocol tự động và contract validation được ghi trong [Version history](../Shared/socket-and-state-contracts.instruction.md#version-history). Chạy hai phiên bản đóng gói thật (1.7.0 ↔ hiện tại) vẫn NOT RUN.
