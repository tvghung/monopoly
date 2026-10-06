# Client — Cờ Tỷ Phú Việt Nam

## Phạm vi

React/Vite SPA tại `/`, không Router/menu/permission framework. `App` điều phối
admission/resume, public revision, stable role và typed command ACK. Toàn bộ text mà
Player/Spectator nhìn thấy là tiếng Việt; technical event/package names giữ nguyên.

| View/feature | Instruction | Code chính |
| --- | --- | --- |
| Join/restore/reconnect, landing, launcher (main menu, "Cài đặt", "Thoát"), way back to the launcher, loading/failure screens | [join-room.instruction.md](./join-room.instruction.md) | `App.tsx`, `JoinForm.tsx`, `JoinHero.tsx`, `DesktopMultiplayerLauncher.tsx`, `LauncherScene.tsx`, `app/screens/`, session storage, `ConnectionOverlay` |
| Lobby/roster/start/winner/spectator (Solo và 2v2: chế độ, đội, chỗ ngồi và yêu cầu đổi chỗ, host mời người ra khỏi phòng, hồi sinh, thắng đội) | [game-status.instruction.md](./game-status.instruction.md), [../GameCore/team-play.instruction.md](../GameCore/team-play.instruction.md) | `Lobby.tsx`, `components/lobby/` (`LobbySeat`, `TeamZone`, `TeamColorPicker`, `TeamNameField`), `design-system/components/ConfirmationDialog/`, `game/team/` (`teamView.ts`, `TeamChip`), `HostLanSharing.tsx`, `WinnerBanner.tsx`, `useVictoryVisibility.ts`, `SpectatorBanner.tsx` |
| Board/spectator/WebGL surface | [game-board.instruction.md](./game-board.instruction.md) | `Board.tsx`, `game/scene/GameScene.tsx`, `game/scene/board/`, fallback |
| Turn/landing/payment/jail (và 2v2 Emergency Rescue, hồi sinh) | [turn-actions.instruction.md](./turn-actions.instruction.md) | `RollControl`, `BuyPrompt`, `DevelopmentPrompt`, `JailPanel`, `DebtPanel`, `RescuePanel`, `RevivePanel`, `CardInteractionOverlay` |
| Property deed/inspection/portfolio/build/forced sale | [property-management.instruction.md](./property-management.instruction.md) | `game/ui/property/` (`PropertyDeedCard`, `PropertyInspectionModal`, `OwnedPropertiesControl`, `PlayerPortfolioModal`), `DebtPanel` |
| `TradeBundle`/private offers | [trade-offers.instruction.md](./trade-offers.instruction.md) | `TradeOfferModal`, `IncomingOffers`, `useIncomingOffers` |
| Forced sale proposal | [../testcase/payment-shortfall-and-forced-sale.md](../testcase/payment-shortfall-and-forced-sale.md) | DebtPanel/ForcedSaleProposalPanel |
| Log/chat | [activity-log-and-chat.instruction.md](./activity-log-and-chat.instruction.md) | Log (ngăn kéo), `game/ui/hud/` |
| Hướng dẫn chơi (nút "?" ở mọi màn hình, hộp thoại 12 mục đóng sẵn, số luật đọc từ `rules.ts`) | [how-to-play.instruction.md](./how-to-play.instruction.md) | `howToPlay/`, `packages/shared/src/rules.ts`, `App.tsx` (toolbar), `Lobby.tsx`, `JoinForm.tsx`, `app/screens/`, `ConnectionOverlay.tsx` |
| Game HUD (player card, center stage, status pill, banner, callout, dock, ticker, bong bóng, toolbar, toast) | [game-board.instruction.md](./game-board.instruction.md) mục "Game HUD" | `game/ui/hud/`, `components/Log.tsx`, `App.tsx` (toolbar), `components/Toast.tsx` |
| Desktop shell/runtime | [../ui-ux-overhaul/01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md](../ui-ux-overhaul/01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md) | `apps/desktop/`, preload bridge, bootstrap/runtime config |
| Cập nhật tự động (desktop: kiểm tra, tải có xác minh, áp dụng ở thời điểm an toàn, bản bắt buộc, mục "Cập nhật" trong Cài đặt) | [app-update.instruction.md](./app-update.instruction.md) | `apps/desktop/src/update/`, `ipc/`, `preload.ts`, `runtime/appUpdate.tsx`, `components/update/`, `settings/SettingsPanel.tsx`, `apps/desktop/scripts/updateManifest.mjs` |
| Presentation | [../ui-ux-overhaul/PHASE_1_IMPLEMENTATION_PLAN.md](../ui-ux-overhaul/PHASE_1_IMPLEMENTATION_PLAN.md) | `game/presentation/`, `game/ui/`, settings/audio |
| Design system V2 (tokens, primitive, Modal v2, icon registry, motion, Design Lab + `surfaces`, capture) | [design-system.instruction.md](./design-system.instruction.md) | `design-system/`, `settings/ReducedMotionDocumentSync.tsx`, `dev/design-lab/`, `e2e/visual/` |

## Client invariants

- Stable `playerId` từ resume ACK; raw token chỉ trong versioned localStorage.
- Reconnecting giữ snapshot nhưng disable mutation; stale revision bị bỏ.
- `SESSION_SYNC`/`SPECTATOR_SYNC` reset presentation queue và snap display state;
  chỉ `LIVE_UPDATE` mới derive/enqueue animation events.
- Authoritative room/game state cập nhật ngay; display position/turn/dice chỉ là
  presentation state và không được dùng làm nguồn thẩm quyền.
- Spectator read-only; server authority không phụ thuộc action visibility.
- 2v2 (protocol 10; chỗ ngồi `teamSlot` và `seatSwapRequests` từ protocol 11): mọi dữ liệu team lấy từ public state đã được server gửi (`boardState.teams`, `teamPlay`, `winningTeamId`,
  `teamId` từng người, `PaymentQueue.rescue`) qua `game/team/teamView.ts`; client không tự tính luật team ngoài số shared
  (`colorSetRentPercent`, `getTeammateIds`). Trong Solo mọi helper trả "không có team" nên UI Solo không đổi. Chi tiết:
  [../GameCore/team-play.instruction.md](../GameCore/team-play.instruction.md).
- `PresentationController` reset (snap, không animate) khi có người xuất hiện lại trong `LIVE_UPDATE` (hồi sinh) giống khi có người bị gỡ.
- Board/property metadata derive từ `@monopoly/shared`; không duplicate 40-row data.
- Mọi game-unit hiển thị qua một formatter: `60 → 60.000 ₫`,
  `1500 → 1.500.000 ₫`; không còn `$`, `$M`, USD.
- Client không nhận/render exact `DeckState` hoặc credential. Pending landing,
  payment shortfall, `pendingCardInteraction` và seller/buyer forced-sale proposal
  chỉ dùng projection cần cho quyết định UX. A normal card landing is immediately
  `REVEALED`; the operation ID and `dismiss card` command remain durable and never
  reveal the private draw pile. Persisted `AWAITING_DRAW` is legacy protocol-9
  compatibility only; the current client has no Draw action or emission.
- Public `gameplayEvents` and the active player's private semantic lane are consumed
  through the single `PresentationController → AnimationQueue → PresentationStore`
  path. Card reveal is queued after the authoritative LAND boundary; session/
  reconnect hydration snaps to the current revealed card without replaying a draw
  animation. The effect waits for the acting player to press `Đóng`.
- Settings có thêm `graphicsQuality` (`auto` | `high` | `balanced` | `low`, mặc định `auto`);
  giá trị lạ normalize về `auto`. Chi tiết tier ở [game-board.instruction.md](./game-board.instruction.md).
- Settings dùng key `own-the-block.settings.v1`, normalize/clamp defensive và tách
  khỏi reconnect token. Reduced motion hiệu lực là user setting hoặc OS
  preference. Audio provider owns one lazy Web Audio engine and typed SFX
  registry; existing Master/Music/SFX values update its buses live. The Music
  bus loads exactly one rendered loop from
  `audio/music/own-the-block-main-theme-loop.ogg` (Ogg Vorbis, stereo 48 kHz), decodes one looping buffer,
  and runs only while authoritative room status is `IN_PROGRESS`. Lobby,
  finished, and replay-lobby states are silent; no procedural BGM fallback or
  adaptive multi-stem arrangement exists. Run `pnpm validate:music-assets` before
  accepting a rendered release. The earlier stem design is historical in
  [V1_AUDIO_SEGMENTED_TRANSPORT.md](../../ui-ux-overhaul/V1_AUDIO_SEGMENTED_TRANSPORT.md)
  and [V1_AUDIO_PRODUCTION_PIPELINE.md](../../ui-ux-overhaul/V1_AUDIO_PRODUCTION_PIPELINE.md).
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
