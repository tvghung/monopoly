# Testcase — mục lục checklist kiểm thử

## Phạm vi

Các file trong thư mục này là checklist regression theo hành vi code hiện tại. Chúng phân biệt rõ automation đã tồn tại với kiểm thử manual/integration chưa được cài đặt; checklist không phải bằng chứng một test tự động đã được implement.

## Quy ước coverage

- **`[AUTO-EXISTING]`**: đã có assertion hoặc automated gate tương ứng; file checklist phải ghi rõ đó là unit test, typecheck hay gate nào.
- **`[MANUAL]`**: kiểm tra thủ công được mô tả; repository hiện không có automation cho bước này.
- **`[MISSING-AUTO]`**: case quan trọng nên được bảo vệ bằng automation khi sửa vùng code đó, nhưng hiện chưa có test tự động.
- **`[AS-IS CAVEAT]`**: xác nhận giới hạn/rủi ro hiện tại; không được hiểu là behavior mong muốn mới.

## Thứ tự đọc

1. [`../README.md`](../README.md) và rule nền liên quan.
2. README index của Client/Api/Shared/GameCore.
3. Instruction của đúng màn hình/event/core logic.
4. File testcase tương ứng ở bảng dưới.
5. Sau khi sửa, cập nhật cả instruction và checklist trong cùng change.

## Bảng ánh xạ

| Chức năng | Instruction chính | Checklist |
|---|---|---|
| Join, normalize room, spectator, disconnect | [`../GameCore/room-lifecycle.instruction.md`](../GameCore/room-lifecycle.instruction.md), [`../Api/socket-player.instruction.md`](../Api/socket-player.instruction.md), [`../Client/join-room.instruction.md`](../Client/join-room.instruction.md) | [`join-room-and-player-lifecycle.md`](join-room-and-player-lifecycle.md) |
| Start/roll/move/buy/jail | [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md), [`../GameCore/tile-cards-and-jail-resolution.instruction.md`](../GameCore/tile-cards-and-jail-resolution.instruction.md), [`../Api/socket-turn.instruction.md`](../Api/socket-turn.instruction.md), [`../Api/socket-jail.instruction.md`](../Api/socket-jail.instruction.md) | [`turn-movement-buy-and-jail.md`](turn-movement-buy-and-jail.md) |
| Bankruptcy, finished player, winner | [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md), [`../Client/game-status.instruction.md`](../Client/game-status.instruction.md) | [`game-status-bankruptcy-and-winner.md`](game-status-bankruptcy-and-winner.md) |
| Rent, build/sell, mortgage | [`../GameCore/property-economy.instruction.md`](../GameCore/property-economy.instruction.md), [`../Api/socket-building.instruction.md`](../Api/socket-building.instruction.md) | [`property-economy.md`](property-economy.md) |
| Open market và private offer | [`../Api/socket-trading.instruction.md`](../Api/socket-trading.instruction.md), [`../Client/trading-market.instruction.md`](../Client/trading-market.instruction.md) | [`trading-market-and-private-offers.md`](trading-market-and-private-offers.md) |
| Auction | [`../GameCore/auction.instruction.md`](../GameCore/auction.instruction.md), [`../Api/socket-auction.instruction.md`](../Api/socket-auction.instruction.md), [`../Client/auction.instruction.md`](../Client/auction.instruction.md) | [`auction.md`](auction.md) |
| Chat, log và input safety | [`../Api/socket-chat.instruction.md`](../Api/socket-chat.instruction.md), [`../Client/activity-log-and-chat.instruction.md`](../Client/activity-log-and-chat.instruction.md) | [`chat-log-and-input-safety.md`](chat-log-and-input-safety.md) |
| Shared types/events/board/cards | [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md), [`../Shared/board-and-card-data.instruction.md`](../Shared/board-and-card-data.instruction.md) | [`shared-contracts-and-board-data.md`](shared-contracts-and-board-data.md) |
| Client state, stepped motion, reduced motion, accessibility | [`../Client/README.md`](../Client/README.md) và các Client instruction bị tác động | [`client-state-sync-motion-and-accessibility.md`](client-state-sync-motion-and-accessibility.md) |
| Health, CORS, static runtime, CI/deploy | [`../Api/http-runtime.instruction.md`](../Api/http-runtime.instruction.md), [`../monopoly.shared.instructions.md`](../monopoly.shared.instructions.md) | [`http-runtime-and-deployment.md`](http-runtime-and-deployment.md) |

## Coverage tự động hiện tại

- Repository có một test file: `apps/server/src/game.test.ts`, gồm 39 unit tests cho game-domain functions.
- Chưa có client test script, browser/E2E suite, Socket.IO integration suite, room lifecycle suite, HTTP integration suite hoặc coverage report.
- CI hiện chạy typecheck, lint, test; không chạy browser test hay client production build.

## Quy tắc cập nhật

- Thêm/đổi flow phải thêm hoặc sửa checklist tương ứng; không xóa case chỉ vì UI flow bị đổi nếu server behavior còn tồn tại.
- Khi thêm automation, đổi nhãn case từ `[MISSING-AUTO]`/`[MANUAL]` thành `[AUTO-EXISTING]` và ghi path test thật.
- Nếu xóa behavior khỏi code, xóa checklist cũ và cập nhật instruction/index cùng lần sửa.
- Regression tối thiểu toàn repo: `pnpm typecheck`, `pnpm lint`, `pnpm test`; thêm `pnpm build` cho thay đổi shared/client/runtime build.
