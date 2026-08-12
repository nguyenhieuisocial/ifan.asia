# ADR-0006 — Phiên hỗ trợ khách "chỉ đọc": KHÔNG dựng impersonate, dùng vai `viewer` có hạn giờ (11/08/2026)

**Trạng thái:** đã quyết, CHƯA thi công (thuộc V1b việc #5, mục 36 Quy hoạch — xếp CUỐI trong thứ tự thi công).
**Người quyết:** Opus 5, phiên 11/08, theo phân vai đã chốt (Opus = kiến trúc/bảo mật, Sonnet = code).
**Ràng buộc gốc:** ma trận quyền 34.6 — "Impersonate hỗ trợ khách: **✓ CHỈ ĐỌC + ghi nhật ký 24q mỗi lần**"; bất biến 1 — che/chặn ở tầng API/RLS, không phải ở giao diện.

---

## 1. Bài toán

Spec 12 / mục 31.60: founder cần **xem đúng màn khách đang kẹt** để hỗ trợ ("hỗ trợ cầm tay là chi phí bắt buộc" — thiếu là churn tuần đầu). Nhưng quản trị nền tảng **không được ghi** vào dữ liệu tiệm khách, và mọi lần vào phải có vết.

## 2. Đo thật trước khi thiết kế (không suy đoán)

SQL trên DB Singapore ngày 11/08:

| Đo | Kết quả |
|---|---|
| Bảng có RLS gắn `current_tenant_id()` | **57 bảng** |
| Chính sách ĐỌC gắn `current_tenant_id()` | **53** |
| Chính sách GHI gắn `current_tenant_id()` | **48** |
| `custom_access_token_hook()` chọn membership | `where tm.status='active'` · ưu tiên `profiles.active_tenant_id` · **KHÔNG kiểm hạn** |
| `tenant_seats_used()` đếm ghế | `count(*) from tenant_members where status='active'` |
| `enforce_seat_limit()` | trigger chặn INSERT khi `used >= limit` |
| `getCurrentMembership()` (lib/auth/membership.ts) | tra DB **live**, lọc `status='active'` — bản vá mục 69 |

## 3. Phương án bị LOẠI

### (A) Sửa `current_tenant_id()` cho nó trả về tiệm-đang-hỗ-trợ — **CẤM TUYỆT ĐỐI**

48 chính sách GHI gọi đúng hàm đó. Sửa một hàm = mở luôn quyền ghi trên tiệm khách, trong khi yêu cầu là CHỈ ĐỌC. Đây là cách sập cả nhà, không có biến thể nào an toàn.

### (B) Thêm 53 chính sách RLS đọc riêng cho quản trị nền tảng — LOẠI

An toàn hơn (A) nhưng: 53 bề mặt mới để sai; và **vẫn vỡ ở chỗ khác** — app đang dựa vào RLS chứ không tự lọc tenant (`supabase.from("tenants").select(...).maybeSingle()`), đọc được 2 tiệm là lỗi ngay tại khung layout.

### (C) Đọc bằng `service_role` qua route riêng, tự lọc tenant trong câu truy vấn — LOẠI

`service_role` **bỏ qua toàn bộ RLS**. Một chỗ quên `where tenant_id = ...` là rò dữ liệu chéo tiệm, và không còn lưới an toàn nào phía dưới. Đổi một rủi ro nhìn thấy được lấy một rủi ro vô hình.

## 4. QUYẾT ĐỊNH

**Phiên hỗ trợ = cấp cho chính tài khoản quản trị nền tảng một hàng `tenant_members` vai `viewer`, có hạn giờ, có cờ `is_support` — rồi dùng đúng cơ chế chuyển tiệm ADR-0005 đã có.**

Vì sao đây là đường đúng chứ không phải đường lười:

1. **Vai `viewer` đã được chứng minh chỉ-đọc bằng phép đo, không bằng niềm tin.** V1a đã vá cả hai chiều đọc/ghi của vai này và có ca thử thường trực trong `scripts/rls-smoke.mjs` (tiêu chí 35.3: "0 hành vi ghi lọt").
2. **Không thêm một chính sách RLS nào.** Bề mặt rủi ro mới = 1 bảng + vài cột + 1 job hết hạn, thay vì 53 chính sách.
3. Chuyển tiệm / banner / thoát: ADR-0005 làm sẵn.
4. Đặc quyền tối thiểu miễn phí: theo 34.6, `viewer` **không thấy tiền tổng và cấu hình**. Hỗ trợ xem được nghiệp vụ hằng ngày là đủ; cần xem phần tiền thì xin quyền riêng từng lần, **không nới vai**.

## 5. HAI LỖ TỰ TÌM RA KHI ĐO — và cách bịt

Thiết kế trên nghe xong là xuôi, nhưng đo tiếp thì thủng ở hai chỗ. Ghi lại vì đây là phần dễ bỏ sót nhất.

### Lỗ 1 — Phiên hỗ trợ sẽ ĂN MẤT một ghế của khách, và bị chặn đúng lúc cần nhất

`tenant_seats_used()` đếm mọi `tenant_members` có `status='active'`. Hàng hỗ trợ cũng `active` ⇒ (a) khách mất 1 ghế đang trả tiền, (b) trigger `enforce_seat_limit` **ném lỗi `seat_limit_reached`** nếu tiệm đang đầy ghế — mà tiệm đông người chính là tiệm hay cần hỗ trợ nhất.

**Bịt:** thêm cột `is_support boolean not null default false`, và sửa **đúng 3 chỗ tầng TIỀN (không phải tầng bảo mật)**:
- `tenant_seats_used()` — thêm `and is_support = false`
- `tenant_seats()` — thêm `and is_support = false`
- `enforce_seat_limit()` — `if new.is_support then return new; end if;` ngay đầu hàm

### Lỗ 2 — Hết hạn xong quyền vẫn sống, vì JWT đã in sẵn claim

`custom_access_token_hook()` **không kiểm hạn**, và claim `tenant_id`/`role` được in vào JWT lúc cấp, sống ~1 giờ. Xoá hàng thành viên KHÔNG thu hồi được token đã phát. Đây đúng là lỗ của mục 69 (người bị gỡ khỏi tiệm), tái xuất hiện ở ngữ cảnh nguy hiểm hơn.

**Bịt (4 lớp, cần cả 4):**
1. Thêm `expires_at timestamptz` và **siết** hook: `and (tm.expires_at is null or tm.expires_at > now())`.
   *Đây KHÔNG mâu thuẫn với lệnh cấm ở mục 3(A):* cấm là cấm làm hàm **rộng hơn** / đổi tiệm nó chọn. Thêm điều kiện hết hạn là làm **chặt hơn**, và với dữ liệu hiện có (`expires_at` NULL ở mọi hàng cũ) thì **không đổi hành vi của bất kỳ ai** — phải chứng minh bằng ca thử, không nói suông.
2. `getCurrentMembership()` lọc thêm hạn — chặn ở tầng web ngay cả khi token còn.
3. **Kết thúc phiên phải gọi `refreshSession()`** ⇒ hook chạy lại ⇒ JWT mới trỏ về tiệm của chính quản trị viên. Đây là đường thoát sạch của luồng bình thường.
4. Job hết hạn: phiên quá giờ mà **chưa đóng sạch** ⇒ **buộc đăng xuất toàn bộ phiên của tài khoản quản trị đó** (Admin API). Bất tiện cho founder, nhưng đúng: quyền không được sống lâu hơn lý do của nó.

**Rủi ro còn lại, nói thẳng:** giữa lúc hàng hết hạn và lúc token cũ chết, tồn tại một cửa sổ **≤ thời gian sống JWT** mà token cũ vẫn qua được RLS (tầng web đã chặn nhờ lớp 2, nhưng truy vấn thẳng DB bằng token đó thì không). Lớp 3 đóng cửa sổ này ở luồng thường; lớp 4 đóng ở luồng bỏ ngang. Không tuyên bố là "đã tuyệt đối" — **đặt hạn phiên ≤ 60 phút** để cửa sổ xấu nhất có trần.

## 6. Ràng buộc bắt buộc (thiếu một cái là hỏng cả thiết kế)

- **Không có cửa mở im lặng:** chỉ mở phiên khi tiệm đó đang có yêu cầu "Cần giúp?" chưa đóng, HOẶC founder tự mở **kèm lý do nhập tay**. Cả hai ghi `record_audit` (24q). Đóng phiên cũng ghi.
- **Khách phải nhìn thấy:** dải báo trong app "iFan đang xem hỗ trợ tiệm bạn (chỉ đọc)" suốt phiên. Hỗ trợ lén = mất niềm tin + sai tinh thần PDPL.
- **Hạn cứng ≤ 60 phút.**
- **Vĩnh viễn không làm impersonate có quyền ghi.** Cần sửa hộ khách thì hướng dẫn khách bấm, hoặc làm bằng đường có phê duyệt riêng — không mở rộng ADR này.

## 7. Nghiệm thu (ca bắt buộc, vào `scripts/rls-smoke.mjs`)

| Ca | Ngưỡng đạt |
|---|---|
| Quản trị nền tảng trong phiên hỗ trợ thử GHI vào 6 bảng lõi | **Fail hết 6/6** |
| Lùi `expires_at` về quá khứ rồi đọc | Mất quyền đọc |
| Mở phiên khi tiệm ĐẦY ghế | Mở được (không dính `seat_limit_reached`) |
| Đếm ghế trước/sau khi mở phiên | **Không đổi** |
| Hàng `tenant_members` cũ (`expires_at` NULL) sau khi siết hook | Truy cập **không đổi** — chứng minh lớp bịt 1 vô hại |
| Mọi dòng `support_sessions` | Có `reason` + có dòng `record_audit` tương ứng |

## 8. Hệ quả

- Thêm: bảng `support_sessions`, `help_requests`; cột `is_support` + `expires_at` trên `tenant_members`.
- Sửa: 3 hàm ghế (tầng tiền), hook (siết hạn), `getCurrentMembership` (siết hạn).
- **Không sửa:** `current_tenant_id()`, `app_role()`, và không thêm chính sách RLS nào.
- Mục 36.4 Quy hoạch giữ bảng đo; ADR này là chỗ giải thích **vì sao** làm vậy.

## Điều kiện xem lại

- **Khi hỗ trợ cần SỬA hộ khách, không chỉ xem** ⇒ toàn bộ mục 4 mất căn cứ. Thiết kế này đứng được **chính vì** vai `viewer` đã được đo là chỉ-đọc. Cần ghi thì **KHÔNG nới vai `viewer`** — đó sẽ phá luôn mọi chỗ khác đang dùng vai này; phải viết ADR mới cho một vai riêng.
- **Khi có từ 2 người làm hỗ trợ trở lên** ⇒ cần phân biệt ai đã vào tiệm nào; cờ `is_support` hiện không trả lời được câu đó.
- **Khi `viewer` được nới quyền vì một lý do khác** (ví dụ cho khách mời xem báo cáo tiền) ⇒ đọc lại mục 4 điểm 4 — đặc quyền tối thiểu ở đây là **miễn phí nhờ 34.6**, nới một chỗ là mất cả hai.
