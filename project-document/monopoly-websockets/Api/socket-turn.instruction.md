# Socket turn và landing decisions v4

| Event | Payload | Server rule |
| --- | --- | --- |
| `roll dice` | no payload | Authenticated current player; server creates dice and resolves the landing |
| `buy property` | `{operationId}` | Matches the pending purchase; price/tile/owner derive from snapshot |
| `do not buy` | `{operationId}` | Clears purchase wait and completes the turn; never starts an auction |
| `resolve development` | `{operationId, action}` | Action is `SKIP`, `BUILD_HOUSES` with quantity, or `UPGRADE_HOTEL`; tile/level/cost derive from snapshot |
| `wait in jail` | no payload | Ends the jailed seat's turn without changing the jail counter directly |
| `revive teammate` | no payload | 2v2: the surviving teammate, in their own turn, pays `REVIVE_COST` to bring the bankrupt teammate back; the window, turn state and money are re-checked by the server |
| `accept rescue` / `decline rescue` | `{rescueId}` | 2v2 Emergency Rescue: only the addressed teammate; the amount, debtor and creditor come from `PaymentQueue.rescue`, never from the payload |

All payloads are strict Zod schemas and middleware requires exactly one ACK. Actor,
current turn, operation ID, property ownership, balance and level are revalidated in
the serialized room command. ACK/broadcast happen only after CAS commit.

`roll dice` and landing resolution call `completeTurnResolution` only after every
synchronous card/rent/payment step and every pending decision is complete. v4 has no
extra-roll, auction, building-contention, settle-debt or declare-bankruptcy event.
