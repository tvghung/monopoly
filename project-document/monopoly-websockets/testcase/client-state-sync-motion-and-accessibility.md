# Checklist — Vietnamese client, state sync, motion và accessibility

## Session/sync

- [ ] `[CLIENT]` Join/resume ACK gates Lobby/Board; restore/reconnect keeps token and
  snapshot; terminal errors clear only invalid session; newest-wins old tab stops.
- [ ] `[CLIENT]` Stale revision ignored; spectator/reconnecting has no mutation;
  StrictMode does not duplicate listeners/countdowns/actions.
- [ ] `[CLIENT]` Protocol-v3 reset resumes the same identity directly into the fresh
  v3 `IN_PROGRESS` turn without replacing the reconnect credential.

## Vietnamese/content/money

- [ ] `[AUDIT][CLIENT]` HTML title/metadata/manifest, join/lobby/host/ready/spectator,
  reconnect, dice/buy/payment/forced-sale/trade/property/jail/forfeit/winner/error/empty/
  tooltip/alt/log copy is Vietnamese.
- [ ] `[AUDIT]` No player-facing “Monopoly”, English game term, `$`, `$M` or USD
  formatter remains; internal event/package/env names are exempt.
- [ ] `[CLIENT]` All displayed amounts use shared VNĐ formatter, including card
  detail, tooltip, prompt, log, offer, bid, balance and bail.
- [ ] `[CLIENT]` Board renders exact canonical shared 40 tiles without duplicate
  metadata source; exact private deck order absent from DOM/state.

## Turn/property/payment UX

- [ ] `[CLIENT]` Token settlement gates buy/turn; each roll completes one turn and
  jail animation cannot expose a premature action.
- [ ] `[CLIENT]` Active debtor sees remaining claim/liquidation/bankruptcy confirmation;
  other Player/spectator cannot settle/declare.
- [ ] `[CLIENT]` Landing development, payment-shortfall gross/net values and
  private forced-sale proposal visibility
  render correct labels/actions/deadlines.
- [ ] `[CLIENT]` TradeBundle asset selection discloses mortgage interest; ACK failure
  keeps authoritative UI.

## Accessibility/layout

- [ ] `[CLIENT][MANUAL-E2E]` Keyboard/focus/labels/live errors/reduced-motion usable;
  Vietnamese text and short board labels fit desktop/mobile without hiding critical
  action.
