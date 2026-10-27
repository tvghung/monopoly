# Phase 09A — Git consolidation and baseline verification

CURRENT DEVELOPMENT — 2026-10-27 (Asia/Bangkok). **STATUS: PARTIAL** under the requested mixed-ownership completion rule: the safely attributable Power-up implementation is consolidated, while three ambiguous paths and 35 unrelated audit files remain untouched and uncommitted. No gameplay/artwork iteration was performed.

## A. Baseline and ownership

- Repository: monopoly-v1.10.0-refactor. Original branch: `codex/v1.10.0-refactor`. Original HEAD: `4c878d67072de6fdfb82457203bfa1d3054fed56`.
- Original index: empty staged diff. Status: 72 modified tracked + 88 untracked = 160 paths. Normalized Git diff: 70 tracked paths; two status-only byte changes were separately preserved.
- Classification: A 71 Power-up implementation/document paths; B 51 required integration paths; C 35 unrelated audit paths; E 3 ambiguous paths. D comprises ignored/generated/local-only directories and external checkpoints/evidence.
- Every original path and reason is in [complete change inventory](./09A_CHANGE_INVENTORY.md). Evidence includes phase reports, checkpoint bytes, prior hashes, history, imports and direct hunk review. No five-phase historical commits were fabricated.

## B. Recovery checkpoints

Both original checkpoints passed SHA-256 verification and fresh isolated restore drills, reproducing original tracked diffs, untracked sets and staging. Their manifests remain unchanged. Pre-06: 107 copied files; entry-08B: 121 copied files.

New independent checkpoint: `C:\Users\hungtran\Documents\ChatGPT\Own the block (monopoly)\powerup-pre-phase09a-checkpoint-2026-10-27-4c878d6`. It preserves 160 file copies (all status paths), branch/HEAD, exact original index, staged/unstaged/full binary diffs, tracked/untracked/index inventories and per-file SHA-256. New manifest SHA-256: `93a3f2103ba0d0020b7dfe73091d95660b0091f9e12eaf3d0d5fb65caa52d056`. All hashes and the restore drill pass.

[Checkpoint record and restore instructions](./09A_PRE_CONSOLIDATION_CHECKPOINT.md) documents all three locations/digests. Restore only into an isolated checkout first. Enable Windows long paths before checkout, copy worktree/ entries, restore metadata/git-index, compare original index bytes before stat refresh, then compare binary diff and NUL inventories. Nothing was restored over the live worktree. Ignored build/dependency outputs were excluded; no dirty environment/key paths were found.

## C. Local Git commits and rationale

| Commit | Message | Scope |
| --- | --- | --- |
| `a0eb9a847b280395e2aa2835cb23df4bcd9b2022` | feat(powerups): consolidate validated gameplay and presentation baseline | 126 paths: 122 existing authorized A/B paths plus four Phase 09A documents. Domain/registry, START reward/inventory, 30-card runtime/reaction/economy, lifecycle/recovery, protocol/desktop compatibility, client UI/presentation, tests/tooling and documentation |
| Documentation commit containing this final report | docs(powerups): record consolidation results and preservation evidence | This report only; its exact SHA is recorded after creation in external completion.json and the final chat response |

The implementation shares strict schemas, public/private projection, turn/payment hooks and client consumers. One coherent integration commit avoids artificially broken intermediate phase states. Existing history was not rewritten. Tree `276fc08a0a509b39843205cb343c7e953e9455a0` was materialized in a separate local clone with offline frozen-lockfile dependencies; its local shared-package links point into that clone, not the live worktree. The integration commit tree matches it exactly. The later reporting commit changes no source/runtime contract.

Before each commit the exact staged diff/path list was inspected, scoped ownership checked, high-confidence credential signatures and artifact paths scanned, and git diff --cached --check run. No C/E path, source artwork, environment file or build output was staged. Initial staging exposed one extra EOF blank line in apps/server/src/game/powerUps/catalog.test.ts; only that blank line was removed, preserving every assertion. Full staged patch/review hashes are external evidence. No tracked path was deleted.

## D. Preservation and remaining changes

All 38 excluded paths are byte-identical to entry: 35 unrelated audit documents/JSON records plus:

- apps/client/src/runtime/appUpdate.test.tsx: useEffect -> useLayoutEffect synchronization change predates 08B, without enough Power-up-specific ownership evidence. Left uncommitted; the original test also passed in the isolated candidate.
- apps/client/src/components/Dashboard.tsx and apps/client/src/game/scene/GameScene.contextIsolation.test.tsx: status-only byte changes, no normalized Git diff; never staged.

Full preservation audit: 3,175 original tracked/untracked files hashed; 3,172 retain exact bytes, zero missing. The only three reviewed differences are Documentation Hub consolidation status/links, the current Power-up gameplay instruction status/link, and the authorized catalog-test EOF cleanup. Historical phase reports and every existing artwork/source asset retain exact bytes.

Remaining status after integration: 3 tracked modifications + 35 untracked audit files = 38 paths, no staged changes. Ignored dist/generated/out/test-results/node_modules directories remain excluded. New recovery snapshots, evidence and isolated verification clones are outside the repository and retained. No clean-status claim is made.

## E. Validation — actual results

PowerShell fails before shell startup with the existing Windows CET error. All gates ran via the bundled Node v24.22.1 child-process runner, with its directory prepended to PATH; pnpm CLI is invoked through that Node executable. Exact argv, cwd, exit codes, duration and complete logs are in `C:\Users\hungtran\Documents\ChatGPT\Own the block (monopoly)\powerup-phase09a-evidence`.

| Gate / actual command (repo-relative CLI path; direct Node unless pnpm specified) | Result |
| --- | --- |
| apps/server/node_modules/vitest/vitest.mjs run (cwd apps/server) | PASS: 45 files, 1,161 passed, 0 failed, 2 pre-existing skips |
| apps/client/node_modules/vitest/vitest.mjs run --environment jsdom --pool=threads --maxWorkers=1 --no-file-parallelism (cwd apps/client) | PASS: 270 files, 2,713 passed, 0 failed/skipped |
| apps/desktop/node_modules/vitest/vitest.mjs run src tests --pool=threads --maxWorkers=1 --no-file-parallelism (cwd apps/desktop) | PASS: 41 files, 629 passed, 0 failed/skipped |
| Shared package | No standalone test script; contracts exercised by server/client/root tests; own typecheck PASS |
| pnpm typecheck | PASS: shared/server/client/desktop |
| pnpm lint | PASS |
| node --test (nine explicit tooling files; exact argv in root-tooling-tests.json) | PASS: 80 tests, 0 failed/skipped; includes 34 release-contract, 27 perf, 5 room-registry, 1 music, 1 card-art, 2 landmark-art, 10 docs self-tests |
| pnpm validate:docs | PASS: 221 Markdown files in live mixed worktree |
| pnpm validate:v1-contract | PASS: product 1.10.0, socket protocol 16 |
| pnpm build | PASS: production client + 26 audio / 28 classic-card / 22 landmark assets |
| pnpm --filter @monopoly/desktop compile | PASS: main/preload/server helpers |
| pnpm desktop:make | PASS: Windows x64 package and Squirrel installer; hashes in windows-artifact-hashes.json |
| node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpAcceptance.check.mjs | PASS: 10 browser scenarios |
| Same loader + scripts/powerUpStabilizationAcceptance.check.mjs | PASS: 8 Chromium groups |
| Same command with --native | PASS: 8 sandboxed app:// Electron groups |
| pnpm exec playwright test -c playwright.powerups.config.ts | PASS: 2 mobile flows |
| Same loader + scripts/powerUpHistoryStress.mjs | PASS: 3,000 reward-history workload |
| pnpm desktop:proof:host / pnpm proof:packaged | Both PASS: real-interface HTTP/LAN, four seats, reconnect/newest connection, process exit clears rooms/tokens |
| pnpm --filter @monopoly/desktop proof:packaged:cards / proof:packaged:budget | PASS: 28 classic-card assets; unpacked 366.1 MiB |
| Isolated staged tree: pnpm install --offline --frozen-lockfile; typecheck; validate:docs | PASS; no dependency download; all four typechecks; 188 Markdown files without excluded audits |
| Isolated staged tree: full server suite | PASS: 1,161 pass / 2 existing skip |
| Isolated staged tree: full client suite | PASS: 2,713 pass / 0 fail / 0 skip |
| Git whitespace, candidate tree equality, exclusion/hash/deletion audit | PASS |
| git fsck --connectivity-only | PASS (exit 0); two dangling staging blobs are informational, no missing/corrupt objects |

Primary package total: **4,503 passed / 0 failed / 2 existing skips**. Tooling: **80 passed / 0 failed / 0 skipped**. Browser/native/mobile and repeated isolated-tree runs are separate, not double-counted. All 30 registry/effect cases and 80 Attack/Reaction compatibility cases are included in the full server suites. The two existing skips are hostAdmission.integration.test.ts non-loopback fixture placeholders; no new skip or weakened assertion was introduced.

The endurance test completed eight seeded matches and 3,091 commands in both live and isolated runs. Expected injected-save/transaction errors remain visible in logs and pass their rollback assertions. No failing test was suppressed. Existing Vite >500 kB chunk and Node shell-argument deprecation advisories remain. Native automated acceptance is separate from physical device/GPU, human listening/full-match UAT and macOS acceptance, which were NOT RUN in Phase 09A. Local unsigned packaging does not certify signed production release/update artifacts.

## F. Artwork readiness

[Artwork integration readiness](./09A_ARTWORK_INTEGRATION_READINESS.md) maps **all 30 official IDs**, each currently without an individual art reference. Existing Power-up surfaces are Lucide category icons and CSS/text; the 28 SVG assets are Chance/Chest and the 22 others are landmarks. There is no dedicated Power-up image validator, fixed image ratio or image-format contract. Future client-only ID-to-asset mapping/rendering can use existing IDs without changing gameplay, inventory, START authority, socket protocol or RAM snapshot. The first artwork task needs client integration and dedicated completeness/layout checks; later same-path replacements can be asset-only. No artwork was changed here.

## G. Final state and limits

Branch: `codex/v1.10.0-refactor`. Verified gameplay integration HEAD: `a0eb9a847b280395e2aa2835cb23df4bcd9b2022`. Final HEAD is the documentation-only child commit containing this report; its exact SHA and parent are recorded immediately afterward in external completion.json and the final response (a commit cannot embed its own content-derived SHA). Local commit count above original HEAD: **2 after that reporting commit**. Final expected index: empty; remaining original status: 38 preserved paths listed in the inventory. Final external Git/status/hash receipt verifies these observations after the reporting commit.

Power-up code has a recoverable, tested local baseline for the separate artwork task. Overall status remains PARTIAL because ambiguous ownership is intentionally unresolved; none of those paths was altered. Remaining release/manual gates retain their prior status and are outside this consolidation.

**Confirmed: NO PR / NO PUSH / NO MERGE / NO REBASE / NO RELEASE / NO DEPLOYMENT / NO PUBLICATION.** No artwork generated or modified. No product/protocol/snapshot bump was introduced by Phase 09A; the existing completed implementation at protocol 16 / snapshot 14 was consolidated.
