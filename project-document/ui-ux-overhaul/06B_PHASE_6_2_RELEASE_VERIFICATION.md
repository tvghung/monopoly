# Phase 6.2 — Distribution and Release Verification

**Status: CORRECTIVE IMPLEMENTATION COMPLETE; RELEASE GATES OPEN**

Verification date: 2026-08-27

Repository: `tvghung/monopoly`

Branch: `overhaul/phase-6-polish-distribution`

Expected starting SHA: `e035e34ecd7cb0d587cda4c555bb914f2d701b67`

This is the factual Phase 6.2 evidence ledger. It does not convert maker or
automated success into installed-runtime, multiplayer, audible, accessibility,
signing, notarization, or long-session proof.

The architectural boundary remains:

`SERVER OWNS TRUTH → PresentationController → AnimationQueue → PresentationStore → GameScene/R3F or legacy fallback`

There remains one `AudioEngine` and one `AudioProvider` path. No gameplay,
protocol, migration, GameCore, presentation, queue, renderer, or audio
architecture was changed for this phase.

## 1. Checkpoint ledger

| Checkpoint | Result | Evidence |
|---|---|---|
| 0. Preflight and source-of-truth audit | **PASS** | Required branch and starting SHA matched; the initial worktree was clean; remotes, Phase 6 documents, desktop/server/client runtime, Forge, and existing CI were inspected. |
| 1. Release configuration contract | **PASS** | CLI > environment > packaged config > development loopback precedence, valid/malformed/missing config, and release-required endpoint behavior are covered by focused tests and release scripts. |
| 2. Version, native identity, icons, and artifacts | **PASS** | Root `3.0.0` is the canonical release source; validated `.ico`/`.icns` assets are configured; Windows executable and Squirrel names carry `3.0.0`. macOS packaging itself remains unrun. |
| 3. Distribution workflow | **PASS** | `.github/workflows/release-candidate.yml` adds a distinct manual Windows x64/macOS x64/macOS arm64 release-candidate matrix with frozen install, quality gates, endpoint input, artifact upload, and secret-backed signing checks. |
| 4. Packaged Electron ↔ server connectivity | **PASS** | Controlled Socket.IO polling handshake tests cover same-origin, `app://own-the-block`, and disallowed origin behavior; the real deployed endpoint remains blocked. |
| 5. Package/install/launch verification | **NOT RUN** | The pre-correction artifact reproduced a standard-uninstall **FAIL**: registry/shortcuts were removed but the application directory/residue remained. The corrected final artifact was built, but its final installer run was blocked by Windows UAC cancellation before installation; no final install, renderer/Join, graceful-quit, relaunch, or uninstall result is claimed. |
| 6. Live multiplayer and recovery | **NOT RUN** | No live 2/3/4-player browser/Electron session or reconnect/replay matrix was run. |
| 7. Accessibility, scaling, visual comfort, and audio | **NOT RUN** | No current Phase 6.2 interactive viewport, OS-scaling, keyboard/screen-reader, or audible speaker pass was run. |
| 8. 30–60 minute soak | **NOT RUN** | No timed resource/presentation/audio soak was run. |
| 9. Final validation | **PASS** | Required local commands, database-enabled tests, focused tests, packaging, deterministic release build, and checksum validation are recorded in section 8. |
| 10. Documentation and evidence | **PASS** | The corrective evidence updates preserve the pre-correction failure and separate source, local, manual, signing, and remote evidence. |
| 11. Commit, push, and exact-SHA remote verification | **NOT RUN** | Commit and push occur after this ledger; current-SHA Actions verification is not yet available. |

## 2. Release configuration contract

Implemented in `apps/desktop/src/runtimeConfig.ts` and the release scripts:

1. `--socket-url=<absolute HTTP(S) URL>`;
2. `OWN_THE_BLOCK_SOCKET_URL`;
3. packaged `resources/release-config.json`;
4. development-only `http://127.0.0.1:8080` fallback;
5. packaged missing or invalid configuration returns the existing safe typed
   failure path.

`apps/desktop/scripts/release.mjs` requires
`OWN_THE_BLOCK_RELEASE_SOCKET_URL` before invoking Forge. The normal
`desktop:package` and `desktop:make` sanity commands can generate a version-only
configuration, but they do not claim production readiness.

The final controlled release used `http://127.0.0.1:8080`. No real deployment
URL was invented, committed, or presented as production configuration.

## 3. Version, identity, native icons, and artifacts

- Canonical root release version: `3.0.0`.
- Product: `Own the Block`.
- Executable: `OwnTheBlock`.
- Windows icon: `apps/desktop/assets/own-the-block.ico`.
- macOS icon: `apps/desktop/assets/own-the-block.icns`.
- Both native containers pass deterministic header/entry validation.
- Desktop `app.asar` metadata reports version `3.0.0`, product name `Own the
  Block`, and main entry `dist/main.js`.
- The unpacked Windows executable reports product/version/file version
  `Own the Block` / `3.0.0` / `3.0.0`.

Final controlled Windows x64 artifact manifest:

| Artifact | SHA-256 |
|---|---|
| `apps/desktop/out/make/squirrel.windows/x64/OwnTheBlock-3.0.0-win32-x64-Setup.exe` | `eda111e8262a22e33be2cfbcfaec0c486ce66460c58bc0691902d159fad84b5a` |
| `apps/desktop/out/make/squirrel.windows/x64/RELEASES` | `3ade81bb02cbafa24ddc28ab3f62407b71629bab68cd627fea52e730fa6275cd` |
| `apps/desktop/out/make/squirrel.windows/x64/own_the_block-3.0.0-full.nupkg` | `2a675667a4e13553cc306f88f32b0b9c8693ec6d1356e02e89f42b6059d8896f` |

The manifest and checksum file are generated under the ignored local output
directory `apps/desktop/out/release-artifacts/`.

## 4. Packaged Electron and server behavior

`apps/server/src/createServer.ts` uses the explicit packaged renderer origin
`app://own-the-block` as the production default and still honors an explicit
`CORS_ORIGIN`. The focused server test performs an actual Socket.IO polling
handshake for:

- same-origin browser deployment;
- `Origin: app://own-the-block` with matching allow-origin response;
- a disallowed origin whose browser-visible allow-origin response does not
  match it.

The controlled package contains `resources/release-config.json` with version
`3.0.0` and the controlled endpoint. `/healthz` and `/readyz` behavior was not
redesigned; no permissive `*` origin was added. This polling result describes
browser CORS authorization only; it is not server-side authentication or
rejection of arbitrary WebSocket clients.

## 5. Windows package/install/launch evidence

The following separates the pre-correction runtime reproduction from the
corrected artifact. A package/maker pass or an executable process existing for
five seconds is not an installed interactive-runtime PASS.

| Item | Result | Evidence |
|---|---|---|
| Squirrel setup exists | **PASS** | `OwnTheBlock-3.0.0-win32-x64-Setup.exe` exists in the final manifest. |
| Pre-correction installer-created installation | **PASS** | Before the corrective edits, the controlled setup run confirmed the root was absent, setup exited 0, and `app-3.0.0`, `Update.exe`, registry data, and shortcuts were created. |
| Pre-correction executable process launch | **PASS: process existence only** | The installed executable produced observed `OwnTheBlock.exe` processes. No renderer, Join screen, endpoint, gameplay, graceful quit, or relaunch was observed. |
| Pre-correction standard Squirrel uninstall | **FAIL** | `Update.exe --uninstall` exited 0 and removed the uninstall key and shortcuts, but `app-3.0.0`, `.dead`, `Update.exe`, and inner updater residue remained after the bounded wait. Residue was recorded before the exact test root was manually cleaned. |
| Corrected final-artifact clean install | **NOT RUN** | The final unsigned-validation artifact was ready and hashed, but Windows UAC canceled the last installer attempt before setup ran. |
| Corrected final-artifact install hook/registry/shortcuts | **NOT RUN** | No final installer execution occurred after the UAC cancellation. |
| Corrected final-artifact renderer/Join observation | **NOT RUN** | No final installed window was interactively observed. |
| Corrected final-artifact graceful quit/relaunch | **NOT RUN** | No user-driven graceful quit or relaunch was observed; process termination in the earlier smoke was harness-controlled. |
| Corrected final-artifact standard Squirrel uninstall | **NOT RUN** | No final installation was available to uninstall. The pre-correction residue **FAIL** remains an open release gate; it is not converted to PASS by exit code 0. |
| macOS x64 install/launch/uninstall | **NOT RUN** | The execution host is Windows. |
| macOS arm64 install/launch/uninstall | **NOT RUN** | The execution host is Windows. |

The Electron security settings remain source-verified and covered by existing
desktop security tests: `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, `webSecurity: true`, production DevTools closure, input
restriction, safe `app://` loading, and top-level/bootstrap recovery. A fresh
interactive DevTools/security/accessibility inspection of the installed app was
not run.

## 6. Live multiplayer and recovery matrix

| Scenario | Result | Evidence boundary |
|---|---|---|
| Real deployed endpoint connectivity | **BLOCKED** | No release-owner production endpoint was available; the controlled loopback endpoint is not deployed evidence. |
| 2-player live game | **NOT RUN** | Existing server/client integration coverage is not a live runtime session. |
| 3-player live game | **NOT RUN** | Existing server/client integration coverage is not a live runtime session. |
| 4-player live game | **NOT RUN** | Existing server/client integration coverage is not a live runtime session. |
| Idle disconnect/reconnect | **NOT RUN** | No live browser/Electron session. |
| Disconnect during turn or presentation | **NOT RUN** | No live browser/Electron session. |
| Pending payment/card reconnect | **NOT RUN** | No live browser/Electron session. |
| Leave/rejoin and stale presentation recovery | **NOT RUN** | No live browser/Electron session. |
| `SESSION_SYNC`, `SPECTATOR_SYNC`, `REPLAY_SYNC` live behavior | **NOT RUN** | Existing automated contract/integration evidence is supporting evidence only. |
| Spectator, `FINISHED`, Play Again, second match | **NOT RUN** | No live same-session acceptance pass. |

## 7. Accessibility, scaling, audio, and soak

| Gate | Result | Evidence |
|---|---|---|
| 1280×720 / 1600×900 / 1920×1080 layout pass | **NOT RUN** | No current Phase 6.2 interactive viewport matrix. |
| Maximized/fullscreen and 100/125/150% scaling | **NOT RUN** | No current OS/display scaling pass. |
| Keyboard/focus/modal/contrast/screen-reader review | **NOT RUN** | No current manual accessibility pass. |
| Reduced-motion and WebGL fallback visual review | **NOT RUN** | Automated coverage is not visual UAT. |
| Audible AudioEngine unlock, SFX, music, volume, resume, replay | **NOT RUN** | No speaker-backed manual check. |
| 30–60 minute memory/renderer/queue/activity/audio soak | **NOT RUN** | Duration observed: 0 minutes. |

## 8. Validation record

| Command/evidence | Result | Record |
|---|---|---|
| `pnpm install --frozen-lockfile` | **PASS** | Already up to date with pnpm 11.15.1. |
| `pnpm db:migrate` | **PASS** | Database schema was already up to date. |
| `pnpm db:status` | **PASS** | All nine repository migrations reported applied. |
| `pnpm typecheck` | **PASS** | All workspace typechecks completed. |
| `pnpm lint` | **PASS** | ESLint completed after the final source edit. |
| `pnpm test` | **PASS** | Desktop 9 files/38 tests; server 12 files/150 passed and 10 database-gated skips; client 90 files/499 tests. |
| Database-enabled server test | **PASS** | `TEST_DATABASE_URL` was process-local from `.env` `DATABASE_URL`; 13 files/160 tests passed. |
| `pnpm build` | **PASS** | Renderer production build completed with the existing large-chunk advisory. |
| `pnpm --filter @monopoly/client typecheck` | **PASS** | Client typecheck completed. |
| `pnpm --filter @monopoly/client test` | **PASS** | 90 files/499 tests. |
| `pnpm --filter @monopoly/desktop typecheck` | **PASS** | Desktop typecheck completed. |
| `pnpm --filter @monopoly/desktop test` | **PASS** | 9 files/38 tests. |
| `pnpm desktop:package` | **PASS** | Windows x64 package sanity build without an endpoint. |
| `pnpm desktop:make` | **PASS** | Windows x64 Squirrel maker without an endpoint. |
| `pnpm desktop:release` with controlled endpoint | **PASS** | Deterministic cleanup, endpoint injection, Windows x64 make, post-make collection, manifest platform/architecture validation, and SHA-256 generation passed. |
| `git diff --check` | **PASS** | No whitespace errors; line-ending warnings only. |

The renderer build retains the pre-existing Vite warning about the large main
chunk. It is a performance advisory, not evidence of runtime release readiness.

## 9. Signing, notarization, and workflow status

| Gate | Result | Evidence |
|---|---|---|
| Local unsigned validation artifact | **PASS** | `OWN_THE_BLOCK_DISTRIBUTION_MODE=unsigned-validation` completed the Windows controlled build. |
| Signing | **BLOCKED** | No certificate or signing identity was supplied; the artifact is not a production-distribution claim. |
| Notarization | **NOT RUN** | macOS jobs were not run on this Windows host; signed notarization remains blocked. |
| Release-candidate workflow source | **PASS** | `.github/workflows/release-candidate.yml` contains manual endpoint input, quality gates, three OS/architecture targets, checksums, uploads, and secure signing branches. |
| Exact-SHA remote CI | **NOT RUN** | Must be checked after push for the final commit SHA. |
| Exact-SHA remote Desktop Build | **NOT RUN** | Must be checked after push for the final commit SHA. |
| Exact-SHA remote Release Candidate | **NOT RUN** | Workflow dispatch is pending the final focused commit and push; the unsigned-validation run can use the test-only endpoint without signing credentials. |

The Release Candidate matrix is explicit: Windows x64 on `windows-latest`,
macOS x64 on `macos-15-intel`, and macOS arm64 on `macos-15`. It remains a
separate workflow from normal Desktop Build. In signed macOS mode, CI decodes
`OWN_THE_BLOCK_MACOS_CERTIFICATE_BASE64` into `RUNNER_TEMP`, imports it into a
temporary unlocked keychain, grants codesign access, and verifies the requested
Developer ID Application identity before Forge. Forge signs the app; the
corrective release script signs the final DMG, submits that final DMG to
`notarytool --wait`, staples and validates the final DMG, and only then collects
checksums. No signed macOS run or real credentials were available locally.

## 10. Release decision

The result is **IMPLEMENTATION COMPLETE BUT RELEASE GATES OPEN**.

Release readiness is blocked by the missing real deployed endpoint, failed
standard-uninstall residue reproduction and unrun final corrected-artifact
acceptance, UAC-blocked final installer execution, unrun macOS artifacts/install
checks, unrun live multiplayer/reconnect/spectator/second-match checks, unrun
accessibility, audible, and soak checks, unavailable signing/notarization
inputs, and pending exact-SHA remote workflow verification. No release-ready or
Phase 6-complete claim is made.
