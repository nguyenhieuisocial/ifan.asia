-- =============================================================================
-- 20260805000038_access_hardening — siết 2 lỗ hổng phân quyền tìm thấy khi
-- kiểm định trước cổng "nhận khách trả tiền đầu tiên".
--
-- KHÔNG nới lỏng bất kỳ policy nào đang có. Chỉ THÊM chốt chặn.
--
-- LỖ 1 — QUẢN TRỊ (admin) TỰ NÂNG MÌNH LÊN CHỦ TIỆM (owner).
--   Bằng chứng chạy trên DB thật (admin đăng nhập thật, gọi qua PostgREST):
--     ĐƯỜNG 1  update tenant_members set role='owner' where user_id=<chính mình>
--              → THÀNH CÔNG, vai đổi thành owner
--     ĐƯỜNG 2  insert invitations(role='owner', email=<email chính mình>)
--              rồi accept_invitation(token) → THÀNH CÔNG, vai đổi thành owner
--     HẬU QUẢ  owner giả gọi cancel_subscription() → THÀNH CÔNG (đụng được tiền)
--   Vì sao là lỗ: thiết kế đã chốt "Admin quản lý người dùng nhưng KHÔNG đụng
--   tiền" (change_plan/cancel_subscription chặn ở app_role() <> 'owner'), và
--   danh sách vai mời được trong app cố ý bỏ 'owner'. Nhưng tầng DB không ép,
--   nên mọi thứ chặn ở trên đều đi vòng được bằng một lệnh PostgREST.
--   (Đối chứng: nhân viên/staff KHÔNG làm được cả hai đường — policy
--    members_manage/invitations_manage đã chặn đúng.)
--
-- CÒN LẠI (KHÔNG sửa được từ đây, đã ghi vào báo cáo):
--   anon/authenticated có USAGE trên schema `net` (pg_net) và EXECUTE mặc định
--   trên net.http_get/http_post/http_delete. Mã nguồn KHÔNG dùng pg_net (chỉ
--   `create extension` ở migration #1). Chưa khai thác được qua sản phẩm vì
--   PostgREST chỉ mở schema `public`, nhưng là cần gạt SSRF nằm sẵn.
--   Quyền do `supabase_admin` cấp; vai `postgres` REVOKE không có tác dụng
--   (đã thử: lệnh chạy im lặng, quyền vẫn còn) và không `set role supabase_admin`
--   được. Muốn gỡ phải nhờ Supabase hoặc gỡ hẳn extension khi chắc chắn không dùng.
-- =============================================================================

-- ---------- LỖ 1a: chỉ CHỦ TIỆM mới trao/thu hồi được vai chủ tiệm ----------

create or replace function public.guard_owner_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_touches_owner boolean;
begin
  -- Chỉ soi đúng hai việc: ĐẶT ai đó thành chủ, hoặc HẠ một người đang là chủ.
  v_touches_owner :=
    (new.role = 'owner' and (tg_op = 'INSERT' or old.role is distinct from 'owner'))
    or (tg_op = 'UPDATE' and old.role = 'owner' and new.role is distinct from 'owner');
  if not v_touches_owner then
    return new;
  end if;

  -- Không có ngữ cảnh người dùng = backend/migration/worker (service_role,
  -- postgres, pg_cron). Những đường này vốn đã bỏ qua RLS, chặn ở đây vô nghĩa.
  if auth.uid() is null then
    return new;
  end if;

  -- KHAI SINH TIỆM: tiệm chưa có chủ nào khác → đây là bước tạo tiệm
  -- (create_tenant chèn hàng owner đầu tiên cho chính người vừa đăng ký).
  -- An toàn vì trigger tenant_members_owner_guard (#2) bảo đảm tiệm đã có chủ
  -- thì không bao giờ rơi về 0 chủ.
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = new.tenant_id
      and m.role = 'owner' and m.status = 'active'
      and m.user_id <> new.user_id
  ) then
    return new;
  end if;

  -- Tiệm đã có chủ → CHỈ chủ hiện tại được đụng vào vai chủ.
  -- Đối chiếu thẳng bảng thành viên, KHÔNG tin claim trong JWT (claim phụ thuộc
  -- Custom Access Token Hook, có thể tắt — cùng lý do như layout /admin).
  if exists (
    select 1 from public.tenant_members m
    where m.tenant_id = new.tenant_id
      and m.user_id = auth.uid()
      and m.role = 'owner' and m.status = 'active'
  ) then
    return new;
  end if;

  raise exception 'only_owner_can_change_owner_role' using errcode = '42501';
end $$;

comment on function public.guard_owner_role_change() is
  'Chặn leo thang quyền: chỉ chủ tiệm hiện tại mới trao/thu hồi vai owner. Backend (auth.uid() null) và bước khai sinh tiệm được đi qua.';

drop trigger if exists tenant_members_role_guard on public.tenant_members;
create trigger tenant_members_role_guard
  before insert or update on public.tenant_members
  for each row execute function public.guard_owner_role_change();

-- ---------- LỖ 1b: lời mời vai 'owner' cũng chỉ chủ tiệm mới tạo được -------
-- Không bịt đường này thì đường 1 bị chặn xong vẫn còn đường vòng:
-- admin tự mời chính email mình với vai owner rồi bấm nhận.

create or replace function public.guard_owner_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from 'owner' then
    return new;
  end if;
  if auth.uid() is null then
    return new;   -- backend/migration
  end if;
  if exists (
    select 1 from public.tenant_members m
    where m.tenant_id = new.tenant_id
      and m.user_id = auth.uid()
      and m.role = 'owner' and m.status = 'active'
  ) then
    return new;
  end if;
  raise exception 'only_owner_can_invite_owner' using errcode = '42501';
end $$;

comment on function public.guard_owner_invitation() is
  'Chặn đường vòng leo thang quyền: chỉ chủ tiệm hiện tại mới tạo được lời mời vai owner.';

drop trigger if exists invitations_role_guard on public.invitations;
create trigger invitations_role_guard
  before insert or update on public.invitations
  for each row execute function public.guard_owner_invitation();
