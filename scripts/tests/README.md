# Phase E1 — Kiểm thử hồi quy opt-in

Chỉ dành cho tests của v1.10.0, baseline `5a93a29c29ee91ad941ecf07eb958fc78e83bf9b`. Thay đổi production thuộc phạm vi của task fix tương ứng; không nới correctness assertions để đạt PASS.

## Ba cách chạy

- Suite mặc định giữ nguyên `pnpm test`; các file `*.e1.ts` / `*.e1.tsx` không khớp mẫu test mặc định của Vitest.
- `characterization` chứng minh có kiểm soát lỗi hiện tại và các invariant còn đúng. PASS của trường hợp ghi “known defect” có nghĩa đã tái hiện lỗi.
- `regression` yêu cầu hành vi đúng sau fix. Khi lỗi còn tồn tại, assertions phải FAIL với exit code 1. Không dùng skip, todo, expected-failure inversion hay biến môi trường kích hoạt toàn cục.

Chạy từ repository root, với dependencies đã có sẵn. Trước mọi lệnh pnpm trong PowerShell:

```powershell
$env:pnpm_config_verify_deps_before_run = 'error'
pnpm test
node --test scripts/perf/signatures.check.mjs
node scripts/tests/runPhaseE1.mjs --mode characterization --finding all
node scripts/tests/runPhaseE1.mjs --mode regression --finding 019
node scripts/tests/runPhaseE1.mjs --mode regression --finding 001
node scripts/tests/runPhaseE1.mjs --mode regression --finding 003
node scripts/tests/runPhaseE1.mjs --mode regression --finding 004
node scripts/tests/runPhaseE1.mjs --mode regression --finding all
```

Runner gọi API Vitest đã cài của từng workspace, không gọi trình cài đặt. Mỗi finding có root/environment/pool tương ứng suite hiện hữu; client dùng cấu hình Vite thật và jsdom. Mode được truyền qua Vitest `provide/inject`; chạy thiếu mode sẽ báo lỗi. Electron được kiểm `path.txt` và executable trước khi import; thiếu binary thì BLOCKED, không tải.

JSON kết quả nằm trong `test-results/phase-e1/`. Có thể chọn một finding ở cả hai mode. Lệnh `all` tiếp tục qua cả bốn finding dù một suite FAIL, rồi trả exit code tổng hợp. Invariant đúng có thể PASS trong regression, nhưng không được diễn giải thành finding đã fix nếu assertions còn FAIL.

## Kiểm tra test code

Workspace tsconfig hiện hữu chỉ include `src`; cấu hình E1 bổ sung để kiểm tra cả test opt-in:

```powershell
pnpm exec tsc --project apps/server/e1/tsconfig.json --noEmit
pnpm exec tsc --project apps/client/e1/tsconfig.json --noEmit
pnpm exec tsc --project apps/desktop/e1/tsconfig.json --noEmit
pnpm typecheck
pnpm lint
pnpm build
pnpm validate:docs
```

Không kết nối registry/Cloudflare/tunnel công khai. Server dùng Socket.IO loopback; client dùng transport mock và App/presentation thật; desktop mock helper/tunnel/registry/native I/O, đồng bộ bằng deferred promises và fake timers. Timeout ở event barrier chỉ chặn test treo, không được dùng để quyết định thành công.

Hai test mô phỏng B8 hiện hữu ghi output vào thư mục tạm của hệ điều hành và dọn bằng afterAll; không ghi đè JSON bằng chứng lịch sử. Không suy native Electron, GPU hay browser/device acceptance từ các suite này.

Kết quả và inventory đầy đủ: Báo cáo E1 (local-only historical evidence: `12_PHASE_E1_REGRESSION_HARDENING.md`; unavailable in a clean checkout).

## Sau E1-FIX-019, E1-FIX-001, E1-FIX-003 và E1-FIX-004

AUDIT-019 đã được sửa ở CURRENT DEVELOPMENT: cả hai mode của `apps/server/e1/audit019.e1.ts` yêu cầu hành vi đúng (5/5 PASS). Các assertions tái hiện ghost cũ được giữ làm bằng chứng lịch sử trong audit03/11/12, không còn là golden cho source đã sửa. Hai invariant019-C giữ nguyên.

AUDIT-001 đã được sửa ở CURRENT DEVELOPMENT: cả hai mode yêu cầu **10/10 PASS**. `apps/client/e1/audit001.e1.tsx` dùng correctness assertions và đã retire các nhánh bug-reproduction về stale UI; invariant reconnect revision cao hơn, lower-version protection, no-animation-replay và spectator privacy giữ nguyên. Producer `apps/server/e1/audit001Presence.e1.ts` giữ nguyên assertions: characterization kiểm version không đổi trong các scenario tương ứng, regression cho phép version monotonic; cả hai vẫn hợp lệ với thiết kế merge presence cùng version. Edge cases mặc định ở `apps/client/src/App.presence.test.tsx` và `apps/server/src/socket.presenceSynchronization.integration.test.ts`. Evidence trước fix vẫn nằm trong audit03/11/12/13.

AUDIT-003 đã được sửa ở CURRENT DEVELOPMENT: cả hai mode của `apps/desktop/e1/audit003.e1.ts` yêu cầu **6/6 PASS**. Năm nhánh tái hiện startup muộn, quit/update bỏ pending và stale coalescing đã được retire; correctness assertions và same-room coalescing control giữ nguyên. Default edge cases ở `apps/desktop/tests/hostStartupCancellation.test.ts` và `apps/desktop/tests/hostStartupBootstrap.test.ts` dùng controller/bootstrap/coordinator/updater thật, chỉ mock native/network/installer I/O. Evidence trước fix vẫn nằm trong audit05/11/12/14; báo cáo riêng003 ghi kết quả red→green.

AUDIT-004 đã chuyển sang post-fix characterization ở CURRENT DEVELOPMENT: cả hai mode của `apps/desktop/e1/audit004.e1.ts` yêu cầu **9/9 PASS** với cùng correctness assertions. Các nhánh tái hiện late activation/renewal sửa Host mới đã được retire; ba controls về stopped renewal và concurrent current activation giữ nguyên. Pending same-owner activation có thể coalesce, nên test không ép số request vốn đặc trưng cho implementation lỗi. Default edge cases ở `apps/desktop/tests/hostRegistryOwnership.test.ts` kiểm actual controller với adapters local, deferred promises và fake timers; không gọi registry/tunnel thật. Evidence trước fix vẫn nằm trong audit05/11/12/15; kết quả red→green và các giới hạn remote/native nằm trong báo cáo004.

Toàn bộ bốn finding ở mỗi mode yêu cầu **30/30 PASS**; runner giữ exit code tổng hợp và không bỏ assertion để đạt số lượng. Kết quả thực tế của từng lần chạy phải đọc từ JSON/log và implementation report, không suy ra từ mục tiêu này. Các edge-case019 bổ sung nằm trong default suite tại `apps/server/src/socket.resumeOwnership.integration.test.ts`.
