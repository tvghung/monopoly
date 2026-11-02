# OB-7 feedback and OB-9 rarity validation

Scope: OB-7 and OB-9 only, based on main caf1b419064c26711df5fa75df2fddcf0e0cdd77. OB-8 movement and OB-11 contextual UI remain separate queued work.

## Behavior and evidence

OB-7 keeps the existing themed feedback channel. AnimationQueue hands off text immediately; FIFO reading time is 5000 ms independent of speed/reduced motion. ACK and removal are merged by exact card instance in either order, including late/repeated ACK. Other status/charge/expiry and inventory facts keep their identity. Sync, hidden-page, viewer/room change and disposal clear stale text/timers.

Before change, the POWER_UP_FEEDBACK executor waited 650 ms (zero with reduced motion), holding the gameplay queue. Inventory removal, status creation and successful ACK are distinct producer paths. The original reported three-toast scenario had no supplied card/recording, so it is not claimed as reproduced exactly. The real A08 case now shows two meaningful cues: one merged instance/ACK and one persistent status; no third removal cue. Status projection does not carry source instance, so no status is guessed away based on definition/name alone.

Two real Socket.IO clients using the production renderer passed A08 activation, free gameplay controls, reading time and reconnect suppression in Chromium and packaged sandboxed Electron 43.4.0. Both default and reduced-motion cases passed: measured cue spans exceed 5000 ms. See [browser timeline](ob7-evidence/browser.json), [Electron timeline](ob7-evidence/native.json), [browser screenshot](ob7-evidence/browser-false.png) and [Electron screenshot](ob7-evidence/native-false.png). Native harness ran the packaged application with app.isPackaged=true. No page errors were recorded.

OB-9 updates the strict shared schema and default pool to Common/Rare/Epic/Legendary 40/30/20/10. The existing sampler reads that config; no special U04/U10 sampling or existing offer/card mutation is introduced. All eight tier boundaries are checked per category. Seed 0x0b900001, 100000 offers per category and absolute per-bin tolerance 0.006 were fixed before execution; the seeded distribution passed. Definition uniformity, category composition, stored offer/reconnect and special-card regressions remain covered by server tests.

## Validation

- Targeted feedback: 15 tests PASS, including exact-instance ACK arrival order, duplicates, delayed ACK, independent same-definition cards, neutral theft/ingredient removal, reset and 5s at speed 2/reduced motion.
- Config/rewards: 41 tests PASS; full server suite 1166 PASS, 2 pre-existing skips.
- Desktop suite: 629 tests PASS. Typecheck, docs validation, build, lint and packaged build passed before the final late-ACK-only regression addition; final source validation continues in the PR.
- Full client suite/presentation regression and final required CI results must be recorded before merge.

Reproduce from repo root: `pnpm install --frozen-lockfile`, `pnpm build`, then `node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpFeedbackAcceptance.check.mjs`. For native: `pnpm desktop:package`, then the same command with `--native`.

## UAT and limits

Owner UAT has not run. Original unrecorded three-toast case, full-match balance, physical GPU/FPS, macOS, exhaustive card combinations and full native device coverage are not claimed PASS. Status facts are preserved separately where source-instance correlation is unavailable. Commands/authority, hidden card projection, protocol, snapshot and non-Power-up Toast behavior are unchanged.

After merge, use a clean checkout at the recorded merge SHA, Node >=24 and pnpm 11.15.1. Run `pnpm install --frozen-lockfile`, then `pnpm dev:desktop`; alternatively `pnpm dev:web` and `pnpm dev:desktop:shell` in separate terminals. Use the URL reported by the launcher. Close the app/Ctrl+C to stop; the host keeps matches only in RAM. Check Attack/Defense/Utility, denial/disconnect, two identical definitions with different instances, status expiry/charge, VI/EN and reconnect. Candidate distribution is not a full-match balance sign-off.
