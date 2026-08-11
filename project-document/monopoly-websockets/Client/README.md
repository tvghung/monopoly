# Mục lục frontend Client

## Phạm vi

React/Vite SPA trên `/`, không có Router/menu/permission framework. `App` điều phối
session admission/resume, public room snapshot, stable player role và command ACK.

## Views và instruction

| View/feature | Điều kiện | Instruction | Code chính |
| --- | --- | --- | --- |
| Join/restore/reconnect | Session state machine | [join-room.instruction.md](./join-room.instruction.md) | `App.tsx`, `JoinForm.tsx`, `playerSessionStorage.ts`, `ConnectionOverlay.tsx` |
| Lobby/roster/start/winner | Player role + room status | [game-status.instruction.md](./game-status.instruction.md) | `Lobby.tsx`, `Dashboard.tsx`, `PlayerList.tsx` |
| Board/spectator | Activated player hoặc spectator snapshot | [game-board.instruction.md](./game-board.instruction.md) | `Board.tsx`, `SpectatorBanner.tsx` |
| Turn/buy/jail | In-game active player | [turn-actions.instruction.md](./turn-actions.instruction.md) | Dice/BuyPrompt/JailPanel |
| Property | Owner/non-owner player | [property-management.instruction.md](./property-management.instruction.md) | `BackOfCard.tsx` |
| Market/private offers | Active player | [trading-market.instruction.md](./trading-market.instruction.md) | MarketPlace/SellPrompts/IncomingOffers |
| Auction | Public live auction | [auction.instruction.md](./auction.instruction.md) | `AuctionPanel.tsx` |
| Log/chat | Room participant/spectator | [activity-log-and-chat.instruction.md](./activity-log-and-chat.instruction.md) | `Log.tsx` |

## Client invariants

- Stable player ID comes from resume ACK, never `socket.id`.
- Join/Board transition happens only after ACK.
- Raw token stays in versioned localStorage and never appears in URL/DOM/log.
- Retryable transport/DB errors retain token; terminal session errors clear it.
- Reconnecting disables mutation; `session replaced` stops old tab reconnect.
- `update` is public room projection with revision; private offers are separate and
  keyed by `offerId`.
- Spectator is an explicit read-only gameplay role with room chat allowed; a valid
  reconnect token is never downgraded.

## Checks

```bash
pnpm --filter @monopoly/client typecheck
pnpm --filter @monopoly/client test
pnpm lint
pnpm build
```
