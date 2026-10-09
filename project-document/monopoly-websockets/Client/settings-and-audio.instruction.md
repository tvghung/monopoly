# Client settings and audio

Status: CURRENT (RELEASED in v1.7.0 unless marked CURRENT DEVELOPMENT). Foundation rules: [monopoly.client.instructions.md](../monopoly.client.instructions.md), [monopoly.shared.instructions.md](../monopoly.shared.instructions.md).

## Scope and UI entry

- Screen: the "Cài đặt" dialog (`SettingsPanel`, a `Modal`). There is no URL route and no permission framework: every
  player, spectator and guest may open it, and every value is a local renderer preference.
- Triggers:
  - desktop launcher (main menu) button "Cài đặt" (`apps/client/src/components/DesktopMultiplayerLauncher.tsx`);
  - lobby header button "Cài đặt" (`apps/client/src/components/Lobby.tsx` `onSettings`);
  - in-game toolbar settings icon button (`apps/client/src/App.tsx`).
- Audio has no screen of its own: it reacts to Settings values, to user gestures and to the authoritative room status.

## Code ownership

| Concern | Code |
| --- | --- |
| Dialog and sections | `apps/client/src/settings/SettingsPanel.tsx`, `apps/client/src/settings/SettingsPanel.css` |
| Provider (state, write-through to storage, desktop fullscreen sync) | `apps/client/src/settings/SettingsProvider.tsx`, `apps/client/src/settings/SettingsContext.ts` |
| Hooks (`useSettings`, `useSettingsAvailable`, `useEffectiveReducedMotion`) | `apps/client/src/settings/selectors.ts` |
| Storage, defaults, normalization, types | `apps/client/src/settings/storage.ts`, `apps/client/src/settings/defaults.ts`, `apps/client/src/settings/types.ts` |
| `<html data-reduced-motion>` / `<html data-graphics-quality>` mirrors | `apps/client/src/settings/ReducedMotionDocumentSync.tsx`, `apps/client/src/settings/GraphicsQualityDocumentSync.tsx` |
| Provider placement (renderer root, above `I18nProvider` and `AppBootstrap`) | `apps/client/src/index.tsx` |
| Audio provider, engine, cue registry, hook, types | `apps/client/src/audio/AudioProvider.tsx`, `apps/client/src/audio/AudioEngine.ts`, `apps/client/src/audio/audioRegistry.ts`, `apps/client/src/audio/useAudio.ts`, `apps/client/src/audio/types.ts` |
| Audio provider placement (only around `App`, not the launcher) | `apps/client/src/app/bootstrap/AppBootstrap.tsx` |
| Music on/off by room status | `apps/client/src/App.tsx` (`audio.setGameActive(room?.status === 'IN_PROGRESS')`) |
| Assets and validator | `apps/client/public/audio/music/own-the-block-main-theme-loop.ogg`, `apps/client/public/audio/sfx/`, `apps/client/scripts/validateGameplayMusicAssets.mjs` |

## Current behavior

### Settings dialog sections

1. Language: segmented control over `SUPPORTED_LANGUAGES` (see [language-system.instruction.md](./language-system.instruction.md)).
2. Audio: "mute" switch plus Master, Music and SFX sliders (0–100 %, step 5 %). Mute keeps the slider levels.
3. Display: animation speed (`0.75`, `1`, `1.5`, `2`) and reduced motion; a polite hint says whether motion is currently
   reduced (by the setting or the OS). Effective reduced motion = setting OR `prefers-reduced-motion`.
4. Graphics: quality `auto` | `high` | `balanced` | `low` (default `auto`; `auto` never resolves to `high`). Tiers are
   described in [game-board.instruction.md](./game-board.instruction.md) "Lighting, environment và graphics tiers".
5. Window (desktop only): fullscreen switch, applied through the preload bridge and kept in sync with the window.
6. Update (desktop only, when the updater is available): see [app-update.instruction.md](./app-update.instruction.md).

A reset button restores every default (Vietnamese, fullscreen off).

### Storage

- `SettingsProvider` sits at the renderer root (`apps/client/src/index.tsx`), so the launcher, bootstrap screens and the
  game read and write the same settings. Every change is normalized and written to localStorage.
- Key `own-the-block.settings.v2` (`version: 2`). The old `own-the-block.settings.v1` key is read only when V2 is absent,
  normalized and copied forward (details: [language-system.instruction.md](./language-system.instruction.md) "Settings migration").
- Normalization is defensive: volumes clamp to 0–1, unknown speed/quality/language fall back to defaults, bad JSON or a
  throwing storage yields defaults. Settings are separate from the reconnect token storage
  (`apps/client/src/playerSessionStorage.ts`) and never enter room state or socket payloads.

### Audio

- One lazily created Web Audio context per `AudioProvider`, unlocked by the first trusted pointer/key gesture; no cue plays
  before unlock. Buses Master → Music and Master → SFX follow the Settings values live (`masterGain` is 0 while muted).
- SFX: typed cue IDs (`AudioCueId`) in `audioRegistry.ts`; each cue has a family, gain, cooldown and voice limit. Some cues
  use Ogg samples under `apps/client/public/audio/sfx/` with a procedural fallback while loading or after a fetch failure;
  others are procedural only. Presentation cues are played by the presentation executors and stopped on a presentation
  reset (see [presentation-pipeline.instruction.md](./presentation-pipeline.instruction.md)).
- Music: one rendered loop, `apps/client/public/audio/music/own-the-block-main-theme-loop.ogg` (Ogg Vorbis, stereo,
  48 kHz), decoded into one looping buffer. It plays only while the authoritative room status is `IN_PROGRESS`; lobby,
  finished and the replayed lobby are silent, and it stops while the document is hidden. There is no procedural music
  fallback and no adaptive multi-stem arrangement.
- The desktop launcher renders outside `AudioProvider`, so nothing plays on the main menu.
- Release audio policy: [V1_RELEASE_CONTRACT.md "Audio release policy"](../../ui-ux-overhaul/V1_RELEASE_CONTRACT.md#audio-release-policy).
  HISTORICAL design (superseded stem transport):
  [V1_AUDIO_SEGMENTED_TRANSPORT.md](../../ui-ux-overhaul/V1_AUDIO_SEGMENTED_TRANSPORT.md),
  [V1_AUDIO_PRODUCTION_PIPELINE.md](../../ui-ux-overhaul/V1_AUDIO_PRODUCTION_PIPELINE.md).

## Constraints and regression risks

- Never store the reconnect token, room code or any game state in the settings record, and never send settings to the server.
- Keep a single `AudioContext` and at most one music source (StrictMode, visibility changes and browser auto-resume are
  tested); a second source would double the music.
- Music must not start in the lobby, after the game finished, or on the launcher.
- Changing an audio asset requires `pnpm validate:music-assets` (expected file list and hashes) and the bundled release checks.
- Adding a setting: extend `types.ts`, `defaults.ts` (`DEFAULT_GAME_SETTINGS` and `normalizeSettings`), the default value
  in `SettingsContext.ts`, the panel, and `settings.test.ts`; bump the storage version only with a migration.

## Change impact

- New settings field: settings files above, Design Lab settings surfaces (`apps/client/src/dev/design-lab/surfaces/settingsSurfaces.tsx`),
  tests, this doc.
- New sound cue: `apps/client/src/audio/types.ts` (`AudioCueId`), `audioRegistry.ts`, the executor or UI that plays it,
  the validator list if it is a sample, and `apps/client/public/audio/SOURCES.md`.

## Verification

Automated:

- `apps/client/src/settings/settings.test.ts` (normalize/clamp, key, V1 → V2 migration, graphics quality),
  `apps/client/src/settings/SettingsPanel.test.tsx`, `apps/client/src/settings/SettingsPanel.update.test.tsx`,
  `apps/client/src/settings/SettingsProvider.test.tsx`, `apps/client/src/settings/selectors.test.tsx`,
  `apps/client/src/settings/ReducedMotionDocumentSync.test.tsx`, `apps/client/src/settings/GraphicsQualityDocumentSync.test.tsx`
- `apps/client/src/audio/AudioEngine.test.ts` (one context, gains, music only while active, visibility, sample fallback),
  `apps/client/src/audio/AudioProvider.test.tsx` (gesture unlock, button click cue, StrictMode listeners)
- `apps/client/src/game/presentation/executors/audioExecutors.test.ts`
- `pnpm test:music-validator`, `pnpm validate:music-assets`
- Playwright `e2e/mobile-host.spec.ts` test "single rendered Ogg Vorbis music asset and supported Web Audio lifecycle"
  (`pnpm test:e2e:mobile`)

Manual: [../testcase/client-state-sync-motion-and-accessibility.md](../testcase/client-state-sync-motion-and-accessibility.md)
sections "Gameplay audio" and "Modal v2 and settings".

## Related docs

- [README.md](./README.md), [language-system.instruction.md](./language-system.instruction.md), [app-update.instruction.md](./app-update.instruction.md),
  [design-system.instruction.md](./design-system.instruction.md), [game-board.instruction.md](./game-board.instruction.md)
- [../Desktop/README.md](../Desktop/README.md) (fullscreen and quit bridge)
- [../FEATURE_TRACEABILITY.md](../FEATURE_TRACEABILITY.md)
