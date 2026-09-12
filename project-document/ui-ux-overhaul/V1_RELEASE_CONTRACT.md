# V1 Release Contract

Current release source of truth. Historical phase records retain their original
versions, protocol values, proof SHAs, and acceptance limits.

## Product identity

```text
Product: Own the Block
Release: V1
Semantic version: 1.0.0
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
- Persistence: managed local PostgreSQL for the desktop host, bound to loopback
  only. Database credentials remain inside the host runtime.
- Client: React/Vite, used by the Electron renderer and LAN browser client.
- Gameplay authority: server-side; Pass A changes no gameplay or network behavior.

Implementation references: `apps/desktop/src/hostRuntime.ts`, `managedPostgres.ts`,
`apps/client/src/network/createSocket.ts`, `apps/server/src/socket/index.ts`, and
`.github/workflows/release-candidate.yml`.

## Packaging identity

Forge uses the root package version for app metadata and the Windows Squirrel
name: `OwnTheBlock-1.0.0-win32-x64-Setup.exe`. The installed Forge DMG maker resolves
`Own the Block-1.0.0-x64.dmg` and `Own the Block-1.0.0-arm64.dmg` from app name,
desktop package version, and target architecture. The application and collected
manifest derive their version from package metadata. These are configuration expectations,
not claims that new artifacts were built. Release metadata rejects mismatched
application package versions; signing/notarization semantics remain unchanged.

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
it is a visual-review aid, not production navigation or automated acceptance.

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
