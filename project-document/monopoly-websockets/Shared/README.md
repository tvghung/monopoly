# Shared — mục lục hợp đồng và dữ liệu dùng chung

## Phạm vi

Thư mục này mô tả package `packages/shared`, nơi client và server cùng import kiểu dữ liệu, hợp đồng Socket.IO, dữ liệu bàn cờ và bộ thẻ. Đây là tài liệu AS-IS của code hiện tại; package này không phải database, schema persistence hay migration layer.

## Quy ước

- File `*.instruction.md` mô tả một nhóm contract/data có cùng lý do thay đổi.
- Mọi đường dẫn code tính từ root repository.
- “Contract dùng chung” là contract TypeScript ở compile time; không đồng nghĩa payload mạng đã được validate ở runtime.
- Chỉ ghi hành vi đang tồn tại; không đưa ý tưởng chưa có trong code vào instruction AS-IS.

## Thứ tự đọc

1. [`../README.md`](../README.md) — tổng quan nguồn tài liệu.
2. [`../monopoly.shared.instructions.md`](../monopoly.shared.instructions.md) — rule nền dùng chung toàn repo.
3. [`../monopoly.contracts.instructions.md`](../monopoly.contracts.instructions.md) — rule nền của shared contracts và game data.
4. File README này.
5. Instruction đúng nhóm dữ liệu đang sửa.
6. Checklist tương ứng trong [`../testcase/README.md`](../testcase/README.md).

## Bảng ánh xạ

| Nhóm | Code nguồn chính | Consumer chính | Instruction | Testcase |
|---|---|---|---|---|
| Game state, player/property/trade types, Socket.IO events | `packages/shared/src/types.ts`, `packages/shared/src/events.ts`, `packages/shared/src/index.ts` | `apps/server/src/`, `apps/client/src/App.tsx`, `apps/client/src/types.ts` | [`socket-and-state-contracts.instruction.md`](socket-and-state-contracts.instruction.md) | [`../testcase/shared-contracts-and-board-data.md`](../testcase/shared-contracts-and-board-data.md) |
| 40 ô bàn cờ, color groups, Chance/Chest decks | `packages/shared/src/tileState.ts`, `packages/shared/src/chanceCards.ts`, `packages/shared/src/chestCards.ts` | game core, socket turn/trading, board/property UI | [`board-and-card-data.instruction.md`](board-and-card-data.instruction.md) | [`../testcase/shared-contracts-and-board-data.md`](../testcase/shared-contracts-and-board-data.md) |

## Quy tắc cập nhật

- Đổi field trong `GameState`/`Player`/payload phải cập nhật cùng lần sửa: shared type, state khởi tạo ở server, state khởi tạo ở client, test fixture, handler/consumer và testcase.
- Đổi tên hoặc payload event phải cập nhật `events.ts`, client emit/listener, server handler, instruction liên quan và testcase; không giữ tên event cũ nếu code đã xóa.
- Đổi index/tên/giá/rent của ô phải rà cả dữ liệu trình bày đang bị lặp ở client và các index hard-code trong game core/card deck.
- Thêm export mới phải cập nhật `packages/shared/src/index.ts`, `packages/shared/package.json` nếu cần subpath export, và bảng ánh xạ trên.
- Luôn chạy `pnpm typecheck`; nếu thay đổi hành vi game, chạy thêm `pnpm test`; nếu ảnh hưởng client data/UI, chạy thêm `pnpm build`.
