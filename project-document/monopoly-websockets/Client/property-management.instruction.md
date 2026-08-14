# Property detail, buildings và mortgage

## Entry/data

Inline detail mở khi click tile trên Board `/`; không route/permission key.
`BackOfCard.tsx` đọc canonical `tileState`, public ownership/building/mortgage,
stable `playerId` và typed command functions.

## Presentation

- Tên/type/color/price/base rent/rent tiers/build cost/mortgage derive từ shared
  data; labels/tooltips/actions tiếng Việt và mọi amount dùng formatter VNĐ.
- Hiển thị `ĐÃ CẦM CỐ`, 1–4 Nhà hoặc Khách Sạn và payment-shortfall gross/net
  proceeds khi relevant.
- Owner sees Xây/Bán Nhà/Cầm Cố/Chuộc/Giao Dịch; non-owner sees offer action;
  spectator/reconnecting không thấy mutation.

## Mirrored guards

- Development: render only the server-provided landing decision and operation ID.
- Sell: changed tile, half cost; no inventory/even-building client rule.
- Mortgage: target tile has no building; unmortgage cost principal +10%.
- Transfer/listing/offer disabled khi color group còn building. Mortgaged transfer
  disclosure nêu 10% interest due immediately; server is authority.

Client guard chỉ là UX. Domain revalidates landing level/ownership/debt inside the
serialized durable command; failure giữ state và hiện ACK tiếng Việt.

## Tests

- Canonical data/money/labels; owner/non-owner/spectator actions.
- Landing development prompt, skip/build/hotel operations and forced-sale values.
- Entire-group mortgage guard, unmortgage +10%, mortgaged transfer disclosure.
- Revision/reconnect/save-failure consistency.
