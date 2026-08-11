# Kế hoạch thẻ thiết kế — phủ HIỆN TẠI và TƯƠNG LAI

Chỉ đạo founder 11/08: *"Phải làm toàn bộ design cần thiết cho hiện tại và tương lai luôn,
tránh phải quay lại vẽ lại hoặc quay lại vẽ tiếp."*

File này là **danh sách chốt**. Vẽ xong một thẻ thì đánh dấu `[x]` ngay trong cùng commit.
Không giữ danh sách này trong đầu — giữ ở đây để không ai phải rà lại từ đầu.

## Kỷ luật cho mọi thẻ (không có ngoại lệ)

1. Vẽ → `check-ds.mjs` phải PASS → soi bằng mắt qua trình duyệt → đồng bộ claude design → commit.
2. Thẻ phải khớp CODE THẬT. Lệch nhau thì sửa thẻ theo code, trừ khi code sai thật (lúc đó ghi rõ trong commit).
3. Màn chưa có code: vẽ theo kế hoạch, và ghi rõ trong `<p class="note">` là **CHƯA CÓ CODE** để không ai tưởng đang chạy.

---

## A. Màn đang chạy thật, CHƯA có thẻ

- [x] Duyệt (`man-duyet.html`) — 3 tab, phiếu, duyệt/từ chối
- [x] Quy trình tự động (`man-tu-dong.html`) — bật/tắt, chi tiết, 7 trạng thái chạy
- [x] Mã QR theo kênh (`man-ma-qr.html`) — danh sách, tạo mã, thêm nguồn tại chỗ
- [x] Cam kết phản hồi / SLA (`man-cam-ket.html`) — 3 cam kết, cảnh báo, sửa mốc
- [x] Biểu mẫu (`man-bieu-mau.html`) — danh sách 3 trạng thái + trình dựng + xem thử
- [x] Cấu hình Zalo Bot (`man-zalo-bot.html`) — nối bot, mã ghép nhân viên, quota, gửi thử
- [x] Mẫu trả lời nhanh (`man-mau-tra-loi.html`) — danh sách, thêm/sửa, đếm lượt dùng
- [x] Hạng khách (`man-hang-khach.html`) — VIP/thường/ngủ đông, ngưỡng tự xếp hạng
- [x] Đổi mật khẩu — KHÔNG vẽ thẻ riêng: đúng 3 ô mật khẩu, đã phủ trọn bởi `auth-screens.html` (khối đặt lại) + `forms.html`. Vẽ thêm là trùng lặp.

## B. Màn đang chạy thật, MỚI CÓ MỘT PHẦN

- [x] Đội ngũ (`man-doi-ngu.html`) — thanh ghế đã dùng, bảng thành viên theo vai, thu hồi lời mời, đặt mục tiêu tháng từng người *(thẻ `nhan-vien-khong-email.html` mới phủ khối "Mời thêm người")*
- [x] Live Chat — màn cài đặt của chủ tiệm (`man-live-chat-cai-dat.html`) — khoá nhúng, danh sách tên miền, 5 trạng thái kênh *(thẻ `hop-chat-website.html` chỉ vẽ widget phía khách)*
- [x] Gói cước (`man-goi-cuoc.html`) — thanh mức dùng, luồng đổi gói, hoá đơn chờ *(thẻ `the-goi-cuoc.html` mới phủ thẻ gói)*
- [x] Mục tiêu tháng cả đội (`man-muc-tieu-thang.html`) — bảng người × 3 chỉ số, nhãn nhịp, đổi tháng
- [ ] Tổng quan (`man-tong-quan.html`) — vẽ TRỌN màn (lưới ô số + biểu đồ + panel nguồn/nhân viên + bản tin tuần) *(hiện chỉ có khung xương lúc tải)*
- [ ] Hộp thư — trợ lý AI (`man-ai-ho-tro.html`) — tóm tắt hội thoại, gợi ý trả lời, trích thông tin khách, hết quota
- [x] Hộp thư — bàn giao (`man-ban-giao.html`) — dải báo đang bàn giao, hộp chọn người + lý do
- [ ] Danh sách Công ty (`man-cong-ty.html`) — xác nhận dùng lại được thẻ thanh công cụ, nếu không thì vẽ riêng

## C. TƯƠNG LAI — có trong kế hoạch, CHƯA có dòng code nào

> Vẽ trước để lúc code không phải dừng lại thiết kế. Mỗi thẻ ghi rõ "CHƯA CÓ CODE".

- [ ] Kho hàng (`man-kho-hang.html`) — danh sách hàng, tồn, nhập/xuất, cảnh báo sắp hết *(Giai đoạn 2)*
- [ ] Thu chi (`man-thu-chi.html`) — sổ thu/chi, phân loại, đối chiếu doanh thu *(Giai đoạn 2)*
- [ ] Trình tạo quy trình mới (`man-tao-quy-trinh.html`) — dựng Khi nào · Nếu · Thì, hiện chỉ bật/tắt playbook sẵn
- [ ] Thanh toán tự động (`man-thanh-toan.html`) — chọn cổng, trạng thái giao dịch, hoá đơn tự động *(chờ SePay/PayOS + pháp nhân)*
- [ ] ZNS — tin ngoài cửa sổ 48 giờ (`man-zns.html`) — chọn mẫu duyệt sẵn, báo phí trước khi gửi
- [ ] 4 kênh social (`man-kenh-social.html`) — Facebook, Instagram, Gmail, TikTok Shop: nối kênh + hộp thư gộp
- [ ] PWA bước 2–3 (`man-pwa.html`) — mời cài lên máy, màn chờ, trạng thái mất mạng, đồng bộ lại khi có mạng
- [ ] Đa ngôn ngữ (`man-da-ngon-ngu.html`) — chọn ngôn ngữ, tiền tệ, múi giờ; ảnh hưởng tới nhãn ngành *(task #45)*

## D. Nền tảng / thành phần còn thiếu

- [ ] Bảng dữ liệu dài (`table.html` đã có) — kiểm tra đã phủ phân trang + sắp xếp + cột dính chưa
- [ ] Trạng thái mất mạng & thử lại — kiểm `trang-thai-chan-va-loi.html` đã phủ chưa, thiếu thì bổ sung

---

**Đếm:** A xong · B còn 3 · C còn 8 · D còn 2 → **13 thẻ nữa**. Đã xong 14.
