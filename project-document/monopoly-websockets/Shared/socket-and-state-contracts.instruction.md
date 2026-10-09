# Socket, Standard Mode state và transfer contracts

## Code nguồn

- `packages/shared/src/types.ts`
- `packages/shared/src/events.ts`
- `packages/shared/src/socketSchemas.ts`
- `packages/shared/src/index.ts`

## Identity/protocol

- Stable aliases: `PlayerId`, `RoomId`, `SessionId`, `OfferId`, `GameCardId` và
  operation IDs cần cho continuation trong room aggregate (RAM của host process).
- `JoinRoomRequest.hostCapability?` is a strict 64-character lowercase hex value
  used only by the desktop Host's initial room creation. It is never part of a
  public room DTO, invitation or reconnect credential. The server verifies it
  against the process and selected room code before granting creation.
- `DATABASE_UNAVAILABLE` stays in the current `AckErrorCode` union (`packages/shared/src/events.ts`), marked `@deprecated`, only so
  a current client can still render the code if an older Host build sends it (the client keeps
  its localized text, now "game service temporarily unavailable"). The RAM server never emits
  it and no code path maps an error to it. A closed runtime and an unexpected exception both
  map to sanitized `INTERNAL_ERROR` (non-retryable and retryable respectively), while CAS
  conflict (`CONFLICT`, retryable) and missing room (`ROOM_GONE`) keep their codes. Removing
  the union member needs a protocol bump and is deliberately not part of this change.
- `RoomStatus`: `LOBBY | IN_PROGRESS | FINISHED`; `RoomRole`:
  `PLAYER | SPECTATOR`.
- `SOCKET_PROTOCOL_VERSION` (`packages/shared/src/types.ts`) là protocol hiện hành; client lệch version nhận
  `UPGRADE_REQUIRED`, không chạy legacy state/payload. Giá trị hiện tại và lịch sử: [Version history](#version-history).
- `CharacterId` và `PlayerColorId` là stable shared appearance IDs. `set appearance`
  nhận strict character-only, color-only hoặc combined payload; empty/unknown keys
  bị từ chối.
- Stable public ID không phải credential. Raw reconnect token không thuộc
  `PublicRoomState`, `GameState`, `SocketData`, log hoặc snapshot.

## Version history

File này là owner duy nhất của lịch sử protocol/snapshot. Hằng số hiện hành: `SOCKET_PROTOCOL_VERSION` trong
`packages/shared/src/types.ts` và `ROOM_SNAPSHOT_SCHEMA_VERSION` trong `apps/server/src/rooms.ts`. "Released in" lấy từ
`git tag` + `.github/release-notes/*.md` (ngày = ngày commit của tag). SQL dưới `apps/server/migrations/` là HISTORICAL
artifact, runtime RAM không bao giờ nạp; các helper `upgradeRoomSnapshotV4ToV5` … `upgradeRoomSnapshotV10ToV11` trong
`apps/server/src/rooms.ts` chỉ được test gọi, còn `assertSupportedRoomSnapshot` đòi đúng version hiện hành.

| Protocol | Snapshot | Released in | Additions |
| --- | --- | --- | --- |
| V8 | V8 | Không có bản phát hành `v1.x` nào (HISTORICAL; tag `v3.0.0-phase6-stable`, 2026-08-28, mang protocol 8 / snapshot 8) | Bounded public `BoardState.gameplayEvents` và typed public `BoardState.activityFeed`; private semantic lanes + `completedCardOperations`. HISTORICAL SQL `009_activity_feed_v8.sql` nâng V7 → V8 với activity tail rỗng, không dựng lại lịch sử. |
| V9 | V8 (không đổi) | v1.0.0 (2026-10-02); giữ nguyên tới v1.1.0, v1.1.1, v1.2.0 | `TAX` money/debt semantics và activity `TILE_LANDED`; chỉ nới union nên snapshot V8 vẫn hợp lệ, không có migration. v1.1.0 thêm optional `price?` cho `propose forced sale` mà không đổi version. |
| V10 | V9 | v1.3.0 (2026-10-06) | 2v2 Teamplay: `GameMode`, `TeamId`, team settings, `TeamPlayState`/`ReviveWindow`, `EmergencyRescueOffer`; snapshot V9 thêm `gameMode`, `teams`, `teamPlay`, `winningTeamId`, `PaymentQueue.rescue`, `teamId` trên mọi player record. HISTORICAL SQL `010_teamplay_v9.sql`. |
| V11 | V10 | v1.4.0 (2026-10-07); giữ nguyên tới v1.4.1, v1.5.0, v1.6.0, v1.6.1 | Ghế sảnh 2v2 + host kick: `Player.teamSlot`, `RoomPlayerMeta.teamSlot`, `boardState.seatSwapRequests`, lệnh `kick player`/`move to seat`/`request seat swap`/`cancel seat swap`/`respond seat swap`, event `removed from room`; bỏ `swap team`. HISTORICAL SQL `011_lobby_seats_v10.sql`. |
| V12 | V11 | v1.7.0 (GitHub Release 2026-10-09; minimum supported version 1.7.0) | Ghế bot: `RoomMember.kind`, `boardState.matchId`, `RoomPlayerMeta.kind`, lệnh `add bot`/`remove bot`, `MAX_BOTS_PER_ROOM`. Snapshot V10 hợp lệ như V11 (thiếu `kind` = HUMAN); không có file SQL mới. |
| V12 (CURRENT DEVELOPMENT, unreleased) | V11 (không đổi) | NOT RELEASED — commit 1937a73 trên `feat/own-the-block-multiplayer-bots-vnext` (implemented on the vNext development branch; product approval/release decision not independently verified) | Lệnh host-only, lobby-only `set bot difficulty {difficulty}` + optional `BoardState.botDifficulty` (`BOT_DIFFICULTIES`, `DEFAULT_BOT_DIFFICULTY = MEDIUM`). Cùng commit đổi dữ liệu Thuế Thu Nhập (ô 4) 200 → 150 (không phải thay đổi protocol). |

RELEASE RISK (dòng CURRENT DEVELOPMENT): thay đổi được thêm trong protocol 12 mà không bump, nên một host 1.7.0 đã phát hành
và một client vNext vẫn bắt tay thành công. Host 1.7.0 không có handler cho `set bot difficulty`: inbound guard của nó
(`installInboundValidation` tại tag v1.7.0) cho event lạ đi qua và không listener nào trả lời, nên ACK không bao giờ tới (không phải
`INVALID_REQUEST`; theo đọc code, chưa chạy thử) và `runTeamCommand` trong `apps/client/src/App.tsx` (không có ACK timeout) giữ
trạng thái pending; client 1.7.0 bỏ qua
field thừa `botDifficulty` (client không strict-parse public state); desktop guest 1.7.0 vào host vNext sẽ hiển thị thuế trên
deed/how-to-play từ shared data của chính nó (200) trong khi host thu 150 (host authoritative). Quyết định bump protocol hay
chấp nhận chênh lệch phải có trước khi phát hành.

## Standard Mode aggregate

Public types và room snapshot trong RAM dùng stable IDs và phân biệt hidden state:

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
- Cards: private `GamePrivateState.decks.chance.drawPile` và
  `.chest.drawPile` trong room aggregate (RAM); Player giữ `heldJailFreeCardIds`. Public projection lộ
  `getOutOfJailCardCount` của từng player (công khai) nhưng không lộ card IDs/deck order/card kế tiếp. `PendingCardInteraction`
  is operation-scoped state in the authoritative aggregate. New landings are `REVEALED` with
  `revealedCardId`; legacy `AWAITING_DRAW` remains for protocol-9 compatibility.
  Continuation and absolute deadline stay in the aggregate (reconnect-safe while the host process lives); `dismiss card` is the current
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
- Bot difficulty — CURRENT DEVELOPMENT (vNext, unreleased; commit 1937a73, không có trong v1.7.0): `BOT_DIFFICULTIES`/`BotDifficulty`
  (`VERY_EASY | EASY | MEDIUM | HARD | VERY_HARD`), `DEFAULT_BOT_DIFFICULTY = MEDIUM`, optional `BoardState.botDifficulty`
  (thiếu = MEDIUM; `apps/server/src/services/publicState.ts` luôn project ra giá trị, MEDIUM khi thiếu), `SetBotDifficultyRequest {difficulty}`
  cho lệnh host-only, lobby-only `set bot difficulty`. Thêm trong protocol 12 không bump, snapshot vẫn 11 → RELEASE RISK:
  xem [Version history](#version-history).
- Lobby seats (protocol 11): `Player.teamSlot` (`TeamSlot` 0|1) and `RoomPlayerMeta.teamSlot` (`PublicPlayer` omits it); `BoardState.seatSwapRequests`
  (`SeatSwapRequest {requesterPlayerId, targetPlayerId}`, public, empty outside a 2v2 lobby). Requests: `MoveToSeatRequest {teamId, teamSlot}`,
  `RequestSeatSwapRequest {targetPlayerId}`, `RespondSeatSwapRequest {requesterPlayerId, accept}`, `KickPlayerRequest {playerId}`;
  `cancel seat swap` has no payload. Server → client `removed from room` carries `RemovedFromRoomInfo {code: 'REMOVED_BY_HOST', message}`.
  `swap team` and `SwapTeamRequest` no longer exist. `REVIVE_WINDOW_SURVIVOR_TURNS` is 5 (a persisted window therefore has
  `turnsRemaining` 1–5; older windows of at most 3 stay valid). Money reasons gain
  `REVIVE` and `RESCUE`; activity gains `TEAM_REVIVE` and `EMERGENCY_RESCUE`, `PROPERTY_DEVELOPMENT` an optional
  `ownerPlayerId/ownerName` and `GAME_FINISHED` optional `winningTeamId/winningTeamName`. Rules: [../GameCore/team-play.instruction.md](../GameCore/team-play.instruction.md).
- Jail wait progress (`jailOpponentRoundsElapsed`) là state authoritative, được giữ
  nguyên qua payment và reconnect khi host process còn sống (mất khi process thoát); không có third-failed-roll hoặc stored-dice state.

`PersistedGameState`/room snapshot (version hiện hành `ROOM_SNAPSHOT_SCHEMA_VERSION` trong `apps/server/src/rooms.ts`) chứa
authoritative fields trên trong RAM và bỏ `loaded`, presence,
credential, socket ID, countdown tick/timer handle. `BoardState.gameStartedAt?: string | null`
là ISO timestamp authoritative được set tại transition `LOBBY -> IN_PROGRESS`; `freshState()`
dùng `null`, schema chấp nhận missing/null để hydrate snapshot cũ, và public projection
giữ giá trị này cho compatibility/public state. Board client hiện không render center timer
và không cần đưa timestamp vào scene render model. Client không tự khởi tạo timestamp từ
mount/reconnect.

`BoardState.rollSequence` là public non-negative safe integer, ổn định trong đời host process. Fresh state
starts at `0`; HISTORICAL: SQL migration 007 (V5 → V6) also started at `0` without
reconstructing historical rolls, and migration 009 (V7 → V8) initialized an empty
activity baseline without reconstructing history (SQL files are never loaded by the RAM runtime). The server increments it once after accepted dice generation
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
offer record trong RAM store chứa complete canonical terms để accept (kể cả sau reconnect khi host process còn sống)
không phụ thuộc client hay board label hiện tại. Host process thoát thì mọi offer mất.

## Events/ACK

- Mọi state-changing inbound kết thúc bằng typed `AckCallback<T>`; success chỉ sau
  commit và có protocol/revision, failure có stable code/message/retryable.
- Turn/buy/jail/property/payment/trade command actor lấy từ
  `socket.data.playerId`.
- Buy/development/forced-sale payloads chỉ mang operation/claim/proposal IDs; tile,
  owner, seller, buyer và giá Bank đều được derive từ snapshot. Ngoại lệ có chủ ý (V1.1): `propose forced sale` có thêm
  `price?` (`moneyAmountSchema`, số nguyên dương) là giá người bán đòi; vắng mặt thì dùng giá Bank. `ForcedSaleProposal.grossPrice`
  là giá đã thỏa thuận (không còn bắt buộc bằng công thức Bank). Field optional nên protocol vẫn 9 và snapshot vẫn 8 (lịch sử: trạng thái V1.1; version hiện hành xem Version history).
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

- Protocol mismatch (`SOCKET_PROTOCOL_VERSION` ≠ handshake → `UPGRADE_REQUIRED`, `apps/server/src/socket/index.ts`); payload/ACK compile/runtime validation, including `play again`.
- Strict appearance/`TradeBundle`, payment shortfall, landing decision, operation-scoped card
  interaction, semantic lanes and snapshot validation (historical "snapshot v7" wording referred to an older schema; the current check is `assertSupportedRoomSnapshot`).
- Strict board snapshot validation cho `activityFeed`, `gameStartedAt` optional/null và compatibility với
  snapshot cũ không có field; start timestamp trong snapshot/public projection.
- Public no-leak assertion cho token/hash/session/private offer/exact deck order and
  hidden pre-reveal card state; activity projection remains spectator-safe.
- Socket actor spoof/spectator rejection và save-failure no-publish.
