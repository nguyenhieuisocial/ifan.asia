-- ============================================================
-- iFan.asia — Migration #32: dọn nhóm lỗi "khó hiểu"
--
-- Ba việc, không đụng bảng nào ngoài `notifications` (chỉ THÊM cột, nullable):
--
-- A. `slug_available()` — onboarding hỏi ngay "địa chỉ này còn trống không?".
--    Trước đây chủ tiệm gõ xong, bấm gửi, rồi mới bị đá về kèm lỗi trùng.
--    Phải là hàm definer: người mới đăng ký chưa thuộc tenant nào nên RLS
--    `tenants` không cho họ đọc hàng nào để tự so.
--
-- B. Thông báo có TÊN KHÁCH + dịch được.
--    Trước: "Vi phạm cam kết: Hội thoại khách chưa được trả lời — đã 3 ngày"
--    → không biết khách nào, và luôn tiếng Việt kể cả khi đang dùng bản tiếng Anh.
--    Cách làm: thêm `title_key`/`body_key`/`params` — nơi ghi đặt KHÓA + tham số,
--    giao diện dịch lúc hiển thị. Cột `title`/`body` cũ VẪN được ghi (tiếng Việt)
--    làm bản dự phòng: thông báo cũ và các nguồn ghi chưa chuyển đổi hiện y như trước.
--    Đợt này chuyển `sla_fire` (nguồn ghi nhiều nhất). Các nguồn còn lại
--    (handoff #24, gói cước #27, biểu mẫu/phê duyệt #29) giữ nguyên — thuộc vùng
--    của trợ lý khác, đã báo cáo lại để xử lý riêng.
--    KHÔNG chuyển hành động `notify` của Workflow (#15): nội dung ở đó do chính
--    chủ tiệm soạn trong màn Quy trình — dữ liệu người dùng thì KHÔNG được dịch.
--
-- C. Playbook cài sẵn nói tiếng Việt trọn vẹn ("Tiếp nhận lead" → "Tiếp nhận
--    khách mới", "Nhắc follow-up theo SOP 3-5-7" → "Nhắc chăm sóc lại theo lịch
--    3-5-7"). Chủ tiệm Việt không đọc được "lead", "follow-up", "SOP".
--    Backfill CHỈ chạm hàng còn nguyên tên seed cũ — ai đã tự đổi tên thì giữ
--    nguyên, vì đó là dữ liệu của họ.
--
-- KHÔNG đụng `process_sla_timers` (trợ lý khác đang sửa lỗ hội thoại "Chờ").
-- ============================================================

-- ------------------------------------------------------------------
-- A. Địa chỉ rút gọn còn trống không?
-- ------------------------------------------------------------------
-- Chỉ trả 4 nhãn cố định: không lộ tên tiệm nào của người khác.
create or replace function public.slug_available(p_slug text) returns text
language plpgsql
security definer set search_path = public as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  -- Cùng luật với ràng buộc ở `createWorkspace` (3–30 ký tự, không gạch ở hai đầu)
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' then
    return 'invalid';
  end if;
  if exists (select 1 from public.reserved_slugs where slug = v_slug) then
    return 'reserved';
  end if;
  if exists (select 1 from public.tenants where slug = v_slug) then
    return 'taken';
  end if;
  return 'ok';
end $$;

grant execute on function public.slug_available(text) to authenticated;
revoke execute on function public.slug_available(text) from anon, public;

-- ------------------------------------------------------------------
-- B1. Thông báo: khóa dịch + tham số (bổ sung, không phá cái cũ)
-- ------------------------------------------------------------------
alter table public.notifications
  add column if not exists title_key text,
  add column if not exists body_key  text,
  add column if not exists params    jsonb not null default '{}'::jsonb;

comment on column public.notifications.title_key is
  'Khóa dịch tiêu đề trong messages/*.json (namespace notifications.messages). Rỗng → dùng cột title.';
comment on column public.notifications.body_key is
  'Khóa dịch nội dung. Rỗng → dùng cột body.';
comment on column public.notifications.params is
  'Tham số chèn vào chuỗi dịch (tên khách, tên cam kết, số phút…). Giá trị do người dùng đặt (tên khách, tiêu đề cơ hội) KHÔNG bao giờ được dịch.';

-- ------------------------------------------------------------------
-- B2. sla_fire — thêm TÊN KHÁCH + khóa dịch
-- ------------------------------------------------------------------
-- Giữ nguyên toàn bộ phần thân đang chạy của #17 (chặn trùng mốc bằng
-- `sla_events`, chọn người nhận, phát domain event). Chỉ thêm: tra tên khách và
-- ghi kèm khóa dịch + tham số vào thông báo.
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
  v_title_key text;
  v_body_key text;
  v_customer text := '';
  v_subject text := '';
  v_label text;
  v_minutes int;
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

  -- TÊN KHÁCH: người nhận phải biết cảnh báo này về AI, không thì phải tự dò.
  -- Hàm chạy quyền definer nên đọc được tên; người nhận là người phụ trách hoặc
  -- cấp trên leo thang — cả hai đều đã có quyền xem hồ sơ khách đó.
  if p_target_type = 'conversation' then
    select coalesce(ct.full_name, '')
      into v_customer
      from public.conversations cv
      left join public.contacts ct on ct.id = cv.contact_id
      where cv.id = p_target_id;
  elsif p_target_type = 'deal' then
    select coalesce(ct.full_name, ''), coalesce(d.title, '')
      into v_customer, v_subject
      from public.deals d
      left join public.contacts ct on ct.id = d.contact_id
      where d.id = p_target_id;
  end if;
  v_customer := coalesce(v_customer, '');
  v_subject  := coalesce(v_subject, '');
  -- Nhãn dự phòng tiếng Việt. Hội thoại chưa định danh thì KHÔNG in mã nội bộ
  -- (kiểu `demo-zl-007`) — với chủ tiệm đó là chuỗi vô nghĩa.
  v_label := case
    when v_subject <> '' and v_customer <> '' then v_subject || ' — ' || v_customer
    when v_subject <> '' then v_subject
    when v_customer <> '' then v_customer
    else 'khách chưa lưu tên'
  end;

  if p_level = 'window_warning' then
    -- Cửa sổ Zalo 48h tính từ tin cuối của khách
    v_left := greatest(48 * 60 - greatest(p_elapsed, 0), 0);
    v_minutes := v_left;
    v_title_key := 'sla.window.title';
    v_body_key := 'sla.window.body';
    v_title := 'Sắp hết cửa sổ trả lời 48 giờ: ' || v_label;
    v_body := 'Còn khoảng ' || public.sla_minutes_vn(v_left)
      || ' để nhắn miễn phí cho khách. Hết cửa sổ phải dùng ZNS (tốn phí).';
  elsif p_level = 'breached' then
    v_minutes := greatest(p_elapsed, 0);
    v_title_key := 'sla.breached.title';
    v_body_key := 'sla.breached.body';
    v_title := 'Vi phạm cam kết: ' || v_label;
    v_body := p_policy_name || ' — đã ' || public.sla_minutes_vn(v_minutes)
      || ' chưa xử lý, việc này đã được báo lên quản lý.';
  else
    v_minutes := greatest(p_elapsed, 0);
    v_title_key := 'sla.warning.title';
    v_body_key := 'sla.warning.body';
    v_title := 'Sắp trễ hẹn: ' || v_label;
    v_body := p_policy_name || ' — đã ' || public.sla_minutes_vn(v_minutes)
      || ' chưa xử lý. Làm ngay để không vi phạm cam kết.';
  end if;

  insert into public.notifications
    (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
  values
    (p_tenant, v_user, 'sla', left(v_title, 200), v_body, p_link,
     v_title_key, v_body_key,
     jsonb_build_object(
       'customer', v_customer,
       'subject', v_subject,
       'policy', p_policy_name,
       'minutes', v_minutes));
  return true;
end $$;

-- `create or replace` giữ nguyên quyền cũ; nhắc lại cho rõ (chuẩn #15/#17/#20).
revoke execute on function public.sla_fire from public, anon, authenticated;

-- ------------------------------------------------------------------
-- C. Playbook cài sẵn: bỏ chữ Anh lẫn trong bản tiếng Việt
-- ------------------------------------------------------------------
-- Giữ nguyên cấu trúc của #15 (cùng `key`, cùng trigger, cùng hành động, cùng
-- `on conflict do nothing`); chỉ đổi CÂU CHỮ hiển thị cho chủ tiệm.
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
     'Tiếp nhận khách mới',
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
     'Nhắc chăm sóc lại theo lịch 3-5-7',
     'Cơ hội mới sẽ có 3 việc chăm sóc vào ngày thứ 3, 5 và 7 để khách không bị quên.',
     'deal.created',
     '{}'::jsonb,
     jsonb_build_array(
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Chăm sóc lần 1 — ngày thứ 3',
         'body', 'Lịch chăm sóc 3-5-7: chạm lại cơ hội {{aggregate.title}} lần đầu.',
         'due_in', '3 days',
         'assign_to', 'owner'),
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Chăm sóc lần 2 — ngày thứ 5',
         'body', 'Lịch chăm sóc 3-5-7: chạm lại cơ hội {{aggregate.title}} lần hai.',
         'due_in', '5 days',
         'assign_to', 'owner'),
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Chăm sóc lần 3 — ngày thứ 7',
         'body', 'Lịch chăm sóc 3-5-7: chạm lại cơ hội {{aggregate.title}} lần ba.',
         'due_in', '7 days',
         'assign_to', 'owner')),
     true)
  on conflict (tenant_id, key) where key is not null do nothing;
end $$;

-- Tiệm đã tạo trước migration này: đổi tên CHỈ khi tên còn đúng y chuỗi seed cũ.
-- Ai đã tự đặt tên khác → đó là dữ liệu của họ, không được đụng vào.
update public.workflows
   set name = 'Tiếp nhận khách mới'
 where key = 'lead_intake' and is_system and name = 'Tiếp nhận lead';

update public.workflows
   set name = 'Nhắc chăm sóc lại theo lịch 3-5-7'
 where key = 'followup_357' and is_system and name = 'Nhắc follow-up theo SOP 3-5-7';

update public.workflows
   set actions = replace(actions::text, 'SOP 3-5-7:', 'Lịch chăm sóc 3-5-7:')::jsonb
 where key = 'followup_357' and is_system and actions::text like '%SOP 3-5-7:%';
