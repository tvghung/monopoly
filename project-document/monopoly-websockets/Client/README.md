# Client — Cờ Tỷ Phú Việt Nam

## Phạm vi

React/Vite SPA tại `/`, không Router/menu/permission framework. `App` điều phối
admission/resume, public revision, stable role và typed command ACK. Toàn bộ text mà
Player/Spectator nhìn thấy là tiếng Việt; technical event/package names giữ nguyên.

| View/feature | Instruction | Code chính |
| --- | --- | --- |
| Join/restore/reconnect | [join-room.instruction.md](./join-room.instruction.md) | `App.tsx`, `JoinForm.tsx`, session storage, overlay |
| Lobby/roster/start/winner | [game-status.instruction.md](./game-status.instruction.md) | Lobby/Dashboard/PlayerList/WinnerBanner |
| Board/spectator | [game-board.instruction.md](./game-board.instruction.md) | Board/Tile/BackOfCard/SpectatorBanner |
| Turn/landing/payment/jail | [turn-actions.instruction.md](./turn-actions.instruction.md) | Dice/BuyPrompt/DevelopmentPrompt/Jail/Debt controls |
| Property/build/mortgage | [property-management.instruction.md](./property-management.instruction.md) | BackOfCard/Tile |
| `TradeBundle`/private offers | [trading-market.instruction.md](./trading-market.instruction.md) | Market/SellPrompts/IncomingOffers |
| Forced sale proposal | [../testcase/payment-shortfall-and-forced-sale.md](../testcase/payment-shortfall-and-forced-sale.md) | DebtPanel/ForcedSaleProposalPanel |
| Log/chat | [activity-log-and-chat.instruction.md](./activity-log-and-chat.instruction.md) | Log |

## Client invariants

- Stable `playerId` từ resume ACK; raw token chỉ trong versioned localStorage.
- Reconnecting giữ snapshot nhưng disable mutation; stale revision bị bỏ.
- Spectator read-only; server authority không phụ thuộc action visibility.
- Board/property metadata derive từ `@monopoly/shared`; không duplicate 40-row data.
- Mọi game-unit hiển thị qua một formatter: `60 → 60.000 ₫`,
  `1500 → 1.500.000 ₫`; không còn `$`, `$M`, USD.
- Client không nhận/render exact `DeckState` hoặc credential. Pending landing,
  payment shortfall và seller/buyer forced-sale proposal chỉ dùng projection cần
  cho quyết định UX.

## Checks

```bash
pnpm --filter @monopoly/client typecheck
pnpm --filter @monopoly/client test
pnpm lint
pnpm build
```
