# Game board và canonical tile presentation

## Entry/code

Board nằm tại `/` cho activated Player hoặc Spectator. Code chính:
`Board.tsx`, `Tile.tsx`, `BackOfCard.tsx`, stepped-position/card-flip contexts và
styles. Không có detail route hay permission key.

## Canonical data

- Map đúng 40 tile index từ `packages/shared/src/tileState.ts`; mapping tiếng Việt
  nằm tại [Shared board data](../Shared/board-and-card-data.instruction.md).
- Board face và property detail derive name/type/color/price/rent tiers/house cost/
  mortgage value từ shared tile. `BoardInitState.ts`/`backOfCards.ts` không còn là
  metadata source.
- Presentation-only icon/orientation được map theo `tileType`/index; không hard-code
  English label. Index 17 là Khí Vận, 20 Bãi Đỗ Xe, 28 Công Ty Nước.
- Center branding, alt/title/tooltip và status là “Cờ Tỷ Phú Việt Nam”/tiếng Việt.

## State/rendering

- Ownership, mortgage, buildings, player position và pending landing/payment state từ
  committed `PublicRoomState`; stable IDs điều khiển token/owner.
- Level 1–4 render Nhà; level 5 render Khách Sạn. Forced-sale gross/net values come
  from the public shortfall projection; không client-counter.
- Tất cả amounts dùng shared client money formatter VNĐ.
- Exact deck order/next card không có trong public state hoặc DOM.

## Motion/turn UX

- Token presentation có thể trễ authoritative position; normal move tối đa 12 bước,
  pass 39→0 đúng. Jail/teleport/backward dùng explicit animation/snap behavior.
- Buy/development/payment/turn marker đợi token settled. The marker remains until
  the committed landing/payment resolution is complete; doubles never extra-roll.
- Reconnect snapshot không replay mutation/animation timer; reduced-motion vẫn dùng
  state settlement đúng.
- Spectator/reconnecting thấy board nhưng không có mutation action.

## Tests

- Exact 40 Vietnamese tiles, canonical derivation và không English board labels.
- Owner/mortgage/house/hotel/inventory/token update theo revision.
- Normal/pass-GO/jail/card movement; buy/development/payment settlement.
- Card flip, outside close, multiple token, reduced-motion, reconnect/no-duplicate.
