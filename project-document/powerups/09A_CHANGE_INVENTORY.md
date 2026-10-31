# Phase 09A — Change ownership inventory

CURRENT DEVELOPMENT — 2026-10-27 (Asia/Bangkok). Initial status: 160 paths (72 tracked + 88 untracked), with 70 nonempty normalized tracked diffs. Every original path is classified below. A = Power-up implementation/docs; B = required shared integration; C = unrelated user work; D = generated/local-only; E = ambiguous ownership. No blanket add/stash/reset/clean was used.

Ownership evidence: Phase 02/03D/04–05/06/07/08B reports, pre-06 and entry-08B snapshots, historical phase04–05 hashes, current import dependencies, and reviewed HEAD-to-worktree hunks. Even when a phase report claimed broad ambiguity, each included tracked hunk was independently inspected; normalized source changes are restricted to Power-ups or protocol/snapshot compatibility. A test-only app-update synchronization edit lacked a Power-up-specific ownership record and stays E.

| Path | Category | Decision / evidence |
| --- | --- | --- |
| `AGENTS.md` | A | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `CLAUDE.md` | A | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/package.json` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/App.tsx` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/components/Dashboard.tsx` | E | PRESERVE UNCOMMITTED: Status reports modified but Git normalized diff is empty; exact source bytes preserved. |
| `apps/client/src/components/legacy-board/LegacyTile.tsx` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/design-system/components/Modal/Modal.test.tsx` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/design-system/components/Modal/Modal.tsx` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/presentation/PresentationController.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/presentation/PresentationProvider.tsx` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/presentation/events/powerUpFeedback.test.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/client/src/game/presentation/events/powerUpFeedback.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/client/src/game/presentation/events/types.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/presentation/store/presentationStore.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/presentation/store/types.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/scene/GameScene.contextIsolation.test.tsx` | E | PRESERVE UNCOMMITTED: Status reports modified but Git normalized diff is empty; exact source bytes preserved. |
| `apps/client/src/game/scene/board/Board3D.tsx` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/scene/board/boardRenderModel.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/scene/board/tiles/TileBodyBatch.tsx` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/scene/board/tiles/tileBodyInstances.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/ui/hud/BottomDock.tsx` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/ui/hud/RollControl.tsx` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/game/ui/powerUps/PowerUpCard.tsx` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/client/src/game/ui/powerUps/PowerUpFeedback.tsx` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/client/src/game/ui/powerUps/PowerUpPanel.test.tsx` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/client/src/game/ui/powerUps/PowerUpPanel.tsx` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/client/src/game/ui/powerUps/PowerUpRuntimePanels.tsx` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/client/src/game/ui/powerUps/PowerUps.css` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/client/src/i18n/catalog.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/client/src/runtime/appUpdate.test.tsx` | E | PRESERVE UNCOMMITTED: useEffect to useLayoutEffect in app-update test predates 08B; no phase-specific ownership evidence; preserve. |
| `apps/client/src/types.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/desktop/src/lanFinder.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/desktop/tests/lanFinder.test.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/desktop/update-policy.json` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/bots/driver.test.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/bots/driver.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/bots/policy.test.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/bots/policy.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/commands/gameplay.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/game.test.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/game/dice.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/game/payment.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/game/paymentResolution.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/game/powerUps/catalog.test.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/catalog.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/config.test.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/contracts.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/economy.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/endurance.test.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/foundation.test.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/foundation.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/lifecycle.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/registry.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/rewards.test.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/rewards.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/runtime.test.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/runtime.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/stabilization.test.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/testFixtures.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/powerUps/validation.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/game/rescueResolution.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/game/tiles.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/game/turn.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/rooms.teamplay.test.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/rooms.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/rulesContract.test.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/services/deadlineScheduler.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/services/powerUpCheckpoint.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/services/publicState.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/socket.powerUps.allCards.integration.test.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/socket.powerUps.integration.test.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/socket/errors.test.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/socket/index.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/socket/powerUps.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `apps/server/src/socket/roomCommands.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/statePerformanceCharacterization.test.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `apps/server/src/testSupport/historicalRoomSnapshotUpgrades.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `packages/shared/src/events.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `packages/shared/src/index.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `packages/shared/src/powerUpConfig.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `packages/shared/src/powerUpEffects.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `packages/shared/src/powerUps.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `packages/shared/src/socketSchemas.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `packages/shared/src/stateSchemas.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `packages/shared/src/teams.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `packages/shared/src/types.ts` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `playwright.powerups.config.ts` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/README.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/audits/v1.10.0-deep-technical-audit/00_EXECUTIVE_SUMMARY.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/01_ARCHITECTURE_AND_DEPENDENCY_MAP.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/02_GAME_MECHANICS_AUDIT.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/03_STATE_AND_MULTIPLAYER_AUDIT.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/04_FRONTEND_RENDERING_AND_ANIMATION_AUDIT.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/05_ELECTRON_RUNTIME_AND_LIFECYCLE_AUDIT.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/06_DEAD_CODE_AND_REDUNDANCY_INVENTORY.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/07_PERFORMANCE_AND_MEMORY_OPPORTUNITIES.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/08_TEST_COVERAGE_AND_REGRESSION_RISKS.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/09_PRIORITIZED_REFACTORING_BACKLOG.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/10_AUDIT_EVIDENCE_AND_LIMITATIONS.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/11_POST_AUDIT_VERIFICATION.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/12_PHASE_E1_REGRESSION_HARDENING.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/13_E1_FIX_019_IMPLEMENTATION.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/14_E1_FIX_001_IMPLEMENTATION.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/15_E1_FIX_003_IMPLEMENTATION.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/16_E1_FIX_004_IMPLEMENTATION.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/17_PHASE_A1_DOCUMENTATION_SYNC.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/18_PHASE_A2_A3_SAFE_CODE_CLEANUP.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/19_PHASE_A4_TRADE_CANCELLATION_EMITTER.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/20_PHASE_B_CONSOLIDATED_GAME_LOGIC_AND_C1.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/20_PHASE_B_CONSOLIDATED_GAME_LOGIC_AND_C1_PRETASK_SHA256.json` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/21_PHASE_C2_STATE_PERFORMANCE_CHARACTERIZATION.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/22_PHASE_D1_D2_GAMEPLAY_AND_MACOS_CLOSE.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/22_PHASE_D1_D2_PRETASK_SHA256.json` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/23_PHASE_D3_TECHNICAL_HARDENING.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/24_FINAL_INTEGRATION_AND_RC_READINESS.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/25_PHASE_F2_PACKAGE_BOUNDARY_HARDENING.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/26_PHASE_F3_CONTROLLED_RC_ARTIFACT_VERIFICATION.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/27_PHASE_F4_F5_NATIVE_INSTALLER_ACCEPTANCE.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/28_PHASE_F6_INSTALLER_PARITY_AND_HOST_ISOLATION.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/29_PHASE_F7_SAFE_HOST_TEST_INFRASTRUCTURE.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/30_PHASE_F8_VM_FREE_NATIVE_HOST_ACCEPTANCE.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/31_PHASE_F9_NATIVE_NETWORK_AND_HOST_ACCEPTANCE.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/audits/v1.10.0-deep-technical-audit/32_PHASE_F10_NETWORK_ISOLATION_FEASIBILITY.md` | C | PRESERVE UNCOMMITTED: Separate pre-existing v1.10 refactor/audit records; not required by Power-up implementation. |
| `project-document/monopoly-websockets/ARCHITECTURE_DECISIONS.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/Api/README.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/Api/socket-debt-and-rescue.instruction.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/Api/socket-powerups.instruction.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/monopoly-websockets/Client/README.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/Client/design-system.instruction.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/Client/power-ups.instruction.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/monopoly-websockets/FEATURE_TRACEABILITY.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/GameCore/README.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/GameCore/bot-players.instruction.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/GameCore/power-ups.instruction.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/monopoly-websockets/GameCore/team-play.instruction.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/GameCore/turn-movement-and-bankruptcy.instruction.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/Persistence/README.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/Shared/README.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/Shared/socket-and-state-contracts.instruction.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/testcase/README.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `project-document/monopoly-websockets/testcase/power-ups.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/00_PRE_PHASE06_CHECKPOINT.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/02_TECHNICAL_DESIGN.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/03C_POWERUP_GAMEPLAY_RULES_SPEC_APPROVED.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/03D_CARD_DEFINITIONS_REPORT.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/04_05_IMPLEMENTATION_REPORT.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/06_GAMEPLAY_ENGINE_REPORT.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/07_UI_UX_IMPLEMENTATION_REPORT.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/08B_BALANCE_AND_STRESS_REPORT.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/08B_CARD_TEST_COVERAGE_MATRIX.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/08B_INTERACTION_MATRIX.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/08B_STABILIZATION_REPORT.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/powerups/08_FINAL_VALIDATION_REPORT.md` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `project-document/ui-ux-overhaul/V1_RELEASE_CONTRACT.md` | A | COMMIT: Reviewed diff contains Power-up documentation/version/traceability updates only. |
| `scripts/powerUpAcceptance.check.mjs` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `scripts/powerUpHistoryStress.mjs` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `scripts/powerUpStabilizationAcceptance.check.mjs` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `scripts/powerUpsBalance.mjs` | A | COMMIT: Power-up-specific source, contracts, acceptance tooling or phase/canonical documentation; named by phase reports and imports. |
| `scripts/validateV1Contract.check.mjs` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |
| `scripts/validateV1Contract.mjs` | B | COMMIT: Reviewed hunks support Power-up integration/compatibility; phase 04–05/06/08B reports and dependencies corroborate ownership. |

## Local/generated exclusions (D)

Ignored directories at entry: apps/client/dist, apps/desktop/dist, apps/desktop/generated, apps/desktop/out, test-results, root/package node_modules. External recovery checkpoints, logs, restore clones and tooling evidence are outside the repository and excluded. No dirty .env/key/credential path was found. These directories are preserved or regenerated only by established build/test commands; none is staged.

Two paths (Dashboard.tsx and GameScene.contextIsolation.test.tsx) have no normalized Git diff, despite status marking them modified. They are E, never added to the index; raw bytes are included in the recovery snapshot and full preservation hashes.

## Phase 09A additions

The checkpoint, artwork readiness, this complete ownership inventory and final consolidation report are A. Documentation Hub and current Power-up gameplay instruction receive narrowly scoped status/link updates; historical phase reports are preserved byte-for-byte.
