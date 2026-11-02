# OB-6 Power-up inventory and activation validation

Scope: [OB-6](https://tvghung.atlassian.net/browse/OB-6), independently of OB-7/8/9. Base main `48dcbae9777261f8d759fb212427630924f49abe` includes OB-4.

## Behavior

Owned cards reuse the collectible shell with no idle loop/particles, 2-degree tilt and 3 px lift. Gallery centers one card, balances two/three and supplies an empty state. Actions have icons/text. Player selection reuses the language dropdown with corrected viewport coordinates. Cancel preserves cards/allowance while disconnected; pending requests keep duplicate protection. Server authority, reward selection and all 30 artwork assets remain unchanged. The dock outcome label is hidden without deleting offer history.

## Verification

Validation uses the production client and an isolated authoritative local server. Browser and packaged Windows Electron each passed the five-viewport inventory, detail, dropdown, Cancel and rapid-activation checks; no page errors were recorded. Packaged runtime: Electron 43.4.0 / Chromium 150.0.7871.224; browser: Chromium 156.0.8078.74.

| Check | Result |
| --- | --- |
| Focused PowerUpPanel + language selector tests | PASS — 30 tests, including VI/EN and reduced motion |
| Typecheck, lint, production build, documentation validator | PASS |
| Electron package + SVG/PNG packaged byte parity | PASS — 30 fronts and 3 backs |
| Existing reward picker browser regression | PASS — hidden privacy, locking, reconnect, claim/decline/replacement, reduced motion and repeated peek cycles |
| Inventory browser + packaged Electron | PASS — 0/1/2/3 cards, details, activation and dropdown at 1440×900, 1280×720, 900×500, 667×375 and 760×280 |
| Full repository pnpm test | PASS — client 271 files / 2731 tests, server 45 files / 1163 passed + 2 skipped, desktop 41 files / 629 tests; final focused rerun adds English coverage |
| Owner full-match UAT / physical GPU / macOS | NOT RUN |

The native harness uses an isolated temporary profile and explicitly exits its own test app after verification. Product quit/host-close policy is unchanged.

Frame sampling on the same Intel i5-1245U / Windows 10 / 12 logical CPU / 15 GiB machine, 180 RAF intervals at 1440×900 with three inventory cards:

| Renderer | Mean ms | p95 ms | >34 ms |
| --- | --- | --- |
| Before, existing OB-4 build in clean checkout 7d296dd (not rebuilt in this run) | 16.735 | 16.8 | 1 |
| After, Chromium | 16.723 | 16.8 | 1 |
| After, packaged Electron | 16.478 | 16.8 | 0 |

These samples show no apparent scheduler regression in this scenario. Chromium uses the production fallback board with WebGL disabled and low graphics; Electron uses low graphics. Other verification processes ran in the session. These are RAF intervals, not physical GPU FPS or proof of performance during a full 3D match. Human visual acceptance and device performance remain explicit Owner checks.

Committed evidence: [runtime/check summary](./evidence/ob6/verification.json), [before inventory](./evidence/ob6/inventory-before.png), [three-card gallery](./evidence/ob6/inventory-three.png), [short landscape activation](./evidence/ob6/activation-landscape.png), [player choice](./evidence/ob6/player-choice.png), [packaged inventory](./evidence/ob6/native-inventory.png). Complete generated captures remain under `test-results/ob-6-ui/` and can be reproduced.

Commands from the repo root:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate:docs
pnpm desktop:package
pnpm --filter @monopoly/desktop proof:packaged:powerups
node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpInventoryAcceptance.check.mjs
node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpInventoryAcceptance.check.mjs --native
node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpPickerAcceptance.check.mjs
```

For a before-build comparison, pass `--baseline --dist <pre-change-client-dist>` to the inventory harness. It checks existing surfaces without requiring the new dropdown/Cancel behavior; both runs use the same fixture and frame sampler.

## Local UAT

The Owner subsequently reports OB-6 testing OK (OWNER-REPORTED). For a repeat local check, use a clean dedicated checkout of the merge SHA linked from Jira; preserve existing work and do not reset another checkout. Prerequisites: Node >=24 and pnpm 11.15.1. At the repository root run `pnpm install --frozen-lockfile`, then `pnpm dev:desktop` (starts server/client and Electron). For browser testing run `pnpm dev:web`; attach Electron to that stack with `pnpm dev:desktop:shell` in a separate terminal. Use the actual URL printed by the launcher. Close the test application/press Ctrl+C in its own terminals to stop it. No database or migration is required; stopping the host permanently ends its RAM-only test match.

Verify inventory 0–3, reward claim/decline/replacement, details, activate/cancel, player targets, keyboard/focus/peek, VI/EN, reduced motion, disconnect/reconnect and web/Electron at the five listed viewports. Confirm no outcome line below Kho and unchanged gameplay/history. Native macOS and physical GPU/full-match owner acceptance remain manual.

## Owner acceptance after implementation

The Owner subsequently reports OB-6 test OK and explicitly requests production publication in the current chat. Record this as OWNER-REPORTED acceptance of OB-6; it does not turn unrelated full-system/device/macOS checks into automated PASS. The active release evidence is [v1.11.1 verification](../releases/V1_11_1_RELEASE_VERIFICATION.md).
