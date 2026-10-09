# Debt, forced sale and Emergency Rescue Socket instruction

Status: CURRENT (RELEASED in v1.7.0 unless marked CURRENT DEVELOPMENT). Foundation rules: [monopoly.shared.instructions.md](../monopoly.shared.instructions.md), [monopoly.api.instructions.md](../monopoly.api.instructions.md).

## Scope

The six client commands a player uses while a payment shortfall (`boardState.paymentQueue`) is open: liquidation to the Bank,
the debtor's bilateral forced-sale proposal and its answer, and the 2v2 Emergency Rescue answer. The domain rules (when a
shortfall opens, claim order, bankruptcy, rescue eligibility) belong to GameCore; this document covers the transport contract.
The one trade exception during a shortfall (cash offers for the debtor's properties) is a `make offer` rule and lives in
[socket-trading](./socket-trading.instruction.md).

## Code ownership

| Concern | Path |
| --- | --- |
| Socket handlers | `apps/server/src/socket/debt.ts` |
| Shared command objects (also run by the bot driver) | `apps/server/src/commands/gameplay.ts` (`sellPropertyToBankCommand`, `acceptForcedSaleCommand`, `rejectForcedSaleCommand`, `acceptRescueCommand`, `declineRescueCommand`) |
| Payment queue, Bank sale, forced-sale proposal | `apps/server/src/game/payment.ts`, `apps/server/src/game/paymentResolution.ts` |
| Emergency Rescue | `apps/server/src/game/rescue.ts`, `apps/server/src/game/rescueResolution.ts`, `packages/shared/src/teams.ts` |
| Deadlines | `apps/server/src/services/deadlineScheduler.ts` |
| Payload schemas and event types | `packages/shared/src/socketSchemas.ts`, `packages/shared/src/events.ts` |
| Public/private projection | `apps/server/src/services/publicState.ts` (`paymentShortfall`, private `forcedSaleProposal`) |
| Bot use | `apps/server/src/bots/driver.ts`, `apps/server/src/bots/policy.ts` |
| Client callers | `apps/client/src/App.tsx`, `apps/client/src/components/dashboard/DebtPanel.tsx`, `apps/client/src/components/dashboard/ForcedSaleProposalPanel.tsx`, `apps/client/src/components/dashboard/RescuePanel.tsx` |

## Events

| Event | Payload (strict schema) | ACK data | Actor | Server rule |
| --- | --- | --- | --- | --- |
| `sell property to bank` | `{paymentOperationId, claimId, tileID}` | none | debtor of the active claim | `IN_PROGRESS`; actor must be the active claim's debtor (`FORBIDDEN` otherwise); refused (`CONFLICT`) at or after `actionDeadlineAt`, for a stale operation/claim ID, for a tile the debtor does not own, for a tile locked by a pending landing decision and while any forced-sale proposal is open. The Bank pays the server-computed forced-sale value (`forcedSaleGrossPrice`, houses included) |
| `propose forced sale` | `{paymentOperationId, claimId, tileID, buyerPlayerId, price?}` | `{proposalId, expiresAt}` | debtor of the active claim | `IN_PROGRESS`; buyer must be another player still in `boardState.players`; `price` defaults to the Bank value, and a price the buyer cannot pay is refused; only one proposal may be open in the room; `expiresAt` = min(now + 20 s, payment deadline) |
| `accept forced sale` | `{proposalId}` | none | the proposal's buyer | proposal, operation, claim, seller ownership and `expectedHouses` must all still match and the buyer must still afford the price; the property and the cash move once, then the payment queue progresses |
| `reject forced sale` | `{proposalId}` | none | seller or buyer | closes the open proposal before its expiry (the client uses it both for the buyer's "reject" and the seller's "cancel") |
| `accept rescue` | `{rescueId}` | none | the offered teammate (2v2) | `IN_PROGRESS`; `rescueId`, rescuer, debtor and amount must match `PaymentQueue.rescue` and the server's own `planEmergencyRescue`; the rescuer pays every open claim of the debtor straight to its creditor |
| `decline rescue` | `{rescueId}` | none | the offered teammate (2v2) | closes the offer; the debtor goes bankrupt exactly as without a rescue and the queue continues |

Server-to-client: `forced sale proposal` (payload `ForcedSaleProposal | null`) goes only to the seller's and the buyer's
`player:<playerId>` rooms. A new proposal is emitted by `apps/server/src/socket/debt.ts`; `null` (proposal gone) is emitted by
`apps/server/src/commands/gameplay.ts` after accept/reject, by `apps/server/src/socket/lobby.ts` when a leave clears it and by
`apps/server/src/services/deadlineScheduler.ts` at expiry. Every successful command also broadcasts the normal room `update`
and `private player state`.

## Current behavior

- Every handler follows the common pipeline in [monopoly.api.instructions.md](../monopoly.api.instructions.md#command-handler-pattern):
  schema check in the inbound middleware, `requirePlayer`, then one serialized room command. Five of the six handlers run a
  shared `GameCommand` through `runGameCommand`; `propose forced sale` is socket-only (bots never propose) and calls
  `createForcedSaleProposal` inside `commitRoomCommand`.
- Debtor, creditor, amount, price defaults and rescue amount always come from the in-RAM room aggregate. The payload only names
  the operation (`paymentOperationId`/`claimId`, `proposalId`, `rescueId`), the tile and, for a proposal, the buyer and the
  optional asked price.
- Public projection: `paymentShortfall` (debtor, creditor, amounts, `actionDeadlineAt`, `paymentOperationId`, `claimId`,
  `rescue`, the debtor's `sellableProperties` with server prices). The open forced-sale proposal is private to its seller and
  buyer (`private player state`, the `forced sale proposal` event and the `resume session` ACK).
- Ordinary build, trade and turn commands are refused while the queue is open (`sell house`, `roll dice`, `buy property`,
  `resolve development`, `pay bail`, `use jail card`, `wait in jail` all check `paymentQueue`), so liquidation goes only
  through these commands and the `make offer` exception.
- Accepting a Bank sale or a forced sale cancels pending trade offers that include the sold tile (and every offer of a
  debtor the queue eliminated) in the same commit; the cancellations are sent as `offer cancelled` after the commit.
- Deadlines are absolute timestamps in the room aggregate, polled every second by the deadline scheduler and also checked on
  `join room`/`resume session` and by the bot driver: payment liquidation (default 120 s, `PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS`)
  sells the debtor's properties to the Bank automatically and then settles, opens a rescue or bankrupts; an expired
  proposal is cleared (`forced sale proposal` `null`); an unanswered rescue (default 30 s, `EMERGENCY_RESCUE_TIMEOUT_MS`;
  it also becomes the queue's `actionDeadlineAt`) resolves as `EXPIRED` into the normal bankruptcy. Bots that cannot answer
  leave the task to the same deadline.
- The open queue, proposal and rescue survive reconnect while the host process lives; they are lost when the host process
  exits, together with the room.

## Constraints and regression risks

- Operation-scoped replay safety: a repeated `sell property to bank` finds the tile no longer owned (or the claim settled)
  and is refused; a repeated `accept forced sale`/`reject forced sale` finds no matching proposal (`CONFLICT`); a repeated
  rescue answer finds no matching `rescueId` (`CONFLICT`). None of them applies a second effect.
- `propose forced sale` is not idempotent by request: a retry after a lost ACK is refused with `CONFLICT` because one proposal
  is already open. The client learns the real proposal from `forced sale proposal`/`private player state`, not from the retry.
- An open forced-sale proposal blocks every Bank sale of the debtor and any debt offer (`make offer`/`accept offer`) that
  requests the proposed tile; it must be cleared (accept, reject, expiry or leave) before Bank liquidation can continue.
- The proposal's `expectedHouses` guard rejects an accept after the property changed; do not remove it.
- `accept rescue` re-plans from the queue (`planEmergencyRescue`) and refuses if the amount no longer equals the offer; the
  amount is never taken from the client.
- A failed command discards its draft: no balance, ownership, queue or proposal change and no broadcast (failure mapping in
  [monopoly.api.instructions.md](../monopoly.api.instructions.md)).

## Change impact

Changing any debt command, payload or ACK requires the shared schema/event type, this handler, the shared command (and so the
bot driver/policy), the client callers and panels, the projection, the GameCore rules and the checklists below. Changing a
`DebtClaim` producer, transfer policy or deadline also follows the payment/bankruptcy rule in the repository `CLAUDE.md`.

## Verification

Automated:

- Forced sale propose/accept with an asked price, refused prices, debt offers during a shortfall, a proposal blocking a debt
  offer, a creditor leaving without clearing another proposal: `apps/server/src/socket.integration.test.ts`.
- Emergency Rescue accept (only the offered teammate, creditor paid directly), decline into bankruptcy, expiry through
  `recoverRoomIfDue`, and an in-process server restart reusing the same store (test harness) with the rescue still
  answerable: `apps/server/src/socket.teamplay.integration.test.ts` (helpers in `apps/server/src/testing/teamHarness.ts`).
- Bank sale, repeated forced-sale command, proposal acceptance through the active claim, proposal clearing on leave:
  `apps/server/src/v3.simplifiedRules.test.ts` (leave clearing: "clears a forced-sale proposal when its seller or buyer leaves").
- Bot decisions for rescue and forced sale: `apps/server/src/bots/policy.test.ts`.
- Client panels: `apps/client/src/components/dashboard/DebtPanel.test.tsx`,
  `apps/client/src/components/dashboard/ForcedSaleProposalPanel.test.tsx`,
  `apps/client/src/components/dashboard/RescuePanel.test.tsx`.

Gaps (no socket-level test today): `sell property to bank` and `reject forced sale` are covered only at game level, through
the bot driver or in the client, not by a Socket.IO integration test.

Manual: [payment-shortfall-and-forced-sale](../testcase/payment-shortfall-and-forced-sale.md) and the rescue items in
[team-play](../testcase/team-play.md).

## Related docs

- GameCore rules: [turn-movement-and-bankruptcy](../GameCore/turn-movement-and-bankruptcy.instruction.md),
  [property-economy](../GameCore/property-economy.instruction.md), [team-play](../GameCore/team-play.instruction.md).
- Shortfall trade exception: [socket-trading](./socket-trading.instruction.md).
- Contracts and version history: [socket-and-state-contracts](../Shared/socket-and-state-contracts.instruction.md).
- Index: [Api README](./README.md).
