# Rule nền Client

## Phạm vi

Áp dụng cho `apps/client/`. Client không dùng React Router hoặc external state
library; các view đều nằm trên `/`.

## Application state machine

`App` phân biệt rõ:

- `JOIN`: chưa có valid local session.
- `JOINING`: chờ pending-token rồi activation ACK.
- `RESTORING`: có stored token và đang resume.
- `LOBBY`: active player trong room `LOBBY`.
- `GAME`: active player trong `IN_PROGRESS`/`FINISHED`; the finished state may
  transition to the existing lobby through host-only same-room Play Again.
- `RECONNECTING`: giữ snapshot, khóa mutation trong lúc transport/session phục hồi.
- `REPLACED`: connection mới hơn đã chiếm session; tab cũ dừng reconnect.
- `ERROR`: terminal hoặc retryable state có message rõ ràng.

Không vào Lobby/Board chỉ vì đã emit. View chỉ đổi sau success ACK authoritative.
`RoomRole` là trục riêng: `PLAYER` hoặc explicit `SPECTATOR`; spectator dùng game view
read-only thay vì một `AppPhase` riêng.

## Bootstrap/runtime desktop

Development endpoint contract:

- Vite serves the web renderer at `http://127.0.0.1:5173`.
- The game/Socket.IO server listens at `http://127.0.0.1:8080`.
- Vite proxies `/socket.io` to the server, while Electron connects directly to
  `http://127.0.0.1:8080`; the server allows the exact renderer origin by default.

- `AppBootstrap` chạy các stage `loading-settings` → `loading-runtime-config` →
  `loading-assets` → `initializing-client` → `ready`/`error`; loading UI chỉ hiển
  thị stage thực, không dựng phần trăm giả.
- Web đọc `__SOCKET_URL__`; desktop lấy `socketUrl`, `platform` và `appVersion`
  qua preload bridge. Socket được tạo ngoài `App` và inject vào `App` để giữ một
  lifecycle/session state machine duy nhất.
- Electron main chỉ quản lý window, runtime config, fullscreen, quit, external
  links và packaged renderer. Không expose Node/Electron API hoặc game command cho
  renderer; production renderer dùng `app://own-the-block` với path traversal guard.

## Session storage và reconnect

- Socket không dùng `socket.id` làm player identity.
- Versioned localStorage key là `monopoly.player-session.v1` và chỉ chứa
  `{version: 1, token}`.
- First join là hai bước: `join room` trả pending token → client lưu token →
  `resume session` activate/reclaim Seat.
- Mỗi Socket.IO `connect` có stored token phải resume trước khi bật gameplay action.
- Terminal session errors (`SESSION_INVALID`, `SESSION_REVOKED`, `SESSION_EXPIRED`,
  `ROOM_GONE`, `GAME_ALREADY_STARTED`, `ROOM_FULL`) mới clear storage.
  `DATABASE_UNAVAILABLE`/transport errors giữ token để retry.
- `session replaced` đưa tab cũ vào `REPLACED` nhưng không xóa shared localStorage.

## State và Socket

- `update` thay authoritative `PublicRoomState`; revision cũ phải bị bỏ qua.
- Context cung cấp stable `playerId`, `role`, public room/game state và typed command
  functions.
- Mọi mutation command có ACK. Authoritative UI state chỉ đổi theo committed update;
  form local có thể đóng sau emit nhưng ACK failure phải được hiển thị, không được
  tự tạo game-state success.
- During reconnect, gameplay/trading/lobby mutation controls bị disable; the typed
  activity tail hydrates on sync without replaying stale presentation.
- Private offer listeners dùng unique `offerId`; server `expiresAt` là authority.
- Listener/timer phải cleanup dưới React `StrictMode`.

## Role và visibility

- Player lobby thấy roster, host badge, ready controls và start state.
- Chỉ host có start action; button chỉ enabled khi 2–4 active players đều connected
  và ready.
- Spectator có banner rõ ràng, board/gameplay read-only và không thấy gameplay/trading
  mutation actions; `send chat` vẫn là ngoại lệ được server cho phép trong room đã bind.
- UI guards chỉ là UX. Server authenticated handler vẫn là authority.

## Animation/presentation

`displayPositions` là target display map cho board/character movement; nó có thể đi
trước authoritative settlement. `settledPositions` là map riêng dùng để gate dice,
buy và turn prompts cho tới khi presentation tới đúng tile. Không dùng display map
cho business authority. Reconnect snapshot không được tạo duplicate timer, listener
hoặc replay mutation.

Board/property presentation derive trực tiếp từ canonical shared `tileState`; không
duy trì bản sao `BoardInitState.ts` hoặc `backOfCards.ts`. Tất cả tiền hiển thị qua
formatter dùng `1 game unit = 1.000 VNĐ` và player-facing UI/log/error là tiếng Việt.

## Presentation queue

- `derivePresentationEvents(previous, next)` chỉ phát event chứng minh được từ
  hai `PublicRoomState`; không suy đoán rent/cause từ một diff chung.
- `AnimationQueue` là FIFO, cancellable, có pause/resume/skip/reset/speed và luôn
  resolve item khi executor lỗi. `reset` phải snap authoritative snapshot, tăng
  `presentationResetEpoch`, xoá tile/reaction signals và không để executor cũ ghi
  đè sau reconnect. Reset epoch độc lập với sequence của tile impact.
- Movement walk chỉ áp dụng cho bước tiến nhỏ; executor công bố target từng tile
  trước khi chờ hop, settle sau khi hop, phát `STEP` chỉ cho tile trung gian và để
  `LAND` xử lý riêng đúng một lần sau tile cuối. Lùi/teleport snap. Buy/turn prompt
  chờ `settledPositions`/queue settle; command vẫn gửi theo authoritative state.
- Public `gameplayEvents` is consumed as bounded semantic input for committed money,
  property, GO and jail consequences; the active player's private gameplay lane is
  consumed only through the same `PresentationController → AnimationQueue →
  PresentationStore` path. A missing/non-contiguous semantic tail resets to the
  authoritative snapshot instead of fabricating a consequence.
- `pendingCardInteraction` is durable and operation-scoped. `AWAITING_DRAW` exposes
  the face-down interaction, `REVEALED` exposes `revealedCardId`, and `draw card` /
  `dismiss card` send that operation ID through authoritative ACK flow. The card
  presentation is queued after the appropriate `LAND` boundary; a chained card
  closes before movement and opens the next interaction after landing.
- Session/reconnect hydration resets the queue/store to the current pending-card
  stage without replaying the old draw/reveal. Exact deck order remains server-private;
  `deckCounts` is the only deck aggregate used by the public board presentation.

## Quy tắc sửa

1. Sửa event phải cập nhật Shared schema, server handler và Api docs.
2. Không đưa token vào URL, DOM, toast hoặc log.
3. Không dùng public player ID/room code như credential.
4. Không tự retry command không idempotent sau ACK timeout; resume/resync trước.
5. Test cả valid resume, invalid/revoked token, newest-wins và listener cleanup.
6. Không render hidden `DeckState`, raw `PaymentQueue` internals hoặc credential;
   chỉ render public pending landing/payment-shortfall projection và private proposal
   terms for its seller/buyer.
7. Modal/prompt dùng `Modal`, `ConfirmationDialog` hoặc `Toast`; Escape/outside
   behavior, focus restore/trap, reduced motion và z-index phải tập trung ở primitive.
   Active-game `Bỏ cuộc` dùng confirmation; desktop close khi đang chơi chỉ
   disconnect để giữ reconnect token, không emit `leave room`.
- Desktop shell development có hai đường chạy: `pnpm dev:desktop` tự khởi động
  server/client; hoặc `pnpm dev:web` ở Terminal A và `pnpm dev:desktop:shell` ở
  Terminal B. Cả hai đều compile main/preload trước khi mở Electron.

## Kiểm tra

```bash
pnpm --filter @monopoly/client typecheck
pnpm --filter @monopoly/client test
pnpm lint
pnpm build
pnpm dev:desktop:shell
pnpm desktop:make
```
