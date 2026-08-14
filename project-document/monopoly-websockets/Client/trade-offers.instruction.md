# TradeBundle và durable private offers

## Trade model

- `TradeBundle` có `offered` và `requested`; mỗi side gồm money, property IDs và
  jail-free Card IDs. Không trao đổi trực tiếp Nhà/Khách Sạn.
- UI chọn chỉ authoritative assets của mỗi bên, format money VNĐ. Server derive
  actor/owner và revalidate lúc create/accept.
- Tài sản có công trình tuân theo guard transfer hiện hành của server; client không
  tự suy diễn group rule hay giá trị tài sản.

## Direct bilateral offer

1. Player mở chi tiết tài sản của người khác và gửi canonical offered/requested bundle.
2. Success ACK trả unique `offerId` và authoritative `expiresAt`.
3. Owner nhận offer riêng tư; accept/decline chỉ dùng `{offerId}`.
4. Server reload canonical persisted terms, revalidate participants/assets/funds/debt,
   apply `VOLUNTARY` transfer once rồi resolve offer.

Offer row/PostgreSQL và 20-second absolute expiry là authority. Resume trả pending
offers liên quan; offer cùng tài sản vẫn được định danh bằng ID. Expiry/leave hủy
đúng một lần và private events không xuất hiện trong public state.

## Tests

- Money/property/card bundle create/accept và invalid duplicate/not-owned assets.
- Spoof/replay/cross-room/expiry/multiple offer/private routing.
- Restart/resume/expiry và failed commit atomicity.
