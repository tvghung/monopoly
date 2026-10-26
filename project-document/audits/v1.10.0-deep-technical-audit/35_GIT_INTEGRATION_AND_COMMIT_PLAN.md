# F11 — kế hoạch tích hợp Git và chia commit

Đây là kế hoạch review, không phải lệnh stage/commit. Hiện tại index rỗng và không có commit/push/PR nào được tạo.

## Kết quả phân loại

- 148 đường dẫn dự kiến cho 9 commit có chủ đích: 108 tracked changes, 37 file phát triển untracked và 3 báo cáo F11.
- Sáu deletion được giữ trong nhóm client cleanup sau khi kiểm tra không còn import.
- 35 file lịch sử 00–32 được bảo toàn cục bộ nhưng không đưa vào loạt commit này. Hai SHA manifest có đường dẫn tuyệt đối của máy người dùng; manifest 22 còn 9,34 MB. Do report20 liên kết trực tiếp manifest, cần sanitize cả nhóm lịch sử và chạy validator trước khi xem xét commit.
- Mọi log/evidence dưới `test-results/`, `apps/client/dist`, các thư mục `node_modules`, output build và E1 artifact đều bị loại khỏi Git.
- Khi stage báo cáo F11, chỉ chọn đúng 3 file báo cáo; không stage cả thư mục audits vì thư mục có cả 00–32.

## Thứ tự commit đề xuất

### G1 — Server gameplay correctness

- Commit message dự kiến: fix(server): centralize game rules and handoff resolution
- Phụ thuộc: không
- Số đường dẫn: 12

~~~text
apps/server/src/commands/gameplay.ts
apps/server/src/game.test.ts
apps/server/src/game/bankruptcy.ts
apps/server/src/game/dice.ts
apps/server/src/game/index.ts
apps/server/src/game/payment.ts
apps/server/src/game/paymentResolution.ts
apps/server/src/game/property.ts
apps/server/src/game/tiles.ts
apps/server/src/game/turn.ts
apps/server/src/game/turnHandoff.test.ts
apps/server/src/rulesContract.test.ts
~~~

### G2 — Server room and session lifecycle

- Commit message dự kiến: fix(server): serialize room and session ownership
- Phụ thuộc: G1
- Số đường dẫn: 13

~~~text
apps/server/src/rooms.teamplay.test.ts
apps/server/src/rooms.test.ts
apps/server/src/rooms.ts
apps/server/src/services/connectionRegistry.ts
apps/server/src/services/deadlineScheduler.test.ts
apps/server/src/services/deadlineScheduler.ts
apps/server/src/services/offerInvalidation.test.ts
apps/server/src/socket.integration.test.ts
apps/server/src/socket.presenceSynchronization.integration.test.ts
apps/server/src/socket.resumeOwnership.integration.test.ts
apps/server/src/socket/lobby.ts
apps/server/src/socket/session.ts
apps/server/src/testSupport/historicalRoomSnapshotUpgrades.ts
~~~

### G3 — Desktop Host lifecycle and F8 loopback acceptance

- Commit message dự kiến: fix(desktop): own Host lifecycle and add loopback acceptance
- Phụ thuộc: G2
- Số đường dẫn: 20

~~~text
apps/desktop/forge.config.cjs
apps/desktop/src/desktopBootstrap.ts
apps/desktop/src/hostRuntime.ts
apps/desktop/src/ipc/windowHandlers.ts
apps/desktop/src/localAcceptance.ts
apps/desktop/src/main.ts
apps/desktop/src/preload.ts
apps/desktop/src/runtimeConfig.ts
apps/desktop/src/serverHelper.ts
apps/desktop/tests/forgePackageBoundary.test.ts
apps/desktop/tests/hostRegistryOwnership.test.ts
apps/desktop/tests/hostRuntime.test.ts
apps/desktop/tests/hostStartupBootstrap.test.ts
apps/desktop/tests/hostStartupCancellation.test.ts
apps/desktop/tests/localAcceptance.test.ts
apps/desktop/tests/serverHelper.test.ts
apps/desktop/tests/squirrelPayloadParity.test.ts
apps/desktop/tests/windowHandlers.test.ts
apps/server/src/authoritativeServer.test.ts
apps/server/src/authoritativeServer.ts
~~~

### G4 — Client presence and Host UX

- Commit message dự kiến: fix(client): synchronize presence and Host lifecycle UX
- Phụ thuộc: G3
- Số đường dẫn: 10

~~~text
apps/client/src/App.presence.test.tsx
apps/client/src/App.test.tsx
apps/client/src/App.tsx
apps/client/src/app/bootstrap/AppBootstrap.tsx
apps/client/src/components/DesktopMultiplayerLauncher.test.tsx
apps/client/src/components/DesktopMultiplayerLauncher.tsx
apps/client/src/components/HostLanSharing.test.tsx
apps/client/src/components/HostLanSharing.tsx
apps/client/src/i18n/catalog.ts
apps/client/src/runtime/types.ts
~~~

### G5 — Client rendering, input and cleanup

- Commit message dự kiến: fix(client): release pointer and renderer resources safely
- Phụ thuộc: không
- Số đường dẫn: 15

~~~text
apps/client/src/game/presentation/executors/types.ts
apps/client/src/game/presentation/interruptionMeasurements.test.tsx
apps/client/src/game/presentation/movementCadence.test.ts
apps/client/src/game/scene/GameScene.tsx
apps/client/src/game/scene/board/center/CenterPark.tsx
apps/client/src/game/scene/board/center/ParkFountain.tsx
apps/client/src/game/scene/board/center/ParkFurniture.tsx
apps/client/src/game/scene/board/center/ParkTrees.tsx
apps/client/src/game/scene/board/tiles/SdfBillboardText.tsx
apps/client/src/game/scene/camera/useBoardGestures.test.tsx
apps/client/src/game/scene/camera/useBoardGestures.ts
apps/client/src/game/scene/render/demandFrameScheduler.test.ts
apps/client/src/game/scene/render/demandFrameScheduler.ts
apps/client/src/game/scene/render/environment/StudioEnvironment.lifecycle.test.tsx
apps/client/src/game/scene/render/environment/StudioEnvironment.tsx
~~~

### G6 — F7 test-only network guard and LAN test isolation

- Commit message dự kiến: test(server): constrain test listeners to loopback
- Phụ thuộc: không
- Số đường dẫn: 9

~~~text
apps/server/src/hostAdmission.integration.test.ts
apps/server/src/lanDiscoveryResponder.test.ts
apps/server/src/lanDiscoveryResponder.ts
apps/server/src/testSupport/networkListenGuard.cjs
apps/server/src/testSupport/networkListenGuard.d.cts
apps/server/src/testSupport/networkListenGuard.setup.ts
apps/server/src/testSupport/networkListenGuard.test.ts
apps/server/src/testSupport/safeTestListener.ts
apps/server/vitest.config.ts
~~~

### G7 — E1 targeted regression and characterization harness

- Commit message dự kiến: test: add targeted E1 regression harness
- Phụ thuộc: G1, G2, G3
- Số đường dẫn: 16

~~~text
apps/client/e1/audit001.e1.tsx
apps/client/e1/phaseE1Mode.ts
apps/client/e1/tsconfig.json
apps/desktop/e1/audit003.e1.ts
apps/desktop/e1/audit004.e1.ts
apps/desktop/e1/lifecycleFixture.ts
apps/desktop/e1/phaseE1Mode.ts
apps/desktop/e1/tsconfig.json
apps/server/e1/audit001Presence.e1.ts
apps/server/e1/audit019.e1.ts
apps/server/e1/phaseE1Mode.ts
apps/server/e1/tsconfig.json
apps/server/src/statePerformanceCharacterization.test.ts
scripts/perf/probe-init.js
scripts/tests/README.md
scripts/tests/runPhaseE1.mjs
~~~

### G8 — Architecture, API, contract and acceptance documentation

- Commit message dự kiến: docs: align v1.10.0 architecture and acceptance records
- Phụ thuộc: G1, G2, G3, G4, G5, G6, G7
- Số đường dẫn: 50

~~~text
AGENTS.md
CLAUDE.md
project-document/README.md
project-document/monopoly-websockets/ARCHITECTURE_DECISIONS.md
project-document/monopoly-websockets/Api/README.md
project-document/monopoly-websockets/Api/http-runtime.instruction.md
project-document/monopoly-websockets/Api/socket-building.instruction.md
project-document/monopoly-websockets/Api/socket-debt-and-rescue.instruction.md
project-document/monopoly-websockets/Api/socket-lobby.instruction.md
project-document/monopoly-websockets/Api/socket-session.instruction.md
project-document/monopoly-websockets/Api/socket-trading.instruction.md
project-document/monopoly-websockets/Client/README.md
project-document/monopoly-websockets/Client/activity-log-and-chat.instruction.md
project-document/monopoly-websockets/Client/app-update.instruction.md
project-document/monopoly-websockets/Client/design-system.instruction.md
project-document/monopoly-websockets/Client/game-board.instruction.md
project-document/monopoly-websockets/Client/game-status.instruction.md
project-document/monopoly-websockets/Client/join-room.instruction.md
project-document/monopoly-websockets/Client/presentation-pipeline.instruction.md
project-document/monopoly-websockets/Client/settings-and-audio.instruction.md
project-document/monopoly-websockets/Client/trade-offers.instruction.md
project-document/monopoly-websockets/Client/turn-actions.instruction.md
project-document/monopoly-websockets/Desktop/README.md
project-document/monopoly-websockets/Desktop/electron-shell-and-packaging.instruction.md
project-document/monopoly-websockets/FEATURE_TRACEABILITY.md
project-document/monopoly-websockets/GameCore/README.md
project-document/monopoly-websockets/GameCore/bot-players.instruction.md
project-document/monopoly-websockets/GameCore/property-economy.instruction.md
project-document/monopoly-websockets/GameCore/room-lifecycle.instruction.md
project-document/monopoly-websockets/GameCore/team-play.instruction.md
project-document/monopoly-websockets/GameCore/turn-movement-and-bankruptcy.instruction.md
project-document/monopoly-websockets/Persistence/README.md
project-document/monopoly-websockets/Shared/README.md
project-document/monopoly-websockets/Shared/socket-and-state-contracts.instruction.md
project-document/monopoly-websockets/monopoly.api.instructions.md
project-document/monopoly-websockets/monopoly.client.instructions.md
project-document/monopoly-websockets/monopoly.contracts.instructions.md
project-document/monopoly-websockets/monopoly.game-core.instructions.md
project-document/monopoly-websockets/testcase/RELEASE_ACCEPTANCE_MATRIX.md
project-document/monopoly-websockets/testcase/bot-players.md
project-document/monopoly-websockets/testcase/client-state-sync-motion-and-accessibility.md
project-document/monopoly-websockets/testcase/http-runtime-and-deployment.md
project-document/monopoly-websockets/testcase/join-room-and-player-lifecycle.md
project-document/monopoly-websockets/testcase/payment-shortfall-and-forced-sale.md
project-document/monopoly-websockets/testcase/property-economy.md
project-document/monopoly-websockets/testcase/team-play.md
project-document/monopoly-websockets/testcase/trading-market-and-private-offers.md
project-document/monopoly-websockets/testcase/turn-movement-buy-and-jail.md
project-document/ui-ux-overhaul/09_STABLE_V1_10_0_RELEASE_PREPARATION.md
project-document/ui-ux-overhaul/V1_RELEASE_CONTRACT.md
~~~

### G9 — F11 review reports

- Commit message dự kiến: docs(audit): add F11 final refactor review
- Phụ thuộc: G1, G2, G3, G4, G5, G6, G7, G8
- Số đường dẫn: 3

~~~text
project-document/audits/v1.10.0-deep-technical-audit/33_PHASE_F11_FINAL_REFACTOR_AND_GIT_READINESS.md
project-document/audits/v1.10.0-deep-technical-audit/34_MASTER_AUDIT_FINDINGS_REGISTER.md
project-document/audits/v1.10.0-deep-technical-audit/35_GIT_INTEGRATION_AND_COMMIT_PLAN.md
~~~

## Việc phải xử lý trước push/PR

1. Sửa `project-document/monopoly-websockets/testcase/RELEASE_ACCEPTANCE_MATRIX.md:185`: bỏ link tới manifest trong `test-results/phase-f3-controlled-rc` hoặc trỏ tới artifact checked-in có thể tái tạo. Sau đó chạy docs validation trên clone sạch.
2. Chốt F8 có được phép chạy ở development/non-Windows hay parser phải giới hạn đúng phạm vi docs. Đây là quyết định phạm vi sản phẩm, không phải phát hiện lỗ hổng trong review này.
3. Nếu muốn lưu audit 00–32 trong repo, rà soát/redact đường dẫn tuyệt đối trong hai manifest, giữ lại bằng chứng có ích, cập nhật cách tham chiếu trong báo cáo lịch sử theo quy trình được duyệt, rồi chạy validator. Không commit bản hiện tại chứa username/path.
4. Fetch/đối chiếu target branch sau khi được phép dùng mạng Git; local `refs/remotes/origin/main` hiện bằng HEAD nhưng chưa được xác minh mới.
5. Giữ trạng thái phát hành `NOT READY` đến khi có installer/signing/update, packaged Windows Host + peer LAN, macOS, GPU/device và egress-containment acceptance độc lập.

## File lịch sử giữ ngoài loạt commit hiện tại

~~~text
project-document/audits/v1.10.0-deep-technical-audit/00_EXECUTIVE_SUMMARY.md
project-document/audits/v1.10.0-deep-technical-audit/01_ARCHITECTURE_AND_DEPENDENCY_MAP.md
project-document/audits/v1.10.0-deep-technical-audit/02_GAME_MECHANICS_AUDIT.md
project-document/audits/v1.10.0-deep-technical-audit/03_STATE_AND_MULTIPLAYER_AUDIT.md
project-document/audits/v1.10.0-deep-technical-audit/04_FRONTEND_RENDERING_AND_ANIMATION_AUDIT.md
project-document/audits/v1.10.0-deep-technical-audit/05_ELECTRON_RUNTIME_AND_LIFECYCLE_AUDIT.md
project-document/audits/v1.10.0-deep-technical-audit/06_DEAD_CODE_AND_REDUNDANCY_INVENTORY.md
project-document/audits/v1.10.0-deep-technical-audit/07_PERFORMANCE_AND_MEMORY_OPPORTUNITIES.md
project-document/audits/v1.10.0-deep-technical-audit/08_TEST_COVERAGE_AND_REGRESSION_RISKS.md
project-document/audits/v1.10.0-deep-technical-audit/09_PRIORITIZED_REFACTORING_BACKLOG.md
project-document/audits/v1.10.0-deep-technical-audit/10_AUDIT_EVIDENCE_AND_LIMITATIONS.md
project-document/audits/v1.10.0-deep-technical-audit/11_POST_AUDIT_VERIFICATION.md
project-document/audits/v1.10.0-deep-technical-audit/12_PHASE_E1_REGRESSION_HARDENING.md
project-document/audits/v1.10.0-deep-technical-audit/13_E1_FIX_019_IMPLEMENTATION.md
project-document/audits/v1.10.0-deep-technical-audit/14_E1_FIX_001_IMPLEMENTATION.md
project-document/audits/v1.10.0-deep-technical-audit/15_E1_FIX_003_IMPLEMENTATION.md
project-document/audits/v1.10.0-deep-technical-audit/16_E1_FIX_004_IMPLEMENTATION.md
project-document/audits/v1.10.0-deep-technical-audit/17_PHASE_A1_DOCUMENTATION_SYNC.md
project-document/audits/v1.10.0-deep-technical-audit/18_PHASE_A2_A3_SAFE_CODE_CLEANUP.md
project-document/audits/v1.10.0-deep-technical-audit/19_PHASE_A4_TRADE_CANCELLATION_EMITTER.md
project-document/audits/v1.10.0-deep-technical-audit/20_PHASE_B_CONSOLIDATED_GAME_LOGIC_AND_C1.md
project-document/audits/v1.10.0-deep-technical-audit/20_PHASE_B_CONSOLIDATED_GAME_LOGIC_AND_C1_PRETASK_SHA256.json
project-document/audits/v1.10.0-deep-technical-audit/21_PHASE_C2_STATE_PERFORMANCE_CHARACTERIZATION.md
project-document/audits/v1.10.0-deep-technical-audit/22_PHASE_D1_D2_GAMEPLAY_AND_MACOS_CLOSE.md
project-document/audits/v1.10.0-deep-technical-audit/22_PHASE_D1_D2_PRETASK_SHA256.json
project-document/audits/v1.10.0-deep-technical-audit/23_PHASE_D3_TECHNICAL_HARDENING.md
project-document/audits/v1.10.0-deep-technical-audit/24_FINAL_INTEGRATION_AND_RC_READINESS.md
project-document/audits/v1.10.0-deep-technical-audit/25_PHASE_F2_PACKAGE_BOUNDARY_HARDENING.md
project-document/audits/v1.10.0-deep-technical-audit/26_PHASE_F3_CONTROLLED_RC_ARTIFACT_VERIFICATION.md
project-document/audits/v1.10.0-deep-technical-audit/27_PHASE_F4_F5_NATIVE_INSTALLER_ACCEPTANCE.md
project-document/audits/v1.10.0-deep-technical-audit/28_PHASE_F6_INSTALLER_PARITY_AND_HOST_ISOLATION.md
project-document/audits/v1.10.0-deep-technical-audit/29_PHASE_F7_SAFE_HOST_TEST_INFRASTRUCTURE.md
project-document/audits/v1.10.0-deep-technical-audit/30_PHASE_F8_VM_FREE_NATIVE_HOST_ACCEPTANCE.md
project-document/audits/v1.10.0-deep-technical-audit/31_PHASE_F9_NATIVE_NETWORK_AND_HOST_ACCEPTANCE.md
project-document/audits/v1.10.0-deep-technical-audit/32_PHASE_F10_NETWORK_ISOLATION_FEASIBILITY.md
~~~

Machine-readable path partition và trạng thái remote nằm trong `F11-GIT-INTEGRATION-PLAN.json` và `F11-WORKTREE-INVENTORY.json` dưới `test-results/phase-f11-final-refactor-review/`; các JSON này bị ignore.