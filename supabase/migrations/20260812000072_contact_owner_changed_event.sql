-- V1b bước 5-6 (task #79) — bổ sung sự kiện contact.owner_changed.
-- ============================================================
-- docs/EVENT_CATALOG.md đã khai TRƯỚC (bất biến 12 + luật D1): "contact.owner_changed
-- — chưa có luồng đổi người phụ trách khách trong sản phẩm. Khi xây hành động gán lại
-- phụ trách thì BẮT BUỘC thêm vào contacts_emit_events". Task #79 vừa dựng hành động đó
-- (assignContactOwner, dùng cho cả đơn lẻ lẫn nút hàng loạt "Giao cho…") — nối nốt vế
-- đã khai, không phải tính năng mới ngoài kế hoạch.
-- owner_id vẫn còn trong mảng tính changed_fields của contact.updated (giữ nguyên hành
-- vi cũ cho consumer đang đọc theo cách đó) — event mới này CHỈ THÊM, không thay.
-- ============================================================

create or replace function public.contacts_emit_events() returns trigger
language plpgsql
security definer set search_path = public as $$
declare
  v_ctx jsonb := public.wf_event_ctx();
  v_changed text[];
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.wf_emit(
      new.tenant_id, 'contact.created', 'contact', new.id::text,
      jsonb_build_object(
        'source_id', new.source_id,
        'channel', coalesce(v_ctx ->> 'channel', 'crm')));
    if new.company_id is not null then
      perform public.wf_emit(
        new.tenant_id, 'contact.company_linked', 'contact', new.id::text,
        jsonb_build_object(
          'company_id', new.company_id,
          'method', coalesce(v_ctx ->> 'link_method', 'manual')));
    end if;
    return null;
  end if;

  -- Xóa mềm không phát event (giữ nguyên hành vi trước khi chuyển sang trigger)
  if new.deleted_at is not null and old.deleted_at is null then
    return null;
  end if;

  if new.tier is distinct from old.tier then
    perform public.wf_emit(
      new.tenant_id, 'contact.tier_changed', 'contact', new.id::text,
      jsonb_build_object('old_tier', old.tier, 'new_tier', new.tier));
  end if;

  if new.company_id is distinct from old.company_id and new.company_id is not null then
    perform public.wf_emit(
      new.tenant_id, 'contact.company_linked', 'contact', new.id::text,
      jsonb_build_object(
        'company_id', new.company_id,
        'method', coalesce(v_ctx ->> 'link_method', 'manual')));
  end if;

  -- Mới: contact.owner_changed (task #79, khai trước ở EVENT_CATALOG.md 12/08)
  if new.owner_id is distinct from old.owner_id then
    perform public.wf_emit(
      new.tenant_id, 'contact.owner_changed', 'contact', new.id::text,
      jsonb_build_object('old_owner_id', old.owner_id, 'new_owner_id', new.owner_id));
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  select array_agg(u.k order by u.ord) into v_changed
  from unnest(array[
    'full_name','phone','email','source_id','company_id',
    'owner_id','gender','dob','address','province','lifecycle','custom'
  ]) with ordinality as u(k, ord)
  where v_old -> u.k is distinct from v_new -> u.k;

  if v_changed is not null and array_length(v_changed, 1) > 0 then
    perform public.wf_emit(
      new.tenant_id, 'contact.updated', 'contact', new.id::text,
      jsonb_build_object('changed_fields', to_jsonb(v_changed)));
  end if;
  return null;
end $$;
