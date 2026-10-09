# Hướng dẫn làm việc với Cờ Tỷ Phú Việt Nam (Own the Block)

Đây là quy tắc vận hành bắt buộc cho mọi AI agent (Claude Code, Codex) và developer. `CLAUDE.md` và `AGENTS.md` phải giống hệt
nhau (`pnpm validate:docs` kiểm tra); sửa file này thì chép nguyên văn sang file kia trong cùng thay đổi.

## 1. Nguồn sự thật

- Bắt đầu mọi task ở **Documentation Hub**: `project-document/README.md` (nhãn vòng đời, trạng thái released/đang phát triển,
  điều hướng theo loại task, quy tắc xử lý mâu thuẫn).
- Tài liệu kỹ thuật CURRENT (canonical) nằm ở `project-document/monopoly-websockets/`; mỗi quy tắc có đúng một tài liệu sở hữu,
  nơi khác chỉ link tới.
- Nguồn sự thật về phát hành: `project-document/ui-ux-overhaul/V1_RELEASE_CONTRACT.md` (đường dẫn và các trường được
  `scripts/validateV1Contract.mjs` đọc; không di chuyển).
- Code và test là bằng chứng thực thi. Nếu code, schema và tài liệu lệch nhau, thay đổi chưa hoàn tất.
- Tài liệu HISTORICAL/SUPERSEDED/REFERENCE (phase cũ, PostgreSQL, vNext program) chỉ để tham khảo lý do; không dùng làm chỉ dẫn hiện
  hành. Danh mục phân loại nằm trong Hub.
- File này chỉ **tóm tắt** invariant để agent đọc nhanh; nó không phải nguồn sự thật thứ hai. Mỗi invariant có tài liệu canonical
  sở hữu chi tiết (ghi trong ngoặc).
- **Hai tài liệu mâu thuẫn nhau:** ưu tiên tài liệu CURRENT canonical áp dụng đúng cho nhánh/phiên bản đang làm (RELEASED hay CURRENT
  DEVELOPMENT) và phù hợp quyết định đã được chấp thuận; tài liệu này (tóm tắt) luôn nhường canonical và phải được sửa trong cùng thay đổi.
- **Tài liệu mâu thuẫn với implementation:** không tự động coi bên nào đúng; làm theo mục 7.

## 2. Released và đang phát triển

- Luôn phân biệt **RELEASED** (đã có trong bản phát hành công khai) với **CURRENT DEVELOPMENT** (đã code trên nhánh hiện tại sau
  bản phát hành cuối, chưa phát hành). Bảng trạng thái hiện hành nằm trong Hub và
  `project-document/monopoly-websockets/ARCHITECTURE_DECISIONS.md` (ADR-13).
- Trước khi nói một phiên bản "chưa phát hành", kiểm tra bằng chứng: `git tag`, `git branch -r --contains <tag>`,
  `gh release list`/`gh release view`, kết quả workflow `release-candidate.yml`. Tag đơn thuần chưa đủ để khẳng định đã publish.
- Không viết lại lịch sử release cho khớp nhánh hiện tại. Khi một luật khác giữa released và nhánh, tài liệu ghi cả hai và nhãn
  phạm vi.
- Số version hiện hành chỉ đọc từ code: `SOCKET_PROTOCOL_VERSION` trong `packages/shared/src/types.ts`,
  `ROOM_SNAPSHOT_SCHEMA_VERSION` trong `apps/server/src/rooms.ts`. Lịch sử version nằm ở mục "Version history" của
  `project-document/monopoly-websockets/Shared/socket-and-state-contracts.instruction.md`.

## 3. Thứ tự đọc bắt buộc

1. Xác định phạm vi và feature bị ảnh hưởng trong `project-document/monopoly-websockets/FEATURE_TRACEABILITY.md`
   (mỗi feature ghi tài liệu canonical, code client/server/shared, test, kịch bản thủ công và feature liên quan).
2. Documentation Hub `project-document/README.md` (trạng thái released/đang phát triển).
3. Foundation rule: luôn `monopoly.shared.instructions.md`, cộng rule của khối: `monopoly.client.instructions.md`,
   `monopoly.api.instructions.md`, `monopoly.game-core.instructions.md` hoặc `monopoly.contracts.instructions.md`.
4. `README.md` index của module rồi đúng file `.instruction.md` của feature/event.
5. Checklist trong `testcase/` của feature (và `testcase/RELEASE_ACCEPTANCE_MATRIX.md` nếu liên quan release).
6. Source code và test thật mà traceability nêu, trước khi sửa.
7. `ARCHITECTURE_DECISIONS.md` nếu đụng authority, persistence, networking, protocol, packaging hoặc release.

Không cần đọc toàn bộ lịch sử dự án cho mỗi task.

## 4. Quy trình bắt buộc

`Understand → Read Docs → Verify Code → Analyze Impact → Implement → Update Docs & Tests → Validate → Report`

- Không implement trái contract hiện hành khi chưa phân tích; không tin tài liệu đã SUPERSEDED.
- Không coi code hiện tại là ý định sản phẩm khi có mâu thuẫn (xem mục 7).
- Không sửa module không liên quan; không đổi networking/gameplay authority ngoài phạm vi task.
- Cập nhật tài liệu và testcase **trong cùng task** với thay đổi code (mục 6).
- Không bỏ qua regression check; không tuyên bố PASS cho thứ chưa chạy.

## 5. Điều hướng module → code → tài liệu

| Khối | Đường dẫn chính | Tài liệu bắt đầu (trong `project-document/monopoly-websockets/`) |
| --- | --- | --- |
| Client | `apps/client/` | `monopoly.client.instructions.md` → `Client/README.md` |
| Desktop shell, host runtime, update, packaging | `apps/desktop/` | `Desktop/README.md` → `Desktop/electron-shell-and-packaging.instruction.md` |
| HTTP/Socket | `apps/server/src/createServer.ts`, `apps/server/src/socket/` | `monopoly.api.instructions.md` → `Api/README.md` (đủ danh sách event) |
| GameCore / room aggregate / bot | `apps/server/src/rooms.ts`, `apps/server/src/game/`, `apps/server/src/commands/`, `apps/server/src/bots/` | `monopoly.game-core.instructions.md` → `GameCore/README.md` |
| Runtime RAM (room/session/offer/deadline) | `apps/server/src/persistence/`, `apps/server/src/services/` | `Persistence/README.md` |
| Shared contracts / schema / board data | `packages/shared/src/` | `monopoly.contracts.instructions.md` → `Shared/README.md` |
| Room registry (tùy chọn) | `services/room-registry/` | `services/room-registry/README.md`, `Api/http-runtime.instruction.md` |
| Tests | `apps/**/*.test.ts(x)`, `e2e/`, packaged proofs | `testcase/README.md`, `testcase/RELEASE_ACCEPTANCE_MATRIX.md` |

Feature → tài liệu → code → test: `FEATURE_TRACEABILITY.md` (52 feature, trạng thái COMPLETE/PARTIAL/MISSING).

## 6. Phân tích tác động và cập nhật tài liệu

Trước khi implement, liệt kê tài liệu và testcase bị ảnh hưởng; trong cùng task:

- **UI behavior:** instruction của feature trong `Client/`, testcase liên quan; traceability nếu đổi file sở hữu.
- **Event/payload/ACK:** Shared schema, server handler, client caller/listener, `Api/` (bảng event trong `Api/README.md`),
  `Client/`, `Shared/` và testcase.
- **Public/private state:** projector, shared types, client consumer và test chống rò credential.
- **Protocol/snapshot:** hằng số version, "Version history" trong Shared contracts, ghi chú tương thích, `apps/desktop/update-policy.json`
  (`reviewedForSocketProtocol`, `minimumSupportedVersion`) và `V1_RELEASE_CONTRACT.md`; `pnpm validate:v1-contract` phải pass.
- **Volatile store/schema/deadline:** transaction, cleanup/reconnect/process-loss test, `Persistence/` và hosting docs.
- **Room/session/host/ready/leave:** GameCore, player/lobby transport, Client lifecycle, testcase reconnect và process-exit.
- **Tile/card data:** shared data, presentation duplicates, hard-coded index, how-to-play, docs và testcase. Không dọn code/tài liệu
  không liên quan.
- **Luật team/hồi sinh/Emergency Rescue/thuê theo đội:** `packages/shared/src/teams.ts` + `packages/shared/src/rules.ts`,
  `apps/server/src/game/team.ts`, `apps/server/src/game/rescue.ts`, `apps/server/src/game/rescueResolution.ts`,
  `apps/server/src/rooms.ts` (`assertTeamState`, snapshot upgrade helpers), projector, Lobby/HUD/WinnerBanner client,
  `GameCore/team-play.instruction.md`, how-to-play và `testcase/team-play.md`; Solo giữ nguyên (trừ bonus đủ khu ×1,5).
- **Payment/bankruptcy/transfer/forced sale:** rà mọi producer của `DebtClaim`, policy transfer, proposal continuation, snapshot
  validation, `Api/socket-debt-and-rescue.instruction.md` và test process-loss/reconnect.
- **Kiến trúc:** `ARCHITECTURE_DECISIONS.md` và spec liên quan.
- **Feature mới:** instruction (hoặc mở rộng instruction có sẵn), dòng trong module index, mục mới trong `FEATURE_TRACEABILITY.md`,
  checklist testcase.
- **Module mới:** `monopoly-websockets/<Module>/README.md`, link từ index kỹ thuật và module map trong Hub.
- **Release:** `V1_RELEASE_CONTRACT.md`, `testcase/RELEASE_ACCEPTANCE_MATRIX.md`, release notes trong `.github/release-notes/`.
- **Bug fix:** xác định lỗi do code vi phạm tài liệu hay tài liệu sai; sửa đúng nguồn.

Không sửa hàng loạt Markdown khi thay đổi không ảnh hưởng hành vi, contract hay tài liệu. Đường dẫn code trong tài liệu CURRENT viết
dạng repo-relative trong backtick (`apps/...`, `packages/...`) để validator kiểm tra được.

## 7. Khi code và spec mâu thuẫn

Tách ba loại sự thật: **ý định sản phẩm** (luật/quyết định được chấp thuận), **implementation thực tế** (code/runtime), **bằng chứng
kiểm chứng** (test, acceptance có ghi nhận). Không tự sửa spec cho khớp code, không tự kết luận code sai: kiểm tra ý định sản phẩm, yêu cầu đã duyệt, code, test và lịch sử
quyết định. Nếu chưa xác định được bên đúng, đó là discrepancy chưa giải quyết: ghi vào tài liệu liên quan và báo cáo cuối, không sửa
spec cho khớp code trong im lặng; chỉ sửa khi đã biết nguồn sai. Không che bug bằng cách viết lại tài liệu.
Mọi khẳng định kỹ thuật quan trọng phải kèm đường dẫn code, test hoặc tài liệu quyết định.

## 8. Invariants kiến trúc bắt buộc

**Danh tính, phiên và kết nối**
- `PlayerId` là UUID ổn định; `socket.id` chỉ là định danh connection runtime.
- Raw reconnect token chỉ trả qua ACK và lưu phía client. Server chỉ lưu SHA-256 hash; không đưa raw token/hash vào log,
  `socket.data` hoặc public state.
- `disconnect` chỉ đổi presence. Chỉ `leave room` mới revoke session và loại seat.
- Mỗi player có tối đa một active connection; connection mới nhất thắng. Stale disconnect phải bị chặn bằng connection generation.
- Actor của command luôn lấy từ authenticated `socket.data.playerId`; không tin `playerId`, owner, seller hoặc buyer do client gửi.
- Desktop Host room creation cần capability bí mật theo server process và mã phòng do Electron main cấp. Guest admission phải gắn
  room ID đã tồn tại; pending Guest không được tạo lại room đã xóa dù mã phòng được dùng lại.
- Giới hạn admission/HTTP theo khóa client lấy từ TCP peer (`apps/server/src/socket/clientIdentity.ts`); `CF-Connecting-IP` chỉ
  được đọc từ peer loopback của Online Host (`OTB_ONLINE_ROOM_CODE`, edge Cloudflare tự gán và trả 403 nếu khách gửi sẵn), không
  bao giờ `X-Forwarded-For` / `True-Client-IP`. Trạng thái limiter phải bị chặn bộ nhớ.
- Binary `cloudflared` chỉ tin digest ghim trong `apps/desktop/cloudflared-integrity.json` (archive, executable, license), không
  tin checksum nằm cạnh file hay `PATH`. Quick Tunnel chạy với `--config` rỗng riêng và không có biến `TUNNEL_*`; không đọc/sửa
  cấu hình của user.

**Server authority, command và RAM runtime**
- Host server process là authority. Room, session, offer và snapshot chỉ nằm trong RAM. Process kết thúc thì mọi room/token mất
  vĩnh viễn; helper crash không được restart để giả khôi phục ván cũ.
- Public room dùng `room:<roomId>`; private delivery dùng `player:<playerId>`.
- Mọi payload mạng được parse bằng runtime schema. Mọi state-changing command có typed ACK và chỉ ACK/broadcast sau khi RAM
  transaction commit.
- Lệnh chuyển tiền/tài sản mà client có thể gửi lại (`sell house`, `make offer`, `add bot`) mang `requestId` UUID và idempotent theo
  ledger runtime (`apps/server/src/services/commandRequestLedger.ts`, `botRequestLedger.ts`); chỉ lệnh đã commit được ghi nhớ.
- Mutation cùng room chạy tuần tự qua room command executor trên draft state. Save thất bại phải bỏ draft, không commit revision
  hoặc broadcast.
- ACK lỗi runtime RAM không phân loại theo thuộc tính `code`; `DATABASE_UNAVAILABLE` chỉ còn là mã tương thích (deprecated), server
  không phát. Store đã `close()` từ chối transaction mới.
- Không persist presence, socket mapping, raw token, timer handle hoặc countdown tick. Offer/turn/payment-shortfall/forced-sale giữ
  absolute deadline trong RAM để xử lý reconnect khi cùng process vẫn sống. "Restart" trong test có thể là restart server trong
  cùng process dùng lại store; đó không phải restart host process.

**Lifecycle phòng, lobby và bot**
- Lifecycle room là `LOBBY → IN_PROGRESS → FINISHED`; chỉ command `play again` của host đã xác thực mới mở lại cùng room theo
  `FINISHED → LOBBY`.
- Host là stable player; disconnect không transfer host. Lobby cần 2–4 active seat, ít nhất một người thật, mọi người thật connected
  và ready để host start (2v2: đúng 4, mỗi đội 2).
- Bot (`GameCore/bot-players.instruction.md`): `RoomMember.kind = 'BOT'`, `PlayerId` UUID, không session/token/socket. Chỉ host
  thêm/xóa bot ở `LOBBY` (`add bot` idempotent theo `requestId`, `remove bot`), tối đa 3 bot, chung 4 ghế với người; bot luôn
  Ready, tự có mascot không trùng, host luôn là người thật, người thật cuối cùng rời thì phòng đóng. Bot chỉ đọc public projection +
  private projection của chính nó, gửi đúng các lệnh trong `apps/server/src/commands/gameplay.ts` mà socket handler dùng;
  `apps/server/src/bots/driver.ts` không lưu timer, re-check task trong room queue, retry bằng fallback hợp lệ rồi phục hồi có giới
  hạn (turn recovery của server / deadline), dừng khi không còn người thật kết nối, không bao giờ đề nghị giao dịch hay thay người
  mất kết nối. Độ khó bot (`set bot difficulty`, `BoardState.botDifficulty`, thiếu = MEDIUM = policy Balanced đã phát hành) là
  CURRENT DEVELOPMENT; trạng thái phát hành xem Hub/ADR-13.

**Luật chơi và dữ liệu**
- Standard Mode dùng board Việt Nam cố định 40 ô, đơn vị số nguyên game-unit (`1 unit = 1.000 VNĐ`). Không đổi index hoặc economy
  chỉ vì đổi nhãn hiển thị. `BoardState.rollSequence` là public identity ổn định trong đời host, bắt đầu từ `0`, tăng đúng một lần
  cho mỗi gameplay roll đã commit, không tăng cho starting-player tie-break hoặc command rollback.
- `completeTurnResolution` là điểm duy nhất handoff cho landing/payment/card resolution và chỉ có `ADVANCE_TURN` (turn-recovery hết
  hạn khi không còn gì chờ và việc loại người chơi hiện tại handoff trực tiếp, xem `GameCore/turn-movement-and-bankruptcy.instruction.md`); đổ đôi không cấp thêm lượt. `PendingTurnContinuation`
  nhúng trong các wait, pending purchase/development landing decision, `PaymentQueue`, private `GamePrivateState.decks`,
  `PendingCardInteraction` và forced-sale proposal đều thuộc authoritative room aggregate và phải reconnect-safe khi host còn sống.
  Card landing lấy và reveal ngay top card vào operation ID, `REVEALED` state với `revealedCardId`, continuation và server deadline;
  chỉ `dismiss card` hiện hành áp dụng sau commit. `AWAITING_DRAW`/`draw card` chỉ còn cho protocol-9 legacy compatibility.
- `DeckState` và thứ tự thẻ không được phát trong public DTO. Public state có bounded `gameplayEvents` và typed `activityFeed`;
  private aggregate state có per-player semantic lanes và `completedCardOperations`, nhưng client chỉ nhận đúng projection được phép
  để render. Credential, private offer và hidden deck order nằm ngoài public projection. Các file SQL trong
  `apps/server/migrations/` chỉ là lịch sử; runtime RAM không đọc SQL. Lịch sử thay đổi theo từng protocol/snapshot: mục "Version
  history" của Shared contracts.
- 2v2 Teamplay (canonical: `GameCore/team-play.instruction.md`): `GameMode` chỉ host chọn ở `LOBBY`; tiền và `ownedProps` luôn theo
  `PlayerId`, không có ví chung; mọi team rule (miễn thuê đồng đội, đủ khu Solo ×1,5 / đội ×2, Ga/Công Ty theo đội, Team Investment,
  lượt `A1,B1,A2,B2`, hồi sinh, Emergency Rescue) chạy ở server qua `isTeamMode`/`packages/shared/src/teams.ts`; Solo không đổi
  (trừ bonus đủ khu ×1,5). Host không di chuyển người khác, chỉ có `kick player` ở sảnh. Client chỉ hiển thị public state qua
  `apps/client/src/game/team/teamView.ts`.

**Client và trình bày**
- Client display state không thay authoritative room state. `SESSION_SYNC`, `SPECTATOR_SYNC` và `REPLAY_SYNC` reset presentation
  queue/snap; chỉ `LIVE_UPDATE` mới animate state diff. Activity tail trong live update phải chờ cùng PresentationQueue gate, còn
  reconnect/replay chỉ hydrate snapshot hiện tại. Queue failure phải resolve, và reconnect không replay lịch sử.
- WebGL board chỉ render `BoardRenderModel` derive từ authoritative state cộng presentation state. Camera orthographic cố định,
  `frameloop="demand"`; callback hoàn tất local SDF text phải invalidate frame để tên ô hiện mà không cần tương tác.
- Property chassis giữ màu trung tính. Tám district dùng tám material/texture pair textless dùng chung theo `surfaceKey`; district
  accent không biểu diễn ownership. Surface batch phải theo cùng tile-motion matrix với chassis. WebGL fallback và 40 semantic tile
  buttons vẫn là accessibility/compatibility boundary bắt buộc.

**Desktop**
- Desktop Electron phải giữ `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload bridge typed/whitelist-only
  và packaged `app://` path traversal guard. Main process chỉ là shell/runtime/window boundary, không chứa GameCore hoặc bypass
  server authority.
- Active-game desktop close là disconnect để reconnect; không emit `leave room`. Chỉ nút `Bỏ cuộc`/explicit leave mới revoke
  session. Prompt/confirmation dùng central Modal/ConfirmationDialog; không thêm `window.confirm`. Hộp xác nhận đóng cửa sổ đã
  hiện (`quit.acknowledge`) thì main chờ người chơi trả lời; chỉ renderer không thể hỏi/trả lời mới làm đóng tự động (canonical:
  `Desktop/electron-shell-and-packaging.instruction.md`).

## 9. Guardrails protocol, persistence, networking và release

- Mọi thay đổi wire contract (event, payload, ACK, public state, snapshot shape) phải quyết định rõ có bump `SOCKET_PROTOCOL_VERSION`
  / `ROOM_SNAPSHOT_SCHEMA_VERSION` hay không, ghi vào Version history, và rà tương thích với bản đã phát hành (client desktop dùng
  renderer đóng gói riêng, browser dùng client do host phục vụ). Bump protocol bắt buộc cập nhật `apps/desktop/update-policy.json`.
- Không đưa lại PostgreSQL, lưu trữ bền hoặc khôi phục ván qua restart process khi chưa có quyết định kiến trúc mới.
- Không đổi khóa admission, nguồn tin cậy của header, cấu hình tunnel hay digest `cloudflared` ngoài phạm vi task.
- Không tự bump version sản phẩm, tạo tag, publish release hay sửa `update-policy.json` khi owner chưa chấp thuận.
- Không xóa hay viết lại tài liệu HISTORICAL và release evidence; chỉ thêm banner trạng thái khi cần.

## 10. Kiểm tra bắt buộc và báo cáo trung thực

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate:docs
```

Khi đổi validator tài liệu: `pnpm test:docs`. Khi đổi release/protocol: `pnpm validate:v1-contract`. Desktop:

```bash
pnpm --filter @monopoly/desktop typecheck
pnpm --filter @monopoly/desktop test
pnpm desktop:package
```

Với thay đổi lifecycle, phải chạy RAM transaction/reconnect và process-restart scenario; room/token cũ phải không khôi phục.
Báo cáo từng kiểm tra là `PASS`, `FAIL`, `NOT RUN` hoặc `BLOCKED` theo đúng kết quả thật. Không đổi nhãn checklist thành automated
nếu chưa có test file/assertion thực thi tương ứng; không biến automated PASS thành manual PASS; xác nhận của owner không kèm log
ghi là `OWNER-REPORTED`.
