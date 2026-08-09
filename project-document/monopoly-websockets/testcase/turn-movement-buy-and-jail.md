# Checklist — turn, movement, buy và jail

## Nguồn hành vi

- [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md)
- [`../GameCore/tile-cards-and-jail-resolution.instruction.md`](../GameCore/tile-cards-and-jail-resolution.instruction.md)
- [`../Api/socket-turn.instruction.md`](../Api/socket-turn.instruction.md), [`../Api/socket-jail.instruction.md`](../Api/socket-jail.instruction.md)
- [`../Client/turn-actions.instruction.md`](../Client/turn-actions.instruction.md)

## Coverage hiện tại

- `[AUTO-EXISTING]` Movement/GO, tile outcomes, jail rolls và một số card effects có unit tests trong `apps/server/src/game.test.ts`.
- `[MISSING-AUTO]` Start/roll/buy/bail/jail-card authority guards và Socket broadcast chưa có integration tests.

## Checklist

### Start và roll authority

- [ ] `[MANUAL]` Start set `gameStarted`, ghi log, chọn player đầu tiên qua `nextTurn` và broadcast state.
- [ ] `[AS-IS CAVEAT]` Bất kỳ socket đã có `roomId`, kể cả spectator, có thể emit start; repeated start làm advance turn thêm lần nữa.
- [ ] `[MANUAL]` Roll bị bỏ qua nếu game chưa start, sender không phải active/current player hoặc `hasMoved` đã true.
- [ ] `[MANUAL]` Dice do server tạo, mỗi die 1–6; client không gửi dice value/current tile.
- [ ] `[MANUAL]` Nút Roll client disabled khi không đúng lượt, đã move hoặc token animation chưa settle.
- [ ] `[AUTO-EXISTING]` Move thường không trả GO bonus; wrap/landing đúng GO cộng 200 và ghi log.
- [ ] `[AS-IS CAVEAT]` Roll double không cho thêm lượt và không có rule ba double vào jail.

### Tile và buy/decline

- [ ] `[AUTO-EXISTING]` Unowned normal street set `turnInfo.canBuyProp` và chưa advance turn.
- [ ] `[MANUAL]` Unowned railroad/company đi qua cùng `checkOwned` flow và cũng chờ buy/decline.
- [ ] `[MANUAL]` Current player đủ tiền mua: trừ đúng price, tạo owner/houses 0/not mortgaged, rồi advance turn.
- [ ] `[MANUAL]` Không đủ tiền: không đổi ownership/balance, ghi log và vẫn chờ quyết định khác.
- [ ] `[MANUAL]` Non-current player, request lặp hoặc request khi `canBuyProp` false không mua được.
- [ ] `[MANUAL]` Decline hợp lệ tạo auction; xem thêm [`auction.md`](auction.md).
- [ ] `[AUTO-EXISTING]` Tax trừ balance; go-to-jail set tile 10; owned street/railroad/utility chuyển rent đúng owner.

### Jail

- [ ] `[AUTO-EXISTING]` Double thoát jail, reset rounds và tiến theo tổng dice.
- [ ] `[AUTO-EXISTING]` Hai lượt thất bại trước đó làm lần roll tiếp theo tự thả; non-double trước mốc tăng `jailRounds`.
- [ ] `[MANUAL]` Pay bail chỉ cho current jailed player, yêu cầu balance >= 50; trừ 50 và clear jail state.
- [ ] `[MANUAL]` Không đủ bail chỉ ghi log, không đổi state.
- [ ] `[MANUAL]` Use jail card chỉ cho current jailed player có counter > 0; giảm đúng một card.
- [ ] `[AS-IS CAVEAT]` Jail roll thoát và di chuyển nhưng không resolve tile đích; bail/card chỉ giải phóng rồi chờ roll.

## Negative/edge cases cần automation khi sửa

- [ ] `[MISSING-AUTO]` Hai request roll gần đồng thời từ cùng socket chỉ mutate một lần.
- [ ] `[MISSING-AUTO]` Buy payload client bị giả mạo không thể thay actor/price/tile ngoài current state.
- [ ] `[MISSING-AUTO]` Bail/card events từ spectator hoặc player khác lượt không mutate.
- [ ] `[MISSING-AUTO]` Card movement backward/teleport và jail release giữ đúng turn hand-off AS-IS.

## Regression commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, và `pnpm build` nếu sửa client turn controls/motion.
