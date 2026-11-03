# OB-12 Power-up activity validation

CURRENT DEVELOPMENT —1.11.2, protocol18, RAM snapshot16. Owner approved protocol/snapshot/update-policy change in chat; no release publication.

## Result

Server-authored activity records generic receipts without card identity and official named uses at actual consumption. Reward CLAIM/REPLACE/automatic grants, all Active/Reaction paths, A06/reflection, U04/U10 outputs and accepted-only U06 are covered. Ingredients and transformed/exchanged source cards are not falsely logged as used. Existing room transaction and completion/instance gates preserve rollback, order and retry semantics; history bounds remain128 typed/500 legacy. VI/EN sentences preserve official catalog proper names.

## Executed verification

- Server full suite:1,188 passed,2 skipped. New domain receipt/claim/full-hand/decline/auto/U04/U10/A06/reflection/U06 accepted/declined/expired/bounds tests pass.
- All30 cards through real authenticated Socket.IO: use exactly once, receipt schema whitelist, foreign/stale/invalid commands, injected failed commit, replay and reconnect identity preservation pass.
- Client log/translation targeted:28 passed, including safe React text for malicious names and no duplicate typed rows on rerender. Full client suite and CI results are recorded in Jira.
- Desktop suite initially found one stale LAN protocol assertion; corrected fixture and targeted37 LAN tests passed. Final CI supplies full desktop result.
- Typecheck, full lint, production renderer and Windows package passed; release-contract validator tests34 passed, docs validator passed.
- Chromium and packaged Electron Host/Guest each pass real reward reveal/no-receipt then double-click CLAIM/one generic receipt, U02 movement use/one named use on both viewers, unchanged event identities after reconnect and English rendering. [Browser evidence](ob12-evidence/browser/evidence.json), [native evidence](ob12-evidence/native/evidence.json), [English native screenshot](ob12-evidence/native/english.png).
- Current host18 rejects17/19 in Socket integration. Direct isolated host17 at db11a8bed5826b59f4d0951ae3924e845011a900 rejects client18: [probe evidence](ob12-evidence/old-host17-client18.json). Existing snapshot guard refuses older envelopes; LAN protocol mirror is18 and minimum remains1.11.2. No migration across process loss.

Reproduce after dependencies and pnpm desktop:package: node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpActivityAcceptance.check.mjs; add --native for packaged Electron. Old-host probe used a clean read-only worktree at the recorded commit and an untracked test helper; current socket.integration.test.ts covers current-host mismatch.

## UAT handoff

Use the merge commit recorded on Jira, Node24/pnpm11.15.1, pnpm install --frozen-lockfile, then pnpm desktop:package and pnpm desktop:run:packaged. Keep Host alive, join a Guest and eligible spectator; check claim/replace/decline, U02 Use/Continue, Active/Reaction/contextual, special transfers/outputs and U06 accept/decline/expiry. Compare public log order, no hidden receipt identity, VI/EN and reconnect once.

Owner UAT NOT RUN. Physical GPU/refresh rates, macOS and cross-device full-match acceptance remain manual. Existing OB-7 toast behavior is unchanged; automated/native checks are not Owner sign-off.
