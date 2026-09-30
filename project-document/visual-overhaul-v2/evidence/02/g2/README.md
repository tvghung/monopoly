# G2 review package — Lighting, Environment and Tabletop

Captured 2026-09-30 with `pnpm visual:capture --grep "02-g2/"` (Chrome 154, SwiftShader, deterministic)
after T02.16, so the images already show the final scene palette. The verdict belongs to the product owner
and is recorded in `../../../02_LIGHTING_ENVIRONMENT_AND_TABLETOP.md` §16; an agent never records it.
Every image has a `.json` sidecar with the renderer diagnostics (draw calls, tier, tone mapping, console errors).
All 35 captures ran with zero console errors.

The HUD (teal buttons, the white "Lượt của bạn" label, the idle chat panel) is still the v1 HUD; plans 03
and 04 restyle it. Judge the scene, not the HUD.

## 1. v1 next to v2

`compare/02-compare-<fixture>-v1-left-v2-right-1440x900.png` puts the V1 baseline (taken before plan 01,
`../../01/baseline/`) on the left and today's `balanced` tier on the right, for `stations-4`,
`board-readability`, `rent` and `stress`. This is the "v1 vs v2" comparison that T02.16 asks the reviewer
to approve: light oak tabletop instead of the teal void, key / fill / rim lighting with soft shadows, lacquer
trays with player-color rims, jade frame and center field, district hues aligned with the deed-header colors.

## 2. Checklist and where to look

| Checklist row | Look at |
| --- | --- |
| Lighting, soft shadows and Neutral tone mapping look right | `compare/*`, `fixtures/02-g2-board-readability-balanced-1440x900.png`, `fixtures/02-g2-hotel-balanced-1440x900.png` |
| Light oak table and board ground shadow cover every viewport | `viewports/02-g2-board-readability-balanced-{1920x1080,1280x720,812x375,2560x1080}.png` (2560×1080 is the 21:9 case) |
| Player trays and the bank treasury look grounded | `fixtures/02-g2-stations-4-balanced-1440x900.png` |
| Scene palette (jade frame and field, district hues) approved | `compare/*`, `fixtures/02-g2-stations-4-*.png` |
| Tile text still readable in every tier (the eight regression names: `Cà Mau`, `Buôn Ma Thuột`, `Đà Nẵng`, `Phú Quốc`, `Công Ty Nước`, `Khí Vận`, `Cơ Hội`, `Landmark 81`) | `viewports/02-g2-board-readability-{low,balanced,high}-1280x720.png` (zoom in) |
| The three tiers differ in the intended ways only (dpr, shadows, environment, post chain) | `fixtures/02-g2-<fixture>-{low,balanced,high}-1440x900.png` for `board-readability`, `stations-4`, `stress`, `hotel`, `rent`, `dice-contact-shadows`, `reduced-motion` |
| WebGL fallback still works | `fallback/02-g2-board-readability-legacy-{1440x900,812x375}.png` (WebGL context refused; the legacy board renders) |
| Performance decision taken | §16 of the plan and section 4 below |

## 3. Numbers (1440×900, software rendering, deterministic)

| Tier | Main pass | Shadow | Post passes | Triangles |
| --- | --- | --- | --- | --- |
| low | 149–177 | 0 | 0 | ≤ 79,586 |
| balanced | 149–169 | 9–25 | 0 | ≤ 79,586 |
| high | 149–169 | 9–25 | 3 | ≤ 79,586 |

Limits (plan §8.9): main ≤ 180 (never ≥ 210), shadow ≤ 30, post ≤ 6, triangles < 80k. All 21 fixture captures
and the 12 viewport captures are inside them. The largest triangle count is `dice-contact-shadows` and
`reduced-motion` (79,586, the dice are on the board).

## 4. What the reviewer needs to know

- **No reference device.** Frame times were measured on an Intel UHD 630-class GPU (`../benchmark/`), which
  is weaker than the Iris Xe / M1 reference. There, `balanced` runs at a 30 FPS median (v1: 60) and `low` at 60.
  The board is fill-rate bound: `balanced` without shadows is still 33 ms, `balanced` at pixel ratio 1 is 16.8 ms.
  Decide between lowering the `balanced` pixel ratio, making `auto` choose `low` on integrated GPUs, or
  accepting 30 FPS during animation there. Measure on an Iris Xe or M1 first if you can:
  `VISUAL_GPU=hardware pnpm visual:capture --grep "02-benchmark-bench"`.
- **High tier text.** SDF text blends in linear space in the post chain, so it looks slightly thinner and lighter
  than in `balanced`. If that is not acceptable, remap the text alpha for dark-on-light text.
- **WebKit** captures were not produced for this package.
- **File size.** This package is about 38 MB of PNG; the comparison images are the largest files.
