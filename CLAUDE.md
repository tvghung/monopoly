# Hướng dẫn làm việc với Cờ Tỷ Phú Việt Nam

## Nguồn sự thật duy nhất

Tài liệu điều hướng, phạm vi và quy tắc thay đổi của project nằm tại:

`project-document/monopoly-websockets/`

Code và test là bằng chứng thực thi. Nếu code, schema và tài liệu lệch nhau,
thay đổi chưa hoàn tất.

## Bắt buộc đọc trước khi sửa

1. `project-document/monopoly-websockets/README.md`.
2. `project-document/monopoly-websockets/monopoly.shared.instructions.md`.
3. Rule nền đúng khối: Client, Api, GameCore, Shared contracts hoặc Persistence.
4. `README.md` index và file `.instruction.md` đúng module.
5. Cross-link tới producer/consumer và checklist trong `testcase/`.

## Map code tới tài liệu

| Khối | Đường dẫn chính | Tài liệu bắt đầu |
| --- | --- | --- |
| Client | `apps/client/` | `monopoly.client.instructions.md` → `Client/README.md` |
| Desktop shell | `apps/desktop/` | `../ui-ux-overhaul/01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md` → Client/runtime rules |
| HTTP/Socket | `apps/server/src/createServer.ts`, `apps/server/src/socket/` | `monopoly.api.instructions.md` → `Api/README.md` |
| GameCore/room aggregate | `apps/server/src/rooms.ts`, `apps/server/src/game/` | `monopoly.game-core.instructions.md` → `GameCore/README.md` |
| Volatile room/session/runtime services | `apps/server/src/persistence/`, `apps/server/src/services/` | `Persistence/README.md` |
| Shared contracts/schema | `packages/shared/src/` | `monopoly.contracts.instructions.md` → `Shared/README.md` |
| Tests | `apps/**/**.test.ts*` | `testcase/README.md` |

## Invariants kiến trúc bắt buộc

- `PlayerId` là UUID ổn định; `socket.id` chỉ là định danh connection runtime.
- Raw reconnect token chỉ trả qua ACK và lưu phía client. Server chỉ lưu SHA-256
  hash; không đưa raw token/hash vào log, `socket.data` hoặc public state.
- `disconnect` chỉ đổi presence. Chỉ `leave room` mới revoke session và loại seat.
- Mỗi player có tối đa một active connection; connection mới nhất thắng. Stale
  disconnect phải bị chặn bằng connection generation.
- Actor của command luôn lấy từ authenticated `socket.data.playerId`; không tin
  `playerId`, owner, seller hoặc buyer do client gửi.
- Desktop Host room creation cần capability bí mật theo server process và mã phòng
  do Electron main cấp. Guest admission phải gắn room ID đã tồn tại; pending Guest
  không được tạo lại room đã xóa dù mã phòng được dùng lại.
- Giới hạn admission/HTTP theo khóa client lấy từ TCP peer (`socket/clientIdentity.ts`);
  `CF-Connecting-IP` chỉ được đọc từ peer loopback của Online Host (`OTB_ONLINE_ROOM_CODE`,
  edge Cloudflare tự gán và trả 403 nếu khách gửi sẵn), không bao giờ `X-Forwarded-For` /
  `True-Client-IP`. Trạng thái limiter phải bị chặn bộ nhớ.
- Binary `cloudflared` chỉ tin digest ghim trong `apps/desktop/cloudflared-integrity.json`
  (archive, executable, license), không tin checksum nằm cạnh file hay `PATH`. Quick Tunnel
  chạy với `--config` rỗng riêng và không có biến `TUNNEL_*`; không đọc/sửa cấu hình của user.
- ACK lỗi runtime RAM không phân loại theo thuộc tính `code`; `DATABASE_UNAVAILABLE` chỉ còn là
  mã tương thích (deprecated), server không phát. Store đã `close()` từ chối transaction mới.
- Public room dùng `room:<roomId>`; private delivery dùng `player:<playerId>`.
- Mọi payload mạng được parse bằng runtime schema. Mọi state-changing command có
  typed ACK và chỉ ACK/broadcast sau khi RAM transaction commit.
- Mutation cùng room chạy tuần tự qua room command executor trên draft state.
  Save thất bại phải bỏ draft, không commit revision hoặc broadcast.
- Host server process là authority. Room, session, offer và snapshot chỉ nằm
  trong RAM. Process kết thúc thì mọi room/token mất vĩnh viễn; helper crash
  không được restart để giả khôi phục ván cũ.
- Không persist presence, socket mapping, raw token, timer handle hoặc countdown
  tick. Offer/turn/payment-shortfall/forced-sale giữ absolute deadline trong RAM
  để xử lý reconnect khi cùng process vẫn sống.
- Lifecycle room là `LOBBY → IN_PROGRESS → FINISHED`; chỉ command `play again` của
  host đã xác thực mới mở lại cùng room theo `FINISHED → LOBBY`.
- Host là stable player; disconnect không transfer host. Lobby cần 2–4 active,
  connected và ready players để host start (2v2: đúng 4, mỗi đội 2).
- Standard Mode dùng board Việt Nam cố định 40 ô, đơn vị số nguyên game-unit
  (`1 unit = 1.000 VNĐ`), socket protocol v11 và snapshot schema v10
  (`SOCKET_PROTOCOL_VERSION = 11`, `ROOM_SNAPSHOT_SCHEMA_VERSION = 10`). `BoardState.rollSequence`
  là public identity ổn định trong đời host, bắt đầu từ `0`, tăng đúng một lần cho mỗi gameplay
  roll đã commit, không tăng cho starting-player tie-break hoặc command rollback.
  Không đổi index hoặc
  economy chỉ vì đổi nhãn hiển thị.
- `completeTurnResolution` là điểm duy nhất handoff và v4 chỉ có
  `ADVANCE_TURN`; đổ đôi không cấp thêm lượt. `PendingTurnContinuation` nhúng trong
  các wait, pending purchase/development landing decision, `PaymentQueue`, private
  `GamePrivateState.decks`, `PendingCardInteraction` và forced-sale proposal đều
  thuộc authoritative room aggregate và phải reconnect-safe khi host còn sống. Card landing lấy và
  reveal ngay top card vào operation ID, `REVEALED` state với `revealedCardId`,
  continuation và server deadline; chỉ `dismiss card` hiện hành áp dụng sau
  commit. `AWAITING_DRAW`/`draw card` chỉ còn cho protocol-9 legacy compatibility.
- `DeckState` và thứ tự thẻ không được phát trong public DTO. Public V8 có bounded
  `gameplayEvents` và typed `activityFeed`; private aggregate state có per-player
  semantic lanes và `completedCardOperations`, nhưng client chỉ nhận đúng
  projection được phép để render. Credential, private offer và hidden deck order
  vẫn nằm ngoài public projection. SQL lịch sử `009_activity_feed_v8.sql` nâng V7
  snapshot lên V8 bằng activity baseline rỗng, không dựng lại lịch sử log.
  Protocol V9 bổ sung `TAX` money/debt semantics và `TILE_LANDED`; snapshot V8 cũ
  vẫn hợp lệ nên không cần migration dữ liệu. Protocol V10 bổ sung 2v2 Teamplay và
  snapshot V9 (`010_teamplay_v9.sql`: `gameMode`, `teams`, `teamPlay`, `winningTeamId`,
  `PaymentQueue.rescue`, `teamId` trên mọi player record). Protocol V11 bổ sung ghế sảnh 2v2 và kick của host
  (snapshot V10, `011_lobby_seats_v10.sql`: `Player.teamSlot`, `boardState.seatSwapRequests`).
- 2v2 Teamplay (`GameCore/team-play.instruction.md`): `GameMode` do host chọn chỉ ở
  `LOBBY` (đổi mode reset Ready mọi người); mọi thành viên đổi tên/màu **đội mình** (không đội kia), tự nhảy vào ghế trống hoặc xin
  đổi chỗ (người kia phải đồng ý; host không di chuyển được người khác), host chỉ có `kick player` ở sảnh; tiền và `ownedProps` luôn theo `PlayerId`, không có
  ví chung. Team rule chạy ở server qua `isTeamMode`/`packages/shared/src/teams.ts`: thuê tài
  sản của đồng đội được miễn (thẻ vẫn tính), đủ khu màu nhân thuê (Solo ×1,5, đội ×2, làm tròn
  xuống, không bao giờ khóa xây), Ga/Công Ty tính theo đội, Team Investment trả bằng tiền người
  dừng chân và hoàn tiền bán cho chủ ô, lượt xen kẽ `A1,B1,A2,B2` (`slotOrder` giữ cho hồi
  sinh), phá sản từng người nhưng đội thua khi hết active, hồi sinh (`REVIVE_COST`/
  `REVIVE_STARTING_CASH`, năm lượt của người sống sót, mỗi người một lần, không áp dụng cho
  `LEFT`) và Emergency Rescue (`PaymentQueue.rescue`, chỉ khi người nợ đã hết tài sản thanh lý,
  đồng đội phải trả đủ phần còn thiếu, tiền đi thẳng tới creditor, từ chối/hết hạn → phá sản
  thường, deadline absolute giữ trong RAM). Client chỉ hiển thị public state qua `game/team/teamView.ts`.
- Client display state không thay authoritative room state. `SESSION_SYNC`,
  `SPECTATOR_SYNC` và `REPLAY_SYNC` reset presentation queue/snap; chỉ
  `LIVE_UPDATE` mới animate state diff. Activity tail trong live update phải chờ
  cùng PresentationQueue gate, còn reconnect/replay chỉ hydrate snapshot hiện tại.
  Queue failure phải resolve, và reconnect không replay lịch sử.
- WebGL board chỉ render `BoardRenderModel` derive từ authoritative state cộng
  presentation state. Camera orthographic cố định, `frameloop="demand"`; callback
  hoàn tất local SDF text phải invalidate frame để tên ô hiện mà không cần tương tác.
- Property chassis giữ màu trung tính. Tám district dùng tám material/texture pair
  textless dùng chung theo `surfaceKey`; district accent không biểu diễn ownership.
  Surface batch phải theo cùng tile-motion matrix với chassis. WebGL fallback và
  40 semantic tile buttons vẫn là accessibility/compatibility boundary bắt buộc.
- Desktop Electron phải giữ `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, preload bridge typed/whitelist-only và packaged `app://` path
  traversal guard. Main process chỉ là shell/runtime/window boundary, không chứa
  GameCore hoặc bypass server authority.
- Active-game desktop close là disconnect để reconnect; không emit `leave room`.
  Chỉ nút `Bỏ cuộc`/explicit leave mới revoke session. Prompt/confirmation dùng
  central Modal/ConfirmationDialog; không thêm `window.confirm`.

## Quy tắc cập nhật đồng bộ

- Đổi event/payload/ACK: sửa Shared schema, server handler, client caller/listener,
  Api/Client/Shared docs và testcase.
- Đổi public/private state: sửa projector, shared types, client consumer và test
  chống rò credential.
- Đổi volatile store/schema/deadline: thêm transaction, cleanup/reconnect/process-loss
  test và cập nhật `Persistence/` cùng hosting docs.
- Đổi room/session/host/ready/leave: cập nhật GameCore, player/lobby transport,
  Client lifecycle và restart/reconnect testcase.
- Đổi tile/card data: rà shared data, presentation duplicates, hard-coded index,
  docs và testcase. Không dọn code/tài liệu không liên quan.
- Đổi luật team/hồi sinh/Emergency Rescue/thuê theo đội: sửa `packages/shared/src/teams.ts` + `rules.ts`, `game/team*.ts`/`rescue*.ts`,
  `rooms.ts` (`assertTeamState`, snapshot upgrade helpers), projector, Lobby/HUD/WinnerBanner client, `GameCore/team-play.instruction.md`,
  how-to-play và `testcase/team-play.md`; Solo phải giữ nguyên (trừ bonus đủ khu ×1,5).
- Đổi payment/bankruptcy/transfer/forced sale: rà mọi producer của `DebtClaim`,
  policy transfer, proposal continuation, snapshot validation và test
  process-loss/reconnect trước khi hoàn tất.

## Kiểm tra trước khi hoàn tất

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Desktop checks:

```bash
pnpm --filter @monopoly/desktop typecheck
pnpm --filter @monopoly/desktop test
pnpm desktop:package
```

Với thay đổi lifecycle, phải chạy RAM transaction/reconnect và process-restart
scenario; room/token cũ phải không khôi phục. Không đổi nhãn checklist thành automated nếu chưa có
test file/assertion thực thi tương ứng.
