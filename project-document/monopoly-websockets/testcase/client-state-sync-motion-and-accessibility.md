# Checklist — Vietnamese client, state sync, motion và accessibility

## Session/sync

- [x] `[CLIENT][AUTOMATED]` Join/resume ACK gates Lobby/Board; restore/reconnect keeps token and
  snapshot; terminal errors clear only invalid session; newest-wins old tab stops.
- [x] `[CLIENT][AUTOMATED]` Stale revision ignored; spectator/reconnecting has no mutation;
  StrictMode does not duplicate listeners/countdowns/actions.
- [x] `[CLIENT][AUTOMATED]` Protocol-v5 reset resumes the same identity directly into the fresh
  v5 `IN_PROGRESS` turn without replacing the reconnect credential.
- [x] `[CLIENT][AUTOMATED]` Presentation event derivation is deterministic, ordered,
  stale-safe and limited to observable diffs; reconnect snapshots do not replay history.
- [x] `[CLIENT][AUTOMATED]` Board display targets publish before each hop while
  settled positions gate prompts; reset epoch, tile impacts and stationary-player
  behavior remain independent.
- [x] `[CLIENT][AUTOMATED]` Animation queue covers FIFO, pause/resume, skip/reset,
  reduced motion, executor failure recovery, skip-all/reconnect snap and stale
  executor cancellation.

## Vietnamese/content/money

- [ ] `[AUDIT][CLIENT]` HTML title/metadata/manifest, join/lobby/host/ready/spectator,
  reconnect, dice/buy/payment/forced-sale/trade/property/jail/forfeit/winner/error/empty/
  tooltip/alt/log copy is Vietnamese.
- [ ] `[AUDIT]` No player-facing “Monopoly”, English game term, `$`, `$M` or USD
  formatter remains; internal event/package/env names are exempt.
- [x] `[CLIENT][AUTOMATED]` All displayed amounts use shared VNĐ formatter, including card
  detail, tooltip, prompt, log, offer, bid, balance and bail.
- [x] `[CLIENT][AUTOMATED]` Board renders exact canonical shared 40 tiles without duplicate
  metadata source; exact private deck order absent from DOM/state.

## Turn/property/payment UX

- [ ] `[CLIENT]` Token settlement gates buy/turn; each roll completes one turn and
  jail animation cannot expose a premature action.
- [ ] `[CLIENT]` Active debtor sees remaining claim/liquidation/bankruptcy confirmation;
  other Player/spectator cannot settle/declare.
- [ ] `[CLIENT]` Landing development, payment-shortfall gross values and
  private forced-sale proposal visibility
  render correct labels/actions/deadlines.
- [ ] `[CLIENT]` TradeBundle asset selection and ACK failure
  keeps authoritative UI.

## Accessibility/layout

- [ ] `[CLIENT][MANUAL-E2E]` Keyboard/focus/labels/live errors/reduced-motion usable;
  Vietnamese text and short board labels fit desktop/mobile without hiding critical
  action.

## Phase 2.5B commercial WebGL board

- [x] `[CLIENT][AUTOMATED]` Tile surface matrix keeps upward normals and matching
  footprints on bottom/left/top/right representatives; canonical 40 tiles are
  assigned once to eight district surface batches plus one special batch.
- [x] `[CLIENT][AUTOMATED]` All eight district descriptors generate distinct
  textless albedo/bump data; the 512-square sRGB/non-color texture pairs and
  materials are reused and deferred disposal survives React StrictMode remount.
- [x] `[CLIENT][AUTOMATED]` Normal property typography is name-only with adaptive
  short/canonical/long Vietnamese sizing; local SDF completion invalidates the
  demand frame without a user interaction.
- [x] `[CLIENT][AUTOMATED]` Neutral chassis, integrated accents, frame bounds,
  orthographic camera, tone mapping, budget constants and the triangle estimator
  are guarded by tests; live diagnostics measure actual draw calls/triangles. WebGL
  lazy routing waits for its dynamic import deterministically.
- [ ] `[CLIENT][MANUAL-E2E]` Record 1920×1080 bottom/left/top/right visual review,
  orange/pink/blue material distinction, center/corner hierarchy, four-player
  developed-property stress scene and active roll/landing action flow.

## Desktop shell

- [x] `[DESKTOP][AUTOMATED]` Renderer navigation, external URL allowlist and packaged
  renderer traversal guard have unit coverage.
- [x] `[DESKTOP][AUTOMATED]` Production reload/history shortcuts and DevTools policy
  are covered by a pure input-policy test; preload compilation bundles local IPC
  modules into the exact BrowserWindow artifact.
- [x] `[DESKTOP][AUTOMATED]` Settings reset requests native fullscreen false and
  fullscreen events synchronize even when the settings modal is closed.
- [ ] `[DESKTOP][MANUAL-E2E]` Active-player window close prompts and confirmed close
  preserves reconnect token; lobby/join close exits normally; explicit `Bỏ cuộc`
  still revokes the session.
- [ ] `[DESKTOP][CONFIGURED]` Windows Squirrel and macOS DMG makers are configured;
  macOS artifact is not claimed from Windows validation.

## Phase 1.1 acceptance procedure

The executable procedure is documented in
[`project-document/ui-ux-overhaul/PHASE_1_1_MANUAL_ACCEPTANCE.md`](../../ui-ux-overhaul/PHASE_1_1_MANUAL_ACCEPTANCE.md).
The manual boxes above remain unchecked until a human run records the environment,
players, and observed result.
