# Payment shortfall and forced sale v4

The server creates an ordered, durable payment queue for mandatory rent and card
claims. While a shortfall is active, ordinary trade and development commands are
blocked.

The debtor can sell an owned property to the Bank at the authoritative gross price
`floor((price + investedBuildCost) * 70 / 100)`, or propose that fixed sale to one
active buyer. The seller receives gross consideration before the payment queue
consumes the active debt. Every committed sale immediately retries the active claim.
Timeout sells properties in tile order; bankruptcy occurs only after no saleable
property remains.

Proposal terms are private to the seller and designated buyer and are restored
through private player state after reconnect or restart.

## Debtor dialog (visual overhaul V2, plan 04)

- [x] `[AUTO][CLIENT]` `DebtPanel.test.tsx`: the debtor's "Cần thanh toán" alertdialog is described by amount, creditor and
  shortfall; every sale names its tile and describes what it brings; the eyebrow names RENT, TAX, CARD (Cơ Hội / Khí Vận /
  unknown) and OTHER sources; the countdown ticks each second; Tab and Shift+Tab stay inside the dialog from the amount.
- [x] `[AUTO][CLIENT]` `DebtPanel.test.tsx`: "Bỏ cuộc" calls the existing room exit flow once (confirmation dialog stays in
  `App`), sends no command of its own, stays reachable while a sale is pending, and shows a failed leave request inside the dialog.
- [x] `[AUTO][CLIENT]` `DebtPanel.test.tsx`: the observer strip keeps the countdown (`role="timer"`) outside its live region.
- [x] `[AUTO][CLIENT]` `ForcedSaleProposalPanel.test.tsx`: proposal terms are shown only to the seller/buyer.
- [ ] `[MANUAL-E2E]` G4: debtor dialog on a phone held sideways (a sale is visible without scrolling), forfeit confirmation.
