# Socket turn và landing decisions v4

| Event | Payload | Server rule |
| --- | --- | --- |
| `roll dice` | no payload | Authenticated current player; server creates dice and resolves the landing |
| `buy property` | `{operationId}` | Matches the pending purchase; price/tile/owner derive from snapshot |
| `do not buy` | `{operationId}` | Clears purchase wait and completes the turn; never starts an auction |
| `resolve development` | `{operationId, action}` | Action is `SKIP`, `BUILD_HOUSES` with quantity, or `UPGRADE_HOTEL`; tile/level/cost derive from snapshot |
| `wait in jail` | no payload | Ends the jailed seat's turn without changing the jail counter directly |
| `revive teammate` | no payload | 2v2 (handler `apps/server/src/socket/team.ts`): the surviving teammate, in their own turn, pays `REVIVE_COST` to bring the bankrupt teammate back; the window, turn state and money are re-checked by the server |
| `accept rescue` / `decline rescue` | `{rescueId}` | 2v2 Emergency Rescue (handler `apps/server/src/socket/debt.ts`, see [socket-debt-and-rescue](./socket-debt-and-rescue.instruction.md)): only the addressed teammate; the amount, debtor and creditor come from `PaymentQueue.rescue`, never from the payload |

All payloads are strict Zod schemas and middleware requires exactly one ACK. Actor,
current turn, operation ID, property ownership, balance and level are revalidated in
the serialized room command. ACK/broadcast happen only after the version-checked commit to the in-RAM room aggregate.
Handlers live in `apps/server/src/socket/turn.ts`; the rules are the shared command objects in
`apps/server/src/commands/gameplay.ts`, which the bot driver runs too.

`roll dice` and landing resolution call `completeTurnResolution` only after every
synchronous card/rent/payment step and every pending decision is complete. v4 has no
extra-roll, auction, building-contention, settle-debt or declare-bankruptcy event.

Replay behavior (current, not changed by this document): a repeated `roll dice` is refused by state (`CONFLICT` for `hasMoved` or a
pending decision, `FORBIDDEN` once the turn has passed); a repeated `buy property`/`do not buy`/`resolve development` with an already-resolved `operationId` is
refused (`CONFLICT`) and never charges twice. While a payment shortfall is open every command in this table except the
rescue answers is refused; liquidation uses [socket-debt-and-rescue](./socket-debt-and-rescue.instruction.md).

## Card commands

Handler `apps/server/src/socket/card.ts`; commands `dismissCardCommand`/`drawCardCommand` in
`apps/server/src/commands/gameplay.ts` (also used by the bot driver).

| Event | Payload | Server rule |
| --- | --- | --- |
| `dismiss card` | `{operationId}` | `IN_PROGRESS` and the actor is still a player; the card landing is already `REVEALED` on landing, and dismissing applies its effect and continuation once. A repeated dismiss of the same operation answers success without a second effect; a foreign or stale operation is `CONFLICT`, an unrevealed card is `CONFLICT` |
| `draw card` | `{operationId}` | Protocol-9 legacy compatibility for an `AWAITING_DRAW` state only; the current client never emits it (bots may, for that legacy state). Repeats of the same operation are idempotent |

The deadline scheduler promotes only a legacy `AWAITING_DRAW` card at its deadline; a `REVEALED` card waits for its actor's
`dismiss card`, and only the turn-recovery deadline of a disconnected current player applies it as a dismiss would. Tests:
`apps/server/src/socket.integration.test.ts` ("reveals on landing and authorizes an idempotent card close"). Card data and
resolution rules: [tile-cards-and-jail-resolution](../GameCore/tile-cards-and-jail-resolution.instruction.md).
