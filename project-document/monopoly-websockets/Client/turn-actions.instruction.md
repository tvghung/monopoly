# Client turn actions v3

- `RollControl` (in `CenterStage`, board center) only requests `roll dice`; dice values and token positions come
  from the authoritative `update` projection. The call to action is **"Đổ xúc xắc"** (pending: "Đang đổ…"),
  the v2 `Button` `xl`, hidden while the dice roll, while a card is shown and after a win; on an opponent's turn
  a pill "<tên> đang đi…" replaces it. `Space` triggers it while it is enabled, unless typing, a button/link has
  focus, focus is inside the activity drawer, a dialog is open, or the press is a repeat or carries a modifier.
  The roll control's one live region also speaks the turn change ("Đến lượt bạn." / "Lượt của <tên>.") after a live
  presentation change, never on first render or after a snapshot sync. Permission still comes from
  `canRollForState`; the turn text moved to the status pill. After the dice settle a DOM dice callout shows
  "4 + 3" and the total (the 3D total text was removed); doubles add an informational chip because a double
  never grants another roll.
- `BuyPrompt` renders the pending purchase operation and offers **Mua tài sản** or
  **Không mua**. No client price/owner payload is trusted. It is a `Modal` `lg` bottom **sheet** with a **clear** backdrop
  (the board stays visible, pointer input is blocked); the full `PropertyDeedCard` sits beside the decision (compact deed in
  `SHORT_VIEWPORT_QUERY`), and "Mua tài sản" says why it is disabled ("Bạn còn thiếu … để mua ô đất này.").
- `DevelopmentPrompt` renders the authoritative landing level and sends only
  operation ID plus `SKIP`, `BUILD_HOUSES` quantity, or `UPGRADE_HOTEL`. Same sheet shell; the deed marks the next rent tier
  "Sau khi xây" (only here: `PropertyDeedCard showNext`).
- `JailPanel` (now in the HUD context stack above the action dock) shows opponent-round progress and direct
  cash/card/wait actions ("hoặc bấm Đổ xúc xắc để thử đổ đôi"). It is a named `region` (no live region around the
  buttons); the "Đã xác nhận…" line is its one `role="status"`, an error is one `role="alert"`, and the balance warning
  describes the disabled bail button. On a phone held sideways it is a two-row strip and never covers the roll button:
  a pending or failed line takes the place of the title row, and the balance warning is only read, not drawn. A failed jail roll ends the turn; a double never
  grants another roll.
- `DebtPanel` renders only public shortfall summary and server-derived gross/net
  sellable values. The debtor sees an `alertdialog` "Cần thanh toán" (`Modal` `lg`, tone `danger`, eyebrow = what the debt is
  for, described by the amount/creditor/shortfall; focus starts on the amount, which is in the tab ring) with a compact deed per
  sellable property, "Bán cho Ngân hàng" (described by what the sale brings) and "Đề nghị người chơi mua", and a footer
  **"Bỏ cuộc"** that calls `useRoomExit().requestLeave` (existing leave flow + `ConfirmationDialog`; no new command). Other
  players see a status strip: only the debtor/creditor copy is a live region, the countdown is a `role="timer"`.
- `CardInteractionOverlay` is a `Modal` `sm` on `layer="card"`: a printed card (deck frame, emblem, badge, artwork, message)
  with one **"Đóng"** for the acting player, no X, no Escape/backdrop close; observers see "Đang chờ người chơi đóng thẻ".
  The wrapper `data-testid="card-interaction-overlay"`/`data-card-stage` is the `.card-modal__stage` element **inside** the
  dialog. Focus returns to "Đóng" after a failed dismissal. There is no Draw step; a legacy `AWAITING_DRAW` card renders nothing. `ForcedSaleProposalPanel` renders terms only for its seller or
  buyer via the private player state channel.

During reconnect, spectator mode and non-committed ACK state, all mutation controls
are disabled. Revision ordering and token arrival animations are presentation-only;
server state remains authoritative.
