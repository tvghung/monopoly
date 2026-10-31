# OB-4 reward picker validation

> CURRENT DEVELOPMENT. This change extends [Draft PR #28](https://github.com/tvghung/monopoly/pull/28) on `codex/phase-09d-powerups` by the owner's explicit instruction. No merge, public release or Owner UAT PASS is implied.

## Scope and behavior

The START picker has ivory/pastel physical card shells, category accents, bevel/edge depth, staggered 4.4–5.6 second float, synchronized composited ground shadows, up to 7° pointer tilt, 16 px hover lift, shimmer/sparkles, selected scale 1.06 and an 18-particle finite burst. The existing artwork and all text remain flat 2D. Hover/focus pauses idle for a stable interaction target, including purely visual hover on revealed fronts.

Q1=A remains authoritative: one click submits selection, server locks and reveals all three; no confirmation step or post-lock switching. The client latches selection across the ACK/snapshot gap. Rejected/failed submissions clear transient presentation for retry, while selectedIndex from the server always takes precedence. Restoring a chosen offer does not replay particles/flip. Claim, decline and replacement use the original commands; there is no client-side acquisition or changed gameplay/protocol.

Effects are limited to `apps/client/src/game/ui/powerUps/PowerUpPickerCard.tsx`, used by the reward candidates in `PowerUpPanel.tsx`. Shared `PowerUpCard.tsx` is unchanged; inventory, held replacement cards, detail, activation and Reaction keep their existing appearance. OS or game reduced motion suppresses motion and particles while static selection stays readable.

## Verification environment

Windows 10 (10.0.19044), Intel Core i5-1245U, 12 logical CPUs, 15 GiB RAM, Node 24.22.0 and pnpm 11.15.1. Browser checks use installed Chrome and two real clients against the authoritative in-memory local server. Browser runs disable WebGL and therefore exercise the fallback board; physical GPU/full WebGL performance and macOS remain NOT RUN.

## Validation results

| Check | Result |
| --- | --- |
| `pnpm typecheck` | PASS, all four packages |
| `pnpm lint` and final touched-file lint | PASS |
| `pnpm test` | 4,593 passed, 2 existing skips; 1 untouched UpdatePrompt focus assertion failed. Isolated rerun: 40/40 PASS |
| `pnpm build` | PASS; all production asset validators passed |
| `pnpm validate:docs` | PASS, 196 Markdown files |
| `pnpm desktop:package` | PASS, rebuilt Windows x64 candidate |
| Focused picker production browser | PASS, 9 checks; baseline 7 checks |
| Existing `--refinement` browser acceptance | PASS, 16 checks |
| Existing `--refinement --native` packaged Electron acceptance | PASS, 16 checks |
| `git diff --check` | PASS |

The local full command returned FAIL because the unchanged downloaded-update focus test observed `document.body` before modal autofocus. The same file plus both picker suites passed on an isolated rerun (40 tests) without changing update/Modal source. This is consistent with an asynchronous focus timing race; it is recorded rather than converting the full-command outcome into PASS. The CI run on the pushed PR head remains the authoritative fresh full-suite result and is linked from the PR/Jira.

Focused picker checks cover four viewports (1440×900, 900×500, 667×375, 760×280), hidden identity/artwork, real server choice/claim/replacement, ACK-gap lock and error retry (component tests), keyboard containment, reconnect without replay, OS and persisted game reduced motion, exactly 18 transient particles, and eight animated offer/peek/restore/choose/decline cycles without leftover picker/particle DOM.

The existing artwork harness now selects the floating category back via native focus + Enter rather than waiting for a perpetually animated target to become still. The focused harness also exercises measured pointer movement and bounds; no server or production debug bypass is used. A separate static review found no actionable privacy/correctness issue.

## Same-machine frame comparison

Serial `--perf-only` runs compare the preserved build at `2eadca0` with this implementation. Each cell contains 180 requestAnimationFrame intervals. Both runs had one background jsdom test worker active. Chrome 156.0.8078.74, headless, WebGL disabled, production fallback board.

| Scenario | Before mean / p95 | After mean / p95 | Intervals >34 ms before / after |
| --- | --- | --- | --- |
| Hidden idle | 16.609 / 16.8 ms | 16.483 / 16.8 ms | 0 / 0 |
| Hidden hover | 16.647 / 16.8 ms | 16.615 / 16.8 ms | 0 / 0 |

No slowdown was observed in this limited scenario. These scheduler samples do not establish physical GPU/WebGL FPS, an idle-host benchmark, long-session memory behavior or full-match balance. Repeated-cycle verification proves no leftover picker/particle DOM for those eight cycles; it is not a heap-leak proof. Owner/human-paced and macOS UAT remain NOT RUN.

Reproduce from the root: `node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpPickerAcceptance.check.mjs`; `--perf-only` samples frames only. Add `--baseline --dist <preserved-baseline-dist>` for comparison. Existing wider integration: `node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpStabilizationAcceptance.check.mjs --refinement`, and after packaging add `--native`.

Machine-readable results: [validation summary](./ob4-picker-evidence/summary.json). Build output retains the existing >500 kB chunk advisory; test fixtures emit existing React/Three warnings. These are not reported as failing checks.

## Visual evidence

- [Before: hidden candidates](./ob4-picker-evidence/before-hidden.png)
- [After: ivory/pastel candidate shells](./ob4-picker-evidence/after-hidden.png)
- [After: authoritative selected/revealed cards](./ob4-picker-evidence/after-revealed.png)
- [After: 760×280 scroll reaches labels and footer](./ob4-picker-evidence/after-short-landscape.png)

These are captures of the production renderer, not mockups. Inspected desktop and short-landscape captures preserve flat artwork/text, selection emphasis and reachable footer actions.

## Owner retest

Keep PR #28 Draft until Owner UAT and explicit permission to merge. Use the PR branch at the final pushed commit in a clean checkout; preserve private changes rather than resetting an existing worktree. Run `pnpm install --frozen-lockfile`, then `pnpm dev:desktop` at the repo root. This launcher starts the web processes and Electron; do not also run `pnpm dev:web`. Stop the development terminal with Ctrl+C.

In an active match, cross/land on START and inspect the three hidden category backs. Hover and select; ensure only the locked card is highlighted and only Nhận thẻ adds it. Check Bỏ thẻ mới, full-hand replacement, reconnect to an already selected offer, decision peek, Tab/Shift+Tab and Enter/Space, OS/game reduced motion, and short landscape scrolling/footer access. Recheck OB-1/OB-2/OB-3 desktop LAN/Online flows on this updated candidate.

UAT local chưa chạy/chưa xác minh trên máy bạn. Automated Dev evidence does not mark the Power-up manual checklist PASS.
