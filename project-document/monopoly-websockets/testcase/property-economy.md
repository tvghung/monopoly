# Checklist — property economy

## Nguồn hành vi

- [`../GameCore/property-economy.instruction.md`](../GameCore/property-economy.instruction.md)
- [`../Api/socket-building.instruction.md`](../Api/socket-building.instruction.md)
- [`../Client/property-management.instruction.md`](../Client/property-management.instruction.md)
- [`../Shared/board-and-card-data.instruction.md`](../Shared/board-and-card-data.instruction.md)

## Coverage hiện tại

- `[AUTO-EXISTING]` Pure logic rent/build/sell/mortgage/unmortgage được cover trong `apps/server/src/game.test.ts`.
- `[MISSING-AUTO]` Chưa có Socket integration/client interaction tests.

## Checklist

### Ownership và rent

- [ ] `[AUTO-EXISTING]` Full group chỉ true khi cùng owner giữ mọi tile trong `colorGroups`.
- [ ] `[AUTO-EXISTING]` Single street thu base rent; unbuilt monopoly thu double; built street dùng đúng `rentTiers[houses - 1]`.
- [ ] `[AUTO-EXISTING]` Mortgaged property thu 0 rent.
- [ ] `[MANUAL]` Rent transfer trừ tenant/cộng owner và ghi log đúng tile/amount.

### Build/sell

- [ ] `[AUTO-EXISTING]` Không full group, tile không buildable hoặc group có mortgage đều không xây.
- [ ] `[AUTO-EXISTING]` Xây chỉ trên tile đang ở group minimum; trừ đúng house cost; level 5 là hotel; không vượt 5.
- [ ] `[AUTO-EXISTING]` Không đủ balance không mutate và có affordability log.
- [ ] `[AUTO-EXISTING]` Bán chỉ từ tile ở group maximum, giảm một level và hoàn `floor(houseCost/2)`.
- [ ] `[MANUAL]` Client enable/disable/title của Build/Sell phản ánh state server; server vẫn là authority khi emit giả mạo.

### Mortgage

- [ ] `[AUTO-EXISTING]` Mortgage tile không có house trả `floor(price/2)` và set flag.
- [ ] `[AUTO-EXISTING]` Tile đang có house không mortgage được.
- [ ] `[AUTO-EXISTING]` Unmortgage trừ `ceil(price/2*1.1)`; thiếu tiền không mutate.
- [ ] `[MANUAL]` Build/sell/mortgage/unmortgage từ non-owner không mutate nhưng room vẫn có thể nhận update giống state cũ.
- [ ] `[AS-IS CAVEAT]` Server chỉ kiểm tra house trên tile muốn mortgage, không bắt buộc toàn color group hết house.
- [ ] `[AS-IS CAVEAT]` Owner có thể quản lý property ngoài lượt và trước game start; handler chỉ chặn khi winner đã tồn tại.

## Transfer/edge cases

- [ ] `[MANUAL]` Private/open-market transfer giữ `houses`/`mortgaged` của `OwnedProp`; auction purchase luôn tạo 0/not mortgaged.
- [ ] `[MISSING-AUTO]` House counts vẫn even sau chuỗi build/sell trên group 2 và 3 tile.
- [ ] `[MISSING-AUTO]` Full-group rent khi một tile khác trong group mortgaged được khóa bằng test AS-IS trước khi sửa rule.
- [ ] `[MISSING-AUTO]` Winner guard ngăn bốn building events mutate.

## Regression commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` khi đổi property card UI/shared board data.
