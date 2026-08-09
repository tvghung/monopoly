# Checklist — auction

## Nguồn hành vi

- [`../GameCore/auction.instruction.md`](../GameCore/auction.instruction.md)
- [`../Api/socket-auction.instruction.md`](../Api/socket-auction.instruction.md)
- [`../Client/auction.instruction.md`](../Client/auction.instruction.md)
- Code: `apps/server/src/game/auction.ts`, `apps/server/src/socket/auction.ts`, `apps/server/src/socket/player.ts`.

## Coverage hiện tại

- `[AUTO-EXISTING]` `finalizeAuction` có unit case winning bid và no-bid.
- `[MISSING-AUTO]` Start, bid/pass, timer, disconnect và Socket broadcast chưa có automation.

## Checklist

### Start và UI state

- [ ] `[MANUAL]` Chỉ current player có `canBuyProp` mới decline; request khi auction đã tồn tại bị bỏ qua.
- [ ] `[MANUAL]` Auction bắt đầu với tile id/name/list price đúng, highest bid 0, toàn bộ active player, passed rỗng và timer 30.
- [ ] `[MANUAL]` Start auction tắt `turnInfo.canBuyProp` và broadcast modal cho cả room; spectator chỉ thấy chế độ xem.

### Bid/pass

- [ ] `[MANUAL]` Chỉ active player được bid/pass; spectator/disconnected player không mutate.
- [ ] `[MANUAL]` Bid phải finite, sau floor vẫn lớn hơn highest bid và không vượt balance.
- [ ] `[MANUAL]` Fractional bid được floor; bid floor không tăng bị reject.
- [ ] `[MANUAL]` Bid hợp lệ set bidder id/name, reset `passed`, ghi log; timer dưới 15 được reset thành 15.
- [ ] `[MANUAL]` Highest bidder không pass được; một player không bị thêm lặp vào `passed`.
- [ ] `[MANUAL]` Khi mọi người trừ highest bidder đã pass, auction kết thúc sớm.

### Timer/finalize/disconnect

- [ ] `[MANUAL]` Timer giảm mỗi giây, mỗi tick broadcast; zero clear interval và finalize đúng một lần.
- [ ] `[AUTO-EXISTING]` Highest bidder còn active nhận property houses 0/not mortgaged và bị trừ winning bid; auction clear và turn advance.
- [ ] `[AUTO-EXISTING]` Không có bid thì tile vẫn unowned, auction clear và turn advance.
- [ ] `[MANUAL]` Leader disconnect reset highest bid/passed; participant disconnect bị loại khỏi active và có thể làm auction kết thúc.
- [ ] `[MANUAL]` Room hết player clear auction interval trước khi delete.

## Negative/edge cases cần automation khi sửa

- [ ] `[AS-IS CAVEAT]` Bid không reserve funds; bidder tiêu tiền trước finalize vẫn bị trừ và có thể bankrupt sau `endAuction`.
- [ ] `[AS-IS CAVEAT]` Minimum bid bắt đầu từ 1, không từ list price.
- [ ] `[MISSING-AUTO]` Hai bid đồng thời có thứ tự server rõ ràng, chỉ highest hợp lệ cuối cùng thắng.
- [ ] `[MISSING-AUTO]` Timer không emit/finalize lần hai sau early close hoặc delete room.
- [ ] `[MISSING-AUTO]` Bankruptcy participant giữa auction không làm handler throw dù active snapshot còn id cũ.

## Regression commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` nếu đổi auction modal.
