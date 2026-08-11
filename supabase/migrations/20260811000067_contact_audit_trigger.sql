-- ============================================================
-- iFan.asia — Migration #67: tab "Lịch sử" trên hồ sơ khách (V1a việc 3,
-- hợp đồng 24q — Quy hoạch mục 35.1/35.2 bước 3).
--
-- Quyết định kiến trúc: TRIGGER trên bảng contacts, không rải rác gọi
-- record_audit_log() ở từng hàm TS (createContact/updateContact/...). Lý do:
-- yêu cầu gốc là "mọi sửa hồ sơ khách đều có dòng, KỂ CẢ sửa qua RPC" — rải
-- rác ở tầng TS chắc chắn sót đường (RPC mới, sửa tay qua SQL editor, cron
-- job...). Trigger bắt được TẤT CẢ nguồn ghi, không phụ thuộc ai nhớ gọi.
--
-- Lọc "ồn": KHÔNG ghi log khi chỉ đổi các cột hệ thống tự đụng liên tục
-- (last_interaction_at đổi mỗi khi có tin nhắn/việc mới — activities_touch_
-- contact; lead_score đổi mỗi đêm cron; search_text/updated_at là dẫn xuất).
-- Không lọc thì "Lịch sử" ngập log vô nghĩa, chôn mất sửa đổi THẬT.
--
-- KHÔNG gọi RPC record_audit_log() (dù đó là "một đường duy nhất" cho module
-- MỚI) — RPC đó bắt buộc có current_tenant_id() từ JWT, sẽ raise exception
-- khi bảng contacts bị đụng bởi phiên KHÔNG có JWT (script seed, service
-- role, cron) — làm gãy seed-demo.mjs/seed-sample-tenants.mjs đang chạy tốt.
-- Ghi thẳng vào record_audit (cùng bảng, cùng hình dạng) bằng
-- NEW/OLD.tenant_id trực tiếp — không phụ thuộc claim, actor_id NULL an
-- toàn khi auth.uid() rỗng (không throw).
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
  'Hợp đồng 24q — ghi record_audit cho MỌI thay đổi contacts (trừ cột hệ thống tự đụng). Bắt qua trigger để không sót đường ghi (RPC mới, sửa tay, cron) — không rải record_audit_log() ở từng hàm TS.';

drop trigger if exists contacts_audit_trigger on public.contacts;
create trigger contacts_audit_trigger
  after insert or update or delete on public.contacts
  for each row execute function public.contacts_audit_trigger();

-- ---------- RPC đọc lịch sử: đúng RLS record_audit_select (owner/admin) ----------
-- Không đọc thẳng bảng record_audit từ client (giữ đúng "cửa duy nhất" như
-- các RPC list khác của dự án: trash_list, login-log query...) — trả kèm
-- tên người thao tác thay vì để client tự join, và giới hạn số dòng có kiểm
-- soát rõ ràng thay vì client tự đoán .limit().
create or replace function public.contact_audit_history(p_contact_id uuid, p_limit int default 50)
returns table(
  id bigint, action text, diff jsonb, at timestamptz,
  actor_id uuid, actor_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ra.id, ra.action, ra.diff, ra.at, ra.actor_id,
         coalesce(p.display_name, '')
    from public.record_audit ra
    left join public.profiles p on p.user_id = ra.actor_id
   where ra.tenant_id = (select public.current_tenant_id())
     and ra.entity_type = 'contact'
     and ra.entity_id = p_contact_id
     and (select public.app_role()) in ('owner', 'admin')
   -- id (identity, tăng chặt) chứ không phải at: nhiều dòng ghi trong CÙNG một
   -- giao dịch (vd import hàng loạt) có at giống hệt nhau vì now() đứng yên
   -- theo giao dịch — order by at desc sẽ ra thứ tự tuỳ ý giữa các dòng đó.
   order by ra.id desc
   limit least(greatest(p_limit, 1), 200)
$$;
comment on function public.contact_audit_history(uuid, int) is
  'Hợp đồng 24q — lịch sử sửa đổi 1 khách cho tab "Lịch sử". Chỉ owner/admin (khớp record_audit_select) — vai khác gọi được nhưng luôn ra 0 dòng do điều kiện app_role() ngay trong hàm, không lộ dữ liệu qua đường phụ.';
grant execute on function public.contact_audit_history(uuid, int) to authenticated;
revoke execute on function public.contact_audit_history(uuid, int) from anon, public;
