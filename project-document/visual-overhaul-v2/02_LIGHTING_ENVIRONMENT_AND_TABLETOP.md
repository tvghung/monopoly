# 02 — Lighting, Environment and Tabletop

**Status: DONE — G2 Approved by the product owner on 01/10/2026 (2026-09-30: T02.0–T02.18 implemented; the G2 package is in `evidence/02/g2/`). Two items stay open: the `balanced` performance decision on integrated GPUs and the benchmark on the reference device. Open decisions answered by the product owner on 2026-09-30 (see the Decisions section).**

| Field | Value |
| --- | --- |
| Plan ID | V2-02 |
| Depends on | V2-01 T01.1–T01.2 (harness `scenario` param, readiness marker, capture tool) before T02.0 measurements; V2-01 `OTB_PALETTE` + G1 approval for T02.16 only |
| Blocks | V2-05 (assets are tuned under the new lighting) |
| Parallel with | V2-03, V2-04 |
| Suggested branch | `visual-v2/02-lighting` |
| Size | L (about 12–18 agent working sessions) |
| Owner profile | Three.js / React Three Fiber engineer; human visual review at G2 |
| Primary code areas | `apps/client/src/game/scene/**`, `apps/client/src/settings/**` (one new setting), `apps/client/src/dev/phase4-uat/**` (benchmark), `apps/client/package.json` (post-processing deps, high tier only) |

Read first: [README.md](README.md), then this file. This plan is the
"measured need and approved budget plan" that
`05A_PHASE_5_0_AUDIT_AND_SCOPE.md` §12 requires before post-processing, bloom,
or a scene-wide environment may be added (decision DR-04).

---

## 1. Description

Make the existing board look like a premium toy photographed on a table,
without new gameplay, camera changes, or new 3D models:

1. **Budget recovery first**: cut the main-pass draw calls of the mandatory
   `board-readability` fixture from about 227 to about 171 by fixing wasteful passes
   (about 155 once plan 03 removes the 3D station labels).
2. **Correct diagnostics and a benchmark mode**, so every later claim is
   measured.
3. **Graphics quality tiers** (`auto`, `high`, `balanced`, `low`) with a player
   setting.
4. **Color pipeline**: Khronos PBR Neutral tone mapping instead of ACES Filmic.
5. **Studio image-based lighting**: a procedural environment map for every
   standard material (no HDR file, no new asset type).
6. **A light rig** with form-revealing key, fill, and rim lights.
7. **Real soft shadows** (balanced/high) from the key light.
8. **A tabletop**: a light oak table (no play mat, decision OD-02-4), board ground
   shadow, and lacquer player trays that ground the coin piles; the teal void disappears.
9. **A material pass**: glossy dice, toy-plastic roofs, lacquer frame, paper cards.
10. **An optional post-processing chain for the high tier only**: ambient
    occlusion, subtle bloom, vignette, MSAA.

---

## 2. Context

- Root causes R2 (flat lighting) and R3 (teal void) in README §1. These are the
  biggest single contributors to the "cheap" look: the geometry is decent, the
  light is not.
- The current directional light sits at world `(8, 14, 7)`, which is on the camera
  side (the camera looks from direction `(1, 1.25, 1)`). Front lighting flattens
  every form: both visible side faces of a box receive similar light.
- Previous phases deliberately stayed minimal: `scene.environment` unset
  (Phase 4 §20.2), no post-processing (Phase 5 §3, Phase 5A §12), quality modes
  only after profiling (Phase 6 §4). This program changes those decisions under
  DR-04 with the measurements and tiers defined here.
- Hard constraints: the fixed orthographic camera and `frameloop="demand"` stay
  (DR-05). Tile text readability must not drop (`02_PHASE_2_2_5D_BOARD.md` §11:
  lighting must not make tile text harder to read).

---

## 3. Current State

### 3.1 What the player sees

- `baseline/03-board-idle.jpg`: evenly lit board, no cast shadows, pastel tiles on
  a flat teal void; coin piles and money labels float in the void.
- `baseline/04-dice-result.jpg`: white dice with a soft blob shadow.

### 3.2 Renderer configuration (`apps/client/src/game/scene/GameScene.tsx`)

| Setting | Current value |
| --- | --- |
| Camera | `orthographic`, `near 0.1`, `far 100`, position `normalize(1, 1.25, 1) × 32` (≈ 45° azimuth, 41.5° elevation), frustum fitted by `camera/FixedBoardCamera.tsx` using `calculateOrthographicHalfHeight(aspect)` with `SCENE_FIT_POINTS` (board, stations, dice envelope), margin 1.02, `ORTHOGRAPHIC_READABILITY_ZOOM = 1.08` (`camera/cameraMath.ts`) |
| `dpr` | `[1.25, 1.5]` |
| `frameloop` | `"demand"` |
| `shadows` | `false` (no `castShadow`/`receiveShadow` anywhere in `apps/client/src`) |
| `gl` | `antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1`; R3F defaults to sRGB output and color management on |
| Background | `<color attach="background" args={[boardVisualTokens.sceneBackground]}>` = `#62ddcc` (clear color, not tone-mapped); CSS behind the canvas `#55dcc8` (`GameScene.css`, `--color-canvas-deep`) |
| Lights | `hemisphereLight ['#fff8e2', '#9fd6c4', 1.8]` and `directionalLight position [8,14,7] intensity 1.7 color #fff8e8` (no target, no shadows). These are the only two lights. No fog. |
| Environment | `stations/CoinMaterialEnvironment.tsx`: `PMREMGenerator.fromScene(new RoomEnvironment())` applied **only** to the three coin materials (`stations/coinVisuals.ts`). |
| Context loss | `RendererLifecycleGuard` → permanent switch to the legacy board (no restore). |

### 3.3 Materials and unlit layers

- `MeshStandardMaterial` almost everywhere (foundation, rails, sockets, tile bodies,
  8 district surfaces with 512² procedural albedo + bump `DataTexture`s, pebble
  footers, center airport, dice, houses/hotels, flags, card decks, special tile parts).
- `MeshPhysicalMaterial`: coins only (clearcoat, envMap; bounds pinned by
  `coinVisuals.test.ts`: metalness 0.7–0.8, roughness 0.12–0.18, envMapIntensity 1–1.3,
  clearcoat ≥ 0.3).
- Unlit (`MeshBasicMaterial`, `toneMapped: false` in several): contact shadows
  (`fx/ContactShadow.tsx`), impact highlight, destination preview, SVG tile icons
  (`special/RaisedSvgTileIcon.tsx`), card-back icons, Troika text (derived,
  `forceSinglePass`), and characters (`SpriteMaterial`, `toneMapped: false`).
- `DiceContactShadowBatch` uses a raw `ShaderMaterial` writing `gl_FragColor`
  directly.
- `boardMaterialSpecs.ts` roughness/metalness per profile (e.g. `diceBody .16/.02`,
  `houseRoof .48/0`); several values are pinned by tests.

### 3.4 Draw-call breakdown of the mandatory `board-readability` fixture (227)

Reconstructed from code; matches the recorded 227 (and 199 without
buildings/flags, 216 while dice roll):

| Family | Draws | Waste |
| --- | --- | --- |
| Foundation 5 + frame rails 4 + socket instanced 2 | 11 | — |
| Tile bodies (2 colors) + surfaces (12 upper + 4 footer + 1 divider) | 19 | — |
| Impact highlight (transparent `DoubleSide` → 2 passes) | 2 | 1 |
| Tile name SDF texts | 36 | — |
| `RaisedSvgTileIcon`: 13 tiles × 2 meshes × 2 passes (transparent `DoubleSide` without `forceSinglePass`) | 52 | **26** |
| Jail 13 + Tax 14 + Start 4 + Parking 6 (non-instanced `RoundedBoxMesh` parts) | 37 | **≈ 27** |
| Center airport | 4 | — |
| Card decks 2 × (3 + icon × 2 passes) | 10 | 2 |
| Stations: bank 1 + coin finishes 3 + 8 outlined SDF labels × 2 | 20 | **16** (labels move to DOM in plan 03) |
| Characters 4 × (sprite + contact shadow) | 8 | — |
| 7 houses + 1 hotel × 3 draws each | 24 | (plan 05 instancing) |
| Ownership flags | 4 | — |
| **Total** | **227** | |

Visible dice add +17 while rolling and +18 once settled (8 draws per die: body,
6 face planes, pips instanced; plus contact shadows and result text).

Headroom against the hard limit (240) is 13. Nothing can be added before
recovery.

### 3.5 Diagnostics and tests

- `RendererDiagnostics` (in `GameScene.tsx`) runs only on localhost or with
  `?phase4-uat=1`. It reads `gl.info.render.calls`, but `toneMapping` and
  `shadows` are **hard-coded strings** (`'ACESFilmicToneMapping'`, `'contact'`).
- `gl.info` auto-resets on every `renderer.render()`; with a composer it would
  report only the last pass.
- No test asserts the 227 figure. Budget constants: `architecture/sceneBudget.ts`
  (`TARGET_DRAW_CALLS 210`, `STRESS_DRAW_CALL_LIMIT 240`, `TARGET_TRIANGLES 80_000`,
  `HARD_TRIANGLE_LIMIT 100_000`, anisotropy cap 8).
- Tests that pin values this plan will touch (update them with a stated reason):
  `board/phase25eVisualContracts.test.ts` and
  `board/architecture/tileVisualRegistry.test.ts` (`sceneBackground #62ddcc` and
  other tokens), `buildings/buildingFacadeTextures.test.ts` (houseWall/hotel/houseRoof
  specs), `dice/diceGeometry.test.ts` (`diceBody {0.16, 0.02}`, dice cost 16 draws /
  13,296 triangles), `stations/coinVisuals.test.ts`, `characters/characterSpriteMaterial.test.ts`,
  `board/tiles/TileImpactHighlightBatch.test.ts`, `board/tiles/sdfTextConfig.test.ts`
  (reads source text of `PlayerStationLayer`, `DiceLayer`, `PhysicalCardDecks`).
  `GameScene.test.tsx` only covers context loss; Canvas props and lights are untested.

### 3.6 Other relevant facts

- `board/tiles/TileBodyBatch.tsx` rebuilds its meshes and materials on every hover or
  selection change (`useMemo` deps include `hoveredTileId`/`selectedTileId`). With
  shadows enabled this would also force shader recompiles.
- Stations (`stations/PlayerStationLayer.tsx`, anchors in `stations/stationWorld.ts`,
  about ±11.91 from center) have no ground: coins float at y ≥ 0.57 over the void.
  The bank treasury (`BANK_WORLD_ANCHOR [0.55, 0, 3.18]`) is mostly buried under the
  center field (field top y 0.605; treasury y 0–0.3; coins 0.36–0.58).
- Demand rendering: 14 `useFrame` hooks, none with priority; many animations add
  `clock.getDelta()`, which can jump on the first frame after idle (pre-existing).
- Suspense or errors inside the Canvas escape outward: a suspended loader hides the
  whole board behind `Board.tsx`'s fallback; an error permanently switches to the
  legacy board.
- Packaged Electron CSP (`apps/desktop/src/rendererContentType.ts`):
  `default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:;`
  and a MIME map without `.hdr/.glb/.wasm`. A procedural environment avoids both.
- Dependencies verified 2026-09-29: `three 0.185.1`, `@react-three/fiber 9.7.0`.
  `@react-three/postprocessing@3.1.3` requires R3F ≥ 9.7.0 and `postprocessing ^6.36`;
  `postprocessing@6.39.5` requires `three >= 0.168.0 < 0.187.0`; `n8ao@2.0.1` comes with
  it. In three 0.185, `PCFSoftShadowMap` is deprecated and falls back to
  `PCFShadowMap` (warning in `WebGLShadowMap.js`); `NeutralToneMapping` and
  `AgXToneMapping` exist; `scene.environmentIntensity` and `scene.environmentRotation`
  exist; `RoomEnvironment`, `HDRLoader`, `GLTFLoader` are available in `three/examples`.

---

## 4. Purpose

1. Deliver the largest visible quality jump per unit of work: light, shadow,
   material response, and a grounded tabletop.
2. Do it inside the existing performance contract by paying down draw-call waste
   first and tiering everything expensive.
3. Leave the renderer measurable (correct diagnostics, benchmark) so plan 05 can
   add assets with confidence.

---

## 5. Desired Outcome

### 5.1 Player-facing

- The board sits directly on a light oak table; there is no teal void at any
  aspect ratio.
- Houses, hotels, card decks, coin piles, and the board itself cast soft shadows
  (balanced/high); dice and coins show glossy highlights from a studio light.
- Box-like objects show clear form: the lit side, the shaded side, the top.
- Colors look like the approved palette (no ACES hue shift toward orange or
  washed-out pastels).
- Tile names are exactly as readable as before (or better).
- Each player's coin pile rests in a tray tinted with the player's color.
- On weak devices the game runs smoothly in `low`, which still looks better than
  today (table, grounding decal, tone mapping, environment light).

### 5.2 Engineering

- Main pass ≤ 180 draws in `board-readability` after this plan's additions (≤ 165 once
  plan 03 T03.6 has removed the station labels).
- `RenderQualityConfig` drives every expensive feature; `graphicsQuality` setting persisted.
- Diagnostics report real renderer state and a main/shadow/post breakdown.
- Benchmark mode gives median/p95 frame times per scenario.
- No new asset types, no CSP change, no WebAssembly.

### 5.3 Success metrics (gate G2)

| Metric | Target |
| --- | --- |
| Main-pass draws, `board-readability` (all tiers) | ≤ 180 with this plan's additions (≤ 165 after plan 03 T03.6); never ≥ 210 |
| Shadow-pass draws (balanced/high) | ≤ 30 |
| Post passes (high) | ≤ 6 full-screen passes |
| Triangles (main pass) | ≤ 80k target, < 100k hard |
| `stress` scenario, 1920×1080, reference integrated GPU (Intel Iris Xe or Apple M1 class) | `balanced` median ≥ 60 FPS, p95 frame ≤ 20 ms; `low` median ≥ 60 FPS |
| `high` on the same device | Measured and recorded; `auto` never selects `high` |
| Tile text readability | No regression in a side-by-side review of the 8 regression names (`Cà Mau`, `Buôn Ma Thuột`, `Đà Nẵng`, `Phú Quốc`, `Công Ty Nước`, `Khí Vận`, `Cơ Hội`, `Landmark 81`) at 1280×720 |
| WebGL fallback, reduced motion, 4 speeds, reconnect snap | Unchanged behavior (existing tests + manual) |

---

## 6. Scope

**In scope**

- Renderer configuration, tone mapping, environment, lights, shadows.
- Light oak tabletop, board ground-shadow decal, player trays, bank treasury grounding.
- Material tuning (no geometry changes except merges for budget recovery and trays).
- Quality tiers and the setting (with a minimal Settings control; plan 04 restyles it).
- Post-processing for `high`.
- Budget recovery tasks, diagnostics fixes, benchmark mode.
- `TileBodyBatch` hover/selection churn fix.
- Scene palette harmonization with `OTB_PALETTE` (after G1).

**Out of scope**

- New models, houses, landmarks, standees, props (plan 05).
- Camera type/angle/zoom changes (DR-05).
- HUD and station label removal (plan 03 removes the labels; this plan only
  accounts for the saved draws).
- New animations, particles, or looping ambient effects.
- File-based HDR/EXR environments, Draco/KTX2/Meshopt, CSP changes.
- WebGL context restore (listed as an optional follow-up in §16).

---

## 7. Constraints and Invariants

1. Fixed orthographic camera; `frameloop="demand"`; no permanent RAF loop; every
   async completion (PMREM ready, texture ready, tier switch) calls `invalidate()`.
2. `BoardRenderModel` is the only data input to the scene; no gameplay reads.
3. Neutral property chassis; 8 district material/texture pairs by `surfaceKey`;
   district accents never encode ownership; surface batch follows the
   tile-motion matrix (`tileMatrix.ts`).
4. WebGL fallback and the 40 semantic tile buttons unchanged. Optional layers
   (post, environment, trays) must fail soft: a local `<Suspense fallback={null}>`
   and a local error boundary inside the Canvas; never escalate to the legacy switch
   for an optional effect.
5. Reduced motion: every new visual is static (no animated light, no animated
   post effect). Speeds and skip are unaffected.
6. Budgets are never raised. The budget definitions in §8.9 add accounting for
   passes that did not exist; they do not relax the main-pass limits.
7. No second renderer, no second presentation queue, no server "asset ready" signal.
8. Packaged Electron CSP and MIME map unchanged.
9. Unlit layers that previously opted out of tone mapping must still read the same
   (text, icons, sprites, contact shadows); verify with captures.
10. Keep `coinVisuals.test.ts` bounds or update them with a recorded reason.

---

## 8. Design Specification

### 8.1 Look target

"Toy product photo on a warm table": one warm key light from the screen's left and
slightly above, soft shadows falling toward the screen's right/lower-right, a
low-intensity warm fill, a cool rim light from behind for edge separation, and
glossy highlights from a studio environment. Colors stay true to the palette.

Camera basis (derived from `lookAt` with camera direction `(1, 1.25, 1)`):
screen-right ≈ world `(+1, 0, −1)/√2`; screen-up on the ground plane ≈ world
`(−1, 0, −1)/√2`. Therefore the visible vertical faces of a box are its **+X
face** (screen lower-right side) and its **+Z face** (screen lower-left side).

### 8.2 Light rig (starting values; tune at G2, record final values in §16)

| Light | Type | Position / direction | Color | Intensity | Shadows |
| --- | --- | --- | --- | --- | --- |
| Key | `DirectionalLight` | position `(-9, 16, 5)`, target `(0, 0, 0)` (screen-left, slightly up; lights the +Z face and tops, leaves the +X face shaded) | `#FFF1DE` (warm) | 2.2 (tune) | balanced/high |
| Fill | `HemisphereLight` | sky/ground | sky `#FFF8EC`, ground `#DDBB8F` (light oak table bounce) | 0.55 (tune) | — |
| Rim | `DirectionalLight` | position `(8, 10, -12)` (behind, screen upper-right) | `#DDE9FF` (cool) | 0.6 (tune) | — |

Store these in `game/scene/render/lighting/lightRigSpec.ts` (typed constants,
per-tier overrides) so tests and docs refer to one source.

Key-light shadow settings (balanced/high):

- Orthographic shadow camera covering the board and stations: `left/right/top/bottom
  = ±15`, `near 1`, `far 60` (fit to the rig; verify no clipping of stations).
- `mapSize` 1024 (balanced) / 2048 (high); `shadow.bias -0.0004`,
  `shadow.normalBias 0.02`, `shadow.radius 3` (tune; PCF).
- Canvas `shadows="percentage"` (maps to `PCFShadowMap`); do not use boolean `true`
  (would select the deprecated `PCFSoftShadowMap`). Verified in the installed
  `@react-three/fiber` 9.7.0 (`dist/events-*.esm.js`): `percentage` → `PCFShadowMap`,
  `soft` → `PCFSoftShadowMap`, `variance` → `VSMShadowMap`; `true` → `PCFSoftShadowMap`.
  Re-check after any R3F upgrade.

### 8.3 Tone mapping and color

- Use `THREE.NeutralToneMapping` (Khronos PBR Neutral), exposure 1.0 (tune 0.95–1.1).
- Rationale: it is near-identity for base colors below its compression knee, which
  keeps scene colors matching the palette and minimizes the difference for
  elements that were `toneMapped: false`.
- T02.8 produces a comparison set (ACES / AgX / Neutral) for G2; the default is
  Neutral unless G2 decides otherwise.
- Output stays sRGB; textures keep their current color spaces (albedo sRGB,
  bump `NoColorSpace`).

### 8.4 Studio environment (image-based lighting)

- `createStudioEnvironmentScene()`: a procedural room like `RoomEnvironment`,
  with a large warm softbox aligned with the key light, a small cool strip
  aligned with the rim, a warm floor bounce, and a neutral gray ceiling. Built
  once per renderer, converted with `PMREMGenerator.fromScene(scene, 0.04)`.
- `scene.environment = studioTexture`; `scene.environmentIntensity` per tier
  (low 0.6, balanced 0.7, high 0.8; tune).
- Coins: reuse the same PMREM texture through `applyCoinEnvironmentMap` (one
  PMREM instead of two). Keep their `envMapIntensity` inside the test bounds or
  update the bounds with a recorded reason.
- No `scene.background` from the environment (the table covers the view).
- Dispose the PMREM render target on renderer disposal; invalidate after
  assignment.

### 8.5 Tabletop, grounding, trays

Decision OD-02-4 (= OD-01-2 B, 2026-09-30): **light oak table only, no play mat.**

| Element | Spec | Tier |
| --- | --- | --- |
| Table | `PlaneGeometry` at `y = -0.002`, size computed to cover the orthographic frustum for aspects 1.0–2.4 with margin (start 120 × 120). `MeshStandardMaterial` with procedural **light oak** albedo (`tableTextures.ts`: base `--otb-table-oak #DDBB8F`, grain and plank seams `--otb-table-oak-dark #B08A5F`, planks about 1.6 world units wide, subtle low-frequency color variation so the surface never looks flat or tiled), roughness 0.62, `receiveShadow`. Texture 1024² (512² in `low`), `RepeatWrapping`, anisotropy via `getTileTextureAnisotropy`. Keep grain contrast low so the table stays calm behind the board and the HUD. | all |
| Board ground shadow decal | Rounded-rect radial gradient (`DataTexture` 256²), about 1.25 × the foundation footprint (20.04), `MeshBasicMaterial` black, transparent, `depthWrite: false`, `renderOrder -1`, `toneMapped: false`. Opacity 0.35 in `low`, 0.18 when real shadows are on. | all |
| Player trays | One `InstancedMesh` of rounded shallow trays (about 3.4 × 0.14 × 2.4) under each station anchor at `y = 0`; body dark lacquer `#3A2418`, rim tinted with the player's display color via `instanceColor` (or a second instanced rim mesh). Coin piles move down to rest on the tray top. | all |
| Bank treasury | Raise the treasury group so it rests on the center field (top `y 0.605`), with a small lacquer tray; keep `BANK_WORLD_ANCHOR` x/z; make sure the coin-flight origin follows. | all |
| DOM background | Add a `--color-scene-backdrop` token (table mid tone, from `OTB_PALETTE`) in `tokens/colors.css` and use it for `.game-board` (`BoardShell.css`), `.game-scene` (`GameScene.css`) and the legacy `.Board` (`Board.css`) instead of `--color-canvas-deep` (so there is no flash before the first frame); `boardVisualTokens.sceneBackground` = the same value (update pinned tests). | all |

Anchor rule: `MoneyTransferLayer` coin flights and `SCENE_FIT_POINTS` use the
station anchors. If the tray changes the pile height, update the anchors in one
place (`stationWorld.ts`) and keep `stationWorld.test.ts` and
`boardRenderModel.test.ts` green.

### 8.6 Material pass (no new geometry)

| Target | Change |
| --- | --- |
| Dice body | `MeshPhysicalMaterial`, clearcoat 0.6, clearcoatRoughness 0.2, roughness 0.28, metalness 0 (update `diceGeometry.test.ts`). Pips: ink-900 at roughness 0.5. |
| House/hotel roofs and hotel crown (owner color) | Toy plastic: roughness 0.35 (MeshStandard), optionally clearcoat 0.3 if cost is negligible (update `buildingFacadeTextures.test.ts`). |
| Board frame rails, foundation accent | Lacquer: color from the palette (after G1), roughness 0.35. |
| Card decks | Paper: roughness 0.85, metalness 0. |
| District surfaces | Keep textures and keys. Adjust `bumpScale` only if shadows reveal acne. Color harmonization in T02.16. |
| White footers/tile surfaces | Keep readable: if the environment and key push them to clipped white, lower their roughness contribution or tint to `#FBF7EF`; verify text contrast in captures. |

### 8.7 Post-processing (high tier only)

- Library: `@react-three/postprocessing` 3.1.x with `postprocessing` 6.39.x (pinned
  exact versions). Load it only for `high` via `React.lazy(() => import('./post/ScenePostEffects'))`
  inside a local `<Suspense fallback={null}>`, so other tiers never download it.
- Chain, in order:
  1. `EffectComposer` with `multisampling={4}` (WebGL2) and `enableNormalPass` only if N8AO needs it.
  2. **N8AO**: half resolution, `aoRadius` ≈ 0.8 world units, `distanceFalloff` ≈ 0.6,
     `intensity` 1.2–2.0, warm dark AO color. Verify orthographic-camera support
     first; if unsupported, drop AO from the chain (do not add a temporal AO).
  3. **Bloom** (`mipmapBlur`, `luminanceThreshold` 0.9, `intensity` 0.15–0.3) for
     truly bright highlights only (coins, gold, later lighthouse lamp/landmarks).
  4. **Vignette** (offset 0.3, darkness 0.3).
  5. **ToneMapping** effect using Neutral as the final step; set the renderer's
     `toneMapping` to `NoToneMapping` in `high` to avoid double tone mapping.
- No temporal effects (TAA, temporally accumulated AO, motion blur): demand
  rendering stops after the last invalidate, so they would never converge.
- The composer follows size and dpr changes; verify after window resize and after a
  tier switch.

### 8.8 Quality tiers

`graphicsQuality: 'auto' | 'high' | 'balanced' | 'low'` (default `'auto'`), stored
in `GameSettings` (`apps/client/src/settings/types.ts`, `defaults.ts`,
`normalizeSettings`). Invalid values normalize to `'auto'`.

| Feature | low | balanced | high |
| --- | --- | --- | --- |
| `dpr` | `[1, 1.25]` | `[1.25, 1.5]` (current) | `[1.25, 2]` |
| Tone mapping | Neutral (renderer) | Neutral (renderer) | Neutral (post) |
| Studio environment | on, 0.6 | on, 0.7 | on, 0.8 |
| Key-light shadows | off | PCF 1024 | PCF 2048 |
| Contact shadows under buildings | on | off (real shadows) | off |
| Board ground decal | 0.35 | 0.18 | 0.18 |
| Post-processing | none | none | AO + bloom + vignette + MSAA |
| Table texture | 512² | 1024² | 1024² + roughness variation |
| DOM paper grain (plan 01) | off | on | on |

`auto` resolution (pure function `resolveRenderQuality(setting, probe)` in
`game/scene/render/renderQuality.ts`):

- `low` when any of: coarse pointer and the larger screen side ≤ 1024 CSS px;
  `MAX_TEXTURE_SIZE < 8192`; `navigator.hardwareConcurrency <= 4`; the page runs
  in a mobile browser profile (touch + no hover).
- otherwise `balanced`.
- `auto` never selects `high` (opt-in, because high-tier render targets add about
  100 MB of GPU memory at 1920×1080 × dpr 1.5 and raise context-loss risk).

Settings UI (minimal in this plan): a section headed "Đồ họa" containing a labeled
`<select>` or plan 01 `SegmentedControl` whose accessible name is exactly
**"Chất lượng đồ họa"**, with options "Tự động", "Cao", "Cân bằng", "Thấp" and a
one-line hint "Chất lượng Cao cần card đồ họa mạnh." Plan 04 restyles the panel and
keeps these names.

Switching tiers at runtime must work without reload: Canvas `dpr`/`shadows`
props update, materials get `needsUpdate` where required, the post chain mounts or
unmounts, and the scene invalidates.

### 8.9 Budget plan (definitions and limits)

Definitions (implemented in diagnostics):

- **Main pass**: draw calls issued while rendering the scene color pass (the
  quantity the historical 210/240 limits measured).
- **Shadow pass**: draw calls issued while rendering shadow maps.
- **Post passes**: full-screen passes of the composer.

| Tier | Main pass (`board-readability`) | Main pass (`stress`) | Shadow pass | Post passes |
| --- | --- | --- | --- | --- |
| low | ≤ 210 target, < 240 hard | < 240 | 0 | 0 |
| balanced | ≤ 210 target, < 240 hard | < 240 | ≤ 30 | 0 |
| high | ≤ 210 target, < 240 hard | < 240 | ≤ 30 | ≤ 6 |

Recovery tasks. BR-1, BR-2 and BR-5 are mandatory before any visual addition in this
plan. BR-3 is delivered by plan 03 (T03.6) and does **not** block this plan: without it
the fixture still stays under the 210 target (about 175 after additions). BR-4 only
affects fixtures where dice are visible (`stress`, `dice-contact-shadows`, live rolls).

| ID | Change | Expected saving |
| --- | --- | --- |
| BR-1 | `RaisedSvgTileIcon` backing/face: `side: FrontSide` (camera always sees the front) or `forceSinglePass = true` | −26 |
| BR-2 | Special tile parts (jail, tax, start, parking): merge static parts per material with `BufferGeometryUtils.mergeGeometries` (or vertex colors + one material) | about −27 |
| BR-3 | Station SDF labels and `StationMoneyAmounts` removed (plan 03 moves them to DOM) | −16 or more |
| BR-4 | Dice: merge the 6 face planes into the body (baked face color/vertex colors) and instance all 42 pips in one mesh for both dice | about −12 while dice are visible |
| BR-5 | Impact highlight and card-back icons: `FrontSide` | −3 |

Expected `board-readability` main pass (dice not visible in this fixture, so BR-4 does
not count here): 227 − 26 (BR-1) − 27 (BR-2) − 3 (BR-5) = 171; plus this plan's
additions (table, decal, trays, bank tray) ≈ +4 → about 175; after plan 03's BR-3
(−16) about 160. The remaining ~50 draws of headroom under the 210 target are reserved
for plan 05, which therefore depends on plan 03 T03.6. Record in the §16 budget table
whether BR-3 had landed at the time of each measurement.

### 8.10 Diagnostics and benchmark

- `RendererDiagnostics` reports actual values: `gl.toneMapping` (name),
  `gl.shadowMap.enabled` and type, `scene.environment` present, tier, effective dpr,
  main/shadow/post draw calls, triangles.
- Counting: set `gl.info.autoReset = false`; reset at the start of each rendered
  frame (a `useFrame` with a very low priority, before any render) and read after
  the final pass. Shadow-pass calls: measure with `onBeforeShadow`/`onAfterShadow`-style
  instrumentation or by differencing a frame with shadows off (document the method).
- **Benchmark mode** in the harness (`?phase4-uat=1&scenario=stress&benchmark=10`):
  replays the scenario in a loop while calling `invalidate()` every frame for N
  seconds; records rAF intervals; publishes median/p95 FPS and frame time, tier, dpr,
  and draw calls to `[data-testid="renderer-benchmark"]` and
  `window.__OWN_THE_BLOCK_RENDERER_BENCHMARK__`. The capture tool (plan 01) saves the
  JSON next to screenshots.

---

## 9. Technical Approach

New folder `apps/client/src/game/scene/render/`:

| File | Responsibility |
| --- | --- |
| `renderQuality.ts` | Types `GraphicsQualitySetting`, `RenderTier`, `RenderQualityConfig`; `resolveRenderQuality(setting, probe)`; `probeRenderCapabilities(gl)`; per-tier config table (§8.8). Pure + unit-tested. |
| `lighting/lightRigSpec.ts` | Light constants and per-tier overrides (§8.2). |
| `lighting/SceneLightRig.tsx` | Key/fill/rim lights; shadow camera setup; `invalidate()` after changes. |
| `environment/createStudioEnvironmentScene.ts` | Procedural studio scene (§8.4). |
| `environment/StudioEnvironment.tsx` | PMREM generation, `scene.environment`, intensity, coin env sharing, disposal. Replaces `stations/CoinMaterialEnvironment.tsx` (keep the export name as a thin wrapper if tests import it). |
| `table/tableTextures.ts` | Deterministic procedural light oak `DataTexture` generator (albedo + roughness variation) (seeded; sizes per tier). |
| `table/Tabletop.tsx` | Table mesh. |
| `table/BoardGroundShadow.tsx` | Ground decal. |
| `post/ScenePostEffects.tsx` | Lazy high-tier chain (§8.7). |
| `diagnostics/rendererInfo.ts` | Counting helpers, tone mapping name mapping. |
| `OptionalSceneLayer.tsx` | Local error boundary + Suspense for optional layers (logs one warning, renders nothing on failure). |

Changes to existing files:

- `GameScene.tsx`: read `useSettings().settings.graphicsQuality` (the hook returns
  `{ settings, updateSettings, resetSettings }`, see `settings/selectors.ts` and
  `settings/SettingsContext.ts`) → `resolveRenderQuality` →
  Canvas `dpr`, `shadows`, `gl.toneMapping`, children (`SceneLightRig`,
  `StudioEnvironment`, `Tabletop`, `BoardGroundShadow`, optional post). Remove the two
  inline lights and `CoinMaterialEnvironment`.
- `stations/PlayerStationLayer.tsx` + new `stations/PlayerTrays.tsx`: trays and grounded
  piles; bank treasury height.
- `special/RaisedSvgTileIcon.tsx`, special tile components (jail/tax/start/parking),
  `dice/*`, `board/tiles/TileImpactHighlightBatch.tsx`, `cards/PhysicalCardDecks.tsx`:
  budget recovery.
- `board/tiles/TileBodyBatch.tsx`: stable meshes/materials; hover/selected via
  `instanceColor` (or a tiny overlay batch), preserving the chassis hover/selected colors.
- `board/boardVisualTokens.ts`, `board/materials/boardMaterialSpecs.ts`: new values
  (with test updates).
- `settings/*`: `graphicsQuality`.
- `dev/phase4-uat/Phase4UatHarness.tsx`: benchmark mode.

Dependencies to add (T02.15 only): `@react-three/postprocessing@3.1.3` and
`postprocessing@6.39.5` (exact pins; confirm current patch versions at install time and
record them). Do not add `@react-three/drei` (it would pull many transitive packages,
including a second `troika-three-text`).

---

## 10. Execution Guide

### T02.0 — Preflight and baseline measurement

1. Confirm plan 01 T01.1 and T01.2 are merged (harness URL params, readiness marker,
   `pnpm visual:capture`). If not, implement those two tasks first exactly as written in
   plan 01, on their own branch, and merge them.
2. Branch, read the docs listed in the README handoff protocol plus
   `Client/game-board.instruction.md`.
3. Run the common test commands; record the baseline.
4. With the harness, record draw calls/triangles for `stations-4`, `board-readability`,
   `stress`, `dice-contact-shadows` at 1920×1080 and 1280×720 (§16 budget table).

**Accept when:** baseline table filled; numbers match §3.4 within ±2 (explain differences).

### T02.1 — Diagnostics correctness

1. Implement `rendererInfo.ts` counting and real state reporting (§8.10).
2. Unit tests for helpers (tone mapping names, reset/accumulate logic with a fake renderer).

**Accept when:** diagnostics show real values; counts unchanged vs T02.0 for the current renderer.

### T02.2 — Benchmark mode

1. Implement `benchmark=<seconds>` in the harness (§8.10).
2. Record baseline FPS for `stress` and `board-readability` (current renderer).

**Accept when:** benchmark JSON is produced and saved with the capture tool.

### T02.3 — Budget recovery BR-1 and BR-5

1. Switch the icon/highlight/card-icon materials to single-pass rendering.
2. Verify visually (captures of all 13 icon tiles and card decks).
3. Update `TileImpactHighlightBatch.test.ts` and `specialVisualContracts.test.tsx` if they
   assert `DoubleSide`.

**Accept when:** `board-readability` main pass ≈ 198 (−29); no visible difference.

### T02.4 — Budget recovery BR-2

1. Merge static special-tile parts per material; keep the named groups needed by
   `specialVisualContracts.test.tsx` (or update the test with the new names).
2. Captures of jail, tax, start, parking tiles before/after.

**Accept when:** about −27 draws; no visible difference.

### T02.5 — Budget recovery BR-4 (dice)

1. Merge face planes into the body; instance pips for both dice.
2. Keep dice timings, orientation, and result semantics (Phase 4 freeze).
3. Update `diceGeometry.test.ts` (draw cost and triangles).

**Accept when:** dice captures match; dice draw cost ≤ 4 while visible.

### T02.6 — `TileBodyBatch` hover/selection churn

1. Stable meshes/materials; hover/selected through per-instance color.
2. Tests: hover/selection no longer creates new materials (spy on material
   constructor or compare instances).

**Accept when:** hover produces no material/geometry allocations; visuals unchanged.

### T02.7 — Render quality model and setting

1. `renderQuality.ts` + tests (every tier, `auto` heuristics, invalid values).
2. `graphicsQuality` in `settings/types.ts` (`GameSettings`), `settings/defaults.ts`
   (default + `normalizeSettings`), and the hard-coded default object in
   `settings/SettingsContext.ts`; tests in `settings/settings.test.ts`; minimal Settings
   control named "Chất lượng đồ họa" (§8.8).

**Accept when:** tier switches at runtime without reload (manual), tests green.

### T02.8 — Tone mapping

1. Neutral tone mapping for all tiers (renderer-level for low/balanced).
2. Produce ACES / AgX / Neutral comparison captures (`evidence/02/tonemap-*`).

**Accept when:** comparison set committed; Neutral active by default.

### T02.9 — Studio environment

1. Implement §8.4; share with coins; remove the separate coin PMREM.
2. Update `coinVisuals.test.ts` only if needed.

**Accept when:** `scene.environment` present in diagnostics; coins still pass tests.

### T02.10 — Light rig

1. Implement §8.2 via `lightRigSpec.ts` + `SceneLightRig.tsx`; remove inline lights.
2. Captures showing the lit/shaded side faces on houses, hotel, jail, dice.

**Accept when:** form reads clearly; tile text readability unchanged (8 names).

### T02.11 — Tabletop (light oak) and ground decal

1. Implement `tableTextures.ts` (deterministic; unit-test sizes, color space,
   determinism by seed), `Tabletop.tsx`, `BoardGroundShadow.tsx`.
2. Test: the table covers the orthographic frustum for aspects 1.0, 1.33, 1.6, 1.78,
   2.0, 2.4 (use `cameraMath` helpers).
3. Update `sceneBackground` and `.game-scene` background; update pinned tests.

**Accept when:** no teal is visible at any standard viewport, including 21:9
(2560×1080 capture).

### T02.12 — Player trays and bank treasury

1. Instanced trays with player-color rims; grounded coin piles; bank treasury on
   the field.
2. Keep coin-flight endpoints correct (watch the `rent` and `pass-go` scenarios).

**Accept when:** coin flights start/end on the trays; `stationWorld.test.ts` and
`boardRenderModel.test.ts` green.

### T02.13 — Shadows (balanced/high)

1. Canvas `shadows="percentage"` per tier; key light shadow camera and map size.
2. `castShadow`: board foundation group, card decks, houses/hotels, coin piles,
   trays, dice (high only if the shadow-pass budget allows). `receiveShadow`: table,
   tile surface batches, footers, center field, top deck.
3. Disable building contact shadows when real shadows are on.
4. Check acne/peter-panning on bump-mapped district textures; tune bias.

**Accept when:** shadow-pass ≤ 30 draws; no acne at 1280×720/1920×1080; no
double shadows.

### T02.14 — Material pass

1. Apply §8.6; update pinned tests with reasons.

**Accept when:** captures approved in the G2 package; tests green.

### T02.15 — Post-processing (high)

1. Add the pinned dependencies; implement `ScenePostEffects.tsx` lazily.
2. Verify N8AO with the orthographic camera; if unsupported, ship bloom + vignette +
   MSAA only and record the decision.
3. Diagnostics integration (post passes count).
4. Verify resize, dpr change, tier switch, context loss (still falls back safely).

**Accept when:** high-tier captures; post passes ≤ 6; benchmark recorded; other tiers
never load the post chunk (check the network panel or build chunks).

### T02.16 — Scene palette harmonization (after G1)

1. Map brand-like scene tokens (frame, rails, foundation accent, center field, bank,
   trays, table) to `OTB_PALETTE`.
2. Harmonize district descriptor colors in `tileVisualRegistry.ts` with plan 01 §8.4
   hues **without** changing surface keys or textures' structure; keep the footer
   white and text readable.
3. Update pinned token tests with reasons.

**Accept when:** side-by-side captures v1 vs v2 approved at G2.

### T02.17 — Gate G2 package

1. Capture every tier × viewport (§8 of README) × fixtures (`stations-4`,
   `board-readability`, `stress`, `hotel`, `rent`, `dice-contact-shadows`,
   `reduced-motion`) plus the legacy fallback.
2. Benchmark JSON per tier for `stress` and `board-readability` on the reference
   device; record the device model, GPU, OS, browser/Electron version.
3. Fill the budget table and readability review in §16; request human review.

**Accept when:** G2 verdict recorded by a human.

### T02.18 — Documentation

Update (same branch):

- `Client/game-board.instruction.md`: lighting rig, Neutral tone mapping, environment,
  shadows, tabletop/trays, quality tiers, budget definitions, diagnostics and benchmark.
- `CLAUDE.md`: no invariant text changes are needed (camera and frameloop unchanged);
  if the renderer description there mentions ACES or shadows, update it.
- Supersession notes (README §6): `04_PHASE_4_GAMEPLAY_ACTIONS.md` §20.2,
  `05_PHASE_5_GAME_FEEL_AUDIO_EFFECTS.md` §3, `05A_PHASE_5_0_AUDIT_AND_SCOPE.md` §12,
  `06_PHASE_6_POLISH_DISTRIBUTION.md` §4, `06A_PHASE_6_0_RELEASE_READINESS_AUDIT.md` renderer row.
- `testcase/client-state-sync-motion-and-accessibility.md`: rows for quality
  resolution `[CLIENT][AUTOMATED]`, table coverage `[CLIENT][AUTOMATED]`, diagnostics
  counting `[CLIENT][AUTOMATED]`, tier visual review `[MANUAL-E2E]`, benchmark on the
  reference device `[MANUAL-E2E]`.
- Settings documentation (wherever `GameSettings` is described in `Client/`): new
  `graphicsQuality` field.

---

## 11. Testing and Verification

| Check | Type | Where |
| --- | --- | --- |
| Quality resolution per tier and `auto` heuristics | AUTOMATED | `render/renderQuality.test.ts` |
| Settings normalization of `graphicsQuality` | AUTOMATED | `settings/settings.test.ts` |
| Light rig spec invariants (key position side, intensities > 0, shadow only on key) | AUTOMATED | `render/lighting/lightRigSpec.test.ts` |
| Table texture determinism/size/color space; frustum coverage | AUTOMATED | `render/table/*.test.ts` |
| Diagnostics counting helpers | AUTOMATED | `render/diagnostics/rendererInfo.test.ts` |
| Hover/selection allocation-free | AUTOMATED | new `board/tiles/TileBodyBatch.test.tsx` (no test file exists today) |
| Budget recovery structure (single-pass materials, merged parts, dice cost) | AUTOMATED | updated existing tests |
| Coin-flight endpoints/trays | AUTOMATED | `stationWorld.test.ts`, `boardRenderModel.test.ts` |
| Legacy fallback, reduced motion, e2e | AUTOMATED | existing suites, `pnpm test:e2e:mobile` |
| Draw calls per tier/fixture | MANUAL (measured) | harness diagnostics + §16 table |
| FPS on reference device | MANUAL (measured) | benchmark mode + §16 |
| Visual quality and text readability | MANUAL | G2 captures |

jsdom has no WebGL: keep logic in pure modules and test components by rendered
element names/props as the existing scene tests do.

---

## 12. Performance and Memory Notes

- Shadow map 2048² depth ≈ 16 MB; 1024² ≈ 4 MB.
- High-tier composer targets at 1920×1080 × dpr 1.5 (2880×1620) in HalfFloat RGBA ≈ 37 MB
  each; with MSAA and AO buffers expect about 100 MB extra GPU memory. This is why
  `auto` never picks `high`.
- PMREM studio environment: one cube UV texture (a few MB).
- Table textures: 1024² RGBA ≈ 4 MB + mips.

---

## 13. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Draw budget exceeded | Recovery tasks first; per-tier accounting; shadow casters limited; instancing. |
| Tile text harder to read under new light | Keep footers light; text stays unlit dark; 8-name readability review at 1280×720; adjust footer tint/roughness. |
| Shadow acne on bump-mapped districts | Bias/normalBias tuning; receive shadows on surfaces with slightly higher normalBias; fall back to no-receive for footers if needed. |
| Unlit layers look different after tone mapping change | Neutral curve; capture comparison; adjust exposure. |
| Characters (sprites) cannot cast shadows and look floaty next to shadowed houses | Keep their contact shadows; plan 05 standees add real shadows. |
| GPU memory/context loss on weak GPUs | `auto` never selects `high`; `low` on mobile; optional context-restore follow-up. |
| Post-processing peer range (`three < 0.187`) blocks a future three upgrade | Pin versions; note in docs; upgrade both together. |
| N8AO orthographic incompatibility | Verify first; drop AO rather than add temporal AO. |
| Delta-based animations jump after idle (pre-existing) | Out of scope; note in §16 if observed during benchmark. |
| Optional layer error switches to legacy board | `OptionalSceneLayer` local boundary. |
| Pinned token/material tests | Update with explicit reasons in the commit message and §16. |

---

## 14. Decisions

Answered by the product owner on 2026-09-30; binding for implementation.

| ID | Question | Options considered | Decision (product owner, 2026-09-30) |
| --- | --- | --- | --- |
| OD-02-1 | Default tier for packaged desktop | `balanced` via `auto` / `high` | **DECIDED: `auto`** (resolves to `balanced` on desktop; never auto-selects `high`); revisit only with benchmark data |
| OD-02-2 | Tone mapping | Neutral / AgX / ACES | **DECIDED: Neutral** (`THREE.NeutralToneMapping`); T02.8 still produces the comparison set as evidence |
| OD-02-3 | Post library | pmndrs `postprocessing` / three `examples/jsm/postprocessing` | **DECIDED: pmndrs** (`@react-three/postprocessing` + `postprocessing`, pinned, high tier only, lazy-loaded) |
| OD-02-4 | Table look | From OD-01-2 (A: oak + jade felt; B: light oak) | **DECIDED: B — light oak table only, no play mat** |
| OD-02-5 | Player tray style | Lacquer tray with player-color rim / cloth mat in player color | **DECIDED: Lacquer tray with player-color rim** |
| OD-02-6 | WebGL context restore instead of permanent legacy switch | Add in this plan / later | **DECIDED: Later** (separate small plan; not in this plan) |
| OD-02-7 | File-based HDR environment | Never / later | **DECIDED: No**, unless the procedural studio environment fails the G2 review; then raise it again with the product owner |

---

## 15. Definition of Done

- [x] T02.0–T02.18 complete and logged in §16. _(T02.17 is complete as a package; the verdict is a separate line below.)_
- [x] Budget table (§16) shows every tier within §8.9 limits for `board-readability`
  and `stress` (main ≤ 177, shadow ≤ 25, post passes 3, triangles ≤ 69k).
- [ ] Benchmark on the reference device recorded; `balanced` and `low` meet §5.3. _(Recorded only on an
  Intel UHD 630-class GPU, which is not the reference device; `balanced` does not reach 60 FPS there, see §16.)_
- [x] G2 verdict recorded (tvghung, 01/10/2026, Approved; written by the agent at the product owner's request).
- [ ] README §9 commands green (including `pnpm desktop:package` and a packaged run
  of the high tier to prove the lazy post chunk loads under `app://`). _(`pnpm typecheck`, `pnpm lint`,
  `pnpm test` (client 866 tests) and `pnpm build` pass; `pnpm desktop:package`, the WebKit captures,
  `pnpm test:e2e:mobile` and the PostgreSQL checks were not run in this environment: no Electron binary,
  Playwright browsers or managed PostgreSQL were downloaded.)_
- [x] Docs updated (§T02.18).

---

## 16. Progress Log

| Date | Task | Commit | Evidence | Result / notes |
| --- | --- | --- | --- | --- |
| 2026-09-30 | T02.0 T02.1 | 61ba495 | `evidence/02/baseline-measure` | Diagnostics count main / shadow / post with a wrapped `render`; baseline `board-readability` main pass 227 (not the 171 the old counter suggested), stress 214. |
| 2026-09-30 | T02.2 | 32d5390 | `evidence/02/benchmark/*baseline*` | Harness `benchmark=<s>` mode; v1 baseline 59.9 FPS median on both fixtures (Intel UHD 630-class GPU, Chrome 154). |
| 2026-09-30 | T02.3–T02.6 | 4caf52d 4a160f9 4114181 16f7fb2 | `evidence/02/recovery` | Budget recovery before any visual addition: single-pass icons / highlights / card backs, merged special-tile parts, die face plates baked into the body, stable tile body mesh with hover / selection via instance color. Main pass 227 → 161; pixel diffs against the before captures were 0–2/255. |
| 2026-09-30 | T02.7 | 72d31bd | `evidence/02/tiers` | `RenderQualityConfig`, `resolveRenderQuality`, `graphicsQuality` setting ("Chất lượng đồ họa"), tier diagnostics. `auto` never selects `high`. |
| 2026-09-30 | T02.8 | 51c3639 | `evidence/02/tonemap` | Khronos PBR Neutral (OD-02-2) with ACES / AgX comparison captures for the G2 package; the `?tonemap=` override is dev-only. |
| 2026-09-30 | T02.9 | 79d489f | — | One procedural studio PMREM shared by `scene.environment` and the coins; `CoinMaterialEnvironment` removed. |
| 2026-09-30 | T02.10–T02.11 | 65b663a 0a35b1a | `evidence/02/tabletop` | Key / fill / rim rig; procedural light oak tabletop covering aspect 1 → 2.4 and a board ground-shadow decal. |
| 2026-09-30 | T02.12 | 689678b | — | Instanced lacquer player trays with player-color rims; bank treasury grounded. |
| 2026-09-30 | T02.13 | 89f77fb | — | PCF key-light shadows (1024 balanced, 2048 high). Shadow pass 25 draws in `board-readability`. |
| 2026-09-30 | T02.14 | b179766 | — | Material pass: dice clearcoat, roofs, lacquer rails, paper decks. |
| 2026-09-30 | T02.15 | 98c978d | `evidence/02/tier-shots`, `evidence/02/tiers`, `evidence/02/benchmark` | Lazy high-tier chain N8AO + Bloom + Vignette + Neutral (243 kB chunk, 104 kB gzip, absent from the balanced / low network log and from the main build chunks). Verified in the browser: live switch high ↔ balanced ↔ low, resize, WebGL context loss → legacy board, no console errors. **Deviations, all measured:** (1) N8AO transparency detection is off because it rendered the scene two extra times (main pass 261 → 169); (2) bloom threshold is 1.5 on the HDR buffer, not 0.9, because lit white tiles already sit near 1.0 and would glow (the difference at 1.5 is ≤ 2/255 on 1.4k pixels); (3) "post passes" counts the composer passes (3); the 19 internal full-screen renders are reported separately as `postRenders`; (4) the Canvas `gl.toneMapping` prop is `NoToneMapping` for the high tier because R3F re-applies Canvas props on every render. Known difference: SDF text blends in linear space in the high tier, so it looks slightly thinner and lighter than in balanced; if the G2 review rejects it, remap the text alpha for dark-on-light text. |
| 2026-09-30 | T02.18 | `git log --grep T02.18` | — | AS-IS `Client/game-board.instruction.md` (lighting, environment, tiers, post chain, budget definitions), `Client/README.md`, testcase rows, and supersession notes in `04_PHASE_4` §20.2, `05_PHASE_5` §3, `05A` §12, `06_PHASE_6` §4 and `06A` renderer / quality rows. `CLAUDE.md` needed no change. |
| 2026-09-30 | T02.16 | 40efb72 | `evidence/02/g2/compare/` | Scene palette mapped to `OTB_PALETTE` (jade frame and center field, warm stone base, paper outer accent, gold-400 foundation accent, tray lacquer from ink and lacquer red); district descriptors follow the plan 01 §8.4 hues at the v1 luminance (surface keys, patterns, tuning and white footers untouched; red moved warmer to separate from pink). Pinned token tests updated with the reason; `scenePalette.test.ts` guards the hue family, luminance and district distinctness. G1 was approved 2026-09-30. |
| 2026-09-30 | T02.17 | see `git log --grep T02.17` | `evidence/02/g2/` (35 captures, `compare/` v1-vs-v2, README with the checklist mapping) | Package assembled after T02.16: 3 tiers × 7 fixtures at 1440×900, 3 tiers × 4 viewports (1920×1080, 1280×720, 812×375, 2560×1080), forced legacy fallback at two sizes, four v1-left / v2-right comparisons. All captures: WebGL, zero console errors, inside the §8.9 limits (main ≤ 177, shadow ≤ 25, post 3). Verdict PENDING (human only). The reference-device benchmark is still open. |

**Budget table** (fill in per fixture, 1920×1080):

| Fixture | Tier | Main | Shadow | Post passes (+ renders) | Triangles | Median FPS | p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| board-readability | baseline (before) | 227 | 0 | 0 | 66,234 | 59.9 | 16.8 |
| board-readability | low | 177 | 0 | 0 | 69,152 | 59.9 | 33.5 |
| board-readability | balanced | 169 | 25 | 0 | 69,136 | 30.0 | 66.5 |
| board-readability | high | 169 | 25 | 3 (+19) | 69,136 | 30.1 | 349.7 |
| stress | baseline (before) | 214 | 0 | 0 | — | 59.9 | 49.9 |
| stress | low | 164 | 0 | 0 | 67,558 | 59.5 | 83.4 |
| stress | balanced | 160 | 17 | 0 | 67,550 | 30.0 | 133.2 |
| stress | high | 160 | 17 | 3 (+19) | 67,550 | 10.0 | 283.0 |

**BR-3 landed with plan 03 (T03.6, b40821d):** removing the station labels and `StationMoneyAmounts` took `board-readability`
(balanced, 1440×900) from 169 to 153 main-pass draws (−16; shadow pass 25, triangles 68,932). The same −16 shows in every
4-player HUD fixture of `evidence/03/g3` (for example `balance-gate` 149 → 133, `stations-4` 159 → 143); fixtures with fewer
stations save less (`stations-2` 145 → 137). Rows above were measured before BR-3.

Draw calls and triangles come from the software-rendered captures (`evidence/02/tiers`, deterministic);
frame times come from `VISUAL_GPU=hardware` runs of 10 s at 1920×1080 (`evidence/02/benchmark`). Limits met:
main ≤ 180, shadow ≤ 30, post passes ≤ 6, triangles < 80k.

**Reference device**: _not available._ Measured on the development machine instead: Intel UHD Graphics
(0x9B41, an integrated UHD 630-class GPU, weaker than the Iris Xe / M1 reference), Windows 10 Pro build 19044,
Chrome 154.0.8037.58, canvas pixel ratio 1.25 (the balanced minimum).

**Performance finding for G2 (not acted on, needs a product decision):** on this GPU `balanced` runs at a
30 FPS median where the v1 baseline ran at 60. The board is fill-rate bound, not draw-call or shadow bound:
with real shadows switched off, `balanced` stays at 33.3 ms median; at pixel ratio 1 it returns to 16.8 ms
median (p95 49.9 ms). `low` (pixel ratio 1, no shadows) holds 60 FPS. Options for the reviewer: lower the
`balanced` pixel ratio range, teach `auto` to pick `low` on integrated GPUs, or accept 30 FPS during
animation on this class of device; measure on an Iris Xe / M1 before choosing. `high` is opt-in and is
expected to be slow on integrated GPUs.

**G2 checklist** (product owner fills in; images and mapping in `evidence/02/g2/README.md`):

- [x] Lighting, soft shadows and Neutral tone mapping look right
- [x] Light oak table and board ground shadow cover every viewport (including 21:9)
- [x] Player trays and the bank treasury look grounded
- [x] Scene palette v1 → v2 approved (`compare/`)
- [x] Tile text is readable in all three tiers (the eight regression names at 1280×720)
- [x] Low / balanced / high differ only in the intended ways
- [x] WebGL fallback still works (`fallback/`)
- [ ] Decision on `balanced` performance on integrated GPUs (lower the pixel ratio / `auto` picks `low` / accept 30 FPS)
- [ ] Benchmark on the reference device (Iris Xe or M1 class) recorded

| Reviewer | Date | Verdict | Notes |
| --- | --- | --- | --- |
| tvghung | 01/10/2026 | Approved | Visual checklist ticked. Still open and NOT decided or measured: the `balanced` performance decision on integrated GPUs and the benchmark on the reference device (Iris Xe / M1 class). |

**G2 verdict**: Approved — tvghung, 01/10/2026. Approved by the product owner in chat on 01/10/2026 ("tôi duyệt tất cả"); written into this file by the agent at the product owner's explicit request, in the same form as the G1 record. The two checklist rows above that are left unticked (the `balanced` performance decision and the reference-device benchmark) were not decided or measured and stay open.

---

## 17. Agent Handoff Prompt

```text
You are implementing plan V2-02 "Lighting, Environment and Tabletop" in the
Own the Block repository.

Read first, in order:
1. project-document/visual-overhaul-v2/README.md
2. project-document/visual-overhaul-v2/02_LIGHTING_ENVIRONMENT_AND_TABLETOP.md
3. CLAUDE.md and project-document/monopoly-websockets/Client/game-board.instruction.md

Work on branch visual-v2/02-lighting. Execute tasks in order starting at T02.0.
Budget recovery (T02.3-T02.6) must land before any visual addition. Keep the fixed
orthographic camera, frameloop="demand", BoardRenderModel boundary, district
surfaceKey materials, WebGL fallback and 40 semantic tile buttons unchanged. Never
raise the draw-call budgets; record measured numbers in section 16. Do not add
@react-three/drei, WebAssembly decoders, file-based HDR assets, or CSP changes.
Post-processing is high tier only and must be lazy-loaded. T02.16 (palette) waits
for plan 01 gate G1. T02.17 needs a human verdict (G2); prepare the package and stop.
Run pnpm typecheck, pnpm lint, pnpm test after each task and the full README section 9
checks before finishing. Update the docs listed in T02.18 in the same branch.
```
