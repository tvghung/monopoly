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
