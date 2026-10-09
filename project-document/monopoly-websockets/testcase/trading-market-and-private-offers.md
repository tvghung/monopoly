# Checklist — TradeBundle/private offers

## Contract/creation

- [ ] `[AUTO]` Bilateral `TradeOfferRequest` validates offered/requested money,
  unique property/Card IDs, no same asset both sides, bounded amounts and at least
  one transferred asset.
- [ ] `[SOCKET]` Actor/participants/ownership derive server-side; spoofed/cross-room/
  unowned assets fail. Nhà/Khách Sạn never appear as bundle assets.
- [ ] `[SOCKET]` Card holder/source and money balance revalidate at creation/accept.
- [x] `[SOCKET]` V1.1: during a payment shortfall only a cash-for-properties offer to the debtor can be made and accepted (the proposer's
  balance is also checked at creation); every other shape stays locked. Cases and files are in the
  [payment shortfall checklist](./payment-shortfall-and-forced-sale.md).

## Accept/transfer

- [ ] `[SOCKET]` Accept by authoritative owner applies both bundle sides exactly
  once and cancels stale offers atomically.
- [ ] `[SOCKET]` Fabricated/replayed/expired/already-resolved offer IDs fail; multiple
  same-tile offers remain independent.

## Privacy/recovery

- [ ] `[SOCKET]` Arrival/result only to the two participant private rooms; public state
  has no offer terms.
- [ ] `[RAM]` The live host retains the canonical pending offer across reconnect;
  expiry resolves exactly once. Host process exit (or restart) discards the offer and room permanently.
- [ ] `[SOCKET]` Leave cancels relevant pending offers; failed room/offer transaction
  produces no transfer/private result/public update/success ACK.
- [x] `[AUTO][SOCKET]` CURRENT DEVELOPMENT (protocol 13): `make offer` is idempotent per `requestId` — one offer delivered once, a retransmitted and a
  concurrent duplicate return the same `offerId` and create nothing, identical terms with a new id are a separate offer, a retry after decline does not
  recreate it, a refused request is not remembered, a missing/malformed id is `INVALID_REQUEST`
  (`apps/server/src/socket.hardening.integration.test.ts`).
- [x] `[AUTO][SOCKET]` CURRENT DEVELOPMENT: `decline offer` — valid (both sides told, resolved once, repeat refused), unauthorized/unknown `FORBIDDEN`, expired and
  not-in-progress room `CONFLICT`, malformed payload (`apps/server/src/socket.hardening.integration.test.ts`).

## Trade and incoming offers UI (visual overhaul V2, plan 04)

- [x] `[AUTO][CLIENT]` `TradeOfferModal.test.tsx`: selectable deed chips, money previews, the summary line, server-validated
  submission unchanged.
- [x] `[AUTO][CLIENT]` `IncomingOffers.test.tsx`: both sides of each offer as chips, answers are described by the sender so several
  offers can be told apart, the first answer is focused, expired offers disable both answers, no close button.
- [ ] `[MANUAL-E2E]` G4: trade and incoming offers at phone sizes (the two columns stay side by side on a phone held sideways).
