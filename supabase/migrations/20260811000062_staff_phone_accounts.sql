-- ============================================================
-- iFan.asia — Migration #62: Tài khoản nhân viên không cần email (31.29,
-- Quy hoạch mục 35.1 việc 9). Thợ nail/phục vụ quán phần lớn không dùng
-- email — chủ tạo thẳng account trong Đội ngũ: tên + SĐT → mật khẩu tạm,
-- buộc đổi mật khẩu lần vào đầu.
--
-- CƠ CHẾ: chưa có nhà cung cấp SMS (không dùng Supabase phone-OTP). Email
-- đăng nhập THẬT trong auth.users là email TỔNG HỢP suy từ SĐT + mã tiệm
-- (p<sđt>.<slug>@staff.ifan.local — miền không định tuyến được, không ai
-- gửi thư tới đó) — dùng lại nguyên signInWithPassword sẵn có, không đổi
-- gì ở tầng Supabase Auth. Chuỗi này dựng bởi MỘT hàm duy nhất phía ứng
-- dụng (lib/auth/staff-accounts.ts) — tạo và đăng nhập phải ra cùng một
-- kết quả từ cùng input.
-- ============================================================

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- Trigger tạo profile khi có user mới: đọc thêm display_name/phone/
-- must_change_password từ user_metadata khi có (tài khoản do chủ tạo qua
-- admin.createUser) — signUp thường không có các khóa này nên rơi về đúng
-- hành vi cũ (tên suy từ email, must_change_password mặc định false).
-- Chép nguyên từ bản gốc (migration #9) rồi bổ sung — không viết lại từ đầu.
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (user_id, display_name, phone, must_change_password)
  values (
    new.id,
    coalesce(
      nullif(left(new.raw_user_meta_data ->> 'display_name', 80), ''),
      nullif(left(split_part(new.email, '@', 1), 80), ''),
      'user'
    ),
    new.raw_user_meta_data ->> 'phone',
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

-- ---------- RPC: chủ/quản trị viên thêm thành viên vừa tạo (không qua lời mời) ----------
-- Auth user đã được tạo THẬT bằng admin.createUser() ở tầng ứng dụng (Admin
-- API, không có SQL tương đương) TRƯỚC KHI gọi hàm này. Hàm chỉ lo phần
-- tenant_members — đi qua đúng trigger chặn ghế `tenant_members_seat_limit`
-- (migration #28) như accept_invitation, không mở đường tắt nào.
create or replace function public.staff_account_add_member(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if (select public.app_role()) not in ('owner','admin') then raise exception 'forbidden'; end if;
  if p_role not in ('admin','manager','staff','viewer') then raise exception 'invalid_role'; end if;

  insert into public.tenant_members (tenant_id, user_id, role, status, invited_by, joined_at)
    values (v_tenant, p_user_id, p_role::public.tenant_role, 'active', auth.uid(), now());
end;
$$;
grant execute on function public.staff_account_add_member(uuid, text) to authenticated;
revoke execute on function public.staff_account_add_member(uuid, text) from anon, public;
