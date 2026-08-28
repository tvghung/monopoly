# Phase 7 — Discovery and Options

**Status: Phase 7 DISCOVERY — NOT STARTED**

This is a discovery record, not an approval or implementation plan. No Phase 7
source, protocol, migration, deployment, credential, endpoint, or release change
is authorized by this document.

## 1. Current baseline

### Stable Phase 6 checkpoint

- Repository: `tvghung/monopoly`.
- Phase 6 PR #2 was merged with a normal merge commit:
  `c78dece5a307e815801972b2044d2093f2b78677`.
- Annotated tag: `v3.0.0-phase6-stable`.
- Tag dereference: `refs/tags/v3.0.0-phase6-stable^{}` →
  `c78dece5a307e815801972b2044d2093f2b78677`.
- The Phase 6 branch remains available at
  `4c84e76bbbc3f502c536e658575fe09be20f71f6`.
- Product/release identity: `Own the Block`, version `3.0.0`.

### Current product and architecture

- Standard Mode is a Vietnamese real-time room game for 2–4 active Players,
  with explicit Spectator admission, stable UUID Player identity, reconnect
  bearer tokens, and the lifecycle `LOBBY → IN_PROGRESS → FINISHED → LOBBY`.
- The server and PostgreSQL aggregate are authoritative. Commands use runtime
  validation, authenticated SocketData actors, per-room FIFO serialization,
  PostgreSQL transaction/CAS commit, then public/private projection and ACK.
- Current protocol and persisted snapshot are V8. `freshState()` is the canonical
  new-match reset path; exact deck order and private payment/forced-sale state stay
  durable and private.
- The client keeps one presentation path:
  `PresentationController → AnimationQueue → PresentationStore`. WebGL is the
  primary board renderer with a legacy fallback; display state never authorizes
  gameplay. Audio uses one typed Web Audio engine/provider path.
- Electron is an optional secure shell around the same client/server contract.
  Packaged runtime requires an explicit absolute HTTP(S) socket endpoint; the
  development loopback is not production configuration.
- The deploy shape is one Node process plus PostgreSQL. Render is configured as
  one starter instance with a deployment-guard disk and stop-before-start
  behavior. Overlapping revisions and horizontal replicas remain unsupported
  until distributed connection ownership/presence/locking and a Socket.IO adapter
  exist.

### Release and evidence state

- Phase 6 engineering is complete. Main post-merge CI and Desktop Build passed
  against the exact merge SHA; the Windows and macOS release-candidate matrix also
  passed in unsigned-validation mode.
- Local frozen install, typecheck, lint, test, and renderer build passed. The
  local test run still skipped ten database-gated integration tests because the
  required test database was not available; this is not database release proof.
- The controlled release artifact used `http://127.0.0.1:8080`. No production
  endpoint was supplied or invented.
- Production readiness is **NOT YET APPROVED**: real endpoint connectivity,
  public-network live gameplay/reconnect, accessibility/scaling, speaker-backed
  audio, long-session soak, macOS installed-runtime validation, and signing/
  notarization remain open. The final Windows Squirrel uninstall observation is
  **FAIL/BLOCKED** because registration and shortcuts were removed but the exact
  install root/updater residue remained.

## 2. What Phase 6 intentionally did not solve

### External release gates

- A release-owned production multiplayer endpoint, its CORS/deployment ownership,
  and public-network browser/Electron validation.
- Signed Windows distribution, Apple signing/notarization, and macOS install,
  launch, quit, relaunch, and uninstall proof.
- Human accessibility, viewport/OS-scaling, audible audio, visual comfort, and
  30–60 minute memory/renderer/queue/audio soak evidence.

### Product and architecture deferrals

- Accounts/OAuth, analytics, cloud saves, voice, multiplayer emotes, historical
  statistics/net-worth surfaces, a New Room flow, and a board/camera redesign.
- Auto-update remains post-v1. Multi-process or horizontally scaled ownership is
  not implied by the current single-process deployment model.
- Auction, finite bank inventory, even-building contention, and other rule changes
  outside the current Standard Mode contract remain out of scope.

### Known technical/documentation debt

- The accepted board performance debt is approximately 227 draw calls: above the
  210 target but below the hard 240 ceiling. The production renderer bundle also
  emits a large-chunk advisory (about 1.63 MB main JavaScript in the verified
  build). Profiling must precede any optimization work.
- The release path has strong metadata/checksum and unsigned-matrix coverage, but
  the installer residue policy and production signing inputs are unresolved.
- Several historical documents/checklist titles still say V7 while the current
  runtime and source-of-truth documents say V8. Those references are historical
  unless explicitly reconciled; this discovery note does not rewrite them.
- The testcase documentation intentionally leaves manual, Socket.IO, PostgreSQL,
  and installed-runtime assertions labeled by evidence class. A checklist label
  is not proof that the corresponding gate ran.

## 3. Candidate Phase 7 directions

These are three mutually distinct proposals. None is approved.

### Option 1 — Production multiplayer endpoint and operational readiness

**Outcome:** choose and provision the release-owned HTTPS multiplayer service and
PostgreSQL operations, then run the real browser/Electron 2–4 player, spectator,
reconnect, finished/replay, and graceful-shutdown acceptance matrix.

**Scope boundary:** preserve the current one-process stop-first deployment unless
distributed ownership, locking, presence, and Socket.IO fan-out are separately
approved. Do not add accounts, a new auth model, new game rules, or a second
presentation architecture.

**Dependencies/decisions:** endpoint owner/domain/region/cost, database backup and
retention owner, CORS policy, incident/restart procedure, and the exact public
release gate.

**Risk:** highest external coordination cost, but it unblocks the largest current
readiness gap: no real multiplayer endpoint exists.

### Option 2 — Signed distribution and installer lifecycle completion

**Outcome:** supply approved Windows and Apple signing/notarization inputs, execute
the release-candidate matrix in signed mode, run installed macOS and Windows
lifecycle checks, and resolve the Squirrel zero-residue acceptance policy.

**Scope boundary:** endpoint injection remains explicit and must use a separately
approved real endpoint; auto-update is not silently added.

**Dependencies/decisions:** signing identities, supported OS/architecture matrix,
distribution channel, installer residue acceptance or replacement strategy, and
whether an updater is still post-v1.

**Risk:** can produce trustworthy installers without proving the live service that
the installers connect to.

### Option 3 — V1 acceptance, accessibility, and measured UX/performance

**Outcome:** run the outstanding browser/Electron gameplay, reconnect, card/payment/
forced-sale, spectator, replay, accessibility, scaling, audio, visual, and soak
matrix; profile the board and bundle before selecting any optimization.

**Scope boundary:** retain the existing server authority and single presentation
pipeline. No protocol/migration or visual redesign follows from a failed manual
case without a separate product decision.

**Dependencies/decisions:** supported viewport/OS/audio matrix, release acceptance
thresholds, reduced-motion/accessibility sign-off, and whether the accepted draw
call/chunk debt is a release blocker.

**Risk:** improves confidence and user experience but does not create the missing
production endpoint or signed distribution.

## 4. Recommended next direction

**PROPOSAL — REQUIRES USER APPROVAL: Option 1, Production multiplayer endpoint
and operational readiness.** It addresses the clearest release blocker and makes
the currently unrun live multiplayer/reconnect evidence possible. Options 2 and 3
remain viable alternatives or follow-on work; choosing Option 1 does not approve
any implementation, infrastructure spend, endpoint, credentials, or production
release.

## 5. Product-owner decisions required before implementation

1. Select Option 1, 2, or 3 and its order relative to the other options.
2. Name the production endpoint owner, domain, hosting/region, database plan,
   backup/retention policy, and incident/restart owner.
3. Decide whether the observed Windows Squirrel residue is a release blocker,
   accepted installer behavior, or a reason to choose another installer path.
4. Provide the approved Windows/Apple signing identities and define the supported
   OS/architecture and installed-runtime acceptance matrix.
5. Decide whether the current single-process stop-first ceiling is sufficient for
   v1; distributed scaling requires a separate architecture decision.
6. Set the release thresholds for live gameplay, accessibility, audio, visual
   comfort, soak duration, and the current performance advisories.

## 6. Phase 7 implementation readiness

**NOT STARTED.** This document records discovery and options only. There is no
approved Phase 7 scope, no Phase 7 source change, and no Phase 7 production or
release implementation.

## Evidence map

- Phase 6 status and release ledger:
  `project-document/ui-ux-overhaul/06_PHASE_6_POLISH_DISTRIBUTION.md`,
  `06A_PHASE_6_0_RELEASE_READINESS_AUDIT.md`,
  `06B_PHASE_6_2_RELEASE_VERIFICATION.md`.
- Current architecture and authority:
  `CLAUDE.md`, `README.md`, and `project-document/monopoly-websockets/README.md`.
- Current contracts, persistence, deployment, and evidence classes:
  `project-document/monopoly-websockets/monopoly.shared.instructions.md`,
  `monopoly.api.instructions.md`, `Persistence/README.md`,
  `Api/http-runtime.instruction.md`, and `testcase/README.md`.
- Current source boundaries:
  `apps/server/src/rooms.ts`, `apps/server/src/services/roomCommandExecutor.ts`,
  `apps/server/src/services/publicState.ts`, `apps/client/src/App.tsx`,
  `apps/client/src/game/presentation/PresentationController.ts`,
  `apps/client/src/game/presentation/queue/AnimationQueue.ts`,
  `apps/client/src/game/presentation/store/presentationStore.ts`,
  `apps/client/src/game/scene/GameScene.tsx`, and `apps/desktop/src/`.
- Release/deploy configuration:
  `.github/workflows/ci.yml`, `.github/workflows/desktop-build.yml`,
  `.github/workflows/release-candidate.yml`, `render.yaml`, `Dockerfile`,
  `apps/desktop/scripts/release.mjs`, and `apps/desktop/src/runtimeConfig.ts`.
