# Cờ Tỷ Phú Việt Nam — Documentation Source of Truth

## Mục đích

Thư mục này định vị code, invariant, contract, persistence và checklist kiểm thử
của `monopoly-websockets`. Code, migration và test là bằng chứng thực thi; tài liệu
phải được cập nhật trong cùng thay đổi.

## Kiến trúc hiện tại

| Khối | Code | Trách nhiệm | Bắt đầu đọc |
| --- | --- | --- | --- |
| Client | `apps/client/` | React/Vite; admission, lobby, reconnect/spectator UX và game UI | [monopoly.client.instructions.md](./monopoly.client.instructions.md) |
| Desktop | `apps/desktop/` | Electron shell, secure preload bridge, app-owned managed PostgreSQL/server-helper Host runtime, LAN interface state, packaging | [../ui-ux-overhaul/07C_PHASE_7_2_FINAL_ENGINEERING.md](../ui-ux-overhaul/07C_PHASE_7_2_FINAL_ENGINEERING.md) |
| API | `apps/server/src/createServer.ts`, `apps/server/src/socket/` | Express/Socket.IO, runtime validation, authenticated commands và ACK | [monopoly.api.instructions.md](./monopoly.api.instructions.md) |
| GameCore | `apps/server/src/rooms.ts`, `apps/server/src/game/` | Room aggregate và luật game dùng stable player ID | [monopoly.game-core.instructions.md](./monopoly.game-core.instructions.md) |
| Persistence | `apps/server/src/persistence/`, `apps/server/src/services/`, `apps/server/migrations/` | PostgreSQL, sessions, CAS command execution và recovery | [Persistence/README.md](./Persistence/README.md) |
| Shared | `packages/shared/src/` | State/event/ACK types, Zod schemas, board/card data | [monopoly.contracts.instructions.md](./monopoly.contracts.instructions.md) |
| Test/deploy | `apps/**/*.test.ts*`, `.github/`, root configs | Unit, Socket/client/PostgreSQL/restart gates và single-service deployment | [testcase/README.md](./testcase/README.md) |

Cloud deployment is one Node service serving the same-origin client. Packaged
desktop Host mode instead supervises the same server plus managed PostgreSQL:
PostgreSQL stays on `127.0.0.1`, while the game HTTP/Socket server binds
`0.0.0.0` on an OS-selected port and serves the explicit bundled client root.
Remote browsers use the selected IPv4 URL; the host renderer uses loopback. There
is no UDP/mDNS discovery or runtime memory fallback. Player-facing
product là Vietnamese-only **Cờ Tỷ Phú Việt Nam — Standard Mode**; package/path kỹ
thuật `monopoly-*` được giữ để tránh cosmetic refactor.

## Invariants nguồn thẩm quyền

- Public player identity là stable UUID. `socket.id` không được dùng làm owner,
  buyer, seller, turn hoặc winner identity.
- Browser giữ raw reconnect token; database chỉ giữ SHA-256 hash.
- Valid token reclaim đúng Seat. Newest authenticated connection wins.
- Disconnect chỉ đổi runtime presence; explicit `leave room` mới revoke/remove.
- Room lifecycle là `LOBBY → IN_PROGRESS → FINISHED → LOBBY`; bước cuối chỉ do
  command `play again` của host đủ quyền thực hiện trong cùng room.
- Lobby cần 2–4 active players, tất cả connected và ready; chỉ host được start.
- Join không token sau start là spectator; valid player token luôn được xét trước.
- Mọi inbound payload qua runtime schema. Actor lấy từ authenticated SocketData.
- Mọi authoritative command được serialize theo room, commit PostgreSQL transaction,
  rồi mới ACK/broadcast monotonic room revision.
- Public projector không phát session/token hash/private offers. Private delivery dùng
  `player:<playerId>`, public delivery dùng `room:<roomId>`.
- Offer, turn recovery, payment shortfall và forced-sale proposal dùng absolute
  deadline; timer handle không persist.
- Board giữ index `0..39` và economy số nguyên hiện tại; `1 game unit = 1.000 VNĐ`.
- Successful `completeTurnResolution` chỉ handoff `ADVANCE_TURN`; buy/development
  landing decision dùng operation ID, còn payment/forced-sale wait nhúng durable
  `PendingTurnContinuation` thay vì advance sớm.
- Hidden `GamePrivateState.decks`, `PaymentQueue`, `PendingCardInteraction` và
  forced-sale proposal nằm trong snapshot v8 nhưng public projector không được lộ
  exact deck order hoặc proposal terms cho người chơi khác. V8 bổ sung bounded
  public `gameplayEvents` và typed `activityFeed`, cùng per-player private
  semantic lanes và `completedCardOperations`; card draw/dismiss vẫn do server
  commit và operation ID điều khiển. Appearance identity dùng `CharacterId`
  nullable và `PlayerColorId` ổn định. Migration `009_activity_feed_v8.sql` nâng
  V7 snapshot lên V8 bằng activity baseline rỗng, không dựng lại lịch sử.
- Client presentation queue is a derived display layer only: reconnect/session and
  `FINISHED → LOBBY` replay snapshots snap/reset; live public revisions may animate
  observable diffs, with the typed activity tail gated by the same queue.
  Board đọc display target, còn action gates đọc settled position; reset epoch không
  dùng chung sequence với tile impact.
- Electron is an optional desktop shell around the same client/server contract;
  it owns process lifecycle but not gameplay state, identity, persistence rules or
  server authority. Renderer reload does not stop Host authority.

## Thứ tự đọc

1. File này.
2. [monopoly.shared.instructions.md](./monopoly.shared.instructions.md).
3. Rule nền đúng khối.
4. README index và file leaf đúng module.
5. Cross-link tới persistence/contracts/producer/consumer.
6. [testcase/README.md](./testcase/README.md) và checklist liên quan.

## Tra nhanh

| Muốn sửa | Mở trước | Code chính |
| --- | --- | --- |
| Join/resume/reconnect/token | [Client/join-room.instruction.md](./Client/join-room.instruction.md), [Api/socket-session.instruction.md](./Api/socket-session.instruction.md) | `App.tsx`, `playerSessionStorage.ts`, `socket/session.ts`, `playerSessionService.ts` |
| Host/lobby/ready/leave | [GameCore/room-lifecycle.instruction.md](./GameCore/room-lifecycle.instruction.md), [Api/socket-lobby.instruction.md](./Api/socket-lobby.instruction.md) | `Lobby.tsx`, room aggregate, `socket/lobby.ts` |
| DB/schema/CAS/recovery | [Persistence/postgres-and-recovery.instruction.md](./Persistence/postgres-and-recovery.instruction.md) | `persistence/`, `services/`, `migrations/` |
| Turn/payment shortfall/bankruptcy/recovery | [GameCore/turn-movement-and-bankruptcy.instruction.md](./GameCore/turn-movement-and-bankruptcy.instruction.md) | `game/turn.ts`, `game/payment.ts`, turn handler, deadline scheduler |
| Trading/private offer | [Client/trade-offers.instruction.md](./Client/trade-offers.instruction.md), [Api/socket-trading.instruction.md](./Api/socket-trading.instruction.md) | trading handler, `trade_offers`, offer UI |
| Property/building/forced sale | [GameCore/property-economy.instruction.md](./GameCore/property-economy.instruction.md) | `game/property.ts`, `game/transfer.ts`, `socket/debt.ts` |
| Contracts/runtime schema | [Shared/socket-and-state-contracts.instruction.md](./Shared/socket-and-state-contracts.instruction.md) | `types.ts`, `events.ts`, `socketSchemas.ts` |
| WebGL board/surface art/motion | [Client/game-board.instruction.md](./Client/game-board.instruction.md) | `Board.tsx`, `game/scene/GameScene.tsx`, `game/scene/board/` |
| HTTP/readiness/deploy | [Api/http-runtime.instruction.md](./Api/http-runtime.instruction.md) | create/start server, migration startup, Docker/Render/CI |
| Board/card/deck data | [Shared/board-and-card-data.instruction.md](./Shared/board-and-card-data.instruction.md) | shared canonical board/cards và private deck state |

## Quy ước tài liệu

- `*.instructions.md`: rule nền toàn khối.
- `*.instruction.md`: behavior chi tiết của màn hình/module.
- `README.md`: index, mapping và navigation.
- `testcase/*.md`: phân biệt assertion tự động thật với manual/missing coverage.
- Không ghi proposal/legacy flow trong tài liệu AS-IS.
- Không gọi UI visibility là security. Authority nằm ở authenticated handler/domain.
- Environment/event/type phải giữ đúng spelling và casing trong code.

## Ma trận cập nhật

| Thay đổi | Tài liệu phải cập nhật |
| --- | --- |
| Event/payload/ACK/schema | Api module + Shared contract + Client consumer + testcase |
| Public/private state | Shared + projector/consumer docs + leak/privacy tests |
| Game rule/aggregate | GameCore + Api/Client consumers + persistence serialization + testcase |
| Session/room lifecycle | Client join/lobby + socket session/lobby + room lifecycle + persistence + restart test |
| SQL/snapshot/deadline | Persistence + HTTP/deploy + affected GameCore/Api + integration test |
| Tile/card index/data | Shared data + client duplicates + hard-coded core indices + testcase |
| Desktop shell/runtime | Client/runtime + API HTTP + persistence docs + packaged proofs + manual install/device checklist |

## Baseline

```bash
pnpm db:status
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Persistence change còn phải chạy PostgreSQL integration và server-restart scenario
trên cùng database.

Phase 7.2 desktop/mobile gates additionally use:

```bash
pnpm desktop:package
pnpm --filter @monopoly/desktop proof:packaged
pnpm desktop:proof:host
pnpm test:e2e:mobile
```

The packaged proofs are platform-scoped automated evidence. Physical
desktop-to-desktop LAN, real phones/tablets, installers, firewall prompts, signing,
and notarization remain separately recorded manual/release evidence.
