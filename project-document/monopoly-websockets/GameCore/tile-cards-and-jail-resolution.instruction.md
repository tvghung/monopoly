# Tile, card deck và jail resolution

## Code nguồn

- Domain resolution: `apps/server/src/game/tiles.ts`.
- Bail/jail-card transport: `apps/server/src/socket/jail.ts`.
- Canonical board/cards: `packages/shared/src/tileState.ts`, `chanceCards.ts`,
  `chestCards.ts`.
- Private durable deck state: room snapshot `DeckState`.

## Tile behavior

- `normal`: unowned → `TurnInfo.pendingPropertyDecision` mua/đấu giá; owner khác →
  enqueue rent claim; own tile → complete resolution.
- `expense`: index 4 trả 200, index 38 trả 75 cho BANK qua `PaymentQueue`.
- `railroad`/`company`: áp rent trong property-economy instruction.
- `gojail`: direct index 10, reset doubles/jail attempts, không thưởng Xuất Phát.
- `jail`: landing bình thường là “Thăm Tù”.
- `chance`/`chest`: rút top card từ đúng durable draw pile.
- `start` và `parking`: không có jackpot/effect; Bãi Đỗ Xe không nhận thuế/phạt.

Tile/card resolution không tự handoff. Khi card destination và mọi claim/pending
action hoàn tất, caller dùng `completeTurnResolution`.

## GameCard và DeckState

- Mỗi card có stable `cardId`, source deck và typed effect; message player-facing
  là tiếng Việt, không chứa địa danh/currency/ngữ cảnh Monopoly tiếng Anh.
- New game shuffle mỗi deck server-side một lần; authoritative order được persist
  trong private `DeckState`:

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

## Jail Standard Mode

Ba cách thoát trước/một phần roll:

1. Trả 50 units bail qua claim BANK, rồi roll bình thường.
2. Dùng held jail-free `cardId`, trả card về đúng deck, rồi roll bình thường.
3. Roll doubles trong tối đa ba lượt thử.

- Doubles ở tù: clear jail, di chuyển bằng roll, resolve tile; không extra roll.
- Fail attempt 1/2: tăng persisted `jailRounds`, kết thúc lượt.
- Fail attempt 3: bắt buộc trả 50; sau khi claim settle, clear jail, di chuyển bằng
  chính dice result đã persist và resolve tile. Không mất dice khi debt wait/restart.
- Player trong tù vẫn có thể nhận rent, trade, auction và quản lý property khi các
  domain guard khác cho phép.

## Tests

- Deck initialization/order/draw/rotate, hidden public state và restart exactness.
- Jail-free removal/return/use/transfer/elimination theo source deck.
- Card movement/pass-GO/destination resolution/card-to-jail.
- Ba jail paths, third-fail forced bail, no-extra-roll on jail doubles.
- Tax và Bãi Đỗ Xe no-op; save failure không publish partial resolution.
