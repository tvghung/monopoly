# OB-8 checkpoint movement validation

Scope: OB-8 only, from main 903da27c759a87bdc2b4b9f34fb6ba8915253ce9. Owner approved adding movement events, protocol/snapshot and compatibility checks in OB-8/comment 10148. OB-11 remains a separate next task.

## Result and cause

The previous public presentation rule required a new rollSequence and at most 12 steps. Completing a paused checkpoint has the same rollSequence; U02 can move 14 tiles. Those paths fell into SNAP. The previous checkpoint also exposed only Continue and used Reaction wording. The correction uses a committed public PLAYER_MOVED event, exact operation identity and a single movement modal containing legal card choices/target controls.

Server movement remains authoritative: original dice stay unchanged for U02/U05/U08, U02 adds 2, U05 applies its approved delta, U01 uses its reroll and U08 stays TELEPORT. One serialized choice consumes/continues once, stale operation or competing choices cannot repeat the move. The event contains public position facts, not hidden card/credential data. Normal dice/card/jail rules are retained; only checkpoint movement gains the new fact.

## Compatibility

Current development is v1.11.2 / protocol 17 / snapshot 15, minimum supported 1.11.2. Published v1.11.1 tags/assets are unchanged and no release is published here. Schema validates exact WALK paths (1–15) and TELEPORT steps=0; snapshot-14 envelopes and mismatched protocol clients are refused. LAN discovery and update-policy review mirror 17. Canonical detail: [shared contract](../monopoly-websockets/Shared/socket-and-state-contracts.instruction.md#ob-8-movement-contract-current-development).

## Verification

- Eight server checkpoint regressions: N=12 Continue and U02=14, dice/card/allowance, one START reward, stale operation, U05 -3/+3, U08 same destination but TELEPORT, U01 reroll, schema rejection and snapshot-14 refusal.
- Client derivation regression covers 12/14/15 without another roll, public-only actor/observer proof, TELEPORT and missing-proof SNAP. Existing queue/executor tests remain applicable. UI tests cover one modal, no automatic activation, operation payload, competing Continue disabled and denial recovery.
- Full server run initially found two old literal protocol-16 assertions; both corrected, affected 38 tests pass. Full desktop run found one old protocol-16 request assertion; corrected, LAN finder/contract 48 tests pass. Remaining tests in those runs passed (server 1171, 2 pre-existing skips; desktop 628). Full client suite passed 2743 tests. Typecheck, lint, production build, docs and release-contract validation passed. Final required CI at the PR head must be recorded before merge.
- Endurance harness updated to send exact operation identity: 8 complete seeded games finish through real commands, including Power-up/no-Power-up scenarios. This is regression evidence, not Owner UAT or a balance sign-off.
- Chromium and packaged Electron diagnostic renderer: exact 12/14/15 ordered STORE_START/STORE_COMPLETE hops for actor and observer; U08 zero hops/SNAP; U01 follows its actual reroll; reduced-motion actor snaps while normal observer still walks. Each command is double-clicked synchronously and produces one committed movement. Pending checkpoints survive reload; completed checkpoint does not reopen/replay. Matrix sizes include 1440×900, 1280×720 and 900×500.
- [Browser traces](ob8-evidence/browser.json), [Electron traces](ob8-evidence/native.json), [12+2 checkpoint](ob8-evidence/native-checkpoint-U02-true-false.png), [small viewport](ob8-evidence/native-checkpoint-U05-true-false.png). Trace build uses VITE_PHASE4_UAT=1; this changes diagnostics availability, not authority or movement execution. Native app.isPackaged=true. Production build and required checks are verified separately.
- Initial Chromium pass hit the existing 1000 static-requests/15-minute limiter on an extra final reload after all movement cases; removing redundant reloads in the harness made the full matrix pass. Product limits are unchanged.

Reproduce after a diagnostic build/package with VITE_PHASE4_UAT=1: `node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpMovementAcceptance.check.mjs`, add `--native` for the packaged app. The normal build does not expose movement traces.

## Owner UAT

Owner UAT has not run. Physical GPU/FPS, macOS, all real-device combinations and every movement/card/jail permutation are not claimed PASS. Use a clean checkout at the merge SHA recorded in Jira, Node >=24/pnpm 11.15.1, `pnpm install --frozen-lockfile` then `pnpm dev:desktop` (or `pnpm dev:web` + `pnpm dev:desktop:shell` separately). Use launcher URL; close app/Ctrl+C to stop, ending host-RAM matches. Check 12/14 steps, START/corners, U01/U05/U08, no card/used allowance, denial/reconnect, keyboard, VI/EN, motion speed and reduced motion. Update desktop host/guests together for protocol 17.
