# Client turn actions v3

- `RollControl` (in `CenterStage`, board center) only requests `roll dice`; dice values and token positions come
  from the authoritative `update` projection. The call to action is **"Đổ xúc xắc"** (pending: "Đang đổ…"),
  the v2 `Button` `xl`, hidden while the dice roll, while a card is shown and after a win; on an opponent's turn
  a pill "<tên> đang đi…" replaces it. `Space` triggers it while it is enabled, unless typing, a button/link has
  focus, a dialog is open, or the press is a repeat or carries a modifier. Permission still comes from
  `canRollForState`; the turn text moved to the status pill. After the dice settle a DOM dice callout shows
  "4 + 3" and the total (the 3D total text was removed); doubles add an informational chip because a double
  never grants another roll.
- `BuyPrompt` renders the pending purchase operation and offers **Mua tài sản** or
  **Không mua**. No client price/owner payload is trusted.
- `DevelopmentPrompt` renders the authoritative landing level and sends only
  operation ID plus `SKIP`, `BUILD_HOUSES` quantity, or `UPGRADE_HOTEL`.
- `JailPanel` (now in the HUD context stack above the action dock) shows opponent-round progress and direct
  cash/card/wait actions ("hoặc bấm Đổ xúc xắc để thử đổ đôi"). A failed jail roll ends the turn; a double never
  grants another roll.
- `DebtPanel` renders only public shortfall summary and server-derived gross/net
  sellable values. `ForcedSaleProposalPanel` renders terms only for its seller or
  buyer via the private player state channel.

During reconnect, spectator mode and non-committed ACK state, all mutation controls
are disabled. Revision ordering and token arrival animations are presentation-only;
server state remains authoritative.
