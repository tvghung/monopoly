# Feature traceability

Status: CURRENT. Answers: *to change feature X, which documents do I read, where is the code, and which tests and manual checks
prove it?* Mappings are many-to-many; a feature lists every module it touches. Paths are repo-relative and checked by
`pnpm validate:docs`. Scope labels and conflict rules: [Documentation Hub](../README.md#lifecycle-and-scope-labels).

**Coverage status**
- **COMPLETE** — a reader can find the owning code, the documented behavior, and an automated or recorded verification path.
- **PARTIAL** — something is missing; the *Gap* line says what.
- **MISSING** — no current documentation.

**How to use an entry:** read the *Docs* (canonical first) and their foundation rule, open the *Client/Server/Shared* code, run the
*Tests*, walk the *Manual* checklist for user-visible changes, then re-check every feature in *Affects*.

## Summary

| ID | Feature | Canonical doc | Status |
| --- | --- | --- | --- |
| F01 | Bootstrap, loading and boot errors | [join-room][c-join] | COMPLETE |
| F02 | Desktop launcher (host/join, LAN/Online) | [join-room][c-join] | COMPLETE |
| F03 | Web join form | [join-room][c-join] | COMPLETE |
| F04 | Session resume, reconnect, newest connection wins | [socket-session][a-sess] | COMPLETE |
| F05 | Host continuity relink | [join-room][c-join] | COMPLETE |
| F06 | Host room-creation capability and admission limits | [socket-session][a-sess] | COMPLETE |
| F07 | Leave, forfeit ("Bỏ cuộc") and watch on | [join-room][c-join] | COMPLETE |
| F08 | Desktop close / quit while hosting or playing | [Desktop shell][d-shell] | COMPLETE |
| F09 | Lobby roster, Ready and appearance | [game-status][c-status] | COMPLETE |
| F10 | Start game | [socket-lobby][a-lobby] | COMPLETE |
| F11 | 2v2 mode, teams, seats and seat swaps | [team-play][g-team] | COMPLETE |
| F12 | Host kicks a player | [socket-lobby][a-lobby] | COMPLETE |
| F13 | Bot seats (add/remove) | [bot-players][g-bot] | COMPLETE |
| F14 | Bot difficulty (CURRENT DEVELOPMENT) | [bot-players][g-bot] | PARTIAL |
| F15 | Bots playing a match | [bot-players][g-bot] | COMPLETE |
| F16 | LAN sharing and discovery | [http-runtime][a-http] | COMPLETE |
| F17 | Online Quick Tunnel and room registry | [http-runtime][a-http] | COMPLETE |
| F18 | WebGL game board | [game-board][c-board] | COMPLETE |
| F19 | 2D fallback board and accessible tile buttons | [game-board][c-board] | COMPLETE |
| F20 | Camera zoom/pan and responsive layout tiers | [game-board][c-board] | COMPLETE |
| F21 | Game HUD (player cards, status pill, ticker, dock, toasts) | [game-board][c-board] | COMPLETE |
| F22 | Roll dice and turn flow | [socket-turn][a-turn] | COMPLETE |
| F23 | Purchase decision | [turn-actions][c-turn] | PARTIAL |
| F24 | Development (build) and Team Investment | [property-economy][g-eco] | COMPLETE |
| F25 | Sell house | [socket-building][a-build] | COMPLETE |
| F26 | Tile resolution, rent and taxes | [tile-cards-and-jail][g-tile] | PARTIAL |
| F27 | Chance / Community Chest cards | [tile-cards-and-jail][g-tile] | COMPLETE |
| F28 | Jail | [tile-cards-and-jail][g-tile] | PARTIAL |
| F29 | Payment shortfall and bank sale | [socket-debt-and-rescue][a-debt] | PARTIAL |
| F30 | Forced-sale proposal | [socket-debt-and-rescue][a-debt] | PARTIAL |
| F31 | Bankruptcy and winner | [turn-movement-and-bankruptcy][g-turn] | COMPLETE |
| F32 | Play again | [socket-lobby][a-lobby] | COMPLETE |
| F33 | 2v2 Emergency Rescue | [team-play][g-team] | COMPLETE |
| F34 | 2v2 revive teammate | [team-play][g-team] | COMPLETE |
| F35 | Compose a trade offer | [trade-offers][c-trade] | COMPLETE |
| F36 | Incoming offers (accept, decline, expiry, cancel) | [socket-trading][a-trade] | COMPLETE |
| F37 | Property inspection, deed and portfolios | [property-management][c-prop] | COMPLETE |
| F38 | Activity log and chat | [activity-log-and-chat][c-log] | COMPLETE |
| F39 | Spectator mode | [game-board][c-board] | COMPLETE |
| F40 | Presentation pipeline | [presentation-pipeline][c-pres] | COMPLETE |
| F41 | Settings panel | [settings-and-audio][c-set] | COMPLETE |
| F42 | Audio and music | [settings-and-audio][c-set] | COMPLETE |
| F43 | Language VI/EN | [language-system][c-lang] | COMPLETE |
| F44 | How to play | [how-to-play][c-how] | COMPLETE |
| F45 | In-app update | [app-update][c-upd] | COMPLETE |
| F46 | Design system and modal peek | [design-system][c-ds] | COMPLETE |
| F47 | Electron shell, security and preload bridge | [Desktop shell][d-shell] | COMPLETE |
| F48 | Host runtime and server helper | [Desktop shell][d-shell] | COMPLETE |
| F49 | RAM store, command executor and deadlines | [Persistence][pers] | COMPLETE |
| F50 | Shared contracts, schemas and versioning | [socket-and-state-contracts][s-con] | COMPLETE |
| F51 | Packaging and release | [V1_RELEASE_CONTRACT](../ui-ux-overhaul/V1_RELEASE_CONTRACT.md) | PARTIAL |
| F52 | Dev-only tools (Design Lab, UAT harness, FPS) | [design-system][c-ds] | COMPLETE |

**Totals: 52 features — 45 COMPLETE, 7 PARTIAL, 0 MISSING.** No current instruction file was found whose code no longer exists.

## Session and entry

### F01 Bootstrap, loading and boot errors
- **Entry:** app start (web page load or desktop window); no URL router.
- **Docs:** [join-room][c-join]; foundation [client][fc].
- **Client:** `apps/client/src/index.tsx`, `apps/client/src/app/bootstrap/AppBootstrap.tsx`, `apps/client/src/app/bootstrap/bootstrap.ts`, `apps/client/src/app/screens/`.
- **Server / Shared:** none; protocol constant from `packages/shared/src/types.ts`.
- **Tests:** `apps/client/src/app/bootstrap/AppBootstrap.test.tsx`, `apps/client/src/app/screens/LoadingScreen.test.tsx`, `apps/client/src/app/screens/AppErrorBoundary.test.tsx`, `apps/client/src/runtime/runtimeConfig.test.ts`.
- **Manual:** [join checklist][t-join].
- **Affects:** F02, F41, F45.

### F02 Desktop launcher (host/join, LAN/Online)
- **Entry:** desktop start, before any room: Tạo phòng (LAN/Online), Tham gia phòng, Cài đặt, language, Thoát.
- **Docs:** [join-room][c-join], [Desktop index][d-idx], [http-runtime][a-http]; foundation [client][fc], [shared][fs].
- **Client:** `apps/client/src/components/DesktopMultiplayerLauncher.tsx`, `apps/client/src/runtime/joinTargetResolver.ts`, `apps/client/src/runtime/desktopBridge.ts`.
- **Desktop:** `apps/desktop/src/hostRuntime.ts`, `apps/desktop/src/lanFinder.ts`, `apps/desktop/src/online/`.
- **Shared:** `packages/shared/src/endpointPolicy.ts`.
- **Tests:** `apps/client/src/components/DesktopMultiplayerLauncher.test.tsx`, `apps/client/src/runtime/joinTargetResolver.test.ts`, `apps/desktop/tests/hostRuntime.test.ts`.
- **Manual:** [join checklist][t-join], [hosting checklist][t-http].
- **Affects:** F05, F16, F17, F48.

### F03 Web join form
- **Entry:** web `JOIN` phase; code or invitation link field.
- **Docs:** [join-room][c-join], [socket-session][a-sess].
- **Client:** `apps/client/src/components/JoinForm.tsx`, `apps/client/src/App.tsx` (`join room`).
- **Server:** `apps/server/src/socket/session.ts` (`join room`).
- **Shared:** `packages/shared/src/socketSchemas.ts` (`joinRoomRequestSchema`).
- **Tests:** `apps/client/src/components/JoinForm.test.tsx`, `apps/server/src/socket.integration.test.ts`, `apps/server/src/hostAdmission.integration.test.ts`.
- **Manual:** [join checklist][t-join]. **Affects:** F04, F06, F39.

### F04 Session resume, reconnect, newest connection wins
- **Entry:** page load with a stored token; socket disconnect/reconnect.
- **Docs:** [socket-session][a-sess], [room-lifecycle][g-room], [join-room][c-join]; [ADR-04][adr]; foundation [shared][fs].
- **Client:** `apps/client/src/App.tsx`, `apps/client/src/playerSessionStorage.ts`, `apps/client/src/components/ConnectionOverlay.tsx`.
- **Server:** `apps/server/src/socket/session.ts` (`resume session`, `disconnect`).
- **Services:** `apps/server/src/services/playerSessionService.ts`, `apps/server/src/services/connectionRegistry.ts`, `apps/server/src/services/deadlineScheduler.ts`.
- **Shared:** `packages/shared/src/events.ts`.
- **Tests:** `apps/client/src/App.test.tsx`, `apps/client/src/playerSessionStorage.test.ts`, `apps/server/src/socket.integration.test.ts`, `apps/server/src/services/connectionRegistry.test.ts`.
- **Manual:** [join checklist][t-join] (reconnect while the host lives; host exit loses the room).
- **Affects:** F05, F07, F15, F49.

### F05 Host continuity relink
- **Entry:** reconnect stalled for 20 s → "Mất kết nối" dialog accepts a new invitation link.
- **Docs:** [join-room][c-join], [http-runtime][a-http]; [ADR-08][adr].
- **Client:** `apps/client/src/runtime/hostContinuity.ts`, `apps/client/src/components/ConnectionOverlay.tsx`.
- **Server:** `apps/server/src/createServer.ts` (`/_otb/continuity`), `apps/server/src/services/hostContinuity.ts`.
- **Shared:** `packages/shared/src/hostContinuity.ts`.
- **Tests:** `apps/server/src/hostContinuity.integration.test.ts`, `apps/client/src/runtime/hostContinuity.test.ts`, `apps/client/src/components/ConnectionOverlay.test.tsx`.
- **Manual:** [hosting checklist][t-http]. **Affects:** F04, F17.

### F06 Host room-creation capability and admission limits
- **Entry:** first `join room` of the desktop host; every guest admission.
- **Docs:** [socket-session][a-sess], [http-runtime][a-http]; [ADR-08][adr]; foundation [shared][fs].
- **Server:** `apps/server/src/socket/index.ts` (`canCreateRoom`), `apps/server/src/socket/admissionLimiter.ts`, `apps/server/src/socket/clientIdentity.ts`.
- **Desktop:** `apps/desktop/src/hostRuntime.ts` (capability secret).
- **Tests:** `apps/server/src/hostAdmission.integration.test.ts`, `apps/desktop/tests/windowHandlers.test.ts`.
- **Manual:** [hosting checklist][t-http]. **Affects:** F03, F48.

### F07 Leave, forfeit ("Bỏ cuộc") and watch on
- **Entry:** toolbar Bỏ cuộc / Rời phòng → ConfirmationDialog → ForfeitChoiceDialog ("Xem tiếp").
- **Docs:** [join-room][c-join], [socket-lobby][a-lobby], [room-lifecycle][g-room].
- **Client:** `apps/client/src/App.tsx`, `apps/client/src/components/ForfeitChoiceDialog.tsx`, `apps/client/src/roomExitContext.ts`.
- **Server:** `apps/server/src/socket/lobby.ts` (`leave room`), `apps/server/src/game/bankruptcy.ts`, `apps/server/src/game/turn.ts` (`removePlayerRecord` returns held jail-free cards).
- **Tests:** `apps/client/src/App.test.tsx` (forfeit and "Xem tiếp" cases), `apps/server/src/socket.integration.test.ts`, `apps/server/src/socket.teamplay.integration.test.ts` (leave of a finished 2v2 room while holding a jail-free card), `apps/server/src/game.test.ts`.
- **Manual:** [join checklist][t-join], [status checklist][t-status]. **Affects:** F29, F31, F39.

### F08 Desktop close / quit while hosting or playing
- **Entry:** window close or Thoát during a game; the host sees the host-close warning.
- **Docs:** [Desktop shell][d-shell], [join-room][c-join]; [ADR-11][adr].
- **Client:** `apps/client/src/App.tsx` (quit confirmation), `apps/client/src/i18n/catalog.ts` (`app.closeHostMessage`).
- **Desktop:** `apps/desktop/src/ipc/windowHandlers.ts` (`QuitRequestController`), `apps/desktop/src/appQuitCoordinator.ts`, `apps/desktop/src/ipc/channels.ts`, `apps/desktop/src/preload.ts` (`quit` bridge).
- **Tests:** `apps/client/src/App.test.tsx` ("confirms active desktop close without emitting leave room"), `apps/desktop/tests/quitRequestController.test.ts`, `apps/desktop/tests/appQuitCoordinator.test.ts`, `apps/desktop/tests/windowHandlers.test.ts`, `apps/desktop/tests/preloadBridge.test.ts`.
- **Manual:** [join checklist][t-join] (host close vs guest close copy; active game close must not emit `leave room`).
- **Note:** CURRENT DEVELOPMENT fix of a confirmed fail-open (released v1.7.0 closed the window 2 s after asking, even with the dialog
  open): the renderer now acknowledges the dialog (`ownTheBlock:quit:prompting`) and main waits for the player; see
  [Desktop shell][d-shell]. Real-app behaviour on Windows/macOS: NOT RUN (automated tests only).
- **Affects:** F04, F48.

## Lobby

### F09 Lobby roster, Ready and appearance
- **Entry:** `LOBBY` phase (player role).
- **Docs:** [game-status][c-status], [socket-lobby][a-lobby]; foundation [client][fc].
- **Client:** `apps/client/src/components/Lobby.tsx`, `apps/client/src/components/lobby/LobbySeat.tsx`, `apps/client/src/components/lobby/MascotPicker.tsx`.
- **Server:** `apps/server/src/socket/lobby.ts` (`set ready`, `set appearance`).
- **Shared:** `packages/shared/src/types.ts` (`SetAppearanceRequest`).
- **Tests:** `apps/client/src/components/Lobby.test.tsx`, `apps/client/src/components/lobby/MascotPicker.test.tsx`, `apps/server/src/socket.integration.test.ts`.
- **Manual:** [status checklist][t-status]. **Affects:** F10, F11, F13.

### F10 Start game
- **Entry:** host "Bắt đầu" in the lobby.
- **Docs:** [socket-lobby][a-lobby], [room-lifecycle][g-room], [game-status][c-status], [bot-players][g-bot].
- **Rule:** 2–4 active seats, at least one human, every human connected and Ready (bots always Ready/present); 2v2 exactly 4, two per team.
- **Client:** `apps/client/src/components/Lobby.tsx`, `apps/client/src/components/lobby/startReadiness.ts`.
- **Server:** `apps/server/src/socket/lobby.ts` (`start game`), `apps/server/src/game/dice.ts` (starting roll).
- **Tests:** `apps/client/src/components/lobby/startReadiness.test.ts`, `apps/server/src/socket.integration.test.ts`, `apps/server/src/socket.bots.integration.test.ts`.
- **Manual:** [status checklist][t-status]. **Affects:** F11, F13, F22.

### F11 2v2 mode, teams, seats and seat swaps
- **Entry:** lobby mode control (host), team name/color fields, seat cells.
- **Docs:** [team-play][g-team], [socket-lobby][a-lobby], [game-status][c-status].
- **Client:** `apps/client/src/components/lobby/TeamZone.tsx`, `apps/client/src/components/lobby/TeamNameField.tsx`, `apps/client/src/components/lobby/TeamColorPicker.tsx`, `apps/client/src/game/team/teamView.ts`.
- **Server:** `apps/server/src/socket/team.ts`, `apps/server/src/teamLobby.ts`.
- **Shared:** `packages/shared/src/teams.ts`.
- **Tests:** `apps/client/src/components/Lobby.teamplay.test.tsx`, `apps/server/src/socket.teamplay.integration.test.ts`, `apps/server/src/socket.lobbySeats.integration.test.ts`.
- **Manual:** [team checklist][t-team]. **Affects:** F10, F24, F33, F34.

### F12 Host kicks a player
- **Entry:** X on another lobby seat → confirmation.
- **Docs:** [socket-lobby][a-lobby], [game-status][c-status].
- **Client:** `apps/client/src/components/Lobby.tsx`. **Server:** `apps/server/src/socket/lobby.ts` (`kick player`).
- **Tests:** `apps/client/src/components/Lobby.test.tsx`, `apps/server/src/socket.lobbySeats.integration.test.ts`.
- **Manual:** [team checklist][t-team]. **Affects:** F04, F13.

### F13 Bot seats (add/remove)
- **Entry:** host "Thêm Bot" on an empty seat; X on a bot seat (no confirmation).
- **Docs:** [bot-players][g-bot], [socket-lobby][a-lobby], [game-status][c-status]; [ADR-09][adr].
- **Client:** `apps/client/src/components/Lobby.tsx`, `apps/client/src/components/lobby/LobbySeat.tsx`.
- **Server:** `apps/server/src/socket/bots.ts`, `apps/server/src/bots/botSeats.ts`, `apps/server/src/services/botRequestLedger.ts`.
- **Shared:** `packages/shared/src/types.ts` (`AddBotRequest`, `MAX_BOTS_PER_ROOM`).
- **Tests:** `apps/client/src/components/Lobby.test.tsx`, `apps/server/src/socket.bots.integration.test.ts`.
- **Manual:** [bot checklist][t-bot]. **Affects:** F10, F14, F15.

### F14 Bot difficulty — CURRENT DEVELOPMENT (unreleased)
- **Entry:** lobby dropdown "Độ khó của Bot" (shown with ≥1 bot; host changes, guests read-only).
- **Docs:** [bot-players][g-bot], [socket-lobby][a-lobby], [game-status][c-status]; [ADR-13][adr].
- **Client:** `apps/client/src/components/Lobby.tsx`, `apps/client/src/App.tsx` (`set bot difficulty`).
- **Server:** `apps/server/src/socket/bots.ts`, `apps/server/src/bots/policy.ts` (`DIFFICULTY_PROFILES`), `apps/server/src/services/publicState.ts` (projects MEDIUM when absent), `apps/server/src/socket/lobby.ts` (`play again` keeps the setting).
- **Shared:** `packages/shared/src/types.ts` (`BOT_DIFFICULTIES`), `packages/shared/src/socketSchemas.ts`, `packages/shared/src/stateSchemas.ts`.
- **Tests:** `apps/server/src/bots/policy.test.ts`, `apps/server/src/socket.bots.integration.test.ts`, `apps/client/src/components/Lobby.test.tsx`.
- **Manual:** [bot checklist][t-bot] (full game per level NOT RUN).
- **Gap:** released v1.7.0 has no difficulty; protocol 13 rejects 1.7.0 apps (R-1 RESOLVED in code, [release matrix][t-rel]); manual play per level NOT RUN.
- **Affects:** F13, F15, F32.

### F15 Bots playing a match
- **Entry:** automatic once a match with bots starts.
- **Docs:** [bot-players][g-bot]; [BOT_SYSTEM_SPEC](../own-the-block-vnext/BOT_SYSTEM_SPEC.md) (REFERENCE).
- **Client:** `apps/client/src/game/presentation/botPacing.test.ts` (pacing), `packages/shared/src/botPacing.ts`.
- **Server:** `apps/server/src/bots/driver.ts`, `apps/server/src/bots/policy.ts`, `apps/server/src/bots/view.ts`, `apps/server/src/commands/gameplay.ts`.
- **Tests:** `apps/server/src/bots/driver.test.ts`, `apps/server/src/bots/policy.test.ts`, `apps/server/src/socket.botDriver.integration.test.ts`.
- **Manual:** [bot checklist][t-bot]; v1.7.0 full games OWNER-REPORTED ([release matrix][t-rel]).
- **Affects:** F22–F36 (bots answer purchase, build, card, jail, debt, rescue, forced sale and offers).

## Hosting and networking

### F16 LAN sharing and discovery
- **Entry:** host lobby QR/link card; guests type a room code on the same network.
- **Docs:** [http-runtime][a-http], [join-room][c-join], [Desktop index][d-idx]; [ADR-08][adr].
- **Client:** `apps/client/src/components/HostLanSharing.tsx`, `apps/client/src/runtime/lanSharing.ts`.
- **Server:** `apps/server/src/lanDiscoveryResponder.ts`. **Desktop:** `apps/desktop/src/lanFinder.ts`.
- **Tests:** `apps/client/src/components/HostLanSharing.test.tsx`, `apps/server/src/lanDiscoveryResponder.test.ts`, `apps/desktop/tests/lanFinder.test.ts`, `apps/desktop/tests/lanDiscoveryContract.test.ts`; packaged `pnpm desktop:proof:host`.
- **Manual:** [hosting checklist][t-http] (physical LAN is MANUAL-E2E). **Affects:** F02, F48.

### F17 Online Quick Tunnel and room registry
- **Entry:** launcher Online host; invitation link; optional bare-code lookup.
- **Docs:** [http-runtime][a-http], [Desktop index][d-idx], [room registry README](../../services/room-registry/README.md); [ADR-08][adr].
- **Desktop:** `apps/desktop/src/online/connectivity.ts`, `apps/desktop/src/online/discovery.ts`, `apps/desktop/cloudflared-integrity.json`.
- **Server:** `apps/server/src/createServer.ts` (`/_otb/room`, `/_otb/registry-proof`), `apps/server/src/socket/clientIdentity.ts`.
- **Registry:** `services/room-registry/src/index.js`.
- **Client (remote join):** `apps/client/src/runtime/joinTargetResolver.ts` (code or link), `packages/shared/src/endpointPolicy.ts` (allowed public origins), `apps/client/src/components/ConnectionOverlay.tsx` (relink).
- **Tests:** `apps/desktop/src/online/connectivity.test.ts`, `apps/desktop/src/online/discovery.test.ts`, `services/room-registry/src/index.test.mjs`, `apps/server/src/createServer.test.ts`; live probe `scripts/proveQuickTunnel.mjs` (manual, same network).
- **Manual:** [hosting checklist][t-http] (cross-network is MANUAL-E2E). **Affects:** F05, F06, F48.

## Board and HUD

### F18 WebGL game board
- **Entry:** `GAME` phase.
- **Docs:** [game-board][c-board], [presentation-pipeline][c-pres]; [ADR-10][adr].
- **Client:** `apps/client/src/components/Board.tsx`, `apps/client/src/game/scene/GameScene.tsx`, `apps/client/src/game/scene/board/`.
- **Shared:** `packages/shared/src/tileState.ts`.
- **Tests:** `apps/client/src/game/scene/GameScene.test.tsx`, `apps/client/src/components/Board.test.tsx` and the tests under `apps/client/src/game/scene/`.
- **Manual:** [client checklist][t-client]. **Affects:** F19, F20, F40.

### F19 2D fallback board and accessible tile buttons
- **Entry:** no WebGL or renderer error; keyboard/screen-reader tile buttons.
- **Docs:** [game-board][c-board].
- **Client:** `apps/client/src/components/legacy-board/`, `apps/client/src/components/BoardAccessibilityControls.tsx`, `apps/client/src/components/rendererMode.ts`, `apps/client/src/game/scene/fallback/`.
- **Tests:** `apps/client/src/components/BoardAccessibilityControls.test.tsx`, `apps/client/src/components/rendererMode.test.ts`, `apps/client/src/game/scene/fallback/SceneErrorBoundary.test.tsx`, `e2e/mobile-host.spec.ts`.
- **Manual:** [client checklist][t-client]. **Affects:** F18, F37.

### F20 Camera zoom/pan and responsive layout tiers
- **Entry:** HUD camera buttons, pinch, drag, wheel; phone/tablet/desktop tiers.
- **Docs:** [game-board][c-board].
- **Client:** `apps/client/src/game/ui/hud/CameraControls.tsx`, `apps/client/src/game/scene/camera/`.
- **Tests:** `apps/client/src/game/ui/hud/CameraControls.test.tsx`, `e2e/mobile-host.spec.ts`.
- **Manual:** [client checklist][t-client]. **Affects:** F18, F21.

### F21 Game HUD (player cards, status pill, ticker, dock, toasts)
- **Entry:** `GAME` phase.
- **Docs:** [game-board][c-board] ("Game HUD"), [game-status][c-status].
- **Client:** `apps/client/src/game/ui/hud/`, `apps/client/src/components/Toast.tsx`.
- **Tests:** `apps/client/src/game/ui/hud/PlayerCardList.test.tsx`, `apps/client/src/game/ui/hud/centerStage.test.tsx`, `apps/client/src/game/ui/hud/tickerAndBubbles.test.tsx`, `apps/client/src/components/Toast.test.tsx`.
- **Manual:** [client checklist][t-client]. **Affects:** F22, F38, F40.

## Turn and economy

### F22 Roll dice and turn flow
- **Entry:** center stage "Đổ xúc xắc" (or Space).
- **Docs:** [socket-turn][a-turn], [turn-movement-and-bankruptcy][g-turn], [turn-actions][c-turn]; foundation [game core][fg].
- **Client (command):** `apps/client/src/game/ui/hud/RollControl.tsx`, `apps/client/src/game/ui/hud/rollControlLogic.ts`, `apps/client/src/rollDiceRequest.ts`.
- **Client (animation, presentation only):** `apps/client/src/game/presentation/executors/diceExecutor.ts`, `apps/client/src/game/presentation/executors/movementExecutor.ts`, `apps/client/src/game/scene/dice/` (3D dice), `apps/client/src/components/legacy-board/LegacyDiceOverlay.tsx` (2D fallback), `apps/client/src/game/ui/hud/DiceResultCallout.tsx`; timings in `apps/client/src/game/presentation/timings.ts`; bot pacing waits for it via `packages/shared/src/botPacing.ts`.
- **Server:** `apps/server/src/socket/turn.ts`, `apps/server/src/commands/gameplay.ts` (`rollDiceCommand`), `apps/server/src/game/dice.ts`, `apps/server/src/game/turn.ts`.
- **Tests:** `apps/client/src/game/ui/hud/rollControl.test.ts`, `apps/client/src/rollDiceRequest.test.ts`, `apps/client/src/game/presentation/executors/diceExecutor.test.ts`, `apps/client/src/game/presentation/executors/movementExecutor.test.ts`, `apps/client/src/game/scene/dice/diceOrientation.test.ts`, `apps/client/src/game/ui/hud/turnAndDiceOverlays.test.tsx`, `apps/client/src/components/legacy-board/LegacyDiceOverlay.test.tsx`, `apps/server/src/game.test.ts`, `apps/server/src/socket.integration.test.ts`.
- **Manual:** [turn checklist][t-turn], [client checklist][t-client] (motion, reduced motion, reconnect snaps without replaying the roll).
- **Risk:** the roll result is authoritative on the server (`rollSequence` increments once per committed roll); animation must never decide movement, and bot timing depends on the presentation estimate.
- **Affects:** F15, F18, F19, F23, F26, F27, F28, F40.

### F23 Purchase decision
- **Entry:** landing on an unowned property on your own turn.
- **Docs:** [turn-actions][c-turn], [socket-turn][a-turn], [property-economy][g-eco].
- **Client:** `apps/client/src/components/dashboard/BuyPrompt.tsx`.
- **Server:** `apps/server/src/socket/turn.ts` (`buy property`, `do not buy`), `apps/server/src/commands/gameplay.ts`, `apps/server/src/game/transfer.ts`.
- **Tests:** `apps/client/src/components/dashboard/DecisionPrompts.test.tsx`, `apps/server/src/socket.integration.test.ts`, `apps/server/src/bots/policy.test.ts`.
- **Manual:** [turn checklist][t-turn].
- **Gap:** no socket-level test of `do not buy` (covered only through bot policy and client tests).
- **Affects:** F15, F24.

### F24 Development (build) and Team Investment
- **Entry:** landing on an own (or 2v2 teammate's) street with a development decision.
- **Docs:** [property-economy][g-eco], [socket-building][a-build], [turn-actions][c-turn], [team-play][g-team].
- **Client:** `apps/client/src/components/dashboard/DevelopmentPrompt.tsx`.
- **Server:** `apps/server/src/socket/turn.ts` (`resolve development`), `apps/server/src/commands/gameplay.ts`.
- **Tests:** `apps/client/src/components/dashboard/DecisionPrompts.test.tsx`, `apps/server/src/socket.teamplay.integration.test.ts`, `apps/server/src/game.test.ts`.
- **Manual:** [economy checklist][t-eco]. **Affects:** F25, F36.

### F25 Sell house
- **Entry:** property inspection modal on an owned developed tile.
- **Docs:** [socket-building][a-build], [property-management][c-prop].
- **Client:** `apps/client/src/game/ui/property/PropertyInspectionModal.tsx`.
- **Server:** `apps/server/src/socket/building.ts`, `apps/server/src/game/property.ts`, `apps/server/src/services/commandRequestLedger.ts`.
- **Tests:** `apps/client/src/game/ui/property/PropertyInspectionModal.test.tsx`, `apps/server/src/socket.teamplay.integration.test.ts`, `apps/server/src/socket.hardening.integration.test.ts`.
- **Note:** idempotent per client `requestId` (CURRENT DEVELOPMENT, protocol 13; released v1.7.0 sold one more level on a replayed emit). **Affects:** F29, F36.

### F26 Tile resolution, rent and taxes
- **Entry:** automatic after movement.
- **Docs:** [tile-cards-and-jail][g-tile], [property-economy][g-eco], [board data][s-data]; [ADR-13][adr].
- **Server:** `apps/server/src/game/tiles.ts`, `apps/server/src/game/payment.ts`.
- **Shared:** `packages/shared/src/tileState.ts`, `packages/shared/src/rules.ts`, `packages/shared/src/teams.ts`.
- **Tests:** `apps/server/src/game.test.ts`, `apps/server/src/rulesContract.test.ts`, `apps/server/src/v3.simplifiedRules.test.ts`.
- **Manual:** [economy checklist][t-eco], [turn checklist][t-turn].
- **Gap:** Income Tax is 200 in released v1.7.0 and 150 on this branch (implemented on the vNext development branch; product approval/release decision not independently verified; RELEASE RISK R-1); manual check NOT RUN.
- **Affects:** F29, F37, F44.

### F27 Chance / Community Chest cards
- **Entry:** landing on a card tile; the revealed card waits for "Đóng".
- **Docs:** [tile-cards-and-jail][g-tile], [socket-turn][a-turn], [turn-actions][c-turn], [board data][s-data].
- **Client:** `apps/client/src/game/ui/events/CardInteractionOverlay.tsx`, `apps/client/src/i18n/cardCopy.ts`.
- **Server:** `apps/server/src/socket/card.ts` (`dismiss card`; `draw card` legacy only), `apps/server/src/game/tiles.ts`, `apps/server/src/game/decks.ts`.
- **Shared:** `packages/shared/src/cardData.ts`, `packages/shared/src/chanceCards.ts`, `packages/shared/src/chestCards.ts`.
- **Tests:** `apps/client/src/game/ui/events/CardInteractionOverlay.test.tsx`, `apps/server/src/socket.integration.test.ts`, `apps/server/src/game.test.ts`.
- **Manual:** [turn checklist][t-turn]. **Affects:** F22, F28, F40.

### F28 Jail
- **Entry:** own turn while jailed: pay bail, use a jail card, or roll for doubles.
- **Docs:** [tile-cards-and-jail][g-tile], [socket-jail][a-jail], [turn-actions][c-turn].
- **Client:** `apps/client/src/components/dashboard/JailPanel.tsx`, `apps/client/src/game/ui/hud/CenterStage.tsx`.
- **Server:** `apps/server/src/socket/jail.ts`, `apps/server/src/socket/turn.ts` (`wait in jail`), `apps/server/src/game/tiles.ts`.
- **Shared:** `packages/shared/src/money.ts` (`BAIL_AMOUNT`).
- **Tests:** `apps/client/src/components/dashboard/JailPanel.test.tsx`, `apps/server/src/socket.integration.test.ts`, `apps/server/src/bots/policy.test.ts`.
- **Manual:** [turn checklist][t-turn].
- **Gap:** `wait in jail` has no UI caller and no socket-level test; the jail-panel timing fix is CURRENT DEVELOPMENT with manual check NOT RUN.
- **Affects:** F22, F27.

### F29 Payment shortfall and bank sale
- **Entry:** `boardState.paymentShortfall` for the debtor (others see a status strip).
- **Docs:** [socket-debt-and-rescue][a-debt], [turn-movement-and-bankruptcy][g-turn], [property-management][c-prop].
- **Client:** `apps/client/src/components/dashboard/DebtPanel.tsx`, `apps/client/src/components/dashboard/useDebtPresentationHold.ts`.
- **Server:** `apps/server/src/socket/debt.ts` (`sell property to bank`), `apps/server/src/game/payment.ts`, `apps/server/src/game/paymentResolution.ts`, `apps/server/src/services/deadlineScheduler.ts`.
- **Tests:** `apps/client/src/components/dashboard/DebtPanel.test.tsx`, `apps/server/src/game.test.ts`, `apps/server/src/socket.botDriver.integration.test.ts`.
- **Manual:** [debt checklist][t-debt].
- **Gap:** no socket-level test of the `sell property to bank` handler.
- **Affects:** F30, F31, F33, F36.

### F30 Forced-sale proposal
- **Entry:** debtor proposes a sale to another player; the buyer gets a private proposal.
- **Docs:** [socket-debt-and-rescue][a-debt], [property-economy][g-eco].
- **Client:** `apps/client/src/components/dashboard/ForcedSaleProposalPanel.tsx`, `apps/client/src/components/dashboard/DebtPanel.tsx`.
- **Server:** `apps/server/src/socket/debt.ts` (`propose`/`accept`/`reject forced sale`), `apps/server/src/game/payment.ts`.
- **Tests:** `apps/client/src/components/dashboard/ForcedSaleProposalPanel.test.tsx`, `apps/server/src/socket.integration.test.ts`, `apps/server/src/bots/policy.test.ts`.
- **Manual:** [debt checklist][t-debt].
- **Gap:** `reject forced sale` is exercised only through bot policy tests, not at socket level.
- **Affects:** F29, F15.

### F31 Bankruptcy and winner
- **Entry:** automatic; `WinnerBanner` when `status = FINISHED`.
- **Docs:** [turn-movement-and-bankruptcy][g-turn], [game-status][c-status].
- **Client:** `apps/client/src/components/dashboard/WinnerBanner.tsx`, `apps/client/src/components/dashboard/useVictoryVisibility.ts`.
- **Server:** `apps/server/src/game/bankruptcy.ts`, `apps/server/src/game/turn.ts`, `apps/server/src/game/paymentResolution.ts`.
- **Tests:** `apps/client/src/components/dashboard/WinnerBanner.test.tsx`, `apps/server/src/game.test.ts`.
- **Manual:** [status checklist][t-status]. **Affects:** F32, F33.

### F32 Play again
- **Entry:** host "Chơi lại" on the winner banner.
- **Docs:** [socket-lobby][a-lobby], [game-status][c-status], [room-lifecycle][g-room].
- **Client:** `apps/client/src/components/dashboard/WinnerBanner.tsx`. **Server:** `apps/server/src/socket/lobby.ts` (`play again`).
- **Tests:** `apps/client/src/App.test.tsx`, `apps/server/src/socket.integration.test.ts`, `apps/server/src/socket.bots.integration.test.ts`.
- **Manual:** [status checklist][t-status]. **Affects:** F09, F11, F14.

### F33 2v2 Emergency Rescue
- **Entry:** a teammate's debt exceeds their liquidation; the rescuer is asked.
- **Docs:** [team-play][g-team], [socket-debt-and-rescue][a-debt], [turn-actions][c-turn].
- **Client:** `apps/client/src/components/dashboard/RescuePanel.tsx`.
- **Server:** `apps/server/src/socket/debt.ts` (`accept`/`decline rescue`), `apps/server/src/game/rescue.ts`, `apps/server/src/game/rescueResolution.ts`.
- **Shared:** `packages/shared/src/teams.ts`.
- **Tests:** `apps/client/src/components/dashboard/RescuePanel.test.tsx`, `apps/server/src/socket.teamplay.integration.test.ts` (accept, and "declining continues into the normal bankruptcy"), `apps/server/src/game/teamplay.test.ts`.
- **Manual:** [team checklist][t-team].
- **Affects:** F29, F31.

### F34 2v2 revive teammate
- **Entry:** survivor's turn while a revive window is open.
- **Docs:** [team-play][g-team], [socket-turn][a-turn].
- **Client:** `apps/client/src/components/dashboard/RevivePanel.tsx`.
- **Server:** `apps/server/src/socket/team.ts` (`revive teammate`), `apps/server/src/game/team.ts`.
- **Shared:** `packages/shared/src/rules.ts` (`REVIVE_COST`, `REVIVE_STARTING_CASH`).
- **Tests:** `apps/client/src/components/dashboard/RevivePanel.test.tsx`, `apps/server/src/socket.teamplay.integration.test.ts`.
- **Manual:** [team checklist][t-team]. **Affects:** F31, F40.

## Trading and social

### F35 Compose a trade offer
- **Entry:** property inspection "Đề nghị mua" → trade modal.
- **Docs:** [trade-offers][c-trade], [socket-trading][a-trade].
- **Client:** `apps/client/src/components/dashboard/TradeOfferModal.tsx`, `apps/client/src/tradePromptContext.ts`, `apps/client/src/components/Board.tsx`.
- **Server:** `apps/server/src/socket/trading.ts` (`make offer`).
- **Shared:** `packages/shared/src/types.ts` (`OfferInfo`, `TradeBundle`).
- **Tests:** `apps/client/src/components/dashboard/TradeOfferModal.test.tsx`, `apps/server/src/socket.integration.test.ts`.
- **Manual:** [trade checklist][t-trade].
- **Note:** the typed-amount fix is CURRENT DEVELOPMENT; `make offer` is not idempotent on a replayed emit. **Affects:** F36.

### F36 Incoming offers (accept, decline, expiry, cancel)
- **Entry:** private `offer on prop` push; offer card in the HUD or debt panel.
- **Docs:** [socket-trading][a-trade], [trade-offers][c-trade].
- **Client:** `apps/client/src/components/dashboard/IncomingOffers.tsx`, `apps/client/src/components/dashboard/OfferCard.tsx`, `apps/client/src/components/dashboard/useIncomingOffers.ts`.
- **Server:** `apps/server/src/socket/trading.ts`, `apps/server/src/commands/gameplay.ts` (`declineOfferCommand`), `apps/server/src/services/commandRequestLedger.ts`, `apps/server/src/services/offerInvalidation.ts`, `apps/server/src/services/deadlineScheduler.ts`, `apps/server/src/services/privateOffers.ts`.
- **Tests:** `apps/client/src/components/dashboard/IncomingOffers.test.tsx`, `apps/server/src/socket.integration.test.ts`, `apps/server/src/socket.hardening.integration.test.ts` (`make offer` idempotency, `decline offer` guards), `apps/server/src/bots/driver.test.ts`.
- **Manual:** [trade checklist][t-trade]. **Affects:** F15, F29.

### F37 Property inspection, deed and portfolios
- **Entry:** click a tile or a player card; "Tài sản của tôi".
- **Docs:** [property-management][c-prop].
- **Client:** `apps/client/src/game/ui/property/`.
- **Shared:** `packages/shared/src/tileState.ts`, `packages/shared/src/rules.ts`.
- **Tests:** `apps/client/src/game/ui/property/PropertyInspectionModal.test.tsx`, `apps/client/src/game/ui/property/deedCardModel.test.ts`, `apps/client/src/game/ui/property/PlayerPortfolioModal.test.tsx`.
- **Manual:** [economy checklist][t-eco]. **Affects:** F25, F35.

### F38 Activity log and chat
- **Entry:** HUD log drawer; chat input.
- **Docs:** [activity-log-and-chat][c-log], [socket-chat][a-chat].
- **Client:** `apps/client/src/components/Log.tsx`, `apps/client/src/game/ui/hud/activityText.ts`, `apps/client/src/game/ui/hud/ActivityTicker.tsx`.
- **Server:** `apps/server/src/socket/chat.ts`, `apps/server/src/game/activity.ts`, `apps/server/src/game/text.ts`.
- **Tests:** `apps/client/src/components/Log.test.tsx`, `apps/client/src/game/ui/hud/activityText.test.ts`, `apps/server/src/socket.integration.test.ts`.
- **Manual:** [chat checklist][t-chat]. **Affects:** F21, F40.

### F39 Spectator mode
- **Entry:** joining after the start, or "Xem tiếp" after forfeit.
- **Docs:** [game-board][c-board], [join-room][c-join], [socket-session][a-sess].
- **Client:** `apps/client/src/components/SpectatorBanner.tsx`. **Server:** `apps/server/src/socket/session.ts`.
- **Tests:** `apps/client/src/components/SpectatorBanner.test.tsx`, `apps/client/src/App.test.tsx`.
- **Manual:** [join checklist][t-join]. **Affects:** F07, F40.

## Client systems

### F40 Presentation pipeline
- **Entry:** every authoritative `update` snapshot.
- **Docs:** [presentation-pipeline][c-pres]; [ADR-10][adr].
- **Client:** `apps/client/src/game/presentation/PresentationController.ts`, `apps/client/src/game/presentation/queue/AnimationQueue.ts`, `apps/client/src/game/presentation/store/presentationStore.ts`, `apps/client/src/game/presentation/events/derivePresentationEvents.ts`.
- **Server (producer):** `apps/server/src/game/semanticEvents.ts`.
- **Tests:** `apps/client/src/game/presentation/PresentationController.test.ts`, `apps/client/src/game/presentation/queue/AnimationQueue.test.ts`, `apps/client/src/game/presentation/events/derivePresentationEvents.test.ts`.
- **Manual:** [client checklist][t-client]. **Affects:** F18, F21, F22, F27.

### F41 Settings panel
- **Entry:** Cài đặt in the launcher, lobby or game toolbar.
- **Docs:** [settings-and-audio][c-set].
- **Client:** `apps/client/src/settings/SettingsPanel.tsx`, `apps/client/src/settings/SettingsProvider.tsx`, `apps/client/src/settings/storage.ts`.
- **Tests:** `apps/client/src/settings/SettingsPanel.test.tsx`, `apps/client/src/settings/SettingsProvider.test.tsx`.
- **Manual:** [client checklist][t-client]. **Affects:** F42, F43, F45.

### F42 Audio and music
- **Entry:** automatic; music only while the room is `IN_PROGRESS`.
- **Docs:** [settings-and-audio][c-set]; audio release policy in [V1_RELEASE_CONTRACT](../ui-ux-overhaul/V1_RELEASE_CONTRACT.md).
- **Client:** `apps/client/src/audio/AudioProvider.tsx`, `apps/client/src/audio/AudioEngine.ts`, `apps/client/src/audio/audioRegistry.ts`, `apps/client/public/audio/music/own-the-block-main-theme-loop.ogg`.
- **Tests:** `apps/client/src/audio/AudioEngine.test.ts`, `apps/client/src/audio/AudioProvider.test.tsx`, `e2e/mobile-host.spec.ts`; `pnpm validate:music-assets`.
- **Manual:** [client checklist][t-client]. **Affects:** F40, F41.

### F43 Language VI/EN
- **Entry:** Settings language control; launcher language selector.
- **Docs:** [language-system][c-lang].
- **Client:** `apps/client/src/i18n/`, `apps/client/src/components/LanguageSelector.tsx`.
- **Tests:** `apps/client/src/i18n/catalog.test.ts`, `apps/client/src/components/LanguageSelector.test.tsx`.
- **Manual:** [client checklist][t-client]. **Affects:** every UI feature.

### F44 How to play
- **Entry:** "?" key on join, launcher, lobby, toolbar, loading and error screens.
- **Docs:** [how-to-play][c-how].
- **Client:** `apps/client/src/howToPlay/`. **Shared:** `packages/shared/src/rules.ts`, `packages/shared/src/tileState.ts`.
- **Tests:** `apps/client/src/howToPlay/HowToPlay.test.tsx`, `apps/client/src/howToPlay/model.test.ts`, `apps/server/src/rulesContract.test.ts`.
- **Manual:** [client checklist][t-client]. **Affects:** F26 (numbers come from shared data).

### F45 In-app update
- **Entry:** launcher update prompt; Settings "Cập nhật"; in-session notice (desktop only).
- **Docs:** [app-update][c-upd], [Desktop index][d-idx]; [ADR-12][adr].
- **Client:** `apps/client/src/runtime/appUpdate.tsx`, `apps/client/src/components/update/`.
- **Desktop:** `apps/desktop/src/update/`, `apps/desktop/update-policy.json`, `apps/desktop/scripts/updateManifest.mjs`.
- **Tests:** `apps/client/src/runtime/appUpdate.test.tsx`, `apps/desktop/tests/updateService.test.ts`, `apps/desktop/tests/updateManifest.test.ts`.
- **Manual:** [hosting checklist][t-http] (real in-place update NOT RUN for 1.7.0). **Affects:** F51.

### F46 Design system and modal peek
- **Entry:** every UI surface; "Xem bàn cờ" on decision modals.
- **Docs:** [design-system][c-ds].
- **Client:** `apps/client/src/design-system/`.
- **Tests:** `apps/client/src/design-system/components/Modal/Modal.test.tsx`, `apps/client/src/design-system/components/Modal/Modal.peek.test.tsx`.
- **Manual:** [client checklist][t-client]. **Affects:** all dialogs.

## Platform

### F47 Electron shell, security and preload bridge
- **Entry:** desktop app process.
- **Docs:** [Desktop shell][d-shell], [Desktop index][d-idx]; [ADR-11][adr].
- **Desktop:** `apps/desktop/src/main.ts`, `apps/desktop/src/desktopBootstrap.ts`, `apps/desktop/src/security.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/src/ipc/`.
- **Client:** `apps/client/src/runtime/desktopBridge.ts`.
- **Tests:** `apps/desktop/tests/security.test.ts`, `apps/desktop/tests/preloadBridge.test.ts`, `apps/desktop/tests/windowHandlers.test.ts`.
- **Manual:** [hosting checklist][t-http]. **Affects:** F02, F08, F45, F48.

### F48 Host runtime and server helper
- **Entry:** host starts a room from the launcher.
- **Docs:** [Desktop shell][d-shell], [http-runtime][a-http], [Persistence][pers]; [ADR-02][adr], [ADR-03][adr].
- **Desktop:** `apps/desktop/src/hostRuntime.ts`, `apps/desktop/src/serverHelper.ts`.
- **Server:** `apps/server/src/desktopServerHelper.ts`, `apps/server/src/authoritativeServer.ts`.
- **Tests:** `apps/desktop/tests/hostRuntime.test.ts`, `apps/desktop/tests/serverHelper.test.ts`, `apps/desktop/src/online/hostLifecycle.test.ts`; packaged `pnpm desktop:proof:host`.
- **Manual:** [hosting checklist][t-http]. **Affects:** F02, F16, F17, F49.

### F49 RAM store, command executor and deadlines
- **Entry:** every state-changing command; the 1 s deadline poll.
- **Docs:** [Persistence][pers], [room-lifecycle][g-room]; [ADR-03][adr], [ADR-05][adr]; foundation [shared][fs], [api][fa].
- **Server:** `apps/server/src/persistence/inMemory.ts`, `apps/server/src/services/roomCommandExecutor.ts`, `apps/server/src/services/deadlineScheduler.ts`, `apps/server/src/socket/roomCommands.ts`, `apps/server/src/socket/broadcast.ts`, `apps/server/src/socket/errors.ts`.
- **Tests:** `apps/server/src/persistence/inMemory.test.ts`, `apps/server/src/services/roomCommandExecutor.test.ts`, `apps/server/src/socket/errors.test.ts`.
- **Manual:** [hosting checklist][t-http]. **Affects:** every server command.

### F50 Shared contracts, schemas and versioning
- **Entry:** every socket payload and state snapshot.
- **Docs:** [socket-and-state-contracts][s-con] (owner of the version history), [board data][s-data]; [ADR-06][adr]; foundation [contracts][fk].
- **Shared:** `packages/shared/src/types.ts`, `packages/shared/src/events.ts`, `packages/shared/src/socketSchemas.ts`, `packages/shared/src/stateSchemas.ts`.
- **Server:** `apps/server/src/socket/validation.ts`, `apps/server/src/socket/index.ts`, `apps/server/src/rooms.ts`.
- **Tests:** `apps/server/src/rulesContract.test.ts`, `apps/server/src/rooms.test.ts`, `scripts/validateV1Contract.check.mjs`.
- **Manual:** [shared checklist][t-shared]. **Affects:** every feature that sends or renders state.

### F51 Packaging and release
- **Entry:** `pnpm desktop:release`, tag push → `.github/workflows/release-candidate.yml`.
- **Docs:** [V1_RELEASE_CONTRACT](../ui-ux-overhaul/V1_RELEASE_CONTRACT.md), [Desktop shell][d-shell], [release matrix][t-rel]; [ADR-12][adr].
- **Desktop:** `apps/desktop/forge.config.cjs`, `apps/desktop/scripts/release.mjs`, `apps/desktop/scripts/validateRelease.mjs`, `apps/desktop/scripts/checkPackagedBudget.mjs`.
- **Tests:** `apps/desktop/tests/releaseMetadata.test.ts`, `apps/desktop/tests/checkPackagedBudget.test.ts`, `scripts/validateV1Contract.check.mjs`.
- **Manual:** [release matrix][t-rel].
- **Gap:** R-1 and R-2 are resolved in code and docs (protocol 13, `main` merged); the open items are the manual/device/network rows in the [release matrix][t-rel].
- **Affects:** F45, F50.

### F52 Dev-only tools (Design Lab, UAT harness, FPS badge)
- **Entry:** development or `?phase4-uat=1` builds only.
- **Docs:** [design-system][c-ds] ("Design Lab").
- **Client:** `apps/client/src/dev/`, `apps/client/src/game/ui/FpsBadge.tsx`.
- **Tests:** `apps/client/src/dev/design-lab/DesignLab.test.tsx`, `apps/client/src/dev/phase4-uat/Phase4UatHarness.test.tsx`; captures `e2e/visual/capture.visual.ts`.
- **Affects:** none in production builds.

[fs]: ./monopoly.shared.instructions.md
[fc]: ./monopoly.client.instructions.md
[fa]: ./monopoly.api.instructions.md
[fg]: ./monopoly.game-core.instructions.md
[fk]: ./monopoly.contracts.instructions.md
[adr]: ./ARCHITECTURE_DECISIONS.md
[pers]: ./Persistence/README.md
[c-join]: ./Client/join-room.instruction.md
[c-status]: ./Client/game-status.instruction.md
[c-board]: ./Client/game-board.instruction.md
[c-turn]: ./Client/turn-actions.instruction.md
[c-prop]: ./Client/property-management.instruction.md
[c-trade]: ./Client/trade-offers.instruction.md
[c-log]: ./Client/activity-log-and-chat.instruction.md
[c-how]: ./Client/how-to-play.instruction.md
[c-lang]: ./Client/language-system.instruction.md
[c-upd]: ./Client/app-update.instruction.md
[c-ds]: ./Client/design-system.instruction.md
[c-pres]: ./Client/presentation-pipeline.instruction.md
[c-set]: ./Client/settings-and-audio.instruction.md
[a-sess]: ./Api/socket-session.instruction.md
[a-lobby]: ./Api/socket-lobby.instruction.md
[a-turn]: ./Api/socket-turn.instruction.md
[a-jail]: ./Api/socket-jail.instruction.md
[a-build]: ./Api/socket-building.instruction.md
[a-debt]: ./Api/socket-debt-and-rescue.instruction.md
[a-trade]: ./Api/socket-trading.instruction.md
[a-chat]: ./Api/socket-chat.instruction.md
[a-http]: ./Api/http-runtime.instruction.md
[g-room]: ./GameCore/room-lifecycle.instruction.md
[g-bot]: ./GameCore/bot-players.instruction.md
[g-team]: ./GameCore/team-play.instruction.md
[g-tile]: ./GameCore/tile-cards-and-jail-resolution.instruction.md
[g-eco]: ./GameCore/property-economy.instruction.md
[g-turn]: ./GameCore/turn-movement-and-bankruptcy.instruction.md
[s-con]: ./Shared/socket-and-state-contracts.instruction.md
[s-data]: ./Shared/board-and-card-data.instruction.md
[d-idx]: ./Desktop/README.md
[d-shell]: ./Desktop/electron-shell-and-packaging.instruction.md
[t-join]: ./testcase/join-room-and-player-lifecycle.md
[t-http]: ./testcase/http-runtime-and-deployment.md
[t-turn]: ./testcase/turn-movement-buy-and-jail.md
[t-eco]: ./testcase/property-economy.md
[t-debt]: ./testcase/payment-shortfall-and-forced-sale.md
[t-status]: ./testcase/game-status-bankruptcy-and-winner.md
[t-trade]: ./testcase/trading-market-and-private-offers.md
[t-team]: ./testcase/team-play.md
[t-bot]: ./testcase/bot-players.md
[t-chat]: ./testcase/chat-log-and-input-safety.md
[t-client]: ./testcase/client-state-sync-motion-and-accessibility.md
[t-shared]: ./testcase/shared-contracts-and-board-data.md
[t-rel]: ./testcase/RELEASE_ACCEPTANCE_MATRIX.md
