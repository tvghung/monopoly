# F11 — sổ đăng ký tổng hợp các phát hiện audit

Phạm vi là các phát hiện AUDIT-001–022 từ chuỗi báo cáo 00–32, đối chiếu với source hiện tại và kiểm tra F11. Các báo cáo lịch sử vẫn được giữ nguyên.

| ID | Ưu tiên | Kết luận F11 | Trạng thái |
|---|---:|---|---|
| AUDIT-001 | P2 | Snapshot presence cùng version chỉ cập nhật `connected` của human active trong cùng room; không reset gameplay/presentation. | FIXED |
| AUDIT-002 | P1 | Direct handoff sau leave/bankruptcy thực hiện jail bookkeeping cho successor đúng một lần. | FIXED |
| AUDIT-003 | P2 | Stop/Quit/update sở hữu lifecycle trước await; barrier chung hủy/đợi startup đang chạy. | FIXED |
| AUDIT-004 | P2 | Owner/lease/endpoint/timer/epoch ngăn continuation cũ tác động lifecycle mới. Remote API vẫn không có abort/CAS. | FIXED WITH REMOTE-CANCEL LIMIT |
| AUDIT-005 | P2 | Terminal offer được giữ tới khi room bị xóa; chính sách history/retention và xung đột offer ID chưa được product quyết định. | DEFERRED |
| AUDIT-006 | P2 | Clone toàn store mỗi transaction/cleanup đã được đo bằng workload tổng hợp; chưa có production SLO/workload để biện minh đổi kiến trúc. | DEFERRED |
| AUDIT-007 | P2 | Bỏ lần clone `boardState` trùng lặp. | FIXED |
| AUDIT-008 | P2 | Trade preview và draft không còn áp dụng cùng giao dịch hai lần. | FIXED |
| AUDIT-009 | P2 | Công thức/constant economy được dùng chung, giảm lệch giữa đường xử lý. | FIXED |
| AUDIT-010 | P2 | Jail-free card chỉ được trả lại một lần. | FIXED |
| AUDIT-011 | P3 | No-op/replay commit hiện vẫn có thể tăng revision/broadcast; hợp đồng publication chưa được định nghĩa. | DEFERRED |
| AUDIT-012 | P3 | Xóa năm scene component lỗi thời; ref search trong client source không còn import. | FIXED |
| AUDIT-013 | P3 | Xóa aliases/helpers/types không dùng, gồm executor types cũ. | FIXED |
| AUDIT-014 | P3 | Bỏ timeout scaffolding không còn được scheduler dùng. | FIXED |
| AUDIT-015 | P3 | Cleanup PMREM chịu được exception và có test lifecycle; GPU/WebGL vẫn cần native acceptance. | FIXED — GPU PENDING |
| AUDIT-016 | P3 | Runtime chỉ nhận schema V11; transform V4–V11 nằm trong test support. Comment hiện hành mô tả đúng ranh giới. | FIXED |
| AUDIT-017 | P2 | Nhãn/version trong docs và source đã đồng bộ với v1.10.0/protocol 14/schema 11. Link evidence clean-clone được ghi riêng ở F11. | FIXED |
| AUDIT-018 | P2 | Fingerprint/parity tĩnh có, nhưng identity artifact, installer/signature/update và native acceptance chưa hoàn tất. | OPEN — RELEASE BLOCKER |
| AUDIT-019 | P1 | Ordinal, liveness, cancel và generation bảo vệ socket resume khỏi stale owner. E1 regression 5/5; workspace integration pass. | FIXED |
| AUDIT-020 | P2 | macOS close khi Host active hỏi xác nhận; cancel giữ app, confirm dừng Host trước close, lỗi giữ cửa sổ. Native macOS chưa chạy. | FIXED — NATIVE PENDING |
| AUDIT-021 | P2 | Hủy offer không phát emitter trùng. | FIXED |
| AUDIT-022 | P2 | Pointerup/cancel/lost capture và blur giải phóng gesture khi pointer rời canvas. Thiết bị thật/touch/high refresh chưa nghiệm thu. | FIXED — DEVICE PENDING |

## Chi tiết các mục còn mở hoặc có giới hạn

- **AUDIT-004:** local ownership/token check ngăn stale response đổi state hiện tại. Remote registry revoke/create vẫn không có cơ chế hủy/CAS, nên network timeout có thể để lại lease-side effect; report16 đã ghi giới hạn này.
- **AUDIT-005, 006, 011:** giữ nguyên hành vi đã đo/characterize; chưa đổi semantics hoặc cấu trúc store khi chưa có retention policy, production workload/SLO và contract cho revision/broadcast.
- **AUDIT-015, 020, 022:** tự động hóa xác nhận logic source. Chúng không thay thế GPU/WebGL, macOS native và thiết bị vật lý.
- **AUDIT-018:** candidate source fingerprint và payload parity cục bộ không tương đương installer được ký/chạy, update rollback, cài đặt sạch/nâng cấp hoặc kiểm tra native host.

## Rủi ro chéo F7/F8/F9/F10

- F7 guard chặn TCP listen và UDP bind ngoài `127.0.0.1`/`::1` trong server Vitest worker và Node child được preload. Guard không phải firewall production/egress isolation. Hai LAN admission cases bị skip rỗng.
- F8 là opt-in qua command line ở main; helper dùng environment allowlist và server kiểm tra loopback bind trước/sau listen. Renderer IPC không bật mode. Source không giới hạn packaged/platform dù docs nói packaged Windows; OS-level egress containment chưa được chứng minh.
- F9/F10 ghi nhận giới hạn chính sách mạng bên ngoài môi trường kiểm thử. F11 chỉ phân loại đây là blocker; không đổi bất kỳ firewall/DNS/WARP/GPO setting nào.