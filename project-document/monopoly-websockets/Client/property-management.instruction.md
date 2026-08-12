# Property detail, buildings và mortgage

## Entry/data

Inline detail mở khi click tile trên Board `/`; không route/permission key.
`BackOfCard.tsx` đọc canonical `tileState`, public ownership/building/mortgage,
stable `playerId` và typed command functions.

## Presentation

- Tên/type/color/price/base rent/rent tiers/build cost/mortgage derive từ shared
  data; labels/tooltips/actions tiếng Việt và mọi amount dùng formatter VNĐ.
- Hiển thị `ĐÃ CẦM CỐ`, 1–4 Nhà, Khách Sạn, số Nhà/Khách Sạn Bank còn lại và
  contention status khi relevant.
- Owner sees Xây/Bán Nhà/Cầm Cố/Chuộc/Giao Dịch; non-owner sees offer action;
  spectator/reconnecting không thấy mutation.

## Mirrored guards

- Build: full group, even, no group mortgage, funds, inventory; Khách Sạn chỉ khi
  mọi tile group có 4 Nhà. Contended final unit chuyển sang auction UI.
- Sell: reverse-even, half cost; hotel downgrade cần Bank còn 4 Nhà.
- Mortgage: toàn group không còn building; unmortgage cost principal +10%.
- Transfer/listing/offer disabled khi color group còn building. Mortgaged transfer
  disclosure nêu 10% interest due immediately; server is authority.

Client guard chỉ là UX. Domain revalidates inventory/reserved unit/ownership/debt
inside serialized durable command; failure giữ card/state và hiện ACK tiếng Việt.

## Tests

- Canonical data/money/labels; owner/non-owner/spectator actions.
- Even build/sell, 4 Nhà→Khách Sạn, derived 32/12 inventory/contention.
- Entire-group mortgage guard, unmortgage +10%, mortgaged transfer disclosure.
- Revision/reconnect/save-failure consistency.
