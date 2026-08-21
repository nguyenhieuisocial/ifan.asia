-- ════════════════════════════════════════════════════════════════════
-- ĐẨY THÔNG BÁO LÊN ĐIỆN THOẠI (Web Push)
-- ════════════════════════════════════════════════════════════════════
--
-- Hôm nay bảng `notifications` đã có 1.786 dòng và màn hình có chuông. Nhưng
-- chuông đó CHỈ KÊU KHI NGƯỜI TA ĐANG MỞ ỨNG DỤNG. Lễ tân đóng tab đi làm
-- việc khác thì mọi lời nhắc nằm im cho tới lần mở sau — tức là mảng thông
-- báo hiện có chỉ phục vụ người vốn đã đang nhìn màn hình.
--
-- ┌─ AI GIỮ ĐĂNG KÝ ──────────────────────────────────────────────────
-- Mỗi THIẾT BỊ một dòng, không phải mỗi người một dòng: một người có điện
-- thoại và máy ở quầy, và tắt ở máy này không được làm tắt ở máy kia.
--
-- ⚠️ `endpoint` là KHOÁ CHÍNH. Trình duyệt cấp lại đúng endpoint đó cho cùng
--   một máy + cùng một trang, nên ghi đè theo endpoint là cách duy nhất
--   không sinh ra hàng chục dòng rác cho một máy.
--
-- ┌─ ĐÁNH DẤU ĐÃ ĐẨY ─────────────────────────────────────────────────
-- `notifications.pushed_at`: nhịp đẩy quét những dòng CHƯA đẩy. Không có cột
-- này thì hoặc đẩy lại từ đầu mỗi lượt (người dùng nhận cả trăm thông báo
-- trùng), hoặc phải nhớ mốc thời gian ở đâu đó bên ngoài — và cái mốc đó sẽ
-- lệch ngay lần đầu nhịp chạy trượt.
--
-- ⚠️ pg_net BỊ KHOÁ TỪ #36 nên cơ sở dữ liệu KHÔNG tự gọi HTTP được. Việc đẩy
--   phải do một nhịp từ bên ngoài kéo — cùng khuôn với nhắc lịch hẹn
--   (`/api/cron/nhac-lich`). Đừng thử mở lại pg_net chỉ cho việc này.

create table if not exists public.push_subscriptions (
  -- Trình duyệt cấp lại đúng địa chỉ này cho cùng một máy — nên nó là khoá.
  endpoint text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Hai khoá mã hoá do trình duyệt cấp; thiếu một trong hai thì không gửi được.
  p256dh text not null,
  auth text not null,
  /** Chuỗi mô tả trình duyệt — để người dùng nhận ra "cái này là điện thoại của tôi". */
  ua text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  /**
   * Số lần gửi hỏng LIÊN TIẾP. Trình duyệt trả 404/410 nghĩa là người ta đã gỡ
   * ứng dụng hoặc xoá dữ liệu — dòng đó phải bị xoá, không giữ lại để gửi mãi.
   */
  fail_count int not null default 0
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (tenant_id, user_id);

alter table public.push_subscriptions enable row level security;

-- CHỈ THẤY VÀ SỬA ĐĂNG KÝ CỦA CHÍNH MÌNH. Danh sách thiết bị của một người
-- nói lên họ dùng máy gì và đăng nhập ở đâu — chủ tiệm cũng không có việc gì
-- phải đọc nó.
create policy push_subscriptions_own on public.push_subscriptions
  for all using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );

-- ────────────────────────────────────────────────────────────────────

alter table public.notifications
  add column if not exists pushed_at timestamptz;

-- Nhịp đẩy quét đúng những dòng chưa đẩy và còn mới. Chỉ mục một phần nên nó
-- không phình theo 1.786 dòng đã có.
create index if not exists notifications_chua_day_idx
  on public.notifications (created_at)
  where pushed_at is null;

comment on table public.push_subscriptions is
  'Đăng ký nhận thông báo đẩy — MỖI THIẾT BỊ một dòng (một người có điện thoại và máy ở quầy). Khoá chính là endpoint vì trình duyệt cấp lại đúng địa chỉ đó cho cùng một máy — #315.';
comment on column public.notifications.pushed_at is
  'Đã đẩy lên thiết bị lúc nào. Nhịp đẩy quét dòng chưa đẩy — không có cột này thì hoặc đẩy trùng cả trăm lần, hoặc phải nhớ mốc thời gian bên ngoài và mốc đó sẽ lệch ngay lần nhịp chạy trượt — #315.';
