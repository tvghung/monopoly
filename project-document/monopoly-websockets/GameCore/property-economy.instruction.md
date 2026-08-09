# Property economy

## Phạm vi và code nguồn

- Property-domain logic: `apps/server/src/game/property.ts`.
- Socket wrapper/broadcast: `apps/server/src/socket/building.ts`.
- Tile/color data: `packages/shared/src/tileState.ts`.
- Property actions UI: `apps/client/src/components/BackOfCard.tsx`.

## Exports/functions

- `ownsFullGroup(state, ownerId, color)`: owner có đủ mọi index trong `colorGroups[color]`.
- `streetRent(state, tileIndex)`: rent 0 khi không owned/mortgaged; house tier khi có nhà; double base khi full group chưa xây; còn lại base rent.
- `buildHouse(state, playerId, tileID)`: xây một level, level 5 là hotel.
- `sellHouse(state, playerId, tileID)`: bán một level, hoàn nửa house cost lấy floor.
- `mortgageProperty(state, playerId, tileID)`: nhận nửa price lấy floor.
- `unmortgageProperty(state, playerId, tileID)`: trả nửa price cộng 10%, lấy ceil.

## Guards và invariants

### Build

- Player phải tồn tại và sở hữu tile.
- Chỉ `tileType: normal` có `houseCost`/`rentTiers` và full color group mới được xây.
- Tối đa 5 level; không xây nếu bất kỳ property trong group mortgaged.
- Luật xây đều: chỉ tăng tile đang ở minimum houses của group.
- Balance phải đủ house cost; không đủ thì không mutate và có log.

### Sell

- Owner và tile có ít nhất một house level.
- Luật bán đều: chỉ giảm tile đang ở maximum houses của group.
- Refund là `floor(houseCost / 2)`.

### Mortgage

- Owner, chưa mortgage, tile đang chọn có `houses === 0`, price dương.
- Mortgaged property không thu rent.
- Unmortgage yêu cầu đủ balance; cost là `ceil(price / 2 * 1.1)`.

## Mutations

- Build/sell thay `OwnedProp.houses` và balance.
- Mortgage/unmortgage thay `OwnedProp.mortgaged` và balance.
- Mỗi mutation thành công ghi log; wrapper phát full `update` cho room.
- Ownership transfer trong trading/auction giữ object property hiện có hoặc tạo object mới tùy flow; xem testcase trading/auction.

## Caveat AS-IS

- Socket building handlers chỉ chặn khi đã có winner; không yêu cầu current turn hoặc `gameStarted`. Owner có thể quản lý property ngoài lượt khi game chưa có winner.
- Mortgage chỉ kiểm tra số nhà trên tile đang mortgage, không kiểm tra toàn bộ color group có nhà hay không.
- Không có inventory giới hạn số house/hotel của bank.
- `ownsFullGroup` dựa vào ownership, không loại group vì một tile khác đang mortgage; rent của tile không mortgage vẫn có thể dùng full-group bonus.
- Server silently returns cho phần lớn action không hợp lệ; chỉ affordability build/unmortgage ghi log.

## Consumers và liên kết chéo

- Building Socket API: [`../Api/socket-building.instruction.md`](../Api/socket-building.instruction.md).
- Tile rent resolution: [`tile-cards-and-jail-resolution.instruction.md`](tile-cards-and-jail-resolution.instruction.md).
- Client property controls: [`../Client/property-management.instruction.md`](../Client/property-management.instruction.md).
- Shared board data: [`../Shared/board-and-card-data.instruction.md`](../Shared/board-and-card-data.instruction.md).

## Kiểm thử khi sửa

- Unit hiện có cover monopoly/base/double/tier/mortgage rent, even build/sell, hotel cap, affordability, mortgage và unmortgage cost.
- Chưa có Socket integration test cho actor ownership, winner guard, broadcast hoặc action ngoài turn.
- Thực hiện [`../testcase/property-economy.md`](../testcase/property-economy.md) và các transfer case trong [`../testcase/trading-market-and-private-offers.md`](../testcase/trading-market-and-private-offers.md).
- Chạy `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` nếu đổi UI/shared data.
