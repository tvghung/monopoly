# Rule nền Shared contracts và game data

## Phạm vi

Áp dụng cho `packages/shared/` và mọi consumer trực tiếp của package `@monopoly/shared`.

Đọc sau [monopoly.shared.instructions.md](./monopoly.shared.instructions.md), rồi mở [Shared/README.md](./Shared/README.md) và instruction đúng phạm vi.

## Vai trò package

`packages/shared/src/index.ts` export:

- `tileState` và `colorGroups`.
- `chanceCards` và `chestCards`.
- Toàn bộ game/payload types.
- Toàn bộ Socket.IO event contracts.

Client và server cùng import package này từ workspace. Shared package không có runtime service, database model hoặc validation library.

## Phân lớp dữ liệu

| Phạm vi | File | Instruction |
| --- | --- | --- |
| Socket inbound/outbound events và socket data | `packages/shared/src/events.ts` | [Shared/socket-and-state-contracts.instruction.md](./Shared/socket-and-state-contracts.instruction.md) |
| `GameState`, player, board, auction và trading payloads | `packages/shared/src/types.ts` | [Shared/socket-and-state-contracts.instruction.md](./Shared/socket-and-state-contracts.instruction.md) |
| 40 tiles và 8 color groups | `packages/shared/src/tileState.ts` | [Shared/board-and-card-data.instruction.md](./Shared/board-and-card-data.instruction.md) |
| Chance/Community Chest decks | `packages/shared/src/chanceCards.ts`, `packages/shared/src/chestCards.ts` | [Shared/board-and-card-data.instruction.md](./Shared/board-and-card-data.instruction.md) |

## Compile-time contract, không phải runtime validation

- Socket server/client generic types kiểm tra tên event và TypeScript signature khi build.
- Runtime sender vẫn có thể gửi payload sai kiểu/range.
- Không có Zod, Joi, Ajv hoặc schema parser.
- File API instruction phải ghi đúng guard runtime thật; không dùng interface để tuyên bố payload đã được validate.

Nếu bổ sung runtime validation về sau, tài liệu phải chỉ rõ schema path, action dùng schema và behavior khi reject.

## Quy tắc đổi event hoặc state

Khi đổi event, payload hoặc `GameState`:

1. Sửa Shared type/event.
2. Sửa server handler và game-domain consumer.
3. Sửa client `socketFunctions`, listener, reducer/context và UI consumer.
4. Sửa fixture/helper trong test.
5. Cập nhật Shared index/instruction, Api module, Client instruction và testcase.

Không để contract có payload mà server cố ý bỏ qua mà không ghi caveat trong Api/Shared docs. Hiện `start game` có string payload và `buy property` có boolean payload dù server handler không dùng giá trị.

## Quy tắc board và card data

- `tileState` phải giữ thứ tự index 0–39 phù hợp movement và hard-coded rules.
- `colorGroups` phải tham chiếu đúng buildable street indices.
- Card absolute destinations và relative movement phải phù hợp board indices.
- Field card là optional effects; `applyCard` áp dụng mọi field có mặt theo thứ tự code hiện tại.
- Thay index có thể tác động railroad, utilities, jail, GO, Chance destination và client animation/presentation.

## Client presentation duplicates

Shared data chưa phải nguồn trình bày duy nhất. Client còn có:

- `apps/client/src/components/BoardInitState.ts`.
- `apps/client/src/components/backOfCards.ts`.

Khi sửa name/price/rent/house cost/index, rà cả ba nguồn. Tile 28 hiện có mismatch AS-IS `Water Company` versus `Water Works`; không che giấu mismatch trong tài liệu và không tự sửa ngoài phạm vi.

## Quy tắc sửa Shared

- Không thêm field “để dành” nếu chưa có consumer hoặc yêu cầu.
- Không đổi event string/casing một phía.
- Không biến TypeScript type thành bằng chứng auth/permission/validation.
- Giữ `packages/shared/src/index.ts` export surface đồng bộ với import path thực tế.
- Cập nhật docs/testcase cùng thay đổi và chạy cả client/server typecheck.

## Kiểm tra bắt buộc

```bash
pnpm --filter @monopoly/shared typecheck
pnpm --filter @monopoly/client typecheck
pnpm --filter @monopoly/server typecheck
pnpm test
pnpm lint
```

Chạy thêm `pnpm build` khi shared change được client bundle sử dụng. Thực hiện [testcase/shared-contracts-and-board-data.md](./testcase/shared-contracts-and-board-data.md) và các checklist chức năng bị tác động.
