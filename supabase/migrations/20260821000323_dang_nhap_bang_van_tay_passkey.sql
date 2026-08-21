-- ════════════════════════════════════════════════════════════════════
-- ĐĂNG NHẬP BẰNG VÂN TAY / KHUÔN MẶT (passkey — chuẩn WebAuthn)
-- ════════════════════════════════════════════════════════════════════
--
-- Máy ở quầy là máy DÙNG CHUNG. Hôm nay mỗi lần đổi ca là gõ lại mật khẩu
-- trước mặt khách và trước mặt đồng nghiệp — vừa chậm, vừa là cách mật khẩu bị
-- nhìn thấy. Passkey đổi việc đó thành một lần chạm vân tay.
--
-- ┌─ KHOÁ NẰM Ở ĐÂU ──────────────────────────────────────────────────
-- Bảng này CHỈ giữ khoá CÔNG KHAI. Vân tay và khuôn mặt KHÔNG BAO GIỜ rời
-- khỏi máy của người dùng — hệ điều hành giữ, và nó chỉ trả về một chữ ký.
-- Máy chủ không có gì để lộ kể cả khi cơ sở dữ liệu bị đọc hết.
--
-- ┌─ BỘ ĐẾM CHỐNG DÙNG LẠI ───────────────────────────────────────────
-- `counter` là bộ đếm của thiết bị, tăng sau mỗi lần ký. Chữ ký mang bộ đếm
-- NHỎ HƠN HOẶC BẰNG lần trước nghĩa là ai đó đang phát lại một chữ ký cũ —
-- phải từ chối. Không lưu bộ đếm thì mất hẳn lớp chống này.
--
-- ⚠️ KHÔNG khoá theo tiệm. Passkey gắn với TÀI KHOẢN NGƯỜI DÙNG, và người
--   dùng đăng nhập TRƯỚC khi biết mình thuộc tiệm nào — lúc xác thực chưa có
--   `current_tenant_id()` để mà lọc. Vì vậy bảng này nằm trong schema
--   `private` và CHỈ máy chủ đụng tới; không cấp quyền cho `authenticated`.

create schema if not exists private;

create table if not exists private.passkeys (
  /** Mã thiết bị do trình duyệt cấp, dạng base64url. Duy nhất toàn hệ thống. */
  credential_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  /** CHỈ khoá công khai — xem ghi chú ở đầu file. */
  public_key bytea not null,
  counter bigint not null default 0,
  /** Thiết bị này có thể tự đồng bộ sang máy khác của cùng người không. */
  dong_bo_duoc boolean not null default false,
  /** Tên người dùng đặt để nhận ra máy: "iPhone của Thảo". */
  ten text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists passkeys_user_idx on private.passkeys (user_id);

/**
 * Thử thách đang chờ trả lời.
 *
 * ⚠️ Chuỗi thử thách phải dùng ĐÚNG MỘT LẦN và có HẠN. Cho dùng lại nghĩa là
 *   một chữ ký chặn được trên đường truyền có thể phát lại mãi mãi. Xoá ngay
 *   sau khi dùng, và dọn cái quá hạn.
 */
create table if not exists private.passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null unique,
  /** Đăng ký thiết bị mới thì có; đăng nhập thì null (chưa biết là ai). */
  user_id uuid references auth.users(id) on delete cascade,
  loai text not null check (loai in ('dang_ky', 'dang_nhap')),
  created_at timestamptz not null default now(),
  het_han_luc timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists passkey_challenges_het_han_idx
  on private.passkey_challenges (het_han_luc);

-- Không cấp quyền cho ai ngoài chủ sở hữu schema: mọi lượt đọc/ghi đi qua máy
-- chủ bằng khoá dịch vụ. Đây là dữ liệu xác thực, không phải dữ liệu nghiệp vụ.
revoke all on all tables in schema private from anon, authenticated;

comment on table private.passkeys is
  'Khoá CÔNG KHAI của passkey. Vân tay/khuôn mặt không bao giờ rời khỏi máy người dùng — máy chủ không có gì để lộ kể cả khi CSDL bị đọc hết — #323.';
comment on column private.passkeys.counter is
  'Bộ đếm chống phát lại. Chữ ký mang bộ đếm nhỏ hơn hoặc bằng lần trước là chữ ký cũ bị phát lại — phải từ chối — #323.';
