-- #225 — lưu THÊM ảnh mặt gốc khi nạp mặt (founder yêu cầu 20/08): để quản lý
-- mắt thường đối chiếu, không chỉ có 128 số. Ảnh vào bucket riêng tenant-files
-- (private); cột chỉ giữ ĐƯỜNG DẪN. Embedding vẫn là thứ máy so; ảnh là để người
-- soi.
--
-- employee_face là bảng MỚI (#235), chưa có traffic → ALTER áp nhanh.
alter table public.employee_face add column if not exists photo_path text;

-- Nâng nap_mat: nhận thêm đường dẫn ảnh (không bắt buộc — nạp không kèm ảnh vẫn
-- được, chỉ mất phần đối chiếu mắt thường). Thêm tham số ⇒ bỏ bản 2-tham-số rồi
-- tạo bản 3-tham-số; logic kiểm quyền GIỮ NGUYÊN.
drop function if exists public.nap_mat(uuid, double precision[]);
create or replace function public.nap_mat(
  p_employee_id uuid,
  p_descriptor double precision[],
  p_photo_path text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_uid uuid := auth.uid();
  v_ok boolean;
begin
  if v_tenant is null or v_uid is null then raise exception 'forbidden'; end if;
  if p_descriptor is null or array_length(p_descriptor, 1) <> 128 then
    raise exception 'invalid_input';
  end if;
  -- Ảnh (nếu có) phải nằm trong thư mục của ĐÚNG tiệm — chống mượn đường dẫn.
  if p_photo_path is not null and p_photo_path not like (v_tenant::text || '/%') then
    raise exception 'invalid_input';
  end if;
  select (
    e.tenant_id = v_tenant
    and (e.user_id = v_uid or public.app_role() in ('owner', 'admin'))
  ) into v_ok
  from public.employees e where e.id = p_employee_id;
  if not coalesce(v_ok, false) then raise exception 'forbidden'; end if;

  insert into public.employee_face (employee_id, tenant_id, descriptor, photo_path, enrolled_by, updated_at)
  values (p_employee_id, v_tenant, p_descriptor, p_photo_path, v_uid, now())
  on conflict (employee_id) do update
    set descriptor = excluded.descriptor,
        photo_path = excluded.photo_path,
        enrolled_by = excluded.enrolled_by,
        updated_at = now();
end;
$$;
revoke all on function public.nap_mat(uuid, double precision[], text) from public;
grant execute on function public.nap_mat(uuid, double precision[], text) to authenticated;
