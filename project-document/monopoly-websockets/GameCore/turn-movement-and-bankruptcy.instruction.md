# GameCore — turn, payment shortfall và forfeit v4

## Luồng lượt

- `roll dice` là server-authoritative. Server tạo 2d6, di chuyển theo index 0..39
  và resolve card/property/tile trên draft room.
- Đổ đôi chỉ là kết quả xúc xắc; không có extra roll hoặc triple-double jail.
- `completeTurnResolution` là cổng handoff duy nhất cho landing/payment/card resolution; turn-recovery hết hạn khi không còn gì chờ (`nextTurn` trong `apps/server/src/services/deadlineScheduler.ts`) và việc loại người chơi hiện tại (`removePlayerFromGame`/`checkBalance` trong `apps/server/src/game/turn.ts`) handoff trực tiếp; nó chỉ trả `ADVANCE_TURN`.
- Landing tile unowned tạo `pendingPropertyDecision` với operation ID. Landing
  property của chính người chơi tạo `pendingDevelopmentDecision` chứa level tại
  thời điểm đáp; quyết định gồm `SKIP`, xây 1..4 Nhà trong khoảng còn thiếu, hoặc
  nâng cấp Khách sạn ở level 4. Không được build lại landing cũ sau reconnect.

## Jail

- Vào tù đặt `isJail=true`, `jailOpponentRoundsElapsed=0`.
- Double giải phóng và di chuyển nhưng vẫn hoàn tất lượt; failed roll tự động
  kết thúc lượt. `wait in jail` chỉ còn là transport tương thích cũ.
- Khi handoff chạm tới seat đang bị tù, counter tăng một lần. Counter đạt 2 thì
  tự động giải phóng trước lượt của seat đó. Người chơi rời/disconnect không làm
  counter tăng ngoài handoff đã commit.
- `pay bail` dùng shared `BAIL_AMOUNT=25`, chỉ được phép khi balance đủ và trừ
  trực tiếp; không mở payment queue mới. Jail-free card giữ identity và trả về
  đúng deck khi dùng.

## Payment shortfall

- Rent/card payments tạo `PaymentQueue` gồm ordered claims, `activeClaimIndex`,
  continuation và absolute `actionDeadlineAt`.
- Trong shortfall, ordinary offer/build actions bị khóa, trừ một ngoại lệ (V1.1): người chơi khác có thể gửi đề nghị MUA tài sản
  của debtor bằng tiền (proposer chỉ đưa tiền, debtor chỉ đưa tài sản, không thẻ, không đòi tiền) và debtor có thể chấp nhận để có
  tiền trả nợ; mọi hình dạng khác vẫn bị khóa. Debtor có thể bán tài sản cho Bank hoặc gửi một forced-sale proposal cho một
  active buyer. Proposal lưu trong private snapshot và gắn operation/claim,
  property fingerprint, giá do người bán chọn (`price`, mặc định là giá Bank; số nguyên dương, buyer phải đủ tiền) và expiry
  không vượt claim deadline.
- Bank sale dùng `floor((price + investedBuildCost) * 70 / 100)` gross. Seller nhận
  gross trước khi `PaymentQueue` tiếp tục xử lý khoản nợ. Scheduler tự động bán theo
  tile index khi deadline hết, retry claims, rồi mới loại debtor khi hết tài sản.
- Forced-sale buyer trả đúng giá đã thỏa thuận (`proposal.grossPrice`), seller nhận đúng số đó và claim tiếp tục trong cùng room CAS.
- Đề nghị mua trong shortfall (V1.1): chấp nhận cần debtor là recipient đang nợ, `now < actionDeadlineAt`, tài sản không nằm trong
  forced-sale proposal đang mở; sau giao dịch server chạy `progressPaymentQueue`/`resumePaymentContinuation` như Bank sale, và nếu
  debtor vẫn không đủ trả khi hết tài sản thì bị loại (offer còn lại của debtor bị hủy). Không có event, protocol hay snapshot mới.

## 2v2: phá sản, hồi sinh, Emergency Rescue, thắng đội

- Phá sản theo từng người; đội thua ngay khi không còn active member (`checkTeamWinner`). Người phá sản (không phải bỏ cuộc) được
  mở revive window 5 lượt (`REVIVE_WINDOW_SURVIVOR_TURNS`) của đồng đội còn lại; `revive teammate` và `consumeReviveTurn` nằm trong `game/team.ts`.
- Khi người nợ hết tài sản thanh lý, `paymentResolution` mở `PaymentQueue.rescue` cho đồng đội đủ tiền (`WAITING_FOR_RESCUE`)
  trước khi tuyên bố phá sản; accept trả thẳng cho creditor, decline/hết hạn/rescuer rời → bỏ rescue và phá sản bình thường.
- Nhận xét chi tiết, thông báo lỗi và test: [team-play.instruction.md](./team-play.instruction.md).

## Forfeit/winner/recovery

- Explicit leave của active payer hủy proposal/ordinary offers, auto-liquidates
  deterministically để trả creditor rồi marks `LEFT`; tài sản còn lại trả Bank,
  không đấu giá. Leave của non-payer trả tài sản trực tiếp cho Bank.
- Winner supersedes every pending landing/payment/proposal/turn-recovery marker.
- Scheduler rechecks exact room/turn/operation/claim/deadline marker under the room
  lock; stale/replayed callbacks are no-ops.

## CURRENT DEVELOPMENT — AUDIT-010 (chưa phát hành)

Mọi loại bỏ player gọi chung phần trả thẻ held về đúng draw pile một lần trong `removePlayerRecord` tại
`apps/server/src/game/turn.ts`. Caller bankruptcy và explicit leave tiếp tục tự xử lý settlement, winner check và continuation.
Thẻ đang reveal thuộc `pendingCardInteraction` vẫn theo đường trả pending riêng. Thay đổi chỉ gom quyền sở hữu thao tác trả thẻ;
không sửa cứu nguy hay revive. Chưa có thay đổi này trong v1.10.0 đã phát hành.

## CURRENT DEVELOPMENT — AUDIT-002 (chưa phát hành)

Khi explicit leave hoặc bankruptcy loại người đang giữ lượt, server vẫn chọn successor trực tiếp từ thứ tự ghế còn sống để
không chạy lại các side effect khác của `nextTurn`; sau khi chọn, `progressJailForSelectedPlayer` dùng chung primitive với
handoff thường đúng một lần trước `resetForFreshTurn`. Seat successor đang tù có counter `0 → 1`; nếu `1 → 2`, seat được
thả tù, counter về `0` và ghi đúng một `JAIL_RELEASED/TIME_SERVED`. Counter không chạm các player khác hoặc người bị loại.
Removal non-current không tiến lượt. Winner/Game Finished được kiểm tra trước: kết thúc ván không tiến counter hoặc tạo lượt
mới. Bankruptcy theo batch cũng chọn successor một lần sau khi bỏ toàn bộ debtor đã phá sản. Tất cả sửa đổi vẫn nằm trong
draft room transaction, nên rollback không công bố turn/jail state. Held jail-free cards vẫn được trả một lần theo
`removePlayerRecord` của AUDIT-010; snapshot schema và socket protocol không đổi. Chưa có thay đổi này trong v1.10.0 đã phát hành.

## CURRENT DEVELOPMENT — Power-up rent allocation (08B)

`apps/server/src/game/payment.ts` credits A07 through `creditPaymentReceipt` on every actual receipt. The private claim holds cumulative collected/forwarded units so partial cash, forced sales, D07/D08 and rescue obey one rounding/cap calculation; no extra payer obligation is created. This private metadata is RAM snapshot 14 and is not public. Current-player removal also invokes the normal Power-up start-of-turn expiry for its successor. See [Power-up runtime](./power-ups.instruction.md) and `apps/server/src/game/powerUps/stabilization.test.ts`.
