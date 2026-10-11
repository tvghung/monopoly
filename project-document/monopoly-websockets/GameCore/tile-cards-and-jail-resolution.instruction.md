# Tile, card deck và jail resolution

## Code nguồn

- Domain resolution: `apps/server/src/game/tiles.ts`.
- Bail/jail-card transport: `apps/server/src/socket/jail.ts`.
- Canonical board/cards: `packages/shared/src/tileState.ts`, `chanceCards.ts`,
  `chestCards.ts`.
- Private deck state: room snapshot `DeckState` trong room aggregate (RAM; mất khi host process thoát).

## Tile behavior

- `normal`: unowned → `TurnInfo.pendingPropertyDecision` mua/không mua; owner khác
  → enqueue rent claim; own tile → same-landing development decision when eligible.
- `expense`: thuế **thu tiền**. Index 4 Income Tax dùng `expenseRate: 0.3` và thu `floor(max(0, currentCash) * 0.3)`; index 38 Luxury Tax vẫn dùng `expenseAmount: 100` trong
  `packages/shared/src/tileState.ts`. Khoản thu tạo `DebtClaim` `source: { kind: 'TAX', tileID }` với creditor Bank qua cùng `PaymentQueue` như
  tiền thuê và thẻ phạt: đủ tiền thì trừ ngay (`MONEY_TRANSFER` lý do `TAX`), thiếu thì vào luồng thiếu hụt (bán tài sản,
  tự bán khi hết hạn, phá sản nếu hết tài sản). Thuế bằng 0 không mở hàng đợi nợ. Không ai khác nhận tiền thuế và Bãi Đỗ Xe không gom tiền thuế.
- `railroad`/`company`: áp rent trong property-economy instruction.
- `gojail`: direct index 10, reset jail opponent-round progress, không thưởng Xuất Phát.
- `jail`: landing bình thường là “Thăm Tù”.
- `chance`/`chest`: rút top card từ đúng draw pile authoritative trong aggregate.
- `start` và `parking`: không có jackpot/effect; Bãi Đỗ Xe không nhận thuế/phạt.

Tile/card resolution không tự handoff. Khi card destination và mọi claim/pending
action hoàn tất, caller dùng `completeTurnResolution`.

## GameCard và DeckState

- Mỗi card có stable `cardId`, source deck và typed effect; message player-facing
  là tiếng Việt, không chứa địa danh/currency/ngữ cảnh Monopoly tiếng Anh.
- New game shuffle mỗi deck server-side một lần; authoritative order được giữ
  trong private `DeckState` của aggregate (RAM):

```text
GamePrivateState.decks.chance.drawPile: GameCardId[]
GamePrivateState.decks.chest.drawPile: GameCardId[]
Player.heldJailFreeCardIds: GameCardId[]
```

- Card thường rút top, resolve rồi xuống cuối cùng deck. Jail-free card rời draw
  pile khi được giữ; khi dùng, transfer về Bank hoặc holder bị loại thì card quay
  lại cuối đúng source deck.
- Exact pile order/next card không thuộc public DTO. Public state chỉ chiếu thông
  tin holder/card-count cần cho UI.
- Card movement tới destination phải áp pass-Xuất-Phát đúng effect và tiếp tục
  resolve tile đích; `goToJail` là ngoại lệ direct-jail. Movement chain có guard để
  không resolve/handoff hai lần.
- Card money/multi-player transfer tạo ordered `DebtClaim`, không mutate balance âm
  hoặc iterate Player theo object-key order.
- Card REVEALED ở lại ít nhất 3 giây trên mỗi client. UI bắt đầu tính khi thẻ đã được vẽ; nút Đóng có countdown và server từ chối lệnh sớm.
  Bot giữ nguyên ước lượng chuyển động rồi chờ thêm 3 giây. Mốc này ở RAM, không cần chờ client chậm/ngắt kết nối và không đổi snapshot/protocol.

## Jail simplified rules

Ba cách xử lý lượt tù:

1. Trả `BAIL_AMOUNT=25` units bail trực tiếp nếu đủ tiền, rồi roll bình thường.
2. Dùng held jail-free `cardId`, trả card về đúng deck, rồi roll bình thường.
3. Roll doubles để ra tù và di chuyển; không extra roll.

- Doubles ở tù: clear jail, di chuyển bằng roll, resolve tile; không extra roll.
- Failed roll tự động kết thúc lượt. Event `wait in jail` tương thích cũ cũng kết
  thúc lượt nhưng không còn là action hiển thị trong client. Authoritative
  `jailOpponentRoundsElapsed` tăng khi lượt đi qua người đang bị tù. Lần đến thứ hai
  tự động ra tù trước khi hành động.
- Player trong tù vẫn có thể nhận rent và quản lý property khi các
  domain guard khác cho phép.

## Tests

- Deck initialization/order/draw/rotate, hidden public state và exact order giữ trong snapshot (reconnect cùng host process).
- Jail-free removal/return/use/transfer/elimination theo source deck.
- Card movement/pass-GO/destination resolution/card-to-jail.
- Bail trực tiếp, jail-free card, doubles escape, failed-roll auto-handoff và
  compatibility wait; không có third-fail
  forced-bail hay stored-dice continuation.
- Income Tax thu 30% tiền hiện có, làm tròn xuống; Luxury Tax vẫn thu 100; zero Income Tax không tạo claim; shortfall / phá sản vẫn theo payment pipeline và chỉ khoản thực thu đi vào Bank. Bãi Đỗ Xe no-op.
- Card không thể đóng trước 3 giây theo giờ server; local countdown, bot pacing và observer queue giữ đủ thời gian đọc dù tốc độ/reduced-motion thay đổi hoặc server đã clear state.
  save failure không publish partial resolution.
- Số luật hiển thị cho người chơi (hệ số Công Ty, tiền thuê Ga, vòng chờ tù, thưởng Xuất Phát...) khớp `rules.ts`
  (`apps/server/src/rulesContract.test.ts`).
