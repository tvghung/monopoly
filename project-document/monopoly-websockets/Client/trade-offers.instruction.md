# TradeBundle và private offers (RAM của host)

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
- 2v2: giao dịch không đổi luật; `TeamChip` ("Đội <tên> · Đồng đội/Đối thủ") hiện cạnh người gửi trong `OfferCard` và cạnh người nhận trong
  `TradeOfferModal`, chỉ để nhận biết.
- Số tiền đã gõ trong `TradeOfferModal` sống qua các lần Board render lại: form chỉ reset khi **ID ô** mục tiêu (hoặc người nhận) đổi,
  không phải khi object mục tiêu được dựng lại (`tradeTileId` trong `apps/client/src/components/dashboard/TradeOfferModal.tsx`).
  CURRENT DEVELOPMENT (vNext, unreleased; sửa lỗi trong commit 1937a73); test "TradeOfferModal typed amounts" trong
  `apps/client/src/components/dashboard/TradeOfferModal.test.tsx`.
- `IncomingOffers` (`Modal` `lg`, không có nút đóng; đóng khi người nhận đang nợ vì `DebtPanel` đã hiển thị offer): mỗi offer là một `region` đặt tên bằng "Đề nghị từ <tên>", hai bên là chip tài sản,
  chip hết hạn; "Chấp nhận"/"Từ chối" được mô tả bằng tiêu đề offer để phân biệt khi có nhiều offer; offer đầu tiên nhận focus.

## Direct bilateral offer

1. Player mở chi tiết tài sản của người khác và gửi canonical offered/requested bundle.
2. Success ACK trả unique `offerId` và authoritative `expiresAt`.
3. Owner nhận offer riêng tư; accept/decline chỉ dùng `{offerId}`.
4. Server đọc lại terms canonical của offer trong RAM, revalidate participants/assets/funds/debt,
   apply `VOLUNTARY` transfer once rồi resolve offer.

Offer record trong RAM và 20-second absolute expiry là authority khi host process sống. Resume trả pending
offers liên quan; offer cùng tài sản vẫn được định danh bằng ID. Expiry/leave hủy
đúng một lần và private events không xuất hiện trong public state.

Offer chỉ nằm trong RAM của process host: host thoát là mọi offer mất cùng phòng; resume chỉ trả lại pending offers khi
process host đó vẫn sống. `make offer` mang `requestId` (UUID mới cho mỗi đề nghị, `apps/client/src/App.tsx` thêm vào payload; protocol 13, CURRENT
DEVELOPMENT) nên server idempotent: emit gửi lại trả đúng `offerId` ban đầu và không tạo thêm đề nghị
([socket-trading](../Api/socket-trading.instruction.md)). Released v1.7.0 không có `requestId`: mỗi emit tạo một `offerId` mới.
Client vẫn không tự gửi lại sau ACK timeout (resume/resync trước); một đề nghị mới là một lần gửi mới với `requestId` mới.

## Tests

- Money/property/card bundle create/accept và invalid duplicate/not-owned assets.
- Spoof/replay/cross-room/expiry/multiple offer/private routing.
- Resume (khi process host còn sống)/expiry và failed commit atomicity; host process exit làm mất offer, không khôi phục.
