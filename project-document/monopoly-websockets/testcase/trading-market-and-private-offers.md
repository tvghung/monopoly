# Checklist — open market và private offers

## Nguồn hành vi

- [`../Api/socket-trading.instruction.md`](../Api/socket-trading.instruction.md)
- [`../Client/trading-market.instruction.md`](../Client/trading-market.instruction.md)
- State/payload: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Code: `apps/server/src/socket/trading.ts`, `apps/client/src/components/MarketPlace.tsx`, `apps/client/src/components/dashboard/SellPrompts.tsx`, `useIncomingOffers.ts`.

## Coverage hiện tại

- `[MISSING-AUTO]` Không có unit/integration tests cho trading handlers; toàn bộ checklist hiện là manual hoặc automation cần bổ sung.

## Checklist

### Open market

- [ ] `[MANUAL]` Chỉ socket owner mới list được property; `playerId` trong payload không thay actor.
- [ ] `[MANUAL]` Price `<= 0` hoặc `NaN` không tạo listing; listing hợp lệ giữ seller id/name, tile name và price.
- [ ] `[MANUAL]` Chỉ seller xóa được listing; xóa ghi log và broadcast.
- [ ] `[MANUAL]` Buyer không mua listing của chính mình; buyer thiếu tiền không transfer và có log.
- [ ] `[MANUAL]` Sale hợp lệ cộng tiền seller, trừ buyer, đổi owner id/color, xóa listing, check bankruptcy/turn và broadcast.
- [ ] `[AS-IS CAVEAT]` Listing không cấm property có house hoặc mortgaged; transfer giữ các field này.

### Private offer

- [ ] `[MANUAL]` `make offer` luôn thay `playerId` client bằng `socket.id` trước khi emit targeted event tới current owner.
- [ ] `[MANUAL]` Chỉ owner hiện tại được accept/decline; buyer phải còn active khi accept.
- [ ] `[MANUAL]` Buyer không còn đủ tiền lúc accept: không transfer, log affordability và broadcast.
- [ ] `[MANUAL]` Accept hợp lệ chuyển money/owner id/color, xóa open listing cùng tile, emit `offer accepted` cho buyer và broadcast room.
- [ ] `[MANUAL]` Decline hợp lệ chỉ emit `offer declined` cho buyer, không mutate property/money.

## Negative/edge cases cần khóa trước khi sửa

- [ ] `[AS-IS CAVEAT]` Private offer không có explicit guard `price > 0`/finite. Negative hoặc `NaN` có thể đảo chiều/corrupt balance nếu owner accept; không được ghi tài liệu rằng server đã reject.
- [ ] `[AS-IS CAVEAT]` Open-market handler đọc `tileState[tileID].streetName` trước range validation; out-of-range payload có thể gây exception.
- [ ] `[AS-IS CAVEAT]` `Infinity` thỏa guard list `price > 0`, dù buyer bình thường không afford được.
- [ ] `[MISSING-AUTO]` Hostile payloads: negative, fractional, `NaN`, `Infinity`, out-of-range tile id, stale owner và disconnected buyer.
- [ ] `[MISSING-AUTO]` Hai buyer mua cùng listing gần đồng thời chỉ có một transfer thành công.
- [ ] `[MISSING-AUTO]` Offer targeted event không rò sang room/socket khác.

## Regression commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; cần Socket.IO integration test để chuyển các case quan trọng thành `[AUTO-EXISTING]`.
