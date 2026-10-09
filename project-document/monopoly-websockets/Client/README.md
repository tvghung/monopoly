# Client — Cờ Tỷ Phú Việt Nam

## Phạm vi

React/Vite SPA tại `/`, không Router/menu/permission framework. `App` điều phối
admission/resume, public revision, stable role và typed command ACK. Player/Spectator
can choose Vietnamese or English; Vietnamese is the default.
Technical event/package names and canonical shared game data stay unchanged.

| View/feature | Instruction | Code chính |
| --- | --- | --- |
| Join/restore/reconnect, Online/LAN launcher, unified code/link input, way back, loading/failure screens | [join-room.instruction.md](./join-room.instruction.md) | `App.tsx`, `JoinForm.tsx`, `DesktopMultiplayerLauncher.tsx`, `runtime/joinTargetResolver.ts`, `HostLanSharing.tsx`, session storage, `ConnectionOverlay` |
| Lobby/roster/start/winner/spectator (Solo và 2v2: chế độ, đội, chỗ ngồi và yêu cầu đổi chỗ, host mời người ra khỏi phòng, hồi sinh, thắng đội) | [game-status.instruction.md](./game-status.instruction.md), [../GameCore/team-play.instruction.md](../GameCore/team-play.instruction.md) | `Lobby.tsx`, `components/lobby/` (`LobbySeat`, `TeamZone`, `TeamColorPicker`, `TeamNameField`), `design-system/components/ConfirmationDialog/`, `game/team/` (`teamView.ts`, `TeamChip`), `HostLanSharing.tsx`, `WinnerBanner.tsx`, `useVictoryVisibility.ts`, `SpectatorBanner.tsx` |
| Board/spectator/WebGL surface | [game-board.instruction.md](./game-board.instruction.md) | `Board.tsx`, `game/scene/GameScene.tsx`, `game/scene/board/`, fallback |
| Turn/landing/payment/jail (và 2v2 Emergency Rescue, hồi sinh) | [turn-actions.instruction.md](./turn-actions.instruction.md) | `RollControl`, `BuyPrompt`, `DevelopmentPrompt`, `JailPanel`, `DebtPanel`, `RescuePanel`, `RevivePanel`, `CardInteractionOverlay` |
| Property deed/inspection/portfolio/build/forced sale | [property-management.instruction.md](./property-management.instruction.md) | `game/ui/property/` (`PropertyDeedCard`, `PropertyInspectionModal`, `OwnedPropertiesControl`, `PlayerPortfolioModal`), `DebtPanel` |
| `TradeBundle`/private offers | [trade-offers.instruction.md](./trade-offers.instruction.md) | `TradeOfferModal`, `IncomingOffers`, `useIncomingOffers` |
| Lobby bots (host thêm Bot vào ghế trống, X xóa Bot, huy hiệu Bot; dropdown "Độ khó của Bot" là CURRENT DEVELOPMENT (vNext, unreleased)) | [game-status.instruction.md](./game-status.instruction.md), [../GameCore/bot-players.instruction.md](../GameCore/bot-players.instruction.md) | `apps/client/src/components/Lobby.tsx`, `apps/client/src/components/lobby/LobbySeat.tsx`, `apps/client/src/App.tsx` (`handleAddBot`, `handleRemoveBot`, `handleSetBotDifficulty`) |
| Debt/payment shortfall và forced sale proposal | [turn-actions.instruction.md](./turn-actions.instruction.md), [../Api/socket-debt-and-rescue.instruction.md](../Api/socket-debt-and-rescue.instruction.md), [../testcase/payment-shortfall-and-forced-sale.md](../testcase/payment-shortfall-and-forced-sale.md) | `apps/client/src/components/dashboard/DebtPanel.tsx`, `apps/client/src/components/dashboard/ForcedSaleProposalPanel.tsx`, `apps/client/src/components/dashboard/RescuePanel.tsx` |
| Log/chat | [activity-log-and-chat.instruction.md](./activity-log-and-chat.instruction.md) | Log (ngăn kéo), `game/ui/hud/` |
| Hướng dẫn chơi (nút "?" ở mọi màn hình, hộp thoại 12 mục đóng sẵn, số luật đọc từ `rules.ts`) | [how-to-play.instruction.md](./how-to-play.instruction.md) | `howToPlay/`, `packages/shared/src/rules.ts`, `App.tsx` (toolbar), `Lobby.tsx`, `JoinForm.tsx`, `app/screens/`, `ConnectionOverlay.tsx` |
| Game HUD (tầng phone/tablet/desktop, player card, center stage + nhóm thoát tù, status pill mã phòng, banner khánh thành, callout, dock, ticker, bong bóng, toolbar, toast) | [game-board.instruction.md](./game-board.instruction.md) mục "Game HUD" | `game/ui/hud/`, `components/Log.tsx`, `App.tsx` (toolbar), `components/Toast.tsx` |
| Desktop shell/runtime (Electron main, preload bridge, packaging; HISTORICAL background: [01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md](../../ui-ux-overhaul/01_PHASE_1_DESKTOP_VISUAL_FOUNDATION.md)) | [../Desktop/README.md](../Desktop/README.md), [../Desktop/electron-shell-and-packaging.instruction.md](../Desktop/electron-shell-and-packaging.instruction.md) | `apps/desktop/`, `apps/client/src/app/bootstrap/AppBootstrap.tsx`, `apps/client/src/runtime/desktopBridge.ts` |
| Ngôn ngữ VI/EN (danh sách `SUPPORTED_LANGUAGES`, bộ chọn ngôn ngữ ở menu chính, tên landmark hai ngôn ngữ), preference và migration settings | [language-system.instruction.md](./language-system.instruction.md) | `i18n/` (`languages.ts`, `I18n.tsx`, `catalog.ts`), `components/LanguageSelector.tsx`, `settings/`, `index.tsx`, `game/ui/property/landmarkVisuals.ts`, localized client surfaces |
| Cập nhật tự động (desktop: kiểm tra, tải có xác minh, áp dụng ở thời điểm an toàn, bản bắt buộc, mục "Cập nhật" trong Cài đặt) | [app-update.instruction.md](./app-update.instruction.md) | `apps/desktop/src/update/`, `ipc/`, `preload.ts`, `runtime/appUpdate.tsx`, `components/update/`, `settings/SettingsPanel.tsx`, `apps/desktop/scripts/updateManifest.mjs` |
| Presentation pipeline (snapshot source, animation queue, display state, bot pacing; HISTORICAL plan: [PHASE_1_IMPLEMENTATION_PLAN.md](../../ui-ux-overhaul/PHASE_1_IMPLEMENTATION_PLAN.md)) | [presentation-pipeline.instruction.md](./presentation-pipeline.instruction.md) | `apps/client/src/game/presentation/`, `packages/shared/src/botPacing.ts` |
| Settings và audio (Cài đặt: ngôn ngữ, âm lượng, tốc độ/giảm chuyển động, chất lượng đồ họa, toàn màn hình, cập nhật; Web Audio, nhạc nền) | [settings-and-audio.instruction.md](./settings-and-audio.instruction.md) | `apps/client/src/settings/`, `apps/client/src/audio/` |
| Design system V2 (tokens, primitive, Modal v2 và "Xem bàn cờ" (peek), icon registry, motion, Design Lab + `surfaces`, capture) | [design-system.instruction.md](./design-system.instruction.md) | `design-system/` (`components/Modal/` gồm `modalPeek.ts`, `ModalPeekRestore.tsx`), `settings/ReducedMotionDocumentSync.tsx`, `dev/design-lab/`, `e2e/visual/` |

## Screen switching và vai trò

- Không có URL router. `apps/client/src/App.tsx` chọn màn hình theo `AppPhase`:
  `RESTORING` / `JOIN` / `JOINING` / `LOBBY` / `GAME` / `RECONNECTING` / `REPLACED` / `ERROR`
  (chi tiết: [../monopoly.client.instructions.md](../monopoly.client.instructions.md) "Application state machine").
- Desktop: launcher (main menu) render trước khi có room hoặc Socket.IO client, do
  `apps/client/src/app/bootstrap/AppBootstrap.tsx` chọn khi chưa có `launch`.
- Room `FINISHED` vẫn ở phase `GAME` trên Board, kèm `WinnerBanner`; `play again` của host đưa
  room về `LOBBY` và client nhận snapshot đó dưới nguồn `REPLAY_SYNC` (reset presentation, không animate).
- Vai trò: `RoomRole` = `PLAYER` | `SPECTATOR` (`packages/shared/src/types.ts`). Không có permission
  framework; mọi gate là điều kiện trong code: `canMutate` (connected, phase `GAME`, `PLAYER`,
  `IN_PROGRESS`, membership `ACTIVE`), `canPlayAgain` (connected, phase `GAME`, `PLAYER`, room `FINISHED`, viewer là host, membership không `LEFT`) trong `App.tsx`,
  `isHost` trong `Lobby.tsx`. Server authenticated handler vẫn là authority.

## Client invariants

- Stable `playerId` từ resume ACK; raw token chỉ trong versioned localStorage.
- Reconnecting giữ snapshot nhưng disable mutation; stale revision bị bỏ.
- `SESSION_SYNC`/`SPECTATOR_SYNC`/`REPLAY_SYNC` reset presentation queue và snap display state;
  chỉ `LIVE_UPDATE` mới derive/enqueue animation events
  ([presentation-pipeline.instruction.md](./presentation-pipeline.instruction.md)).
- Authoritative room/game state cập nhật ngay; display position/turn/dice chỉ là
  presentation state và không được dùng làm nguồn thẩm quyền.
- Spectator read-only; server authority không phụ thuộc action visibility.
- Camera người chơi (pinch/kéo/con lăn/nút phóng to–thu nhỏ–về toàn bàn, tự theo token khi đang zoom) chỉ là trình bày trong `boardViewStore`: không chạm state game hay socket, người chơi luôn được ưu tiên
  hơn chuyển động tự động; điện thoại chỉ chơi ngang, máy tính bảng (từ 600 px) chơi cả ngang lẫn dọc ([game-board.instruction.md](./game-board.instruction.md) "Responsive gameplay").
- "Xem bàn cờ" (peek) của `Modal` chỉ là trình bày: ẩn/hiện không gửi lệnh, không đóng dialog, không đổi state có thẩm quyền; khi quyết định đang ẩn, thẻ ô đất trên bàn cờ chỉ đọc
  ([design-system.instruction.md](./design-system.instruction.md) "Xem bàn cờ (peek)").
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
  `REVEALED`; the operation ID and `dismiss card` command stay operation-scoped in host RAM
  (reconnect-safe while the host process lives) and never
  reveal the private draw pile. A legacy `AWAITING_DRAW` stage is protocol-9
  compatibility only; the current client has no Draw action or emission.
- Public `gameplayEvents` and the active player's private semantic lane are consumed
  through the single `PresentationController → AnimationQueue → PresentationStore`
  path. Card reveal is queued after the authoritative LAND boundary; session/
  reconnect hydration snaps to the current revealed card without replaying a draw
  animation. The effect waits for the acting player to press `Đóng`.
- Settings có thêm `graphicsQuality` (`auto` | `high` | `balanced` | `low`, mặc định `auto`);
  giá trị lạ normalize về `auto`. Chi tiết tier ở [game-board.instruction.md](./game-board.instruction.md).
- Settings dùng key `own-the-block.settings.v2` (key `v1` cũ chỉ được đọc để migrate), normalize/clamp defensive và tách
  khỏi reconnect token. Reduced motion hiệu lực là user setting hoặc OS
  preference. Audio: một Web Audio engine lazy, bus Master/Music/SFX, nhạc nền một loop duy nhất
  chỉ khi room `IN_PROGRESS`. Chi tiết và lịch sử thiết kế audio:
  [settings-and-audio.instruction.md](./settings-and-audio.instruction.md).
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
pnpm validate:docs
```
