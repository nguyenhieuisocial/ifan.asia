-- ════════════════════════════════════════════════════════════════════
-- PASSKEY — CHUYỂN VỀ ĐÚNG MẪU "BẢNG CHỈ MÁY CHỦ ĐỤNG" CỦA DỰ ÁN
-- ════════════════════════════════════════════════════════════════════
--
-- ┌─ LỖI ĐƯỢC CHỮA Ở ĐÂY, VÀ VÌ SAO KHÔNG CÓ CÁI GÌ BÁO ĐỘNG ─────────
-- Bản #323 đặt hai bảng passkey vào schema `private`. Biên dịch xanh, dựng bản
-- xanh, đọc code thấy hợp lý. Nhưng đo thật ở CSDL thì:
--
--     service_role  USAGE trên schema private  =  KHÔNG
--     service_role  SELECT/INSERT/DELETE       =  KHÔNG
--
-- ⇒ mọi lượt đọc/ghi passkey sẽ hỏng NGAY LẦN ĐẦU chạy thật. Không cổng nào
--   bắt được vì đây không phải lỗi kiểu dữ liệu — nó là lỗi QUYỀN, chỉ hiện ra
--   khi có người thật bấm nút. Bài học: bảng mới ở schema mới thì phải ĐO
--   quyền, không suy ra từ việc migration chạy trót lọt.
--
-- ┌─ VÌ SAO KHÔNG CHỌN CÁCH "MỞ SCHEMA private RA API" ───────────────
-- Vì schema `private` đang chứa `app_config` — bảng cấu hình bí mật KHÔNG BẬT
-- RLS, vì cả đời nó chưa từng nằm trên đường API nên không cần. Mở `private`
-- cho PostgREST là bất kỳ ai cầm khoá công khai (anon) cũng đọc được nó bằng
-- một dòng header. Một tính năng đăng nhập không được phép mở toang kho bí mật.
--
-- ┌─ CÁCH ĐÚNG: ĐÚNG MẪU 19 BẢNG SẴN CÓ ──────────────────────────────
-- Trong `public`, BẬT RLS và KHÔNG viết policy nào:
--   · anon / authenticated  → RLS chặn sạch: đọc ra 0 dòng, ghi bị từ chối.
--   · service_role          → có thuộc tính bỏ qua RLS, nên máy chủ vẫn làm việc.
-- Đây là mẫu `platform_admins`, `link_codes`, `app_rate_limits`... đang dùng —
-- kể cả bảng phân quyền cấp nền tảng. Không phát minh mẫu mới cho một tính năng.
--
-- ⚠️ TUYỆT ĐỐI KHÔNG thêm policy cho hai bảng này. Bảng không có policy nghĩa
--   là "chỉ máy chủ"; thêm một policy `for select using (true)` là biến bảng
--   thành công khai mà không có gì báo.

alter table private.passkeys set schema public;
alter table private.passkey_challenges set schema public;

alter table public.passkeys enable row level security;
alter table public.passkey_challenges enable row level security;

comment on table public.passkeys is
  'Khoá CÔNG KHAI của passkey (vân tay / Face ID). Sinh trắc học không bao giờ rời khỏi máy người dùng — máy chủ không có gì để lộ kể cả khi CSDL bị đọc hết. BẬT RLS + KHÔNG policy = chỉ máy chủ đụng. Không thêm policy — #324.';
comment on table public.passkey_challenges is
  'Chuỗi thử thách đang chờ trả lời, dùng ĐÚNG MỘT LẦN và có hạn. BẬT RLS + KHÔNG policy = chỉ máy chủ đụng. Không thêm policy — #324.';
