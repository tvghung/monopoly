# Trading Socket instruction

## Phạm vi AS-IS

Đây là Socket event module tương đương controller cho open market và private property offers.

- Socket.IO path: `/socket.io` mặc định.
- Namespace: `/` mặc định.
- Function đăng ký: `registerTradingHandlers(io, socket)`.
- Handler: `apps/server/src/socket/trading.ts:6-133`.
- Contract payload: `packages/shared/src/types.ts:142-177` và `packages/shared/src/events.ts:29-34`.

## Auth và permission

Không có auth hoặc permission key ở module/action. Quyền thực thi được kiểm tra theo state và `socket.id`:

| Action | Guard nghiệp vụ hiện tại |
|---|---|
| `put on open market` | Sender còn là active player, property tồn tại và `owned.id === socket.id`, `price > 0`. |
| `remove sale` | Listing tồn tại và `listing.seller === socket.id`. |
| `make sale` | Listing và buyer tồn tại; buyer không phải seller; buyer đủ balance. |
| `make offer` | Buyer lấy từ `socket.id` và còn là player; property có owner. Client-supplied `playerId` bị overwrite. |
| `decline offer` | Sender vẫn là owner hiện tại của `tileID`. |
| `accept offer` | Sender vẫn là owner; buyer `playerId` còn tồn tại và đủ balance theo `price` nhận trong event. |

## Action, service/mutation và outbound

| Inbound event | Mutation/service chính | Outbound |
|---|---|---|
| `put on open market(SaleInfo)` | Tạo/ghi đè `openMarket[tileID]` gồm seller từ socket, price, sellerName, tileName. | `update` tới room. |
| `remove sale(item)` | `Number(item)`, xóa listing, ghi log. | `update` tới room. |
| `make sale(item)` | Validate buyer; cộng tiền seller nếu còn player, trừ buyer, đổi owner/color, xóa listing, `checkBalance(state, true)`. | `update` tới room. |
| `make offer(OfferInfo)` | Không lưu offer server-side; lấy buyer authoritative từ socket và gửi offer trực tiếp cho owner. | `offer on prop` tới owner. |
| `decline offer(Offer)` | Xác nhận current owner, lấy ownerName. | `offer declined` tới `playerId` trong offer. |
| `accept offer(Offer)` | Chuyển tiền, đổi owner/color, xóa listing cùng tile nếu có, `checkBalance(state, true)`. | `offer accepted` tới buyer, rồi `update` tới room. |

## Code liên quan

| Concern | Code thật |
|---|---|
| Socket handler | `apps/server/src/socket/trading.ts:6-133` |
| Balance/bankruptcy | `apps/server/src/game/turn.ts:4-43` |
| Tile names/prices | `packages/shared/src/tileState.ts` |
| Trade payload types | `packages/shared/src/types.ts:142-177` |
| Client emit wrappers | `apps/client/src/App.tsx:21-27` |
| Open market UI | `apps/client/src/components/MarketPlace.tsx:5-49` |
| Private offer local timer/listeners | `apps/client/src/components/dashboard/useIncomingOffers.ts:6-60` |

## Caveat cần giữ đúng khi sửa

- TypeScript event types không validate runtime payload. Module không dùng schema validator.
- `put on open market` đọc `tileState[tileID].streetName` trước owner guard; tile ID ngoài mảng có thể gây lỗi runtime.
- Server chỉ check `price > 0` cho listing; UI `min=20` không phải server rule. Không có integer/finite/range check rõ ràng.
- Private offer không được lưu server-side. Countdown 20 giây chỉ là local Client state; accept/decline không kiểm tra offer tồn tại hoặc đã hết hạn.
- `accept offer` tin `playerId`, `price` và `tileName` do owner gửi lại; code không chặn giá âm/NaN hoặc fabricated offer.
- `decline offer` cũng dùng target `playerId` và display fields từ payload, sau khi chỉ xác nhận ownership của `tileID`.
- Transfer chỉ đổi `ownedProps[tile].id` và `.color`; `houses` và `mortgaged` được giữ nguyên.
- Listing không cấm property có houses hoặc đang mortgaged.
- Mọi failure chủ yếu `return` im lặng; không ACK/error event.

## Liên kết chéo

- Client trading: [`../Client/trading-market.instruction.md`](../Client/trading-market.instruction.md)
- Client property actions: [`../Client/property-management.instruction.md`](../Client/property-management.instruction.md)
- GameCore property economy: [`../GameCore/property-economy.instruction.md`](../GameCore/property-economy.instruction.md)
- GameCore bankruptcy: [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md)
- Shared contract: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Testcase: [`../testcase/trading-market-and-private-offers.md`](../testcase/trading-market-and-private-offers.md), [`../testcase/property-economy.md`](../testcase/property-economy.md)

## Quy tắc sửa và kiểm thử

Khi sửa module này phải kiểm tra:

- Owner/non-owner list/remove; invalid tile ID; zero/negative/fractional/NaN/infinite price.
- Buy listing của chính seller, buyer thiếu tiền, seller disconnect và listing/property thay owner trước purchase.
- Room isolation và đúng target cho ba private events.
- Client-spoofed `playerId` trong `make offer` vẫn bị server overwrite.
- Accept/decline sau khi owner hoặc buyer thay đổi; fabricated/expired/duplicate offer.
- Transfer property có houses/mortgage/listing và balance/bankruptcy side effects.
- Nếu thêm server-side offer store/token/expiry, cập nhật state schema, Shared contract, Client hook, GameCore và testcase trong cùng thay đổi.
