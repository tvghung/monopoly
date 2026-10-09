# TradeBundle Socket instruction

## Authority/validation

All actions require authenticated active Player. Zod validates bounded money, UUID
offer IDs, jail-card IDs (`gameCardIdSchema` in `packages/shared/src/socketSchemas.ts`: `chance-…`/`chest-…`
strings, not UUIDs) and bilateral `TradeOfferRequest`; payload không mang trusted
buyer/seller/owner identity.

## Bilateral offer (in RAM)

Offers are records in the host process's RAM store (`apps/server/src/persistence/inMemory.ts`), committed in the same
room command as the room aggregate. They survive reconnect while the host process lives and are lost when the host
process exits. Handlers: `apps/server/src/socket/trading.ts`; accept/decline
rules: `apps/server/src/commands/gameplay.ts` (shared with the bot driver).

- `make offer(OfferInfo)` = `TradeOfferRequest` + `requestId: UUID` (protocol 13; the client adds a fresh id per logical offer,
  `apps/client/src/App.tsx`). A missing or malformed `requestId` is `INVALID_REQUEST`. `requested` may not contain jail-card IDs (`INVALID_REQUEST`) and only the
  holder can offer a card (`apps/server/src/socket/trading.ts`).
- `make offer(TradeOfferRequest)` stores canonical `TradeBundle.offered/requested`,
  server-derived participants and 20-second `expiresAt` in the RAM offer store; ACK returns offer ID/deadline.
- `accept offer({offerId})`/`decline offer({offerId})` use only the stable offer ID.
  Accept reloads terms, checks ownership/money/card holders/debt and applies all
  transfers once.
- Trong payment shortfall `make offer`/`accept offer` bị khóa, trừ đề nghị mua của V1.1: recipient là debtor đang nợ, proposer
  khác debtor và đủ tiền, `offered` chỉ có tiền > 0, `requested` chỉ có tài sản (không tiền, không thẻ); accept còn cần trước
  `actionDeadlineAt` và tài sản không có forced-sale proposal mở, rồi settle claim ngay trong cùng transaction. `decline offer`
  luôn được phép. Lỗi: `CONFLICT` "Giao dịch thông thường bị khóa…" / "…chỉ có thể đề nghị mua tài sản của người đó bằng tiền."
- 2v2 changes nothing here: a trade between teammates is an ordinary bilateral trade with real cash, and a bundle never
  moves money between a team's players for free. Team membership is only displayed (team chips on the offer and the form).
- Private arrival/result/expiry/cancel only use relevant `player:<PlayerId>` rooms;
  resume restores pending relevant offers. Public update never contains offer terms.
- Explicit leave cancels unresolved offers unless they are consumed inside the same
  creditor-resolution transaction.

Room + offer + payment writes commit atomically in one RAM transaction before private/public emit and ACK; a failed
command discards its draft and its offer writes.

Idempotency and guards (CURRENT DEVELOPMENT, protocol 13; RELEASED v1.7.0 behaved as the "Released" notes below say):

- `make offer` is idempotent per `requestId`: `apps/server/src/socket/trading.ts` looks the id up in `runtime.makeOfferRequests`
  (`apps/server/src/services/commandRequestLedger.ts`, keyed by room, actor, event and id) inside the room command. A
  retransmitted emit is acknowledged with the offer the first one created (same `offerId` and `expiresAt`), creates nothing and
  emits no second `offer on prop`, even after that offer was declined, cancelled or expired. Only a committed offer is recorded
  (`afterCommit`), so a refused request may succeed later with the same id; a new offer, even with identical terms, carries a new
  id and is a separate offer. Runtime memory only, bounded (128 ids per room, 10 minutes, 1024 rooms).
- `decline offer` requires `room.status === 'IN_PROGRESS'` (`apps/server/src/commands/gameplay.ts`, `declineOfferCommand`), like
  `accept offer`, besides the recipient, expiry and pending-status checks.
- `make offer` and `decline offer` commit without a room `update` broadcast (only the private offer events), so the room
  revision can move ahead of the last `update` a client saw. `make offer` notifies the bot driver directly.
- `accept offer` is guarded by the stored offer status: a replay cannot resolve the offer again, so it is refused and its
  draft is discarded.

Released v1.7.0 (protocol 12), for compatibility reasoning only: `make offer` carried no `requestId` and created a new offer for every
emit; `decline offer` did not check the room status.

Tests cover bundle validation/transfers, jail cards, spoof/replay/expiry and private routing; `make offer` idempotency (one offer,
duplicate, concurrent duplicate, separate legitimate offers, retry after decline, refused-then-valid, invalid payload) and `decline offer`
(valid, unauthorized, unknown, expired, finished room, malformed): `apps/server/src/socket.hardening.integration.test.ts`; the failed-commit path
(discarded draft, no broadcast) is covered generically by a chat-based test in `apps/server/src/socket.integration.test.ts`. Forced sale and Bank sale
during a shortfall: [socket-debt-and-rescue](./socket-debt-and-rescue.instruction.md). A socket test that keeps a pending offer across an in-process server restart reusing the same store:
NOT VERIFIED (none found in `apps/server/src/socket.integration.test.ts`). V1.1 shortfall offers: `socket.integration.test.ts` (debt offer settles the debt, decline, the
locked shapes and the proposer balance, open forced-sale proposal, eliminated debtor with a valid snapshot) and
`v3.simplifiedRules.test.ts` (`executeVoluntaryTrade` locks unless the caller opts in).
