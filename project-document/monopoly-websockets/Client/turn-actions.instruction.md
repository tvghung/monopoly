# Turn actions: dice, buy, payment và jail

## Authority/action gating

- Stable current `playerId` + active Player role + connected/resumed state mới được
  mutate. Spectator/reconnecting read-only; server vẫn lặp mọi guard.
- Dice, movement, starting-player roll, tile/card resolution và turn continuation
  server-authoritative. Client không gửi dice/position/doubles outcome.
- Mọi action có typed ACK; committed public revision mới đổi gameplay UI.

## Roll/doubles

- “Đổ Xúc Xắc” bật khi own turn, không có
  `TurnInfo.pendingPropertyDecision`/payment/auction blocker và token settled.
- UI render hai dice, tổng và “Đổ đôi”; không tự advance. Doubles lần 1/2 chỉ bật
  roll kế tiếp sau full resolution; lần 3 hiển thị vào tù và handoff.
- Starting-player contest được server xử lý/log trong start transaction, không thêm
  pre-game input.

## Buy/payment

- Unowned buy prompt hiển thị canonical tile/price VNĐ: “Mua” hoặc “Đấu Giá”.
  Decline tạo property auction; người decline vẫn có thể bid.
- Public active `DebtClaim` hiển thị creditor/source/remaining amount. Debtor vẫn
  được mở property management/trade để bán Nhà, cầm cố hoặc giao dịch; roll/handoff
  bị khóa.
- Chỉ debtor thấy action “Tuyên bố phá sản”; confirmation nêu rõ tài sản đi tới
  Player creditor hay Bank pipeline. UI không tự đánh dấu bankruptcy từ balance.

## Jail

- Panel tiếng Việt cung cấp trả 50.000 ₫, dùng đúng jail-free card hoặc thử doubles.
- Attempt 1/2 fail tăng counter; attempt 3 fail hiển thị forced bail rồi movement
  bằng dice đã roll sau khi payment settle.
- Jail doubles không bật extra roll. Bail/card action giải phóng rồi cho roll bình
  thường; exact card trả về source deck là server concern.

## Tests

- Wrong player/spectator/reconnecting/blocking state rejection.
- Doubles 1/2 extra roll, third doubles jail và disconnect/restart giữa extra roll.
- Buy/decline/payment liquidation/bankruptcy confirmation.
- Ba jail paths, third-fail wait/restart và no-extra-roll jail double.
- No phantom UI state on ACK/save failure.
