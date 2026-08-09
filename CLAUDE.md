# Hướng dẫn làm việc với Monopoly Websockets

## Nguồn sự thật duy nhất

Tài liệu điều hướng, phạm vi và quy tắc thay đổi của project nằm duy nhất tại:

`project-document/monopoly-websockets/`

Không dùng root `README.md`, comment rời rạc hoặc tên component để suy đoán toàn bộ hành vi. Code là bằng chứng thực thi hiện tại; nếu code và tài liệu lệch nhau, đó là lỗi đồng bộ phải được sửa ngay trong cùng thay đổi.

## Bắt buộc đọc tài liệu trước khi sửa

Đọc theo đúng thứ tự sau:

1. `project-document/monopoly-websockets/README.md`.
2. `project-document/monopoly-websockets/monopoly.shared.instructions.md`.
3. Rule nền đúng khối đang sửa:
   - Client: `monopoly.client.instructions.md`.
   - HTTP/Socket transport: `monopoly.api.instructions.md`.
   - Luật game và room state: `monopoly.game-core.instructions.md`.
   - Shared event/type/board data: `monopoly.contracts.instructions.md`.
4. `README.md` index của đúng khối: `Client/`, `Api/`, `GameCore/` hoặc `Shared/`.
5. File `.instruction.md` của đúng màn hình/module đang tác động.
6. Các file GameCore/Shared được file instruction đó liên kết.
7. Checklist tương ứng trong `testcase/README.md` và file testcase được liên kết.

Không bắt đầu sửa chỉ sau khi đọc rule nền. File index và file instruction leaf là nơi chỉ ra logic thật nằm ở đâu trong code.

## Map khối repo tới tài liệu

| Khối code | Đường dẫn thật | Rule và index phải đọc |
| --- | --- | --- |
| React/Vite client | `apps/client/` | `monopoly.client.instructions.md` → `Client/README.md` |
| Express và Socket.IO transport | `apps/server/src/createServer.ts`, `apps/server/src/socket/` | `monopoly.api.instructions.md` → `Api/README.md` |
| Room lifecycle và game-domain logic | `apps/server/src/rooms.ts`, `apps/server/src/game/` | `monopoly.game-core.instructions.md` → `GameCore/README.md` |
| Shared types, Socket events, board/card data | `packages/shared/src/` | `monopoly.contracts.instructions.md` → `Shared/README.md` |
| Test | `apps/server/src/game.test.ts` và các test được thêm về sau | `testcase/README.md` |
| Workspace, CI và deploy | `package.json`, `.github/workflows/ci.yml`, `Dockerfile`, `render.yaml` | `monopoly.shared.instructions.md`, `Api/http-runtime.instruction.md` |

## Ranh giới AS-IS không được suy diễn

- Client hiện không có React Router, sidebar/menu, auth guard, interceptor hoặc permission key.
- Backend hiện không có REST controller nghiệp vụ, auth/RBAC, database, ORM, schema hoặc migration.
- Nghiệp vụ đi qua Socket.IO; các file trong `Api/` mô tả event module tương đương controller.
- Server state là nguồn thẩm quyền. Điều kiện disable/ẩn nút ở client không phải permission.
- Room/game state nằm trong memory của một process và mất khi restart.
- Shared TypeScript interfaces chỉ là contract lúc compile, không phải runtime validation.

Chỉ thay đổi các fact này khi code tương ứng thực sự được thay đổi và tài liệu được cập nhật cùng lúc.

## Quy tắc cập nhật bắt buộc trong cùng lần sửa

- Đổi menu, route, điều kiện hiển thị, permission hoặc hành vi màn hình: cập nhật rule Client, `Client/README.md`, file màn hình và testcase liên quan.
- Đổi HTTP route, Socket event, guard, payload, outbound event hoặc service call: cập nhật rule API, `Api/README.md`, file module, Shared contract, Client consumer và testcase liên quan.
- Đổi `GameState`, payload hoặc event contract: cập nhật `Shared/`, tất cả producer/consumer và testcase.
- Đổi luật game, thứ tự mutation hoặc room lifecycle: cập nhật `GameCore/`, các Api/Client instruction liên quan và testcase.
- Đổi tên, thứ tự, index, giá hoặc rent của tile/card: rà cả shared data, dữ liệu trình bày bị lặp ở client, các index hard-code, docs và testcase.
- Nếu bổ sung database/schema/migration về sau: thêm khối tài liệu tương ứng và cập nhật ngay file này cùng README nguồn sự thật.
- Thêm màn hình hoặc event module: tạo file instruction mới và thêm dòng vào README index tương ứng.
- Xóa chức năng: xóa mô tả và mapping đã hết hiệu lực; không giữ flow cũ trong tài liệu AS-IS.

Mọi thay đổi code mà làm tài liệu sai nhưng không cập nhật tài liệu được xem là chưa hoàn tất.

## Kiểm tra trước khi hoàn tất

Tối thiểu chạy các kiểm tra phù hợp phạm vi:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Chạy thêm `pnpm build` khi sửa client, shared contract/data được client dùng, build hoặc deploy. Thực hiện checklist chức năng trong `project-document/monopoly-websockets/testcase/`; không coi checklist manual hoặc test chưa tồn tại là test tự động đã chạy.
