# Client turn actions v3

- `Dice` only requests `roll dice`; dice values and token positions come from the
  authoritative `update` projection.
- `BuyPrompt` renders the pending purchase operation and offers **Mua tài sản** or
  **Không mua**. No client price/owner payload is trusted.
- `DevelopmentPrompt` renders the authoritative landing level and sends only
  operation ID plus `SKIP`, `BUILD_HOUSES` quantity, or `UPGRADE_HOTEL`.
- `JailPanel` shows opponent-round progress and direct cash/card/wait actions. A
  failed jail roll ends the turn; a double never grants another roll.
- `DebtPanel` renders only public shortfall summary and server-derived gross/net
  sellable values. `ForcedSaleProposalPanel` renders terms only for its seller or
  buyer via the private player state channel.

During reconnect, spectator mode and non-committed ACK state, all mutation controls
are disabled. Revision ordering and token arrival animations are presentation-only;
server state remains authoritative.
