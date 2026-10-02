# 05 — 3D Assets: Landmarks, Tube Houses, Standees and Props

**Status: IMPLEMENTED, WAITING FOR THE G5 VERDICT — T05.0–T05.12 are done (T05.9 skipped by decision OD-05-2): the kit, instanced tube houses, standees, all 22 landmarks, their 2D art on the deed cards, the four table props, the "Khánh thành" banner (OD-05-4), the budget pass and the docs. Gate G5a was Approved by the product owner on 01/10/2026 (§17). The G5 package is `evidence/05/g5/`; its human verdict and the Vietnamese reviewer's sign-off on the 22 landmarks are open, and so are the packaged run (`pnpm desktop:package`) and a benchmark on a reference device (§17). Open decisions were answered on 2026-09-30.**

| Field | Value |
| --- | --- |
| Plan ID | V2-05 |
| Depends on | V2-02 (lighting, tiers, budget recovery, benchmark), V2-01 (palette, capture tool), V2-03 T03.6 (station labels removed: frees about 16 draws that this plan's headroom assumes) and T03.14 (overlap checker, needed for props); V2-03 banner component only for OD-05-4 |
| Blocks | — (fills the landmark art slot of plan 04's deed card) |
| Parallel with | V2-04 late tasks |
| Suggested branch | `visual-v2/05-assets` |
| Size | XL (about 18–28 agent working sessions; the 22 landmarks dominate) |
| Owner profile | Three.js engineer with modeling taste; a Vietnamese reviewer for cultural accuracy; human review at G5a and G5 |
| Primary code areas | `apps/client/src/game/scene/buildings/**`, `apps/client/src/game/scene/characters/**`, `apps/client/src/game/characters/characterTextureCache.ts`, `apps/client/public/art/landmarks/**` (new), `apps/client/scripts/` (validator), `apps/client/src/dev/phase4-uat/**` (fixtures) |

Read first: [README.md](README.md), [02](02_LIGHTING_ENVIRONMENT_AND_TABLETOP.md)
(budgets, tiers, light direction), then this file.

---

## 1. Description

Give the board Vietnamese identity and a "real object" feel with a small,
consistent set of stylized low-poly assets, built in code by default:

1. **Nhà ống (tube house) kit** replaces the generic houses: narrow, colorful
   Vietnamese street houses with an awning or roof in the owner's color, 1–4 per tile,
   fully instanced.
2. **22 city landmarks** become the hotel tier of each street (Business Tour-style
   "landmark" top development): e.g. Chùa Cầu for Hội An, Cầu Vàng for Đà Nẵng,
   Landmark 81 for Landmark 81. Vertex-colored, one draw call each, on an owner-colored
   plinth.
3. **Mascot standees** replace the unlit sprites: the same mascot art printed on a
   die-cut standee with a white border and a round base in the player's color, casting
   real shadows, with unchanged movement semantics.
4. **2D landmark illustrations** (22 SVGs) for the deed card header slot from plan 04.
5. **Table props** (phin coffee, nón lá, lotus bowl, stylized play money), code-built and
   placed only where the HUD does not cover them (in scope: decision OD-05-3).
6. An **asset validation** and **budget measurement** setup. The glTF route is
   documented but **not used** (decision OD-05-2); everything is code-built.

---

## 2. Context

- The product owner asked for "more beautiful, more realistic 3D objects". Decision
  DR-02 (README §4) interprets this as stylized physically based realism, because at the
  fixed camera distance a hotel is only about 20–40 px tall at 1080p: silhouette, color,
  light, and shadow are visible; fine geometric detail is not.
- Decision DR-06: no WebAssembly decoders; the default route is code-built geometry. The
  packaged Electron CSP also blocks images embedded in `.glb` files (they load through
  `blob:` URLs, and `blob:` is not in `img-src`/`connect-src`), so any glTF must be
  texture-free.
- Decision DR-07: Vietnamese identity is a first-class pillar. Landmarks and tube houses
  are the most direct expression of "Cờ Tỷ Phú Việt Nam" on the board itself.
- Phase 3 froze the character movement system (`03_PHASE_3_CHARACTER_SYSTEM.md` §9); this
  plan changes only the character's visual node, never hop timing, anchors, slot reflow,
  reconnect snapping, or `TileMotionController`.

---

## 3. Current State

### 3.1 What the player sees

- Houses: small neutral boxes with a facade texture and an owner-colored pitched roof.
- Hotel: a larger neutral box with a colored crown.
- Characters: flat mascot sprites that always face the camera, unlit, with a blob
  contact shadow.
- See `baseline/03-board-idle.jpg` and `baseline/06-turn-handoff.jpg` (ownership flag +
  rabbit/panda sprites).

### 3.2 Code map (verified 2026-09-29)

| Area | File(s) | Facts |
| --- | --- | --- |
| Houses | `game/scene/buildings/HouseMesh.tsx`, `houseRoofGeometry.ts`, `buildingFacadeTextures.ts` | `HouseWall` `RoundedBoxMesh` with `HOUSE_FACADE_TEXTURE` (128² `DataTexture`, never disposed) and `houseWall` profile; per-house pitched roof with its **own geometry and material** (`flatShading`, owner color); a `ContactShadow`. Body `0.48×0.36×0.39`, roof `0.56×0.18×0.47` (`boardArtSpec.ts`). **3 draws per house.** |
| Hotel | `game/scene/buildings/HotelMesh.tsx` | Facade (map) + crown (owner color) + `ContactShadow`; body `0.92×0.78×0.6`, crown `1.04×0.15×0.7`. 3 draws. |
| Building layer | `game/scene/buildings/BuildingLayer.tsx` | `ConstructionPuff` (instanced octahedra), house pop and hotel transition animations with `invalidate()`; path `TileAssembly → TileDevelopmentLayer → BuildingLayer`. Construction and flag timings are frozen by `04_PHASE_4_GAMEPLAY_ACTIONS.md` §20.3. Development levels are presentation-owned (`displayDevelopmentLevels`, 5 = hotel). |
| Placement | `game/scene/board/buildingPlacement.ts`, `architecture/tileAnchors.ts`, `tileMatrix.ts` | Buildings are positioned in tile-local space through the canonical tile transforms (all 4 board sides). |
| Characters | `game/scene/characters/CharacterBillboard.tsx`, `CharacterSprite.tsx`, `characterSpriteMaterial.ts`, `characterMotion.ts`, `characterReaction.ts`, `characterPlacement.ts`, `CharactersLayer.tsx` | Hierarchy root(x,z) → ground group → shadow group → `ContactShadow`; root → body group → `CharacterSprite` (`<sprite>` at `CHARACTER_BILLBOARD_HEIGHT/2 + offset` with height 1.22, scale `[0.96s, 1.22s]`); `spriteMaterial` white, transparent, `alphaTest 0.04`, `depthWrite false`, `toneMapped false`. Hop height 0.22, lean ≤ 3° along camera-right, reactions happy/sad/jail/bankrupt/emote. Slots: 1–4 per tile, sorted by `joinOrder` then `playerId`. |
| Mascot textures | `game/characters/characterTextureCache.ts`, `characterSvg.ts`, `assets/*.svg` | SVG (256×256, accent tokens `#FF00FF`/`#CC00CC` recolored by `colorizeCharacterSvg`) → `HTMLImageElement` → 256² `CanvasTexture` (sRGB, no mipmaps), reference-counted per `characterId:color`. |
| Camera | `game/scene/camera/fixedCameraOrientation.ts`, `cameraMath.ts` | `FIXED_CAMERA_QUATERNION` exists; camera direction `normalize(1, 1.25, 1)` → elevation ≈ 41.5°, azimuth 45°. |
| Budgets | `game/scene/board/architecture/sceneBudget.ts` | 210 target / 240 hard draw calls (main pass); 80k target / 100k hard triangles. Plan 02 adds shadow-pass (≤ 30) and post-pass (≤ 6) budgets and expects about 160 main-pass draws after its recovery work, leaving about 50 for this plan. |
| Tests | `buildings/buildingFacadeTextures.test.ts`, `characters/CharacterSprite.test.tsx`, `characters/characterSpriteMaterial.test.ts`, `board/tiles/sdfTextConfig.test.ts`, placement tests | Pin current material props, sprite element types, and dimensions. |
| Board data | `packages/shared/src/tileState.ts`, `colorGroups` | 22 streets (tiles 1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29, 31, 32, 34, 37, 39); groups brown, lightblue, pink, orange, red, yellow, green, blue. District motifs in `game/ui/propertyVisualColors.ts`. |
| Electron | `apps/desktop/src/rendererContentType.ts` | CSP `default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:;` (no `'wasm-unsafe-eval'`, no `blob:` for images/fetch); MIME map has no `.glb`. The Express server rate-limits static files to 1000 requests per 15 minutes per IP. |

---

## 4. Purpose

1. Make the board unmistakably Vietnamese and reward development visually (building a
   landmark is a moment).
2. Make pieces feel physical (standees with bases and real shadows, glossy toy
   buildings) without breaking readability or budgets.
3. Keep the asset path simple, safe for the packaged app and iPhone Safari, and
   verifiable by automated checks.

---

## 5. Desired Outcome

### 5.1 Player-facing

- Building houses adds colorful narrow tube houses along the tile, each with an awning in
  the owner's color; four houses read clearly as four.
- Reaching the hotel tier raises the city's landmark on an owner-colored plinth; the deed
  card shows the landmark's illustration and name.
- Mascots look like printed standees on colored bases, casting soft shadows, hopping
  exactly as before.
- Everything still reads at 1280×720: tile names are not hidden by buildings; the board
  does not look cluttered.

### 5.2 Engineering

- A low-poly kit (`buildings/kit/`) producing merged, vertex-colored geometries.
- Instanced tube houses (≤ 3 draws for all houses on the board).
- 22 landmark builders with unit-tested budgets and footprints.
- A standee character visual with correct shadow casting.
- A landmark art registry + validator; optional glTF validator and MIME entry.
- New harness fixtures for worst-case measurement.

### 5.3 Success metrics (gate G5)

| Metric | Target |
| --- | --- |
| Main-pass draws, `board-readability` | ≤ 210 (target) in every tier |
| Main-pass draws, new `landmarks-all` fixture (every street at hotel tier) | < 240 hard |
| Shadow-pass draws (balanced/high) in `landmarks-all` | ≤ 30 |
| Triangles (main pass), `landmarks-all` and `houses-max` | ≤ 80k target, < 100k hard (existing budget; a result between 80k and 100k is recorded as "over target" and needs a product-owner decision, the target is not raised) |
| Per-landmark budget | ≤ 900 triangles, ≤ 2 draws (+1 emissive), footprint and height within §8.3 |
| Tile text readability with buildings | 8 regression names readable at 1280×720 in `board-readability` and `landmarks-all` |
| Benchmark (`stress`, balanced, reference device) | Still meets plan 02 §5.3 |
| Cultural review | Vietnamese reviewer sign-off recorded for all 22 landmarks |

---

## 6. Scope

**In scope**: tube house kit; 22 landmarks as the hotel tier; standees; landmark 2D art;
the four table props (code-built, route A only); validators; fixtures; docs.

**Out of scope**:

- Rigged or animated 3D mascots, walk cycles, facial animation (masterplan out of scope).
  A future "3D mascot figurine" option is described in §16 only as a decision record.
- Photoreal assets or textures, Draco/KTX2/Meshopt, CSP changes.
- New gameplay (no building limits, no new tile types, no economy changes).
- Changes to movement timing, placement slots, or camera.
- Railroad/utility 3D props (optional future; icons stay).

---

## 7. Constraints and Invariants

1. Buildings derive only from `BoardRenderModel` + presentation development levels; no
   gameplay reads in the scene.
2. Frozen timings: construction puff, house pop, hotel transition, and flag timings keep
   their Phase 4 values; the new meshes plug into the same schedule.
3. Character motion freeze (Phase 3 §9): only the visual node under the body group changes.
4. Neutral property chassis and district surfaces unchanged; ownership is expressed by the
   owner-colored awnings/plinth and the existing flag, never by district accents.
5. Budgets are never raised; worst-case fixtures must pass (§5.3).
6. No text is hidden: building footprints stay inside the tile's upper art panel (70% of
   the tile depth) and heights obey §8.3.
7. Assets fail soft: a missing or failing asset renders the code-built placeholder
   (today's house/hotel) inside an `OptionalSceneLayer` (plan 02); never switch to the
   legacy board for an asset problem.
8. `frameloop="demand"`: builders run synchronously or invalidate on completion; no loops.
9. Reduced motion: construction and standee animations follow the existing reduced-motion
   rules (durations zero, semantic order preserved).
10. Respectful depiction of religious and heritage sites (Chùa Cầu, Chùa Trấn Quốc, Tháp
    Đôi); no parody, no logos or brand marks on modern buildings.
11. Play money props must be clearly fictional (no real VND banknote imagery).

---

## 8. Design Specification

### 8.1 Style guide ("toy diorama")

- Flat-shaded low-poly facets (`flatShading` or `toNonIndexed` + face normals), gently
  beveled boxes where cheap, chunky proportions (about 1.2× thicker than real).
- Colors from plan 01 `OTB_PALETTE` and a small "street pastel" set: mint `#BFE8D6`,
  butter `#F6E3A1`, salmon `#F4B6A0`, sky `#BFD9F2`, lilac `#D8C8EE`, cream `#F5ECDC`.
- Materials: one shared `MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })`
  for opaque kit parts; one shared glass material (`vertexColors`, roughness 0.18,
  metalness 0.35) for towers; one shared emissive material (`MeshBasicMaterial`,
  `toneMapped: false`) for lamps/lanterns (bloom-eligible in the high tier).
- Silhouette first: every asset must be recognizable as a flat black silhouette at 40 px.

### 8.2 Nhà ống (tube house) kit

| Part | Spec |
| --- | --- |
| Body | 0.30 w × 0.36 d × 0.50 h (tile-local), beveled box; facade color from the street pastel set, chosen deterministically by `(tileId * 7 + slot) % 6` |
| Trim | Windows (2 per floor), a balcony rail line, door; baked as vertex-colored geometry (white/ink), no textures |
| Awning/roof | Sloped awning slab or flat roof lip in the **owner's player color** |
| Layout | 1–4 houses in a row along the tile's upper panel, centered, gap 0.06; positions from `buildingPlacement.ts` (extend it; keep the side-aware transforms) |
| Rendering | 3 `InstancedMesh` for the whole board: bodies (`instanceColor` = facade color), trim (no instance color), awnings (`instanceColor` = owner color). Max instances = 22 × 4 |
| Animation | House pop per instance by updating its instance matrix during the existing pop schedule; `ConstructionPuff` unchanged |
| Triangles | ≤ 180 per house (body + trim + awning) |
| Shadows | The three instanced meshes cast shadows (3 shadow draws total) |

### 8.3 Landmarks (hotel tier)

Rules:

- Footprint ≤ 1.30 × 1.30 (tile-local, centered on the upper panel); height ≤ 1.20 for
  standard landmarks; slim towers (base ≤ 0.5 wide) ≤ 2.0.
- Plinth: 1.36 × 0.08 × 1.36 lacquer base with a 0.04 rim in the owner's color (shared
  instanced plinth mesh across all landmarks → 1 draw).
- ≤ 900 triangles; 1 draw (opaque) + optional 1 glass + optional 1 emissive.
- The ownership flag stays (planted at the plinth corner).
- The deed card (plan 04) header shows the 2D art and the landmark name under the tile name.

| Tile | Street | Group | Landmark (Vietnamese name) | Silhouette recipe | Key colors | Max H |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cà Mau | brown | Mũi Cà Mau (biểu tượng con tàu + cột mốc) | Ship-bow wedge platform, slim marker pillar, 3 mangrove clusters | concrete `#D8CFC2`, red trim, mangrove green | 1.0 |
| 3 | Bạc Liêu | brown | Cánh đồng điện gió | 3 slim wind turbines on a shallow water plate | white `#F4F1EA`, gray, water blue | 1.6 (slim) |
| 6 | Buôn Ma Thuột | lightblue | Nhà dài Ê Đê | Long raised house on short posts, tall thatched roof with front overhang, small ladder | wood `#8D5B3E`, thatch `#C9A45C` | 0.9 |
| 8 | Cần Thơ | lightblue | Chợ nổi Cái Răng | Two wooden boats with produce piles, one "cây bẹo" pole with hanging fruit | wood, green, orange | 0.9 |
| 9 | Hải Phòng | lightblue | Nhà hát lớn Hải Phòng | Colonial facade with a column row and central pediment, one red flame tree (hoa phượng) | cream `#F2E0B5`, white, red | 1.0 |
| 11 | Đà Lạt | pink | Ga Đà Lạt | Long base with three steep gables and a colored glass band | butter walls, dark brown roofs, glass accents | 1.1 |
| 13 | Hội An | pink | Chùa Cầu | Short covered arched bridge with a small curved-eave roof, two red lanterns (emissive) | red-brown wood, yellow walls, lantern red | 0.9 |
| 14 | Huế | pink | Ngọ Môn | Wide gate base with three arches, two-tier pavilion with yellow roofs | red-brown base, yellow roof `#E0B43C` | 1.1 |
| 16 | Mũi Né | orange | Đồi cát và thuyền thúng | Two smooth sand dunes, a round basket boat, one small palm | sand `#E9C58B`, basket `#8B6A43` | 0.8 |
| 18 | Sa Pa | orange | Ruộng bậc thang | Terraced hill of stacked rounded plates with water sheen, tiny hut | greens, water blue | 1.0 |
| 19 | Nha Trang | orange | Tháp Trầm Hương | Lotus-bud tower of stacked flared rings on a plinth (lathe profile) | white, pale pink | 1.4 |
| 21 | Vũng Tàu | red | Hải đăng Vũng Tàu | Tapered white tower, red cap, emissive lantern room, rock base | white, red, gray rock | 1.6 (slim) |
| 23 | Quy Nhơn | red | Tháp Đôi | Two Cham brick towers with tiered tops on a shared plinth | brick `#A0522D` | 1.2 |
| 24 | Đà Nẵng | red | Cầu Vàng | Curved golden walkway held by two giant stone hands | gold `#D9A93A`, mossy stone | 1.1 |
| 26 | Bãi Cháy | yellow | Vịnh Hạ Long | Three limestone karst towers in water, one junk boat with red sails | gray-green, teal water, sail red | 1.3 |
| 27 | Hồ Tây | yellow | Chùa Trấn Quốc | Slim multi-tier red stupa tower on an island plinth | red-brown, white, water | 1.6 (slim) |
| 29 | Phú Quốc | yellow | Bãi biển và tàu câu mực | Palm trees on a sand spit, two squid-fishing boats with lamp strings (emissive) | sand, palm green, boat blue/red | 1.1 |
| 31 | Phú Mỹ Hưng | green | Cầu Ánh Sao | Curved pedestrian bridge with light rails (emissive) over water | white/steel, warm lights | 0.8 |
| 32 | Thảo Điền | green | Biệt thự ven sông | Modern white villa volumes, wood deck, garden trees at the river edge | white, wood, green | 0.9 |
| 34 | Nguyễn Huệ | green | Trụ sở UBND TP.HCM | Yellow French-colonial building with a central clock tower | yellow `#EFCB5A`, white trim, red roof | 1.3 |
| 37 | Đồng Khởi | blue | Tháp Bitexco | Tapered lotus-bud glass tower with a helipad disc | blue glass, white | 1.9 (slim) |
| 39 | Landmark 81 | blue | Landmark 81 | Bundle of stepped slender glass prisms (bamboo bundle) with a crown | blue-gray glass, white | 2.0 (slim) |

If a reviewer rejects a choice (accuracy, sensitivity, or recognizability), replace it
with another landmark of the same city and record the change in §17.

### 8.4 Mascot standees

- Geometry: a vertical plane per character (facing the camera azimuth only, i.e. rotated
  about Y to face world `(1, 0, 1)`), world height `1.22 s / cos(41.5°) ≈ 1.63 s` so the
  on-screen height matches today's sprite (orthographic foreshortening factor ≈ 0.749),
  width `0.96 s` plus the border.
- Texture: extend `characterTextureCache.ts` to bake a **die-cut white border**: draw the
  recolored SVG into a 320² canvas, paint the silhouette dilated by 6 px in white (draw
  the image in 12–16 offset directions with a white `source-in` fill), then draw the
  mascot on top. Keep the cache key `characterId:color` plus a version suffix; keep
  reference counting and disposal.
- Face material: `MeshBasicMaterial({ map, alphaTest: 0.5, transparent: false,
  toneMapped: false })` so mascots stay as bright and readable as today's sprite (which is
  also `toneMapped: false`; plan 02 §7.9 requires unlit layers to read the same). A lit
  material would put the camera-facing plane in shade, because the key light from plan 02
  comes from the screen's left and slightly behind the plane's normal.
- Shadow: `castShadow` with `customDepthMaterial = new MeshDepthMaterial({ map, alphaTest:
  0.5, depthPacking: RGBADepthPacking })` so the shadow has the mascot's silhouette.
  Contact shadows: keep the existing per-character contact shadow **only in `low`** (no
  shadow maps); remove it in `balanced`/`high`, where the real shadow replaces it.
- Base: rounded disc (radius `0.30 s`, height 0.05) in the player's display color,
  lit (`MeshStandardMaterial`, roughness 0.4); one `InstancedMesh` for all players
  (`instanceColor`).
- Motion: the standee replaces `CharacterSprite` inside the existing body group; hop,
  lean, reactions, landing, jail transfer, snap, and slot reflow are unchanged. The lean
  now reads as a physical tilt of the standee, which is expected.
- Draw calls (4 players): today 4 sprites + 4 contact shadows = 8. Standees: `low` =
  4 faces + 1 instanced base + 4 contact shadows = 9 (+1); `balanced`/`high` = 4 faces +
  1 base = 5 main-pass draws, plus 5 shadow-pass draws.

### 8.5 2D landmark art

- 22 SVGs at `apps/client/public/art/landmarks/<tileId>.svg`, `viewBox="0 0 160 160"`,
  flat shapes matching the 3D colors, no text, no `<script|foreignObject|image>`, no
  external references, no `href`/`data:image` (same safety rules as card art).
- Registry `game/ui/property/landmarkVisuals.ts`: `{ tileId, landmarkName, artUrl }`.
- Validator: generalize `apps/client/scripts/validateCardArtwork.mjs` (or add
  `validateLandmarkArtwork.mjs` with the same structure): exact coverage of the 22 street
  tiles, safety checks, build-copy SHA-256 check (`--build-output`), and the packaged check
  (extend `apps/desktop/scripts/validatePackagedCardArt.mjs` or add a sibling).

### 8.6 Table props (in scope, decision OD-05-3)

All four props are built in code with the §9 low-poly kit (no glTF, decision OD-05-2),
colored to sit well on the light oak table (plan 02, OD-02-4).

| Prop | Recipe | Placement |
| --- | --- | --- |
| Cà phê phin | Cup + saucer + phin filter (lathe) | Table margin visible at 16:9, outside every HUD region |
| Nón lá | Cone with ring ridges | Same |
| Bát sen (lotus bowl) | Bowl + 3 lotus buds | Same |
| Tiền chơi (play money) | Stack of rectangular notes with fictional OTB design colors (vertex colors only) | Near the bank or a tray |

Rules: at most 4 props, total ≤ 4 draws and ≤ 3k triangles; props cast shadows in
`balanced`/`high` (count them in the shadow-pass budget); positions validated with plan
03's overlap checker (props must not sit under HUD regions or cover any tile at the
standard viewports). If a viewport class has no free table area for a prop (likely on
phone landscape), hide that prop at that viewport class instead of moving it under the
HUD. The `low` tier may hide all props.

### 8.7 glTF route (reference only — not used: OD-05-1 = code-built, OD-05-2 = no glTF)

| Requirement | Value |
| --- | --- |
| Format | glTF 2.0 binary (`.glb`) |
| Textures | **None** (no images, samplers, or textures); colors as `COLOR_0` vertex colors |
| Extensions | Only `KHR_mesh_quantization`; no Draco, Meshopt, KTX2, or `EXT_texture_webp` |
| Structure | ≤ 2 primitives per model, one shared material type as in §8.1 |
| Size | ≤ 60 KB per model; props bundled into one `props.glb` with named nodes (fewer requests; Express rate limit) |
| License | CC0 (e.g. Kenney, Quaternius, Poly Pizza items marked CC0) or commissioned with IP transfer; recorded in `apps/client/public/models/SOURCES.md` |
| Processing | `scripts/assets/processModel.mjs` using `@gltf-transform/core` + `@gltf-transform/functions` (dev dependencies): `dedup` → `prune` → `weld` → material base colors baked to `COLOR_0` → `join` → `quantize` |
| Serving | `apps/client/public/models/` (not imported through Vite, to avoid `data:` inlining); add `.glb: model/gltf-binary` to `apps/desktop/src/rendererContentType.ts` and update `rendererContentType.test.ts` |
| Loading | `GLTFLoader` inside `OptionalSceneLayer` with a code-built placeholder fallback; `invalidate()` on load; no Suspense outside the Canvas |
| Validation | `apps/client/scripts/validateModels.mjs`: registry coverage, JSON checks (no images/textures/external URIs/required extensions other than quantization), triangle count, size, build-copy hash, packaged presence |

### 8.8 Budget techniques

- **Houses**: 3 instanced meshes for the board (main pass) and 3 shadow draws.
- **Landmarks**: unique geometries (1–3 draws each). For shadows, add a single
  `LandmarkShadowProxy`: a merged world-space geometry of all visible landmarks with
  `castShadow = true` and a material with `colorWrite = false` and `depthWrite = false`
  (costs 1 main-pass draw and 1 shadow draw); set `castShadow = false` on the individual
  landmark meshes. Rebuild the proxy only when the set of visible landmarks changes.
- **Plinths**: 1 instanced mesh.
- **Standees**: 4 faces + 1 instanced base.
- Remove the per-building `ContactShadow` meshes when real shadows are on (plan 02 rule).

Expected `landmarks-all` main pass: plan 02 baseline (~160) − current buildings in that
fixture + houses 0 (all hotels) + 22 landmarks × ~1.4 + plinths 1 + proxy 1 + standees 5 + props 4 ≈
200. Measure; do not assume. Shadow pass for the same fixture (houses 3, landmark proxy 1, plinths 1, standees 5, decks 2, board 1, trays 1, coins 3, props 4) ≈ 21, within the ≤ 30 budget.

---

## 9. Technical Approach

New folder `apps/client/src/game/scene/buildings/kit/`:

| File | Responsibility |
| --- | --- |
| `lowPolyKit.ts` | Vertex-colored primitives: `box`, `bevelBox`, `cylinder`, `cone`, `lathe(profile)`, `extrude(shape)`, `gableRoof`, `hipRoof`, `curvedEaveRoof`, `arch`, `tubeAlong(curve)`, `palm`, `boatHull`; `mergeKit(parts)` (normalizes attributes, merges with `BufferGeometryUtils.mergeGeometries`), `flatten()` for faceted shading. Pure, deterministic. |
| `kitMaterials.ts` | Shared opaque, glass, emissive materials (module-level, created once, disposed never; like card decks). |
| `tubeHouseGeometry.ts` | Body/trim/awning geometries for the nhà ống. |
| `landmarks/registry.ts` | `LANDMARKS: Record<StreetTileId, { id, name, heightClass, build(): LandmarkGeometry }>` where `LandmarkGeometry = { opaque: BufferGeometry; glass?: BufferGeometry; emissive?: BufferGeometry; footprint: [w, d]; height: number }`. Geometries are built lazily on first use and cached. |
| `landmarks/<slug>.ts` | One builder per landmark (22 files). |

Changes:

- `buildings/BuildingLayer.tsx`: switch houses to the instanced tube-house layer and hotels
  to `LandmarkMesh` + plinth; keep the pop/transition schedules; keep a code-built
  placeholder path (today's meshes) for failures.
- New `buildings/TubeHouseInstances.tsx`, `buildings/LandmarkMesh.tsx`,
  `buildings/LandmarkShadowProxy.tsx`, `buildings/LandmarkPlinths.tsx`.
- `characters/CharacterStandee.tsx` (new) replaces `CharacterSprite` in
  `CharacterBillboard.tsx`; `characters/standeeMaterial.ts` (face + depth material);
  `characters/StandeeBases.tsx` (instanced bases); `characterTextureCache.ts` border bake.
- `dev/phase4-uat/Phase4UatHarness.tsx`: new scenarios `landmarks-all` (every street at
  hotel tier, owners rotating over 4 players), `houses-max` (every street with 4 houses),
  `standees` (4 players on one tile, hop + reactions).

---

## 10. Execution Guide

### T05.0 — Preflight

Branch after plan 02 and plan 03 T03.6 and T03.14 (props are in scope) are merged;
read README, plans 02/05, `Client/game-board.instruction.md`,
`03_PHASE_3_CHARACTER_SYSTEM.md` §6–§9, `04_PHASE_4_GAMEPLAY_ACTIONS.md` §20. Baseline
captures and benchmark of `board-readability`, `stress`, `house-4`, `hotel` in all tiers.

### T05.1 — Fixtures

Add `landmarks-all`, `houses-max`, `standees` harness scenarios (with today's meshes) and
record their current budgets (they show today's worst case).

### T05.2 — Low-poly kit

Implement `lowPolyKit.ts` + `kitMaterials.ts`; unit tests (attribute layout, color
attribute present, determinism, triangle counts of primitives).

### T05.3 — Tube houses

Implement §8.2 with instancing and pop animation; tests (layout for 1–4 houses on all four
sides stays inside the upper panel; instance count; triangle budget; owner color applied).
Captures `house-1`…`house-4`, `houses-max`.

### T05.4 — Standees

Implement §8.4; update `CharacterSprite`/material tests (or replace them with standee
tests); verify hop, lean, reactions, jail transfer, snap, slot reflow in the harness
scenarios `walk`, `jail`, `bankrupt`, `reconnect-*`, `standees`, `reduced-motion`,
`speed-walk`; verify silhouette shadows (balanced/high).

### T05.5 — Pilot landmarks (3) + gate G5a

Build **Landmark 81**, **Chùa Cầu**, **Cầu Vàng** (tall/slim, delicate roof, curved
structure: the three hardest styles). Implement `LandmarkMesh`, plinths, shadow proxy.
Captures at 1920×1080 and 1280×720 in every tier; readability check of neighboring tiles.
**Stop for G5a**: the product owner and a Vietnamese reviewer approve the style (or request
changes) before the other 19 are built. Record the verdict in §17.

### T05.6 — Remaining landmarks

Build the other 19 landmarks in groups of 4–5 (one commit per group); unit tests per
landmark (triangles ≤ 900, footprint/height within §8.3, color attribute, determinism).
Captures of each group.

### T05.7 — 2D landmark art

Create the 22 SVGs, `landmarkVisuals.ts`, the validator, and the packaged check; wire the
deed card slot (plan 04) if plan 04 is merged, otherwise leave the registry ready.

### T05.8 — Table props (required)

Implement §8.6 with the code-built kit (OD-05-3 decided: build them; OD-05-2 decided: no
glTF). Unit tests per prop (triangles, bounding box, determinism); validate positions with
plan 03's overlap checker at every standard viewport; per-viewport hiding where there is no
free table area; captures in every tier.

### T05.9 — glTF route (not in scope)

Skipped by decision OD-05-2 (2026-09-30). §8.7 stays as a reference only; do not add the
processing script, validator, MIME entry, or loader unless the product owner reverses the
decision.

### T05.10 — Budget and performance pass

Measure all fixtures × tiers; benchmark `stress` and `landmarks-all` on the reference device;
fill §17; optimize (merge more, lower triangles, shadow proxy) until §5.3 passes.

### T05.11 — Gate G5

Evidence `evidence/05/g5/` (all fixtures × tiers × viewports; legacy fallback unaffected);
cultural review sign-off for all 22; human verdict in §17.

### T05.12 — Documentation

- `Client/game-board.instruction.md`: tube houses, landmarks as the hotel tier, plinths,
  shadow proxy, standees, budgets, fixtures.
- Supersession notes: `03_PHASE_3_CHARACTER_SYSTEM.md` (sprite → standee visual; motion
  unchanged), `02_PHASE_2_2_5D_BOARD.md` and `03_PHASE_3_CHARACTER_SYSTEM.md` §10 ("no GLB")
  only if route B was used, `04_PHASE_4_GAMEPLAY_ACTIONS.md` building visuals (timings unchanged).
- `testcase/client-state-sync-motion-and-accessibility.md`: kit/landmark budget tests
  `[CLIENT][AUTOMATED]`, standee motion regression `[CLIENT][AUTOMATED]` where covered,
  worst-case fixture budgets `[MANUAL-E2E]`, cultural review `[MANUAL-E2E]`.
- `testcase/shared-contracts-and-board-data.md`: landmark registry covers exactly the 22
  street tiles `[CLIENT][AUTOMATED]`.
- If route B: `Client/README.md` asset pipeline section and the desktop packaging docs.

---

## 11. Testing and Verification

| Check | Type | Where |
| --- | --- | --- |
| Kit primitives (attributes, determinism, triangles) | AUTOMATED | `kit/lowPolyKit.test.ts` |
| Tube house layout and budget | AUTOMATED | `tubeHouseGeometry.test.ts`, `buildingPlacement.test.ts` |
| Landmark registry covers exactly the 22 streets | AUTOMATED | `landmarks/landmarks.test.ts` (the plan, the registry and the 2D registry `landmarkVisuals.test.ts`) |
| Per-landmark budget/footprint/height | AUTOMATED | `landmarks/*.test.ts` (table-driven) |
| Standee material/depth material/cache border | AUTOMATED | `characters/*.test.ts(x)` |
| Motion semantics unchanged | AUTOMATED | existing character motion/placement tests |
| Landmark art validator | AUTOMATED | validator self-test (`validateLandmarkArtwork.check.mjs`) + build (`--build-output`) + packaged check (`proof:packaged:landmarks`, needs a package) |
| Deed card landmark art and accessible names | AUTOMATED | `landmarkVisuals.test.ts`, `PropertyDeedCard.test.tsx`, `deedCardModel.test.ts`, `tileAccessibility.test.ts` |
| Table props: geometry, placement, visibility, overlap helpers | AUTOMATED | `props/tablePropGeometry.test.ts`, `props/tablePropLayout.test.ts`, `hud-overlap/polygonOverlap.test.ts` |
| Table props clear of the HUD and the tiles on the live board | MANUAL (measured) | `evidence/05/props`, `evidence/05/g5` (`hudOverlap.props` in each sidecar) |
| "Khánh thành" banner (OD-05-4) | AUTOMATED | `game/ui/hud/LandmarkBanner.test.tsx` |
| glTF validator (if route B) | AUTOMATED | `validateModels.check.mjs` (not built: route A) |
| Budgets per fixture/tier, benchmark | MANUAL (measured) | §17 tables |
| Visual quality, readability, cultural accuracy | MANUAL | G5a, G5 |

---

## 12. Accessibility

- 3D assets are decorative; the semantic source of truth remains the DOM (tile buttons,
  deed cards, player cards). The deed card and tile button accessible names may add the
  landmark name ("Khách sạn · Chùa Cầu").
- Ownership remains readable without color: flag + owner name in the deed card and tile
  button label.
- Reduced motion: construction and standee motion follow existing rules.

---

## 13. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Code-built landmarks look crude | Style guide, silhouette-first rule, three hard pilots, G5a review before scaling; commission route as a fallback decision. |
| Tall landmarks hide tile names behind them | Height classes, slim towers, readability captures of neighboring tiles, footprint on the upper panel only. |
| Budget blowout in late games | Instancing, shadow proxy, worst-case fixtures, per-landmark triangle limit. |
| Standees look dark or flat | Unlit face material (§8.4); lit base and shadow provide the physical cue. |
| Foreshortened standees look squashed | Height compensation `1 / cos(41.5°)`; compare screen height with the sprite in captures. |
| Cultural insensitivity or inaccuracy | Vietnamese reviewer sign-off; replace rather than caricature; no religious symbols used decoratively. |
| glTF images blocked in packaged CSP | Texture-free rule; validator rejects images. |
| Many asset requests from LAN phones hit the rate limit | Code-built by default; bundle props into one file. |
| Construction animation regressions with instancing | Keep the schedule; test pop per instance; harness `building-preflash`, `construction-reduced`. |

---

## 14. Decisions

Answered by the product owner on 2026-09-30; binding for implementation.

| ID | Question | Options considered | Decision (product owner, 2026-09-30) |
| --- | --- | --- | --- |
| OD-05-1 | Landmark production route | Code-built (A) / commissioned glTF (B) / mixed | **DECIDED: A — code-built** (G5a still reviews the three pilots) |
| OD-05-2 | Allow the glTF route for props | Yes (texture-free rules) / no | **DECIDED: No** (T05.9 skipped; everything is code-built) |
| OD-05-3 | Table props | Build the 4 props / skip | **DECIDED: Build all four now** (cà phê phin, nón lá, bát sen, tiền chơi; T05.8 required) |
| OD-05-4 | Landmark completion moment (non-blocking "Khánh thành Chùa Cầu!" banner using plan 03's banner component when a street reaches the hotel tier during live presentation) | Yes / no | **DECIDED: Yes** (live presentation only, never on snap/reconnect; reduced motion: text only) |
| OD-05-5 | Standee border color | White / player color | **DECIDED: White** (classic die-cut) |
| OD-05-6 | Replace landmark list entries flagged by the reviewer | Per review | Procedural: record each replacement in §17 during G5a/G5 |

---

## 15. Definition of Done

- [ ] T05.0–T05.12 complete (optional tasks explicitly skipped or done) and logged in §17.
- [ ] G5a and G5 verdicts recorded by humans; cultural review recorded.
- [ ] Budgets (§5.3) met in every tier for `board-readability`, `stress`, `landmarks-all`,
  `houses-max`; benchmark recorded.
- [ ] README §9 commands green, including `pnpm desktop:package` and a packaged run showing
  landmarks and standees under `app://`.
- [ ] Docs and testcase rows updated (§T05.12).

---

## 16. Future Option (decision record only): 3D mascot figurines

Replacing standees with 3D chibi figurines would need: an artist (or a consistent CC0/
commissioned set of 8), static poses (no rigs), texture-free or CSP-compatible assets,
per-player accent recoloring (vertex color group or material slot), the same motion
system, a sprite/standee fallback, and a new budget line (8 figurines ≤ 8 draws, ≤ 3k
triangles each). It is out of scope for this program and needs a separate plan.

---

## 17. Progress Log

| Date | Task | Commit | Evidence | Result / notes |
| --- | --- | --- | --- | --- |
| 2026-10-01 | T05.0, T05.1 | `922b5e0` | `evidence/05/baseline/` | Fixtures `landmarks-all`, `houses-max`, `standees`; today's boxes and sprites measured in every tier (houses-max: 331 main and 185 shadow draws, 93.7k triangles). |
| 2026-10-01 | T05.2, T05.3, T05.5 | `9c5364d` | `kit/lowPolyKit.test.ts`, `tubeHouse*.test.ts`, `landmarks/landmarks.test.ts` | Low-poly kit and three shared materials; instanced tube houses (3 draws for the whole board); Chùa Cầu, Cầu Vàng and Landmark 81 on plinths; one shadow proxy. |
| 2026-10-01 | T05.4 | `be405e5` | `characters/standee.test.ts` | Die-cut standees (320 px bake, white 6 px border) on instanced round bases; motion semantics unchanged. |
| 2026-10-01 | review | `39d6c93` | five-lens review | Five read-only reviewers (instancing, standee, landmarks, budgets, tests) with two skeptics per finding; the fixes below. |
| 2026-10-01 | T05.5 | G5a package commit | `evidence/05/g5a/` | Style sheet, board captures, budget JSON; `pnpm test:e2e:mobile` passes on Chromium and WebKit with the new meshes. **Stopped for the G5a verdict.** |
| 2026-10-01 | G5a | `9610377` | §17 below | Approved by the product owner (written by the agent at their request). |
| 2026-10-02 | T05.6 | `736be5b` | `landmarks/landmarks.test.ts`, `kit/lowPolyKit.test.ts`, `evidence/05/g5a/05-sheet-group-{a,b,c,d}-*` | The other 19 landmarks (22 of 22) in four groups, one style sheet per group; new kit primitives `arcadeWall`, `prism`, `blob`, `dome`; every landmark is tested for triangles (≤ 900), draws (≤ 3), footprint, height, faceting, plinth bounds. Average 379 triangles with the plinth. |
| 2026-10-02 | T05.7 | `7cbca79` | `public/art/landmarks/`, `landmarkVisuals.test.ts`, `validateLandmarkArtwork.check.mjs` | 22 flat SVGs, the 2D registry, the deed card art slot and name line, the hotel tile label, the validator (build and CI) and the packaged check script (not run; needs a package). |
| 2026-10-02 | T05.8 | `fa2f1c6` | `props/*.test.ts`, `evidence/05/props/` | Four table props with placement, visibility rule and the overlap checker extension; no HUD or tile finding at 1920 × 1080, 1440 × 900, 1280 × 720; +4 main and +4 shadow draws, +1,560 triangles where shown. |
| 2026-10-02 | OD-05-4 | `452728f` | `hud/LandmarkBanner.test.tsx` | "Khánh thành <landmark>!" banner, live presentation only. |
| 2026-10-01 | T05.9 | — | — | Skipped by decision OD-05-2: no glTF route, no processing script, validator, MIME entry or loader. |
| 2026-10-02 | T05.10 | G5 package commit | `evidence/05/g5/numbers/`, `evidence/05/g5/benchmark/` | All fixtures × tiers re-measured with the 22 landmarks and the props: `landmarks-all` 187 main / 18 shadow draws and 76.8k triangles (balanced), `board-readability` 142, `houses-max` 159 / 74.8k; every §5.3 budget holds, nothing had to be cut. Frame times on this machine's Intel UHD GPU (not the reference device): `stress` balanced 30 FPS, as before plan 05. |
| 2026-10-02 | T05.11 | G5 package commit | `evidence/05/g5/` | Package: 24 board pictures with overlap results (no finding), the legacy board with WebGL off, the 22-landmark row sheet, the numbers and the benchmark. **Waiting for the G5 verdict.** |
| 2026-10-02 | T05.12 | G5 package commit | `Client/game-board.instruction.md`, `testcase/*` | Board doc (landmarks, 2D art, banner, props), testcase rows (22 of 22, landmark art validator, props, banner; manual ones stay manual), supersession note of plan 04 updated. |

### As built — differences from the specification

- **Plinth.** Merged into each landmark's own opaque geometry (slab + a raised rim whose vertices come first), not a shared instanced plinth mesh: 0 extra draws, and the rim takes the owner's color by rewriting those vertices in the mounted copy (`recolorRim`). Landmark footprint and height are measured without the plinth.
- **Shadows.** The landmark shadow proxy (`LandmarkShadowProxy`) lives on a shadow-only layer (`SHADOW_ONLY_LAYER`, enabled on the key light's shadow camera in `SceneLightRig`), so it costs one shadow draw and nothing in the main pass; a landmark leaves it while its 4 → 5 transition pops it in. Tube houses cast through their three instanced meshes. Landmarks have no contact shadow at any tier (22 of them would push the low tier over the 240 draw limit; the lacquer plinth grounds them).
- **Height class.** Three landmarks whose `Max H` is above 1.2 (Tháp Trầm Hương 1.4, Vịnh Hạ Long 1.3, UBND TP.HCM 1.3) take the `slim` class (limit 2.0); the table is otherwise implemented as written.
- **Tube houses.** One row on the middle of the tile's upper art panel (the facade is on both long faces so it shows from any board side); the roof, not a separate awning, carries the owner color. Fail-soft: `OptionalSceneLayer onFail` switches `houseRenderMode` to `legacy` (today's per-tile boxes). A landmark builder that throws is logged once and the street keeps its hotel box (`hasLandmark`).
- **Standees.** The cache key is unchanged (`characterId:color`, in memory per page, so no version suffix is needed); `CharacterSprite` and its material were deleted instead of kept as a fallback. The bases are one `InstancedMesh` written by each billboard at the end of its frame update (a write in `onBeforeRender` came after three.js uploads instance buffers and lagged a frame).
- **Landmark kit and plan (T05.6).** The kit gained `arcadeWall` (several arches in one wall; `archWall` delegates to it), `prism` (a ground polygon raised to a height), `blob` (a faceted ball) and `dome` (the upper half of a ball, never below the ground), with tests; `landmarks/parts.ts` holds the water plates, trees, palms, boat hulls and arc strips the builders share. `LandmarkGeometry` carries its plinth-free `bounds`, and a table-driven test keeps every landmark inside the plinth slab and above the ground; that test moved Cầu Vàng 0.04 along X (its left hand reached past the slab) and the wind turbines 0.03, and no other pilot changed. `LANDMARK_PLAN` moved to `landmarks/plan.ts` (plain data, no three.js) so the 3D registry, the 2D registry and the accessible names read one source; the plan's "registry covers exactly the 22 streets" check lives in `landmarks/landmarks.test.ts` rather than a separate `registry.test.ts`. The 19 landmarks were built in four groups of four or five (one commit for all of them, with a style sheet per group in `evidence/05/g5a/05-sheet-group-*`); they average 379 triangles with their plinth (22 together: 8.3k; the largest is Cầu Ánh Sao with 636, the limit is 900).
- **Landmark art and the deed card (T05.7).** The 22 SVGs are flat, 160 × 160, in the 3D colors, on their own pastel backing so they read on any district color; `game/ui/property/landmarkVisuals.ts` is the registry, and `PropertyDeedCard` shows the picture in its art slot (the district motif if it cannot load) and "Khách sạn · <landmark>" under the tile name, which also describes the card. A hotel tile button is named "Có Khách sạn · <landmark>" (`tileAccessibility.ts`, used by the 40 semantic buttons and the legacy tiles). The validator follows the card validator but shares its checks: `scripts/artworkValidation.mjs` holds the common SVG safety, orphan and build-copy checks (the card validator's behavior and messages are unchanged), `validateLandmarkArtwork.mjs` adds the exact coverage of the 22 street tiles read from the shared `colorGroups`, `pnpm build` runs it with `--build-output`, CI runs it and its self-test, and `apps/desktop/scripts/validatePackagedLandmarkArt.mjs` (shared `packagedRenderer.mjs`, `proof:packaged:landmarks`) checks a packaged renderer. The packaged check has not been run: it needs `pnpm desktop:package`.
- **Table props (T05.8).** The four props are one merged geometry each (4 draws, about 1.4k triangles, limits tested); they stand beside the board's left and right corners (`props/tablePropLayout.ts`) and show only where the table margin is free of the HUD: at least 30 px per world unit, inside the band between the player cards, 12 px from the edge, and below the activity-log tab on the right. All four show from 1280 × 720 up and hide on tablet and phone landscape, and the `low` tier leaves them out; they are never moved under the HUD. Deviations from the table of §8.6: the play money stands in the lower right margin, not "near the bank or a tray" (no free margin is near either); props have no accessible name (decoration). The plan 03 overlap checker was extended for them: `PropScreenRectsPublisher` (dev/UAT) publishes their rectangles, `findHudPropOverlaps` and `findPropTileOverlaps` report HUD regions and tiles a shown prop covers, and each capture sidecar carries `hudOverlap.props`; every shown prop was clear of the HUD and the tiles at 1920 × 1080, 1440 × 900 and 1280 × 720.
- **OD-05-4 (the "Khánh thành …" banner).** `LandmarkBanner` sits next to `TurnBanner` in the HUD and reuses its shell, keyframes, reduced-motion fade and the transient-list helper: "Khánh thành <landmark>!" with the landmark's 2D picture for 2.2 s (scaled by the animation speed) when a street goes up to the hotel tier in live presentation, replaced by a newer hotel. It never shows for a hotel already on the board when the HUD mounts, nor after a snap, reconnect or reset (the presentation reset epoch), and under reduced motion it is the text alone. It is `aria-hidden` like the turn banner because the activity log already says the Khách sạn was built. No task of the execution guide covers it; it was done with the full landmark set.

### Review fixes (commit `39d6c93`)

Confirmed by two independent skeptics each: standee bases lagged a frame behind their cards (blocker); the bankruptcy fade never compiled (`needsUpdate`); the hotel dust puff used the landmark origin on every street; the landmark shadow appeared full size before the landmark popped in; Board3D rebuilt its signal maps on every hover. Confirmed once or assessed by hand after the session limit cut the verification short: the proxy drew invisibly in the main pass; a throwing landmark builder was not fail-soft; the plinth slab floated 0.02 below the landmark; the Cầu Vàng handrails floated above the deck. Not a defect: the unverified claim that a landmark's front can face away from the camera on some board sides (each landmark is a rotated tile child and reads from every side by design).

**Budget table, final** (T05.10; 1920×1080, SwiftShader counts from the `diagnostics` of each capture in `evidence/05/g5/numbers/`, with all 22 landmarks and the table props; a tier column reads low / balanced / high):

| Fixture | Main | Shadow | Post | Triangles | Before plan 05 (main low / balanced / high; shadow; triangles) |
| --- | --- | --- | --- | --- | --- |
| board-readability | 142 / 142 / 142 | 0 / 21 / 21 | 0 / 0 / 19 | 67.4k / 68.9k / 68.9k | 161 / 153 / 153; 25; 68.9k |
| house-4 | 138 / 138 / 138 | 0 / 21 / 21 | 0 / 0 / 19 | 66.5k / 68.1k / 68.1k | — |
| hotel | 136 / 136 / 136 | 0 / 18 / 18 | 0 / 0 / 19 | 66.7k / 68.2k / 68.2k | — |
| houses-max | 159 / 159 / 159 | 0 / 21 / 21 | 0 / 0 / 19 | 73.3k / 74.8k / 74.8k | 419 / 331 / 331; 185; 93.7k |
| landmarks-all (22 landmarks) | 187 / 187 / 187 | 0 / 18 / 18 | 0 / 0 / 19 | 75.3k / 76.8k / 76.8k | 221 / 199 / 199; 53; 79.8k |
| standees | 138 / 138 / 138 | 0 / 21 / 21 | 0 / 0 / 19 | 66.6k / 68.1k / 68.1k | 140 / 138 / 138; 13; 66.7k |
| stress | 140 / 140 / 140 | 0 / 21 / 21 | 0 / 0 / 19 | 66.7k / 68.3k / 68.3k | — |

0 console errors in every capture. The low tier shows 1,552 fewer triangles than balanced because it leaves the table props out (they cost 4 main draws, 4 shadow draws and 1,560 triangles where shown). Gate G5 metrics (§5.3): `board-readability` main ≤ 210 in every tier **142**; `landmarks-all` main < 240 **187**; shadow in `landmarks-all` ≤ 30 **18**; triangles of `landmarks-all` and `houses-max` ≤ 80k **76.8k and 74.8k**; per landmark ≤ 900 triangles and ≤ 3 draws **636 and 3** (unit tests). The eight regression tile names are legible on `05-assets-landmarks-all-balanced-1280x720.png` (read by the agent; the reviewer confirms).

**Frame times** (T05.10, `evidence/05/g5/benchmark/`, 10 s each, `VISUAL_GPU=hardware`): measured on this machine's Intel UHD Graphics (0x9B41, Direct3D 11), **not the reference device** (none is available here). `stress` low 59.9 FPS median, balanced 30.0, high 8.6; `landmarks-all` low 59.5, balanced 29.9, high 10.0. Plan 02 measured `stress` at 59.5 / 30.0 / 10.0 on the same GPU, so plan 05 did not change the frame time; the `balanced` decision of gate G2 (about 30 FPS on this class of GPU, fill-rate bound) stays open and the benchmark on an Iris Xe or M1 was not run.

**Budget watch (closed).** The estimate made at G5a (up to about 87k triangles for `landmarks-all`) was too high: the 22 landmarks average 379 triangles with their plinth (8.3k together) and replace 22 hotel boxes that cost several draws and more triangles each, so `landmarks-all` went from 199 to **187** main draws and from 79.8k to **76.8k** triangles (balanced). No fixture is over its target in any tier, so no "over target" decision is needed at G5 and no optimization was necessary (T05.10: nothing to cut; the average landmark stayed near the pilots').

**Landmark review** (fill per landmark): tile, name, reviewer, verdict, notes.

| Tile | Landmark | Reviewer | Verdict | Notes |
| --- | --- | --- | --- | --- |
| 1 | Mũi Cà Mau | — | Built, pending G5 | Ship-bow platform, marker pillar, flag with the national star, mangroves |
| 3 | Cánh đồng điện gió | — | Built, pending G5 | Three wind turbines on shallow water |
| 6 | Nhà dài Ê Đê | — | Built, pending G5 | Long house on posts, thatched roof, ladder; check the ethnic-heritage depiction |
| 8 | Chợ nổi Cái Răng | — | Built, pending G5 | Two boats with produce and a cây bẹo pole |
| 9 | Nhà hát lớn Hải Phòng | — | Built, pending G5 | Colonial facade, columns, pediment, copper dome, flame tree |
| 11 | Ga Đà Lạt | — | Built, pending G5 | Three steep gables, colored glass band |
| 13 | Chùa Cầu | tvghung (product owner) | Approved (pilot, G5a) | "rất đẹp" (very beautiful); heritage and religious site |
| 14 | Ngọ Môn | — | Built, pending G5 | Imperial gate, three arches, two-tier yellow-roofed pavilion; heritage site |
| 16 | Đồi cát và thuyền thúng | — | Built, pending G5 | Dunes, two basket boats, a palm |
| 18 | Ruộng bậc thang | — | Built, pending G5 | Five terraces with a stilt hut |
| 19 | Tháp Trầm Hương | — | Built, pending G5 | Lotus-bud tower of three stacked rings |
| 21 | Hải đăng Vũng Tàu | — | Built, pending G5 | Tapered tower, glowing lantern, rocks |
| 23 | Tháp Đôi | — | Built, pending G5 | Two Cham brick towers; heritage site (architecture only, no figures) |
| 24 | Cầu Vàng | tvghung (product owner) | Approved (pilot, G5a) | "rất đẹp" |
| 26 | Vịnh Hạ Long | — | Built, pending G5 | Five karst peaks and a junk with red sails |
| 27 | Chùa Trấn Quốc | — | Built, pending G5 | Six-tier stupa on an islet, small hall; Buddhist temple (architecture only, no figures) |
| 29 | Bãi biển và tàu câu mực | — | Built, pending G5 | Palms, two squid boats with glowing lamps |
| 31 | Cầu Ánh Sao | — | Built, pending G5 | Bow-arch bridge with light rails |
| 32 | Biệt thự ven sông | — | Built, pending G5 | Modern white villa, deck, boat |
| 34 | Trụ sở UBND TP.HCM | — | Built, pending G5 | Yellow colonial city hall, clock tower and red dome; no statue, no emblem |
| 37 | Tháp Bitexco | — | Built, pending G5 | Glass lotus-bud tower with a helipad; no logo |
| 39 | Landmark 81 | tvghung (product owner) | Approved (pilot, G5a) | "rất đẹp" |

**G5a verdict**: Approved — tvghung, 01/10/2026. Approved by the product owner in chat on 01/10/2026 ("tôi duyệt tất cả … 3 landmarks mẫu rất đẹp"); written into this file by the agent at the product owner's explicit request, in the same form as the G1 record. The style of the code-built "toy diorama" assets is approved, so T05.6 builds the other 19 landmarks in it. No separate Vietnamese-reviewer sign-off is recorded: the G5 cultural review of all 22 landmarks stays open.

**G5 package**: `evidence/05/g5/` (its README says what to look at; 49 captures with overlap results, 21 budget JSON files, 6 frame-time JSON files, the 22-landmark row sheet and four group sheets in `evidence/05/g5a/`, the props package in `evidence/05/props/`). **G5 verdict**: PENDING. Open at this gate: the product owner's review of the 22 landmarks, the table props, the "Khánh thành" banner and the deed card art; the Vietnamese reviewer's sign-off for all 22 landmarks (§5.3); and, outside the package, the packaged run (`pnpm desktop:package` with `proof:packaged:landmarks`, not run) and a benchmark on a reference device (none available; the machine's own Intel UHD GPU measured 30 FPS in `balanced`, unchanged from plan 02).

---

## 18. Agent Handoff Prompt

```text
You are implementing plan V2-05 "3D Assets: Landmarks, Tube Houses, Standees and Props"
in the Own the Block repository.

Read first, in order:
1. project-document/visual-overhaul-v2/README.md
2. project-document/visual-overhaul-v2/02_LIGHTING_ENVIRONMENT_AND_TABLETOP.md (budgets, tiers)
3. project-document/visual-overhaul-v2/05_3D_ASSETS_LANDMARKS_AND_STANDEES.md
4. CLAUDE.md, project-document/monopoly-websockets/Client/game-board.instruction.md,
   project-document/ui-ux-overhaul/03_PHASE_3_CHARACTER_SYSTEM.md sections 6-9

Plan 02 and plan 03 task T03.6 (station labels removed) must be merged first; if they are
not, stop and report. Work on branch visual-v2/05-assets. Build everything in code
(vertex-colored low-poly geometry, shared materials, instancing); do not add textures,
WebAssembly decoders, or CSP changes. Keep construction/flag timings, character motion,
placement slots, camera, and BoardRenderModel boundaries unchanged. Execute T05.0 to T05.5,
then stop at gate G5a for a human and Vietnamese-reviewer verdict on the three pilot
landmarks. After approval continue with T05.6-T05.12. Never raise budgets: measure every
fixture in every tier and record numbers in section 17. Run pnpm typecheck, pnpm lint,
pnpm test after each task, and the full README section 9 checks before finishing.
```
