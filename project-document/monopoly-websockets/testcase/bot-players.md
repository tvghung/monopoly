# Checklist — Bot players (protocol 12, snapshot 11)

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
- [x] `[AUTOMATED]` Lệnh bất hợp lệ của bot bị từ chối như người; bot chờ khi mọi người mất kết nối; hành động đang chờ bị bỏ khi ván kết thúc và chơi lại.
- [x] `[AUTOMATED]` Người mất kết nối khi thẻ đã lật: hết grace thì thẻ được áp dụng, ghế giữ nguyên.
- [x] `[AUTOMATED]` Policy: mua/không mua, xây, tù, nợ, rescue, forced sale, offer, revive, seed tái lập, một policy offline (`bots/policy.test.ts`).
- [x] `[AUTOMATED]` CURRENT DEVELOPMENT (vNext, unreleased; commit 1937a73) — Độ khó: thiếu = MEDIUM như policy gốc, mức khó đầu tư mạnh hơn, mức cực dễ có lúc chọn sai nhưng không bao giờ mua khi thiếu tiền (`bots/policy.test.ts`); chỉ host đặt được, mức lạ bị từ chối (`socket.bots.integration.test.ts`); dropdown 5 mức chỉ hiện khi có bot, khách chỉ xem (`Lobby.test.tsx`).
- [x] `[AUTOMATED]` Retry bằng fallback, park chỉ sau fallback + 2 retry (2 s, 8 s) rồi recovery (`apps/server/src/bots/driver.ts`), ranh giới thông tin của view (`bots/driver.test.ts`).
- [x] `[AUTOMATED]` Client: ghế bot, Thêm Bot chỉ host, phòng đầy ẩn nút, Xóa Bot không hỏi, start với bot (`Lobby.test.tsx`); chip Bot trên HUD (`PlayerCardList.test.tsx`).

## Manual

- [ ] `[MANUAL-E2E]` Sảnh A1–A8 và trọn ván B1–B8, mất kết nối/chơi lại C1–C7 trong USER_MANUAL_BOT_TEST_PLAN.
- [ ] `[MANUAL-E2E]` `[NOT RUN]` CURRENT DEVELOPMENT (vNext, unreleased): chơi trọn một ván với bot ở từng mức `VERY_EASY`, `EASY`, `MEDIUM`,
  `HARD`, `VERY_HARD` (host đổi mức ở sảnh, khách chỉ xem; ghi lại hành vi mua/xây/offer và ván kết thúc không treo). NOT RUN.
- [ ] `[RELEASE]` CURRENT DEVELOPMENT: quyết định tương thích 1.7.0 ↔ vNext trước khi phát hành — `set bot difficulty` và
  Thuế Thu Nhập 150 được thêm trong protocol 12 không bump (snapshot vẫn 11); host 1.7.0 không có handler nên lệnh này không bao giờ được ACK (theo đọc code, chưa chạy thử) và
  guest 1.7.0 hiển thị thuế 200 trong khi host vNext thu 150. Bump protocol hay chấp nhận rủi ro:
  [Version history](../Shared/socket-and-state-contracts.instruction.md#version-history). NOT DECIDED.
