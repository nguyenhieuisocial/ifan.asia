-- ============================================================
-- iFan.asia — Migration #17: SLA engine + leo thang (GĐ2 — đợt 1)
--
-- Spec: "02 Omnichannel Inbox" §2.4 + §4.4 + worker `sla-monitor`, và
--       "01 CRM và Bán hàng" §V4 ("máy trạng thái ok → warning → breached,
--       cron mỗi phút quét timer, cảnh báo cho người phụ trách, breach thì
--       LEO THANG lên quản lý, phát sự kiện cho Workflow").
--
-- ĐỢT 1 làm gì: đo 2 loại đồng hồ có sẵn dữ liệu thật, phát event, leo thang,
--               không bịa bảng timer riêng. Sửa ngưỡng trên giao diện = đợt 2.
--
-- A) VÌ SAO `sla_events` CHỨ KHÔNG TÁI DÙNG `workflow_runs` (migration #15):
--    workflow_runs là "một EVENT được rẽ nhánh sang một ĐỊNH NGHĨA workflow" —
--    khóa duy nhất của nó là (workflow_id, event_id) và mọi dòng bắt buộc trỏ
--    tới một domain_events có sẵn. SLA đi NGƯỢC chiều: không có event nguồn,
--    chỉ có một MỐC THỜI GIAN của một bản ghi bị vượt qua; event là KẾT QUẢ
--    chứ không phải nguyên nhân. Nhét vào workflow_runs sẽ phải chế workflow
--    giả + event giả, và khóa duy nhất của nó KHÔNG diễn tả được điều kiện
--    chống bắn trùng mà SLA cần ("mỗi chính sách × mục tiêu × mốc × chu kỳ chỉ
--    một lần"). Nên: bảng riêng, và chính khóa duy nhất đó vừa là cơ chế
--    idempotent vừa là nguồn cho bảng "SLA gần đây" của giao diện.
--
-- B) CHỐNG BẮN TRÙNG (idempotent) — bằng CHỈ MỤC DUY NHẤT, không bằng cột cờ:
--    (policy_id, target_type, target_id, level, started_at). `started_at` là
--    MỐC BẮT ĐẦU ĐỒNG HỒ (hội thoại: tin cuối của khách; cơ hội: hạn việc kế
--    tiếp) nên nó cũng là mã CHU KỲ: worker chạy lại 100 lần vẫn 1 dòng, nhưng
--    khách nhắn tin mới / sale dời hạn ⇒ chu kỳ mới ⇒ SLA lên dây lại. Chỉ khi
--    INSERT thật sự ghi được dòng thì mới phát event + tạo thông báo.
--
-- C) CỬA SỔ TRẢ LỜI 48H CỦA ZALO (spec §3 "messaging window là công dân hạng
--    nhất"): hội thoại chưa trả lời trên kênh zalo_oa sắp hết 48h được một mốc
--    RIÊNG, mức khẩn CAO HƠN cảnh báo thường (`window_warning`) và báo THẲNG
--    người leo thang — vì hết cửa sổ là mất tiền thật (phải chuyển sang ZNS
--    trả phí), không chỉ là trễ hẹn.
--
-- D) 2 CHÍNH SÁCH CÀI SẴN cho mọi tenant, theo đúng mẫu wf_seed_playbooks của
--    migration #15: hàm definer gọi on-demand khi mở màn + create_tenant seed
--    cho tenant mới. TÊN CHÍNH SÁCH LÀ DỮ LIỆU CỦA TENANT nên viết tiếng Việt
--    (cùng quy ước lost_reasons / lead_sources / playbook) — người dùng sửa và
--    tắt được, KHÔNG phải chuỗi giao diện đa ngữ.
--
-- Chuẩn: theo migration #4/#5/#13/#15 (text + check, timestamptz, definer set
--        search_path, revoke public trước khi grant đích danh, RLS bật trên mọi
--        bảng có tenant_id).
-- ============================================================

-- ============================================================
-- PHẦN A — BẢNG
-- ============================================================

-- ---------- Chính sách SLA ----------
-- condition: các cặp "trường = giá trị" chấm trên BẢN GHI MỤC TIÊU, chấm bằng
--   CHÍNH public.wf_match_conditions() của Workflow Engine (không đẻ ngôn ngữ
--   biểu thức thứ hai). Trường chấm được đợt 1:
--     hội thoại: status, channel_type, unanswered (bool), assignee_user_id
--     cơ hội   : status, overdue (bool), owner_id
--   Nghĩa là {"status":"open","unanswered":true} được thực thi THẬT, không phải
--   nhãn trang trí.
-- escalate_to: 'owner' (người phụ trách bản ghi) | 'manager' (quản lý trực tiếp,
--   xem sla_resolve_user) | uuid của một người cụ thể.
create table public.sla_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- khóa ổn định của chính sách cài sẵn (null = tenant tự tạo, đợt 2)
  key text,
  name text not null,
  target_type text not null check (target_type in ('conversation','deal')),
  condition jsonb not null default '{}'::jsonb,
  warn_after_minutes int not null check (warn_after_minutes > 0),
  breach_after_minutes int not null check (breach_after_minutes > 0),
  escalate_to text not null default 'manager'
    check (escalate_to in ('owner','manager')
           or escalate_to ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  is_active boolean not null default true,
  is_system boolean not null default false,   -- true = chính sách cài sẵn
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sla_policies_order check (breach_after_minutes > warn_after_minutes)
);
create unique index sla_policies_tenant_key_uniq
  on public.sla_policies (tenant_id, key) where key is not null;
create index sla_policies_active_idx
  on public.sla_policies (tenant_id, target_type) where is_active;

create trigger sla_policies_touch before update on public.sla_policies
  for each row execute function public.touch_updated_at();

-- ---------- Mốc SLA đã bắn ----------
-- level: warning (sắp trễ) | window_warning (sắp hết cửa sổ 48h — khẩn hơn)
--        | breached (đã vi phạm → leo thang)
create table public.sla_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  policy_id uuid not null references public.sla_policies(id) on delete cascade,
  target_type text not null check (target_type in ('conversation','deal')),
  target_id uuid not null,
  level text not null check (level in ('warning','window_warning','breached')),
  -- mốc bắt đầu đồng hồ = mã chu kỳ (xem đầu file, mục B)
  started_at timestamptz not null,
  elapsed_minutes int not null,
  notified_user_id uuid,
  created_at timestamptz not null default now()
);
-- CƠ CHẾ IDEMPOTENT: một chính sách × một mục tiêu × một mốc × một chu kỳ = 1 dòng
create unique index sla_events_once_uidx
  on public.sla_events (policy_id, target_type, target_id, level, started_at);
create index sla_events_tenant_time_idx
  on public.sla_events (tenant_id, created_at desc);

-- ---------- RLS ----------
alter table public.sla_policies enable row level security;
alter table public.sla_events enable row level security;

create policy sla_policies_select on public.sla_policies for select
  using (tenant_id = (select public.current_tenant_id()));
create policy sla_policies_manage on public.sla_policies for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin'));

create policy sla_events_select on public.sla_events for select
  using (tenant_id = (select public.current_tenant_id()));
-- ghi sla_events: chỉ worker (security definer) hoặc service role

-- ============================================================
-- PHẦN B — NGƯỜI NHẬN CẢNH BÁO
-- ============================================================

-- 'owner'   → người phụ trách bản ghi (p_fallback)
-- 'manager' → quản lý TRỰC TIẾP của người phụ trách (tenant_members.manager_id);
--             không có/không còn hoạt động → người có vai trò manager của tenant,
--             rồi admin
-- <uuid>    → đúng người đó, NHƯNG bắt buộc còn là thành viên hoạt động của
--             tenant (không để thông báo rò ra ngoài tenant)
-- Mọi nhánh không ra ai → lùi về chủ tài khoản; vẫn không có → raise để worker
-- không âm thầm nuốt lỗi.
create or replace function public.sla_resolve_user(
  p_tenant uuid, p_spec text, p_fallback uuid
) returns uuid
language plpgsql stable
security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_spec is null or p_spec = '' or p_spec = 'owner' then
    v_id := p_fallback;
  elsif p_spec = 'manager' then
    select m.manager_id into v_id from public.tenant_members m
      where m.tenant_id = p_tenant and m.user_id = p_fallback;
    if v_id is not null and not exists (
      select 1 from public.tenant_members m2
      where m2.tenant_id = p_tenant and m2.user_id = v_id and m2.status = 'active'
    ) then
      v_id := null;
    end if;
    if v_id is null then
      select m.user_id into v_id from public.tenant_members m
        where m.tenant_id = p_tenant and m.status = 'active'
          and m.role in ('manager','admin')
        order by (m.role = 'manager') desc, m.created_at
        limit 1;
    end if;
  else
    begin
      v_id := p_spec::uuid;
    exception when others then v_id := null; end;
    if v_id is not null and not exists (
      select 1 from public.tenant_members m
      where m.tenant_id = p_tenant and m.user_id = v_id and m.status = 'active'
    ) then
      v_id := null;
    end if;
  end if;

  if v_id is null then
    select m.user_id into v_id from public.tenant_members m
      where m.tenant_id = p_tenant and m.role = 'owner' and m.status = 'active'
      order by m.created_at limit 1;
  end if;
  if v_id is null then
    raise exception 'sla_user_unresolved';
  end if;
  return v_id;
end $$;

-- Số phút → cụm tiếng Việt cho NỘI DUNG THÔNG BÁO (dữ liệu tenant, không đa ngữ)
create or replace function public.sla_minutes_vn(p_minutes int) returns text
language sql immutable set search_path = public as $$
  select case
    when p_minutes < 60   then greatest(p_minutes, 0)::text || ' phút'
    when p_minutes < 1440 then (p_minutes / 60)::text || ' giờ'
    else (p_minutes / 1440)::text || ' ngày'
  end
$$;

-- ============================================================
-- PHẦN C — WORKER
-- ============================================================

-- Ghi MỘT mốc SLA. Trả true nếu đây là lần đầu (đã phát event + tạo thông báo),
-- false nếu mốc này của chu kỳ này đã bắn rồi (chỉ mục duy nhất chặn).
-- Người nhận: 'warning' → người phụ trách; 'window_warning' và 'breached' →
-- người leo thang theo chính sách (mỗi mốc đúng MỘT thông báo).
create or replace function public.sla_fire(
  p_tenant uuid,
  p_policy uuid,
  p_policy_name text,
  p_escalate_to text,
  p_target_type text,
  p_target_id uuid,
  p_level text,
  p_started_at timestamptz,
  p_elapsed int,
  p_owner uuid,
  p_link text
) returns boolean
language plpgsql
security definer set search_path = public as $$
declare
  v_id uuid;
  v_user uuid;
  v_left int;
  v_title text;
  v_body text;
begin
  insert into public.sla_events
    (tenant_id, policy_id, target_type, target_id, level, started_at, elapsed_minutes)
  values
    (p_tenant, p_policy, p_target_type, p_target_id, p_level, p_started_at, greatest(p_elapsed, 0))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return false;
  end if;

  v_user := public.sla_resolve_user(
    p_tenant,
    case when p_level = 'warning' then 'owner' else p_escalate_to end,
    p_owner);
  update public.sla_events set notified_user_id = v_user where id = v_id;

  -- Event cho Workflow Engine (docs/EVENT_CATALOG.md): payload có policy_id +
  -- elapsed đúng hợp đồng catalog, thêm level/urgency để workflow lọc được.
  insert into public.domain_events
    (tenant_id, event_type, aggregate_type, aggregate_id, payload,
     actor_user_id, source_module, causation_chain)
  values
    (p_tenant,
     case when p_level = 'breached' then 'sla.breached' else 'sla.warning' end,
     p_target_type, p_target_id::text,
     jsonb_build_object(
       'policy_id', p_policy,
       'policy_name', p_policy_name,
       'level', p_level,
       'elapsed', greatest(p_elapsed, 0),
       'urgency', case when p_level = 'warning' then 'normal' else 'high' end,
       'escalated_to', v_user,
       'started_at', p_started_at),
     null, 'sla', 0);

  if p_level = 'window_warning' then
    -- Cửa sổ Zalo 48h tính từ tin cuối của khách
    v_left := 48 * 60 - greatest(p_elapsed, 0);
    v_title := 'Sắp hết cửa sổ trả lời 48 giờ';
    v_body := 'Còn khoảng ' || public.sla_minutes_vn(greatest(v_left, 0))
      || ' để nhắn miễn phí cho khách. Hết cửa sổ phải dùng ZNS (tốn phí).';
  elsif p_level = 'breached' then
    v_title := 'Vi phạm cam kết: ' || p_policy_name;
    v_body := 'Đã ' || public.sla_minutes_vn(greatest(p_elapsed, 0))
      || ' chưa xử lý — việc này đã được báo lên quản lý.';
  else
    v_title := 'Sắp trễ hẹn: ' || p_policy_name;
    v_body := 'Đã ' || public.sla_minutes_vn(greatest(p_elapsed, 0))
      || ' chưa xử lý. Làm ngay để không vi phạm cam kết.';
  end if;

  insert into public.notifications (tenant_id, user_id, type, title, body, link)
  values (p_tenant, v_user, 'sla', left(v_title, 200), v_body, p_link);
  return true;
end $$;

-- Quét mọi chính sách đang bật của mọi tenant, bắn các mốc vừa vượt qua.
-- Trả về SỐ MỐC BẮN MỚI (không tính lần quét lại của mốc cũ).
--
-- Chặn quét vô hạn: chỉ nhìn các mục tiêu có mốc bắt đầu trong 30 ngày gần đây —
-- quá 30 ngày thì cảnh báo cũng không còn ý nghĩa vận hành.
create or replace function public.process_sla_timers(p_batch int default 500) returns int
language plpgsql
security definer set search_path = public as $$
declare
  -- Cửa sổ trả lời của Zalo OA: 48 giờ, cảnh báo trước 2 giờ (spec §3)
  c_window_minutes constant int := 48 * 60;
  c_window_lead    constant int := 120;
  p public.sla_policies%rowtype;
  r record;
  v_target jsonb;
  v_fired int := 0;
begin
  for p in
    select * from public.sla_policies where is_active order by tenant_id, created_at
  loop
    if p.target_type = 'conversation' then
      for r in
        select c.id,
               c.status,
               c.assignee_user_id,
               c.last_user_message_at as started_at,
               ch.type as channel_type,
               (floor(extract(epoch from (now() - c.last_user_message_at)) / 60))::int as elapsed
        from public.conversations c
        join public.channels ch on ch.id = c.channel_id
        where c.tenant_id = p.tenant_id
          and c.last_user_message_at is not null
          and c.last_user_message_at > now() - interval '30 days'
          and c.last_user_message_at <= now() - make_interval(mins => p.warn_after_minutes)
          -- "chưa trả lời" = không có tin GỬI ĐI nào sau tin cuối của khách
          and not exists (
            select 1 from public.messages m
            where m.conversation_id = c.id
              and m.direction = 'out'
              and m.sent_at > c.last_user_message_at)
        order by c.last_user_message_at
        limit p_batch
      loop
        v_target := jsonb_build_object(
          'status', r.status,
          'channel_type', r.channel_type,
          'unanswered', true,
          'assignee_user_id', r.assignee_user_id);
        if not public.wf_match_conditions(
             p.condition, jsonb_build_object('payload', v_target), '{}'::jsonb) then
          continue;
        end if;

        if r.elapsed >= p.warn_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'conversation', r.id, 'warning', r.started_at, r.elapsed,
                               r.assignee_user_id, '/app/inbox?c=' || r.id::text) then
          v_fired := v_fired + 1;
        end if;

        if r.elapsed >= p.breach_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'conversation', r.id, 'breached', r.started_at, r.elapsed,
                               r.assignee_user_id, '/app/inbox?c=' || r.id::text) then
          v_fired := v_fired + 1;
        end if;

        -- Mốc riêng, khẩn hơn: sắp hết cửa sổ trả lời 48h của Zalo OA
        if r.channel_type = 'zalo_oa'
           and r.elapsed >= c_window_minutes - c_window_lead
           and r.elapsed < c_window_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'conversation', r.id, 'window_warning', r.started_at, r.elapsed,
                               r.assignee_user_id, '/app/inbox?c=' || r.id::text) then
          v_fired := v_fired + 1;
        end if;
      end loop;

    elsif p.target_type = 'deal' then
      for r in
        select d.id,
               d.status,
               d.owner_id,
               d.next_action_at as started_at,
               (floor(extract(epoch from (now() - d.next_action_at)) / 60))::int as elapsed
        from public.deals d
        where d.tenant_id = p.tenant_id
          and d.deleted_at is null
          and d.next_action_at is not null
          and d.next_action_at > now() - interval '30 days'
          and d.next_action_at <= now() - make_interval(mins => p.warn_after_minutes)
        order by d.next_action_at
        limit p_batch
      loop
        v_target := jsonb_build_object(
          'status', r.status,
          'overdue', true,
          'owner_id', r.owner_id);
        if not public.wf_match_conditions(
             p.condition, jsonb_build_object('payload', v_target), '{}'::jsonb) then
          continue;
        end if;

        -- Chưa có màn chi tiết cơ hội (đợt 1) → link về bảng Cơ hội
        if r.elapsed >= p.warn_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'deal', r.id, 'warning', r.started_at, r.elapsed,
                               r.owner_id, '/app/deals') then
          v_fired := v_fired + 1;
        end if;

        if r.elapsed >= p.breach_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'deal', r.id, 'breached', r.started_at, r.elapsed,
                               r.owner_id, '/app/deals') then
          v_fired := v_fired + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_fired;
end $$;

revoke execute on function public.sla_resolve_user from public, anon, authenticated;
revoke execute on function public.sla_minutes_vn from public, anon;
revoke execute on function public.sla_fire from public, anon, authenticated;
revoke execute on function public.process_sla_timers from public, anon, authenticated;

-- Lịch nền: mỗi phút, cùng nhịp worker Zalo (#5) và Workflow (#15)
select cron.schedule('process-sla-timers', '* * * * *',
                     'select public.process_sla_timers(500)');

-- ============================================================
-- PHẦN D — 2 CHÍNH SÁCH CÀI SẴN
-- ============================================================
-- Tên/nội dung là DỮ LIỆU của tenant nên viết tiếng Việt (xem đầu file, mục D).
--
-- 1) "Hội thoại khách chưa được trả lời" — spec Inbox §2.4: khách nhắn mà không
--    ai trả lời là pain số một. Cảnh báo 30 phút, vi phạm 2 giờ, leo thang lên
--    quản lý. Kênh Zalo còn có mốc cửa sổ 48h riêng (PHẦN C).
--
-- 2) "Cơ hội quá hạn việc kế tiếp" — spec CRM §V4(b): deal nằm im quá hạn việc
--    kế tiếp. Cảnh báo sau 4 giờ quá hạn (VẪN TRONG NGÀY LÀM VIỆC để còn cứu
--    được), vi phạm sau 1 ngày (1440 phút).
create or replace function public.sla_seed_policies(p_tenant uuid) returns void
language plpgsql
security definer set search_path = public as $$
begin
  if p_tenant is null then
    return;
  end if;

  insert into public.sla_policies
    (tenant_id, key, name, target_type, condition,
     warn_after_minutes, breach_after_minutes, escalate_to, is_system)
  values
    (p_tenant, 'conversation_first_reply',
     'Hội thoại khách chưa được trả lời',
     'conversation',
     jsonb_build_object('status', 'open', 'unanswered', true),
     30, 120, 'manager', true),
    (p_tenant, 'deal_next_action_overdue',
     'Cơ hội quá hạn việc kế tiếp',
     'deal',
     jsonb_build_object('status', 'open', 'overdue', true),
     240, 1440, 'manager', true)
  on conflict (tenant_id, key) where key is not null do nothing;
end $$;

-- Gọi khi mở màn Cài đặt → Cam kết phản hồi (tenant tạo trước migration cũng có
-- sẵn chính sách mà không cần backfill), theo mẫu ensure_workflow_playbooks().
create or replace function public.ensure_sla_policies() returns void
language plpgsql
security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then
    raise exception 'no_tenant_context';
  end if;
  -- Hai tab mở cùng lúc không được seed 2 lần
  perform pg_advisory_xact_lock(hashtext('ensure_sla_policies:' || v_tenant::text));
  perform public.sla_seed_policies(v_tenant);
end $$;

revoke execute on function public.sla_seed_policies from public, anon, authenticated;
revoke execute on function public.ensure_sla_policies from public, anon;
grant execute on function public.ensure_sla_policies to authenticated;

-- ---------- create_tenant: tenant mới có chính sách SLA ngay ----------
-- Giữ nguyên phần thân đang chạy (migration #15), chỉ thêm 1 dòng seed SLA.
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
  -- Seed 2 chính sách SLA cài sẵn (migration #17)
  perform public.sla_seed_policies(v_tenant);

  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid(), 'platform');
  return v_tenant;
end $$;

grant execute on function public.create_tenant to authenticated;
revoke execute on function public.create_tenant from anon, public;
