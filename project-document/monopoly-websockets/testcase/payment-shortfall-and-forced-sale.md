# Payment shortfall and forced sale v4

The server creates an ordered, durable payment queue for mandatory rent and card
claims. While a shortfall is active, ordinary trade and development commands are
blocked, except one trade (V1.1): another player may offer cash for properties of the
debtor, and the debtor may accept it to raise money.

The debtor can sell an owned property to the Bank at the authoritative gross price
`floor((price + investedBuildCost) * 70 / 100)`, or propose a sale to one active
buyer at a price the seller chooses (V1.1; it starts at the Bank price). The seller receives gross consideration before the payment queue
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
- [x] `[AUTO][CLIENT]` `DebtPanel.test.tsx` (V1.1): the picker asks for a price that starts at the Bank price, judges every buyer by
  the typed price, refuses an empty/zero/negative/fractional/text price, and sends `price`; `ForcedSaleProposalPanel.test.tsx` shows
  "Giá bán".
- [x] `[AUTO][CLIENT]` `DebtPanel.test.tsx`, `IncomingOffers.test.tsx`, `decisionSurfaces.test.tsx` (V1.1): a buy offer for the debtor's
  property is shown inside the debt dialog ("Đề nghị mua <tài sản> của <người chơi>", what it does to the debt, Chấp nhận / Từ chối),
  offers of any other shape are hidden there, and the offers dialog stays closed while the recipient is in debt.
- [x] `[AUTO][SOCKET]` `socket.integration.test.ts`, `v3.simplifiedRules.test.ts` (V1.1): a seller-priced forced sale moves exactly the
  asked price and keeps a valid snapshot; a price the buyer cannot pay or that is not a positive whole number is refused; a debt
  buy offer settles the debt, every other offer shape stays locked, an open proposal blocks the accept, and a debtor left without
  assets is eliminated with a valid room.
- [x] `[AUTO][CLIENT]` `useDebtPresentationHold.test.tsx`, `DebtPanel.test.tsx` (V1.1 item 1): the debt dialog (and the strip the other players see)
  waits while the queue is busy, the debtor token has not settled on its tile or the debtor/player creditor display lags the room
  state, opens with the same debt when the display catches up, shows at once with nothing to play, stays open once released,
  holds the next debt again, and opens after the safety timeout when the queue never goes idle.
- [ ] `[MANUAL-E2E]` V1.1 item 1: a player with little cash rolls onto an opponent's property or a tax tile: the mascot hops tile by tile,
  the coins and the plus/minus figures play out, the cash shows 0, and only then does "Cần thanh toán" open (the other players'
  status strip appears at the same moment); the countdown is still about the full time.
- [ ] `[MANUAL-E2E]` V1.1: with three players, a debtor receives a buy offer while the debt dialog is open, sees the toast and the
  offer inside the dialog, accepts it, and the debt is settled; and sells a property to another player at a price they typed.
- [ ] `[MANUAL-E2E]` G4: debtor dialog on a phone held sideways (a sale is visible without scrolling), forfeit confirmation.
