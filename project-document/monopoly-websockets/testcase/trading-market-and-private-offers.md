# Checklist — TradeBundle/open market/private offers

## Contract/creation

- [ ] `[AUTO]` Bilateral `TradeOfferRequest` validates offered/requested money,
  unique property/Card IDs, no same asset both sides, bounded amounts and at least
  one transferred asset.
- [ ] `[SOCKET]` Actor/participants/ownership derive server-side; spoofed/cross-room/
  unowned assets fail. Nhà/Khách Sạn never appear as bundle assets.
- [ ] `[SOCKET]` Group with any building cannot transfer property; jail-free card
  holder/source and money balance revalidate.

## Accept/transfer

- [ ] `[SOCKET]` Accept by authoritative owner applies both bundle sides exactly
  once and deletes stale listings/offers atomically.
- [ ] `[AUTO][SOCKET]` Mortgaged property stays mortgaged and creates immediate 10%
  BANK interest claim; later unmortgage still principal +10%.
- [ ] `[SOCKET]` Open-market price transfer uses same `VOLUNTARY` invariants.
- [ ] `[SOCKET]` Fabricated/replayed/expired/already-resolved offer IDs fail; multiple
  same-tile offers remain independent.

## Privacy/recovery

- [ ] `[SOCKET]` Arrival/result only to buyer/owner private rooms; public state has
  no offer terms.
- [ ] `[PG]` DB round-trips canonical bundle; fresh pool/server resume restores
  pending offer and expiry resolves exactly once.
- [ ] `[SOCKET]` Leave cancels relevant pending offers; failed room/offer/payment
  transaction produces no transfer/private result/public update/success ACK.
