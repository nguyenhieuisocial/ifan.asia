-- ============================================================
-- #29 — FORM ĐỘNG + PHÊ DUYỆT 1–2 CẤP (Workflow đợt 1, phần còn lại)
-- ============================================================
-- Bổ sung 2 mảnh cuối của "Workflow đợt 1 (lõi)" trong Quy hoạch tổng thể
-- (GIAI ĐOẠN 2): FORM ĐỘNG và PHÊ DUYỆT 1–2 CẤP. Engine chạy (retry /
-- dead-letter / loop guard) và 2 playbook cài sẵn đã có ở migration #15 —
-- file này TÁI SỬ DỤNG engine đó, KHÔNG dựng engine thứ hai.
--
-- A) FORM ĐỘNG
--    wf_forms                 định nghĩa biểu mẫu (mảng ô nhập trong cột `fields`)
--    wf_form_submissions      dữ liệu người dùng đã nộp + BẢN CHỤP cấu hình lúc nộp
--    wf_form_fields_valid()   CHECK constraint: cấu hình biểu mẫu phải sạch
--    wf_validate_form_data()  kiểm dữ liệu nộp theo đúng kiểu + ô bắt buộc
--    wf_submit_form()         RPC nộp phiếu (đường ghi DUY NHẤT của client)
--
-- B) PHÊ DUYỆT 1–2 CẤP
--    wf_approval_requests     1 dòng = 1 CẤP duyệt (cấp 2 chỉ sinh khi cấp 1 xong)
--    wf_approval_assignees    ai được giao duyệt + quyết định + mốc thời gian
--    wf_start_approval()      tạo phiếu 1 cấp + giao người + BẮN THÔNG BÁO
--    wf_decide_approval()     RPC quyết định (idempotent, chỉ người được giao)
--
-- C) NỐI VÀO ENGINE — DỪNG CHỜ DUYỆT RỒI CHẠY TIẾP
--    workflow_runs thêm cột `step_index` (con trỏ: đã chạy xong bao nhiêu hành
--    động) và 2 trạng thái mới: 'waiting' (đang chờ người duyệt) + 'rejected'
--    (bị từ chối, dừng hẳn). execute_workflow_run() chạy từ con trỏ; gặp hành
--    động {"type":"approval"} thì tạo phiếu, ghi con trỏ, chuyển 'waiting' rồi
--    TRẢ QUYỀN ĐIỀU KHIỂN. Worker nền process_workflow_events() KHÔNG đụng run
--    'waiting' (điều kiện quét của nó chỉ có pending/failed/running) nên run
--    đứng yên bao lâu cũng được — không cần sửa worker.
--    Duyệt xong: wf_decide_approval() đẩy con trỏ +1, đưa run về 'pending' rồi
--    gọi thẳng execute_workflow_run() để chạy tiếp NGAY (người bấm Duyệt thấy
--    kết quả liền, không phải đợi nhịp cron 1 phút).
--
-- KHÔNG PHÁT EVENT MỚI: docs/EVENT_CATALOG.md chưa khai báo `form.submitted`
-- hay `workflow.approval.*`; theo quy ước "thêm dòng vào catalog TRƯỚC khi code
-- phát nó", migration này không phát event nào. Phiếu duyệt sinh từ biểu mẫu
-- đi thẳng (run_id null) — spec §5.4 đã dự trù trường hợp "phê duyệt độc lập".

-- ============================================================
-- PHẦN A — FORM ĐỘNG
-- ============================================================

-- Nhãn/mô tả do người dùng gõ: chặn ký tự mở thẻ để cấu hình biểu mẫu không
-- bao giờ trở thành nơi nhét mã. (Giao diện React vẫn escape — đây là lưới thứ hai.)
create or replace function public.wf_safe_label(p_text text, p_max int)
returns boolean
language sql immutable set search_path = public as $$
  select p_text is not null
     and length(p_text) between 1 and p_max
     and p_text !~ '[<>]'
$$;

-- Cấu hình biểu mẫu hợp lệ? Dùng làm CHECK constraint nên phải IMMUTABLE.
-- Hình dạng: mảng các ô nhập, mỗi ô
--   {"key":"giam_gia","label":"% giảm","type":"number","required":true,
--    "help":"...","options":["A","B"]}
-- 7 kiểu ô của đợt 1: chữ ngắn, chữ dài, số, ngày, chọn một, chọn nhiều, có/không.
create or replace function public.wf_form_fields_valid(p_fields jsonb)
returns boolean
language plpgsql immutable set search_path = public as $$
declare
  f jsonb;
  k text;
  o jsonb;
  n int;
  v_key text;
  v_type text;
  v_keys text[] := array[]::text[];
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_fields) > 30 then
    return false;
  end if;

  for f in select value from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(f) <> 'object' then
      return false;
    end if;
    -- chỉ chấp nhận đúng 6 khóa đã biết — khóa lạ = từ chối cả biểu mẫu
    for k in select key from jsonb_each(f) loop
      if k not in ('key', 'label', 'type', 'required', 'help', 'options') then
        return false;
      end if;
    end loop;

    v_key := f ->> 'key';
    if v_key is null or v_key !~ '^[a-z][a-z0-9_]{0,31}$' then
      return false;
    end if;
    if v_key = any(v_keys) then
      return false;                       -- trùng mã ô → dữ liệu nộp sẽ đè nhau
    end if;
    v_keys := v_keys || v_key;

    v_type := f ->> 'type';
    if v_type is null or v_type not in
       ('text', 'textarea', 'number', 'date', 'select', 'multiselect', 'boolean') then
      return false;
    end if;
    if not public.wf_safe_label(f ->> 'label', 120) then
      return false;
    end if;
    if f ? 'help' and jsonb_typeof(f -> 'help') <> 'null'
       and not public.wf_safe_label(f ->> 'help', 300) then
      return false;
    end if;
    if f ? 'required' and jsonb_typeof(f -> 'required') not in ('boolean', 'null') then
      return false;
    end if;

    if v_type in ('select', 'multiselect') then
      o := f -> 'options';
      if o is null or jsonb_typeof(o) <> 'array' then
        return false;
      end if;
      n := jsonb_array_length(o);
      if n < 1 or n > 30 then
        return false;
      end if;
      if exists (
        select 1 from jsonb_array_elements(o) x
        where jsonb_typeof(x.value) <> 'string'
           or not public.wf_safe_label(x.value #>> '{}', 80)
      ) then
        return false;
      end if;
      if (select count(distinct x.value) from jsonb_array_elements(o) x) <> n then
        return false;
      end if;
    elsif f ? 'options' and jsonb_typeof(f -> 'options') = 'array'
          and jsonb_array_length(f -> 'options') > 0 then
      return false;                       -- kiểu không phải chọn thì không được có lựa chọn
    end if;
  end loop;
  return true;
end $$;

-- Chuỗi cấp duyệt hợp lệ? Đợt 1 tối đa 2 cấp; mỗi cấp chỉ định "ai duyệt":
--   {"to":"role:owner"} | {"to":"role:admin"} | {"to":"<uuid nhân sự>"}
create or replace function public.wf_approval_levels_valid(p_levels jsonb)
returns boolean
language plpgsql immutable set search_path = public as $$
declare l jsonb; k text; v_to text;
begin
  if p_levels is null or jsonb_typeof(p_levels) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_levels) > 2 then
    return false;
  end if;
  for l in select value from jsonb_array_elements(p_levels) loop
    if jsonb_typeof(l) <> 'object' then
      return false;
    end if;
    for k in select key from jsonb_each(l) loop
      if k <> 'to' then
        return false;
      end if;
    end loop;
    v_to := l ->> 'to';
    if v_to is null or v_to !~
       '^(role:(owner|admin|staff)|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$' then
      return false;
    end if;
  end loop;
  return true;
end $$;

create table public.wf_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  -- tăng mỗi lần xuất bản; bản chụp trên phiếu đã nộp giữ đúng cấu hình lúc đó
  version int not null default 1,
  fields jsonb not null default '[]'::jsonb,
  -- [] = biểu mẫu chỉ thu thập thông tin, không cần ai duyệt
  approval_levels jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_forms_fields_ok check (public.wf_form_fields_valid(fields)),
  constraint wf_forms_levels_ok check (public.wf_approval_levels_valid(approval_levels))
);
create index wf_forms_tenant_idx on public.wf_forms (tenant_id, created_at desc);
create trigger wf_forms_touch before update on public.wf_forms
  for each row execute function public.touch_updated_at();

create table public.wf_form_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  form_id uuid not null references public.wf_forms(id) on delete cascade,
  form_version int not null default 1,
  -- BẢN CHỤP cấu hình ô nhập lúc nộp: sửa biểu mẫu về sau không làm méo phiếu cũ
  -- (đơn giản hơn bảng version riêng mà vẫn đạt đúng mục tiêu đó — xem báo cáo)
  fields_snapshot jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  submitted_by uuid,
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now()
);
create index wf_form_submissions_form_idx
  on public.wf_form_submissions (tenant_id, form_id, created_at desc);
create index wf_form_submissions_mine_idx
  on public.wf_form_submissions (tenant_id, submitted_by, created_at desc);

-- Kiểm dữ liệu nộp theo cấu hình ô nhập. Trả null = hợp lệ, ngược lại là MÃ lỗi
-- ('required:<ô>' | 'type:<ô>' | 'option:<ô>' | 'unknown:<ô>' | 'too_long:<ô>')
-- để giao diện dịch sang câu tiếng Việt. STABLE (có ép kiểu ngày phụ thuộc DateStyle).
create or replace function public.wf_validate_form_data(p_fields jsonb, p_data jsonb)
returns text
language plpgsql stable set search_path = public as $$
declare
  f jsonb;
  k text;
  v jsonb;
  v_key text;
  v_type text;
  v_req boolean;
  v_empty boolean;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return 'bad_data';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    return 'bad_fields';
  end if;

  -- ô lạ (không có trong biểu mẫu) → chặn, không cho nhét dữ liệu ngoài luồng
  for k in select key from jsonb_each(p_data) loop
    if not exists (
      select 1 from jsonb_array_elements(p_fields) x where x.value ->> 'key' = k
    ) then
      return 'unknown:' || left(k, 40);
    end if;
  end loop;

  for f in select value from jsonb_array_elements(p_fields) loop
    v_key := f ->> 'key';
    v_type := f ->> 'type';
    v_req := coalesce((f ->> 'required')::boolean, false);
    v := p_data -> v_key;
    v_empty := v is null
            or jsonb_typeof(v) = 'null'
            or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
            or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0);

    if v_empty then
      if v_req then
        return 'required:' || v_key;
      end if;
      continue;
    end if;

    if v_type in ('text', 'textarea') then
      if jsonb_typeof(v) <> 'string' then
        return 'type:' || v_key;
      end if;
      if length(v #>> '{}') > (case when v_type = 'textarea' then 4000 else 500 end) then
        return 'too_long:' || v_key;
      end if;

    elsif v_type = 'number' then
      if jsonb_typeof(v) <> 'number' then
        return 'type:' || v_key;
      end if;

    elsif v_type = 'boolean' then
      if jsonb_typeof(v) <> 'boolean' then
        return 'type:' || v_key;
      end if;

    elsif v_type = 'date' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        return 'type:' || v_key;
      end if;
      begin
        perform (v #>> '{}')::date;
      exception when others then
        return 'type:' || v_key;
      end;

    elsif v_type = 'select' then
      if jsonb_typeof(v) <> 'string' then
        return 'type:' || v_key;
      end if;
      if not exists (
        select 1 from jsonb_array_elements(f -> 'options') o
        where o.value #>> '{}' = v #>> '{}'
      ) then
        return 'option:' || v_key;
      end if;

    elsif v_type = 'multiselect' then
      if jsonb_typeof(v) <> 'array' then
        return 'type:' || v_key;
      end if;
      if jsonb_array_length(v) > 30 then
        return 'too_long:' || v_key;
      end if;
      if exists (
        select 1 from jsonb_array_elements(v) x
        where jsonb_typeof(x.value) <> 'string'
           or not exists (
             select 1 from jsonb_array_elements(f -> 'options') o
             where o.value #>> '{}' = x.value #>> '{}')
      ) then
        return 'option:' || v_key;
      end if;

    else
      return 'type:' || v_key;
    end if;
  end loop;
  return null;
end $$;

-- Lưới cuối cho phiếu đã nộp: dù ghi bằng đường nào (RPC, service role, SQL tay)
-- thì bản chụp cấu hình vẫn được điền và dữ liệu vẫn bị soi đúng kiểu.
create or replace function public.wf_form_submissions_guard() returns trigger
language plpgsql
security definer set search_path = public as $$
declare v_form public.wf_forms%rowtype; v_err text;
begin
  select * into v_form from public.wf_forms where id = new.form_id;
  if not found or v_form.tenant_id <> new.tenant_id then
    raise exception 'wf_form_not_found';
  end if;
  if new.fields_snapshot is null
     or jsonb_array_length(coalesce(new.fields_snapshot, '[]'::jsonb)) = 0 then
    new.fields_snapshot := v_form.fields;
    new.form_version := v_form.version;
  end if;
  v_err := public.wf_validate_form_data(new.fields_snapshot, new.data);
  if v_err is not null then
    raise exception 'wf_form_invalid: %', v_err;
  end if;
  return new;
end $$;

create trigger wf_form_submissions_guard
  before insert or update on public.wf_form_submissions
  for each row execute function public.wf_form_submissions_guard();

-- ============================================================
-- PHẦN B — PHÊ DUYỆT 1–2 CẤP
-- ============================================================
-- 1 DÒNG = 1 CẤP. Cấp 2 CHỈ được sinh khi cấp 1 đã 'approved' → "cấp 1 duyệt
-- chưa đủ" là hệ quả tự nhiên của mô hình, không phải một nhánh if trong code.
create table public.wf_approval_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- null = phiếu độc lập (nộp từ biểu mẫu); có giá trị = một bước của run
  run_id uuid references public.workflow_runs(id) on delete cascade,
  submission_id uuid references public.wf_form_submissions(id) on delete set null,
  -- vị trí hành động approval trong workflows.actions → biết chạy tiếp từ đâu
  step_index int not null default 0,
  level int not null default 1,
  total_levels int not null default 1,
  -- bản chụp cấu hình các cấp: sửa quy trình giữa chừng không đổi phiếu đang chạy
  levels_config jsonb not null default '[]'::jsonb,
  title text not null,
  body text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  constraint wf_approval_requests_level_ok check (level >= 1 and level <= total_levels),
  constraint wf_approval_requests_total_ok check (total_levels between 1 and 2)
);
create index wf_approval_requests_tenant_idx
  on public.wf_approval_requests (tenant_id, status, created_at desc);
-- một run chỉ chờ ĐÚNG MỘT phiếu tại một thời điểm
create unique index wf_approval_requests_run_pending_uniq
  on public.wf_approval_requests (run_id) where run_id is not null and status = 'pending';
-- worker chạy lại cùng một bước → không sinh phiếu trùng
create unique index wf_approval_requests_run_step_uniq
  on public.wf_approval_requests (run_id, step_index, level) where run_id is not null;

create table public.wf_approval_assignees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.wf_approval_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (request_id, user_id)
);
create index wf_approval_assignees_inbox_idx
  on public.wf_approval_assignees (tenant_id, user_id, decision);

-- ---------- RLS ----------
alter table public.wf_forms enable row level security;
alter table public.wf_form_submissions enable row level security;
alter table public.wf_approval_requests enable row level security;
alter table public.wf_approval_assignees enable row level security;

-- Biểu mẫu: cả nhà đọc (để điền), chỉ chủ/quản trị dựng — khớp mẫu workflows #15
create policy wf_forms_select on public.wf_forms for select
  using (tenant_id = (select public.current_tenant_id()));
create policy wf_forms_manage on public.wf_forms for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin'));

-- Phiếu đã nộp / phiếu duyệt: CHỈ ĐỌC với client.
-- Mọi thao tác ghi đi qua RPC security definer (wf_submit_form, wf_decide_approval)
-- → không ai "duyệt hộ" bằng UPDATE thẳng qua API được.
create policy wf_form_submissions_select on public.wf_form_submissions for select
  using (tenant_id = (select public.current_tenant_id()));
create policy wf_approval_requests_select on public.wf_approval_requests for select
  using (tenant_id = (select public.current_tenant_id()));
create policy wf_approval_assignees_select on public.wf_approval_assignees for select
  using (tenant_id = (select public.current_tenant_id()));

-- ---------- Ai là người duyệt ----------
-- 'role:owner' | 'role:admin' | 'role:staff' → mọi thành viên đang hoạt động
-- '<uuid>' → đúng người đó (phải còn là thành viên hoạt động)
-- Không ai khớp → lùi về chủ tài khoản, để phiếu không rơi vào hư không.
create or replace function public.wf_resolve_approvers(
  p_tenant uuid, p_spec text, p_agg jsonb
) returns uuid[]
language plpgsql stable
security definer set search_path = public as $$
declare v_ids uuid[]; v_role text; v_one uuid;
begin
  if p_spec like 'role:%' then
    v_role := substring(p_spec from 6);
    select array_agg(distinct m.user_id) into v_ids
      from public.tenant_members m
      where m.tenant_id = p_tenant and m.role::text = v_role and m.status = 'active';
  else
    v_one := public.wf_resolve_user(p_tenant, p_spec, coalesce(p_agg, '{}'::jsonb));
    select array_agg(m.user_id) into v_ids
      from public.tenant_members m
      where m.tenant_id = p_tenant and m.user_id = v_one and m.status = 'active';
  end if;

  if v_ids is null or array_length(v_ids, 1) is null then
    select array_agg(m.user_id) into v_ids
      from public.tenant_members m
      where m.tenant_id = p_tenant and m.role = 'owner' and m.status = 'active';
  end if;
  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'wf_no_approver';
  end if;
  return v_ids;
end $$;

-- ---------- Tạo phiếu MỘT cấp + giao người + bắn thông báo ----------
-- Dùng lại hệ thông báo sẵn có (bảng notifications, migration #2) đúng như
-- SLA #17 và bàn giao khách #24 làm — không dựng kênh thông báo mới.
create or replace function public.wf_start_approval(
  p_tenant uuid,
  p_run uuid,
  p_step int,
  p_level int,
  p_levels jsonb,
  p_title text,
  p_body text,
  p_submission uuid
) returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_req uuid;
  v_total int;
  v_spec text;
  v_ids uuid[];
  v_u uuid;
  v_title text;
begin
  v_total := greatest(jsonb_array_length(coalesce(p_levels, '[]'::jsonb)), 1);
  if p_level < 1 or p_level > v_total then
    raise exception 'wf_level_out_of_range';
  end if;
  v_title := left(coalesce(nullif(btrim(p_title), ''), 'Phiếu chờ duyệt'), 200);

  insert into public.wf_approval_requests
    (tenant_id, run_id, submission_id, step_index, level, total_levels,
     levels_config, title, body)
  values
    (p_tenant, p_run, p_submission, coalesce(p_step, 0), p_level, v_total,
     coalesce(p_levels, '[]'::jsonb), v_title, p_body)
  on conflict do nothing
  returning id into v_req;

  -- đã có phiếu đúng cấp đó (worker chạy lại bước cũ) → dùng lại, không tạo trùng
  if v_req is null then
    select id into v_req from public.wf_approval_requests
      where run_id = p_run and step_index = coalesce(p_step, 0) and level = p_level;
    return v_req;
  end if;

  v_spec := coalesce(p_levels -> (p_level - 1) ->> 'to', 'role:owner');
  v_ids := public.wf_resolve_approvers(p_tenant, v_spec, '{}'::jsonb);

  foreach v_u in array v_ids loop
    insert into public.wf_approval_assignees (tenant_id, request_id, user_id)
      values (p_tenant, v_req, v_u)
      on conflict (request_id, user_id) do nothing;
    -- Nội dung thông báo là DỮ LIỆU của tenant → tiếng Việt, cùng quy ước với
    -- tiêu đề việc/thông báo của playbook cài sẵn (#15).
    insert into public.notifications (tenant_id, user_id, type, title, body, link)
      values (p_tenant, v_u, 'approval', 'Phiếu chờ bạn duyệt', v_title, '/app/approvals');
  end loop;

  return v_req;
end $$;

-- ============================================================
-- PHẦN C — ENGINE: DỪNG CHỜ DUYỆT → CHẠY TIẾP
-- ============================================================
alter table public.workflow_runs
  add column step_index int not null default 0;

alter table public.workflow_runs drop constraint if exists workflow_runs_status_check;
alter table public.workflow_runs add constraint workflow_runs_status_check
  check (status in ('pending', 'running', 'waiting', 'done', 'failed', 'dead', 'rejected'));

comment on column public.workflow_runs.step_index is
  'Con trỏ: số hành động đã chạy xong. Run chờ duyệt giữ con trỏ tại bước approval; duyệt xong đẩy +1 rồi chạy tiếp.';

-- Chạy 1 run TỪ CON TRỎ. Khác #15 ở đúng một điểm: gặp hành động
-- {"type":"approval"} thì tạo phiếu, ghi con trỏ, chuyển 'waiting' và TRẢ QUYỀN
-- ĐIỀU KHIỂN — phần còn lại (retry backoff → dead-letter, loop guard qua
-- ifan.wf_depth) giữ nguyên hành vi cũ.
--
-- Vì sao khối begin/exception vẫn bọc CẢ đoạn: một "đoạn" (giữa 2 lần chờ duyệt)
-- chạy trọn vẹn hoặc cuộn lại sạch. Lượt thử lại vì thế phát lại đúng đoạn đó,
-- không nhân đôi việc/thông báo của đoạn hỏng, và KHÔNG chạm lại các đoạn đã
-- chốt trước đó (con trỏ đã ghi ở lần dừng chờ duyệt gần nhất).
create or replace function public.execute_workflow_run(p_run_id uuid) returns text
language plpgsql
security definer set search_path = public as $$
declare
  r public.workflow_runs%rowtype;
  w public.workflows%rowtype;
  e public.domain_events%rowtype;
  v_event jsonb;
  v_agg jsonb;
  v_actions jsonb;
  v_action jsonb;
  v_total int;
  v_i int;
  v_attempt int;
  v_err text;
  v_status text;
begin
  select * into r from public.workflow_runs where id = p_run_id for update;
  if not found then
    return 'missing';
  end if;
  -- 'waiting' nằm ở đây: run đang chờ người duyệt thì KHÔNG ai chạy tiếp được,
  -- kể cả worker nền hay một lần gọi lặp.
  if r.status in ('done', 'dead', 'rejected', 'waiting') then
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
  v_actions := coalesce(w.actions, '[]'::jsonb);
  v_total := jsonb_array_length(v_actions);
  v_attempt := r.attempts + 1;

  update public.workflow_runs
    set status = 'running', started_at = coalesce(started_at, now())
    where id = r.id;

  begin
    -- Event do hành động dưới đây sinh ra sẽ mang causation_chain = depth + 1
    perform set_config('ifan.wf_depth', (r.depth + 1)::text, true);
    v_i := greatest(r.step_index, 0);
    while v_i < v_total loop
      v_action := v_actions -> v_i;

      if v_action ->> 'type' = 'approval' then
        perform public.wf_start_approval(
          e.tenant_id, r.id, v_i, 1,
          coalesce(v_action -> 'levels', '[{"to":"role:owner"}]'::jsonb),
          public.wf_render(v_action ->> 'title', v_event, v_agg),
          public.wf_render(v_action ->> 'body', v_event, v_agg),
          null);
        perform set_config('ifan.wf_depth', '0', true);
        update public.workflow_runs
          set status = 'waiting', step_index = v_i, attempts = v_attempt, last_error = null
          where id = r.id;
        return 'waiting';
      end if;

      perform public.wf_exec_action(e.tenant_id, v_action, v_event, v_agg);
      v_i := v_i + 1;
    end loop;

    perform set_config('ifan.wf_depth', '0', true);
    update public.workflow_runs
      set status = 'done', step_index = v_total, attempts = v_attempt,
          last_error = null, finished_at = now()
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

-- ---------- Quyết định của người duyệt ----------
-- Trả về MÃ (giao diện tự dịch):
--   'approved'    xong cấp cuối → phiếu duyệt, quy trình chạy tiếp
--   'next_level'  xong cấp 1, đã chuyển lên cấp 2 (chưa đủ để chạy tiếp)
--   'rejected'    từ chối → quy trình dừng hẳn, lý do đã ghi
--   'already_decided' | 'not_allowed' | 'not_found' | 'note_required' | 'bad_decision'
--
-- IDEMPOTENT: cả hai bước ghi đều có điều kiện "còn đang chờ"; bấm 2 lần (hay 2
-- request song song) chỉ 1 lần ăn, lần sau trả 'already_decided'.
-- PHÂN QUYỀN: chỉ người CÓ TÊN trong wf_approval_assignees của ĐÚNG phiếu đó
-- mới ghi được. Client không có policy UPDATE trên 2 bảng phiếu nên không có
-- đường vòng qua API.
create or replace function public.wf_decide_approval(
  p_request uuid, p_decision text, p_note text default null
) returns text
language plpgsql
security definer set search_path = public as $$
declare
  v_req public.wf_approval_requests%rowtype;
  v_a public.wf_approval_assignees%rowtype;
  v_me uuid := auth.uid();
  v_tenant uuid := public.current_tenant_id();
  v_sub public.wf_form_submissions%rowtype;
  v_note text := left(nullif(btrim(p_note), ''), 500);
  v_n int;
begin
  if p_decision not in ('approved', 'rejected') then
    return 'bad_decision';
  end if;
  if v_me is null or v_tenant is null then
    return 'not_allowed';
  end if;

  select * into v_req from public.wf_approval_requests where id = p_request for update;
  if not found then
    return 'not_found';
  end if;
  if v_req.tenant_id <> v_tenant then
    return 'not_allowed';          -- phiếu của tiệm khác
  end if;

  select * into v_a from public.wf_approval_assignees
    where request_id = p_request and user_id = v_me;
  if not found then
    return 'not_allowed';          -- không được giao duyệt phiếu này
  end if;

  if v_req.status <> 'pending' then
    return 'already_decided';
  end if;
  if p_decision = 'rejected' and v_note is null then
    return 'note_required';        -- từ chối BẮT BUỘC kèm lý do
  end if;

  update public.wf_approval_assignees
    set decision = p_decision, decided_at = now(), note = v_note
    where request_id = p_request and user_id = v_me and decision = 'pending';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return 'already_decided';
  end if;

  -- Đợt 1: một người trong cấp quyết định là chốt cấp đó (chế độ "any").
  update public.wf_approval_requests
    set status = p_decision, decided_by = v_me, decided_at = now(), decision_note = v_note
    where id = p_request and status = 'pending';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return 'already_decided';
  end if;

  if v_req.submission_id is not null then
    select * into v_sub from public.wf_form_submissions where id = v_req.submission_id;
  end if;

  -- ---- TỪ CHỐI: dừng hẳn ----
  if p_decision = 'rejected' then
    if v_req.run_id is not null then
      update public.workflow_runs
        set status = 'rejected', finished_at = now()
        where id = v_req.run_id and status = 'waiting';
    end if;
    if v_req.submission_id is not null then
      update public.wf_form_submissions set status = 'rejected'
        where id = v_req.submission_id;
      if v_sub.submitted_by is not null and v_sub.submitted_by <> v_me then
        insert into public.notifications (tenant_id, user_id, type, title, body, link)
          values (v_req.tenant_id, v_sub.submitted_by, 'approval',
                  'Yêu cầu bị từ chối', v_req.title || ' — lý do: ' || coalesce(v_note, ''),
                  '/app/approvals');
      end if;
    end if;
    return 'rejected';
  end if;

  -- ---- DUYỆT: còn cấp nữa thì lên cấp kế, chưa được chạy tiếp ----
  if v_req.level < v_req.total_levels then
    perform public.wf_start_approval(
      v_req.tenant_id, v_req.run_id, v_req.step_index, v_req.level + 1,
      v_req.levels_config, v_req.title, v_req.body, v_req.submission_id);
    return 'next_level';
  end if;

  -- ---- DUYỆT cấp cuối: chốt phiếu + đẩy con trỏ rồi CHẠY TIẾP NGAY ----
  if v_req.submission_id is not null then
    update public.wf_form_submissions set status = 'approved'
      where id = v_req.submission_id;
    if v_sub.submitted_by is not null and v_sub.submitted_by <> v_me then
      insert into public.notifications (tenant_id, user_id, type, title, body, link)
        values (v_req.tenant_id, v_sub.submitted_by, 'approval',
                'Yêu cầu đã được duyệt', v_req.title, '/app/approvals');
    end if;
  end if;

  if v_req.run_id is not null then
    update public.workflow_runs
      set status = 'pending',
          step_index = v_req.step_index + 1,   -- KHÔNG chạy lại bước đã qua
          attempts = 0,                        -- đoạn mới có ngân sách thử lại riêng
          last_error = null,
          next_attempt_at = now()
      where id = v_req.run_id and status = 'waiting';
    get diagnostics v_n = row_count;
    if v_n > 0 then
      perform public.execute_workflow_run(v_req.run_id);
    end if;
  end if;

  return 'approved';
end $$;

-- ---------- Nộp biểu mẫu ----------
-- Đường ghi DUY NHẤT của client vào wf_form_submissions (bảng không có policy
-- INSERT). Kiểm quyền → kiểm dữ liệu → lưu → nếu biểu mẫu có cấu hình duyệt thì
-- mở phiếu cấp 1 và bắn thông báo cho người duyệt.
create or replace function public.wf_submit_form(p_form uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_form public.wf_forms%rowtype;
  v_tenant uuid := public.current_tenant_id();
  v_me uuid := auth.uid();
  v_err text;
  v_sub uuid;
  v_req uuid;
begin
  if v_me is null or v_tenant is null then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_tenant and m.user_id = v_me and m.status = 'active'
  ) then
    return jsonb_build_object('error', 'not_allowed');
  end if;

  select * into v_form from public.wf_forms where id = p_form;
  if not found or v_form.tenant_id <> v_tenant then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_form.status <> 'published' then
    return jsonb_build_object('error', 'not_published');
  end if;

  v_err := public.wf_validate_form_data(v_form.fields, coalesce(p_data, '{}'::jsonb));
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  insert into public.wf_form_submissions
    (tenant_id, form_id, form_version, fields_snapshot, data, submitted_by)
  values
    (v_tenant, v_form.id, v_form.version, v_form.fields,
     coalesce(p_data, '{}'::jsonb), v_me)
  returning id into v_sub;

  if jsonb_array_length(v_form.approval_levels) > 0 then
    v_req := public.wf_start_approval(
      v_tenant, null, 0, 1, v_form.approval_levels,
      v_form.name, null, v_sub);
  end if;

  return jsonb_build_object('submission_id', v_sub, 'request_id', v_req);
end $$;

-- ---------- Quyền gọi hàm ----------
-- Hàm nội bộ của engine: chỉ worker / service role.
revoke execute on function public.wf_resolve_approvers from public, anon, authenticated;
revoke execute on function public.wf_start_approval from public, anon, authenticated;
revoke execute on function public.wf_form_submissions_guard from public, anon, authenticated;
revoke execute on function public.wf_safe_label from public, anon;
revoke execute on function public.wf_form_fields_valid from public, anon;
revoke execute on function public.wf_approval_levels_valid from public, anon;
revoke execute on function public.wf_validate_form_data from public, anon;
-- 2 RPC người dùng gọi trực tiếp (đã tự kiểm quyền bên trong):
grant execute on function public.wf_decide_approval(uuid, text, text) to authenticated;
grant execute on function public.wf_submit_form(uuid, jsonb) to authenticated;
