# Power-up client experience

> **CURRENT DEVELOPMENT — Phases 04–08.** The inventory is mounted in the existing game HUD. Active cards submit real server commands; pending Reaction/trade/movement panels restore from authoritative private state. No client-side effect resolution is used.

## Components and behavior

- `apps/client/src/game/ui/powerUps/PowerUpPanel.tsx` renders the reward decision and inventory/status inspector in the existing BottomDock. It displays an Active action and a reason when the action is unavailable.
- `PowerUpCard.tsx` renders the server-projected registry name, category, rarity, description and activation type. Reward candidates stay category-only until the server commits reveal.
- `PowerUpRuntimePanels.tsx` supplies target/property selectors, U04 ingredients, U10 transform choices, D10 status removal, U06 accept/decline, Reaction/pass with a visible countdown, and movement keep/continue.
- `PowerUps.css` contains rarity/category states, reveal/entry motion, mobile layout and reduced-motion behavior. The shared Modal supplies focus management and decision peek/restore.
- `apps/client/src/App.tsx` and socket projection restore owner inventory/status and authorized pending interactions on reconnect. Another player's hidden card definitions are never displayed.

All mutation controls use their typed Socket.IO handler, disable while busy/disconnected or unauthorized, and surface rejected/failed ACKs as recoverable feedback. The server ACK and state projection decide completion; local timer ticks do not execute the pending effect. Native select controls, buttons and the shared modal provide keyboard-operable target choice and focus containment.

## Visual acceptance evidence

`scripts/powerUpAcceptance.check.mjs` uses the production client build, Chromium and a local server with two human browser clients plus a bot. The recorded screenshots exercise 1440×900 reward/board, 900×500 full inventory, 1280×720 remote purchase and a reconnect-restored Reaction. Output is under `test-results/powerup-acceptance/` and is reproducible with the command in [the Phase 08 report](../../powerups/08_FINAL_VALIDATION_REPORT.md).

Card reveal/entry motion and reduced-motion handling are integrated. The pre-08B UI lacked distinct themed feedback and targeting; Phase 08B adds these as described below. Physical Electron device acceptance remains separate. Existing semantic money/movement presentation remains responsible for the gameplay facts it already animates. Those visual and platform items are tracked as limitations, not reported as complete acceptance.

Tests: `apps/client/src/game/ui/powerUps/PowerUpPanel.test.tsx`. Native Electron and full-match owner UAT remain manual follow-up.

## Phase 08B feedback and accessibility

The existing presentation queue renders Attack, shield activation/charge interception, block, reflection, Legendary, status-start/end and inventory-removal feedback. Removal alone cannot prove use: theft and U04 ingredients receive a neutral removal cue; distinct activation/Reaction cues require a successful authoritative ACK. A reset epoch suppresses late ACK feedback after reconnect, and sync/hidden/reduced-motion paths bypass obsolete animation. No new animation queue or wire field is introduced.

Property targeting publishes ephemeral valid/selected tile IDs into the presentation render model. The existing WebGL instance colors/selection surfaces and legacy board show the same choices. Disabled options and a text legend distinguish invalid targets without relying on color. The shared Modal re-registers focus ownership on rapid reopening during exit animation; 08B browser checks cover Tab, Shift+Tab, Escape and opener restoration at all three requested sizes. Availability/error text uses semantic contrast tokens; discarded reveal cards stay opaque and use a dashed border. Actual screenshots and native limits: [08B report](../../powerups/08B_STABILIZATION_REPORT.md).

## Phase 09B–09C original artwork (CURRENT DEVELOPMENT)

The client owns 30 ID-keyed original illustrations and exactly three category backs in `apps/client/public/art/powerups/`. Every 640×400 SVG has a lossless PNG equivalent. Editable production source: `scripts/art/powerUpIllustrations.mjs`. `scripts/art/exportPowerUpArtwork.mjs` exports pairs and verifies source/PNG pixel parity with `--verify`. No remote art, fonts or stock icon library is used for illustrations.

`apps/client/src/game/ui/powerUps/powerUpArtManifest.ts` is the presentation-only ID/back/frame map. `PowerUpArtwork.tsx` uses a decorative SVG, then its same-ID PNG on failure, then a category motif; fallback never disables a server decision. Official asset validation rejects missing/stale/corrupt assets rather than accepting fallback. The existing base-URL helper supports browser paths and packaged app:// rendering.

`PowerUpCard.tsx` shares artwork across START reveal, inventory/replacement, full detail, activation, Reaction and consent. Names and complete approved descriptions remain selectable UI text with existing VI/EN translations. Inventory adds a read-only full-card detail dialog; active statuses and queued feedback use small matching artwork. Common is balanced, Rare has highlighted rails, Epic an inset ornamental frame, Legendary double gold edging/corner details. Rarity labels and symbols supplement color.

Unrevealed candidates request category-back files only. They have no identity/rarity DOM attributes, titles, alternate text or individual artwork; no hidden front element is mounted. Individual art is resolved only from an authorized definition. Server projections, registry values, protocol and snapshot are unchanged. Reconnect hydrates the current face without replaying a live flip. Selection entrance/flip is local presentation; acquisition, Legendary discovery and consumption use the existing PresentationController/AnimationQueue. Acquisition is derived only from newly authorized inventory instance IDs on LIVE_UPDATE; sync, reset, hidden-page and reduced-motion bypass remain in force. CSS and effective reduced-motion settings suppress card motion.

Validation: `pnpm validate:powerup-art`, `pnpm test:powerup-art`, `pnpm art:powerups:verify`, client tests and build. Browser/native artwork acceptance extends `scripts/powerUpStabilizationAcceptance.check.mjs` with `--artwork` (and `--native` for packaged Electron); original scenarios remain enabled. Contact sheets, corrections, viewport evidence and limitations: [09C visual QA](../../powerups/09C_VISUAL_QA_REPORT.md). Implementation and all mappings: [09B implementation](../../powerups/09B_ARTWORK_IMPLEMENTATION_REPORT.md), [asset inventory](../../powerups/09B_CARD_ART_ASSET_INVENTORY.md).


## OB-4 collectible reward picker (CURRENT DEVELOPMENT)

The three START reward candidates use `apps/client/src/game/ui/powerUps/PowerUpPickerCard.tsx` around the existing card. Only this picker gets ivory/pastel surfaces, category accents, bevel/edge depth, staggered floating, bounded pointer tilt, shimmer and a short decorative selection burst. Artwork, icons and text remain 2D and use the same authorized definitions/assets. Inventory, replacement, full detail, activation and Reaction cards retain their existing presentation.

The approved interaction is Q1=A: clicking a category back immediately sends one selection; the server locks it and reveals all three. There is no confirmation step or post-lock switching. While the ACK/snapshot is pending every candidate stays disabled; rejection clears the tentative highlight/particles and permits a retry only if the offer is still unselected. A successful ACK keeps selection locked until the authoritative snapshot arrives. Claim, decline and full-inventory replacement retain the existing commands and server authority.

Particles are finite local feedback for a fresh valid click. Restoring an already-selected offer after reconnect mounts the authoritative face without replaying particles or a live flip. OS preference or the game reduced-motion setting suppresses floating, pointer tilt, shimmer and burst; static selected text/outline stays visible. Native buttons and the shared Modal preserve keyboard focus and decision peek. The picker grid reserves transform/particle space inside the existing scrollable modal, including short landscape viewports.

Verification: `apps/client/src/game/ui/powerUps/PowerUpPanel.test.tsx`, artwork privacy tests and `scripts/powerUpPickerAcceptance.check.mjs`. Actual results and remaining Owner UAT requirements are recorded in [OB-4 picker validation](../../powerups/OB4_PICKER_VALIDATION.md).
