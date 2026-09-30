# G1 review package — Visual Target and Design Tokens V2

Captured 2026-09-30 with `pnpm visual:capture` (Chromium 154 via the installed Chrome, SwiftShader,
deterministic). The verdict belongs to the product owner and is recorded in
`../../../01_VISUAL_TARGET_AND_DESIGN_TOKENS.md` §18; an agent never records it.

Open the images in this order. Every image has a `.json` sidecar with renderer diagnostics.

## 1. Baseline for comparison (V1, unchanged)

`../baseline/01-board-stations-4-1440x900.png`, `01-board-board-readability-1920x1080.png`,
`01-board-purchase-1440x900.png`, `01-board-chance-1440x900.png`.

## 2. Tokens, type and primitives (v2 proposal)

| Checklist row | Look at |
| --- | --- |
| Palette approved as rendered | `../lab/01-lab-tokens-v2-1440x900.png`, `../lab/01-lab-scene-palette-v2-1440x900.png` |
| Baloo 2 headlines in Vietnamese | `../lab/01-lab-typography-v2-1440x900.png` (stress string at every display size, unclipped) |
| Light oak table next to the UI | `../lab/01-lab-scene-palette-v2-1440x900.png`, `../concepts/01-concept-purchase-v2-1440x900.png` |
| Lacquer-red primary buttons | `../lab/01-lab-components-v2-1440x900.png` (all variants, sizes and states) |
| Button/panel depth language | `../lab/01-lab-components-v2-1440x900.png`, `../lab/01-lab-game-ui-v2-1440x900.png` |
| v1 vs v2 side by side | `../lab/01-lab-components-v1-1440x900.png`, `../lab/01-lab-game-ui-v1-1440x900.png` |

## 3. Concept screens

| Checklist row | Look at |
| --- | --- |
| HUD concept direction | `../concepts/01-concept-hud-v2-1920x1080.png`, `-1440x900`, `-1280x720`, `-812x375` |
| Deed card concept | `../concepts/01-concept-purchase-v2-*.png`, `../lab/01-lab-game-ui-v2-1440x900.png` |
| Lobby / landing concepts | `../concepts/01-concept-lobby-v2-*.png`, `../concepts/01-concept-landing-v2-*.png` |

Notes for the reviewer:

- The HUD concept is drawn over the real `stations-4` board. The teal void, the 3D station
  labels and the flat lighting are still V1: plan 02 (lighting and tabletop) and plan 03
  (HUD, removes the 3D labels) change them.
- WebKit captures were not produced (WebKit is not installed on the capture machine).
- The Lab is a dev-only surface: `VITE_PHASE4_UAT=1` and `?phase4-uat=1&design-lab=1`.
