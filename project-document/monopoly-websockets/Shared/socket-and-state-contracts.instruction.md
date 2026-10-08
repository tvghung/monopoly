# Socket, Standard Mode state và transfer contracts

## Code nguồn

- `packages/shared/src/types.ts`
- `packages/shared/src/events.ts`
- `packages/shared/src/socketSchemas.ts`
- `packages/shared/src/index.ts`

## Identity/protocol

- Stable aliases: `PlayerId`, `RoomId`, `SessionId`, `OfferId`, `GameCardId` và
  operation IDs cần cho durable continuation.
- `JoinRoomRequest.hostCapability?` is a strict 64-character lowercase hex value
  used only by the desktop Host's initial room creation. It is never part of a
  public room DTO, invitation or reconnect credential. The server verifies it
  against the process and selected room code before granting creation.
- `DATABASE_UNAVAILABLE` stays in the v11 `AckErrorCode` union, marked `@deprecated`, only so
  a current client can still render the code if an older v11 Host sends it (the client keeps
  its localized text, now "game service temporarily unavailable"). The RAM server never emits
  it and no code path maps an error to it. A closed runtime and an unexpected exception both
  map to sanitized `INTERNAL_ERROR` (non-retryable and retryable respectively), while CAS
  conflict (`CONFLICT`, retryable) and missing room (`ROOM_GONE`) keep their codes. Removing
  the union member needs a protocol bump and is deliberately not part of this change.
- `RoomStatus`: `LOBBY | IN_PROGRESS | FINISHED`; `RoomRole`:
  `PLAYER | SPECTATOR`.
- `SOCKET_PROTOCOL_VERSION = 11`; older clients nhận `UPGRADE_REQUIRED`, không chạy legacy
  state/payload.
- `CharacterId` và `PlayerColorId` là stable shared appearance IDs. `set appearance`
  nhận strict character-only, color-only hoặc combined payload; empty/unknown keys
  bị từ chối.
- Stable public ID không phải credential. Raw reconnect token không thuộc
  `PublicRoomState`, `GameState`, `SocketData`, log hoặc snapshot.

## Standard Mode aggregate

Public/persisted types dùng stable IDs và phân biệt hidden state:

- Turn không còn `doublesStreak`/extra-roll. `TurnInfo` biểu diễn purchase hoặc
  same-landing development wait bằng operation ID và `PendingTurnContinuation`.
- `PendingTurnContinuation.resume.kind` chỉ còn các hướng tiếp tục cần cho card,
  jail và payment recovery; không có auction continuation.
- Payment: `PaymentQueue` giữ `orderedClaims: DebtClaim[]`, `activeClaimIndex`,
  `continuation` và `actionDeadlineAt`. Mỗi claim bắt buộc có `debtorPlayerId`,
  `creditor: 'PLAYER' | 'BANK'`, optional `creditorPlayerId`, `amount`,
  `remainingAmount`, `source`; `claimId` và optional `status` là metadata
  idempotency/recovery.
- Payment shortfall giữ `orderedClaims`, `activeClaimIndex`, absolute deadline và
  deterministic forced-sale proposal (tối đa một proposal trong snapshot).
- Cards: private persisted `GamePrivateState.decks.chance.drawPile` và
  `.chest.drawPile`; Player giữ `heldJailFreeCardIds`. Public projection chỉ lộ
  counts cần cho UI, không lộ holder IDs/order/card kế tiếp. `PendingCardInteraction`
  is durable and operation-scoped. New landings are `REVEALED` with
  `revealedCardId`; legacy `AWAITING_DRAW` remains for protocol-9 compatibility.
  Continuation and deadline remain durable; `dismiss card` is the current
  authoritative commit/ACK command, while `draw card` is compatibility-only.
- `BoardState.gameplayEvents` is a bounded public semantic stream for
  `MONEY_TRANSFER`, `PROPERTY_TRANSFER`, `PASS_GO`, `SENT_TO_JAIL`,
  `JAIL_ROLL_FAILED` and `JAIL_RELEASED`. `GamePrivateState` additionally stores
  per-player private gameplay lanes and `completedCardOperations`.
- `BoardState.activityFeed` is a separate bounded public typed tail for the
  existing Log surface. Server producers append join/chat/dice/property/money/
  development/card/jail/bankruptcy/start/finish facts with monotonic sequence and
  UUID identity; clients never infer categories from legacy HTML logs.
- 2v2 (protocol 10, seats in 11): `BoardState.gameMode`, `teams`, `teamPlay` (`slotOrder`, `revivedPlayerIds`, `reviveWindows`) and `winningTeamId`;
  `Player`/`FinishedPlayer`/`Winner`/`RoomPlayerMeta` carry `teamId`; `PaymentQueue.rescue` is the open `EmergencyRescueOffer`.
  `PublicBoardState` replaces `teams`/`teamPlay` with `PublicTeam[]` (with member IDs) and `PublicTeamPlayState`
  (`reviveWindows` name the survivor; `slotOrder` stays private). Requests: `SetGameModeRequest`, `SetTeamNameRequest {name}`,
  `SetTeamColorRequest`, `RescueDecisionRequest {rescueId}`; `revive teammate` has no payload.
- Bot seats (protocol 12, snapshot 11): `PLAYER_KINDS`/`PlayerKind`, `RoomPlayerMeta.kind` (always set; `connected` is true
  for an active bot), server-only `RoomMember.kind` (absent = HUMAN), `BoardState.matchId` (UUID per started match, null in
  a lobby), `AddBotRequest {requestId, seat?}` → `AddBotResult {playerId}`, `RemoveBotRequest {playerId}`, `MAX_BOTS_PER_ROOM`.
- Lobby seats (protocol 11): `Player.teamSlot` (`TeamSlot` 0|1) and `RoomPlayerMeta.teamSlot` (`PublicPlayer` omits it); `BoardState.seatSwapRequests`
  (`SeatSwapRequest {requesterPlayerId, targetPlayerId}`, public, empty outside a 2v2 lobby). Requests: `MoveToSeatRequest {teamId, teamSlot}`,
  `RequestSeatSwapRequest {targetPlayerId}`, `RespondSeatSwapRequest {requesterPlayerId, accept}`, `KickPlayerRequest {playerId}`;
  `cancel seat swap` has no payload. Server → client `removed from room` carries `RemovedFromRoomInfo {code: 'REMOVED_BY_HOST', message}`.
  `swap team` and `SwapTeamRequest` no longer exist. `REVIVE_WINDOW_SURVIVOR_TURNS` is 5 (a persisted window therefore has
  `turnsRemaining` 1–5; older windows of at most 3 stay valid). Money reasons gain
  `REVIVE` and `RESCUE`; activity gains `TEAM_REVIVE` and `EMERGENCY_RESCUE`, `PROPERTY_DEVELOPMENT` an optional
  `ownerPlayerId/ownerName` and `GAME_FINISHED` optional `winningTeamId/winningTeamName`. Rules: [../GameCore/team-play.instruction.md](../GameCore/team-play.instruction.md).
- Jail wait progress (`jailOpponentRoundsElapsed`) là state authoritative, được giữ
  nguyên qua payment/restart; không có third-failed-roll hoặc stored-dice state.

`PersistedGameState`/room snapshot V9 chứa durable fields trên và bỏ `loaded`, presence,
credential, socket ID, countdown tick/timer handle. `BoardState.gameStartedAt?: string | null`
là ISO timestamp authoritative được set tại transition `LOBBY -> IN_PROGRESS`; `freshState()`
dùng `null`, schema chấp nhận missing/null để hydrate snapshot cũ, và public projection
giữ giá trị này cho compatibility/public state. Board client hiện không render center timer
và không cần đưa timestamp vào scene render model. Client không tự khởi tạo timestamp từ
mount/reconnect.

`BoardState.rollSequence` là public durable non-negative safe integer. Fresh state
starts at `0`; historical V5 → V6 migration 007 also starts at `0` without
reconstructing historical rolls. Current V7 → V8 migration 009 initializes an empty
activity baseline without reconstructing history. The server increments it once after accepted dice generation
inside the gameplay transaction, including jail attempts but excluding
starting-player tie-breaks, rejected commands, and rolled-back transactions.

## Transfer/trading

`PropertyTransferPolicy` là:

```text
VOLUNTARY
RETURN_TO_BANK
BANK_PURCHASE
FORCED_SALE
```

`TradeBundle` có hai side `offered` và `requested`; mỗi side biểu diễn money,
property IDs và jail-free `GameCardId`s. Không có Nhà/Khách Sạn trực tiếp trong bundle.
Runtime schema yêu cầu:

- amount là integer không âm trong bundle; offer tổng thể phải trao ít nhất một
  asset và không cho cùng asset xuất hiện hai phía.
- tile `0..39`, unique card/property IDs và bounded money.
- buyer/owner/actor không được lấy từ client payload; server derive từ authenticated
  session và authoritative ownership.

Private offer vẫn có stable `offerId`, participants, status và absolute expiry;
persisted row chứa complete canonical terms để accept/restart không phụ thuộc client
hay board label hiện tại.

## Events/ACK

- Mọi state-changing inbound kết thúc bằng typed `AckCallback<T>`; success chỉ sau
  commit và có protocol/revision, failure có stable code/message/retryable.
- Turn/buy/jail/property/payment/trade command actor lấy từ
  `socket.data.playerId`.
- Buy/development/forced-sale payloads chỉ mang operation/claim/proposal IDs; tile,
  owner, seller, buyer và giá Bank đều được derive từ snapshot. Ngoại lệ có chủ ý (V1.1): `propose forced sale` có thêm
  `price?` (`moneyAmountSchema`, số nguyên dương) là giá người bán đòi; vắng mặt thì dùng giá Bank. `ForcedSaleProposal.grossPrice`
  là giá đã thỏa thuận (không còn bắt buộc bằng công thức Bank). Field optional nên protocol vẫn 9 và snapshot vẫn 8.
- Public `update(PublicRoomState)` tách khỏi private offer/session delivery.
- `play again` is a no-payload, host-only command accepted only in `FINISHED`; it
  resets the same room through the canonical fresh-state path and ACKs only after
  the committed `FINISHED → LOBBY` transition. No `new player` payload or
  client-supplied actor is accepted.

## Runtime schemas và boundaries

- Zod strict objects validate name/room/token/UUID/tile/money/chat/trade bundle và
  exact argument count; domain vẫn authorize role/turn/owner/debt/state sau parse.
- Public projector whitelist room/roster/game fields và scrub exact `DeckState`,
  credentials, private offer rows và internal continuation details không cần cho UI.
- Client bỏ stale revision; server commit RAM transaction trước ACK/broadcast.

## Tests

- Protocol v8 mismatch; payload/ACK compile/runtime validation, including `play again`.
- Strict appearance/`TradeBundle`, payment shortfall, landing decision, durable card
  interaction, semantic lanes and snapshot v7 validation.
- Strict board snapshot validation cho `activityFeed`, `gameStartedAt` optional/null và compatibility với
  snapshot cũ không có field; start timestamp persistence/public projection.
- Public no-leak assertion cho token/hash/session/private offer/exact deck order and
  hidden pre-reveal card state; activity projection remains spectator-safe.
- Socket actor spoof/spectator rejection và save-failure no-publish.
