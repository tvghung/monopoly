# Property detail, buildings và forced sale

## Entry/data

Inline detail mở khi click tile trên Board `/`; không route/permission key.
`BackOfCard.tsx` đọc canonical `tileState`, public ownership/building,
stable `playerId` và typed command functions.

## Presentation

- Tên/type/color/price/base rent/rent tiers/build cost derive từ shared data; labels,
  tooltips/actions tiếng Việt và mọi amount dùng formatter VNĐ.
- Hiển thị 1–4 Nhà hoặc Khách Sạn; payment-shortfall chỉ hiển thị gross forced-sale
  value do server chiếu.
- Owner thấy hành động Bán Nhà khi phù hợp; non-owner thấy hành động mở TradeBundle
  trực tiếp; spectator/reconnecting không thấy mutation.

## Mirrored guards

- Development: render only the server-provided landing decision and operation ID.
- Sell: changed tile, half cost; no inventory/even-building client rule.
- Direct trade: modal chọn tiền, tài sản và thẻ của chính người gửi; server derive
  actor/owner và revalidate lúc tạo/chấp nhận offer.
- Forced sale: debtor chỉ có thể bán cho Bank hoặc gửi proposal cho một buyer đang
  hoạt động; buyer accept/reject theo proposal ID.

Client guard chỉ là UX. Domain revalidates landing level/ownership/debt inside the
serialized durable command; failure giữ state và hiện ACK tiếng Việt.

## Tests

- Canonical data/money/labels; owner/non-owner/spectator actions.
- Landing development prompt, skip/build/hotel operations và forced-sale gross value.
- Direct bilateral offer selection, private card identity và stale/reconnect behavior.
- Revision/reconnect/save-failure consistency.
