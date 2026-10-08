# UI/UX regression matrix (R0 audit → R4)

Audit of `77953b6` (v1.6.1). "Evidence" is code plus an existing test file; a listed test means the test exists,
its pass state is recorded by the R4/R5 runs. Paths are relative to `apps/client/src`.

| # | Item | Current evidence | R0 status | R4 action |
| --- | --- | --- | --- | --- |
| U1a | Tile / station labels (SDF, invalidate on sync) | `game/scene/board/tiles/TileTextLayer.tsx`, `sdfTextConfig.ts:62` passes `invalidate`; tests `sdfTextConfig.test.ts`, `TileTextLayer.test.ts` | DONE | regression only; packaged Windows/macOS render = NEEDS MANUAL ACCEPTANCE |
| U1b | Player names and cash | `game/ui/hud/PlayerCard.tsx:134,155`; `PlayerCardList.test.tsx` | DONE | add bot badge (R4) |
| U1c | Dice total | `game/ui/hud/DiceResultCallout.tsx:88,103`; `turnAndDiceOverlays.test.tsx` | DONE | — |
| U1d | Card face visible to every client (no white card) | `game/ui/events/CardInteractionOverlay.tsx:102-127` reads public `revealedCardId`; tests cover spectators/non-actors but do **not** assert the card text | DONE (test gap) | add assertion of card title/body for spectator and non-actor |
| U2 | Destination highlight | dice walks only (`movementExecutor.ts:48-56`); card relocation (`SNAP`) and jail transfer get none (`movementExecutor.test.ts:385-415` asserts none) | NEEDS FIX | highlight the destination of card relocations and of go-to-jail while the move plays, clear on landing/abort |
| U3 | Chat toggle + unread counter | `components/Log.tsx:144-221`; `Log.test.tsx:82-432`; e2e `mobile-host.spec.ts` | DONE | — (chat and journal share one drawer by design) |
| U4 | Activity narration (arrived at…, card, jail, tax) | `game/ui/hud/activityText.ts`; `Log.tsx:89-92` drops dice-only lines; `Log.test.tsx:179,209`, `activityText.test.ts` | DONE | bot names flow through unchanged |
| U5 | Icons (settings, surrender, My Assets, roll, property/modal) + My Assets cash | `design-system/icons/actionIcons.ts`; `App.tsx:1079-1092`; `RollControl.tsx:141`; `OwnedPropertiesControl.tsx:65`; `PortfolioView.tsx:19`; cash tests `OwnedPropertiesControl.test.tsx:93-143` | DONE (test gap) | add tests for toolbar Settings/Surrender and Roll icons |
| U6a | Prominent `OWN THE BLOCK` title | `DesktopMultiplayerLauncher.tsx:354`, `JoinForm.tsx:72`, `ScreenBrand.tsx:20`; tests | DONE | — |
| U6b | English names keep proper-name diacritics | `game/ui/formatters.ts:17-31`; `formatters.test.ts:5` | DONE | — |
| U6c | Language selector (dropdown + settings) | `components/LanguageSelector.tsx`; `LanguageSelector.test.tsx` (10), `SettingsPanel.test.tsx:144` | DONE | — |
| U6d | Eye toggle (modal peek) | `design-system/components/Modal/Modal.tsx:310`, `ModalPeekRestore.tsx`; `Modal.peek.test.tsx` (12), `DecisionPeek.test.tsx` | DONE | — |
| U7 | Phone/tablet tiers, jail controls, 44 px targets, safe area | `design-system/useMediaQuery.ts:38-60`; `env(safe-area-inset-*)` in 14 CSS files; `JailPanel.tsx` in center stage; e2e 10 viewports | DONE (e2e gap: jail panel) | four-slot lobby with bot controls checked at phone/tablet widths; physical devices = NEEDS MANUAL ACCEPTANCE |
| U8 | Audio unlock/resume/no double playback | `audio/AudioEngine.ts`, `AudioProvider.tsx`; `AudioEngine.test.ts`, `AudioProvider.test.tsx`, e2e audio test | DONE with gaps: no mute switch (volume 0 only), no recovery when the OS interrupts the AudioContext | NEEDS FIX: add Mute toggle in Settings, resume on `statechange` → `interrupted/suspended` at the next allowed moment; physical devices = NEEDS MANUAL ACCEPTANCE |
| U9 | Rule non-regression (taxes 200/100 units, cards, jail, bankruptcy) | `packages/shared/src/tileState.ts:31-34,272-275`, `rulesContract.test.ts`, `v3.simplifiedRules.test.ts` | DONE | regression run only; rules unchanged |
| U10 | Lobby: 4 slots, empty seats, host marker, ready, copy code, copy link, QR | `components/Lobby.tsx`, `lobby/LobbySeat.tsx`, `HostLanSharing.tsx`; `Lobby.test.tsx`, `HostLanSharing.test.tsx` | DONE (no bot state) | add Bot/Human/Empty identification, host-only Add Bot on empty seat, Remove on bot seat, room-full and reconnecting states |
| U11 | Accessibility statuses (Empty/Human/Bot/Host/Ready/Disconnected/Bankrupt, errors) | `BoardAccessibilityControls.tsx`, `PlayerCard.tsx:138-175`, catalog statuses | PARTIAL (no Bot status) | add Bot status text and error strings for new codes |

Everything marked DONE is preserved as is; R4 changes only the NEEDS FIX rows and the bot additions.
