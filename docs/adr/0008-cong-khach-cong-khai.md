# ADR-0008 — Cổng khách công khai: tách LÀM ĐÔI `/t/[slug]` và `/k/[token]`, và chỉ DỰNG phần đã có người dùng (12/08/2026)

**Trạng thái:** đã quyết, CHƯA thi công. Mở đợt **V1.5 "Cửa vào khách"** (trình tự 34.7).
**Người quyết:** Opus 5, phiên 12/08 (sau khi V1a + V1b đóng đủ 18/18).
**Ràng buộc gốc:** mục 34.7 (V1.5 = vỏ cổng khách T1 + mini-landing + form thu lead + hợp đồng `business_hours` T3a) · mục 23 ("đầy đủ" = chốt hợp đồng MỘT lần) · luật **D2** ("cột nào chưa có code ghi thì CHƯA tạo") · bất biến 1 (chặn ở API/RLS, không ở giao diện).

---

## 1. Bài toán

Đến hết V1b, iFan **không có một trang công khai nào cho khách của tiệm**. Mọi cửa đang có đều là cửa của NGƯỜI TRONG TIỆM (đăng nhập, mời nhân viên, trang thử Live Chat cho chủ tiệm xem). Tiệm không có website vẫn không có mặt tiền.

V1.5 mở cửa đó. Nhưng cửa công khai là bề mặt tấn công lớn nhất của cả hệ thống: **không đăng nhập, không RLS phiên, ai cầm link cũng vào được.** Dựng sai một lần là sửa rất đắt, vì mọi trang công khai đời sau (tự đặt lịch V2.5, đánh giá V6, cổng khách V8, Mini App) đều mọc lên từ đây.

## 2. Đo thật trước khi thiết kế (12/08, trên CSDL Singapore + kho code)

| Đo | Kết quả |
|---|---|
| Trang công khai cho KHÁCH của tiệm | **0** (`livechat-demo` là trang chủ tiệm tự xem; `invite/[token]` là mời nhân viên) |
| `business_hours` | **Chưa có bảng** |
| `lead_forms` / `tenant_public_pages` | **Chưa có bảng** |
| Cột công khai trên `tenants` | có `slug`, `logo_url`, `settings` jsonb — **chưa có** giới thiệu / địa chỉ / bản đồ |
| Khuôn ẩn danh đã chạy thật | `livechat_visitors`: lưu **`token_hash`** (không lưu token thô) + `ip_hash` + bộ đếm rate-limit **nằm trong bảng** + 4 RPC definer (`livechat_session/send/poll/setup`) |
| Tiệm thật / tiệm mẫu | **2 / 6** (2 tiệm thật đều là tiệm test rỗng của founder) |

**Kết luận đo:** thiết kế trên nền gần như trắng — không có nợ phải gỡ. Và đã có sẵn MỘT khuôn ẩn danh chạy thật để noi theo, không phải phát minh.

## 3. Phát hiện làm ĐỔI phạm vi V1.5 so với bảng 34.7

Bảng 34.7 xếp **"vỏ cổng khách MỘT lần `/k/[token]` (T1)"** vào V1.5. Đo kỹ thì: **trong V1.5 KHÔNG có thứ gì cần `/k/[token]`.**

- Mini-landing = công khai **theo TIỆM** (`/t/[slug]`), ai cũng xem được, không có token.
- Form thu lead = công khai **theo TIỆM**, người lạ điền, chưa phải "khách đã biết".
- Người dùng đầu tiên thật sự của `/k/[token]`: **tự đặt lịch (V2.5)**, **link đánh giá (V6)**, **cổng khách đăng nhập bằng SĐT (V8)**.

Dựng đủ bộ máy token bây giờ = **tạo cột/bảng chưa có code nào ghi vào — vi phạm thẳng luật D2 của chính dự án.**

**QUYẾT ĐỊNH 3:** V1.5 **viết xong HỢP ĐỒNG `/k/[token]` trên giấy** (mục 5 dưới đây — để V2.5/V6/V8 cắm vào không phải đập), nhưng **CHỈ DỰNG `/t/[slug]` + form thu lead + `business_hours`**. Đây đúng tinh thần mục 23: *chốt một lần, xếp lớp lên sau không phải đập* — chốt ≠ dựng.

## 4. QUYẾT ĐỊNH 1 — Hai họ URL, TÁCH HẲN, vĩnh viễn không gộp

| | `/t/[slug]` — **mặt tiền tiệm** | `/k/[token]` — **cửa riêng một khách** |
|---|---|---|
| Ai vào được | bất kỳ ai | chỉ người cầm đúng link |
| Google đánh chỉ mục | **CÓ** (đây là điểm bán) | **KHÔNG** — `noindex, nofollow` + `X-Robots-Tag` |
| Dữ liệu hiện ra | chỉ thông tin tiệm tự công bố | dữ liệu của **đúng một khách** |
| Ghi được gì | gửi form (tạo lead mới) | thao tác đúng phạm vi token |
| Đời sau mọc thêm | dịch vụ nổi bật, đánh giá tổng hợp | đặt lịch, đánh giá, xem lịch sử |

**Vì sao cấm gộp:** một trang vừa muốn Google index vừa mang dữ liệu cá nhân của khách là công thức rò rỉ kinh điển — chỉ cần một lần lỡ tay để `contact.full_name` vào trang indexable là tên + số điện thoại khách của tiệm nằm trên Google, không thu hồi được. Tách bằng **đường dẫn** thì mọi người sau nhìn URL là biết mình đang ở phía nào, không phải nhớ luật.

## 5. QUYẾT ĐỊNH 2 — Hợp đồng `/k/[token]` (CHỐT nay, DỰNG khi có người dùng đầu tiên)

Bảng `customer_links` — **noi nguyên khuôn `livechat_visitors` đã chạy thật**:

| Cột | Vì sao bắt buộc |
|---|---|
| `token_hash` (không bao giờ lưu token thô) | rò CSDL không đồng nghĩa rò được mọi cửa khách — đúng cách `livechat_visitors` đang làm |
| `purpose` (tập ĐÓNG, mở rộng bằng migration) | **một token = MỘT việc.** Cấm tuyệt đối "token vạn năng": link đánh giá không được xem lịch sử mua hàng |
| `contact_id` | token buộc vào đúng một khách |
| `ref_type` + `ref_id` | trỏ đúng bản ghi (lịch hẹn nào, đơn nào) — không cho token trôi sang bản ghi khác |
| `expires_at` | mọi cửa khách đều có hạn; link sống mãi là link bị chuyển tiếp lên nhóm chat |
| `used_at` / `revoked_at` | thu hồi được, và biết link đã dùng chưa |
| bộ đếm rate-limit trong bảng | y `livechat_visitors` — chặn dò link ngay tại CSDL, không phụ thuộc Redis còn sống |

**Ràng buộc kèm (thiếu một là hỏng thiết kế):**
- Mọi đọc/ghi qua `/k/` đi qua **RPC SECURITY DEFINER nhận token**, đối chiếu `token_hash`. **KHÔNG cấp `select` bảng nào cho `anon`.**
- RPC trả về **đúng phần việc của `purpose`** — không trả cả hồ sơ khách "cho tiện".
- Token sai / hết hạn / đã thu hồi → **cùng một câu trả lời** ("link không còn hiệu lực"), không phân biệt — không cho dò xem token nào từng tồn tại.
- Hai chế độ: tiệm tắt tính năng → trang lịch sự "tiệm tạm ngừng nhận khách mới", **không 404, không lỗi trần**.

## 6. QUYẾT ĐỊNH 3 — Hợp đồng `business_hours` (T3a) — DỰNG NGAY ở V1.5

Có người dùng thật ngay trong V1.5: mini-landing hiện "giờ mở cửa" + trạng thái **đang mở / đã đóng**, và tin tự động ngoài giờ (31.1).

Hai bảng, **dựng cả hai ngay** — vì V2 (lịch hẹn) tính slot trống = `business_hours` − `business_closures` − lịch đã đặt; thiếu bảng nghỉ thì V2 phải viết lại toàn bộ hàm tính slot:

1. **`business_hours`** — giờ lặp theo thứ: `(tenant_id, weekday 0–6, open_time, close_time, is_closed)`. Cho phép nhiều dòng/thứ (nghỉ trưa: 8–12 và 13–18).
2. **`business_closures`** — ngoại lệ: `(tenant_id, date_from, date_to, reason, is_full_day, open_time/close_time đè)`. Tết, nghỉ lễ, đóng đột xuất.

**Múi giờ — chốt nay để go-global (21c) không phải đập:** lưu **giờ địa phương** (`time`, không kèm múi giờ) + thêm cột `timezone` trên `tenants` mặc định `Asia/Ho_Chi_Minh`. Lưu thẳng `timestamptz` là khoá cứng tiệm vào VN vĩnh viễn; sửa sau đụng mọi lịch hẹn đã đặt.

## 7. Ràng buộc bắt buộc cho toàn đợt V1.5

- **Form thu lead dùng lại nguyên chốt chặn của Live Chat (#23/#25)** — rate-limit + `ip_hash`, không tự chế lớp chống spam mới.
- **KHÔNG builder kéo-thả.** Bộ trường ĐÓNG theo pack ngành (luật D2, mục 18).
- Lead vào có `source` riêng **"Form/Landing"** — đổ đúng vào báo cáo nguồn đang chạy, không dựng đường đếm mới (câu soát 3).
- Trùng SĐT khách cũ → **gộp vào khách cũ** + sinh việc "khách cũ quay lại", **không tạo bản ghi trùng**.
- Mini-landing **không hiện bất kỳ dữ liệu khách nào** — kể cả "đã có 200 khách tin dùng" (số đó là V6, có đường riêng).

## 8. Nghiệm thu (vào `scripts/rls-smoke.mjs`, luật D3 — phải thấy đỏ ít nhất một lần)

| Ca | Ngưỡng đạt |
|---|---|
| `anon` đọc thẳng bảng cấu hình form / giờ mở cửa | **0 dòng** |
| Gửi form với `tenant_id` của tiệm khác | **Bị chặn** |
| Gửi form quá tay (spam) | **Bị chặn bởi rate-limit ở CSDL**, không phải chỉ ở route |
| Tiệm tắt form → gọi API gửi | **Từ chối lịch sự**, không tạo lead |
| Trùng SĐT khách cũ | **Không sinh khách trùng**, gộp đúng |
| Trang `/t/[slug]` của tiệm đã xoá mềm | **Không lộ gì**, trang "không tồn tại" trung tính |

## 9. Hệ quả

- **Thêm:** `business_hours`, `business_closures`, `tenants.timezone`, bảng cấu hình form theo tiệm, cột giới thiệu/địa chỉ công khai cho tiệm; route `/t/[slug]`; RPC definer nhận lead.
- **CHƯA dựng (cố ý, có hợp đồng sẵn):** `customer_links` + toàn bộ `/k/[token]` — dựng ở **V2.5**, khi có người dùng đầu tiên thật.
- **Không sửa:** bất kỳ bảng/hàm nào của đường trong-app.
- **Bảng 34.7 được đính chính:** T1 chuyển từ "dựng ở V1.5" thành "**chốt hợp đồng ở V1.5, dựng ở V2.5**". Ghi tại đây thay vì lặng lẽ làm khác kế hoạch.
