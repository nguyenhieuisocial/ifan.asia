# Vận hành — cài đặt CHỈ nằm trên Dashboard, không có trong code

Nguyên tắc của repo này (xem README): `supabase/migrations/` là nguồn sự thật
duy nhất, không sửa tay trên Dashboard. Trang này ghi lại đúng những NGOẠI LỆ
đã biết — cài đặt bắt buộc mà Supabase KHÔNG cho làm qua migration SQL, chỉ
bật được bằng tay trên Dashboard. Dựng lại dự án ở project Supabase mới
(khôi phục sự cố, tách môi trường staging...) mà quên các mục dưới đây thì hệ
thống vẫn chạy nhưng SAI hành vi — không báo lỗi rõ ràng ngay.

## 1. Custom Access Token Hook — BẮT BUỘC bật (ADR-0005)

**Vì sao quan trọng:** toàn bộ phân quyền/cách ly dữ liệu giữa các tiệm
(RLS) dựa vào claim `app_metadata.tenant_id`/`role` trong JWT, do hook này
nhét vào mỗi lần cấp token. Tắt hook không làm hệ thống sập — có nhánh dự
phòng (`current_tenant_id()`/`app_role()`, migration #3) tự tra bảng
`tenant_members` khi thiếu claim — nhưng nhánh dự phòng dùng luật khác
("tiệm cũ nhất") chứ không phải "tiệm đang chọn" (migration #66). Người dùng
có nhiều tiệm sẽ thấy hành vi sai lệch mà không có lỗi nào hiện ra.

**Cách bật:**
1. Supabase Dashboard → project → **Authentication** → **Hooks**
2. Mục **Customize Access Token (Auth Hook)** → chọn hàm
   `public.custom_access_token_hook` → Enable

**Cách xác nhận đã bật đúng (đừng tin bằng mắt, đo bằng token thật):**
```bash
node scripts/test-rls-isolation.mjs
```
Script tự đăng nhập user thật, giải mã JWT, khẳng định `app_metadata.tenant_id`
CÓ mặt. Ca kiểm "Custom Access Token Hook ĐANG BẬT" chạy trong CI mỗi lần
push (`.github/workflows/ci.yml`, bước "RLS isolation test qua client SDK") —
nhưng CHỈ phát hiện được TRÊN project mà biến môi trường CI đang trỏ tới.
Đổi sang project Supabase mới thì phải tự chạy lại bằng tay TRƯỚC khi tin CI
xanh có nghĩa là đã cấu hình đúng.

## 2. Vault (Zalo channel secrets)

Token/secret kênh Zalo lưu qua Supabase Vault (`vault.create_secret`), không
nằm trong bảng thường — RPC `get_zalo_channel_secrets`/`connect_zalo_channel`
(migration liên quan tới #31) đọc/ghi qua Vault. Vault đi kèm sẵn với mọi
project Supabase, không cần bật riêng — ghi ở đây để nhớ: KHÔNG thử tạo bảng
`channel_secrets` thường thay thế nếu dựng project mới, phải dùng đúng Vault.

## 3. pg_net extension — PHẢI khoá

Migration #36 đã tắt/hạn chế `pg_net` (cửa SSRF nếu để mở). Dựng project mới
từ đầu: kiểm `select * from pg_extension where extname='pg_net'` — nếu bật,
theo đúng các bước migration #36 để khoá lại, không bật mặc định.
