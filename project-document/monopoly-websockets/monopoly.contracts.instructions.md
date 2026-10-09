# Rule nền Shared contracts và game data

## Phạm vi

Áp dụng cho `packages/shared/` và mọi consumer của `@monopoly/shared`.

## Phân lớp

| File | Nội dung |
| --- | --- |
| `types.ts` | Stable IDs, lifecycle/room/public state, game state, session và offer DTO |
| `events.ts` | Typed Socket.IO events, request-scoped ACK và SocketData |
| `socketSchemas.ts` | Zod runtime schemas cho mọi inbound payload |
| `tileState.ts`, card files | Static board/card data |
| `rules.ts` | Số luật Standard Mode mà server thi hành và client hiển thị (start cash, thưởng Xuất Phát, thuê Ga/Công Ty, 70% bán bắt buộc, vòng chờ tù, thời hạn); `apps/server/src/rulesContract.test.ts` giữ khớp với server |

## Contract rules

- `SOCKET_PROTOCOL_VERSION` phải được client gửi/kiểm tra cùng server. Client cũ
  nhận `UPGRADE_REQUIRED` thay vì chạy legacy unauthenticated flow.
- `PlayerId`, `RoomId`, `SessionId`, `OfferId`, `ForcedSaleProposalId` là stable opaque IDs.
- `PublicRoomState` có room revision, lifecycle, host, 2–4 limits, roster
  ready/connected và public `GameState`.
- `SocketData` chứa internal room/player/role/session/generation; không chứa raw token.
- Desktop `join room` may carry a Host creation capability scoped to the helper
  process and selected room code. It is never written to SocketData or a public
  DTO. An existing-room Guest admission records the internal room ID in RAM.
- `Ack<T>` là discriminated success/failure contract. State-changing request chỉ
  được ACK success sau khi RAM transaction commit (failed command bỏ draft, không ACK success/broadcast).
- `update` phát `PublicRoomState`, không phát raw persistence record.
- Session/private-offer DTO chỉ gửi đúng client liên quan.

## Runtime validation

Types vẫn bảo vệ compile time; Zod schemas mới bảo vệ network boundary. Schema parse
không thay thế business authority. Handler tiếp tục kiểm tra authenticated actor,
room lifecycle, owner/current-turn/balance và version-dependent conditions.

Payload không hợp lệ trả ACK `INVALID_REQUEST`; không được throw do index ngoài board,
`NaN`, số âm hoặc fabricated object.

## Event changes

- Lifecycle: `join room`, `resume session`, `set ready`, `leave room`; không còn
  `new player`.
- Mọi command gameplay/chat/trading có ACK.
- `start game`, `roll dice`, jail và `wait in jail` no-business-payload commands
  không dùng dummy string/boolean. Buy/do-not-buy/development payloads chỉ mang
  operation ID và action được schema cho phép.
- Trading request không mang actor. Accept/decline chỉ mang `{offerId}`.
- Outbound bổ sung `offer expired`, `offer cancelled` và `session replaced`.

## Persistence boundary

`PersistedGameState` loại `loaded`; persistence không được chứa socket identity,
presence, credential/private offer hay runtime timer. Payment/forced-sale/turn
recovery dùng stable operation/player/claim IDs và ISO absolute deadlines.

## Standard Mode contracts và game data

- `SOCKET_PROTOCOL_VERSION` (`packages/shared/src/types.ts`) và `ROOM_SNAPSHOT_SCHEMA_VERSION` (`apps/server/src/rooms.ts`)
  là version hiện hành; client lệch protocol bị từ chối bằng `UPGRADE_REQUIRED`. Lịch sử version và phần CURRENT DEVELOPMENT
  (vNext, unreleased): [Version history](./Shared/socket-and-state-contracts.instruction.md#version-history).
- Appearance contract dùng stable `CharacterId`/`PlayerColorId`; `set appearance`
  is strict, lobby-only, allows duplicate characters and enforces unique active
  lobby colors.
- Board Việt Nam canonical giữ index `0..39`, 8 color groups và toàn bộ numeric
  economy. Client presentation derive từ shared data, không có metadata duplicate.
- Shared state định nghĩa `PendingTurnContinuation`, pending purchase/development
  landing decisions, `PaymentQueue`/`DebtClaim`, forced-sale proposal, `TradeBundle`,
  transfer policy và public deck/card projections. `PendingCardInteraction` là
  operation-scoped state trong room aggregate (RAM). New landings are `REVEALED` with
  `revealedCardId`; legacy `AWAITING_DRAW` is retained only for protocol-9
  compatibility. The continuation and absolute deadline stay in the aggregate (reconnect-safe while the host process lives); the public projection also carries the whole `pendingCardInteraction` including `continuation` and `deadlineAt` (not scrubbed, `apps/server/src/services/publicState.ts`); `GamePrivateState`
  giữ private semantic lanes và `completedCardOperations`.
- Public `gameplayEvents` chỉ chứa bounded authoritative semantic families:
  `MONEY_TRANSFER`, `PROPERTY_TRANSFER`, `PASS_GO`, `SENT_TO_JAIL`,
  `JAIL_ROLL_FAILED` và `JAIL_RELEASED`. Private lanes are participant-scoped;
  exact deck order vẫn không thuộc public projection.
- Public `BoardState.activityFeed` là bounded typed event tail, ghi tại server
  producer points theo sequence riêng. Nó bao gồm join/chat/dice/purchase/
  transfer/development/card/jail/finish/start/landing facts cần để render Log; không bao
  giờ được dựng từ `boardState.logs`, private deck order hoặc private offer terms.
- `BoardState.rollSequence` là public non-negative safe integer, bắt đầu từ `0`
  và tăng đúng một lần cho gameplay `roll dice` đã commit; starting-player
  tie-break, rejected command và rollback không tăng sequence. `ROLL_DICE` phía
  client chỉ được derive khi sequence tăng đúng một bước.
- Private `GamePrivateState.decks.chance.drawPile` và
  `GamePrivateState.decks.chest.drawPile` giữ exact draw order;
  `heldJailFreeCardIds` nằm trên Player/private player projection. Các ID/order này
  không thuộc public `GameState`.
- Lịch sử protocol/snapshot (V8 activity feed → V12 bot seats, và bot difficulty CURRENT DEVELOPMENT) chỉ được ghi ở
  [Version history](./Shared/socket-and-state-contracts.instruction.md#version-history); không chép lại ở đây. Team rules
  shared by both sides live in `packages/shared/src/teams.ts`/`packages/shared/src/rules.ts`; see
  [GameCore/team-play.instruction.md](./GameCore/team-play.instruction.md).

Khi đổi static data/contract, đọc
[Shared/board-and-card-data.instruction.md](./Shared/board-and-card-data.instruction.md).

## Kiểm tra

```bash
pnpm --filter @monopoly/shared typecheck
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
