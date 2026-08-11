-- ============================================================
-- iFan.asia — Migration #68: đăng nhập bằng SĐT KHÔNG cần gõ "mã tiệm".
--
-- BỆNH (founder gọi đúng tên: BUG luồng, không phải thiếu tính năng): màn
-- đăng nhập bắt nhân viên tự chọn nhánh (tab Email / tab Nhân viên) rồi gõ
-- thêm "Mã tiệm" — thứ HỆ THỐNG TỰ BIẾT ĐƯỢC. Mật khẩu mới là thứ chứng
-- minh danh tính; mã tiệm chỉ là khoá tra cứu nội bộ bị đẩy ra cho người
-- dùng gánh.
--
-- CÁCH CHỮA: hàm này tra ngược "SĐT → những tiệm có nhân viên dùng SĐT đó".
-- Tầng ứng dụng dựng email tổng hợp từ (SĐT, mã tiệm) như cũ — KHÔNG dựng
-- lại chuỗi đó trong SQL, giữ đúng "một nguồn sự thật" ở
-- lib/auth/staff-accounts.ts (xem migration #62).
--
-- VÌ SAO KHOÁ CHỈ CHO service_role: nếu để anon/authenticated gọi được thì
-- đây thành công cụ dò "số điện thoại này làm ở tiệm nào" — gõ số bất kỳ là
-- biết chỗ làm của người ta. Hàm chỉ được gọi từ Server Action đăng nhập
-- (chạy bằng service key, không bao giờ lộ ra trình duyệt), và kết quả cũng
-- KHÔNG được hiện cho người dùng cho tới khi họ nhập đúng mật khẩu.
-- ============================================================

create or replace function public.staff_login_shops(p_phone text)
returns table (tenant_slug text, tenant_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.slug, t.name
  from public.profiles p
  join public.tenant_members tm
    on tm.user_id = p.user_id
   and tm.status = 'active'          -- bị gỡ khỏi tiệm là hết đường vào, không chờ hết hạn phiên
  join public.tenants t
    on t.id = tm.tenant_id
   and t.is_sample = false           -- tiệm mẫu là chỗ tham quan, không ai làm nhân viên ở đó
  where p.phone is not null
    and regexp_replace(p.phone, '[^0-9]', '', 'g')
      = regexp_replace(p_phone, '[^0-9]', '', 'g')  -- chấp khoảng trắng/gạch người dùng gõ thêm
  order by t.name
  limit 10;                          -- trần cứng chống lạm dụng: mỗi ứng viên tốn 1 lần thử mật khẩu
$$;

comment on function public.staff_login_shops(text) is
  'Đăng nhập bằng SĐT (migration #68): trả các tiệm có nhân viên dùng SĐT này, để tầng ứng dụng dựng email tổng hợp mà thử mật khẩu. CHỈ service_role gọi được — mở cho anon là thành công cụ dò chỗ làm của người khác.';

revoke execute on function public.staff_login_shops(text) from public, anon, authenticated;
grant execute on function public.staff_login_shops(text) to service_role;
