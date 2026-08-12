# Turn, doubles, payment, bankruptcy và reconnect recovery

## Scope

- Dice/movement: `apps/server/src/game/dice.ts`.
- Turn continuation: `apps/server/src/game/turn.ts`; `PaymentQueue`:
  `apps/server/src/game/payment.ts`; bankruptcy/winner:
  `apps/server/src/game/bankruptcy.ts`.
- Socket orchestration: `apps/server/src/socket/turn.ts`.
- Deadline/restart: room command boundary và deadline scheduler.

## Start và turn order

- Lobby vẫn yêu cầu 2–7 active Player đều connected/ready và host start.
- Mỗi Player bắt đầu tại index `0` với 1500 game units.
- Khi start, server roll 2d6 cho mọi Player; nhóm đồng hạng cao nhất reroll tới khi
  có một người thắng. Người thắng đứng đầu persisted turn order; không thêm pre-game
  client event hoặc tin dice từ client.
- Mọi roll/order/log được commit cùng transition `LOBBY → IN_PROGRESS` trước ACK.

## Movement và doubles

- Server roll hai dice độc lập `1..6`. Đi qua hoặc đáp index `0` nhận 200 units;
  direct-to-jail không nhận thưởng.
- `doublesStreak` thuộc current turn, reset khi handoff hoặc vào tù.
- Doubles lần 1/2 vẫn di chuyển và resolve toàn bộ tile/card/payment/buy/auction.
  Sau khi không còn blocking state, `completeTurnResolution` trả `EXTRA_ROLL` và
  giữ cùng current Player với `hasMoved=false`.
- Doubles lần 3 đưa thẳng Player tới index `10`, không di chuyển theo roll, reset
  streak và kết thúc lượt.
- Doubles dùng để ra tù không tạo extra roll.
- Successful `completeTurnResolution(state, continuation)` trả
  `EXTRA_ROLL | ADVANCE_TURN`; blocker/stale continuation hoặc internal
  `NO_TURN_CHANGE` completion trả `null` và không handoff. Buy decision được biểu
  diễn bằng `TurnInfo.pendingPropertyDecision`; payment, property/building auction
  và Bank queue nhúng `PendingTurnContinuation` cho tới khi resolution xong.
- Internal resume kind: `COMPLETE_TURN` hoàn tất roll đang chờ;
  `MOVE_STORED_DICE` tiếp tục bằng dice đã persist; `NO_TURN_CHANGE` hoàn tất Bank
  auction do non-current forfeit mà không handoff current Player không liên quan.

## PaymentQueue và DebtClaim

Mọi khoản phải trả đi qua `PaymentQueue`, không trừ âm rồi auto-remove.
`PaymentQueue.orderedClaims` giữ thứ tự ổn định cùng `activeClaimIndex`,
`continuation` và absolute `actionDeadlineAt`. Mỗi `DebtClaim` có các trường
settlement bắt buộc:

```text
debtorPlayerId
creditor: 'PLAYER' | 'BANK'
creditorPlayerId?   // bắt buộc khi creditor = PLAYER
amount
remainingAmount
source
```

Implementation được phép bổ sung `claimId` để idempotency và optional `status` để
validate/recovery, nhưng không thay đổi các trường settlement trên.

- Queue giữ thứ tự claim theo vòng Player ổn định và `activeClaimIndex`; các card
  collect/pay-each-player không phụ thuộc object-key iteration.
- Chỉ active claim được settle. Tiền có sẵn chuyển ngay; phần còn lại giữ
  `remainingAmount`, khóa roll/turn handoff nhưng vẫn cho debtor bán building, cầm
  cố và thực hiện giao dịch hợp lệ.
- Trong lúc queue còn active, không chạy live auction hoặc cho bất kỳ Player nào
  bid/spend vào gameplay khác; Bank property queue chỉ bắt đầu sau khi debt queue
  đã hoàn tất.
- Sau mỗi action thanh lý, payment tiếp tục từ active claim; claim đủ tiền được
  remove/advance đúng một lần. Không có phantom ACK/broadcast nếu save thất bại.
- Player explicit xác nhận phá sản khi không thể/không tiếp tục thanh lý. GameCore
  không tự suy diễn một private trade tương lai sẽ xảy ra.

## Bankruptcy và forfeit

- Nợ PLAYER: transfer tiền còn lại, property (kể cả mortgage) và held jail-free
  card cho `creditorPlayerId` theo `BANKRUPTCY_TO_PLAYER`; không release tài sản
  thành unowned. Recipient xử lý mortgage interest theo property rule.
- Nợ BANK: buildings trả Bank, mortgage clear, jail-free cards trở lại đúng deck;
  property đi theo board index vào durable `BankPropertyAuctionQueue`, rồi auction
  từng tài sản theo `RETURN_TO_BANK`/`BANK_AUCTION_AWARD`.
- Nếu debtor của active claim explicit leave: PLAYER creditor dùng cùng
  bankruptcy-to-player pipeline; BANK creditor dùng Bank pipeline. Chỉ khi không có
  active player-creditor debt mới surrender-to-Bank.
- Finished reason giữ `BANKRUPT | LEFT`; forfeit không đổi nhãn thành bankruptcy dù
  cleanup dùng Bank pipeline.
- Cleanup hủy listing/private offer liên quan, reconcile active auction/queue và
  giữ mọi stable-ID reference hợp lệ.
- Player cuối cùng còn active trở thành `winner` đúng một lần; room chuyển
  `FINISHED`, clear live pending/deadline/auction state nhưng không đổi winner ID.

## Disconnect/restart

- Offline current Player giữ persisted `{turnNumber, playerId, deadlineAt}`; default
  grace 60 giây. Reconnect trước expiry giữ chính xác doubles, pending
  decision/continuation, payments, deck/auction và current turn.
- Active auction/payment resolution không bị generic grace callback skip. Khi grace
  hết, buy wait trở thành property auction; các state khác dùng explicit recovery
  policy và không tăng jail attempt nếu không có roll.
- Recovery callback phải match operation/turn/deadline dưới room lock + CAS; commit
  trước ACK/broadcast và không apply hai lần sau restart/race.

## Tests

Xem [turn testcase](../testcase/turn-movement-buy-and-jail.md),
[bankruptcy testcase](../testcase/game-status-bankruptcy-and-winner.md),
[auction testcase](../testcase/auction.md) và PostgreSQL restart suite.
