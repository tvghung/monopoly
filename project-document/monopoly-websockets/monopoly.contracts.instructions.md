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

## Contract rules

- `SOCKET_PROTOCOL_VERSION` phải được client gửi/kiểm tra cùng server. Client cũ
  nhận `UPGRADE_REQUIRED` thay vì chạy legacy unauthenticated flow.
- `PlayerId`, `RoomId`, `SessionId`, `OfferId`, `ForcedSaleProposalId` là stable opaque IDs.
- `PublicRoomState` có room revision, lifecycle, host, 2–4 limits, roster
  ready/connected và public `GameState`.
- `SocketData` chứa internal room/player/role/session/generation; không chứa raw token.
- `Ack<T>` là discriminated success/failure contract. State-changing request chỉ
  được ACK success sau durable commit.
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

- `SOCKET_PROTOCOL_VERSION = 5`; client/server cũ bị từ chối bằng
  `UPGRADE_REQUIRED`.
- Appearance contract dùng stable `CharacterId`/`PlayerColorId`; `set appearance`
  is strict, lobby-only, allows duplicate characters and enforces unique active
  lobby colors.
- Board Việt Nam canonical giữ index `0..39`, 8 color groups và toàn bộ numeric
  economy. Client presentation derive từ shared data, không có metadata duplicate.
- Shared state định nghĩa `PendingTurnContinuation`, pending purchase/development
  landing decisions, `PaymentQueue`/`DebtClaim`, forced-sale proposal, `TradeBundle`,
  transfer policy và public deck/card projections.
- Private persisted `GamePrivateState.decks.chance.drawPile` và
  `GamePrivateState.decks.chest.drawPile` giữ exact draw order;
  `heldJailFreeCardIds` nằm trên Player/private player projection. Các ID/order này
  không thuộc public `GameState`.

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
