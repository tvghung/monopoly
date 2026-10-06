# V1 Release Contract

Current release source of truth. Historical phase records retain their original
versions, protocol values, proof SHAs, and acceptance limits.

## Product identity

```text
Product: Own the Block
Release: V1
Semantic version: 1.4.0
Socket protocol: 11
```

Application semantic version and network protocol version are independent.
Root `package.json` supplies the product version to desktop release metadata and
Electron Forge. Root, client, server, desktop, and shared packages are private
workspace packages aligned at the semantic version above; no independent package
versioning contract was found. `packages/shared/src/types.ts` owns the protocol.
Client authentication and server admission both import that shared constant.

## Supported V1 architecture

- Desktop: Electron host/client; Windows x64, macOS x64 and macOS arm64 are the
  configured release-candidate targets. This is a target contract, not certification.
- Multiplayer: LAN-first. The desktop host owns the authoritative server runtime;
  browser/mobile devices join through its LAN URL. No public cloud server is
  required for V1. Existing explicit endpoint overrides remain available.
  _V1.1 (owner feedback, branch `overhaul/v1-1-feedback`):_ a desktop guest finds
  the Host from the room code alone through a request/response UDP lookup on port
  `41234` (desktop Host profile only; no token, hash or player data on the wire;
  the cloud server is untouched), with a pasted invitation link as the fallback
  for networks that block broadcast. This reverses the Phase 7.2 decision to ship
  no UDP discovery; the contract is in
  [Api/http-runtime.instruction.md](../monopoly-websockets/Api/http-runtime.instruction.md#lan-room-lookup-desktop-host-profile-only).
  The `1.0.0` release record at the end of this file is unchanged by it.
- Persistence: managed local PostgreSQL for the desktop host, bound to loopback
  only. Database credentials remain inside the host runtime.
- Client: React/Vite, used by the Electron renderer and LAN browser client.
- Gameplay authority: server-side; Pass A changes no gameplay or network behavior.

Implementation references: `apps/desktop/src/hostRuntime.ts`, `managedPostgres.ts`,
`apps/client/src/network/createSocket.ts`, `apps/server/src/socket/index.ts`, and
`.github/workflows/release-candidate.yml`.

## Packaging identity

Forge uses the root package version for app metadata and the Windows Squirrel
name: `OwnTheBlock-1.2.0-win32-x64-Setup.exe`. The installed Forge DMG maker resolves
`Own the Block-1.2.0-x64.dmg` and `Own the Block-1.2.0-arm64.dmg` from app name,
desktop package version, and target architecture. The application and collected
manifest derive their version from package metadata. These are configuration expectations,
not claims that new artifacts were built. Release metadata rejects mismatched
application package versions; signing/notarization semantics remain unchanged.

## Package size

The packaged app is kept lean on purpose, because players download the installer:

- `app.asar` holds only the compiled desktop main/preload code and `package.json`. `forge.config.cjs` ignores
  `generated/`, `src/`, `tests/` and `scripts/`; the managed PostgreSQL and the server helper ship once, as the
  `resources/postgres` and `resources/server-helper` extraResource copies that the packaged app reads from
  `process.resourcesPath`. Before this rule `generated/` was packed into `app.asar` as well, a 139 MiB duplicate.
- The PostgreSQL runtime is the pinned EDB archive minus the `runtimeExclude` patterns of
  `apps/desktop/postgres-resources.json`: link-time libraries, `lib/pgxs`, `lib/pkgconfig` and, on Windows, the StackBuilder GUI
  and the DLLs that are not in the import closure of `initdb`, `postgres`, `pg_ctl`, `pg_isready`, `createdb` and `psql`.
  `preparePostgres.mjs` runs `postgres --version` on the pruned copy. The client tools, `share/` and the server modules stay.
- Electron's Windows build keeps `en-US.pak` and `vi.pak` only (the game is Vietnamese-only); macOS locale bundles are listed
  in the build log, not removed.
- The macOS disk image is LZMA-compressed (`format: 'ULMO'`, macOS 10.15 and later; Electron 43 needs macOS 12), and Desktop
  Build and Release Candidate run `hdiutil verify` on it.
- `pnpm --filter @monopoly/desktop proof:packaged:budget` runs after the packaged proofs in Desktop Build and Release Candidate.
  It fails when `app.asar` packs a development folder or exceeds 5 MiB, when an excluded PostgreSQL file or an extra locale
  ships, when a required binary is missing, or when an installer is over its budget (Windows `Setup.exe` 175 MiB, macOS `.dmg`
  195 MiB).
- The workflows upload only the installers and no longer install ffmpeg: nothing in the repository calls it.

Measured on Windows x64 (V1.1.0 sources): `Setup.exe` 249.7 MiB before, 181.9 MiB after these rules and 160.6 MiB once the
music is Ogg Vorbis (see the audio policy); unpacked app 655.6 MiB before, 425.5 MiB after the packaging rules and 402.4 MiB
with the Ogg music; `resources/postgres` 134.5 MiB before, 89.2 MiB after. The packaged runtime proof, the Host proof and the
audio, card and landmark proofs pass on the lean package. macOS (Apple silicon, Desktop Build artifact): the disk image was
378.1 MiB, 236.2 MiB with the packaging rules and the Ogg music (LZFSE) and 173 MiB with LZMA.

## Release publication

A release is published by pushing the annotated tag `v<semver>` (`v1.2.0` for `1.2.0`) on a commit that is on `main`;
the README section "Publishing a release" has the commands. The `Release Candidate` workflow
(`.github/workflows/release-candidate.yml`) reacts to the tag:

1. It first checks that the tag equals the root `package.json` version and that `.github/release-notes/<tag>.md` exists.
2. The quality job and the three target jobs (Windows x64, macOS x64, macOS arm64) run every gate and packaged proof
   that a manual dispatch runs, in `unsigned-validation` mode and without an endpoint override (LAN-first).
3. Only when all four jobs pass does the `publish` job run `apps/desktop/scripts/stageReleaseAssets.mjs`. It keeps exactly
   `OwnTheBlock-<version>-win32-x64-Setup.exe`, `OwnTheBlock-<version>-macos-x64.dmg` and
   `OwnTheBlock-<version>-macos-arm64.dmg` plus the Windows Squirrel update feed (`RELEASES` and
   `own_the_block-<version>-full.nupkg`), each checked against the checksum in the `manifest.json` of the build job that
   made it (and `RELEASES` must be the single line that describes exactly that package: name, size and SHA-1), and writes
   `SHA256SUMS.txt` and `update-manifest.json` (see "In-app updates"). It then creates the GitHub Release as a draft,
   uploads those seven files and publishes it. A tag with a suffix (`v1.0.1-rc.1`) becomes a pre-release.

A manual `workflow_dispatch` of the same workflow stays a validation run: it uploads workflow artifacts and publishes
nothing. `signed` mode exists only for that dispatch; a tag run is always unsigned, so a signed release needs a workflow
change once signing secrets exist. `apps/desktop/tests/stageReleaseAssets.test.ts` covers the staging step; the publish
job itself is exercised only by a real tag run, and its result is recorded in the release record below.

Workflow artifacts carry what a player installs and what the in-app updater applies. The Windows release carries the
Squirrel update feed next to the `Setup.exe`: `RELEASES` and the full `own_the_block-<version>-full.nupkg` (160.5 MiB, the
same bytes the `Setup.exe` embeds), because an installed app updates in place with Squirrel's `Update.exe --update` from
exactly those two files (running the `Setup.exe` over a running install deletes the running version; see "In-app updates").
So the Release Candidate artifact of Windows holds the `Setup.exe`, the `.nupkg`, `RELEASES` and `release-artifacts/`
(`manifest.json`, `SHA256SUMS`), and the macOS ones their disk image and `release-artifacts/`. The Desktop Build artifacts
(`own-the-block-windows-setup`, `own-the-block-macos-dmg`) hold the installer alone and expire after 14 days: they are for
inspection and are not a release path. Desktop Build no longer runs for documentation-only changes; the `CI` workflow
still validates the release contract on every push.

## In-app updates

The desktop app finds, downloads and applies a newer release by itself. Module guide:
[Client/app-update.instruction.md](../monopoly-websockets/Client/app-update.instruction.md); design record and the options
that were rejected: [auto-update/README.md](../auto-update/README.md).

- **Feed.** Every release carries `update-manifest.json`, written by `stageReleaseAssets.mjs` from the files it just
  staged (version, `minimumSupportedVersion`, and per target the installer's name, size and SHA-256; the Windows entry also
  lists the Squirrel `RELEASES` file and the full `.nupkg` the same way). The app reads
  `https://github.com/tvghung/monopoly/releases/latest/download/update-manifest.json`. "Latest" is the newest release that
  is neither a draft nor a pre-release, so an `-rc` tag never reaches players. The manifest holds no URL: the app builds the
  download URL from the version and the file name and trusts only GitHub hosts over HTTPS. The Squirrel feed makes a release
  one installer-sized file (the `.nupkg`) larger: the product owner accepted that on 2026-10-05 in exchange for updating a
  running install in place. A Windows release whose manifest lacks the `squirrel` block cannot update an installed app
  (a failed check; nothing locks).
- **Policy.** `apps/desktop/update-policy.json` holds `minimumSupportedVersion`: a running version below it must update before it
  starts or joins multiplayer ("mandatory"). Raise it only when an older version cannot play with the new one (a socket
  protocol change), never for a bug fix. The file also holds `reviewedForSocketProtocol`; `pnpm validate:v1-contract` fails when it
  differs from `SOCKET_PROTOCOL_VERSION`, when the minimum is above the release version, or when the file is missing, so a
  protocol change cannot ship before someone has decided what it means for older versions.
- **Windows (installed by `Setup.exe`).** The app downloads `RELEASES` and the `.nupkg` (SHA-256 verified), then runs
  Squirrel's own `Update.exe --update=<folder>` while the game is open: the new version is unpacked next to the running one
  (about 12 s for the 160 MiB package, measured), the running version is left alone, and Squirrel's
  `Update.exe --processStartAndWait` starts the new version once the app has exited. The downloaded `Setup.exe` is never run
  over a running install: it deletes the install folder first, the running version included (measured). Squirrel's update is
  not transactional, so the app runs it inside a guard that puts the install folder back exactly as it was when the update
  fails (a failed update otherwise leaves an empty `app-<new>` folder that stops the shortcut from opening the game), and it
  requires the new version's executable to exist before it quits. **macOS** builds are not signed, so the app cannot replace
  itself (Squirrel.Mac requires a signature): the disk image is downloaded and verified in the app and then opened for the
  player to drag from. Full automation on macOS needs an Apple Developer ID.
- **Never in the middle of a game.** A restart is offered only on the start screen with no LAN room of this machine open;
  in a lobby or a game an update may download, and a toast says it waits.
- **Fails open.** A check that cannot read the feed changes nothing (no dialog, no lock). A mandatory update is known only
  once the feed has been read and is not remembered across runs, so a LAN with no Internet is never locked out; the server
  already refuses an incompatible protocol with `UPGRADE_REQUIRED`.
- **Bridge release.** A version without the updater (1.1.1 and earlier) cannot learn about updates: players install the
  first release that has it by hand once.
- **Evidence.** The state machine, the verified download, the manifest contract, the Squirrel guard and the screens are
  automated (see `testcase/http-runtime-and-deployment.md`). On 2026-10-05 the real Windows path ran once on a differently
  named test package (`own_the_block_updatetest`, installed by its own `Setup.exe`, update feed on loopback, the app's temp
  folder named with a space and an accent; uninstalled afterwards, the real 1.1.1 install was not touched): an update that
  Squirrel refuses leaves the install folder byte-identical and the shortcut still opens the old version; the real update
  downloads `RELEASES` and the package (never the `Setup.exe`), the old game keeps answering while Squirrel unpacks, quits
  by itself and the new version is running 19.7 s after the click, with the shortcuts and the uninstall entry on the new
  version, and it does not offer itself again. The macOS flow, an update killed half way by the system and the first tag run
  that publishes the feed are not covered; the rows are open there and in
  [V1_FINAL_MANUAL_ACCEPTANCE.md](V1_FINAL_MANUAL_ACCEPTANCE.md#in-app-update).

## Audio release policy

V1 gameplay music is exactly one rendered looping track:
`apps/client/public/audio/music/own-the-block-main-theme-loop.ogg`. The client
decodes one looping `AudioBuffer` and starts it only while authoritative room
status is `IN_PROGRESS`; lobby, finished, and replay-lobby states are silent.
There is no procedural BGM fallback and no adaptive multi-stem soundtrack.

Since 1.1.1 the track ships as stereo 48 kHz Ogg Vorbis at about 160 kbit/s (2.76 MiB), encoded from the original
production render with ffmpeg `libvorbis`; the PCM WAV (25.9 MiB) that 1.0.0 and 1.1.0 shipped remains in the `v1.1.0`
tag. The loop is one buffer, so its length is part of the contract: the stream declares exactly 6,781,091 frames
(141.272729 s), the same as the WAV, and Chromium decodes exactly that many (the packaged audio proof compares the
decoded frame count with the container's, and `apps/desktop/tests/oggVorbisMetadata.test.ts` pins the shipped file).
Measured against the WAV, the loop seam is the same size as in the original (a 1.7 k step against a 3 k 99th-percentile
sample delta) and the codec error in the first and last 64 frames is at most 416 of 32768. The loop seam by ear stays a
manual acceptance row.

Browser limit: `decodeAudioData` reads Ogg Vorbis in Chromium and Firefox; Safari and iOS only gained Ogg Vorbis recently
(18.4, per caniuse), so an older Safari or iOS browser that joins a Host by its URL cannot decode the track and plays the
game without music (the sampled sound effects, which were already Ogg, fall back to their procedural versions there). The
desktop app is Chromium and is not affected. A product owner who needs music on those browsers would have to ship a second
format (AAC or MP3) and give up part of the size saving.

The existing Audio/Music/SFX buses, settings, visibility handling, context
reuse, and disposal remain in force. Curated local sample SFX and deliberately
light procedural SFX remain valid; sampled cues may retain their designed
procedural fallback. Source provenance is recorded in
`apps/client/public/audio/SOURCES.md`.

`pnpm validate:music-assets` is the source/build asset gate and packaged audio
proof remains separate. Synthetic fixtures are allowed only in isolated tests;
they must never be promoted into production soundtrack content. Automated
checks do not constitute human listening, device, signing, notarization, or
release approval.

## Card presentation contract

Landing on Chance (`CƠ HỘI`) or Khí Vận (`KHÍ VẬN`) immediately takes the top
private card, creates a durable operation with `stage: REVEALED`, publishes its
card ID/message, and records `CARD_REVEALED`. The card effect is not applied at
landing. The client shows the real artwork, title, deck badge, and authoritative
message in a DOM modal; there is no player Draw step, face-down wait, flip, spin,
or focused WebGL card canvas.

Visual overhaul V2 (plan 04) restyled this surface without touching the contract: the card is the shared `Modal` primitive on
its card layer (z-index above ordinary dialogs, below toasts and the connection overlay), drawn as a printed card (deck
frame, emblem, badge, artwork, message, one `Đóng`). The entrance is a 320 ms translate, slight rotation and fade (a 120 ms
fade with reduced motion); there is still no flip, spin or Draw step. `data-testid="card-interaction-overlay"` and
`data-card-stage="REVEALED"` now sit on the stage element inside the dialog. Every clause of this section is still covered by
`CardInteractionOverlay.test.tsx` and re-reviewed manually at gate G4.

Only the acting player can press the visible `Đóng` button. Dismissal is an
operation-scoped authoritative command: it applies the existing card effect,
rotates ordinary cards only after application, preserves jail-free ownership
semantics, and continues the existing turn flow exactly once. Duplicate or
stale dismissals cannot apply a second effect. A normal `REVEALED` operation
waits indefinitely for dismissal; its operation ID, card ID, message, and
deadline survive reconnect/session hydration. Persisted `AWAITING_DRAW` records
are retained only for protocol-9 compatibility and may be promoted by the
server scheduler; the current client does not expose or emit Draw.

All 28 shared Chance/Khí Vận cards have one exact `CardVisualDefinition` and an
original local SVG under `apps/client/public/art/cards/`. The card-art validator
checks exact deck coverage, safe SVG content, build copies, and packaged
renderer resources. The development-only gallery is available at
`http://127.0.0.1:5173/?phase4-uat=1&card-gallery=1` after starting the client;
it is a visual-review aid, not production navigation or automated acceptance. It draws each card face with the same
artwork, title and message as the V2 card modal.

## Baseline and enforcement

- Historical `origin/main`: `68c364d2b88aaa24edfafa16d9157672c3099e31`.
- Authorized V1 release-line / Pass A baseline:
  `abe66e62b8593b4442cda55fe70c6804aaed06c1`.
- Pass A branch: `codex/v1-release-contract`; existing release-line commits are
  prerequisites, not Pass A changes.
- `pnpm validate:v1-contract` checks package identity, protocol declaration, the
  stable fields above, the Phase 7.2 historical notice, and obsolete product
  literals in current scripts/configuration. `pnpm test:v1-contract` uses isolated
  temporary fixtures. CI and desktop release metadata enforce the same gate.
- [Phase 7.2 engineering evidence](07C_PHASE_7_2_FINAL_ENGINEERING.md) remains
  historical V8 evidence at its original proof SHAs.

## Pass A identity audit

Global searches covered product names, artifact prefixes, both semantic versions,
the shared protocol identifier, protocol 8/9 wording, and general `version`
references across tracked files, including the lockfile and release tooling.

| Match group | Classification / disposition |
| --- | --- |
| Root/client/server/desktop/shared package identity | CURRENT RELEASE CONTRACT: root and desktop normalized; other packages already aligned. |
| Forge, desktop release/config/collection scripts, workflows, README | CURRENT RELEASE CONTRACT: metadata-derived artifact naming retained; contract gate added. |
| Shared protocol declaration, client authentication/acks, server admission/public state/acks, current Shared/API/Client instructions | CURRENT RELEASE CONTRACT: shared protocol 11 for 1.4.0 (lobby seats and kick); 1.3.0 shipped protocol 10 (Teamplay) and 1.2.0 protocol 9. |
| Phase 1–7 reports, masterplan checkpoint entries, old installer names/hashes, Phase 7.2 V8 tables, V1 audio acceptance evidence | HISTORICAL EVIDENCE: facts retained; Phase 7.2 linked to this contract. |
| Client/desktop runtime tests with old app versions; server protocol compatibility tests; presentation/UAT fixtures | TEST FIXTURE: isolated values retained. The desktop metadata test reads the real repository and therefore now expects V1. |
| Dependency/devDependency fields and pnpm lockfile resolutions (including matching version substrings) | DEPENDENCY VERSION: unchanged; frozen install requires no lockfile regeneration. |
| Snapshot/storage/settings/schema/migration versions, PostgreSQL binary version, XML headers, general branding and tool-version references | UNRELATED to product semver: retained. Snapshot version 10 is not Socket protocol 11. |

## V1.0.0 release decision

On 2026-10-02 the product owner decided to release V1 ("thôi hãy publish v1 luôn đi, tôi chốt sổ r release v1 nhé"), after
the agent ran the packaged Windows app (built from the merged `main`) and the development demo pages for them to try.
The agent wrote this section on that instruction. The owner did not itemise the manual checklist, so no row of
[V1_FINAL_MANUAL_ACCEPTANCE.md](V1_FINAL_MANUAL_ACCEPTANCE.md) was ticked: a tick means a person observed the item.

V1 is released **unsigned** and with the gates below still open. The owner accepted them as known limitations; they are
open work, not closed evidence.

- The V1 manual acceptance rows (audio, cards, multiplayer, desktop) and the human audio listening record
  (`V1_AUDIO_HUMAN_ACCEPTANCE.json` stays `accepted: false`).
- Windows Authenticode signing and Apple signing/notarization: no certificate or Apple credentials exist. Windows SmartScreen
  and macOS Gatekeeper warnings are expected and explained in the release notes.
- macOS install and run on a physical Mac, real OS firewall prompts, and install/upgrade/uninstall evidence.
- Visual overhaul V2 open items: the benchmark on a reference device, the `balanced` tier decision on integrated GPUs (about
  30 FPS on an Intel UHD 630 stress fixture), the G3 five-second test and the look at the packaged window.

### Release record

| Item | Value |
| --- | --- |
| Tag | `v1.0.0` (annotated), on commit `de38f7a` of `main` |
| Workflow run | Release Candidate #3 (`36981843076`), started by the tag push: success in 13m 43s. Quality gates 3m 3s; the Windows x64, macOS x64 and macOS arm64 jobs passed; `publish` 1m 11s |
| Release | `https://github.com/tvghung/monopoly/releases/tag/v1.0.0`, "Own the Block v1.0.0", marked Latest, published 2026-10-02 08:16 UTC by the workflow token |
| Distribution mode | `unsigned-validation` (signing BLOCKED, notarization BLOCKED/NOT RUN, as accepted above) |

| Asset | Size | SHA-256 shown by GitHub |
| --- | --- | --- |
| `OwnTheBlock-1.0.0-win32-x64-Setup.exe` | 250 MB | `e36faef7c1d14ffdc507cb611e428cc64756f45828db668df43579486fc599e6` |
| `OwnTheBlock-1.0.0-macos-x64.dmg` | 380 MB | `4fccf94a4f46881393bd156bddff608c77d9b3a495dae261739bf668ac7a0425` |
| `OwnTheBlock-1.0.0-macos-arm64.dmg` | 378 MB | `e25f474ed7bdb5f7b63ff91eaacc1c5625f9b75535d7f07026368a30c210af67` |
| `SHA256SUMS.txt` | 302 bytes | `49413d30a90592b438714d25f243b6b9b1762f57747d25304b804fbe3b9c2b8b` |

The installers were built, passed the packaged proofs on CI and were published by the workflow. This record does not claim
that anyone installed them from the release page on a machine; that and the open gates above stay separate evidence.

## V1.1.0 release decision

On 2026-10-03 the product owner answered the question "Gộp vào main và phát hành v1.1.0" in chat after the agent reported that
all twelve post-release feedback items were implemented, with CI and Desktop Build green on commit `65d4855`. The program
register is [../v1-1-feedback/README.md](../v1-1-feedback/README.md). `1.1.0` keeps Socket protocol 9 and room snapshot
schema 8; the only wire change is an optional `price` on a forced-sale proposal. The agent wrote this section on that decision.

`1.1.0` is released **unsigned**, with the gates of `1.0.0` still open and with new manual rows unobserved: the V1.1 rows of
[V1_FINAL_MANUAL_ACCEPTANCE.md](V1_FINAL_MANUAL_ACCEPTANCE.md) (LAN room lookup on real networks and firewalls, the main menu and
way back, the debt window timing) and the manual rows in `testcase/`. A tick means a person observed the item, so none was
ticked. The UDP room lookup was exercised by automated tests and CI only, not on physical Wi-Fi networks.

### Release record (1.1.0)

| Item | Value |
| --- | --- |
| Tag | `v1.1.0` (annotated), on commit `65d4855` of `main` |
| Workflow run | Release Candidate #4 (`37136762248`), started by the tag push: success in 9m 37s. The CI (#156) and Desktop Build (#133) runs of the same commit on `main` also passed |
| Release | `https://github.com/tvghung/monopoly/releases/tag/v1.1.0`, "Own the Block v1.1.0", marked Latest, published 2026-10-03 16:34 UTC by the workflow token |
| Distribution mode | `unsigned-validation` (signing BLOCKED, notarization BLOCKED/NOT RUN, as for 1.0.0) |

| Asset | Size | SHA-256 shown by GitHub |
| --- | --- | --- |
| `OwnTheBlock-1.1.0-win32-x64-Setup.exe` | 250 MB | `fb36513d4fed08cbbed1d4299c84e3810c16d4b4dcb540309d4f7f18bad75910` |
| `OwnTheBlock-1.1.0-macos-x64.dmg` | 380 MB | `84699f84b5b6a48de78b6627939615dfa5a9cbec41697b12147576027f79a2fa` |
| `OwnTheBlock-1.1.0-macos-arm64.dmg` | 378 MB | `c711052017ccaa147db108f7dc02950da0038c3afc5313e112efc9c0915fcf11` |
| `SHA256SUMS.txt` | 302 bytes | `103bb6d0ec76d202e8a1f5554d225dd184a02ac6bc75597911c08fe758c25a3e` |

As for `1.0.0`: the installers were built, passed the packaged proofs on CI and were published by the workflow; nobody is
recorded as having installed them from the release page.

## V1.1.1 release decision

On 2026-10-04 the product owner answered "Phát hành v1.1.1" in chat after the agent reported CI and Desktop Build green on commit
`a440528` and named the one regression it accepts: Safari and iOS before 18.4 cannot decode the Ogg Vorbis music, so a guest that
joins a Host by URL there plays without music. `1.1.1` is the size-reduction release (see "Package size" and the audio policy
above): it changes no gameplay, keeps Socket protocol 9 and room snapshot schema 8, and ships the visual evidence screenshots out of
`main` into the pre-release `evidence-visual-v2-2026-10-02` (Archive Evidence run `37147251894`, whose per-file checksums were
compared with the committed blobs before the PNGs were removed). The agent wrote this section on that decision.

`1.1.1` is released **unsigned**, with the gates of `1.0.0` and `1.1.0` still open and with new manual rows unobserved: the loop seam
of the re-encoded Ogg by ear, installing the smaller `Setup.exe` and disk images on real machines (host a LAN game, restart, uninstall),
and Safari/iOS behaviour. A tick means a person observed the item, so none was ticked.

### Release record (1.1.1)

| Item | Value |
| --- | --- |
| Tag | `v1.1.1` (annotated), on commit `a440528` of `main` |
| Workflow run | Release Candidate #5 (`37167178261`), started by the tag push: success in about 9 minutes, including the new `Check packaged size budget` step on all three targets and `Verify macOS disk image` on both macOS targets. The CI (#167) and Desktop Build (#143) runs of the same commit on `main` also passed |
| Release | `https://github.com/tvghung/monopoly/releases/tag/v1.1.1`, "Own the Block v1.1.1", marked Latest, published 2026-10-04 01:19 UTC by the workflow token |
| Distribution mode | `unsigned-validation` (signing BLOCKED, notarization BLOCKED/NOT RUN, as for 1.0.0 and 1.1.0) |

| Asset | Size | SHA-256 shown by GitHub |
| --- | --- | --- |
| `OwnTheBlock-1.1.1-win32-x64-Setup.exe` | 168,398,848 bytes (160.6 MiB) | `650a08d80a4248f1a3c74d2d54f4e5650b808ca27c3adb568d8d3c3b7fd0ba9f` |
| `OwnTheBlock-1.1.1-macos-x64.dmg` | 188,888,426 bytes (180.1 MiB) | `593ea8552b8ff1d61c2441ff303bb22bfad1a1e9cafd6d8dcdf9fbd87ae77dfc` |
| `OwnTheBlock-1.1.1-macos-arm64.dmg` | 181,756,558 bytes (173.3 MiB) | `a8b03c9d2f2006f5ecb7cc17f6b9c00c04ed523bac45c5ba39986182177ffc16` |
| `SHA256SUMS.txt` | 302 bytes | `52e1934b764f1e81fd2f452b3d9a113532218450909bbb59df5244a82c7389d6` |

Against `1.1.0` (250 / 380 / 378 MB): Windows 249.7 to 160.6 MiB (-36%), macOS Intel 379.8 to 180.1 MiB (-53%), macOS Apple silicon
378.1 to 173.3 MiB (-54%); the release assets total 514 MiB instead of 1,008 MiB. The Windows workflow artifact of a Desktop Build
went from 498.6 MiB to 160.6 MiB. Source repository: tracked files at `HEAD` 255.8 to 10.7 MiB and the source ZIP 248.5 to 6.6 MiB;
the full clone keeps its history (about 236 MiB) because history was deliberately not rewritten.

As for `1.0.0` and `1.1.0`: the installers were built, passed the packaged proofs on CI and were published by the workflow; nobody is
recorded as having installed them from the release page.

## V1.2.0 release decision

On 2026-10-05 the product owner answered "Đồng ý, cứ thử Squirrel thật rồi gỡ sạch. sau đó phát hành luôn nhé" in chat to the
agent's question whether it should run a real Squirrel install and update on the owner's Windows machine (a separately named test
copy of the app, uninstalled afterwards) and release after that. The agent ran it (see "In-app updates" and
[../auto-update/README.md](../auto-update/README.md), section 4), cleaned the machine up, and released on green CI and Desktop Build
on commit `45174b4`. `1.2.0` is the in-app updater release: it changes no gameplay, keeps Socket protocol 9 and room snapshot
schema 8, publishes the Squirrel update feed next to the Windows installer, and leaves `minimumSupportedVersion` at `1.0.0`
(nobody is forced). The agent wrote this section on that decision.

`1.2.0` is released **unsigned**, with the gates of `1.0.0`, `1.1.0` and `1.1.1` still open and with new manual rows unobserved: the
in-app update rows of [V1_FINAL_MANUAL_ACCEPTANCE.md](V1_FINAL_MANUAL_ACCEPTANCE.md#in-app-update) (macOS, a mandatory update, no
Internet at start, the network cut in the middle of a download, rooms and matches on real machines). A tick means a person observed
the item, so none was ticked. The first update through a real GitHub release can only happen from `1.2.0` to the next release.

### Release record (1.2.0)

| Item | Value |
| --- | --- |
| Tag | `v1.2.0` (annotated), on commit `45174b4` of `main` |
| Workflow run | Release v1.2.0 #6 (`37275876308`), started by the tag push: success in 9m 1s (quality gates 3m, Windows x64 4m 18s, macOS x64 5m 21s, macOS arm64 3m 6s, publish 34 s including `Stage the release files`, `Show the update manifest` and `Check that the update feed serves this release`). The CI (#179) and Desktop Build (#153) runs of the same commit on `main` also passed, as did CI #178 and Desktop Build #152 on the branch |
| Release | `https://github.com/tvghung/monopoly/releases/tag/v1.2.0`, "Own the Block v1.2.0", marked Latest, published 2026-10-05 07:15 UTC by the workflow token |
| Distribution mode | `unsigned-validation` (signing BLOCKED, notarization BLOCKED/NOT RUN, as for 1.0.0, 1.1.0 and 1.1.1) |

| Asset | Size | SHA-256 shown by GitHub |
| --- | --- | --- |
| `OwnTheBlock-1.2.0-win32-x64-Setup.exe` | 168,432,128 bytes (160.6 MiB) | `c756df87212ed3e7d850de4f9f8edb6e4403f19246eddf236bcf39febf738cc2` |
| `OwnTheBlock-1.2.0-macos-x64.dmg` | 188,944,150 bytes (180.2 MiB) | `8451b61b94e00d6177118f0b9e833117902afa99f528fe8d8648042528225efa` |
| `OwnTheBlock-1.2.0-macos-arm64.dmg` | 181,869,046 bytes (173.4 MiB) | `f78c78df1519724bf44c4577f9a191c6267965da8fe99d704974728170d34a1b` |
| `own_the_block-1.2.0-full.nupkg` | 168,281,752 bytes (160.5 MiB) | `604f5cc97d81ae44d5dd09cba694c73a1a0aca69df3266a40320f4d99307e7f6` |
| `RELEASES` | 84 bytes | `bf53c1e1c498b7b040d9a54f814f98bc65c217980e48aa9bb3e6cdf2ef18db13` |
| `SHA256SUMS.txt` | 474 bytes | `76042bc7cd4100c19bcacd86b23ba8eba55de137c750c97ddabd8d9c3b192d0c` |
| `update-manifest.json` | 1,090 bytes | `e7a7d1024b3a8b06d5b3b66d3d1e086b358eb90e8109ca6299a3c311c76d97dd` |

The release page holds 674.8 MiB in seven files (`1.1.1`: 514 MiB in four): the Squirrel feed adds the 160.5 MiB package and the
84-byte `RELEASES`, and the installers are the size they were (Windows 160.6 MiB, macOS 180.2 and 173.4 MiB). Checked after the
publish: `releases/latest/download/update-manifest.json` serves version `1.2.0` with the `squirrel` block, `minimumSupportedVersion`
`1.0.0`, and every size and SHA-256 in it equals the size and digest GitHub shows for the asset; `RELEASES` is the single line
`<SHA-1> own_the_block-1.2.0-full.nupkg 168281752`, which staging had already compared with the package.

As for the earlier releases: the installers were built, passed the packaged proofs on CI and were published by the workflow;
nobody is recorded as having installed them from the release page, and **no installed app has updated itself through this
release** (there is no newer release for it to find).

## V1.3.0 Teamplay release decision (Socket protocol 10, snapshot schema 9)

The release after `1.2.0` adds authoritative 2v2 Teamplay (see
[../monopoly-websockets/GameCore/team-play.instruction.md](../monopoly-websockets/GameCore/team-play.instruction.md)). It moves the
shared Socket protocol from 9 to 10 and the room snapshot schema from 8 to 9 (migration `010_teamplay_v9.sql`), so the contract
above names protocol 10 and a `1.2.0` client and a protocol-10 server refuse each other with `UPGRADE_REQUIRED`.
LAN discovery answers protocol 10 (`apps/desktop/src/lanFinder.ts`) and `apps/desktop/update-policy.json` records
`reviewedForSocketProtocol: 10`. `minimumSupportedVersion` is `1.3.0`: the 1.2.0 updater marks this update mandatory
before starting or joining multiplayer after it reads the release manifest. The server still rejects mismatched clients
when an old installation has no access to the update feed. The owner explicitly chose to ship without manual device UAT;
mobile E2E and visual capture are also skipped for this release. Manual checklist rows remain unticked.

## V1.4.0 lobby seats release decision (Socket protocol 11, snapshot schema 10)

The release after `1.3.0` finishes the 2v2 lobby and fixes two defects the owner reported (see
[../monopoly-websockets/GameCore/team-play.instruction.md](../monopoly-websockets/GameCore/team-play.instruction.md) and
[../monopoly-websockets/Api/socket-lobby.instruction.md](../monopoly-websockets/Api/socket-lobby.instruction.md)):

- the host can remove a player from the lobby (`kick player`, Solo and 2v2) and the removed player is told (`removed from room`);
- every member of a team renames their own team, nobody renames the other one (`set team name` carries only `{name}`);
- the host-driven `swap team` is gone; every seat of a 2v2 lobby can be taken (`move to seat`) or asked for (`request seat swap`,
  `respond seat swap`, `cancel seat swap`) and the player in the seat must accept; the seat order inside a team now orders the match;
- the revive window is 5 turns of the surviving teammate (it was 3);
- the coloured standee base is visible again on the tax tiles.

It moves the shared Socket protocol from 10 to 11 (a command was removed and a payload changed, so a `1.3.0` client and a protocol-11
server refuse each other with `UPGRADE_REQUIRED`) and the room snapshot schema from 9 to 10 (migration `011_lobby_seats_v10.sql`:
`Player.teamSlot`, `boardState.seatSwapRequests`). LAN discovery answers protocol 11 (`apps/desktop/src/lanFinder.ts`) and
`apps/desktop/update-policy.json` records `reviewedForSocketProtocol: 11`. `minimumSupportedVersion` is `1.4.0`, as it was raised to
`1.3.0` for the previous protocol change: a `1.2.0` or `1.3.0` updater marks this update mandatory before starting or joining multiplayer
once it reads the release manifest, and the server still rejects a mismatched client that cannot reach the update feed.

