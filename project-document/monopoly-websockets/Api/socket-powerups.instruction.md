# Power-up socket contract

> **CURRENT DEVELOPMENT — protocol 16 / RAM snapshot 14.** Published v1.10.0 remains protocol 14 / snapshot 11. Commands are strict schemas and use the authenticated player identity. The owner-level inventory and status data is private; public state exposes only held counts/category totals and authorized reaction state.

Canonical gameplay rules: [Power-up runtime](../GameCore/power-ups.instruction.md). Shared event names/types and payload schemas are in `packages/shared/src/events.ts` and `packages/shared/src/socketSchemas.ts`. Handlers are in `apps/server/src/socket/powerUps.ts`; commands enter the existing `runGameCommand` transaction in `apps/server/src/commands/gameplay.ts`.

| Event | Strict payload | Behavior |
| --- | --- | --- |
| `select power up` | `{ offerId, selectedIndex: 0..2 }` | Locks one candidate; private reveal is committed before broadcast. |
| `resolve power up` | `{ offerId, action: CLAIM \| DECLINE }` or `{ offerId, action: REPLACE, replaceInstanceId }` | Claims, declines, or atomically replaces one exact owned instance. |
| `activate power up` | `{ instanceId, targetPlayerId?, targetTileID?, ingredientInstanceIds?, transformedInstanceId?, category?, movementDelta?, statusId? }` | Uses a server-owned card handler; effect-specific request fields are enforced after schema parsing. |
| `respond power up` | `{ eventId, action: PASS }` or `{ eventId, action: REACT, instanceId, redirectPlayerId?, redirectTileID? }` | Resolves only the responder currently eligible for the event. |
| `resolve power up trade` | `{ requestId, accept: boolean }` | Target consents or declines a pending U06 request. Card selection is server-random and private. |
| `continue power up movement` | `{ operationId }` | Continues the already rolled movement when the owner keeps the dice result. |

The ACK is emitted after commit with the room revision. Invalid payloads fail before mutation; invalid ownership, timing, targets and pending interactions fail in the domain command. Actor, hidden random choice, balances, effect results and other players' card identities are never accepted from the client. Duplicate/replayed or racing requests are serialized against authoritative room state.

Reaction deadlines are absolute server timestamps 15 seconds from event creation. The server scheduler and reconnect recovery resolve expiry; UI countdown is display-only. Reconnect projects the current private prompt/status to its authorized owner. A save failure discards the cloned draft and publishes no result. Recovery is same-process only: the RAM host has no process-restart persistence.

Tests: `apps/server/src/socket.powerUps.integration.test.ts` and `apps/server/src/game/powerUps/runtime.test.ts`. End-to-end evidence and command coverage limitations are recorded in [Phase 08 validation](../../powerups/08_FINAL_VALIDATION_REPORT.md).
