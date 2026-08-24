# PostgreSQL, snapshot v7, CAS và recovery

## Relational model

`rooms` stores lifecycle/host, aggregate version, snapshot schema version, JSONB,
`next_action_at` and retention timestamps. `player_sessions` stores pending/active/
revoked/expired status with SHA-256 token hash and stable room/player mapping.
`trade_offers` stores ordinary bilateral offers, history and expiry; forced-sale
proposals live inside the active room snapshot and do not require a new table.

## Strict snapshot validation

The v7 loader/save gate validates player/member references, ordered payment claims,
pending landing/turn/card continuation correlation, property/building shape,
private deck/card one-location invariants, semantic event stream tails,
`completedCardOperations` uniqueness and forced-sale proposal binding:
seller=active debtor, buyer=distinct ACTIVE player, property fingerprint unchanged,
gross recomputed, and proposal expiry no later than the payment deadline.
It also validates nullable `CharacterId` and shared `PlayerColorId` values on
appearance identity records. Finished rooms contain no pending
landing/payment/proposal/turn-recovery state.

## Command transaction

```text
protocol/schema gate
→ authenticated actor
→ per-room FIFO + row lock
→ clone/validate v7 snapshot
→ mutate GameCore and related ordinary-offer rows
→ revalidate + expected-version CAS
→ public/private projection + ACK
```

Version conflict is retryable resync, not blind command retry. Save failure emits no
success state. Startup processes due room/offer/session work before accepting traffic.

## Deadline recovery

- Pending purchase expiry resolves Do Not Buy; pending development expiry resolves
  Skip. Jail/disconnected turn recovery hands off once.
- Payment-shortfall expiry first applies available cash, then sells owned properties
  in ascending tile order through the Bank. It only marks bankruptcy after no
  property remains; claims continue in stable order.
- Forced-sale proposal expiry clears the one snapshot proposal. Accept/reject and
  scheduler callbacks are exact-ID/deadline checked and idempotent.
- Ordinary offer expiry remains relational and private to its two participants.

`reconcileTurnPresence` can clear/arm turn recovery but never resets payment or
proposal deadlines. Disconnect is not leave; explicit leave is its own transaction.

## v2/v3 → v4 migration and tests

Migration 004 preserves room/member/session identities and cancels pending ordinary
offers for migrated rooms. Migration 005 upgrades only v3 rows, strips retired
property/listing fields, clears the private proposal, preserves active queue/turn state,
cancels pending offers for migrated rooms and recomputes the scheduler deadline.
Migration 006 upgrades V4 snapshots to V5 without inventing a mascot or resetting
gameplay; it normalizes legacy player/property colors and adds nullable character IDs.
Migration 007 upgrades V5 snapshots to V6 with `rollSequence: 0` without
reconstructing historical roll count. This is historical migration history; the
current loader is V7 and requires the roll and semantic fields.
Migration `008_semantic_card_v7.sql` upgrades V6 snapshots to V7 with empty public
and private semantic lanes plus `completedCardOperations: []`; it deliberately does
not reconstruct historical events or deck order. The server appends semantic events
and advances card operations only inside committed room commands.
Tests must cover idempotence, identity/session/token preservation, offer cancellation,
fresh-runtime pending Buy/development/Jail/payment/proposal recovery, CAS/save failure
and public/private no-leak behavior.
