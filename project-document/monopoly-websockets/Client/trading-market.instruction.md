# TradeBundle, open market và durable private offers

## Trade model

- `TradeBundle` có `offered` và `requested`, mỗi side gồm money, property IDs và
  jail-free Card IDs. Không trao đổi trực tiếp Nhà/Khách Sạn.
- UI cho chọn only authoritative assets của mỗi bên, format money VNĐ và preview
  mortgage interest. Server derive actor/owner và revalidate lúc create/accept.
- Property thuộc color group còn building không được chọn cho transfer; player phải
  bán building trước.

## Open market

- Listing là trường hợp `VOLUNTARY` price-for-property đơn giản; seller từ
  authenticated actor. Buy/remove revalidate listing, ownership, balance, building,
  mortgage interest và active debt state trong một transaction.
- Mortgaged transfer giữ mortgage; buyer trả 10% mortgage value ngay cho Bank qua
  payment rule, rồi normal unmortgage vẫn là principal +10%.

## Durable private offer

1. Buyer gửi canonical offered/requested bundle, không gửi actor/owner.
2. Success ACK trả unique `offerId` + authoritative `expiresAt`.
3. Owner nhận private offer; accept/decline chỉ dùng `{offerId}`.
4. Server reload canonical persisted terms, revalidate participants/assets/funds/
   building/mortgage/debt, apply `VOLUNTARY` transfer once rồi resolve offer.

Offer row/PostgreSQL và 20-second absolute expiry là authority. Resume trả pending
offers relevant; same-tile offers key by ID. Expiry/leave cancels exactly once và
private events không xuất hiện trong public state.

## Tests

- Money/property/card bundle create/accept và invalid duplicate/not-owned assets.
- Group-building guard; mortgaged transfer + immediate interest.
- Spoof/replay/cross-room/expiry/multiple offer/private routing.
- Restart/resume/expiry and failed commit atomicity.
