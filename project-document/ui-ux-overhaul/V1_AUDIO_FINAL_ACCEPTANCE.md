# V1 Audio Final Acceptance

Current V1 audio contract: one rendered looping gameplay track at
`apps/client/public/audio/music/own-the-block-main-theme-loop.wav`. It is
decoded once and played only while authoritative room status is `IN_PROGRESS`;
lobby, finished, and replay-lobby states remain silent. The adaptive four-stem
design and its missing-master result below are historical, superseded evidence,
not the current release architecture.

Current engineering status: automated asset/build/package checks are separate
from human listening. No human listening, physical-device, signing,
notarization, or release approval is claimed here. Final unchecked manual items
are in [V1_FINAL_MANUAL_ACCEPTANCE.md](V1_FINAL_MANUAL_ACCEPTANCE.md).

## Historical superseded full-stem acceptance record

The following sections preserve the earlier full-stem evidence and its original
limits. They must not be read as the current V1 audio contract.

### Historical baseline

- Starting branch: `overhaul/v1-final-acceptance-responsive-jail` (clean).
- Starting SHA: `9523161f7a6562b189c9b112709b3f19e2afe78e`.
- Fetched `origin/main`: `68c364d2b88aaa24edfafa16d9157672c3099e31`.
- Audio branch: `codex/v1-final-audio-closeout`.
- Final code-bearing SHA: `66c46b631886b7fa899bb619563f78571fc8108d`.
- Relevant history: `327d783` touch unlock; `c678d34` adaptive procedural BGM;
  `6921ea2a59870d30f65cf5d13bd604ad3985837c` rendered-stem architecture;
  `9523161` temporary fallback/presence gate. The current pass removes that
  temporary fallback. No history rewrite, main merge, or release occurred.

### Historical acceptance status

| Area | Result | Evidence / limitation |
| --- | --- | --- |
| Runtime architecture | PASS (code/unit scope) | Existing shared AudioContext, buses, public-state intensity/hysteresis, phrase transitions, visibility, room cleanup, cache/disposal retained. Real-asset playback remains blocked. |
| Production assets | FAIL / BLOCKED | All four required files missing; no substitute generated. |
| Asset validation | FAIL | Real repository inspection lists four missing files. Validator's own real-FFmpeg regression passes. |
| Browser tests | FAIL overall | Unchanged multiplayer/resume/settings flow passes in both engines; added real-asset checks fail in both because OGG paths return `text/html`. |
| Electron packaged playback | BLOCKED / NOT RUN | Production package command stops at the asset gate. New real `app://` fetch/decode proof compiles but has no fresh valid package to test. No stale artifact used. |
| SFX regression | PASS (automated) | Full client suite; every registered cue routes through SFX; presentation-tail stop preserves UI, unrelated gameplay cues, and BGM. Audible masking unverified. |
| Performance/memory | BLOCKED for target acceptance | Cache/disposal unit checks pass. Estimated 204.55 MiB PCM at 48 kHz; no production/mobile memory measurement. |
| CI | FAIL | Exact code SHA tested on Linux, Windows, and macOS. All fail on missing stems; no packaged artifacts. |
| Human listening | PENDING HUMAN ACCEPTANCE | No human listening approval supplied. |

### Historical production soundtrack and measurements

All paths below are under `apps/client/public/audio/music/gameplay/`.

| Stem | File | Size | Sample rate | Channels | Duration | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| Foundation | `gameplay-foundation.ogg` | MISSING | N/A | N/A | N/A | N/A |
| City | `gameplay-city.ogg` | MISSING | N/A | N/A | N/A | N/A |
| Wealth | `gameplay-wealth.ogg` | MISSING | N/A | N/A | N/A | N/A |
| Competition | `gameplay-competition.ogg` | MISSING | N/A | N/A | N/A | N/A |

Production LUFS, true peak, full-density headroom, and loop-seam measurements:
**NOT MEASURABLE**. The [export specification](GAMEPLAY_MUSIC_STEM_EXPORT_SPEC.md)
records the exact contract, thresholds, and JSON measurement command. Test noise
is temporary validator input only; none is shipped or reported as a soundtrack.

The source search covered tracked/ignored repository assets, generated/client
output, local Music/Downloads audio and session formats, common installed
DAW/sample-library locations, and callable music-generation tools. No matching
composition, commissioned exports, production library, or generation tool was
available. Existing personal music files were not licensed project sources.

External production options were investigated without acquiring content:
[Spitfire's commercial-recording guidance](https://support.spitfireaudio.com/en/articles/11815239-are-spitfire-audio-sample-libraries-royalty-free-and-can-i-use-them-on-commercial-recordings)
requires a licensed library; none was installed here. The Cambridge multitrack
catalog request returned HTTP 403 and supplied no usable source or confirmed
redistribution rights. FFmpeg provides encoding/inspection, not the required
composition or believable instrumental performances. Supply the four aligned
production exports and their source/redistribution license to resolve this P0.

### Historical implementation and automated evidence

- `AudioEngine.ts` / tests: rendered-only playback, permanent versus transient
  failures, one later activation retry, successful decode reuse, clean rapid
  room re-entry, adaptive and SFX regression assertions. Deleted `legacyMusic.ts`.
- Client validator/check scripts: actual Vorbis decoding, exact timelines,
  nonzero data, hashes, loudness/true peak, unity-sum mix, seam screen, build-copy
  comparison. No new npm/runtime dependency or lockfile change.
- Package scripts/workflows: normal client tests and builds require assets;
  CI installs FFmpeg and runs on `codex/**`; packaged audio proof added to the
  existing desktop and release-candidate workflows.
- Desktop proof: hidden sandboxed renderer uses the production `app://` handler,
  checks all four real bodies/MIME and decoded timelines. It does not bypass
  autoplay or claim audible playback.
- E2E: original broad flow preserved; added asset and supported-Web-Audio proof.
  This Windows WebKit build has no AudioContext API. The observer handles that
  case and records fallback-only evidence without skipping tests. It cannot
  establish physical Safari decoding or sound.
- `audio-review.html`: development-only controls using the actual AudioEngine;
  omitted from Vite release output. Chromium/WebKit UI smoke passes; no listening
  approval or missing-asset playback claim.

Commands were run from the repository root unless stated otherwise. Windows
sandbox `spawn EPERM` occurred in some initial runners; the same narrow gates
were rerun through the approved host path. Final results below use those runs.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS, all workspace packages |
| `pnpm lint` | PASS |
| `git diff --check` | PASS |
| `pnpm test:music-validator` | PASS 1/1 with real local FFmpeg; also passed as the first stage of `pnpm test` (38.6 s, zero skips) |
| `pnpm validate:music-assets` | FAIL, four required files missing |
| `pnpm test` | FAIL at required client asset gate; validator 1/1 and desktop 70/70 passed first |
| `pnpm --filter @monopoly/client test` | FAIL at required asset gate, not a unit-suite pass |
| `pnpm --filter @monopoly/client exec vitest run --environment jsdom --pool=vmThreads --maxWorkers=1 --no-file-parallelism` | PASS 98 files / 586 tests; diagnostic unit evidence only |
| `pnpm --filter @monopoly/desktop test` | PASS 14 files / 70 tests |
| `pnpm --filter @monopoly/server test -- --pool=threads --no-file-parallelism --maxWorkers=1` | PASS 170, 11 database tests skipped without TEST_DATABASE_URL; superseded by next run |
| `pnpm --filter @monopoly/server exec tsx ../desktop/generated/audio-closeout-server-tests.mts` | PASS 13 files / 181 tests with disposable managed PostgreSQL, zero skips; instance stopped; developer database untouched |
| `pnpm build` / `pnpm --filter @monopoly/client build` | FAIL asset gate after successful TypeScript/Vite bundling; fresh output contains none of the four OGGs |
| `pnpm --filter @monopoly/desktop compile` | PASS; existing CJS/import.meta warnings remain |
| `pnpm desktop:package` | FAIL at renderer asset gate before Forge packaging |
| `pnpm exec playwright test` | 2 broad-flow PASS, 2 audio FAIL; fresh output used despite overall build failure |
| `pnpm exec playwright test --grep 'real rendered music'` | Final focused run: FAIL 2; both engines immediately report Foundation `text/html` instead of `audio/ogg` |
| `node apps/desktop/generated/audio-review-smoke.mjs` | PASS Chromium/WebKit review-page UI; no audible evidence |
| `pnpm --filter @monopoly/desktop proof:packaged:audio` | NOT RUN: no fresh valid package; compiling the proof is not packaged evidence |

Generated diagnostic runners/screenshots remain under ignored
`apps/desktop/generated/`. Final audio-failure traces are in
`apps/desktop/generated/audio-closeout-browser-results-20260906/`.

The local FFmpeg/ffprobe 9.0.1 tool ZIP came from the Windows build linked by
[FFmpeg](https://ffmpeg.org/download.html) to
[Gyan](https://www.gyan.dev/ffmpeg/builds/), with its published SHA-256 verified:
`fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9`.
Set `FFMPEG_PATH` and `FFPROBE_PATH` to their installed executables when they are
not on PATH. These tools are not packaged with the game.

### Historical memory and lifecycle

At 48 kHz: `round(48000 * 256 * 60 / 110) = 6,702,545` frames per stem.
Float32 stereo costs 53,620,360 bytes/stem; four buffers cost 214,481,440 bytes
(204.55 MiB), plus browser/decoder/encoded-data overhead. Device sample-rate
resampling can change that cost. This is calculated capacity, not a measurement
or confirmation that target mobile memory is acceptable.

Successful stems decode once per context and share cached AudioBuffers across
room sessions. Repeated state/intensity updates do not refetch or create source
sets. A failed optional request can recover for the next room; an already-playing
Foundation is not restarted. Disposal drops caches and closes context. No
streaming rewrite was justified by the available evidence.

### Historical CI

Code commit pushed: `66c46b631886b7fa899bb619563f78571fc8108d`.
The following completed runs all report that exact `headSha`:

| Workflow / run | Job ID | Result |
| --- | --- | --- |
| [CI / 34036013902](https://github.com/tvghung/monopoly/actions/runs/34036013902) | `101494101375` (`build`) | FAIL at Test: four missing stems. Typecheck, lint, migrations, validator regression 1/1, and desktop tests 70/70 passed. Build not reached. |
| [Desktop Build / 34036013908](https://github.com/tvghung/monopoly/actions/runs/34036013908) | `101494101330` (`Desktop (macos-latest)`) | FAIL at Build renderer: four missing stems. Workspace/desktop typechecks and desktop tests passed. |
| [Desktop Build / 34036013908](https://github.com/tvghung/monopoly/actions/runs/34036013908) | `101494101480` (`Desktop (windows-latest)`) | FAIL at Build renderer: four missing stems. Workspace/desktop typechecks and desktop tests passed. |

Desktop packaging, packaged runtime/audio proof, browser CI steps, and artifact
uploads were not reached. The Desktop Build artifact API reports **0 artifacts**.
Release Candidate was not dispatched because the required asset gates fail.
This acceptance document is a subsequent documentation-only commit; the table
identifies the tested code-bearing commit, not a claim about a different SHA.

GitHub commands must include `--repo tvghung/monopoly`: this checkout's CLI default
resolves to the upstream fork parent. Initial default-target queries/dispatch
attempts returned upstream permission/not-found errors and are not CI evidence
for Own the Block. Explicit fork queries confirmed the automatic runs above.

No merge or release occurred. Failing asset gates must stay failing until real
assets exist.

### Historical listening procedure after technical blockers are cleared

1. Run the asset, production build, browser, and fresh packaged proof gates above
   successfully before requesting final listening acceptance.
2. Run `pnpm --filter @monopoly/client dev`; open
   `http://127.0.0.1:5173/audio-review.html`. This standalone development page
   needs no game server and uses one AudioEngine/context.
3. Click **Start / resume**. Select each arrangement: 0 Foundation; 1 adds City;
   2 adds Wealth; 3 adds Competition. Wait up to 10 seconds for a phrase-boundary
   transition. For immediate comparison: Stop, choose a level, then Start.
4. Check Master/Music zero, independent SFX volume, and Dice/Money/UI buttons.
   Hide/show the tab and Stop/Start again. Listen through at least two full loop
   cycles (approximately 4 minutes 40 seconds) for seam and fatigue judgment.
5. For normal gameplay after a successful package, run
   `pnpm desktop:run:packaged`, choose Host, join with another player, and play
   normally. Lobby/early game begins at Level 0; ownership, development, turns,
   and public financial/elimination pressure raise intensity with hysteresis.
   Use normal buy/build/card/jail/turn/victory actions to judge SFX clarity.
6. Physical iPhone Safari audio: **RETEST REQUIRED**. Human listening remains
   **PENDING HUMAN ACCEPTANCE**; final V1 acceptance stays **HOLD**.

### Historical human acceptance checklist

- [ ] Instruments sound believable and do not have cheap General-MIDI character
- [ ] Piano sounds warm and natural enough for V1
- [ ] Marimba supports the identity without becoming annoying
- [ ] No repetitive bright/high-pitch lead dominates
- [ ] Melody is memorable but not nursery-like
- [ ] Level 0 is pleasant alone
- [ ] Level 1 feels more alive without sounding like a track switch
- [ ] Level 2 feels richer/prosperous
- [ ] Level 3 adds competition/tension without becoming battle music
- [ ] Intensity changes are musically smooth
- [ ] Dice remain clear over music
- [ ] Money/property/card/build/jail SFX remain clear
- [ ] UI sounds remain clear
- [ ] Loop point is not obvious
- [ ] At least two consecutive full loop cycles remain comfortable
- [ ] No obvious listening fatigue
- [ ] Overall soundtrack no longer feels cheap/fake

Release recommendation: **NOT READY FOR V1 RELEASE**.
