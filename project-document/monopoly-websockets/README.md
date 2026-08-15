# Cờ Tỷ Phú Việt Nam — Documentation Source of Truth

## Mục đích

Thư mục này định vị code, invariant, contract, persistence và checklist kiểm thử
của `monopoly-websockets`. Code, migration và test là bằng chứng thực thi; tài liệu
phải được cập nhật trong cùng thay đổi.

## Kiến trúc hiện tại

| Khối | Code | Trách nhiệm | Bắt đầu đọc |
| --- | --- | --- | --- |
| Client | `apps/client/` | React/Vite; admission, lobby, reconnect/spectator UX và game UI | [monopoly.client.instructions.md](./monopoly.client.instructions.md) |
| Desktop | `apps/desktop/` | Electron shell, secure preload bridge, runtime/fullscreen/quit/external-link boundary, packaging | [../ui-ux-overhaul/01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md](../ui-ux-overhaul/01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md) |
| API | `apps/server/src/createServer.ts`, `apps/server/src/socket/` | Express/Socket.IO, runtime validation, authenticated commands và ACK | [monopoly.api.instructions.md](./monopoly.api.instructions.md) |
| GameCore | `apps/server/src/rooms.ts`, `apps/server/src/game/` | Room aggregate và luật game dùng stable player ID | [monopoly.game-core.instructions.md](./monopoly.game-core.instructions.md) |
| Persistence | `apps/server/src/persistence/`, `apps/server/src/services/`, `apps/server/migrations/` | PostgreSQL, sessions, CAS command execution và recovery | [Persistence/README.md](./Persistence/README.md) |
| Shared | `packages/shared/src/` | State/event/ACK types, Zod schemas, board/card data | [monopoly.contracts.instructions.md](./monopoly.contracts.instructions.md) |
| Test/deploy | `apps/**/*.test.ts*`, `.github/`, root configs | Unit, Socket/client/PostgreSQL/restart gates và single-service deployment | [testcase/README.md](./testcase/README.md) |

Ứng dụng vẫn là một Node service phục vụ client cùng origin. PostgreSQL là durable
dependency bắt buộc trong production; không có runtime memory fallback. Player-facing
product là Vietnamese-only **Cờ Tỷ Phú Việt Nam — Standard Mode**; package/path kỹ
thuật `monopoly-*` được giữ để tránh cosmetic refactor.

## Invariants nguồn thẩm quyền

- Public player identity là stable UUID. `socket.id` không được dùng làm owner,
  buyer, seller, turn hoặc winner identity.
- Browser giữ raw reconnect token; database chỉ giữ SHA-256 hash.
- Valid token reclaim đúng Seat. Newest authenticated connection wins.
- Disconnect chỉ đổi runtime presence; explicit `leave room` mới revoke/remove.
- Room lifecycle là `LOBBY → IN_PROGRESS → FINISHED`; host/ready thuộc durable room.
- Lobby cần 2–7 active players, tất cả connected và ready; chỉ host được start.
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
- Hidden `GamePrivateState.decks`, `PaymentQueue` và forced-sale proposal nằm trong
  snapshot v4 nhưng public projector không được lộ deck order hoặc proposal terms
  cho người chơi khác.
- Client presentation queue is a derived display layer only: reconnect/session
  snapshots snap/reset and live public revisions may animate observable diffs.
- Electron is an optional desktop shell around the same client/server contract;
  it does not own gameplay state, identity, persistence or server authority.

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
| Desktop shell/runtime | Client/runtime docs + `apps/desktop` security tests + manual quit/fullscreen checklist |

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
