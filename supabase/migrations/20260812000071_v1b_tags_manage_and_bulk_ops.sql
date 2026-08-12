-- V1b bước 5-6 (mục 36.8-2/3, task #79) — nốt nhãn khách + thao tác hàng loạt.
-- ============================================================
-- Nội dung:
--   A. tags.deleted_at (soft-delete, bất biến 11) + đổi unique constraint
--      thành partial unique index (chỉ tính nhãn còn sống) — cho phép tạo
--      lại tên trùng tên nhãn vừa gộp/xoá.
--   B. merge_tags(source, target) — gộp nhãn: chuyển hết contact_tags sang
--      nhãn đích rồi xoá mềm nhãn nguồn (đúng thẻ design man-quan-ly-nhan.html:
--      "Gộp = chuyển lượt gắn sang nhãn đích rồi xoá mềm nhãn nguồn, không
--      xoá cứng"). Ghi record_audit đủ dữ liệu để hoàn tác THẬT — trả về id
--      dòng audit làm khoá cho undo_merge_tags().
--   C. undo_merge_tags(audit_id) — hoàn tác đúng MỘT lượt gộp, không hơn.
-- Không đụng bulk_operations/record_audit (đã có từ migration #69/#60) —
-- code TS ở task #79 dùng lại nguyên bảng, không cần cột mới.
-- ============================================================

-- ---------- A. tags.deleted_at ----------
alter table public.tags add column deleted_at timestamptz; -- soft-delete, bất biến 11

alter table public.tags drop constraint tags_tenant_id_name_key;
-- Chỉ tính tên trùng giữa các nhãn CÒN SỐNG — nhãn đã gộp/xoá mềm không còn
-- chặn tạo lại tên đó (khác contacts: tên khách trùng vốn không phải lỗi).
create unique index tags_tenant_id_name_active_idx
  on public.tags (tenant_id, name) where deleted_at is null;

comment on column public.tags.deleted_at is
  'Soft-delete (bất biến 11) — xoá tay hoặc do merge_tags() xoá nhãn nguồn. Mọi query danh sách nhãn phải lọc deleted_at is null (RLS không tự lọc, theo đúng quy ước contacts).';

-- ---------- B. merge_tags ----------
create or replace function public.merge_tags(p_source_tag_id uuid, p_target_tag_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role text := (select public.app_role());
  s public.tags%rowtype;
  tg public.tags%rowtype;
  v_moved uuid[];
  v_all_source uuid[];
  v_audit_id bigint;
begin
  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'merge_tags: chỉ chủ tiệm/quản trị/quản lý được gộp nhãn'
      using errcode = '42501';
  end if;
  if v_tenant is null then
    raise exception 'merge_tags: không xác định được tiệm' using errcode = '42501';
  end if;
  if p_source_tag_id is null or p_target_tag_id is null or p_source_tag_id = p_target_tag_id then
    raise exception 'merge_tags: phải là hai nhãn khác nhau' using errcode = '22023';
  end if;

  -- Khoá hai hàng theo thứ tự id cố định — hai người bấm Gộp cùng lúc không deadlock
  -- (giống merge_contacts, migration #18).
  perform 1
  from public.tags
  where id in (p_source_tag_id, p_target_tag_id) and tenant_id = v_tenant
  order by id
  for update;

  select * into s from public.tags where id = p_source_tag_id and tenant_id = v_tenant;
  select * into tg from public.tags where id = p_target_tag_id and tenant_id = v_tenant;
  if s.id is null or tg.id is null then
    raise exception 'merge_tags: không tìm thấy nhãn trong tiệm này' using errcode = 'P0002';
  end if;
  if s.deleted_at is not null or tg.deleted_at is not null then
    raise exception 'merge_tags: nhãn đã bị xoá' using errcode = '22023';
  end if;

  -- Toàn bộ khách đang mang nhãn nguồn (để undo dựng lại đúng tập này)
  select coalesce(array_agg(contact_id), '{}')
  into v_all_source
  from public.contact_tags
  where tag_id = p_source_tag_id;

  -- Khách MỚI được thêm nhãn đích do lượt gộp này (chưa có nhãn đích từ trước) —
  -- chỉ nhóm này mới bị gỡ nhãn đích khi undo, không đụng khách đã có sẵn.
  select coalesce(array_agg(ct.contact_id), '{}')
  into v_moved
  from public.contact_tags ct
  where ct.tag_id = p_source_tag_id
    and not exists (
      select 1 from public.contact_tags t2
      where t2.contact_id = ct.contact_id and t2.tag_id = p_target_tag_id
    );

  insert into public.contact_tags (tenant_id, contact_id, tag_id)
  select v_tenant, contact_id, p_target_tag_id
  from public.contact_tags
  where tag_id = p_source_tag_id
  on conflict (contact_id, tag_id) do nothing;

  delete from public.contact_tags where tag_id = p_source_tag_id;

  update public.tags set deleted_at = now() where id = p_source_tag_id;

  insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
  values (
    v_tenant, 'tag', p_source_tag_id, auth.uid(), 'merged',
    jsonb_build_object(
      'source_name', s.name,
      'target_tag_id', p_target_tag_id,
      'target_name', tg.name,
      'moved_contact_ids', to_jsonb(v_moved),
      'all_source_contact_ids', to_jsonb(v_all_source)
    )
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke all on function public.merge_tags(uuid, uuid) from public, anon;
grant execute on function public.merge_tags(uuid, uuid) to authenticated;
comment on function public.merge_tags(uuid, uuid) is
  'V1b bước 5-6 (mục 36.8-3): gộp nhãn nguồn vào nhãn đích — chuyển hết contact_tags, xoá mềm nhãn nguồn (bất biến 11), ghi record_audit action=''merged'' đủ dữ liệu để undo_merge_tags() hoàn tác thật. Trả về id dòng record_audit vừa ghi — TS phải lưu lại làm khoá hoàn tác cho nút "Hoàn tác" trên toast.';

-- ---------- C. undo_merge_tags ----------
create or replace function public.undo_merge_tags(p_audit_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role text := (select public.app_role());
  v_row public.record_audit%rowtype;
  v_source_id uuid;
  v_target_id uuid;
  v_moved uuid[];
  v_all_source uuid[];
begin
  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'undo_merge_tags: chỉ chủ tiệm/quản trị/quản lý được hoàn tác'
      using errcode = '42501';
  end if;
  if v_tenant is null then
    raise exception 'undo_merge_tags: không xác định được tiệm' using errcode = '42501';
  end if;

  select * into v_row from public.record_audit
  where id = p_audit_id and tenant_id = v_tenant and entity_type = 'tag' and action = 'merged';
  if v_row.id is null then
    raise exception 'undo_merge_tags: không tìm thấy lượt gộp này' using errcode = 'P0002';
  end if;

  -- Cấm hoàn tác 2 lần cùng một lượt gộp
  if exists (
    select 1 from public.record_audit
    where tenant_id = v_tenant and entity_type = 'tag' and action = 'merge_undone'
      and (diff ->> 'undid_audit_id')::bigint = p_audit_id
  ) then
    raise exception 'undo_merge_tags: lượt gộp này đã được hoàn tác rồi' using errcode = '22023';
  end if;

  v_source_id := v_row.entity_id;
  v_target_id := (v_row.diff ->> 'target_tag_id')::uuid;
  select coalesce(array_agg(x::uuid), '{}') into v_moved
  from jsonb_array_elements_text(v_row.diff -> 'moved_contact_ids') x;
  select coalesce(array_agg(x::uuid), '{}') into v_all_source
  from jsonb_array_elements_text(v_row.diff -> 'all_source_contact_ids') x;

  update public.tags set deleted_at = null where id = v_source_id and tenant_id = v_tenant;

  insert into public.contact_tags (tenant_id, contact_id, tag_id)
  select v_tenant, x, v_source_id from unnest(v_all_source) x
  on conflict (contact_id, tag_id) do nothing;

  delete from public.contact_tags
  where tag_id = v_target_id and contact_id = any (v_moved);

  insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
  values (v_tenant, 'tag', v_source_id, auth.uid(), 'merge_undone',
          jsonb_build_object('undid_audit_id', p_audit_id));
end;
$$;

revoke all on function public.undo_merge_tags(bigint) from public, anon;
grant execute on function public.undo_merge_tags(bigint) to authenticated;
comment on function public.undo_merge_tags(bigint) is
  'Hoàn tác đúng MỘT lượt gộp nhãn (khoá = id record_audit action=''merged'' do merge_tags trả về): dựng lại nhãn nguồn + gán lại đúng tập khách đã có trước khi gộp, chỉ gỡ nhãn đích khỏi khách MỚI được thêm do lượt gộp này (không đụng khách vốn đã có sẵn nhãn đích). Chặn hoàn tác 2 lần cùng một lượt.';
