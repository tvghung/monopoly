# G5 review package — 22 landmarks, tube houses, standees, table props and the 2D landmark art

Captured 2026-10-02 with `VISUAL_BROWSER_CHANNEL=chrome pnpm visual:capture --grep "05-g5[-/]"` (Chrome, SwiftShader, deterministic);
the frame-time benchmark with `VISUAL_GPU=hardware` on the machine's own GPU. The verdict belongs to the product owner and a Vietnamese
reviewer and is recorded in `../../../05_3D_ASSETS_LANDMARKS_AND_STANDEES.md` §17. **Verdict: PENDING.** The style was approved at gate G5a
(three pilots, 01/10/2026); this package judges the whole set.

## 1. What this package asks for

1. **The 22 landmarks as a set.** Is each one recognizable at board size, accurate enough, and respectful (Chùa Cầu, Chùa Trấn Quốc and
   Tháp Đôi are heritage or religious sites; no brand marks on the modern towers)? Replace any entry you reject (decision OD-05-6) and
   record it in plan 05 §17 "Landmark review".
2. **The board with every street at the hotel tier** (`landmarks-all`): is it still readable and not cluttered, are the tile names still legible?
3. **The table props** (cà phê phin, nón lá, bát sen, tiền chơi), the **"Khánh thành …!" banner** and the **2D art on the deed cards**.
4. The numbers against the budgets of plan 05 §5.3 (section 5 below).

The §5.3 criterion "Vietnamese reviewer sign-off recorded for all 22 landmarks" cannot be met by the agent: it is the open item of this gate.

## 2. What is where

| File | What |
| --- | --- |
| `05-sheet-landmarks-row-2560x1080.png` | All 22 landmarks in one row (tile order), three tube houses for scale and four standees, in the board's camera and light |
| `../g5a/05-sheet-group-{a,b,c,d}-1440x900.png` | The 19 new landmarks large, one sheet per group (A: tiles 1 3 6 8, B: 9 11 14 19 23, C: 16 18 21 26 27, D: 29 31 32 34 37); the three pilots are in `../g5a/05-sheet-{chua-cau,cau-vang,landmark-81}-…` |
| `05-assets-landmarks-all-balanced-{1920x1080,1440x900,1280x720,812x375}.png` | The live board, balanced tier, every street at the hotel tier |
| `05-assets-landmarks-all-{high,low}-1280x720.png` | The same fixture in the other two tiers (low leaves the table props out) |
| `05-assets-board-readability-…`, `05-assets-houses-max-…`, `05-assets-hotel-…`, `05-assets-standees-…` | The other fixtures, balanced at the four standard viewports (and `board-readability` in high and low at 1280x720) |
| `legacy/` | `landmarks-all` and `standees` with WebGL off: the legacy DOM board does not use the new meshes |
| `numbers/` | Draw calls, triangles and console errors of seven fixtures in three tiers at 1920×1080 (21 JSON files) |
| `benchmark/` | Frame times of `landmarks-all` and `stress` in three tiers on the machine's GPU (6 JSON files) |
| `../props/` | The table props package (T05.8): overlap checker results at every standard viewport |
| Design Lab | `?phase4-uat=1&design-lab=1&section=landmarks` (optional `&landmark=<tile ids>`, `&props=1`); the deed cards are in the surfaces `deeds`, `inspection-street` and `buy` |

Every board capture has a sidecar JSON; the ones with `overlapCheck` report in `hudOverlap` that no persistent HUD region covers a tile and that
no shown table prop touches the HUD or a tile (all 24 board pictures: no finding, 0 console errors).

## 3. The 22 landmarks

| Tile | Street | Landmark | Triangles | Height | Sheet |
| --- | --- | --- | --- | --- | --- |
| 1 | Cà Mau | Mũi Cà Mau | 394 | 0.82 | A |
| 3 | Bạc Liêu | Cánh đồng điện gió | 288 | 1.35 | A |
| 6 | Buôn Ma Thuột | Nhà dài Ê Đê | 232 | 0.85 | A |
| 8 | Cần Thơ | Chợ nổi Cái Răng | 336 | 0.81 | A |
| 9 | Hải Phòng | Nhà hát lớn Hải Phòng | 382 | 0.86 | B |
| 11 | Đà Lạt | Ga Đà Lạt | 236 | 0.69 | B |
| 13 | Hội An | Chùa Cầu | 356 | 0.88 | pilot |
| 14 | Huế | Ngọ Môn | 272 | 0.89 | B |
| 16 | Mũi Né | Đồi cát và thuyền thúng | 416 | 0.60 | C |
| 18 | Sa Pa | Ruộng bậc thang | 488 | 0.94 | C |
| 19 | Nha Trang | Tháp Trầm Hương | 428 | 1.38 | B |
| 21 | Vũng Tàu | Hải đăng Vũng Tàu | 324 | 1.39 | C |
| 23 | Quy Nhơn | Tháp Đôi | 304 | 1.13 | B |
| 24 | Đà Nẵng | Cầu Vàng | 544 | 0.61 | pilot |
| 26 | Bãi Cháy | Vịnh Hạ Long | 400 | 1.01 | C |
| 27 | Hồ Tây | Chùa Trấn Quốc | 540 | 1.17 | C |
| 29 | Phú Quốc | Bãi biển và tàu câu mực | 408 | 0.65 | D |
| 31 | Phú Mỹ Hưng | Cầu Ánh Sao | 636 | 0.70 | D |
| 32 | Thảo Điền | Biệt thự ven sông | 316 | 0.57 | D |
| 34 | Nguyễn Huệ | Trụ sở UBND TP.HCM | 300 | 1.18 | D |
| 37 | Đồng Khởi | Tháp Bitexco | 432 | 1.86 | D |
| 39 | Landmark 81 | Landmark 81 | 308 | 2.00 | pilot |

Triangles include the plinth (about 60). Average 379, total 8,340; limit 900 each. The 22 flat illustrations for the deed cards are in
`apps/client/public/art/landmarks/<tile id>.svg`.

## 4. Checklist and where to look

| G5 question (plan 05 §5.3, §7, §13) | Look at |
| --- | --- |
| Is each landmark recognizable and respectful? Which would you replace? | the group sheets, then the row sheet and `05-assets-landmarks-all-balanced-1920x1080.png` |
| Are the eight regression tile names (Cà Mau, Buôn Ma Thuột, Đà Nẵng, Phú Quốc, Công Ty Nước, Khí Vận, Cơ Hội, Landmark 81) still readable with every street at the hotel tier? | `05-assets-landmarks-all-balanced-1280x720.png` and `05-assets-board-readability-balanced-1280x720.png` (the agent read all eight on the captures; the reviewer confirms) |
| Is the board cluttered at the minimum window and on a phone in landscape? | `…-1280x720.png`, `…-812x375.png` (the table props are hidden there; the HUD is the compact one) |
| Do the table props sit well on the oak, away from the HUD, and are they fictional (no real banknote)? | `../props/`, the Design Lab `&props=1` sheet |
| Does the deed card show the landmark picture and "Khách sạn · <tên>"? | Design Lab surfaces `deeds`, `inspection-street`, `buy` |
| Is the legacy fallback unaffected? | `legacy/` |
| Do the budgets hold in every tier? | section 5 |
| Cultural review of all 22 | the sheets; record each verdict in plan 05 §17 "Landmark review" |

## 5. Numbers (1920×1080; main / shadow / post draws, then triangles of the main pass)

| Fixture | Low | Balanced | High |
| --- | --- | --- | --- |
| `board-readability` | 142 / 0 / 0, 67,382 | 142 / 21 / 0, 68,934 | 142 / 21 / 19, 68,934 |
| `house-4` | 138 / 0 / 0, 66,544 | 138 / 21 / 0, 68,096 | 138 / 21 / 19, 68,096 |
| `hotel` | 136 / 0 / 0, 66,650 | 136 / 18 / 0, 68,202 | 136 / 18 / 19, 68,202 |
| `landmarks-all` (22 landmarks) | 187 / 0 / 0, 75,268 | 187 / 18 / 0, 76,820 | 187 / 18 / 19, 76,820 |
| `houses-max` (22 streets × 4 houses) | 159 / 0 / 0, 73,264 | 159 / 21 / 0, 74,816 | 159 / 21 / 19, 74,816 |
| `standees` (4 on one tile) | 138 / 0 / 0, 66,568 | 138 / 21 / 0, 68,120 | 138 / 21 / 19, 68,120 |
| `stress` | 140 / 0 / 0, 66,722 | 140 / 21 / 0, 68,274 | 140 / 21 / 19, 68,274 |

0 console errors in every capture. Against plan 05 §5.3: `board-readability` main ≤ 210 in every tier **142**; `landmarks-all` main < 240 **187**; shadow in
`landmarks-all` ≤ 30 **18**; triangles of `landmarks-all` and `houses-max` ≤ 80k **76.8k and 74.8k** (under the target, so no "over target" decision is needed);
per landmark ≤ 900 triangles and ≤ 3 draws **636 and 3** (unit tests). The four table props are included wherever they are shown (balanced and high at 1280×720 and up):
they cost 4 main draws, 4 shadow draws and 1,560 triangles (the low tier, which leaves them out, shows 1,552 fewer triangles than balanced).

Compared with before plan 05 (`../baseline/`): `landmarks-all` 199 → **187** main draws (the 22 landmarks replace 22 hotel boxes of several draws each), `houses-max` 331 → **159**
and 93.7k → **74.8k** triangles, `board-readability` 153 → **142**.

## 6. Frame times (not the reference device)

Measured on this machine's **Intel UHD Graphics (0x9B41), Direct3D 11**, 10 seconds each, the same GPU plan 02 used (`../../02/benchmark/`): `stress` low 59.9 FPS median,
balanced **30.0**, high 8.6; `landmarks-all` low 59.5, balanced **29.9**, high 10.0. Plan 02 measured `stress` at 59.5 / 30.0 / 10.0 on the same machine, so plan 05 did not move
the frame time. The open decision of gate G2 stays open: on this class of GPU `balanced` runs at about 30 FPS (fill-rate bound). The benchmark on a reference device (Iris Xe or M1)
was not run: there is none here.

## 7. Known limits (for the reviewer)

- **Cultural sign-off is open.** The agent chose the subjects from the plan's table and drew them simply (no figures, no inscriptions, no logos; Chùa Trấn Quốc and Tháp Đôi are architecture only).
- **No packaged run.** `pnpm desktop:package` and `pnpm --filter @monopoly/desktop proof:packaged:landmarks` were not run in this package; the validator checks the built copies (`pnpm build`).
- **Slim and wide landmarks** fill most of their plinth (footprint up to 1.29 of 1.30); with a standee in front of a tall tower (Đồng Khởi in `landmarks-all`) the standee hides part of it, as it hid the hotel box before.
- **A landmark is a child of its tile**, so it is rotated with the tile and reads from a different side on each edge of the board; the sheets show the unrotated view.
- **Props are hidden** on tablet and phone landscape and in the low tier; they never move under the HUD.
- **Legacy corner overlap** (a player card over a corner tile of the DOM board) is the known gap of plan 03, unchanged.
- **WebKit:** the new meshes are covered by `pnpm test:e2e:mobile` (Chromium and WebKit load and play the board), not by captures.
