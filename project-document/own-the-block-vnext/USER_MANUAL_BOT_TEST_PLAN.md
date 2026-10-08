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

## Ghi kết quả

| Ngày | Ca | Máy / trình duyệt / mạng | Phiên bản (commit) | Kết quả | Ghi chú / ảnh |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
