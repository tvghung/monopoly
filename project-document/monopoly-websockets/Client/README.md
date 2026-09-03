# Client — Cờ Tỷ Phú Việt Nam

## Phạm vi

React/Vite SPA tại `/`, không Router/menu/permission framework. `App` điều phối
admission/resume, public revision, stable role và typed command ACK. Toàn bộ text mà
Player/Spectator nhìn thấy là tiếng Việt; technical event/package names giữ nguyên.

| View/feature | Instruction | Code chính |
| --- | --- | --- |
| Join/restore/reconnect | [join-room.instruction.md](./join-room.instruction.md) | `App.tsx`, `JoinForm.tsx`, session storage, overlay |
| Lobby/roster/start/winner | [game-status.instruction.md](./game-status.instruction.md) | Lobby/Dashboard/PlayerList/WinnerBanner |
| Board/spectator/WebGL surface | [game-board.instruction.md](./game-board.instruction.md) | `Board.tsx`, `game/scene/GameScene.tsx`, `game/scene/board/`, fallback |
| Turn/landing/payment/jail | [turn-actions.instruction.md](./turn-actions.instruction.md) | Dice/BuyPrompt/DevelopmentPrompt/Jail/Debt controls |
| Property/build/forced sale | [property-management.instruction.md](./property-management.instruction.md) | BackOfCard/Tile/DebtPanel |
| `TradeBundle`/private offers | [trade-offers.instruction.md](./trade-offers.instruction.md) | BackOfCard/TradeOfferModal/IncomingOffers |
| Forced sale proposal | [../testcase/payment-shortfall-and-forced-sale.md](../testcase/payment-shortfall-and-forced-sale.md) | DebtPanel/ForcedSaleProposalPanel |
| Log/chat | [activity-log-and-chat.instruction.md](./activity-log-and-chat.instruction.md) | Log |
| Desktop shell/runtime | [../ui-ux-overhaul/01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md](../ui-ux-overhaul/01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md) | `apps/desktop/`, preload bridge, bootstrap/runtime config |
| Presentation/design system | [../ui-ux-overhaul/PHASE_1_IMPLEMENTATION_PLAN.md](../ui-ux-overhaul/PHASE_1_IMPLEMENTATION_PLAN.md) | `game/presentation/`, `game/ui/`, `design-system/`, settings/audio |

## Client invariants

- Stable `playerId` từ resume ACK; raw token chỉ trong versioned localStorage.
- Reconnecting giữ snapshot nhưng disable mutation; stale revision bị bỏ.
- `SESSION_SYNC`/`SPECTATOR_SYNC` reset presentation queue và snap display state;
  chỉ `LIVE_UPDATE` mới derive/enqueue animation events.
- Authoritative room/game state cập nhật ngay; display position/turn/dice chỉ là
  presentation state và không được dùng làm nguồn thẩm quyền.
- Spectator read-only; server authority không phụ thuộc action visibility.
- Board/property metadata derive từ `@monopoly/shared`; không duplicate 40-row data.
- Mọi game-unit hiển thị qua một formatter: `60 → 60.000 ₫`,
  `1500 → 1.500.000 ₫`; không còn `$`, `$M`, USD.
- Client không nhận/render exact `DeckState` hoặc credential. Pending landing,
  payment shortfall, `pendingCardInteraction` và seller/buyer forced-sale proposal
  chỉ dùng projection cần cho quyết định UX. Card stages are durable
  `AWAITING_DRAW`/`REVEALED`; `draw card`/`dismiss card` use the operation ID and
  never reveal the private draw pile.
- Public `gameplayEvents` and the active player's private semantic lane are consumed
  through the single `PresentationController → AnimationQueue → PresentationStore`
  path. Card reveal is queued after LAND; session/reconnect hydration snaps to the
  current durable stage without replaying the old card animation.
- Settings dùng key `own-the-block.settings.v1`, normalize/clamp defensive và tách
  khỏi reconnect token. Reduced motion hiệu lực là user setting hoặc OS
  preference. Audio provider owns one lazy Web Audio engine and typed procedural
  SFX registry; existing Master/Music/SFX values update its buses live. The Music
  bus loads four rendered 64-bar, 110 BPM stems from the centralized asset
  manifest, decodes each once, validates their shared timeline, and starts them
  together. Authoritative public board state selects a hysteretic `0..3`
  orchestration level and gain changes wait for a four-bar boundary. Missing or
  incompatible secondary stems degrade to Foundation-only playback. If
  Foundation cannot load, the temporary legacy BGM compatibility fallback keeps
  the room audible; it is not the final soundtrack. `musicVolume` is intentionally
  retained and ambience is deferred. Run `pnpm validate:music-assets` before
  accepting a rendered release. Final rendered stems are still required; see
  [GAMEPLAY_MUSIC_STEM_EXPORT_SPEC.md](../../ui-ux-overhaul/GAMEPLAY_MUSIC_STEM_EXPORT_SPEC.md).
- Desktop renderer dùng `contextIsolation`, `sandbox`, `nodeIntegration: false` và
  typed preload bridge whitelist; Electron main không chứa GameCore/game action.

## Checks

```bash
pnpm --filter @monopoly/client typecheck
pnpm --filter @monopoly/client test
pnpm --filter @monopoly/desktop test
pnpm lint
pnpm build
pnpm desktop:package
```
