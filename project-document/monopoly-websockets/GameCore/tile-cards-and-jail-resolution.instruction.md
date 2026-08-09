# Tile, card và jail resolution

## Phạm vi và code nguồn

- Tile/card/jail game-domain logic: `apps/server/src/game/tiles.ts`.
- Bail/jail-card handlers: `apps/server/src/socket/jail.ts`.
- Board/decks: `packages/shared/src/tileState.ts`, `packages/shared/src/chanceCards.ts`, `packages/shared/src/chestCards.ts`.

## Exports/functions

- `checkOwned(state, playerId, currentTile, payRent)`: unowned → bật `canBuyProp`; owner khác → gọi rent callback rồi `nextTurn`; own tile → `nextTurn`.
- `applyCard(state, playerId, card)`: áp dụng money/player transfer/jail-card/movement/jail effects và ghi log.
- `resolveTile(state, playerId, diceResult)`: dispatch theo `tileType`.
- `handleJailRoll(state, playerId, dice)`: xử lý roll khi player đang jail rồi chuyển turn.

## Hành vi theo tile

- `normal`: unowned chờ mua/đấu giá; owner khác trả `streetRent`; mortgaged rent bằng 0.
- `expense`: trừ `tile.rent` vào bank rồi chuyển turn.
- `railroad`: rent `25 * 2^(số railroad không mortgage của owner - 1)`.
- `company`: một utility = `diceResult * 4`, đủ cả index 12 và 28 = `diceResult * 10`; mortgaged không thu rent.
- `gojail`: chuyển về index 10, `isJail = true`, reset `jailRounds`, chuyển turn.
- `jail`: chỉ visiting nếu player không ở trạng thái jail khi đáp ô.
- `chance`/`chest`: chọn ngẫu nhiên card, apply rồi chuyển turn.
- `start`, `parking` và default: không có hiệu ứng thêm, chỉ chuyển turn.

## Card mutations

- `reward`/`penalty` cộng/trừ balance với bank.
- `collectFromEachPlayer` và `payEachPlayer` chuyển tiền với mọi active player khác.
- `getOutOfJailFree` tăng counter trên player.
- `goToJail` đặt tile 10/jail state.
- `moveToTile` gán index tuyệt đối; `moveBy` dùng modulo 40.
- Ghi `card.message` vào game log sau khi apply.

## Jail mutations và guards

- Roll double thoát jail và tiến bằng tổng dice.
- Sau hai lượt thất bại (`jailRounds === 2` ở lần roll kế tiếp), player tự thoát và tiến.
- Roll không double trước mốc trên chỉ tăng `jailRounds`.
- `pay bail`: current jailed player, balance ít nhất 50; trừ 50, clear jail state nhưng chưa chuyển turn.
- `use jail card`: current jailed player có ít nhất một card; giảm counter, clear jail state nhưng chưa chuyển turn.

## Caveat AS-IS

- Card `moveToTile`/`moveBy` không resolve tiếp tile đích. Jail escape bằng dice cũng không gọi `resolveTile`; sau đó turn chuyển ngay.
- Card movement không tự thưởng pass-GO; deck phải ghi `reward` nếu cần trả tiền.
- Deck chọn random có hoàn lại; không giữ thứ tự/deck state.
- Railroad/utility/jail dùng index hard-code; thay board order phải sửa đồng thời.
- `pay bail` và `use jail card` không tự roll hoặc next turn; player được giải phóng rồi dùng roll bình thường.
- Player-to-player card transfer có thể làm balance âm; bankruptcy được xử lý khi caller gọi `nextTurn` sau card.

## Consumers và liên kết chéo

- Board/card data: [`../Shared/board-and-card-data.instruction.md`](../Shared/board-and-card-data.instruction.md).
- Property rent: [`property-economy.instruction.md`](property-economy.instruction.md).
- Jail Socket API: [`../Api/socket-jail.instruction.md`](../Api/socket-jail.instruction.md).
- Client turn/jail UI: [`../Client/turn-actions.instruction.md`](../Client/turn-actions.instruction.md).

## Kiểm thử khi sửa

- Unit hiện có cover street/railroad/utility/tax/go-to-jail resolution, card effects, relative wrap và ba nhánh jail roll.
- Chưa có automation cho deck selection, bail/jail-card Socket guards, broadcast hoặc behavior “không resolve tile đích”.
- Thực hiện [`../testcase/turn-movement-buy-and-jail.md`](../testcase/turn-movement-buy-and-jail.md) và [`../testcase/shared-contracts-and-board-data.md`](../testcase/shared-contracts-and-board-data.md).
- Chạy `pnpm typecheck`, `pnpm lint`, `pnpm test`.
