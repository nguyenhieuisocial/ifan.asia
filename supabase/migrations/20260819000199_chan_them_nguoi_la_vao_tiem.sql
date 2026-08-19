-- ============================================================
-- iFan.asia — Migration #199: `staff_account_add_member` chỉ được thêm
-- ĐÚNG tài khoản nhân viên do CHÍNH TIỆM NÀY tạo ra.
--
-- LỖ ĐÃ ĐO ĐƯỢC (19/08, trên CSDL thật, trong transaction rollback):
-- hàm #62 kiểm tiệm (`current_tenant_id()`) và kiểm vai người GỌI
-- (owner/admin), nhưng KHÔNG kiểm `p_user_id` là ai. Chủ tiệm A gõ uuid của
-- một người hoàn toàn xa lạ (nhân viên tiệm B) → hàm thêm luôn vào tiệm A,
-- rồi RLS `profiles` cho A đọc hồ sơ người đó: tên hiển thị VÀ SỐ ĐIỆN THOẠI.
-- Đây là lộ dữ liệu cá nhân của người dùng nền tảng, không phải lỗ chéo tiệm
-- thông thường. Trần ghế (`enforce_seat_limit`, #28) vẫn giữ nguyên nên không
-- lách được tiền — thuần tuý quyền riêng tư.
--
-- VÌ SAO LỖ TỒN TẠI: luồng ứng dụng (app/app/settings/team/actions.ts) chỉ
-- gọi hàm này NGAY SAU khi tự `admin.createUser()`, nên trong thực tế
-- `p_user_id` luôn là người vừa được tạo. Hàm không tự bảo vệ được điều đó —
-- ai gọi thẳng RPC thì không có gì chặn.
--
-- CHỐT MỚI — dựa trên DẤU VẾT ĐÃ CÓ SẴN, không dựng luồng mới:
-- email đăng nhập của tài khoản nhân viên là email TỔNG HỢP
-- `p<sđt>.<mã-tiệm>@staff.ifan.local` (#62). Mã tiệm nằm NGAY TRONG email —
-- đó chính là "tài khoản do tiệm này tạo", ghi vào `auth.users` từ trước và
-- người gọi RPC không sửa được. Hàm chỉ nhận `p_user_id` có email khớp mã
-- tiệm của tiệm đang thao tác; người lạ (email thật, hoặc email tổng hợp mang
-- mã tiệm khác) bị từ chối.
--
-- HAI HƯỚNG ĐÃ LOẠI:
--  · "phải có lời mời hợp lệ": luồng tạo tài khoản nhân viên CỐ Ý không đi qua
--    lời mời (không có bước "chờ nhận", chiếm ghế ngay). Bắt phải có lời mời =
--    thiết kế lại luồng + đụng cách đếm ghế (`invitations` cũng tính ghế).
--  · "người mới tinh, chưa thuộc tiệm nào": phụ thuộc thời điểm nên dễ vỡ, và
--    vẫn để lọt người lạ vừa đăng ký mà chưa vào tiệm nào.
--
-- CHUỖI EMAIL DỰNG Ở ĐÂU: `lib/auth/staff-accounts.ts` vẫn là NƠI DUY NHẤT
-- dựng email (#62, #68 nhắc lại luật này). SQL dưới đây KHÔNG dựng chuỗi —
-- nó chỉ ĐỌC ngược để đối chiếu, và fail-closed. Nếu mai này đổi định dạng
-- email mà quên sửa chốt này thì luồng tạo tài khoản nhân viên GÃY NGAY và ồn
-- ào ngay bước tạo, chứ không hỏng âm thầm.
-- ============================================================

create or replace function public.staff_account_add_member(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_slug   text;
  v_email  text;
  v_local  text;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if (select public.app_role()) not in ('owner','admin') then raise exception 'forbidden'; end if;
  if p_role not in ('admin','manager','staff','viewer') then raise exception 'invalid_role'; end if;

  select lower(slug) into v_slug from public.tenants where id = v_tenant;
  select lower(email) into v_email from auth.users where id = p_user_id;
  -- Không có tiệm / uuid không tồn tại → cùng một lỗi, không rò "uuid này có thật hay không".
  if v_slug is null or v_email is null then raise exception 'not_own_staff_account'; end if;

  -- Mã tiệm không chứa dấu chấm (ràng buộc `tenants_slug_check`: [a-z0-9-]),
  -- còn phần trước dấu chấm đầu tiên là `p<chữ số>` — nên "phần sau dấu chấm
  -- đầu tiên" LUÔN đúng bằng mã tiệm, không có chỗ cho tiệm này trùng đuôi
  -- tiệm kia.
  v_local := split_part(v_email, '@', 1);
  if split_part(v_email, '@', 2) <> 'staff.ifan.local'
     or v_local !~ '^p[0-9]+\.'
     or substr(v_local, strpos(v_local, '.') + 1) <> v_slug
  then
    raise exception 'not_own_staff_account';
  end if;

  insert into public.tenant_members (tenant_id, user_id, role, status, invited_by, joined_at)
    values (v_tenant, p_user_id, p_role::public.tenant_role, 'active', auth.uid(), now());
end;
$$;

comment on function public.staff_account_add_member(uuid, text) is
  'Thêm tài khoản nhân viên vừa tạo vào tiệm (migration #62). Từ #199 chỉ nhận user có email tổng hợp mang ĐÚNG mã tiệm đang thao tác — trước đó chủ tiệm gọi thẳng RPC thêm được uuid người lạ rồi đọc tên + số điện thoại của họ.';

grant execute on function public.staff_account_add_member(uuid, text) to authenticated;
revoke execute on function public.staff_account_add_member(uuid, text) from anon, public;
