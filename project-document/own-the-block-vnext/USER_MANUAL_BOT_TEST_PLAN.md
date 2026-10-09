# Kế hoạch test tay cho bot và cả ván (do chủ dự án thực hiện)

Codex/Claude **không** chơi trọn ván, không chạy mô phỏng nhiều ván. Mọi ca dưới đây ghi `NOT RUN (USER MANUAL)` trong
[ACCEPTANCE_MATRIX.md](./ACCEPTANCE_MATRIX.md) cho tới khi bạn ghi kết quả thật (ngày, máy, phiên bản/commit, PASS/FAIL, ảnh
hoặc ghi chú). Một lỗi tìm thấy: ghi bước tái hiện, mã phòng, giờ và (nếu có) log server khi chạy với `OTB_BOT_LOG=1`.

## Chuẩn bị

- Bản cài từ nhánh `feat/own-the-block-multiplayer-bots-vnext` (bản RC hoặc `pnpm desktop:package`), hoặc dev: server
  `PORT=8080 OTB_BOT_LOG=1 pnpm --filter @monopoly/server start` + client `pnpm --filter @monopoly/client exec vite`.
- Log quyết định bot: mỗi dòng `[bot] Bot N <loại> -> <lệnh> (<lý do>)`, không chứa token, lá bài ẩn hay đề nghị riêng của người khác.
- Tốc độ bot: mặc định ~1–4 giây mỗi quyết định; `BOT_ACTION_DELAY_SCALE=0.5` để test nhanh hơn (chỉ để test).

## A. Sảnh (mỗi ca vài phút, không cần chơi)

| # | Thao tác | Kỳ vọng |
| --- | --- | --- |
| A1 | Host bấm "Thêm Bot" 3 lần | Bot 1, Bot 2, Bot 3; mỗi bot có mascot/màu riêng, "Đã sẵn sàng", không có biểu tượng mất kết nối |
| A2 | Bấm "Thêm Bot" thật nhanh nhiều lần | Không bao giờ quá 4 ghế; mỗi lần bấm hợp lệ thêm đúng một bot |
| A3 | Khách (không phải host) nhìn sảnh | Không thấy nút Thêm Bot / Xóa Bot |
| A4 | Host + 3 bot, người thứ 2 vào bằng mã | Báo "Phòng đã đủ người chơi"; không bot nào bị đẩy ra |
| A5 | Host xóa Bot 2, rồi người thứ 2 vào | Vào được ghế trống; thêm bot lại sẽ tên Bot 2 |
| A6 | Host một mình bấm Bắt đầu | Không bắt đầu được (cần ít nhất 2 người) |
| A7 | 2v2: chuyển chế độ khi đã có bot | Bot vẫn sẵn sàng, mặc màu đội; xin đổi chỗ với bot thì đổi ngay |
| A8 | Đang chơi: thử thêm/xóa bot, người lạ vào bằng mã | Không có nút; người lạ chỉ xem |

## B. Trọn ván (USER MANUAL — chơi tới khi có người thắng)

| # | Cấu hình | Điểm cần quan sát |
| --- | --- | --- |
| B1 | 1 người + 1 bot | Bot mua có chọn lọc (không mua tất cả), xây nhà khi dư tiền, trả thuế 200/100, xử lý thẻ Cơ Hội/Khí Vận, vào/ra tù, ván kết thúc có người thắng |
| B2 | 1 người + 3 bot | Không lúc nào bị treo; luôn thấy rõ bot nào đang đi; các bot phá sản bị đánh dấu "Phá sản" và bị bỏ qua lượt |
| B3 | 2 người + 2 bot (Solo) | Hai người đều thấy cùng trạng thái; chat bình thường; lượt người chơi không bị bot cướp |
| B4 | 2 người + 2 bot (2v2) | Miễn thuê đồng đội, Team Investment, cứu trợ khẩn cấp và hồi sinh do bot quyết định hợp lý |
| B5 | 2/3/4 người, không bot | Không khác v1.6.1 (hồi quy) |
| B6 | Phá sản | Bot nợ bán tài sản trước, chỉ phá sản khi hết cách; người chơi phá sản vẫn xem tiếp được |
| B7 | Giao dịch với bot | Đề nghị tốt được nhận, đề nghị bất lợi bị từ chối trong vài giây; bot không bao giờ tự đề nghị |
| B8 | Bán bắt buộc cho bot | Khi bạn nợ, đề nghị bán ô cho bot với giá rẻ/đắt: bot mua khi hời, từ chối khi đắt |

## C. Mất kết nối và chơi lại

| # | Thao tác | Kỳ vọng |
| --- | --- | --- |
| C1 | Khách tắt mạng giữa lượt của mình (kể cả khi đang mở thẻ) | Ghế giữ nguyên, hiện "Mất kết nối" + đếm ngược 60 giây; hết giờ thì lượt được xử lý hợp lệ (thẻ được áp dụng, quyết định mua bị bỏ qua); không có bot thay |
| C2 | Khách vào lại trong 60 giây | Về đúng ghế, đúng tiền, không lặp lượt |
| C3 | Mọi người chơi thật cùng mất kết nối, chỉ còn bot | Bot dừng chờ; khi có người quay lại, bot đi tiếp |
| C4 | Host mất mạng ngắn (tunnel đổi link) | Ván trên máy host vẫn còn; khách dán link mới vào hộp "Mất kết nối" để quay lại đúng ghế (R3) |
| C5 | Tắt hẳn ứng dụng host | Khách thấy phòng đã đóng; mở lại không khôi phục ván cũ |
| C6 | Kết thúc ván → "Chơi lại" | Bot ở lại và sẵn sàng; người chơi phải bấm sẵn sàng lại; tiền/tài sản/vị trí đặt lại; không có hành động nào của ván trước chạy sang ván mới |
| C7 | Người chơi thật cuối cùng rời phòng khi còn bot | Phòng đóng, không để bot tự chơi |

## D. Hoạt ảnh bot và nút "Xem bàn cờ" (RC hardening)

| # | Thao tác | Kỳ vọng |
| --- | --- | --- |
| D1 | 1 người + 1 bot, xem bot đổ và dừng ở ô đất trống rồi mua | Xúc xắc lăn xong, mascot nhảy từng ô và đáp xuống, dừng một nhịp "suy nghĩ", **sau đó** cờ sở hữu mới hiện; không bao giờ thấy cờ trước khi mascot đáp |
| D2 | Như D1 ở tốc độ hoạt ảnh chậm nhất và nhanh nhất (Cài đặt) | Thứ tự giữ nguyên; ở tốc độ chậm nhịp suy nghĩ có thể ngắn hơn nhưng cờ vẫn sau khi đáp |
| D3 | Bật "Giảm chuyển động" | Không có hoạt ảnh nhưng cờ vẫn không hiện trước vị trí mới của mascot |
| D4 | Bot đi qua Xuất Phát rồi mua; bot từ chối mua; bot xây nhà; hai máy cùng xem | Qua Xuất Phát: nhận tiền rồi mới cờ; từ chối: không có cờ; nhà hiện sau khi đáp; hai máy thấy cùng thứ tự (máy chậm không làm máy kia chờ); mất mạng rồi vào lại: thấy đúng chủ sở hữu ngay |
| D5 | Mở quyết định mua, bấm nút mắt gạch (Xem bàn cờ) | Hộp thoại và nền tối biến mất; đúng chỗ nút vừa bấm còn một nút mắt (không có chữ); bấm được mọi thứ trên bàn cờ quanh đó |
| D6 | Bấm lại nút mắt | Hộp thoại hiện lại đúng như trước (lựa chọn, chữ đã gõ còn nguyên); nút mắt gạch ở đúng chỗ cũ |
| D7 | Điện thoại dọc/ngang, máy tính bảng; xoay máy khi đang ẩn | Nút vẫn ở góc header cũ, đủ lớn để bấm bằng ngón tay, không bị tràn ra ngoài màn hình |
| D8 | Bàn phím: Tab tới nút mắt gạch, Enter, Enter lại; ẩn hai hộp thoại chồng nhau | Focus chuyển qua lại giữa hai nút; Escape không đóng quyết định đang ẩn; chỉ một nút mắt cho hộp ẩn sau cùng |
| D9 | Mất kết nối khi Host đổi link Online, dán link mới (trình duyệt https và ứng dụng desktop) | Vào lại đúng ghế; link của một Host khác cùng mã phòng bị từ chối ("Link này không dẫn tới máy chủ…"); trang LAN `http://` báo không kiểm tra được và không chuyển token |

## Ghi kết quả

**2026-10-09 — OWNER-REPORTED MANUAL QA: PASS.** Chủ dự án xác nhận đã hoàn tất toàn bộ test tay (bot, nhiều người chơi, hoạt ảnh bot, nút "Xem bàn cờ") và đạt. Không có nhật ký từng ca, máy hay giờ được cung cấp nên bảng dưới được để trống thay vì bịa số liệu.


| Ngày | Ca | Máy / trình duyệt / mạng | Phiên bản (commit) | Kết quả | Ghi chú / ảnh |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
