# Rule nền dùng chung

## Phạm vi áp dụng

Áp dụng cho mọi thay đổi trong repo và mọi tài liệu dưới `project-document/monopoly-websockets/`. File này chứa rule chung; file leaf chỉ ghi phần riêng của màn hình/module và liên kết về đây.

Đọc file này sau [README.md](./README.md), trước rule nền theo khối.

## Nguyên tắc bằng chứng và AS-IS

- Chỉ ghi hành vi có thể chỉ ra từ code, cấu hình hoặc test hiện tại.
- Không suy ra auth, permission, route, validation hoặc persistence từ tên biến hay UI.
- `Không có` là một fact hợp lệ và phải được ghi rõ khi code không triển khai khái niệm đó.
- Không giữ flow đã xóa, proposal, roadmap hoặc workaround cũ trong tài liệu nguồn sự thật.
- Nếu code và tài liệu không khớp, thay đổi chưa hoàn tất cho đến khi hai phía được đồng bộ.
- Caveat phải mô tả đúng giới hạn hiện tại; không tự biến caveat thành yêu cầu sửa ngoài phạm vi.

## Bản đồ workspace

| Package/khối | Đường dẫn | Vai trò |
| --- | --- | --- |
| Root workspace | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` | Script chung, workspace và TypeScript strict defaults |
| Client | `apps/client/` | React/Vite UI và Socket.IO client |
| Server | `apps/server/` | Express runtime, Socket.IO handlers và game-domain logic |
| Shared | `packages/shared/` | Types, event contracts và board/card data dùng chung |
| CI/deploy | `.github/workflows/ci.yml`, `Dockerfile`, `render.yaml` | Validation và single-service deployment |

Package manager là `pnpm@11.15.1`; Node engine trong root package là `>=18`, trong khi CI/Docker/Render hiện dùng Node 24.

## Ranh giới nguồn thẩm quyền

- Server-side `GameState` là nguồn thẩm quyền của tiền, vị trí thật, lượt, ownership, market, auction và winner.
- Client giữ display/local state cho animation, form, modal, toast và private-offer countdown. Local state không cấp quyền thực hiện action.
- `packages/shared` định nghĩa shape và static game data dùng chung, nhưng TypeScript không validation payload tại runtime.
- Room state tồn tại trong memory của một server process; không có database, schema, migration hoặc multi-process adapter.
- Socket actor phải lấy từ `socket.id` khi code hiện tại làm như vậy; trường `playerId` do client gửi không mặc nhiên đáng tin.

## Quy ước đường dẫn và định danh

- Dùng đường dẫn tính từ root repo, ví dụ `apps/server/src/socket/turn.ts`.
- Giữ nguyên casing và khoảng trắng của Socket event, ví dụ `roll dice`, `offer on prop`.
- Giữ nguyên casing của field/type/environment variable, ví dụ `GameState`, `CORS_ORIGIN`, `CLIENT_DIST`.
- Khi trích dẫn code, luôn ghi file/function đang tồn tại. Có thể thêm line number làm locator kiểm chứng, nhưng phải rà và cập nhật locator đó khi file nguồn thay đổi.
- Cross-link tài liệu phải dùng đường dẫn Markdown tương đối và trỏ tới file đang tồn tại.

## Quy tắc thay đổi tối thiểu

- Chỉ sửa các dòng cần thiết cho mục tiêu đã yêu cầu; không refactor hoặc “dọn” logic bên cạnh.
- Khi thay đổi tạo import, biến hoặc helper không còn dùng, chỉ xóa phần thừa do chính thay đổi đó tạo ra.
- Không đổi shared contract mà chỉ sửa một phía client hoặc server.
- Không đổi board index mà bỏ qua client presentation data hoặc hard-coded index.
- Không mô tả client-side disable/visibility như security guard.
- Khi thêm khối kiến trúc mới, cập nhật [README.md](./README.md), root `CLAUDE.md` và tạo rule/index/detail/testcase tương ứng.

## An toàn input và nội dung HTML

- Chat message hiện được escape ở server trước khi client render log bằng `dangerouslySetInnerHTML`.
- Không bỏ escaping hoặc đưa user input thô vào log HTML mà không cập nhật đồng bộ server, client và testcase an toàn.
- Name và room code có normalization riêng; không dùng normalization đó như bằng chứng xác thực danh tính hoặc bảo vệ room.
- CORS và rate limit không phải auth/permission.

## Quy tắc cập nhật tài liệu

Trong cùng lần sửa code:

1. Cập nhật rule/index/detail của tất cả khối bị tác động.
2. Cập nhật testcase tương ứng, phân biệt automatic và manual/integration coverage.
3. Thêm hoặc sửa cross-link hai chiều giữa Client ↔ Api ↔ GameCore ↔ Shared khi dependency đổi.
4. Nếu thêm file leaf, thêm nó vào index; nếu xóa file leaf, xóa mapping và mọi link tới nó.
5. Không sao chép nguyên rule nền vào file leaf; chỉ liên kết và ghi ngoại lệ riêng.

## Baseline kiểm tra

Các lệnh workspace chuẩn:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Chạy thêm:

```bash
pnpm build
```

khi sửa client, shared code mà client import, hoặc build/deploy. CI hiện chạy install, typecheck, lint và test; CI chưa chạy client build hoặc coverage. Không gọi một checklist là test tự động nếu repo chưa có test thực thi cho checklist đó.

## Tài liệu tiếp theo

- Client: [monopoly.client.instructions.md](./monopoly.client.instructions.md)
- API transport: [monopoly.api.instructions.md](./monopoly.api.instructions.md)
- GameCore: [monopoly.game-core.instructions.md](./monopoly.game-core.instructions.md)
- Shared contracts/data: [monopoly.contracts.instructions.md](./monopoly.contracts.instructions.md)
- Testcase index: [testcase/README.md](./testcase/README.md)
