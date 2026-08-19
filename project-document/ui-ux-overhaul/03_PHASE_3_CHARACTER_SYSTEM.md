# Phase 3 — Character + Player Color Appearance System

## 1. Goal and boundaries

Phase 3 delivers a cosmetic appearance system. In the lobby each player chooses
one mascot character and one player color. The color is the shared identity
accent for the lobby/HUD, ownership flags, mascot accent regions, and future
player-colored presentation effects.

Appearance must never affect movement distance, rent, property ownership,
payments, turn order, jail, development, winner determination, or any other
game rule. The server remains authoritative for durable appearance state and
the client remains responsible for presentation.

The board continues to use the fixed orthographic 2.5D camera and
`frameloop="demand"`; Phase 3 extends the existing PresentationController,
AnimationQueue, `MOVE_CHARACTER`, and movement executor rather than creating a
second gameplay or animation authority.

## 2. Stable V1 appearance contract

### 2.1 Character roster

Use exactly these stable lowercase `CharacterId` values:

- `dog`
- `capybara`
- `panda`
- `cat`
- `penguin`
- `elephant`
- `rabbit`
- `duck`

`dog` uses a golden retriever artwork but keeps the generic display label
**Dog**. `elephant` uses the elephant artwork and display label **Elephant**.
Characters are not unique in a room. Multiple players may select the same
character; for example, Dog/red and Dog/blue is valid. Do not disable a
character because another player selected it.

### 2.2 Player color palette

Use exactly these stable `PlayerColorId` values and one centralized visual
registry:

| ID | Display color |
| --- | --- |
| `red` | `#F2384A` |
| `blue` | `#3567F2` |
| `green` | `#00B86B` |
| `yellow` | `#FFC400` |
| `orange` | `#FF7A18` |
| `purple` | `#8B5CF6` |
| `pink` | `#EC4899` |
| `cyan` | `#06B6D4` |
| `lime` | `#84CC16` |
| `charcoal` | `#334155` |

Mascots may repeat and colors may repeat, but each ACTIVE player must have a
unique `characterId + color` combination while a room is in `LOBBY`. The server
rejects stale conflicting combinations; client-disabled swatches are UX only.
The actor's current combination is valid as a no-op. LEFT and FINISHED members
do not reserve an appearance combination. A new seat still receives the first
available color in this palette order as a convenience, and may change it before
the game starts. Color is non-null and locked once the room leaves the lobby.

### 2.3 SVG accent policy

Every original local SVG keeps natural/base body colors, neutral line/face
colors, and one or more intentional player-accent regions covering roughly
10–25% of visible mascot area. Only explicit accent tokens change. Eyes, face,
species-defining fur/body colors, global shadows, and the entire body are not
recolored.

The asset contract uses `PLAYER_ACCENT_PRIMARY` (`#FF00FF`) and
`PLAYER_ACCENT_DARK` (`#CC00CC`) as reserved source tokens. These tokens may
not be used for non-accent art. A single trusted `colorizeCharacterSvg`
helper replaces only these exact token values with the centralized player
palette and accent-dark mapping; it does not fetch or execute remote SVG.

## 3. Lobby behavior

The local appearance editor contains:

- eight mascot cards with SVG preview, display name, current selection, and
  selected-state semantics; duplicate characters remain available;
- ten named color swatches with selected state, accessible name/label, and
  unavailable state when another active lobby player owns the focused mascot and
  color combination;
- a player list showing name, host state, color swatch, selected mascot/name,
  ready state, and connection state without overcrowding the row.

Selecting a character emits `set appearance` with `characterId`; selecting a
color emits the same command with `color`. UI appearance changes are shown
only after the committed public room update; a pending state may be shown.
Conflict feedback keeps the authoritative previous appearance and ready state.

Ready integration is server-enforced:

- `set ready { ready: true }` requires a non-null valid character;
- changing character or color actually resets the member's ready flag to false
  in the same room command;
- a no-op appearance request need not reset ready;
- `start game` requires the host, 2-4 connected active players, all ready,
  valid unique mascot and color combinations, and a non-null character for every
  active player.

## 4. Shared and durable state

Define `CHARACTER_IDS`, `CharacterId`, `PLAYER_COLOR_IDS`, and `PlayerColorId`
once in `packages/shared`. Use `PlayerColorId` for `Player.color`,
`FinishedPlayer.color`, `Winner.color`, `OwnedProp.color`, and public room
metadata where the field represents player identity. Add
`characterId: CharacterId | null` to `Player`, `FinishedPlayer`, `Winner`,
`PublicPlayer`, and `RoomPlayerMeta` as appropriate. Public state exposes the
authoritative character; the client never infers another player's character.

Add the strict, non-empty, no-unknown-key command payload:

```ts
interface SetAppearanceRequest {
  characterId?: CharacterId;
  color?: PlayerColorId;
}
```

Its actor is the authenticated socket. It is accepted only for an active
PLAYER in `LOBBY`; characters and colors may repeat, but exact mascot and color
combinations do not. Use the existing ACK/error localization pipeline and a
clear Vietnamese conflict message.

Increment `SOCKET_PROTOCOL_VERSION` from 4 to 5 and
`ROOM_SNAPSHOT_SCHEMA_VERSION` from 4 to 5. Add a transactional V4 → V5
persistence migration using the existing migration/checksum architecture:

- live players, finished players, and winner receive `characterId: null`;
- no mascot is invented for legacy state;
- legacy colors map `yellow→yellow`, `green→green`, `blue→blue`,
  `red→red`, `orange→orange`, `white→cyan`, `black→charcoal`;
- owned-property color metadata is normalized from the mapped live owner;
- money, properties, turn, deck, payment, and all other gameplay state remain;
- already-running legacy rooms with five to seven players remain structurally
  loadable, while new lobby admission/start remains capped at 2–4;
- upgraded snapshots validate as v5 and remain idempotent.

V5 snapshots written by the first appearance rollout may still contain the
legacy ids `shiba` or `fox`. The server normalizes those ids at the snapshot
boundary to `dog` and `elephant` before schema validation; the next committed
room write persists the canonical ids. New appearance commands accept only the
current roster.

When a live player is eliminated, leaves, or becomes the winner, preserve
`name`, `color`, and `characterId` in every `FinishedPlayer`/`Winner`
construction path.

## 5. Character assets and registry

Use eight original, local, transparent SVGs under
`apps/client/src/game/characters/assets/` with a common `0 0 256 256` viewBox
where practical: `dog.svg`, `capybara.svg`, `panda.svg`, `cat.svg`,
`penguin.svg`, `elephant.svg`, `rabbit.svg`, and `duck.svg`.

Create one registry under `apps/client/src/game/characters/` with exactly one
definition per `CharacterId`, including display name, SVG source, scale,
vertical offset, and shadow scale. Include a documented legacy fallback for
`characterId === null` only for migrated in-progress state; new games cannot
start with it. Lobby DOM previews and board textures use the same colorization
source.

For Three.js, convert the colorized local SVG to a transparent texture and
cache by `characterId + PlayerColorId`. Do not rasterize per frame or per React
render. The cache uses entry identity, reference counts and idempotent release;
an old async load disposes its texture and cannot notify a replacement cache entry.
Dispose unused texture resources correctly. New lobbies admit at most four
players; if a legacy in-progress snapshot contains five to seven players, the
renderer remains structurally safe without changing the admission rule.

## 6. Board placement and presentation

Extend the board render model with player ID, display tile, stable join order,
color, character ID, and any active state needed by presentation. Replace
`Phase2PlayerMarkers` as the normal renderer with a character layer and
billboard plus a small blob/contact shadow. Do not let the layer access
Socket.IO or mutate authoritative state.

Use one centralized local-tile placement registry with deterministic,
count-aware layouts:

| Occupants | Slots |
| --- | --- |
| 1 | centered |
| 2 | left, right |
| 3 | top, lower-left, lower-right |
| 4 | top-left, top-right, bottom-left, bottom-right |

Slots remain inside the usable tile footprint and are transformed through the
canonical board/tile transform registry for all four board sides. Sort each
same-tile group by `joinOrder`, then `playerId` as a tiebreaker; never use
object insertion order or the old seven-slot placeholder registry.

Characters remain readable from the fixed camera, have a consistent apparent
size, use no camera follow/orbit, and preserve natural art colors with a clear
player accent. The billboard keeps the active ring and contact shadow in a
grounded group while the sprite body moves independently. The sprite material is
neutral white so the colorized SVG is not tinted a second time; hop sampling owns
shadow scale/opacity and the grounded group receives tile-impact offset only.

## 7. Movement, landing, reactions, and reconnect

Retain the existing `MOVE_CHARACTER` path and server-authoritative current
tile. For a walk, publish each intermediate display target before waiting for
the hop, settle it after the hop, emit `STEP` only for intermediate tiles, and
emit the separate `LAND` event once after the final arrival. Each intermediate
tile is a small hop: X/Z interpolation, restrained Y arc, subtle squash/stretch,
optional 1–3° tilt, and a smaller/lighter contact shadow near the apex. Use
centralized `presentationTiming.tileHop` without random per-character timing.
Landing rebound/impact is separate from movement timing; do not add an expensive
particle or sound overhaul.

Because the canvas uses `frameloop="demand"`, request animation frames only
while a hop/reaction is active and invalidate those frames; idle characters do
not keep permanent loops. Reduced Motion snaps or uses a minimal transition,
with no mandatory hop and an authoritative final position.

Reactions use a lightweight internal abstraction that can support `happy`,
`sad`, `jail`, `bankrupt`, and `emote` via bounce, scale, tilt, emoji bubble,
or brief accent flash; the current controller is deterministic and reduced
motion cancels it. Landing, jail entry and player-finished events use the
abstraction; custom animation clips are out of scope.

On `SESSION_SYNC`/reconnect, keep player ID, color, and character, cancel
stale hop/reaction state, reset the presentation queue and reset epoch, snap to
authoritative current tile, and never replay old movement or duplicate
billboards. A stale animation completion must not move a character away from the
authoritative snapshot.

The presentation store keeps `displayPositions` (board/character target) separate
from `settledPositions` (prompt/dice gating). Tile-impact sequence numbers and
`presentationResetEpoch` are separate namespaces, so an ordinary pulse cannot
reset movement state and a session reset cannot replay an old pulse. A stationary
player must not hop when another player's tile impact changes.

## 8. Documentation and acceptance criteria

Update the Phase 3 masterplan/index summary and relevant socket lobby/session,
board, room lifecycle, and contract documents with CharacterId, PlayerColorId,
`set appearance`, duplicate-character behavior, unique mascot and color
combinations, ready
requirements, reconnect persistence, protocol/snapshot v5, V4 → V5 upgrade,
SVG accents, and 1–4 placement layouts.

Automated acceptance must cover:

- all eight characters and all ten colors; invalid IDs rejected;
- strict appearance payloads: character-only, color-only, both, empty,
  unknown keys, and invalid values;
- protocol v5 and incompatible old protocol behavior;
- V4 → V5 live/finished/winner null character, legacy color mapping,
  ownership consistency, five-to-seven-player in-progress loadability, and no
  gameplay-state loss;
- server character selection, duplicate characters and colors allowed, exact
  combination rejection, available color switch, ready reset, ready/start blocking,
  reconnect persistence, color release on lobby leave, and post-start lock;
- lobby counts/selection/disabled-color/preview/pending behavior and four
  slots;
- every SVG's registry entry, accent tokens, valid local output, red/blue
  recoloring, preserved base colors, and absence of placeholder magenta;
- deterministic 1–4 placement for all four board sides;
- one-step publication-before-wait, multi-step/no-final-STEP, wrap 39→0,
  landing impact, grounded stationary-player behavior, reduced motion, queue
  reset, session sync, stale-completion safety, neutral sprite material, and
  async texture-cache stale-load disposal.

Manual acceptance must confirm four-player cap, eight characters, ten colors,
duplicate characters, duplicate colors, unique mascot and color combinations,
accent/ownership agreement, readable
1–4 same-tile layouts on every board side, smooth hop, landing feedback,
reduced-motion snap, reconnect without replay/clone, no rule regression,
`frameloop="demand"`, unchanged scene budgets, and no obvious resource leak.

Required release gates are `pnpm db:migrate`, `pnpm db:status`, `pnpm typecheck`,
`pnpm lint`, `pnpm test`, and `pnpm build`. PostgreSQL-backed tests must run with
`TEST_DATABASE_URL` set against a disposable PostgreSQL 17 instance; an unset
variable is a conditional/skipped run, not CI parity. Performance must remain
healthy against the Phase 2 budget/60 FPS target; budget values may not be
raised to hide regressions.

## 9. Out of scope

- Gameplay-rule or authoritative-state changes.
- Full 3D rigs, Blender/GLB/FBX assets, walk cycles, or per-mascot clips.
- Runtime remote asset fetching, broad SVG recoloring, or expensive particles.
- New camera movement, sound-system overhaul, cosmetic shop, or abilities.
