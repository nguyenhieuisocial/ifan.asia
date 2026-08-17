# Kế hoạch thẻ thiết kế — phủ HIỆN TẠI và TƯƠNG LAI

Chỉ đạo founder 11/08: *"Phải làm toàn bộ design cần thiết cho hiện tại và tương lai luôn,
tránh phải quay lại vẽ lại hoặc quay lại vẽ tiếp."*

File này là **danh sách chốt**. Vẽ xong một thẻ thì đánh dấu `[x]` ngay trong cùng commit.
Không giữ danh sách này trong đầu — giữ ở đây để không ai phải rà lại từ đầu.

## Kỷ luật cho mọi thẻ (không có ngoại lệ)

1. Vẽ → `node scripts/soat-the-design.mjs` phải PASS → soi bằng mắt qua trình duyệt → **đồng bộ Claude Design** → commit.

   > ⚠️ **Sửa 17/08 — cổng kiểm này từng là một cái TÊN MA.** Dòng trên trước đây ghi `check-ds.mjs`;
   > tìm cả cây thư mục lẫn **toàn bộ lịch sử git** đều không có file đó. **111 thẻ đã vẽ dưới một cổng
   > kiểm không tồn tại.** Tệ hơn quên viết test: luật ghi rõ có cổng nên người sau TIN là thẻ đã được
   > kiểm — cổng không tồn tại không phân biệt được với cổng luôn PASS (cùng họ với luật D3).
   > Nay có công cụ THẬT, và ngay lần chạy đầu nó bắt 2 thẻ đang dán nhãn sai (xem mục F).
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
- [x] Tổng quan (`man-tong-quan.html`) — vẽ TRỌN màn (lưới ô số + biểu đồ + panel nguồn/nhân viên + bản tin tuần) *(hiện chỉ có khung xương lúc tải)*
- [x] Hộp thư — trợ lý AI (`man-ai-ho-tro.html`) — tóm tắt hội thoại, gợi ý trả lời, trích thông tin khách, hết quota
- [x] Hộp thư — bàn giao (`man-ban-giao.html`) — dải báo đang bàn giao, hộp chọn người + lý do
- [x] Danh sách Công ty — KHÔNG vẽ thẻ riêng: đã kiểm code (220 dòng, bảng thuần + ô tìm kiếm), phủ trọn bởi `table.html` + `thanh-cong-cu-va-bo-chon.html` + `empty-state.html`. Vẽ thêm là trùng lặp.

## C. TƯƠNG LAI — có trong kế hoạch, CHƯA có dòng code nào

> Vẽ trước để lúc code không phải dừng lại thiết kế. Mỗi thẻ ghi rõ "CHƯA CÓ CODE".

- [x] Kho hàng (`man-kho-hang.html`) — danh sách hàng, tồn, nhập/xuất, cảnh báo sắp hết *(Giai đoạn 2)*
- [x] Thu chi (`man-thu-chi.html`) — sổ thu/chi, phân loại, đối chiếu doanh thu *(Giai đoạn 2)*
- [x] Trình tạo quy trình mới (`man-tao-quy-trinh.html`) — dựng Khi nào · Nếu · Thì, hiện chỉ bật/tắt playbook sẵn
- [x] Thanh toán tự động (`man-thanh-toan.html`) — chọn cổng, trạng thái giao dịch, hoá đơn tự động *(chờ SePay/PayOS + pháp nhân)*
- [x] ZNS — tin ngoài cửa sổ 48 giờ — vẽ CHUNG trong `man-kenh-social.html` (nhóm biến thể 2), vì ZNS chỉ là nhánh của kênh Zalo chứ không phải màn riêng
- [x] 4 kênh social (`man-kenh-social.html`) — Facebook, Instagram, Gmail, TikTok Shop: nối kênh + hộp thư gộp
- [x] PWA bước 2–3 (`man-pwa.html`) — mời cài lên máy, màn chờ, trạng thái mất mạng, đồng bộ lại khi có mạng
- [x] Đa ngôn ngữ (`man-da-ngon-ngu.html`) — chọn ngôn ngữ, tiền tệ, múi giờ; ảnh hưởng tới nhãn ngành *(task #45)*

## D. Nền tảng / thành phần còn thiếu

- [x] Bảng dữ liệu dài — đã kiểm: app KHÔNG dùng phân trang số cũng không có sắp xếp cột, mà đi bằng nút “Xem thêm”. Đã BỔ SUNG nhóm biến thể thứ 6 vào `table.html`: còn nữa · đang tải thêm · hết danh sách (nói số) · chạm trần (công bố trần).
- [x] Trạng thái mất mạng & thử lại — `trang-thai-chan-va-loi.html` đã phủ lỗi tải + nút Thử lại + 404; riêng phần MẤT MẠNG (dải offline, hàng chờ gửi lại, gửi xong) nay nằm ở `man-pwa.html` nhóm 2. Không tách thẻ riêng.

## E. Rà lại theo TỪNG ĐƯỜNG DẪN THẬT (11/08, sau khi founder nói 27 chưa đủ)

Đối chiếu 47 route thật của app với 83 thẻ đang có. Ba màn dưới đây có code CHẠY THẬT
mà chưa thẻ nào phủ — danh sách A–D ban đầu bỏ sót:

- [x] Bảng điều khiển nền tảng (`man-admin.html`) — /admin, chỉ founder: danh sách tiệm, hoá đơn chờ thu, chuông báo job nền hỏng *(mới có `hoa-don-cho-thu.html` phủ 1 khối)*
- [x] Nhận lời mời (`man-nhan-loi-moi.html`) — /invite/[token], 5 trạng thái: hợp lệ · đã dùng · hết hạn · sai email · hết ghế
- [x] Tạo tiệm (`man-tao-tiem.html`) — /onboarding: tên tiệm + địa chỉ tự suy + chọn ngành + lối xem tiệm mẫu

**Đã kiểm và KHÔNG cần thẻ mới** (phủ đủ bởi thẻ sẵn có): /app/settings index → `khung-trang-cai-dat` · /app/notifications → `thong-bao` · /app/contacts/duplicates → `nhap-va-gop-du-lieu` · /livechat-demo → `hop-chat-website` · /privacy, /terms → `typography` · /q/[code] → `trang-thai-chan-va-loi` + `man-ma-qr` · /app/companies → `table` + `thanh-cong-cu-va-bo-chon` · /app/settings/account → `auth-screens` + `forms`.

---

**Đếm A–E:** 30/30 mục — **xong theo BẢN ĐỒ CŨ (20 mảng, chốt 11/08).**

---

## F. ⚠️ BẢN ĐỒ ĐÃ ĐỔI — danh sách A–E ở trên KHÔNG còn là "hết" (soát lại 17/08)

Tối 13/08, **ADR-0012 dựng lại bản đồ năng lực thành 9 nhóm → 28 mảng**. Danh sách A–E chốt ngày
11/08 nên chỉ phủ bản đồ 20 mảng cũ. Câu *"XONG HẾT"* ở trên **đúng lúc viết, sai lúc đọc** — đúng
con bệnh cả dự án đang đi vá.

**Đo 17/08:** 111 thẻ đang có, đối chiếu 15 mảng `planned` trong `lib/feature-registry.ts`.

### Đã có thẻ, không vẽ lại
`inventory` → `man-kho-hang` (mức V3 "kho gọn"; lô/HSD/FEFO/kiểm kê của V4 chưa có) ·
`finance` → `man-thu-chi` (sổ thu/chi; chốt sổ/khoá sổ/đối soát/P&L của V5 chưa có) ·
`automation` → `man-tu-dong` + `man-tao-quy-trinh`

### V3 — Tiền thật (đợt kế tiếp)
- [x] Hàng hoá & biến thể (`man-hang-hoa.html`) — catalog + variants + giá sỉ bậc + vòng đời (không có nút Xoá)
- [x] Đơn hàng (`man-don-hang.html`) — danh sách theo việc-cần-làm + chi tiết + máy trạng thái 6 giá trị + hoàn/đổi sinh phiếu mới
- [x] Thu tiền & hoá đơn khách (`man-thu-tien-vietqr.html`) — QR động theo đơn + 3 trạng thái + ranh giới hoá-đơn-khách vs hoá-đơn-iFan

### V4 — Hàng hoá chuẩn
- [ ] Kho sâu: lô + HSD + FEFO + cận date + kiểm kê + hao hụt
- [ ] Mua vào: nhà cung cấp + đơn mua hàng + trả NCC

### V5 — Két sắt
- [ ] Chốt sổ quỹ + chuyển quỹ 2 vế + bàn giao ca + khoá sổ kỳ + đối soát sao kê + P&L gọn

### V6 — Giữ khách & nền tảng mở
- [ ] Gói buổi/liệu trình + ví trả trước + sổ nghĩa vụ khách
- [ ] Đánh giá sau dịch vụ + CSAT + chấm chất lượng (`csatQc`)
- [ ] Voucher + khuyến mãi/combo + tích điểm
- [ ] Hoa hồng nhân viên
- [ ] Xuất dữ liệu + PDPL (`dataExport`)
- [ ] Webhook + khoá API (`integrations` — `the-kenh-ket-noi` chỉ là thẻ kênh chat)

### V7–V8 — Đội ngũ & mở rộng
- [ ] Hồ sơ nhân sự + chấm công + ca làm + nghỉ phép (`team` — `man-doi-ngu` chỉ là danh sách thành viên)
- [ ] Bảng lương (`payroll`)
- [ ] Tuyển dụng (`recruitment`)
- [ ] Chat nội bộ (`internalChat`)
- [ ] Dự án (`projects` — `man-cong-viec` là Kanban VIỆC, dự án là tầng trên)
- [ ] Sự kiện marketing (`events`)

### Đã sửa trong đợt soát này
- `man-lich-hen.html` và `man-dat-lich-tu-chat.html` còn dán nhãn **"(chưa có code)"** ở tiêu đề, trong
  khi **cả hai đã CHẠY THẬT từ 13/08** (V2 đóng trọn 6/6). Bắt được nhờ công cụ soát mới — 4 ngày
  không ai thấy. Đã gỡ nhãn và ghi rõ trạng thái thật.

> **Bài học của mục F:** một danh sách tự khai "XONG HẾT" là thứ nguy hiểm nhất trong kho tài liệu —
> nó tắt phản xạ kiểm tra của người đọc. Danh sách chỉ đúng **so với bản đồ tại thời điểm chốt**;
> bản đồ đổi thì "hết" phải được đo lại, không được thừa kế.
