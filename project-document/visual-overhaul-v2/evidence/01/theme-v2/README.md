# T01.12 — v2 theme on globally: regression sweep

Captured 2026-09-30 with `pnpm visual:capture --grep "01-theme-v2-"` (Chrome 154, SwiftShader,
deterministic): the seven baseline scenarios (`stations-4`, `board-readability`, `purchase`, `rent`,
`chance`, `jail`, `stress`) at 1920×1080, 1440×900, 1280×720 and 812×375 = 28 images, each with a
diagnostics sidecar. The V1 record they are compared against is `../baseline/`.

Two things changed between the two sets: the global v2 theme (this task) and the plan 02 3D scene
(lighting, shadows, tabletop, trays). Differences inside the WebGL board are plan 02 and were not judged
here. Only the DOM layer over the board was reviewed, for token-level regressions (low contrast, panels or
borders that vanished, wrong text color on a new surface, clipped or missing elements).

## Method

Seven reviewers (one per scenario) compared the v1 and v2 image of every viewport and reported
candidate regressions; a second, independent agent then tried to refute each candidate against the same
two images. The verdict rule was "real only if the problem is visible in v2 and is not present, or not
worse, in v1". A reviewer's contrast numbers were measured from PNG pixels.

## Result

Thirty-six candidates were reported and **none was confirmed as a v2 regression**. No panel, button or
label disappeared, overflowed or was clipped at any viewport. Most candidates were real weaknesses that
already exist in v1, so they are recorded here for plan 03 (HUD) instead of being patched with token
tweaks that plan 03 would replace:

| Observation (present in v1 and v2) | Where | Handled by |
| --- | --- | --- |
| The white "Lượt của bạn" label sits on the cream Start tile and the light oak table; contrast is about 1.1–1.5:1 and it relies on a faint text shadow. | `.game-board__turn-label` in `components/style/BoardShell.css` | Plan 03 (turn banner) |
| The idle chat panel (`.center__room`, `.center__chat` in `components/style/Log.css`) uses translucent navy/white fills tuned for the old teal backdrop, so its edge, placeholder and disabled "Gửi" are low contrast on oak (about 1.2–1.5:1). | `components/style/Log.css` | Plan 03 (activity log and chat) |
| The world-space station label of the first player shows through the translucent chat panel at 1280×720 and 812×375. | WebGL label under the DOM panel | Plan 03 T03.6 removes the 3D labels |
| Interactive buttons still use the v1 recipes (dark green "Chơi", taupe "Tài sản của tôi"), not the lacquer-red primary; only the tokens changed. | `components/style/*.css` | Plans 03/04 adopt the v2 primitives |

Improvements seen in the same sweep: the jail action buttons rose from about 2.6:1 to 5.0:1 and "Chơi"
from about 4.9:1 to 7.7:1 (reviewer measurements).

## What changed in code

- `<html data-visual-theme="v2">` in `index.html` (no flash of v1 tokens) and again at bootstrap
  (`design-system/theme/visualTheme.ts`).
- `theme-color` and manifest `theme_color` are the palette `backdrop` (`#F4E6D0`); manifest
  `background_color` is `paper-50` (`#FFFBF3`). `favicon.svg` keeps its v1 lacquer red (an asset, not a token).
- The custom cursor (`cursor.png` and its `body` rule) is removed; the OS default cursor is used (OD-01-4).
  The file deletion landed in commit `2d6f522` together with the G1 record.
- The Design Lab restores the app default (v2) when it unmounts.

## Not run

`pnpm test:e2e:mobile` (needs the PostgreSQL binaries and Playwright browsers, which were not approved
for download), `pnpm db:status`, `pnpm desktop:package` and the WebKit captures.
