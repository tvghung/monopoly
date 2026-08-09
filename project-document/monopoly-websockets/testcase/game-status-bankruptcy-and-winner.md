# Checklist — game status, bankruptcy và winner

## Nguồn hành vi

- [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md)
- [`../GameCore/room-lifecycle.instruction.md`](../GameCore/room-lifecycle.instruction.md)
- [`../Client/game-status.instruction.md`](../Client/game-status.instruction.md)
- Code: `apps/server/src/game/turn.ts`, `apps/server/src/socket/player.ts`, `apps/client/src/components/dashboard/WinnerBanner.tsx`.

## Coverage hiện tại

- `[AUTO-EXISTING]` Có unit tests cho loại bankrupt player, release property, winner và solo/no-elimination không có winner.
- `[MISSING-AUTO]` Chưa có test cho disconnect-current, nhiều bankrupt cùng lượt, UI winner hoặc action sau winner.

## Checklist

- [ ] `[AUTO-EXISTING]` Balance `< 1` chuyển player sang `finishedPlayers`, xóa active player và owned property.
- [ ] `[MANUAL]` Listing mà bankrupt player là seller được xóa.
- [ ] `[MANUAL]` `boardState.players` được rebuild theo active player map sau bankruptcy.
- [ ] `[MANUAL]` Bankruptcy current player hand-off tới active player hợp lệ khi `advanceTurn` được yêu cầu.
- [ ] `[AUTO-EXISTING]` Game đã start, có ít nhất một finished player và chỉ còn một active player thì set winner `{name,color}` một lần và ghi log.
- [ ] `[AUTO-EXISTING]` Solo game chưa có ai bị loại không tự tuyên bố winner.
- [ ] `[MANUAL]` Winner banner chỉ xuất hiện khi `state.loaded` và `boardState.winner` có giá trị, hiển thị đúng name/color.
- [ ] `[AS-IS CAVEAT]` Disconnect không tạo `finishedPlayers` và không gọi `checkWinner`; hai-player game có một người disconnect có thể không có winner.
- [ ] `[AS-IS CAVEAT]` Winner không khóa mọi event; xác nhận handler nào có guard riêng thay vì giả định game globally read-only.
- [ ] `[AS-IS CAVEAT]` Finished player disconnect làm record finished bị xóa; winner đã set không bị clear.

## Negative/edge cases cần automation khi sửa

- [ ] `[MISSING-AUTO]` Hai hoặc nhiều player balance `< 1` trong một `checkBalance` không để current player id trỏ tới record đã xóa.
- [ ] `[MISSING-AUTO]` Bankrupt highest auction bidder/listing owner không để stale reference gây crash.
- [ ] `[MISSING-AUTO]` `checkWinner` idempotent: winner/log không bị ghi lại khi gọi nhiều lần.
- [ ] `[MISSING-AUTO]` Disconnect current player giữa turn và giữa auction có regression test riêng.

## Regression commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`; UI/status và disconnect vẫn cần manual/integration verification.
