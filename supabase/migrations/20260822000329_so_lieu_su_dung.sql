-- ════════════════════════════════════════════════════════════════════
-- SỐ LIỆU SỬ DỤNG — tiệm nào dùng gì, và có quay lại không
-- ════════════════════════════════════════════════════════════════════
--
-- ┌─ CHỖ HỞ ──────────────────────────────────────────────────────────
-- Đo 21/08: kho KHÔNG có bất kỳ số liệu sử dụng nào — không lượt xem màn,
-- không biết tiệm nào còn quay lại, không biết tính năng nào có người dùng.
-- Founder đang quyết đầu tư dựa trên cảm giác, và cảm giác về "tính năng nào
-- quan trọng" gần như luôn lệch với thực tế dùng.
--
-- ┌─ GỘP SẴN THEO NGÀY, KHÔNG LƯU TỪNG LƯỢT ──────────────────────────
-- ⚠️ Lưu từng lượt xem màn là cách nhanh nhất làm phình kho: mỗi thợ mở vài
--   trăm màn một ngày. Gộp theo (ngày · tiệm · màn) thì mỗi tiệm chỉ tốn vài
--   chục dòng mỗi ngày, mà vẫn trả lời được đúng những câu đáng hỏi.
--   Cái mất: không dựng lại được ĐƯỜNG ĐI của một người (màn A rồi màn B).
--   Ghi rõ ra đây để không ai đọc bảng này rồi tưởng có thể phân tích hành trình.
--
-- ┌─ KHÔNG LƯU TỪ KHOÁ NGƯỜI DÙNG GÕ VÀO Ô TÌM ───────────────────────
-- ⚠️ Ở iFan, thứ người ta gõ vào ô tìm là TÊN KHÁCH và SỐ ĐIỆN THOẠI KHÁCH.
--   Lưu lại là dựng một bản sao dữ liệu cá nhân của khách hàng ở một chỗ mới,
--   với một bộ luật bảo vệ khác. Chỉ đếm SỐ LƯỢT tìm và số lượt tìm KHÔNG RA
--   GÌ — phần hành động được nằm ở con số thứ hai, không nằm ở từ khoá.

/**
 * Đếm lượt mở từng màn, gộp theo ngày.
 *
 * `ngay` là NGÀY THEO GIỜ TIỆM, không phải giờ quốc tế — nếu không thì mọi việc
 * làm buổi tối ở Việt Nam rơi sang ngày hôm sau và mọi báo cáo theo ngày đều
 * lệch một buổi.
 */
create table if not exists public.usage_daily (
  ngay date not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  /** Khoá màn, ví dụ 'calendar', 'orders'. Không lưu đường dẫn đầy đủ: đường
      dẫn chứa mã đơn, mã khách — tức là dữ liệu, không phải tên màn. */
  man text not null,
  so_luot integer not null default 0,
  primary key (ngay, tenant_id, man)
);

/**
 * Ai có mặt ngày nào — đủ để tính "tiệm còn quay lại không".
 *
 * ⚠️ Một dòng cho MỘT NGƯỜI MỘT NGÀY, không phải mỗi lượt. Đây là chỗ duy nhất
 *   trả lời được câu giữ chân, và nó phải nhỏ để còn giữ được lâu.
 */
create table if not exists public.usage_active (
  ngay date not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  primary key (ngay, tenant_id, user_id)
);

create index if not exists usage_daily_ngay_idx on public.usage_daily (ngay desc);
create index if not exists usage_active_ngay_idx on public.usage_active (ngay desc);

-- ⚠️ BẬT RLS, KHÔNG POLICY — mẫu "chỉ máy chủ đụng" của kho này. Số liệu của
--   MỌI tiệm nằm chung một bảng; mở cho `authenticated` là để tiệm này đếm được
--   hoạt động của tiệm kia.
alter table public.usage_daily enable row level security;
alter table public.usage_active enable row level security;

/**
 * Ghi một lượt mở màn.
 *
 * ⚠️ `security definer` và CHỈ cấp cho `service_role`. Máy chủ đã biết người
 *   gọi là ai từ phiên đăng nhập, nên KHÔNG nhận `user_id`/`tenant_id` từ
 *   trình duyệt — nhận nghĩa là cho phép ai cũng ghi số liệu giả cho tiệm khác.
 */
create or replace function public.ghi_luot_dung(
  p_tenant_id uuid,
  p_user_id uuid,
  p_man text,
  p_mui_gio text
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_ngay date := (now() at time zone coalesce(nullif(p_mui_gio, ''), 'Asia/Ho_Chi_Minh'))::date;
  v_man text := left(regexp_replace(coalesce(p_man, ''), '[^a-z0-9_-]', '', 'g'), 40);
begin
  if v_man = '' then return; end if;

  insert into public.usage_daily (ngay, tenant_id, man, so_luot)
    values (v_ngay, p_tenant_id, v_man, 1)
  on conflict (ngay, tenant_id, man) do update
    set so_luot = public.usage_daily.so_luot + 1;

  insert into public.usage_active (ngay, tenant_id, user_id)
    values (v_ngay, p_tenant_id, p_user_id)
  on conflict do nothing;
end $$;

revoke all on function public.ghi_luot_dung(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.ghi_luot_dung(uuid, uuid, text, text) to service_role;
grant select, insert, update on public.usage_daily to service_role;
grant select, insert on public.usage_active to service_role;

comment on table public.usage_daily is
  'Lượt mở từng màn, GỘP theo ngày (giờ tiệm). Không lưu từng lượt — mỗi thợ mở vài trăm màn một ngày. Cái mất: không dựng lại được đường đi của một người. Không lưu từ khoá ô tìm: ở iFan đó là tên và số điện thoại KHÁCH — #329.';
