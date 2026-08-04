-- ============================================================
-- iFan.asia — Migration #15: Workflow Engine (GĐ2 — đợt 1 "lõi chạy được thật")
--
-- A) PHÁT EVENT BẰNG TRIGGER DB (trả nợ kỹ thuật đã ghi trong lib/events.ts):
--    trước đây server action gọi RPC emit_event ở LƯỢT RIÊNG → không cùng
--    transaction nghiệp vụ, code tương lai quên gọi là mất event. Nay 3 bảng
--    nguồn (contacts, deals, companies) tự phát event trong CÙNG transaction
--    với thao tác ghi ⇒ không thể quên, không thể lệch.
--      contacts_emit_events()   -- contact.created/updated/tier_changed/company_linked
--      deals_emit_events()      -- deal.created/stage_changed/won/lost
--      companies_emit_events()  -- company.created/updated
--    tenant_id lấy từ HÀNG (không phải JWT) → seed/service-role ghi vẫn đúng tenant;
--    actor lấy từ auth.uid() và ĐƯỢC PHÉP null (worker/seed không có phiên đăng nhập).
--
-- B) LÕI ENGINE:
--    workflows / workflow_runs   -- định nghĩa + lịch sử chạy (RLS theo tenant)
--    process_workflow_events()   -- worker trong DB: fan-out → chạy → đánh dấu đã xử lý
--    execute_workflow_run()      -- chạy 1 run: retry có backoff, hết lượt → dead-letter
--    cron 'process-workflow-events' mỗi phút (theo mẫu migration #5)
--
-- C) 2 PLAYBOOK CÀI SẴN cho mọi tenant (cũ: gọi on-demand như ensure_deal_defaults;
--    mới: create_tenant tự seed). Tên/nhãn playbook là DỮ LIỆU của tenant nên viết
--    tiếng Việt (cùng quy ước với lost_reasons/lead_sources trong create_tenant) —
--    người dùng sửa/tắt được, KHÔNG phải chuỗi giao diện đa ngữ.
--
-- Chuẩn: theo migration #4/#5/#13 (text + check, timestamptz, definer set search_path,
--        revoke public trước khi grant đích danh, RLS bật trên mọi bảng có tenant_id).
-- ============================================================

-- ============================================================
-- PHẦN A — PHÁT EVENT BẰNG TRIGGER
-- ============================================================

-- ---------- Ngữ cảnh phát event do tầng web gửi kèm ----------
-- Hai trường trong payload catalog KHÔNG suy ra được từ dữ liệu hàng:
--   contact.created.channel        ('crm' | 'import' | loại kênh hội thoại)
--   contact.company_linked.method  ('auto_domain' | 'manual' | 'import')
-- Web gửi chúng qua header HTTP 'x-ifan-event-ctx' (JSON) — PostgREST expose
-- vào current_setting('request.headers'). Không có header (seed, service role,
-- ghi thẳng bằng SQL) → dùng mặc định, KHÔNG lỗi.
create or replace function public.wf_event_ctx() returns jsonb
language plpgsql stable set search_path = public as $$
declare v_raw text; v_out jsonb;
begin
  begin
    v_raw := nullif(current_setting('request.headers', true), '')::json ->> 'x-ifan-event-ctx';
  exception when others then
    return '{}'::jsonb;
  end;
  if v_raw is null or v_raw = '' then
    return '{}'::jsonb;
  end if;
  begin
    v_out := v_raw::jsonb;
  exception when others then
    return '{}'::jsonb;
  end;
  if jsonb_typeof(v_out) <> 'object' then
    return '{}'::jsonb;
  end if;
  return v_out;
end $$;

-- Ghi 1 dòng vào outbox. causation_chain lấy từ biến phiên 'ifan.wf_depth' do
-- execute_workflow_run() đặt — event do hành động workflow sinh ra mang chain
-- lớn hơn nguồn 1 bậc (chống vòng lặp, xem PHẦN B).
create or replace function public.wf_emit(
  p_tenant uuid,
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id text,
  p_payload jsonb
) returns void
language plpgsql set search_path = public as $$
declare v_depth int;
begin
  begin
    v_depth := coalesce(nullif(current_setting('ifan.wf_depth', true), '')::int, 0);
  exception when others then
    v_depth := 0;
  end;
  insert into public.domain_events
    (tenant_id, event_type, aggregate_type, aggregate_id, payload,
     actor_user_id, source_module, causation_chain)
  values
    (p_tenant, p_event_type, p_aggregate_type, p_aggregate_id, coalesce(p_payload, '{}'::jsonb),
     auth.uid(), case when v_depth > 0 then 'workflow' else 'crm' end, v_depth);
end $$;

-- ---------- contacts ----------
-- Trường tính changed_fields: các cột NGHIỆP VỤ người dùng sửa được. Cố tình loại
-- 'tier' (đã có event riêng contact.tier_changed — không phát 2 event cho 1 thao tác),
-- và loại cột hệ thống/dẫn xuất (lead_score*, search_text, total_revenue,
-- last_interaction_at, updated_at, deleted_at) để không phát event rác khi
-- trigger chấm điểm hay đồng bộ chạm vào hàng.
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

create trigger contacts_emit_events after insert or update on public.contacts
  for each row execute function public.contacts_emit_events();

-- ---------- deals ----------
-- source_id trong payload = nguồn của KHÁCH gắn với cơ hội (quy kết nguồn doanh thu),
-- đúng như contactSourceId() bên app trước đây.
create or replace function public.deals_emit_events() returns trigger
language plpgsql
security definer set search_path = public as $$
declare
  v_source uuid;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    select c.source_id into v_source from public.contacts c where c.id = new.contact_id;
    perform public.wf_emit(
      new.tenant_id, 'deal.created', 'deal', new.id::text,
      jsonb_build_object(
        'pipeline_id', new.pipeline_id,
        'stage_id', new.stage_id,
        'value_vnd', new.value_vnd,
        'contact_id', new.contact_id,
        'source_id', v_source,
        'owner_id', new.owner_id));
    return null;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    return null;
  end if;

  -- Thứ tự giữ nguyên như app cũ: đổi cột trước, thắng/thua sau
  if new.stage_id is distinct from old.stage_id then
    perform public.wf_emit(
      new.tenant_id, 'deal.stage_changed', 'deal', new.id::text,
      jsonb_build_object('old_stage_id', old.stage_id, 'new_stage_id', new.stage_id));
  end if;

  if new.status = 'won' and old.status is distinct from 'won' then
    select c.source_id into v_source from public.contacts c where c.id = new.contact_id;
    perform public.wf_emit(
      new.tenant_id, 'deal.won', 'deal', new.id::text,
      jsonb_build_object(
        'value_vnd', new.value_vnd,
        'contact_id', new.contact_id,
        'source_id', v_source,
        'owner_id', new.owner_id));
  end if;

  if new.status = 'lost' and old.status is distinct from 'lost' then
    select r.name into v_reason from public.lost_reasons r where r.id = new.lost_reason_id;
    perform public.wf_emit(
      new.tenant_id, 'deal.lost', 'deal', new.id::text,
      jsonb_build_object(
        'reason', v_reason,
        'lost_reason_id', new.lost_reason_id,
        'contact_id', new.contact_id,
        'value_vnd', new.value_vnd));
  end if;
  return null;
end $$;

create trigger deals_emit_events after insert or update on public.deals
  for each row execute function public.deals_emit_events();

-- ---------- companies ----------
create or replace function public.companies_emit_events() returns trigger
language plpgsql
security definer set search_path = public as $$
declare
  v_changed text[];
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.wf_emit(
      new.tenant_id, 'company.created', 'company', new.id::text,
      jsonb_build_object(
        'name', new.name,
        'email_domain', new.email_domain,
        'tax_code', new.tax_code));
    return null;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    return null;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  select array_agg(u.k order by u.ord) into v_changed
  from unnest(array[
    'name','email_domain','tax_code','phone','email',
    'address','industry','size_range','owner_id'
  ]) with ordinality as u(k, ord)
  where v_old -> u.k is distinct from v_new -> u.k;

  if v_changed is not null and array_length(v_changed, 1) > 0 then
    perform public.wf_emit(
      new.tenant_id, 'company.updated', 'company', new.id::text,
      jsonb_build_object('changed_fields', to_jsonb(v_changed)));
  end if;
  return null;
end $$;

create trigger companies_emit_events after insert or update on public.companies
  for each row execute function public.companies_emit_events();

revoke execute on function public.wf_event_ctx from public, anon;
revoke execute on function public.wf_emit from public, anon;
revoke execute on function public.contacts_emit_events from public, anon;
revoke execute on function public.deals_emit_events from public, anon;
revoke execute on function public.companies_emit_events from public, anon;

-- ============================================================
-- PHẦN B — LÕI ENGINE
-- ============================================================

-- ---------- Bảng định nghĩa ----------
create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- khóa ổn định của playbook cài sẵn (null = workflow do tenant tự tạo, đợt 2)
  key text,
  name text not null,
  description text,
  trigger_event text not null,        -- 1 event_type theo docs/EVENT_CATALOG.md
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  is_system boolean not null default false,   -- true = playbook cài sẵn
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index workflows_tenant_key_uniq
  on public.workflows (tenant_id, key) where key is not null;
create index workflows_trigger_idx
  on public.workflows (tenant_id, trigger_event) where is_active;

create trigger workflows_touch before update on public.workflows
  for each row execute function public.touch_updated_at();

-- ---------- Bảng lịch sử chạy ----------
--  pending  chờ chạy
--  running  đang chạy (kẹt > 10 phút sẽ được worker nhặt lại)
--  done     xong
--  failed   lỗi tạm — còn lượt thử, next_attempt_at là mốc thử lại
--  dead     hết lượt thử → dead-letter, giữ last_error để người dùng đọc
create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  event_id bigint not null references public.domain_events(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','running','done','failed','dead')),
  attempts int not null default 0,
  -- bậc chống vòng lặp: bằng causation_chain của event kích hoạt (xem wf_emit)
  depth int not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
-- 1 event chỉ sinh tối đa 1 run cho mỗi workflow → fan-out chạy lại là no-op
create unique index workflow_runs_workflow_event_uniq
  on public.workflow_runs (workflow_id, event_id);
create index workflow_runs_due_idx on public.workflow_runs (next_attempt_at)
  where status in ('pending','failed','running');
create index workflow_runs_tenant_time_idx
  on public.workflow_runs (tenant_id, created_at desc);

-- ---------- RLS ----------
alter table public.workflows enable row level security;
alter table public.workflow_runs enable row level security;

create policy workflows_select on public.workflows for select
  using (tenant_id = (select public.current_tenant_id()));
create policy workflows_manage on public.workflows for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin'));

create policy workflow_runs_select on public.workflow_runs for select
  using (tenant_id = (select public.current_tenant_id()));
-- ghi workflow_runs: chỉ worker (security definer) hoặc service role

-- ---------- Đọc trường theo đường dẫn ----------
-- Cú pháp đường dẫn dùng chung cho ĐIỀU KIỆN và MẪU CHUỖI (đợt 1, không có
-- ngôn ngữ biểu thức):
--   payload.<field>    trường trong payload của event
--   aggregate.<field>  trường của bản ghi gốc (contact | deal | company)
--   event.<field>      trường của chính event (event_type, aggregate_id, id…)
--   <field>            viết tắt của payload.<field>
create or replace function public.wf_field(p_path text, p_event jsonb, p_agg jsonb)
returns jsonb
language plpgsql immutable set search_path = public as $$
declare v_parts text[]; v_root jsonb; v_rest text[];
begin
  if p_path is null or p_path = '' then
    return null;
  end if;
  v_parts := string_to_array(p_path, '.');
  if v_parts[1] = 'aggregate' then
    v_root := p_agg;               v_rest := v_parts[2:];
  elsif v_parts[1] = 'event' then
    v_root := p_event;             v_rest := v_parts[2:];
  elsif v_parts[1] = 'payload' then
    v_root := p_event -> 'payload'; v_rest := v_parts[2:];
  else
    v_root := p_event -> 'payload'; v_rest := v_parts;
  end if;
  if v_root is null or array_length(v_rest, 1) is null then
    return v_root;
  end if;
  return v_root #> v_rest;
end $$;

-- ---------- Điều kiện ----------
-- Hình dạng đợt 1 (mọi mục AND với nhau; {} = luôn khớp):
--   {"payload.new_tier": "vip"}                → bằng đúng giá trị
--   {"aggregate.owner_id": {"exists": true}}   → có/không có giá trị
create or replace function public.wf_match_conditions(p_cond jsonb, p_event jsonb, p_agg jsonb)
returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; f jsonb; v_want boolean;
begin
  if p_cond is null or jsonb_typeof(p_cond) <> 'object' then
    return true;
  end if;
  for k, v in select key, value from jsonb_each(p_cond) loop
    f := public.wf_field(k, p_event, p_agg);
    if jsonb_typeof(v) = 'object' and v ? 'exists' then
      v_want := coalesce((v ->> 'exists')::boolean, true);
      if (f is not null and jsonb_typeof(f) <> 'null') <> v_want then
        return false;
      end if;
    elsif f is distinct from v then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- ---------- Mẫu chuỗi ----------
-- Chỉ thay thế tham chiếu trường đơn giản {{payload.x}} / {{aggregate.y}} /
-- {{event.z}}. KHÔNG có hàm, phép tính hay điều kiện (để đợt 2).
create or replace function public.wf_render(p_tpl text, p_event jsonb, p_agg jsonb)
returns text
language plpgsql immutable set search_path = public as $$
declare v_out text := p_tpl; v_path text; v_val text;
begin
  if p_tpl is null then
    return null;
  end if;
  for v_path in
    select distinct t.arr[1]
    from regexp_matches(p_tpl, '\{\{\s*([A-Za-z0-9_.]+)\s*\}\}', 'g') as t(arr)
  loop
    v_val := coalesce(public.wf_field(v_path, p_event, p_agg) #>> '{}', '');
    v_out := regexp_replace(
      v_out,
      '\{\{\s*' || replace(v_path, '.', '\.') || '\s*\}\}',
      replace(v_val, '\', '\\'),
      'g');
  end loop;
  return v_out;
end $$;

-- ---------- Bản ghi gốc của event ----------
create or replace function public.wf_aggregate(p_type text, p_id text, p_tenant uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public as $$
declare v jsonb;
begin
  if p_type = 'contact' then
    select to_jsonb(c) into v from public.contacts c
      where c.id = p_id::uuid and c.tenant_id = p_tenant;
  elsif p_type = 'deal' then
    select to_jsonb(d) into v from public.deals d
      where d.id = p_id::uuid and d.tenant_id = p_tenant;
  elsif p_type = 'company' then
    select to_jsonb(co) into v from public.companies co
      where co.id = p_id::uuid and co.tenant_id = p_tenant;
  end if;
  return coalesce(v, '{}'::jsonb);
exception when others then
  return '{}'::jsonb;
end $$;

-- ---------- Người nhận việc / thông báo ----------
-- 'owner' (mặc định) = người phụ trách bản ghi gốc; hoặc uuid cụ thể.
-- Không resolve được → lùi về chủ tài khoản; vẫn không có → lỗi để run được retry.
create or replace function public.wf_resolve_user(p_tenant uuid, p_spec text, p_agg jsonb)
returns uuid
language plpgsql stable
security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_spec is null or p_spec = '' or p_spec = 'owner' then
    begin
      v_id := nullif(p_agg ->> 'owner_id', '')::uuid;
    exception when others then v_id := null; end;
  else
    begin
      v_id := p_spec::uuid;
    exception when others then v_id := null; end;
  end if;
  if v_id is null then
    select m.user_id into v_id from public.tenant_members m
      where m.tenant_id = p_tenant and m.role = 'owner' and m.status = 'active'
      order by m.created_at limit 1;
  end if;
  if v_id is null then
    raise exception 'wf_user_unresolved';
  end if;
  return v_id;
end $$;

-- ---------- Thực thi 1 hành động ----------
-- Loại hành động đợt 1 — CỐ TÌNH chỉ tác động NỘI BỘ, không gọi API bên ngoài:
--   {"type":"create_task","subject":"…","body":"…","due_in":"2 hours","assign_to":"owner"}
--   {"type":"notify","title":"…","body":"…","link":"/app/…","to":"owner"}
--   {"type":"set_tier","tier":"vip"}                       (chỉ aggregate contact)
--   {"type":"assign_owner","to":"owner|<uuid>"}            (contact hoặc deal)
-- Mọi chuỗi đi qua wf_render. Loại lạ → raise ⇒ run retry rồi vào dead-letter.
create or replace function public.wf_exec_action(
  p_tenant uuid, p_action jsonb, p_event jsonb, p_agg jsonb
) returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_type text := p_action ->> 'type';
  v_agg_type text := p_event ->> 'aggregate_type';
  v_contact uuid;
  v_deal uuid;
  v_user uuid;
  v_due interval;
  v_tier text;
begin
  if v_agg_type = 'contact' then
    v_contact := (p_event ->> 'aggregate_id')::uuid;
  elsif v_agg_type = 'deal' then
    v_deal := (p_event ->> 'aggregate_id')::uuid;
    v_contact := nullif(p_agg ->> 'contact_id', '')::uuid;
  end if;

  if v_type = 'create_task' then
    if v_contact is null and v_deal is null then
      raise exception 'wf_task_needs_target';
    end if;
    v_user := public.wf_resolve_user(p_tenant, p_action ->> 'assign_to', p_agg);
    begin
      v_due := coalesce(nullif(p_action ->> 'due_in', ''), '0 minutes')::interval;
    exception when others then
      raise exception 'wf_bad_due_in: %', coalesce(p_action ->> 'due_in', '(null)');
    end;
    insert into public.activities
      (tenant_id, type, subject, body, contact_id, deal_id, owner_id, due_at)
    values
      (p_tenant, 'task',
       left(coalesce(public.wf_render(p_action ->> 'subject', p_event, p_agg), 'Việc tự động'), 200),
       public.wf_render(p_action ->> 'body', p_event, p_agg),
       v_contact, v_deal, v_user, now() + v_due);

  elsif v_type = 'notify' then
    v_user := public.wf_resolve_user(p_tenant, p_action ->> 'to', p_agg);
    insert into public.notifications (tenant_id, user_id, type, title, body, link)
    values
      (p_tenant, v_user, 'workflow',
       left(coalesce(public.wf_render(p_action ->> 'title', p_event, p_agg), 'Thông báo quy trình'), 200),
       public.wf_render(p_action ->> 'body', p_event, p_agg),
       public.wf_render(p_action ->> 'link', p_event, p_agg));

  elsif v_type = 'set_tier' then
    if v_contact is null then
      raise exception 'wf_set_tier_needs_contact';
    end if;
    v_tier := public.wf_render(p_action ->> 'tier', p_event, p_agg);
    update public.contacts set tier = v_tier
      where id = v_contact and tenant_id = p_tenant;

  elsif v_type = 'assign_owner' then
    v_user := public.wf_resolve_user(
      p_tenant, public.wf_render(p_action ->> 'to', p_event, p_agg), p_agg);
    if v_deal is not null then
      update public.deals set owner_id = v_user where id = v_deal and tenant_id = p_tenant;
    elsif v_contact is not null then
      update public.contacts set owner_id = v_user where id = v_contact and tenant_id = p_tenant;
    else
      raise exception 'wf_assign_needs_target';
    end if;

  else
    raise exception 'wf_unknown_action: %', coalesce(v_type, '(null)');
  end if;
end $$;

-- ---------- Chạy 1 run: retry có backoff → dead-letter ----------
-- Tối đa 3 lượt; lỗi lượt 1 → thử lại sau 1 phút, lượt 2 → 5 phút, lượt 3 → 'dead'.
-- Khối begin/exception cuộn lại MỌI side-effect của lượt hỏng (việc/thông báo
-- nửa vời không đọng lại), riêng bản ghi trạng thái trong handler thì giữ.
create or replace function public.execute_workflow_run(p_run_id uuid) returns text
language plpgsql
security definer set search_path = public as $$
declare
  r public.workflow_runs%rowtype;
  w public.workflows%rowtype;
  e public.domain_events%rowtype;
  v_event jsonb;
  v_agg jsonb;
  v_action jsonb;
  v_attempt int;
  v_err text;
  v_status text;
begin
  select * into r from public.workflow_runs where id = p_run_id for update;
  if not found then
    return 'missing';
  end if;
  if r.status in ('done','dead') then
    return r.status;
  end if;

  select * into w from public.workflows where id = r.workflow_id;
  if not found then
    update public.workflow_runs
      set status = 'dead', last_error = 'wf_definition_missing', finished_at = now()
      where id = r.id;
    return 'dead';
  end if;
  select * into e from public.domain_events where id = r.event_id;
  if not found then
    update public.workflow_runs
      set status = 'dead', last_error = 'wf_event_missing', finished_at = now()
      where id = r.id;
    return 'dead';
  end if;

  v_event := to_jsonb(e);
  v_agg := public.wf_aggregate(e.aggregate_type, e.aggregate_id, e.tenant_id);
  v_attempt := r.attempts + 1;

  update public.workflow_runs
    set status = 'running', started_at = coalesce(started_at, now())
    where id = r.id;

  begin
    -- Event do hành động dưới đây sinh ra sẽ mang causation_chain = depth + 1
    perform set_config('ifan.wf_depth', (r.depth + 1)::text, true);
    for v_action in select value from jsonb_array_elements(coalesce(w.actions, '[]'::jsonb)) loop
      perform public.wf_exec_action(e.tenant_id, v_action, v_event, v_agg);
    end loop;
    perform set_config('ifan.wf_depth', '0', true);
    update public.workflow_runs
      set status = 'done', attempts = v_attempt, last_error = null, finished_at = now()
      where id = r.id;
    v_status := 'done';
  exception when others then
    v_err := left(sqlerrm, 500);
    perform set_config('ifan.wf_depth', '0', true);
    if v_attempt >= 3 then
      update public.workflow_runs
        set status = 'dead', attempts = v_attempt, last_error = v_err, finished_at = now()
        where id = r.id;
      v_status := 'dead';
    else
      update public.workflow_runs
        set status = 'failed', attempts = v_attempt, last_error = v_err,
            next_attempt_at = now() +
              (case v_attempt when 1 then interval '1 minute' else interval '5 minutes' end)
        where id = r.id;
      v_status := 'failed';
    end if;
  end;
  return v_status;
end $$;

-- ---------- Worker: fan-out → chạy → đánh dấu đã xử lý ----------
-- CHỐNG VÒNG LẶP: event do một run ở bậc 3 (bậc tối đa) sinh ra sẽ có
-- causation_chain = 4 → KHÔNG tạo run nào nữa, đánh dấu đã xử lý và dừng chuỗi.
create or replace function public.process_workflow_events(p_batch int default 100) returns int
language plpgsql
security definer set search_path = public as $$
declare
  e public.domain_events%rowtype;
  w public.workflows%rowtype;
  r record;
  v_event jsonb;
  v_agg jsonb;
  v_matched int;
  v_executed int := 0;
begin
  -- Pha 1: ghép event với workflow đang bật → tạo run
  for e in
    select * from public.domain_events
    where processed_at is null
    order by id
    limit p_batch
  loop
    if e.causation_chain > 3 then
      update public.domain_events set processed_at = now() where id = e.id;
      continue;
    end if;

    v_event := to_jsonb(e);
    v_agg := public.wf_aggregate(e.aggregate_type, e.aggregate_id, e.tenant_id);
    v_matched := 0;
    for w in
      select * from public.workflows
      where tenant_id = e.tenant_id and is_active and trigger_event = e.event_type
      order by created_at
    loop
      if public.wf_match_conditions(w.conditions, v_event, v_agg) then
        insert into public.workflow_runs (tenant_id, workflow_id, event_id, depth)
          values (e.tenant_id, w.id, e.id, e.causation_chain)
          on conflict (workflow_id, event_id) do nothing;
        v_matched := v_matched + 1;
      end if;
    end loop;

    -- Không workflow nào quan tâm → xong ngay, không giữ event lại quét mãi
    if v_matched = 0 then
      update public.domain_events set processed_at = now() where id = e.id;
    end if;
  end loop;

  -- Pha 2: chạy các run đến hạn (kể cả run kẹt 'running' quá 10 phút do worker chết)
  for r in
    select id from public.workflow_runs
    where (status in ('pending','failed') and next_attempt_at <= now())
       or (status = 'running' and started_at < now() - interval '10 minutes')
    order by created_at
    limit p_batch * 5
  loop
    perform public.execute_workflow_run(r.id);
    v_executed := v_executed + 1;
  end loop;

  -- Pha 3: mọi run của event đã kết thúc (done/dead) → event coi như đã xử lý
  update public.domain_events e2 set processed_at = now()
  where e2.processed_at is null
    and exists (select 1 from public.workflow_runs r2 where r2.event_id = e2.id)
    and not exists (
      select 1 from public.workflow_runs r3
      where r3.event_id = e2.id and r3.status in ('pending','running','failed'));

  return v_executed;
end $$;

revoke execute on function public.wf_field from public, anon;
revoke execute on function public.wf_match_conditions from public, anon;
revoke execute on function public.wf_render from public, anon;
revoke execute on function public.wf_aggregate from public, anon, authenticated;
revoke execute on function public.wf_resolve_user from public, anon, authenticated;
revoke execute on function public.wf_exec_action from public, anon, authenticated;
revoke execute on function public.execute_workflow_run from public, anon, authenticated;
revoke execute on function public.process_workflow_events from public, anon, authenticated;

-- Lịch nền: mỗi phút, cùng nhịp với worker Zalo (migration #5)
select cron.schedule('process-workflow-events', '* * * * *',
                     'select public.process_workflow_events(200)');

-- ============================================================
-- PHẦN C — 2 PLAYBOOK CÀI SẴN
-- ============================================================
-- Nội dung (tên, mô tả, tiêu đề việc/thông báo) là DỮ LIỆU của tenant nên viết
-- tiếng Việt, giống lost_reasons/lead_sources — tenant sửa hoặc tắt được, và
-- KHÔNG đi qua hệ đa ngữ của giao diện.
--
-- 1) "Tiếp nhận lead" — spec §7.4: lead mới phải có việc kế tiếp ngay.
--    contact.created → việc gọi trong 2 giờ + thông báo cho người phụ trách.
--
-- 2) "Nhắc follow-up theo SOP 3-5-7" — SOP chăm khách 3-5-7 (nghiên cứu
--    "Chuẩn thế giới cho iFan", mục SCRM/WeiBan): sau tín hiệu mở đầu thì chạm
--    lại vào ngày thứ 3, 5, 7 để khách không bị quên. Chọn trigger deal.created
--    (không phải contact.created) vì: cơ hội mới là "tín hiệu mở đầu" rõ ràng
--    nhất trong đợt 1, deals.owner_id luôn có (không bao giờ thiếu người nhận
--    việc), và contact.created đã có playbook gọi-trong-2-giờ ở trên — dồn cả
--    4 việc vào một khách mới sẽ gây nhiễu.
create or replace function public.wf_seed_playbooks(p_tenant uuid) returns void
language plpgsql
security definer set search_path = public as $$
begin
  if p_tenant is null then
    return;
  end if;

  insert into public.workflows
    (tenant_id, key, name, description, trigger_event, conditions, actions, is_system)
  values
    (p_tenant, 'lead_intake',
     'Tiếp nhận lead',
     'Có khách mới thì tạo ngay việc gọi trong 2 giờ và báo cho người phụ trách.',
     'contact.created',
     '{}'::jsonb,
     jsonb_build_array(
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Gọi khách mới trong 2 giờ',
         'body', 'Khách {{aggregate.full_name}} vừa được thêm vào hệ thống.',
         'due_in', '2 hours',
         'assign_to', 'owner'),
       jsonb_build_object(
         'type', 'notify',
         'title', 'Khách mới cần gọi',
         'body', '{{aggregate.full_name}} vừa vào hệ thống — gọi trong 2 giờ.',
         'link', '/app/contacts/{{aggregate.id}}',
         'to', 'owner')),
     true),
    (p_tenant, 'followup_357',
     'Nhắc follow-up theo SOP 3-5-7',
     'Cơ hội mới sẽ có 3 việc chăm sóc vào ngày thứ 3, 5 và 7 để khách không bị quên.',
     'deal.created',
     '{}'::jsonb,
     jsonb_build_array(
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Chăm sóc lần 1 — ngày thứ 3',
         'body', 'SOP 3-5-7: chạm lại cơ hội {{aggregate.title}} lần đầu.',
         'due_in', '3 days',
         'assign_to', 'owner'),
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Chăm sóc lần 2 — ngày thứ 5',
         'body', 'SOP 3-5-7: chạm lại cơ hội {{aggregate.title}} lần hai.',
         'due_in', '5 days',
         'assign_to', 'owner'),
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Chăm sóc lần 3 — ngày thứ 7',
         'body', 'SOP 3-5-7: chạm lại cơ hội {{aggregate.title}} lần ba.',
         'due_in', '7 days',
         'assign_to', 'owner')),
     true)
  on conflict (tenant_id, key) where key is not null do nothing;
end $$;

-- Gọi khi mở màn Cài đặt → Quy trình (tenant cũ có sẵn playbook mà không cần backfill),
-- theo đúng mẫu ensure_deal_defaults() của migration #13.
create or replace function public.ensure_workflow_playbooks() returns void
language plpgsql
security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then
    raise exception 'no_tenant_context';
  end if;
  -- Hai tab mở cùng lúc không được seed 2 lần
  perform pg_advisory_xact_lock(hashtext('ensure_workflow_playbooks:' || v_tenant::text));
  perform public.wf_seed_playbooks(v_tenant);
end $$;

revoke execute on function public.wf_seed_playbooks from public, anon, authenticated;
revoke execute on function public.ensure_workflow_playbooks from public, anon;
grant execute on function public.ensure_workflow_playbooks to authenticated;

-- ---------- create_tenant: tenant mới có playbook ngay ----------
-- Giữ nguyên phần thân đang chạy (migration #13), chỉ thêm 1 dòng seed playbook.
create or replace function public.create_tenant(p_name text, p_slug text) returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_pipeline uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.tenants (name, slug, trial_ends_at)
    values (p_name, lower(p_slug), now() + interval '30 days')
    returning id into v_tenant;
  insert into public.tenant_members (tenant_id, user_id, role, joined_at)
    values (v_tenant, auth.uid(), 'owner', now());

  -- Seed pipeline mặc định "Bán hàng" + 6 stage (win_probability mặc định, chỉnh được)
  insert into public.pipelines (tenant_id, name, is_default, position)
    values (v_tenant, 'Bán hàng', true, 0)
    returning id into v_pipeline;
  insert into public.pipeline_stages (tenant_id, pipeline_id, name, position, kind, win_probability) values
    (v_tenant, v_pipeline, 'Mới',         0, 'open', 10),
    (v_tenant, v_pipeline, 'Đang tư vấn', 1, 'open', 30),
    (v_tenant, v_pipeline, 'Hẹn lịch',    2, 'open', 60),
    (v_tenant, v_pipeline, 'Đã chốt',     3, 'won', 100),
    (v_tenant, v_pipeline, 'Quay lại',    4, 'open', 20),
    (v_tenant, v_pipeline, 'Thua',        5, 'lost', 0);

  -- Seed 5 lý do thua mặc định (dữ liệu tenant — tiếng Việt theo thiết kế, xem đầu file)
  insert into public.lost_reasons (tenant_id, name, position) values
    (v_tenant, 'Giá cao',             0),
    (v_tenant, 'Chọn đối thủ',        1),
    (v_tenant, 'Không còn nhu cầu',   2),
    (v_tenant, 'Không liên lạc được', 3),
    (v_tenant, 'Khác',                4);

  -- Seed 4 nguồn khách mặc định
  insert into public.lead_sources (tenant_id, name, channel_type, is_system) values
    (v_tenant, 'Zalo',       'zalo',     true),
    (v_tenant, 'Facebook',   'facebook', true),
    (v_tenant, 'Giới thiệu', 'referral', true),
    (v_tenant, 'Khác',       'other',    true);

  -- Seed 2 playbook cài sẵn (migration #15)
  perform public.wf_seed_playbooks(v_tenant);

  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid(), 'platform');
  return v_tenant;
end $$;

grant execute on function public.create_tenant to authenticated;
revoke execute on function public.create_tenant from anon, public;
