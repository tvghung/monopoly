# Phase 08 — Final Validation and Release Readiness

> **STATUS: PARTIAL — EXECUTION VALIDATION COMPLETE; RELEASE NOT READY.** Repository, browser, and Windows x64 package checks completed. Product acceptance gaps and release configuration blockers remain. No release, deployment, merge or commit is made by this task.

## Environment and repository state

- Branch: `codex/v1.10.0-refactor`
- HEAD: `4c878d67072de6fdfb82457203bfa1d3054fed56`
- Working tree: mixed user/audit/Power-up changes; intentionally left uncommitted.
- Command runner: the normal PowerShell invocation failed; validation commands were run through the initialized Node.js REPL's child-process runner, with exit codes and output captured.
- Pre-Phase-06 checkpoint: verified external local snapshot `../powerup-pre-phase06-checkpoint-2026-10-27-4c878d6`; evidence and restore drill are in [00_PRE_PHASE06_CHECKPOINT.md](./00_PRE_PHASE06_CHECKPOINT.md).
- Power-up implementation changes current development contracts to protocol 16 / RAM snapshot 13. Published v1.10.0 remains protocol 14 / snapshot 11.

## Card coverage matrix

`PASS — handler` means the server's successful Active/Reaction path is exercised. It does not mean every failure, boundary, rollback, combination or production turn-flow scenario for that card was run.

| ID | Name | Effect implementation | Activation | Validation / unit evidence | Integration / browser evidence | Known limitation |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | Móc Túi | `runtime.ts` cash transfer | PASS — handler | PASS — 10% rounding and 50-unit cap; D05 reflection | PASS — real A01→D05 flow after reconnect | Direct theft path not separately asserted over Socket.IO |
| A02 | Tăng Phí Đột Xuất | `runtime.ts`, `economy.ts` rent modifier | PASS — handler | PASS — stacking and owner-turn state | PASS — real activation/status inspection/expiry | Full rent amount integration matrix remains open |
| A03 | Hợp Đồng Bất Lợi | `runtime.ts`, `economy.ts` purchase surcharge | PASS — handler | PASS — D03 block; A03 surcharge with U07 | Partial — tested through runtime, not full client purchase | Exact all-price/cap/rejection boundaries remain open |
| A04 | Tung Tin Đồn | `runtime.ts`, `economy.ts` targeted rent reduction | PASS — handler | PASS — D03, D04, D05 redirect and use/duration | Partial — runtime integration only | Two-use and all ownership-transfer boundaries remain open |
| A05 | Phong Tỏa Xây Dựng | `runtime.ts`, build restriction hook | PASS — handler | PASS — D03 and D04 interception | Partial — runtime integration only | Full build/debt/turn integration matrix remains open |
| A06 | Trộm Thẻ | `runtime.ts` random eligible inventory transfer | PASS — handler | PASS — capacity and D05/D09 cases | Partial — runtime integration only | Random-pool boundaries and client-to-client theft not E2E |
| A07 | Chiếm Đoạt Doanh Thu | `runtime.ts`, `economy.ts` rent-share claim | PASS — handler | PASS — D03 compatibility | Partial — runtime handler only | Bank/landlord diversion and cap matrix remains open |
| A08 | Khủng Hoảng Thị Trường | `runtime.ts`, `economy.ts` global rent modifier | PASS — handler | PASS — opponent list and owner exclusion | Partial — runtime only | Multi-opponent/teamplay rent flow not E2E |
| A09 | Thanh Tra Bất Ngờ | `runtime.ts` building levy | PASS — handler | PASS — per-house charge and capped levy | Partial — runtime only | Bank shortfall and hotel/game-wide combinations remain open |
| A10 | Gánh Nặng Tiền Thuê | `runtime.ts`, `economy.ts` rent surcharge | PASS — handler | PASS — D03 compatibility | Partial — runtime handler only | Rent surcharge + other rent protections not fully combined |
| D01 | Bảo Hiểm Tiền Thuê | `economy.ts` rent discount | PASS — Reaction | PASS — real rent settlement amount | Partial — runtime payment test | Shortfall and modifier-combination cases remain open |
| D02 | Ví Chống Trộm | `runtime.ts` theft block | PASS — Reaction | PASS — blocks A01 before transfer | Partial — runtime only | No real-client block scenario |
| D03 | Phá Mưu | `runtime.ts`, `validation.ts` | PASS — Reaction | PASS — all five approved targets; excludes unsupported classes | Partial — runtime only | No real-client cancel scenario |
| D04 | Lá Chắn Bất Động Sản | `runtime.ts`, `lifecycle.ts` shield | PASS — Active | PASS — two interceptions, ownership and expiry behavior | Partial — runtime only | Native visual shield and ownership-transfer E2E absent |
| D05 | Phản Đòn | `runtime.ts` effect-specific reflection | PASS — Reaction | PASS — A01 transfer direction, A04 redirect, A06 pool exclusion | PASS — real A01 reflection after reconnect | Other reflectable attacks not all run in browser |
| D06 | Hủy Phép | `runtime.ts` pre-commit cancel | PASS — Reaction | PASS — cancels pending A03 | Partial — runtime only | No real-client cancel scenario or all targeted effects |
| D07 | Quỹ Cứu Trợ | `runtime.ts`, `economy.ts` shortfall contribution | PASS — Reaction | PASS — shortfall cap and once per originating payment | Partial — payment runtime test | Full bankruptcy/creditor combinations remain open |
| D08 | Bất Khả Xâm Phạm | `economy.ts` Bank rent subsidy | PASS — Reaction | PASS — landlord receives eligible rent | Partial — rent runtime test | Contributions above/below caps and shortfall combinations remain open |
| D09 | Khóa Kho Thẻ | `runtime.ts` involuntary inventory block | PASS — Reaction | PASS — blocks A06 | Partial — runtime only | No real-client inventory defense scenario |
| D10 | Giải Phong Tỏa | `runtime.ts`, status lifecycle | PASS — Active | PASS — removes one future-only negative status | Partial — runtime only | No full client/turn-flow status removal scenario |
| U01 | Xúc Xắc May Mắn | `runtime.ts`, dice/movement checkpoint | PASS — Active | PASS — handler and required new roll path | Partial — no real browser use | Doubles/jail/START combination matrix remains open |
| U02 | Tăng Tốc | `runtime.ts`, existing movement helper | PASS — Active | PASS — adds movement without changing raw dice | Partial — runtime only | START/jail/doubles E2E remains open |
| U03 | Phiếu Giảm Giá Đất | `runtime.ts`, `economy.ts` purchase discount | PASS — Active | PASS — handler; registry limits validated | Partial — runtime only | Purchase discount amount/cap and invalid auction not end-to-end |
| U04 | Hiến Tế Nâng Cấp | `runtime.ts`, `validation.ts` atomic recipe | PASS — Active | PASS — mixed-rarity recipes/catalog sampling and activation | Partial — runtime only | No client recipe result or rollback E2E |
| U05 | Định Hướng | `runtime.ts`, existing movement helper | PASS — Active | PASS — handler with movement bounds | Partial — runtime only | Negative/zero movement, jail and START matrix remains open |
| U06 | Trao Đổi Vận May | `runtime.ts` consent/random swap | PASS — Active | PASS — request handler and decline path | Partial — no browser consent/reconnect flow | Full inventory, timeout and hidden identity E2E absent |
| U07 | Đầu Tư Từ Xa | `runtime.ts`, `economy.ts`, property transfer | PASS — Active | PASS — A03 surcharge interaction and price checks | PASS — real 125% purchase, no movement/landing | No low-cash/transaction-failure browser case |
| U08 | Dịch Chuyển Hoàng Gia | `runtime.ts`, existing movement helper | PASS — Active | PASS — handler and destination movement | Partial — no browser use | START/jail/destination rule matrix remains open |
| U09 | Phiếu Ưu Đãi Xây Dựng | `runtime.ts`, build price hook | PASS — Active | PASS — handler and status lifecycle data | Partial — runtime only | No real build transaction, cap or restriction combination E2E |
| U10 | Tái Cấu Trúc Kho Thẻ | `runtime.ts`, catalog sampling | PASS — Active | PASS — handler, rarity/category constraints and fresh identity | Partial — runtime only | No random-pool boundary/rollback client flow |

## Automated gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Power-up runtime unit tests | PASS — 90 tests | `pnpm --filter @monopoly/server exec vitest run src/game/powerUps/runtime.test.ts`; every Active activation case also checks replay rejection, foreign-owner rejection and invalid timing with no state mutation |
| Power-up Socket.IO integration tests | PASS — 20 tests | `pnpm --filter @monopoly/server exec vitest run src/socket.powerUps.integration.test.ts` |
| Power-up client tests | PASS — 11 tests | `pnpm --filter @monopoly/client exec vitest run src/game/ui/powerUps/PowerUpPanel.test.tsx --environment jsdom --pool=threads --maxWorkers=1 --no-file-parallelism` |
| All four package typechecks | PASS | `pnpm -r typecheck` |
| Production client build and bundled asset validators | PASS | `pnpm --filter @monopoly/client build`; warning: an existing Vite chunk exceeds 500 kB |
| Full repository test suite | PASS | `pnpm test`; server 42 files (875 passed, 2 skipped), client 269 files (2,704 passed), desktop 41 files (629 passed), and root validators passed |
| ESLint and all package typechecks | PASS | `pnpm lint`; `pnpm typecheck` |
| Documentation validation and self-tests | PASS | `pnpm validate:docs` (213 Markdown files); `pnpm test:docs` (10/10) |
| Release contract validation/self-tests | PASS | `pnpm validate:v1-contract`; `pnpm test:v1-contract` (34/34) |
| Release validator | DIAGNOSTIC PASS — RELEASE BLOCKED | `pnpm validate:release` returned 0; endpoint is not configured, signing is BLOCKED in `unsigned-validation` mode, notarization is NOT RUN, and `artifactsValidated` is false |
| Windows x64 package | PASS | `pnpm desktop:make`; Squirrel installer and package files listed below |
| Packaged Electron host proof | PASS — MANUAL DEVICE CHECK REMAINS | `pnpm desktop:proof:host`; all automated host checks passed; output marks `physicalDeviceAcceptance: MANUAL_REQUIRED` |
| Packaged asset and size checks | PASS | 28 card artworks, 22 landmark artworks, and packaged size budget passed |
| Browser E2E | PASS — 10 scenarios | `node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpAcceptance.check.mjs`; evidence JSON and screenshots in `test-results/powerup-acceptance/` |
| Diff whitespace check | PASS | `git diff --check` returned 0 with no whitespace errors; Git emitted line-ending conversion warnings |

## Windows x64 package evidence

`pnpm desktop:make` completed on Windows x64 and created the Squirrel distributables under `apps/desktop/out/make/squirrel.windows/x64/`:

- `OwnTheBlock-1.10.0-win32-x64-Setup.exe` — 154,754,048 bytes
- `own_the_block-1.10.0-full.nupkg` — 154,105,035 bytes
- `RELEASES`

The packaged host proof confirmed server readiness, packaged client serving, real-interface HTTP, LAN discovery, protocol 16, guest-first restrictions, four-client room capacity, wrong-room rejection, room-full behavior, player identity and reconnection, newest-connection ownership, and room/token cleanup on restart. The packaged application is unsigned and physical-device acceptance is still manual.

## Browser acceptance evidence

The freshly rebuilt production client connected two human browser clients and a bot to the local server. Verified scenarios: START cash and acquisition; hidden selection/reveal; reload restoration; full-hand replacement and decline; reconnect/deadline/bot reward recovery; A01 activation with D05 reflection after a defender reload; U07 at 125% without token movement or destination resolution; A02 status display and expiry after two authoritative owner-turn completions. Viewports captured: 1440×900, 1280×720 and 900×500. The browser harness continues a pending movement decision before waiting for the START offer, and asserts that the 900×500 replacement content is reachable in the modal's scrollable body while the footer remains visible. Chromium screenshots are not native Electron acceptance.

## Balance, performance and compatibility

The reproducible sampler `node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpsBalance.mjs` used seed `0xb10c2026` and the production `generateStartCandidates` implementation for 200,000 START offers (600,000 candidate cards). Observed rarity shares were Common 60.006%, Rare 28.981%, Epic 9.995%, and Legendary 1.018%, close to approved weights of 60/29/10/1%. A separate uniform-choice baseline produced one selected candidate per offer; it assumes random player choice and is not observed strategy. A second baseline sampled two non-Legendary ingredients independently for U04 and yielded Rare 36.919%, Epic 43.931%, Legendary 19.149% output rarity. Actual players choose ingredients, so this recipe output is a scenario, not a prediction.

This is reward-distribution sampling, not a full-match balance simulation. It does not estimate card-use rates, average cash transfer, game duration, win rates, or strategic defensive and movement value. No long-running stress/soak run has been performed. The implementation preserves approved card parameters; deterministic stacking and integer rounding are documented and tested. No new database or long-lived timer service was added. Match Power-up state and completed reward identities remain in process-local RAM and are lost when the host exits. Native Electron full-match visual and macOS acceptance are not established.

## Release readiness

**NO-GO.** The release validator reports no configured endpoint, unsigned-validation signing mode, signing BLOCKED, notarization NOT RUN, and `artifactsValidated: false`. Product acceptance also remains incomplete: the effect-specific all-card negative/boundary/authorization/duplicate/rollback and combo matrix, themed combat animations and board target highlighting, full native Electron/device visual review, macOS verification, and full-match balance/stress work have not been completed. The reward-distribution sample above is limited evidence and does not close match-level balance analysis. No production release, deployment, merge, force-push or commit has been performed.

## Phase 08B follow-up — 2026-10-27 (CURRENT DEVELOPMENT)

The historical conclusions above describe the earlier phase and remain preserved. [08B stabilization](./08B_STABILIZATION_REPORT.md) now records DEVELOPMENT GO / PRODUCTION NO-GO, 30/30 concrete card command outcomes, required interaction coverage, 8 complete seeded matches and 3,000 retained rewards, finished themed feedback/board targets, focus/contrast fixes, and passing production Chromium plus packaged Electron acceptance at all three sizes. Full package suites: 4,503 pass, 0 fail, 2 unchanged LAN-isolation skips; root tests: 80 pass. Socket protocol remains 16; private RAM snapshot schema is now 14.

The legal U04 recipe sampler now excludes U04 ingredients; its new output scenario is 19.789% Legendary, superseding the earlier recipe sample only. Physical GPU/device and listening UAT, macOS, clean installer/update acceptance and production signing/endpoint/publication prerequisites remain unverified. The report does not turn automated native evidence into physical acceptance. See [card coverage](./08B_CARD_TEST_COVERAGE_MATRIX.md), [interactions](./08B_INTERACTION_MATRIX.md), and [balance/stress](./08B_BALANCE_AND_STRESS_REPORT.md).
