# Sổ sự thật sản phẩm

Cập nhật: **11/08/2026** — bản kiểm kê gốc 10/08 (đọc toàn bộ code) + mục "Cập nhật 11/08" bên dưới sau 24 việc all-in-one.

**Luật của sổ này** (học FlowX): đây là nguồn sự thật DUY NHẤT về việc tính năng nào đang chạy thật.
- Thêm/bớt/mở khóa tính năng ⇒ PHẢI cập nhật sổ trong cùng đợt commit.
- Trang bán hàng, báo giá, tài liệu — nói gì về tính năng đều phải khớp sổ này.
- Ba trạng thái, không có trạng thái thứ tư: **CHẠY THẬT** · **LẮP SẴN CHỜ BÊN NGOÀI** (code xong, chờ giấy phép/khóa/cổng thanh toán) · **MỘT PHẦN** (có màn nhưng logic chưa trọn — ghi rõ thiếu gì).

## Đếm nhanh

| Trạng thái | Số mục |
|---|---|
| CHẠY THẬT | 36 |
| LẮP SẴN CHỜ BÊN NGOÀI | 7 |
| MỘT PHẦN | 4 |

## CHẠY THẬT (bảng gốc 10/08 — cộng mục Cập nhật 11/08 bên dưới = 36)

| Nhóm | Tính năng | Ghi chú |
|---|---|---|
| Public | Landing (huy hiệu Sẵn sàng/Sắp có trung thực), Điều khoản, Bảo mật | |
| Auth | Đăng nhập, đăng ký, quên/đặt lại mật khẩu, nhận lời mời | Email đi qua Supabase — free tier 2 thư/giờ (xem #44) |
| Onboarding | Tạo tiệm + template theo ngành | |
| Tổng quan | KPI, doanh thu theo nguồn, bản tin tuần | |
| Hôm nay | Việc hôm nay (sau đăng nhập về màn này) | |
| Hộp thư | Danh sách + thread + trả lời + gán người + trạng thái + ghi chú nội bộ + đã đọc + realtime + bàn giao + tìm kiếm | |
| Live Chat | Widget nhúng web + màn cài đặt | Kênh chạy được NGAY, không cần giấy phép |
| Khách hàng | Danh sách, chi tiết + timeline, chấm điểm lead (cron đêm), phân hạng (cron đêm), gộp trùng, nhập/xuất Excel | |
| Công ty | Danh sách + chi tiết | |
| Cơ hội | Kanban + thắng/thua + việc cần làm + chi tiết | |
| Báo cáo | Doanh thu theo nguồn (manager trở lên) | |
| Thông báo | Trung tâm thông báo + realtime | |
| Duyệt | Gửi phiếu theo biểu mẫu + duyệt/từ chối 1–2 cấp | |
| Biểu mẫu | Trình tạo form | |
| Workflow | Engine nền (event + retry + dead-letter) + 2 playbook cài sẵn | Màn quản lý mới bật/tắt — xem MỘT PHẦN |
| SLA | Engine đo + leo thang + màn sửa ngưỡng | |
| Mẫu trả lời | Câu trả lời nhanh | |
| Mã QR | Mã gắn nguồn khách + trang đích chống spam | |
| Đội ngũ | Mời thành viên 4 vai + giới hạn ghế | Chưa gửi email mời — trả link để chủ tiệm tự gửi (chủ đích, chờ #44) |
| Tài khoản | Đổi mật khẩu, hồ sơ | |
| Admin | Bảng điều khiển nền tảng (chỉ founder, cổng `is_platform_admin`) | |
| Hạ tầng | 12 job nền pg_cron + chuông báo job hỏng (migration #44, đã thử chuông kêu thật) · rate-limit 2 tầng không tự tắt · chặn đăng nhập proxy | |

## LẮP SẴN CHỜ BÊN NGOÀI (6)

| Tính năng | Chờ gì | Bằng chứng |
|---|---|---|
| Trợ lý AI trong hộp thư (tóm tắt, soạn trả lời, trích thông tin) | Khóa `ANTHROPIC_API_KEY` | `lib/ai/gateway.ts:42` — thiếu khóa hiện thông báo tử tế, có quota 200 lượt/tiệm/tháng |
| Webhook nhận tin Zalo OA | OA được Zalo duyệt + 2 biến env | `app/api/webhooks/zalo/route.ts:72` — chữ ký SHA256, sai là 401 |
| Gửi tin ra Zalo | OA + token thật | `lib/channels/zalo.ts` — có chế độ dry-run để QA trước |
| Kết nối OA trong cài đặt | Giấy phép OA | token cất trong Vault |
| Thanh toán gói cước tự động | Chốt SePay/PayOS + pháp nhân | migration #27 ghi rõ; hiện founder ghi nhận tiền THỦ CÔNG qua RPC |
| Email hệ thống chất lượng | Resend + tên miền (task #44) | free tier: 2 thư/giờ, mẫu thư không sửa được |

## MỘT PHẦN (4)

| Tính năng | Thiếu gì |
|---|---|
| 4 kênh social (Facebook, Instagram, Gmail, TikTok Shop) | Chỉ có card mờ "sắp có" — KHÔNG có code xử lý |
| Màn quản lý workflow | Chỉ bật/tắt playbook cài sẵn — chưa có trình tạo workflow mới |
| Nút "Nhắn Zalo" từ hồ sơ khách | Đang disabled, mở khi kênh Zalo mở |
| ZNS (tin ngoài cửa sổ 48h) | Mới chỉ là chữ "sắp có" trong banner — chưa có code |

## CHƯA LÀM (có trong kế hoạch, chưa có dòng code nào)

- **Kho hàng, thu chi** — thuộc GĐ2 (task #6), hiện không có màn/bảng/chuỗi dịch nào.
- **Zalo Bot nhắc việc nhân viên** — task #53.
- **PWA cảm giác app iOS** — task #50.

## 3 điều đáng nhớ về kiến trúc

1. **Toàn bộ máy chạy nền nằm trong CSDL** (pg_cron + trigger) — không cần server phụ, không phụ thuộc dịch vụ ngoài.
2. **Zalo là mảng "lắp sẵn" hoàn chỉnh nhất** — go-live chỉ cần điền env + token, không đổi code.
3. **Tiền vào hệ thống hiện 100% thủ công** — code chừa sẵn chỗ cho cổng thanh toán.

## Cập nhật 11/08 — sau 24 việc all-in-one (chi tiết: Quy hoạch tính năng hợp nhất 10-08 trong vault)

**4 mục MỚI vào CHẠY THẬT:** trang thử Live Chat (/livechat-demo — nhắn thử thấy tin về Hộp thư ~1 phút, tin thử không đánh lừa trạng thái kênh) · báo cáo "Vì sao thua" (reports/lost-reasons) · cột Chi phí + Lời/Lỗ từng nguồn (nhập tay tiền ads, reports/sources) · PWA bước 1 (cài lên màn hình chính, icon riêng, mở toàn màn).

**1 mục MỚI vào LẮP SẴN CHỜ BÊN NGOÀI:** Zalo Bot nhắc việc + SLA về Zalo cá nhân — máy đủ (bản tin gộp 15 phút, quota 3.000 tin/tháng, ghép nối nhân viên, màn cài đặt, token Vault) — CHỜ founder tạo bot ~5 phút và dán token (hướng dẫn trong vault).

**20 mục sẵn có được NÂNG CẤP lớn:** Hộp thư (trạm CRM mini: tạo cơ hội/việc ≤2 chạm trong chat; banner dán-mã-dở-dang) · Cơ hội (tìm kiếm DB-side, dialog Hẹn tiếp 2 chạm, mở lại hội thoại gốc, thắng → hẹn chăm lại + playbook 7 ngày) · Hôm nay ("đã xong N", tự làm mới 60s, sửa lỗi khách-nóng-loại-nhầm-vĩnh-viễn) · hồ sơ khách (Việc đang chờ ghim đầu + thông báo nhảy đúng dòng) · thông báo trỏ đúng đích · mọi số đếm bấm được (bộ lọc lên URL) · billing (hóa đơn chờ + hướng dẫn chuyển khoản) · /admin (Hóa đơn chờ thu + nút Đã nhận tiền idempotent + chuông báo job nền) · Cài đặt (trang index 4 cụm, nav ẩn theo vai, đếm lượt dùng câu trả lời nhanh) · QR tự gắn nguồn qua Live Chat · onboarding (checklist 3 bước, hết copy trỏ nhầm Zalo) · auth (nút Gửi lại thư) · vỏ mobile (skeleton 5 màn, bottom-sheet, vuốt back đúng, safe-area, badge tin chưa trả lời).

**CHƯA LÀM (không đổi):** kho hàng/thu chi (kế hoạch sau, task #6) · PWA bước 2–3 · 4 kênh social · workflow builder · ZNS. **Máy nền:** 14 job pg_cron (thêm zalo-bot-digest, cron-failure-scan) · 59 migration có sổ.

**1 mục MỚI vào CHẠY THẬT (11/08, sau landing):** KPI mục tiêu tháng (migration #59, hồ sơ mục 9 quy hoạch 10-08) — chủ/quản lý đặt mục tiêu tháng trong Cài đặt → Nhân viên (3 chỉ số: doanh thu chốt / khách mới / việc xong, cho từng nhân viên hoặc cả tiệm, bật/tắt từng chỉ số); nhân viên thấy thanh tiến độ CỦA MÌNH trên Hôm nay kèm nhãn vượt/hụt nhịp (chưa đặt mục tiêu thì ẩn hẳn); bảng cả đội ở Báo cáo → Mục tiêu tháng (% đạt + nhãn nhịp + ghi chú "đã đổi ngày N" khi sửa giữa tháng). Số tự cộng dồn DB-side qua RPC kpi_progress() từ deals/contacts/activities — CÙNG định nghĩa đếm với Tổng quan/Báo cáo nguồn, không có bảng cộng dồn riêng.
