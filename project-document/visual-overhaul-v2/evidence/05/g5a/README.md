# G5a review package — pilot landmarks, tube houses and standees

Captured 2026-10-01 with `VISUAL_BROWSER_CHANNEL=chrome pnpm visual:capture --grep "05-g5a"` (Chrome 154, SwiftShader,
deterministic). The verdict belongs to the product owner and a Vietnamese reviewer and is recorded in
`../../../05_3D_ASSETS_LANDMARKS_AND_STANDEES.md` §17. **Verdict: Approved by the product owner on 01/10/2026, written by the agent at the
product owner's explicit request** (no separate Vietnamese-reviewer sign-off is recorded). Gate G5a blocked the other 19 landmarks (plan 05
T05.5/T05.6); with the approval they are built in this style.

## 1. What this package asks for

Judge the **style** of the code-built "toy diorama" assets (plan 05 §8.1) on the three hardest pilots — a tall slim tower
(Landmark 81), a delicate roof (Chùa Cầu) and a curved structure (Cầu Vàng) — plus the new tube houses and mascot standees
they share the board with. The question is whether this look is the one to build the other 19 landmarks in.

## 2. What is where

| File | What | Size |
| --- | --- | --- |
| `05-sheet-landmarks-1440x900.png` | Style sheet: three tube houses (scale reference), the three pilot landmarks on their owner-colored plinths and four standees, in the board's camera and light | 1440×900 |
| `05-sheet-chua-cau-…`, `05-sheet-cau-vang-…`, `05-sheet-landmark-81-…` | Each pilot large, next to the houses | 1440×900 |
| `05-assets-landmarks-all-balanced-1280x720.png` | The live board, balanced tier: every street at the hotel tier (the three pilots show a landmark, the other 19 still show today's hotel box) | 1280×720 |
| `05-assets-houses-max-balanced-1280x720.png` | Every street with four tube houses | 1280×720 |
| `05-assets-house-4-…`, `05-assets-hotel-…`, `05-assets-standees-…` | Four houses on one street; the 4 → 5 state; four standees on one tile | 1280×720 |
| `numbers/` | Draw calls, triangles and console errors for the worst-case fixtures in all three tiers at 1920×1080 (JSON only) | — |
| `../baseline/` | The same fixtures with today's boxes and sprites, for before/after | 1280×720 + `numbers/` |

The style sheet is a Design Lab section (`?phase4-uat=1&design-lab=1&section=landmarks`, optional `&landmark=<tile id>`), so the
reviewer can open it live and orbit nothing: the camera is the board's own.

## 3. Checklist and where to look

| G5a question (plan 05 §14, §13) | Look at |
| --- | --- |
| Is each pilot recognizable as a flat silhouette at about 40 px? | the sheet, then `05-assets-landmarks-all-balanced-1280x720.png` (Landmark 81 near Xuất Phát, Chùa Cầu on Hội An, Cầu Vàng on Đà Nẵng) |
| Does the style (flat-shaded facets, pastel palette, chunky proportions) suit the rest of the board? | `05-assets-houses-max-balanced-…`, the HUD and tiles around the landmarks |
| Are tile names still readable beside the new buildings (no text hidden)? | `05-assets-houses-max-balanced-…` (Hải Phòng, Cần Thơ, Bắc Liêu names are legible) |
| Is ownership readable without color alone? | plinth rim + roof color + the existing flag; the owner is also in the deed card and the tile button label |
| Are the standees at least as readable as the sprites, and do they look like physical pieces? | the sheet (white die-cut border, round colored bases, soft shadows), `05-assets-standees-…` against `../baseline/05-assets-standees-…` |
| Cultural and sensitivity review of the three pilots (Chùa Cầu is a heritage and religious site; plan 05 §7.10) | the sheet; the reviewer records each verdict in plan 05 §17 "Landmark review" |

## 4. Numbers (balanced tier = high tier for draws; 1920×1080)

| Fixture | Main draws (before → now) | Shadow draws | Triangles |
| --- | --- | --- | --- |
| `houses-max` (22 streets × 4 houses) | 331 → **155** | 185 → **17** | 93,712 → **73,256** |
| `landmarks-all` (22 hotels; 3 landmarks, 19 boxes) | 199 → **196** | 53 → 52 | 79,808 → **79,528** |
| `board-readability` | 153 → 139 | 25 → 19 | 68,932 → 67,592 |
| `standees` (4 on one tile) | 138 → 134 | 13 → 17 | 66,720 → 66,560 |
| `stress` | — → 136 | — → 17 | — → 66,714 |

Low tier: `houses-max` 419 → 159, `landmarks-all` 221 → 219 (above the 210 target, below the 240 hard limit).
0 console errors in all captures. **Not final**: `landmarks-all` only becomes the real worst case when all 22 landmarks exist
(T05.6/T05.10). The pilots measure 308, 356 and 544 triangles each with their plinth (limit 900); nineteen more at that size lift the
fixture to at most about 87,000 triangles (target 80,000, hard limit 100,000). See plan 05 §17 ("Budget watch").

## 5. Known limits (for the reviewer)

- **Only three of 22 landmarks exist.** The other 19 streets show today's hotel box at the hotel tier.
- **Hands of Cầu Vàng** are chunky blocks with four fingers; at board size they read as two stone hands holding the bridge.
- **Seen from every side:** a landmark is a child of its tile, so it is rotated with the tile and reads from a different side on each edge of the board; the sheet shows the unrotated view.
- **Slot overlap:** with three or four mascots on one tile the standee cards overlap their neighbours as the sprites did (the slot layout is frozen).
- **Reference device:** the benchmark (`stress`, balanced) was not run on a physical device here; SwiftShader numbers above are draw/triangle counts, not FPS.
- **WebKit:** rendering of the new meshes is covered by `pnpm test:e2e:mobile` (the board loads and plays) but not by captures.
