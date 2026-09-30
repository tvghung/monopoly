# 05 — 3D Assets: Landmarks, Tube Houses, Standees and Props

**Status: PLANNED — not started. Open decisions answered by the product owner on 2026-09-30 (see the Decisions section). Starts after plan 02 (lighting) lands; gate G5a (pilot review) is blocking before the full landmark set.**

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
| Landmark registry covers exactly the 22 streets | AUTOMATED | `landmarks/registry.test.ts` |
| Per-landmark budget/footprint/height | AUTOMATED | `landmarks/*.test.ts` (table-driven) |
| Standee material/depth material/cache border | AUTOMATED | `characters/*.test.ts(x)` |
| Motion semantics unchanged | AUTOMATED | existing character motion/placement tests |
| Landmark art validator | AUTOMATED | validator self-test (`*.check.mjs`) + build + packaged checks |
| glTF validator (if route B) | AUTOMATED | `validateModels.check.mjs` |
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
| — | — | — | — | — |

**Budget table** (1920×1080):

| Fixture | Tier | Main | Shadow | Post | Triangles | Median FPS | p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| board-readability | low / balanced / high | — | — | — | — | — | — |
| landmarks-all | low / balanced / high | — | — | — | — | — | — |
| houses-max | low / balanced / high | — | — | — | — | — | — |
| stress | low / balanced / high | — | — | — | — | — | — |

**Landmark review** (fill per landmark): tile, name, reviewer, verdict, notes.

**G5a verdict**: PENDING. **G5 verdict**: PENDING.

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
