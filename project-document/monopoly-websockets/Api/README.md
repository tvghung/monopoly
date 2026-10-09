# HTTP và Socket.IO — Cờ Tỷ Phú Việt Nam

Status: CURRENT (RELEASED in v1.7.0 unless marked CURRENT DEVELOPMENT). Foundation rules:
[monopoly.api.instructions.md](../monopoly.api.instructions.md). Documentation Hub: [project-document/README.md](../../README.md).

Express runtime và Socket.IO command modules. RAM session/lifecycle detail:
[Persistence README](../Persistence/README.md).

| Module | Events/routes | Instruction |
| --- | --- | --- |
| Runtime | `/healthz`, `/readyz`, `/_otb/room`, `/_otb/continuity`, `/_otb/registry-proof`, static/SPA, startup/shutdown, LAN UDP lookup and Online tunnel/registry | [http-runtime](./http-runtime.instruction.md) |
| Session | `join room`, `resume session`, disconnect | [socket-session](./socket-session.instruction.md) |
| Lobby, 2v2 seats, bots | `set appearance`, `set ready`, `start game`, `play again`, `kick player`, `leave room`, the 2v2 team commands, `add bot`, `remove bot`, `set bot difficulty` (CURRENT DEVELOPMENT) | [socket-lobby](./socket-lobby.instruction.md) |
| Turn/landing decision and cards | `roll dice`, `buy property`, `do not buy`, `resolve development`, `wait in jail`, `dismiss card`, `draw card` (legacy) | [socket-turn](./socket-turn.instruction.md) |
| Chat | `send chat` | [socket-chat](./socket-chat.instruction.md) |
| Trading | bilateral `TradeOfferRequest` và private offer lifecycle | [socket-trading](./socket-trading.instruction.md) |
| Building/property | sell-house và landing development | [socket-building](./socket-building.instruction.md) |
| Jail | `pay bail`, `use jail card`, `wait in jail` | [socket-jail](./socket-jail.instruction.md) |
| Debt, forced sale, Emergency Rescue | `sell property to bank`, `propose forced sale`, `accept forced sale`, `reject forced sale`, `accept rescue`, `decline rescue` | [socket-debt-and-rescue](./socket-debt-and-rescue.instruction.md) |

## Client → server events

All 39 commands registered under `apps/server/src/socket/` (plus the Socket.IO `disconnect` listener in `session.ts`). Payload
schemas: `clientEventPayloadSchemas` in `packages/shared/src/socketSchemas.ts`; event types: `ClientToServerEvents` in
`packages/shared/src/events.ts`.

| Event | Handler | Instruction |
| --- | --- | --- |
| `join room`, `resume session` | `apps/server/src/socket/session.ts` | [socket-session](./socket-session.instruction.md) |
| `set appearance`, `set ready`, `start game`, `play again`, `kick player`, `leave room` | `apps/server/src/socket/lobby.ts` | [socket-lobby](./socket-lobby.instruction.md) |
| `add bot`, `remove bot` | `apps/server/src/socket/bots.ts` | [socket-lobby](./socket-lobby.instruction.md#add-bot--remove-bot-protocol-12-socketbotsts) |
| `set bot difficulty` — CURRENT DEVELOPMENT (vNext, unreleased) | `apps/server/src/socket/bots.ts` | [socket-lobby](./socket-lobby.instruction.md#add-bot--remove-bot-protocol-12-socketbotsts) |
| `set game mode`, `set team name`, `set team color`, `move to seat`, `request seat swap`, `cancel seat swap`, `respond seat swap`, `revive teammate` | `apps/server/src/socket/team.ts` | [socket-lobby](./socket-lobby.instruction.md#2v2-lobby-commands-socketteamts) |
| `roll dice`, `buy property`, `do not buy`, `resolve development`, `wait in jail` | `apps/server/src/socket/turn.ts` | [socket-turn](./socket-turn.instruction.md) |
| `dismiss card`, `draw card` (protocol-9 legacy compatibility; the current client never emits it) | `apps/server/src/socket/card.ts` | [socket-turn](./socket-turn.instruction.md#card-commands) |
| `pay bail`, `use jail card` | `apps/server/src/socket/jail.ts` | [socket-jail](./socket-jail.instruction.md) |
| `sell house` | `apps/server/src/socket/building.ts` | [socket-building](./socket-building.instruction.md) |
| `sell property to bank`, `propose forced sale`, `accept forced sale`, `reject forced sale`, `accept rescue`, `decline rescue` | `apps/server/src/socket/debt.ts` | [socket-debt-and-rescue](./socket-debt-and-rescue.instruction.md) |
| `make offer`, `decline offer`, `accept offer` | `apps/server/src/socket/trading.ts` | [socket-trading](./socket-trading.instruction.md) |
| `send chat` | `apps/server/src/socket/chat.ts` | [socket-chat](./socket-chat.instruction.md) |

`set bot difficulty` was added on this branch (commit 1937a73) inside the same `SOCKET_PROTOCOL_VERSION` without a bump. This
is an open release risk. Against a released v1.7.0 host the event is never answered: the v1.7.0 inbound middleware passes
event names it has no schema for and no listener exists, so no ACK (not even `INVALID_REQUEST`) arrives, and the current
client's lobby `runTeamCommand` has no ACK timeout. The public projection now always carries `botDifficulty` (absent in the
aggregate = `MEDIUM`, the released Balanced policy); a v1.7.0 client does not schema-parse `update` and ignores the field.
Version history:
[socket-and-state-contracts](../Shared/socket-and-state-contracts.instruction.md).

## Server → client events

`ServerToClientEvents` in `packages/shared/src/events.ts` (10 events).

| Event | Audience | Emitted by |
| --- | --- | --- |
| `update` | `room:<roomId>` | `apps/server/src/socket/broadcast.ts` (`broadcastRoom`) |
| `private player state` | each non-`LEFT` member's `player:<playerId>` | `apps/server/src/socket/broadcast.ts` (`broadcastRoom`) |
| `offer on prop` | the recipient's `player:` room | `apps/server/src/socket/trading.ts` |
| `offer declined`, `offer accepted` | proposer and recipient | `apps/server/src/commands/gameplay.ts` (`emitOfferResult`) |
| `offer cancelled` | proposer and recipient | `apps/server/src/services/offerInvalidation.ts`, `apps/server/src/commands/gameplay.ts`, a local copy in `apps/server/src/services/deadlineScheduler.ts` and inline in the leave path of `apps/server/src/socket/lobby.ts` |
| `offer expired` | proposer and recipient | `apps/server/src/services/deadlineScheduler.ts` |
| `forced sale proposal` | seller and buyer | `apps/server/src/socket/debt.ts` (new proposal); `null` from `apps/server/src/commands/gameplay.ts`, `apps/server/src/socket/lobby.ts`, `apps/server/src/services/deadlineScheduler.ts` |
| `session replaced` | the superseded connection only | `apps/server/src/socket/session.ts` |
| `removed from room` | the kicked player's connection only | `apps/server/src/socket/lobby.ts` (`kick player`) |

## Common command pipeline

Every command follows the pipeline described once in
[monopoly.api.instructions.md](../monopoly.api.instructions.md#command-handler-pattern): handshake protocol check
(`UPGRADE_REQUIRED`), inbound schema + exactly-one-ACK middleware (`INVALID_REQUEST`), authenticated actor
(`UNAUTHENTICATED`), per-room FIFO with a connection-generation re-check (`SESSION_REPLACED`), commit to the in-RAM room
aggregate, then broadcast and ACK. Gameplay command objects live in `apps/server/src/commands/gameplay.ts` and are shared by
the socket handlers and the bot driver.

## Authority/commit

Current-protocol schema (`SOCKET_PROTOCOL_VERSION`, `packages/shared/src/types.ts`) → authenticated role/actor → serialized
room draft → in-RAM version-checked commit → public/private projection → ACK. A failed command discards its draft and emits no
state/update/success. Actor/owner/dice/debt target không lấy từ payload; giá forced sale mặc định là giá Bank, chỉ `price?` tùy chọn của seller (V1.1) mới đổi nó.

Public `update` tới `room:<roomId>`; session/private trade/forced-sale results chỉ tới
relevant `player:<playerId>`. Bounded semantic event families are projected publicly
when safe; participant-scoped money events use `private player state`. Exact deck
order, card draw pile and credentials không thuộc public projection.

## Related docs

- [FEATURE_TRACEABILITY](../FEATURE_TRACEABILITY.md) and [ARCHITECTURE_DECISIONS](../ARCHITECTURE_DECISIONS.md).
- Desktop shell and helper process: [Desktop README](../Desktop/README.md).
- Checklists: [testcase README](../testcase/README.md).
