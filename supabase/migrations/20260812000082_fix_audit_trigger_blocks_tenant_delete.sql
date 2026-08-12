-- ============================================================
-- iFan.asia — Migration #82: SỬA LỖI xoá tiệm luôn thất bại vì nhật ký bản ghi.
--
-- TRIỆU CHỨNG (đo được, không phải lo xa):
--   delete from public.tenants where id = '<uuid>'
--   ERROR: insert or update on table "record_audit" violates foreign key
--          constraint "record_audit_tenant_id_fkey"
--          Key (tenant_id)=(...) is not present in table "tenants".
--   where: PL/pgSQL function contacts_audit_trigger() line 17
--
-- CƠ CHẾ: xoá tenant → cascade xoá contacts → trigger contacts_audit_trigger
-- (AFTER DELETE, migration #67) chèn dòng record_audit mang tenant_id của tiệm
-- VỪA biến mất → vi phạm khoá ngoại → cả lệnh xoá tiệm đổ. Không xoá được tiệm
-- nào có dù chỉ một khách.
--
-- QUYẾT ĐỊNH KIẾN TRÚC (Opus, 12/08 — đã đo và chốt):
--
-- 1. Nhật ký record_audit CHẾT THEO TIỆM — GIỮ NGUYÊN khoá ngoại. Cột
--    record_audit.tenant_id vốn khai `references public.tenants(id) on delete
--    cascade` (migration #60, dòng ~136) và đó là chốt ĐÚNG: nhật ký này để chủ
--    tiệm xem ai sửa gì trong dữ liệu CỦA HỌ; không còn tiệm thì không còn mục
--    đích, và yêu cầu xoá dữ liệu theo luật cũng đòi nó biến mất.
--    KHÔNG đổi khoá ngoại này, KHÔNG bỏ nó — đó là chữa triệu chứng bằng cách
--    phá đúng cái đang bảo vệ mình.
--
-- 2. Sửa ĐÚNG MỘT CHỖ: trigger không được ghi vết khi tiệm cha đang biến mất.
--    Nhánh DELETE bỏ qua việc ghi nếu tenant không còn tồn tại.
--
-- 3. VÌ SAO KHÔNG dùng pg_trigger_depth(): hàm đó không phân biệt được "cascade
--    từ tenant" với mọi trigger lồng nhau khác — nó sẽ vô tình tắt nhật ký ở
--    những ca HỢP LỆ (xoá khách qua RPC có trigger khác gọi lồng). Kiểm "tenant
--    còn sống không" là tín hiệu ĐÚNG BẢN CHẤT của điều ta muốn loại trừ:
--    chỉ im lặng khi cha đã chết, còn lại ghi như cũ.
--
-- 4. Mọi trường hợp khác GIỮ NGUYÊN hành vi: xoá contact bình thường (tiệm còn
--    sống) VẪN ghi record_audit action='deleted' như trước. Có ca đối chứng
--    thường trực trong scripts/rls-smoke.mjs để chứng minh không tắt nhầm.
--
-- PHẠM VI: đã soát toàn bộ migrations + pg_trigger trên CSDL thật — chỉ DUY
-- NHẤT contacts_audit_trigger là TRIGGER ghi vào record_audit. Ba chỗ còn lại
-- (merge_tags, undo_merge_tags, open/end_support_session) là RPC người dùng gọi
-- tay khi tiệm còn sống, không nằm trên đường cascade → không cùng bệnh.
--
-- Bài học #40: `create or replace function` XOÁ MẤT proconfig — phải ghim lại
-- `security definer set search_path = public, pg_temp` ngay trong định nghĩa.
-- ============================================================

create or replace function public.contacts_audit_trigger() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_diff jsonb;
  v_action text;
  -- Cột hệ thống tự đụng, KHÔNG tính là "sửa hồ sơ" thật sự.
  v_noise text[] := array[
    'updated_at', 'search_text', 'last_interaction_at',
    'lead_score', 'lead_score_breakdown', 'lead_score_updated_at',
    'total_revenue'
  ];
begin
  if tg_op = 'INSERT' then
    insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
      values (new.tenant_id, 'contact', new.id, auth.uid(), 'created', null);
    return new;
  elsif tg_op = 'DELETE' then
    -- Tiệm cha đang bị xoá (cascade) → không ghi vết: dòng nhật ký sẽ trỏ vào
    -- một tiệm không còn tồn tại, và bản thân nhật ký cũng chết theo tiệm.
    if not exists (select 1 from public.tenants where id = old.tenant_id) then
      return old;
    end if;
    insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
      values (old.tenant_id, 'contact', old.id, auth.uid(), 'deleted', null);
    return old;
  end if;

  select jsonb_object_agg(o.key, jsonb_build_object('from', o.value, 'to', n.value))
    into v_diff
    from jsonb_each(to_jsonb(old)) o
    join jsonb_each(to_jsonb(new)) n using (key)
    where o.value is distinct from n.value
      and o.key <> all(v_noise);

  if v_diff is null then
    return new; -- chỉ đổi cột "ồn" — không ghi log
  end if;

  v_action := case
    when new.deleted_at is distinct from old.deleted_at
      then case when new.deleted_at is not null then 'deleted' else 'restored' end
    else 'updated'
  end;

  insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
    values (new.tenant_id, 'contact', new.id, auth.uid(), v_action, v_diff);
  return new;
end;
$$;

comment on function public.contacts_audit_trigger() is
  'Hợp đồng 24q — ghi record_audit cho MỌI thay đổi contacts (trừ cột hệ thống tự đụng). Bắt qua trigger để không sót đường ghi (RPC mới, sửa tay, cron) — không rải record_audit_log() ở từng hàm TS. #82: nhánh DELETE bỏ qua ghi vết khi tiệm cha không còn tồn tại (cascade xoá tenant), nếu không sẽ vi phạm record_audit_tenant_id_fkey và chặn luôn lệnh xoá tiệm.';
