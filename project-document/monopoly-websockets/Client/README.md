# Mục lục frontend Client

## Phạm vi

Thư mục này là mục lục chi tiết cho frontend React/Vite tại `apps/client`. Frontend hiện tại là một SPA realtime dùng Socket.IO, không có router, sidebar/menu, cơ chế đăng nhập, permission key hoặc REST service phía client. Hai view cấp cao được chuyển bằng local state `joined` trong `apps/client/src/App.tsx`, không chuyển bằng URL.

URL chuẩn để truy cập ứng dụng là `/`. Ở production, Express trả cùng `index.html` cho các GET không khớp static asset, nhưng frontend không đọc pathname; không được diễn giải các pathname đó thành route nghiệp vụ.

## Quy ước

- `Menu`: ghi `Không có` vì code hiện không dựng menu/navigation.
- `List route` và `Detail route`: ghi `Không có`; `/` chỉ là entry của SPA, không phải route list/detail.
- `Permission key`: ghi `Không có`; các điều kiện như đúng lượt, đúng chủ sở hữu hoặc có tên trong auction là state guard của UI, không phải permission.
- Một file `.instruction.md` mô tả một view hoặc một panel/luồng leaf có ranh giới component và Socket.IO rõ ràng.
- Đường dẫn code luôn tính từ root repository.
- Hành vi server chỉ được nhắc để giải thích contract hiện tại và phải liên kết sang file Api/GameCore/Shared tương ứng; không chép lại toàn bộ rule nền vào file Client.
- Nếu code và tài liệu khác nhau, code AS-IS là căn cứ để sửa tài liệu ngay trong cùng lần thay đổi.

## Thứ tự đọc bắt buộc

1. Đọc [`../README.md`](../README.md) để biết toàn bộ kiến trúc và thứ tự tài liệu của project.
2. Đọc [`../monopoly.shared.instructions.md`](../monopoly.shared.instructions.md) để nắm rule dùng chung.
3. Đọc [`../monopoly.client.instructions.md`](../monopoly.client.instructions.md) để nắm entry, context, Socket.IO, state sync và pattern UI của frontend.
4. Khi đụng event/state hoặc rule game, đọc tiếp rule nền tương ứng: [`../monopoly.contracts.instructions.md`](../monopoly.contracts.instructions.md), [`../monopoly.api.instructions.md`](../monopoly.api.instructions.md), [`../monopoly.game-core.instructions.md`](../monopoly.game-core.instructions.md).
5. Đọc file `Client/README.md` này để xác định đúng panel/luồng cần sửa.
6. Đọc đúng file `.instruction.md` trong bảng ánh xạ bên dưới.
7. Đọc các file Api, GameCore và Shared được liên kết trong instruction đó trước khi đổi payload, event hoặc rule game.
8. Đọc và chạy checklist testcase được liên kết trước và sau khi sửa.

## Ánh xạ menu → route → feature → instruction → code

| Menu | Route | Feature/view leaf | File instruction | Code path chính |
|---|---|---|---|---|
| Không có | Entry `/`; không có list/detail route | Join room | [`join-room.instruction.md`](join-room.instruction.md) | `apps/client/src/App.tsx`; `apps/client/src/components/JoinForm.tsx` |
| Không có | Entry `/`; Board hiện khi `joined === true` | Game board và tile visualization | [`game-board.instruction.md`](game-board.instruction.md) | `apps/client/src/components/Board.tsx`; `apps/client/src/components/Tile.tsx`; `apps/client/src/useSteppedPositions.ts` |
| Không có | Không có route riêng | Dice, mua property và hành động jail theo lượt | [`turn-actions.instruction.md`](turn-actions.instruction.md) | `apps/client/src/components/Dice.tsx`; `apps/client/src/components/dashboard/BuyPrompt.tsx`; `apps/client/src/components/dashboard/JailPanel.tsx` |
| Không có | Không có route riêng | Roster, trạng thái lượt, start game và winner | [`game-status.instruction.md`](game-status.instruction.md) | `apps/client/src/components/Dashboard.tsx`; `apps/client/src/components/dashboard/PlayerList.tsx`; `apps/client/src/components/dashboard/WinnerBanner.tsx` |
| Không có | Không có route riêng; mở bằng click tile | Property detail, build/sell house, mortgage | [`property-management.instruction.md`](property-management.instruction.md) | `apps/client/src/components/BackOfCard.tsx`; `apps/client/src/components/Tile.tsx` |
| Không có | Không có route riêng | Open market và private offer | [`trading-market.instruction.md`](trading-market.instruction.md) | `apps/client/src/components/MarketPlace.tsx`; `apps/client/src/components/dashboard/SellPrompts.tsx`; `apps/client/src/components/dashboard/IncomingOffers.tsx` |
| Không có | Không có route riêng | Live auction | [`auction.instruction.md`](auction.instruction.md) | `apps/client/src/components/dashboard/AuctionPanel.tsx` |
| Không có | Không có route riêng | Activity log và chat | [`activity-log-and-chat.instruction.md`](activity-log-and-chat.instruction.md) | `apps/client/src/components/Log.tsx` |

## Bản đồ nền state và Socket.IO

- `apps/client/src/App.tsx` tạo một socket dùng chung, bọc các lệnh emit trong `socketFunctions`, nhận event `update` và thay toàn bộ `GameState` trong reducer.
- `apps/client/src/internal.ts` cung cấp `stateContext`; kiểu context nằm tại `apps/client/src/types.ts`.
- `apps/client/src/displayPositionsContext.ts` và `apps/client/src/useSteppedPositions.ts` giữ vị trí token đang hiển thị, có thể trễ hơn vị trí authoritative từ server.
- `apps/client/src/cardFlipContext.ts` giữ trạng thái lật mặt sau tile.
- `apps/client/src/sellPromptContext.ts` giữ modal open-market/private-offer.
- `apps/client/src/components/Toast.tsx` hiển thị toast cho kết quả private offer.
- Contract event và `GameState` dùng chung nằm tại [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md).

## Quy tắc cập nhật

Trong cùng lần sửa code, phải cập nhật ngay tài liệu tương ứng khi có một trong các thay đổi sau:

- Đổi entry, cách chuyển Join/Board, thêm router, route, menu hoặc guard: cập nhật `monopoly.client.instructions.md`, README này và instruction bị ảnh hưởng.
- Thêm, xóa hoặc đổi component/panel leaf: thêm/xóa instruction tương ứng và cập nhật bảng ánh xạ này; không giữ flow đã xóa.
- Đổi Socket.IO event, payload, state shape hoặc cách nhận `update`: cập nhật instruction Client, tài liệu Shared contract và instruction Api liên quan.
- Đổi rule về lượt, tile, property, trading, auction hoặc jail: cập nhật instruction Client và file GameCore/Api liên quan; không biến UI state guard thành permission.
- Đổi tên/giá/rent/tile index: kiểm tra đồng thời `packages/shared/src/tileState.ts`, `apps/client/src/components/BoardInitState.ts`, `apps/client/src/components/backOfCards.ts` và cập nhật tài liệu board-data.
- Đổi hành vi hiển thị, validation, animation, accessibility hoặc error state: cập nhật checklist testcase tương ứng ngay trong cùng thay đổi.
- Khi thêm view/controller/socket module mới: tạo file instruction mới và thêm vào README index của đúng tầng.

## Kiểm tra nền cho mọi thay đổi Client

- Chạy `pnpm --filter @monopoly/client typecheck`.
- Chạy `pnpm --filter @monopoly/client build`.
- Chạy `pnpm lint` nếu thay TS/TSX.
- Thực hiện checklist trong [`../testcase/client-state-sync-motion-and-accessibility.md`](../testcase/client-state-sync-motion-and-accessibility.md) cùng testcase nghiệp vụ được liên kết trong từng instruction.
