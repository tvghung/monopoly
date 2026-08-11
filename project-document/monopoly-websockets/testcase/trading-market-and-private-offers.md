# Checklist — open market và durable private offers

## Coverage

`[SOCKET-INTEGRATION]` `apps/server/src/socket.integration.test.ts` covers spoofed
actor fields, owner-only private delivery, authoritative expired-offer rejection and
an unaffordable open-market purchase with no committed revision. PostgreSQL
offer-restart/expiry and client countdown assertions remain separate requirements.

## Open market

- [ ] Owner lists `{tileID, positive integer price}`; server derives seller.
- [ ] Invalid/out-of-range tile, `NaN`, fraction, zero/negative or price above
  `2_147_483_647` fails.
- [ ] Non-owner remove and seller self-purchase fail.
- [ ] Purchase revalidates listing/owner/buyer/balance and commits transfer once.
- [ ] Save failure changes no balance/ownership/listing/revision/broadcast.

## Private offer

- [ ] `make offer` creates unique DB `offerId`, original terms and 20-second `expiresAt`.
- [ ] Only relevant private player rooms receive arrival/result; public update has no offer.
- [ ] Resume returns pending relevant offers; multiple same-tile offers do not collide.
- [ ] Accept/decline sends only offer ID; client cannot spoof actor/owner/buyer/price.
- [ ] Cross-room, fabricated, expired, replayed and already-resolved offer IDs fail.
- [ ] Accept transaction revalidates owner/property/buyer/balance and transfers exactly once.
- [ ] Restart preserves pending offer and expiry resolves exactly once.
- [ ] Explicit buyer/owner leave cancels pending offers and privately emits
  `offer cancelled` to both relevant player rooms.
- [ ] Client derives countdown from authoritative deadline and cleans listeners/timers.
