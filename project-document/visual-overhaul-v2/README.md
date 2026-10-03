# Visual Overhaul V2 — "Tabletop Toy Vietnam"

**Status: DONE — all five plans are implemented and every review gate was approved by the product owner (G1 on 2026-09-30; G2, G3, G4 and G5a on 01/10/2026; G5 on 02/10/2026; each written into the plans by the agent at their request). Plan 01 is done (v2 theme on globally); plan 02 is implemented (T02.0–T02.18); plan 03 (T03.0–T03.16) and plan 04 (T04.0–T04.17) were reviewed and fixed; plan 05 is implemented (T05.0–T05.12: all 22 landmarks, their 2D art, the table props and the "Khánh thành" banner; T05.9 skipped by decision) and its package is `evidence/05/g5/`. `pnpm test:e2e:mobile` passes (re-run 2026-10-02). Open items, written down in the plans: the `balanced` performance decision on integrated GPUs and a benchmark on a reference device (plans 02 and 05), the 5-second test with real participants (plan 03; an agent never records its answers) and a human look at the packaged window (plan 05). All open decisions were answered by the product owner on 2026-09-30 (§4.1). The program shipped in V1, released as `v1.0.0` on the product owner's decision of 2026-10-02 with those items still open (see the [V1 release contract](../ui-ux-overhaul/V1_RELEASE_CONTRACT.md#v100-release-decision)).**

- Program created: 2026-09-29
- Baseline branch / SHA: `codex/v1-production-audio-assets` / `440766a`
- Baseline product: Own the Block V1 (`1.0.0`), Socket protocol 9, room snapshot schema 8
- Language rule: plans are written in English; every player-facing string stays Vietnamese

This folder is the single entry point for the second visual overhaul. It turns a
principal-level UI/UX review of the running game into five executable plans. A
developer or AI agent (Codex, Claude, etc.) should be able to pick up any plan,
read it together with this README, and execute it without re-doing the design
thinking.

---

## 1. Why this program exists

The product owner reviewed V1 and judged the look "average, not beautiful":
the interface, HUD, and overall UI/UX feel like a functional web prototype, and the
3D board should look more premium and more "real".

A live review of the game (two browser players, full turns, modals, settings,
mobile landscape) confirmed these root causes. Baseline screenshots are in
[`baseline/`](baseline/).

| # | Root cause | Evidence |
| --- | --- | --- |
| R1 | The most important game information (every player's money, whose turn it is) is the weakest element on screen: small perspective SDF labels at the board corners, and no visible roster. In the legacy (non-WebGL) board no money is visible at all. | `baseline/03-board-idle.jpg`, `06-turn-handoff.jpg`; `PlayerStationLayer.tsx`, `PlayerStations.tsx` (sr-only) |
| R2 | The scene is lit flat: one hemisphere light + one directional light, `shadows={false}`, no environment map except on coins, ACES tone mapping shifting the pastel palette. Materials read as matte plastic. | `apps/client/src/game/scene/GameScene.tsx` |
| R3 | The board floats in a flat teal void (`#55dcc8` DOM / `#62ddcc` WebGL clear color). There is no table, no space, no depth cue. | `baseline/03-board-idle.jpg` |
| R4 | Surfaces look like generic web forms: white cards, teal borders, pink buttons, native `<select>`, too many competing accents, no brand identity. | `baseline/05`, `09`, `11`, `12` |
| R5 | Feedback for key beats is tiny: ownership is a small flag, rent is a small floating label at a far corner, the dice total is a small number under the dice, the turn change is one line of small white text. | `baseline/04`, `06`, `07` |
| R6 | Layout conflicts: the chat/log overlays the upper-left board corner and fades to 20% opacity when idle; toasts sit over the roll button; on mobile landscape the log covers about a quarter of the board. | `baseline/03`, `14-mobile-landscape.jpg`; `Log.tsx`, `Toast.css` |
| R7 | Pre-game screens (landing, lobby, launcher) are form-first with no key art; some copy is English (`Dog`, `Host Game`, `Join Game`), which contradicts the Vietnamese-UI rule. | `baseline/01`, `02`; `characterRegistry.ts`, `DesktopMultiplayerLauncher.tsx` |

North star for the whole program:

> **A premium toy board game on a warm wooden table, lit like a product photo,
> with Vietnamese craft accents, where every player always knows whose turn it
> is, how much everyone has, and what just happened.**

---

## 2. Plan index

| # | Plan | Goal in one line | Depends on | Parallel with | Primary skill |
| --- | --- | --- | --- | --- | --- |
| 01 | [Visual Target and Design Tokens V2](01_VISUAL_TARGET_AND_DESIGN_TOKENS.md) | Lock the art direction, tokens v2, fonts, primitives, icon registry, Design Lab, and evidence tooling; get product-owner approval. | — | 02 (technical tasks only) | UI design + front-end |
| 02 | [Lighting, Environment and Tabletop](02_LIGHTING_ENVIRONMENT_AND_TABLETOP.md) | Make the existing board look premium through lighting, IBL, shadows, tone mapping, a measured post-processing chain, a tabletop, and graphics-quality tiers. | 01 tasks T01.1–T01.2 (harness `scenario` param + capture tool, needed for measurement); 01 G1 (palette) for final grading only | 03, 04 | Three.js / R3F |
| 03 | [HUD Restructure](03_HUD_RESTRUCTURE.md) | Replace the weak HUD with corner player cards, a center stage, an action dock, a status bar, turn banner, money deltas, and a chat/activity drawer. | 01 | 02, 04 | React + UX |
| 04 | [Modals, Cards and Pre-Game Screens](04_MODALS_CARDS_AND_PREGAME_SCREENS.md) | Redesign every on-demand surface (deed card, decisions, settings, card reveal, victory) and the landing/launcher/lobby screens. | 01 | 02, 03 | React + UX |
| 05 | [3D Assets: Landmarks, Standees and Props](05_3D_ASSETS_LANDMARKS_AND_STANDEES.md) | Add Vietnamese identity and "real object" feel: Vietnamese tube houses (nhà ống), 22 city landmarks as the hotel tier, physical mascot standees, four code-built table props. | 02; 03 tasks T03.6 (station label removal, frees draw calls) and T03.14 (overlap checker) | 04 (late tasks) | Three.js + 3D art direction |

Each plan contains: Description, Context, Current State, Purpose, Desired
Outcome, Scope, Constraints, Design Specification, Technical Approach, Execution
Guide (ordered tasks with acceptance criteria), Testing, Documentation Updates,
Risks, Open Decisions (with recommended defaults), Definition of Done, and a
ready-to-paste agent prompt.

---

## 3. Execution order and gates

```text
                    ┌───────────────────────────────┐
                    │ 01 Visual Target + Tokens V2   │
                    │  G1: product-owner approval    │
                    └──────────────┬────────────────┘
      (02 technical tasks may      │ approved tokens, fonts, primitives,
       start before G1)            │ Design Lab, evidence tooling
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
┌───────────────────┐   ┌───────────────────┐   ┌──────────────────────┐
│ 02 Lighting +     │   │ 03 HUD            │   │ 04 Modals, Cards,    │
│    Tabletop       │   │    Restructure    │   │    Pre-game Screens  │
│ G2: perf budget   │   │ G3: HUD review    │   │ G4: surface review   │
└─────────┬─────────┘   └───────────────────┘   └──────────────────────┘
          ▼
┌───────────────────────────────┐
│ 05 3D Assets (landmarks,      │
│    nhà ống, standees, props)  │
│ G5: asset + perf review       │
└───────────────────────────────┘
```

- **G1 (blocking):** the product owner approves the Design Lab screenshots of plan 01
  before plans 03/04 restyle production screens and before plan 02 finalizes color
  grading.
- **Measurement prerequisite:** plan 01 tasks T01.1 (harness `scenario`/`uat-controls`
  URL params) and T01.2 (capture tool) must land before plan 02 starts measuring. They
  are small; if plan 01 has not started, do them first on their own branch.
- **Plan 05 prerequisite:** plan 03 T03.6 (3D station labels removed, about −16 draws)
  and T03.14 (overlap checker) must land before plan 05 measures budgets and places props.
- **G2–G5:** each plan ends with its own evidence review (screenshots at the
  standard viewports, performance numbers, test results). A plan is not DONE while
  its manual review rows are open.
- Plans 03 and 04 touch different files by design (03 = persistent in-game layout;
  04 = on-demand surfaces and pre-game screens). The shared primitives they both
  consume are created in plan 01, so they can run in parallel with few merge
  conflicts. Shared files and their owners (paths under `apps/client/src/`):

  | File | Owner of structure/logic | Other plans' allowed change |
  | --- | --- | --- |
  | `components/Board.tsx`, `components/Dashboard.tsx` | 03 | 04: none (must not restructure) |
  | `components/dashboard/JailPanel.tsx` | 04 (styling, buttons) | 03: only the hint copy that names the roll button |
  | `components/style/Dashboard.css` | 04 (removes the purchase-button rules after BuyPrompt and JailPanel migrate) | 03: only the context-stack container rules |
  | `game/ui/property/OwnedPropertiesControl.tsx` | 04 (modal content) | 03: moves the trigger button into the action dock |
  | `App.tsx` / `App.css` | 03 (toolbar) | 04: room-exit context, unified loading screen, spectator banner, connection overlay |
  | `components/Toast.tsx` + `components/style/Toast.css` | 03 (position, max visible) | 04: `ToastView` visuals only |
  | `settings/SettingsPanel.tsx` | 04 (layout/controls) | 02: adds a minimal `graphicsQuality` control that 04 later restyles |
  | `settings/types.ts`, `defaults.ts`, `SettingsContext.ts` | 02 (`graphicsQuality`) | — |
  | `dev/phase4-uat/Phase4UatHarness.tsx` | 01 (URL params, Design Lab entry) | 02: benchmark; 03: `stations-3`/offline scenarios; 04: surface fixtures; 05: asset fixtures (small, separate commits) |

  Merge whichever plan finishes first, then rebase the other.
- Recommended branch names: `visual-v2/01-visual-target`, `visual-v2/02-lighting`,
  `visual-v2/03-hud`, `visual-v2/04-surfaces`, `visual-v2/05-assets`. Branch from the
  latest integration branch at the time you start, not from `main` (at the time of
  writing, `main` lags the release line by 53 commits).

---

## 4. Program decision record

These decisions were made during the review. Do not re-open them without the
product owner. Each plan repeats the ones that concern it.

| ID | Decision | Rationale |
| --- | --- | --- |
| DR-01 | **Liquid Glass (e.g. `liquid-glass-react`, `liquidGlass.js`) is rejected as the UI direction.** Frosted surfaces are allowed only for secondary chrome (drawer backdrop, tooltips) via plain CSS `backdrop-filter: blur()` over an at least 72%-opaque fill, and never over gameplay-critical numbers. | (1) The SVG-displacement refraction these libraries rely on (an SVG filter inside `backdrop-filter`) is supported by Chromium-based browsers only at the time of writing (2026-09); iPhone Safari joins over LAN and would get a broken or plain fallback. Re-verify browser support before revisiting this decision. (2) Backdrop filters over a WebGL canvas cost GPU time every frame the canvas redraws, which hurts integrated GPUs and phones. (3) Glass over a colorful board lowers contrast for money and text; the current translucent log already proves this. (4) Liquid Glass is an OS-chrome aesthetic; the approved art direction is a cute, toy-like, tactile board game. |
| DR-02 | **Stylized PBR, not photorealism.** "More realistic" means physically based light, soft shadows, ambient occlusion, and believable materials (glossy toy plastic, wood, paper, metal) on toy proportions. | At the fixed camera distance a hotel is about 20–40 px tall at 1080p, so geometric detail is invisible while light and material response are very visible. Photoreal assets would also clash with the 2D mascots. The masterplan already lists photorealistic materials as out of scope. |
| DR-03 | **A visible DOM HUD returns** (corner player cards, action dock, status bar). This supersedes the Phase 4 decision that removed the side HUD/top strip and moved names and money into world-space stations (`04_PHASE_4_GAMEPLAY_ACTIONS.md` §7.2 and §18.2). | Money and turn state are the most important information and must be crisp, accessible, localizable, and visible in the legacy fallback too. 3D stations stay as wealth piles, coin-flight anchors, and camera fit points. |
| DR-04 | **Post-processing, a scene environment map, and real shadows are permitted under the measured budget plan in plan 02.** This supersedes the Phase 5 limits (`05_PHASE_5_GAME_FEEL_AUDIO_EFFECTS.md` §3, `05A_PHASE_5_0_AUDIT_AND_SCOPE.md` §12, `04_PHASE_4_GAMEPLAY_ACTIONS.md` §20.2 coin-only environment). | Those documents explicitly required "a measured need and an approved budget plan"; plan 02 is that plan and carries its own measurements and quality tiers. |
| DR-05 | **The fixed orthographic camera, `frameloop="demand"`, the `BoardRenderModel` boundary, the WebGL fallback, and the 40 semantic tile buttons stay.** | These are repository invariants (`CLAUDE.md`). Depth comes from light, shadow, and the tabletop, not from camera changes. A perspective camera is listed as a future open decision only. |
| DR-06 | **3D assets must not require WebAssembly decoders and must be texture-free by default** (no Draco, no KTX2/Basis, no Meshopt decoder, no images inside glTF). Use code-built geometry, or glTF with `KHR_mesh_quantization` and `COLOR_0` vertex colors only. | The packaged Electron CSP has no `'wasm-unsafe-eval'`, and images embedded in `.glb` files load through `blob:` URLs, which `img-src 'self' data:` and `connect-src` block; `.webp` is also missing from the `app://` MIME map. Texture-free assets keep the CSP, the `app://` protocol, and iPhone Safari support unchanged. Revisit only with a measured need. |
| DR-07 | **Vietnamese identity is a first-class visual pillar**: craft palette (lacquer red, gold leaf, dó paper, Bát Tràng blue, jade), Vietnamese tube houses, and city landmarks. | This is the product's differentiator ("Cờ Tỷ Phú Việt Nam"); generic Monopoly styling does not justify a redesign. |

### 4.1 Product-owner decisions (answered 2026-09-30)

All open decisions of plans 01–05 were answered by the product owner on 2026-09-30.
Each plan's **Decisions** section is the binding record; this is a summary.

| # | Decision ID | Decision |
| --- | --- | --- |
| 1 | OD-01-1 | Display typeface: **Baloo 2** |
| 2 | OD-01-2 / OD-02-4 | Table: **light oak table only, no felt mat** (`#DDBB8F`, grain `#B08A5F`) |
| 3 | OD-01-3 | Primary action color: **lacquer red `#C4302B`** |
| 4 | OD-01-4 | Custom cursor: **removed** (OS default) |
| 5 | OD-01-5 | Paper grain on panels: **on, automatically off in the `low` tier** |
| 6 | OD-02-1 | Default graphics tier: **`auto`** (→ `balanced`; never auto `high`) |
| 7 | OD-02-2 | Tone mapping: **Neutral** |
| 8 | OD-02-3 | Post-processing library: **pmndrs** (high tier only, lazy) |
| 9 | OD-02-5 | Player trays: **lacquer tray with player-color rim** |
| 10 | OD-02-6 | WebGL context restore: **later** (separate plan) |
| 11 | OD-02-7 | File-based HDR environment: **no**, unless the procedural environment fails G2 |
| 12 | OD-03-1 | Roll button label: **"Đổ xúc xắc"** |
| 13 | OD-03-2 | Roll button position: **board center** |
| 14 | OD-03-3 | Chat/log drawer: **collapsed by default**, remembered per viewer |
| 15 | OD-03-4 | Clicking a player card: **opens that player's portfolio** (once plan 04 ships it) |
| 16 | OD-03-5 | `Space` to roll: **yes** (guarded) |
| 17 | OD-03-6 | "Giao dịch" in the action dock: **no** |
| 18 | OD-03-7 | Dice total: **large DOM callout only** (3D total removed) |
| 19 | OD-04-1 | Mascot names: **English names deleted; no visible mascot name anywhere** (Vietnamese accessible labels only, for screen readers) |
| 20 | OD-04-2 | Buy/Development: **bottom sheet, board not dimmed** |
| 21 | OD-04-3 | Card overlay migrated to `Modal`: **yes** |
| 22 | OD-04-4 | Victory confetti: **one burst** |
| 23 | OD-04-5 | Victory waits for the final animations: **yes** (snap shows immediately) |
| 24 | OD-04-6 | Landing: **explicit "Có mã phòng" / "Phòng chung" toggle**, default "Có mã phòng" |
| 25 | OD-04-7 | Hero art: **composition of the existing mascots** |
| 26 | OD-04-8 | "Bỏ cuộc" inside the debt dialog: **yes** |
| 27 | OD-04-9 | Read-only player portfolio: **yes** |
| 28 | OD-05-1 | Landmarks: **code-built** |
| 29 | OD-05-2 | glTF for props: **no** |
| 30 | OD-05-3 | Table props: **build all four now** (code-built) |
| 31 | OD-05-4 | "Khánh thành …!" landmark banner: **yes** |
| 32 | OD-05-5 | Standee border: **white** |

Human review gates (G1–G5, G5a) are still required: the decisions fix the choices, the
gates approve the rendered result.

---

## 5. Global guardrails (non-negotiable)

Every plan must preserve the following repository invariants (see `CLAUDE.md`
and `project-document/monopoly-websockets/`):

1. **Server owns truth.** No gameplay rule, economy, index, protocol, schema, or
   persistence change. The visual overhaul is client presentation only. If a plan
   seems to need a new server field, stop and raise it as an open decision.
2. **Single presentation pipeline:** `PresentationController → AnimationQueue →
   PresentationStore`. No second queue, event bus, timer chain, or store. HUD values
   that follow animation (turn label, balances, activity) read presentation state;
   permissions (can roll, can buy) read authoritative state.
3. **Reconnect/replay never replays history.** `SESSION_SYNC`, `SPECTATOR_SYNC`, and
   `REPLAY_SYNC` snap; only `LIVE_UPDATE` animates. Every new transient UI element
   must clear on `presentationResetEpoch` changes.
4. **WebGL board renders only `BoardRenderModel`.** Fixed orthographic camera,
   `frameloop="demand"`, invalidate on async completion (SDF text, texture/model
   loads). No permanent RAF loop.
5. **Board art rules:** neutral property chassis; 8 district material/texture pairs
   keyed by `surfaceKey`; district accents never encode ownership; surface batches
   follow the tile-motion matrix.
6. **Accessibility boundary:** WebGL fallback (legacy board) and 40 semantic tile
   buttons remain. Do not rely on color alone for owner, debt, jail, or turn state.
   Reduced motion and all 4 animation speeds (0.75x, 1x, 1.5x, 2x) keep working.
7. **Central modal primitives:** prompts use `Modal`/`ConfirmationDialog`/`Toast`;
   no `window.confirm`; focus trap/restore and z-index stay in the primitive.
8. **Electron security** stays: `contextIsolation: true`, `nodeIntegration: false`,
   `sandbox: true`, typed whitelist preload, `app://` traversal guard, existing CSP.
9. **Budgets:** draw calls target ≤210, hard <240 (the current heavy readability
   fixture is about 227); triangles target 80k, hard 100k. Budgets are never raised
   to hide a regression; new visuals must fit, be instanced, or be tiered.
10. **Vietnamese UI copy** and money formatting through `formatMoney`
    (`1 unit = 1.000 ₫`). No `$`, no English labels in player-facing UI.
11. **Docs move with code:** the AS-IS docs under
    `project-document/monopoly-websockets/` and the testcase checklists are updated
    in the same change as the code. Never relabel a checklist item as automated
    without an executable assertion.

---

## 6. Historical statements this program changes

When a plan implements one of these changes, it must update the listed AS-IS
documents in the same change, and add a one-line "superseded by visual-overhaul-v2
plan NN" note next to the historical statement (do not delete history).

| Historical statement | Where | Changed by |
| --- | --- | --- |
| Stations carry the only visible name and money; side HUD/top strip removed | `04_PHASE_4_GAMEPLAY_ACTIONS.md` §7.2, §18.2; `Client/game-board.instruction.md` | Plan 03 |
| `scene.environment` stays unset; environment only on coins | `04_PHASE_4_GAMEPLAY_ACTIONS.md` §20.2 | Plan 02 |
| No post-processing pipeline / no bloom | `05_PHASE_5_GAME_FEEL_AUDIO_EFFECTS.md` §3, `05A_PHASE_5_0_AUDIT_AND_SCOPE.md` §12 | Plan 02 |
| "ACES filmic tone mapping, contact shadows, disabled shadows" | `Client/game-board.instruction.md`, `06A_PHASE_6_0_RELEASE_READINESS_AUDIT.md` renderer row | Plan 02 |
| High/Balanced/Low quality modes only if profiling proves need | `06_PHASE_6_POLISH_DISTRIBUTION.md` §4 | Plan 02 (with profiling evidence) |
| Board/camera/visual redesign frozen | `06A_PHASE_6_0_RELEASE_READINESS_AUDIT.md` §10 | Whole program (product-owner request, 2026-09-29) |
| Houses/hotels: neutral bodies with owner-colored roof, code-built | `Client/game-board.instruction.md` | Plan 05 |
| No external 3D models / no GLB | `02_PHASE_2_2_5D_BOARD.md`, `03_PHASE_3_CHARACTER_SYSTEM.md` §10 | Plan 05 (only if the glTF route is approved; the default route stays code-built) |
| Log idles to opacity 0.2 over the board | `Client/activity-log-and-chat.instruction.md` | Plan 03 |

---

## 7. How to run the game locally

### 7.1 Full stack with Docker (standard)

```bash
pnpm install
docker compose up -d postgres
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Server: `http://127.0.0.1:8080`. Client: `http://127.0.0.1:5173`.

### 7.2 Full stack without Docker (managed PostgreSQL)

The desktop package ships a managed PostgreSQL runtime. After
`pnpm --filter @monopoly/desktop prepare:postgres` (downloads and verifies the
binaries into `apps/desktop/generated/postgres/<platform>-<arch>`), save this
script outside the repository (e.g. a scratch folder) as `devstack.mts` and run it
from `apps/server` with `node --import tsx <path>/devstack.mts`. It starts a
disposable database and the authoritative server on port 8080; then start the
client with `pnpm --filter @monopoly/client dev`.

```ts
// Dev-only: disposable managed PostgreSQL + authoritative server on :8080.
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = 'C:/Users/<you>/monopoly'; // absolute repository path
const { ManagedPostgresController } = await import(
  pathToFileURL(path.join(repo, 'apps/desktop/src/managedPostgres.ts')).href
);
const { startAuthoritativeServer } = await import(
  pathToFileURL(path.join(repo, 'apps/server/src/authoritativeServer.ts')).href
);
const postgres = new ManagedPostgresController({
  resourceRoot: path.join(repo, 'apps/desktop/generated/postgres', `${process.platform}-${process.arch}`),
  proofDataDirectory: await mkdtemp(path.join(os.tmpdir(), 'otb-dev-')),
});
const database = await postgres.start();
const server = await startAuthoritativeServer({
  environment: { NODE_ENV: 'development', SERVER_HOST: '127.0.0.1', PORT: '8080',
    DATABASE_URL: database.databaseUrl, DATABASE_SSL: 'false' },
  migrationDirectory: path.join(repo, 'apps/server/migrations'),
  host: '127.0.0.1',
  port: 8080,
});
const stop = async () => { await server.shutdown('stop'); await postgres.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
```

### 7.3 Two players on one machine

Reconnect tokens are stored per origin, so open one player on
`http://localhost:5173/` and the second on `http://127.0.0.1:5173/`. Enter the same
room code in both, pick a mascot in each tab, press **Sẵn sàng**, and start from the
host tab.

### 7.4 Deterministic states without a server (UAT harness)

The existing Phase 4 UAT harness renders the real `Board` and card overlay from
fixtures, with no socket or database:

```bash
VITE_PHASE4_UAT=1 pnpm --filter @monopoly/client exec vite --mode phase4-uat
```

`.env.phase4-uat` is gitignored, so the gate has to come from the environment (PowerShell: set
`$env:VITE_PHASE4_UAT = "1"` first). Plan 01 also added the URL parameters `scenario=<key>`,
`uat-controls=collapsed|hidden` and `design-lab=1`, a `data-uat-ready` marker, and
`pnpm visual:capture` (see `Client/design-system.instruction.md`).

- Open `http://127.0.0.1:5173/?phase4-uat=1`; pick a scenario in the
  `Kịch bản` select (48 scenarios: `stations-4`, `purchase`, `rent`, `hotel`,
  `chance`, `jail`, `bankrupt`, `board-readability`, `stress`, `reduced-motion`,
  and more).
- Collapse the controls with **Ẩn điều khiển UAT** before screenshots.
- `?phase4-uat=1&card-gallery=1` shows all 28 card artworks.
- Renderer diagnostics (draw calls, triangles) are exposed in
  `window.__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__` and the `own-the-block-renderer`
  window event (WebGL mode only). The visible `[data-testid="renderer-metrics"]`
  output lives inside the collapsible controls, so it disappears when the controls
  are collapsed; automated tools must read the global or the event instead.
- The harness does not render the App toolbar, Lobby, JoinForm, Settings, or the
  Winner modal. Plan 01 adds a Design Lab route for those surfaces.
- Rule from Phase 4: extend this harness; do not create a second one.

---

## 8. Evidence and screenshot convention

- Save evidence to `project-document/visual-overhaul-v2/evidence/<plan-number>/`,
  named `<NN>-<surface>-<state>-<width>x<height>.png` (for example
  `03-hud-opponent-turn-1440x900.png`).
- Since 1.1.1 the PNG files of the closed gates G1 to G5 are not on `main` (519 files, 221 MiB, nothing reads them at
  runtime). They are the zip of the pre-release `evidence-visual-v2-2026-10-02`, under the same relative paths that the plans
  and test-case documents cite; `*.png` in that folder is ignored by Git, and the JSON measurements and gate READMEs stay
  committed. See `evidence/README.md` for how to restore, publish or reproduce them.
- Standard viewports: `1920×1080`, `1440×900`, `1280×720` (Electron minimum),
  `812×375` (phone landscape), `667×375` (small phone landscape), `1024×768`
  (tablet landscape). Portrait phones only need the rotate-device gate.
- For every visual slice capture: settled board, the active effect, the
  `board-readability` and `stress` harness fixtures, reduced motion, and WebGL
  fallback where relevant (this matches the Phase 5 diagnostics rule).
- Record draw calls and triangles from the harness diagnostics next to each
  screenshot set.
- Label every checklist row as AUTOMATED only when an executable assertion exists;
  otherwise use MANUAL / NOT RUN. Screenshots are manual evidence.
- Plan 01 adds a capture script so screenshots are reproducible; prefer it over
  hand-made captures.

---

## 9. Common Definition of Done (every plan)

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Plus, for any change that ships in the desktop renderer:

```bash
pnpm --filter @monopoly/desktop typecheck
pnpm --filter @monopoly/desktop test
pnpm desktop:package
```

And for UI layout changes: `pnpm test:e2e:mobile` (Chromium + WebKit mobile
profiles, legacy board). A plan is DONE only when its own Definition of Done
section, these commands, the documentation updates, and the evidence review are
complete.

---

## 10. Handoff protocol for agents

1. Read, in order: this README → the plan file → `CLAUDE.md` →
   `project-document/monopoly-websockets/README.md` → the rule files the plan lists.
2. Work on the plan's branch. Keep commits scoped to one task ID from the plan's
   Execution Guide (for example `feat(hud): T3.4 corner player cards`).
3. Update the plan's **Status** line and its **Progress log** section as tasks
   complete (task ID, commit SHA, evidence file paths, test results).
4. When a task conflicts with an invariant or needs a product decision, stop that
   task, write the question in the plan's **Open Decisions** table with a
   recommended default, and continue with independent tasks.
5. Do not delete historical documents; add supersession notes instead (section 6).
6. Do not raise performance budgets; do not relabel manual checks as automated.

---

## 11. Baseline screenshots

Captured 2026-09-29 from the running game (desktop pane about 961×956 CSS px,
screenshots scaled to 800 px wide; mobile landscape emulated at 812×375).

| File | What it shows |
| --- | --- |
| `baseline/01-landing.jpg` | Join form on a pastel gradient |
| `baseline/02-lobby.jpg` | Lobby: 4 seats, mascot carousel, 10 color chips |
| `baseline/03-board-idle.jpg` | Game start: teal void, floating corner money labels, log overlay top-left |
| `baseline/04-dice-result.jpg` | Dice settled; total "8" printed small under the dice |
| `baseline/05-purchase-prompt.jpg` | Purchase decision: title + two buttons, no deed information |
| `baseline/06-turn-handoff.jpg` | Turn passes: only the bottom text changes to "Lan đang chơi" |
| `baseline/07-rent-feedback.jpg` | Rent paid: small "-6.000 ₫" labels at the far station |
| `baseline/08-card-reveal.jpg` | Khí Vận card modal |
| `baseline/09-my-assets-modal.jpg` | "Tài sản của tôi" modal |
| `baseline/10-special-tile-modal.jpg` | Special tile inspection ("Vào Tù") |
| `baseline/11-property-inspection-modal.jpg` | Property inspection ("Đà Nẵng") |
| `baseline/12-settings-modal.jpg` | Settings: sliders, native select, checkbox |
| `baseline/13-mobile-portrait-gate.jpg` | Portrait phone: rotate-device notice |
| `baseline/14-mobile-landscape.jpg` | Phone landscape: log covers part of the board, CTA overlaps corner |

---

## 12. Glossary

| Term | Meaning |
| --- | --- |
| Authoritative state | The server-derived room state (`stateContext`); decides permissions. |
| Presentation state | `PresentationStore` values that follow animation (`displayActivePlayerId`, `displayBalances`, `settledPositions`, `displayActivity`, `moneyTransfers`, `balanceDeltas`, `cardPresentation`). |
| Presentation gate | The rule that UI showing consequences waits for the queued animation step. |
| Reset epoch | `presentationResetEpoch`; increments on snap/reset. Transient UI must clear when it changes. |
| Station | World-space player area at a board edge midpoint (wealth pile, coin anchor, camera fit point). Rendered in a screen corner. |
| Slot | `BOTTOM` (local player, lower-left on screen), `TOP` (upper-right), `LEFT` (upper-left), `RIGHT` (lower-right). |
| District / surfaceKey | One of 8 color groups and its shared textless surface material. |
| Standee | A mascot rendered as a physical cardboard/acrylic game piece (sprite face, white die-cut border, thickness, round base). |
| Landmark | A code-built (default) or glTF model of a Vietnamese city landmark shown as the hotel tier of a property. |
| Nhà ống | Vietnamese narrow tube house; the house-tier building style in plan 05. |
| Design Lab | Dev-only route inside the existing UAT harness that renders tokens, primitives, and pre-game surfaces for review (plan 01). |
| Quality tier | `high` / `balanced` / `low` graphics preset (plan 02). |
