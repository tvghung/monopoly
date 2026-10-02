# Evidence 05 / props: table props beside the board (T05.8)

The four code-built table props (cà phê phin, nón lá, bát sen, tiền chơi) on the `board-readability` fixture, with the plan 03 overlap checker run on every capture (`overlapCheck`). Reproduce with `pnpm visual:capture --grep "05-props-props-board-readability"` (SwiftShader). The sidecar JSON of each capture carries `hudOverlap.props`: the props that were shown or hidden, the persistent HUD regions covering more than 2% of a shown prop (`hudFindings`), the transient ones (`transientHudFindings`), and the tiles a shown prop covers (`tileFindings`).

| Capture | Tier | Props shown | HUD findings | Tile findings | Main / shadow draws | Triangles |
| --- | --- | --- | --- | --- | --- | --- |
| `…balanced-1920x1080` | balanced | all four | none | none | 142 / 21 | 68,934 |
| `…balanced-1440x900` | balanced | all four | none | none | 142 / 21 | 68,934 |
| `…balanced-1280x720` | balanced | all four | none | none | 142 / 21 | 68,934 |
| `…balanced-1024x768` (tablet landscape) | balanced | none (the board overflows the width) | none | none | 138 / 17 | 67,374 |
| `…balanced-812x375` (phone landscape) | balanced | none (the board is drawn under 30 px per unit) | none | none | 138 / 17 | 67,374 |
| `…high-1280x720` | high | all four, with shadows | none | none | 142 / 21 | 68,934 |
| `…low-1280x720` | low | none (the tier leaves props out) | none | none | 142 / 0 | 67,382 |

The props cost **4 main-pass draws, 4 shadow-pass draws and 1,560 triangles** where they are shown (the difference between 142 and 138 draws and between 68,934 and 67,374 triangles at the same tier), inside the plan's 4 draws and 3,000 triangles. They are placed beside the left and right corners of the board and shown only where the table margin is free of the HUD at that canvas size; they are never moved under the HUD.

Close-up of the four props: Design Lab, section Landmarks, `&props=1` (`05-g5a-sheet-table-props`).

Not measured here: frame rate on a reference device (see plan 05 §17, budget watch).
