# V1 Release Contract

Current release source of truth. Historical phase records retain their original
versions, protocol values, proof SHAs, and acceptance limits.

## Product identity

```text
Product: Own the Block
Release: V1
Semantic version: 1.1.0
Socket protocol: 9
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
name: `OwnTheBlock-1.1.0-win32-x64-Setup.exe`. The installed Forge DMG maker resolves
`Own the Block-1.1.0-x64.dmg` and `Own the Block-1.1.0-arm64.dmg` from app name,
desktop package version, and target architecture. The application and collected
manifest derive their version from package metadata. These are configuration expectations,
not claims that new artifacts were built. Release metadata rejects mismatched
application package versions; signing/notarization semantics remain unchanged.

## Release publication

A release is published by pushing the annotated tag `v<semver>` (`v1.1.0` for `1.1.0`) on a commit that is on `main`;
the README section "Publishing a release" has the commands. The `Release Candidate` workflow
(`.github/workflows/release-candidate.yml`) reacts to the tag:

1. It first checks that the tag equals the root `package.json` version and that `.github/release-notes/<tag>.md` exists.
2. The quality job and the three target jobs (Windows x64, macOS x64, macOS arm64) run every gate and packaged proof
   that a manual dispatch runs, in `unsigned-validation` mode and without an endpoint override (LAN-first).
3. Only when all four jobs pass does the `publish` job run `apps/desktop/scripts/stageReleaseAssets.mjs`. It keeps exactly
   `OwnTheBlock-<version>-win32-x64-Setup.exe`, `OwnTheBlock-<version>-macos-x64.dmg` and
   `OwnTheBlock-<version>-macos-arm64.dmg`, each checked against the checksum in the `manifest.json` of the build job
   that made it, and writes `SHA256SUMS.txt`. It then creates the GitHub Release as a draft, uploads those four files and
   publishes it. A tag with a suffix (`v1.0.1-rc.1`) becomes a pre-release.

A manual `workflow_dispatch` of the same workflow stays a validation run: it uploads workflow artifacts and publishes
nothing. `signed` mode exists only for that dispatch; a tag run is always unsigned, so a signed release needs a workflow
change once signing secrets exist. `apps/desktop/tests/stageReleaseAssets.test.ts` covers the staging step; the publish
job itself is exercised only by a real tag run, and its result is recorded in the release record below.

Workflow artifacts carry only what a player installs. The Squirrel `Setup.exe` already embeds the full `.nupkg`, and no
update feed is published (the app only runs the Squirrel install/uninstall shortcut hooks), so neither workflow uploads
the `.nupkg` or `RELEASES`: the Release Candidate artifact holds the target installer plus `release-artifacts/`
(`manifest.json`, `SHA256SUMS`), and the Desktop Build artifacts (`own-the-block-windows-setup`,
`own-the-block-macos-dmg`) hold the installer alone and expire after 14 days. Desktop Build no longer runs for
documentation-only changes; the `CI` workflow still validates the release contract on every push.

## Audio release policy

V1 gameplay music is exactly one rendered looping track:
`apps/client/public/audio/music/own-the-block-main-theme-loop.wav`. The client
decodes one looping `AudioBuffer` and starts it only while authoritative room
status is `IN_PROGRESS`; lobby, finished, and replay-lobby states are silent.
There is no procedural BGM fallback and no adaptive multi-stem soundtrack.

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
| Shared protocol declaration, client authentication/acks, server admission/public state/acks, current Shared/API/Client instructions | CURRENT RELEASE CONTRACT: shared protocol 9 retained without runtime changes. |
| Phase 1–7 reports, masterplan checkpoint entries, old installer names/hashes, Phase 7.2 V8 tables, V1 audio acceptance evidence | HISTORICAL EVIDENCE: facts retained; Phase 7.2 linked to this contract. |
| Client/desktop runtime tests with old app versions; server protocol compatibility tests; presentation/UAT fixtures | TEST FIXTURE: isolated values retained. The desktop metadata test reads the real repository and therefore now expects V1. |
| Dependency/devDependency fields and pnpm lockfile resolutions (including matching version substrings) | DEPENDENCY VERSION: unchanged; frozen install requires no lockfile regeneration. |
| Snapshot/storage/settings/schema/migration versions, PostgreSQL binary version, XML headers, general branding and tool-version references | UNRELATED to product semver: retained. Snapshot version 8 is not Socket protocol 9. |

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
