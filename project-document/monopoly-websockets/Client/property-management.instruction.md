# Property detail, buildings và forced sale

## Entry/data

`PropertyInspectionModal` mở khi click tile trên Board `/` (hoặc nút ô tương ứng); không route/permission key.
`buildDeedCardModel` (`game/ui/property/deedCardModel.ts`) đọc canonical `tileState`, public ownership/building,
stable `playerId` và derive mọi dòng của thẻ; `PropertyDeedCard` (`full`/`compact`/`chip`) chỉ vẽ model đó.

## Deed card, inspection và portfolio

- `PropertyDeedCard`: street (dải màu district + bảng tiền thuê 0–5 Nhà với dòng hiện tại `aria-current`), nhà ga, tiện ích,
  và ô đặc biệt (header giấy trung tính, quy tắc ô). Header dùng màu district chỉ để định danh tài sản, chassis giữ trung tính.
  Tiền thuê nhóm đầy đủ chỉ là ghi chú quy tắc (client không tính nhân đôi — giới hạn đã ghi nhận).
- `PropertyInspectionModal` (`Modal` `md`, `headerAccent` = màu district): thẻ đầy đủ + footer hành động (`Bán Nhà` với lý do khi bị
  khóa, `Đề nghị mua`); không đánh dấu "Sau khi xây". Escape/outside click/focus return như trước.
- `OwnedPropertiesControl` → "Tài sản của tôi" (`Modal` `lg`): tóm tắt (số dư authoritative, số tài sản/nhà/khách sạn) + deed compact
  nhóm theo district. `PlayerPortfolioModal` mở từ player card HUD, chỉ đọc.
- `DebtPanel` bán tài sản qua deed compact; xem [turn-actions.instruction.md](./turn-actions.instruction.md).

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
