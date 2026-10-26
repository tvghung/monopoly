# Pha F11 — rà soát refactor cuối và mức sẵn sàng Git

Ngày rà soát: 2026-10-24. Phạm vi: worktree `codex/v1.10.0-refactor`, so với HEAD `5a93a29c29ee91ad941ecf07eb958fc78e83bf9b`.

**Quyết định F11:** `READY WITH DOCUMENTED EXCEPTIONS` cho các commit cục bộ có kiểm soát. **Mức sẵn sàng của remote:** `INSUFFICIENT EVIDENCE` vì không fetch để xác minh độ mới của `origin/main`. **Phát hành công khai:** `NOT READY`.

## Kết luận

Đã rà soát 108 đường dẫn tracked (102 sửa, 6 xóa) và 72 file untracked hiện hữu; kế hoạch thêm 3 báo cáo F11 thành 148 đường dẫn dự kiến chia commit. Không có thay đổi staged. Sáu file xóa là các module scene đã được kiểm tra tham chiếu; không còn import từ `apps/client/src`.

Không phát hiện lỗ hổng bảo mật mới có bằng chứng cao trong thay đổi được rà soát. Các kiểm tra source cho thấy F7 chỉ giới hạn listener trong tiến trình test; F8 chọn từ tham số khởi chạy ở main, lọc môi trường helper và kiểm tra bind `127.0.0.1` trước/sau listen. Renderer IPC không thể bật F8. Đây là kết luận rà soát source và test, không phải xác nhận cách ly mạng của hệ điều hành.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
|---|---|
| `node scripts/tests/runPhaseE1.mjs --mode regression --finding all` | PASS — 30/30 test |
| `node scripts/tests/runPhaseE1.mjs --mode characterization --finding all` | PASS — 30/30 test |
| `pnpm test` | PASS — 4.031 passed, 2 skipped; client 2.693, desktop 629, server 639 passed và 2 skipped |
| `node --test scripts/perf/signatures.check.mjs` | PASS — 11/11 |
| `pnpm typecheck` | PASS |
| `pnpm exec tsc --project apps/server/e1/tsconfig.json --noEmit` | PASS |
| `pnpm exec tsc --project apps/client/e1/tsconfig.json --noEmit` | PASS |
| `pnpm exec tsc --project apps/desktop/e1/tsconfig.json --noEmit` | PASS |
| `pnpm lint` | PASS |
| `pnpm build` | PASS; Vite báo chunk `warmupHost` 510,28 kB sau minify |
| `pnpm validate:docs` | PASS cục bộ — 198 Markdown trước báo cáo F11; kiểm tra lại sau khi thêm 3 báo cáo đạt 201 Markdown. Link tới evidence ignored vẫn thiếu trên clean checkout |
| `pnpm validate:v1-contract` | PASS — Own the Block 1.10.0, socket protocol 14 |
| `git diff --check` | PASS; Git chỉ cảnh báo một số file LF sẽ được checkout thành CRLF |

Tất cả lệnh `pnpm` được chạy với `pnpm_config_verify_deps_before_run=error`. Hai bài test bị skip là tình huống Host admission cần bind LAN; chúng hiện là placeholder `it.skip` rỗng theo giới hạn F7, không phải test thất bại.

## Điều kiện còn lại cho tích hợp

1. `RELEASE_ACCEPTANCE_MATRIX.md:185` liên kết tới manifest F3 dưới `test-results/`, vốn bị ignore. Validator pass vì file có ở máy này; CI trên clone sạch sẽ không có target. Sửa liên kết sang tài liệu/artifact được lưu bền vững rồi kiểm tra trên clone sạch trước khi push/PR.
2. F8 được tài liệu mô tả như acceptance mode cho packaged Windows, nhưng parser không kiểm tra `app.isPackaged` hoặc nền tảng. Cần chốt chính sách phạm vi trước khi coi mô tả là hợp đồng phát hành.
3. Hai manifest lịch sử trong audit chứa đường dẫn tuyệt đối người dùng: manifest 20 có 1 tham chiếu; manifest 22 có 2.160 tham chiếu và kích thước 9.342.395 byte. Không đưa reports 00–32 vào commit hiện tại; chỉ xem xét lưu trữ sau khi rà soát và loại bỏ dữ liệu đường dẫn, đồng thời giữ liên kết hợp lệ.
4. `origin/main` ở local trỏ đúng HEAD hiện tại, nhưng remote chưa được fetch. Trạng thái remote/PR vì vậy chưa xác minh.
5. Chưa có xác nhận native cho installer/update/signature, Windows Host và peer LAN độc lập, macOS close Host, GPU/WebGL, touch/high refresh hoặc OS egress containment. Đây là release blocker; không thay đổi firewall, DNS, WARP hoặc GPO trong lượt này.
6. Các quyết định C2 về retention terminal offer, copy toàn store và revision/broadcast cho no-op vẫn được giữ ở trạng thái deferred; cần product policy hoặc SLO trước khi đổi.

## Bảo toàn và phạm vi thao tác

Snapshot trước task ghi 102 sửa, 6 xóa, 72 file untracked; 174 file nguồn/tài liệu được băm lại không có drift. Cả 35 file audit lịch sử 00–32 đều khớp SHA-256 ban đầu. `test-results/phase-e1` được khôi phục nguyên 33 file / 249.922 byte với cùng tree SHA-256; `apps/client/dist` được khôi phục nguyên 156 file / 7.564.026 byte với cùng tree SHA-256. E1 outputs và build mới được lưu riêng trong thư mục F11 run.

Không stage/commit/push, không sửa source hoặc lockfile, không cài dependency, không tạo installer/native acceptance package, và không đổi cấu hình firewall/DNS/WARP/GPO. Xem [master register](./34_MASTER_AUDIT_FINDINGS_REGISTER.md) và [kế hoạch Git](./35_GIT_INTEGRATION_AND_COMMIT_PLAN.md).

Log lệnh và JSON evidence nằm dưới `test-results/phase-f11-final-refactor-review/`; chúng bị ignore và không nằm trong kế hoạch commit.