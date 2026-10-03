# TradeBundle và durable private offers

## Trade model

- `TradeBundle` có `offered` và `requested`; mỗi side gồm money, property IDs và
  jail-free Card IDs. Không trao đổi trực tiếp Nhà/Khách Sạn.
- UI chọn chỉ authoritative assets của mỗi bên, format money VNĐ. Server derive
  actor/owner và revalidate lúc create/accept.
- Tài sản có công trình tuân theo guard transfer hiện hành của server; client không
  tự suy diễn group rule hay giá trị tài sản.

## UI

- `TradeOfferModal` (`Modal` `xl`): hai cột "Bạn giao"/"Bạn nhận", mỗi cột có ô tiền (kèm số tiền đã định dạng bên cạnh), chip `PropertyDeedCard` chọn được cho từng tài sản và
  thẻ Thoát Tù, và một dòng tóm tắt "Bạn giao … · Bạn nhận …". Cột xếp chồng trên điện thoại dọc; **ngoại lệ có chủ ý**: điện thoại ngang
  (`max-height: 31rem`) giữ hai cột để thấy cả hai bên cùng lúc.
- `OfferCard` là thẻ một offer nhận được (người gửi, hai bên là chip tài sản, đếm ngược, "Chấp nhận"/"Từ chối"), dùng chung bởi
  `IncomingOffers` và `DebtPanel` (V1.1: người đang nợ trả lời đề nghị mua ngay trong dialog nợ).
- `IncomingOffers` (`Modal` `lg`, không có nút đóng; đóng khi người nhận đang nợ vì `DebtPanel` đã hiển thị offer): mỗi offer là một `region` đặt tên bằng "Đề nghị từ <tên>", hai bên là chip tài sản,
  chip hết hạn; "Chấp nhận"/"Từ chối" được mô tả bằng tiêu đề offer để phân biệt khi có nhiều offer; offer đầu tiên nhận focus.

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
