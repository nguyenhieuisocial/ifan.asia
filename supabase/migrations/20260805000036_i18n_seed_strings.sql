-- ============================================================
-- iFan.asia — Migration #36: dịch nốt chữ hệ thống sinh
--
-- Nối tiếp #32 (đã dựng cơ chế `notifications.title_key/body_key/params`:
-- nơi ghi lưu KHÓA + tham số, giao diện dịch lúc hiển thị; hàng cũ không có
-- khóa vẫn hiện đúng chuỗi tiếng Việt đã lưu — không phá dữ liệu cũ).
--
-- PHẦN 1 — chuyển nốt 5 nguồn ghi thông báo còn lại sang khóa + tham số:
--   handoff_conversation (#24) · billing_notify (#27) ·
--   wf_start_approval + wf_decide_approval ×2 (#29)
--   và bổ sung `policy_key` cho sla_fire (#32/#33) để câu cam kết trong
--   thông báo SLA cũng dịch được, không còn nửa Anh nửa Việt.
--   KHÔNG chuyển hành động `notify` của Workflow (#15): nội dung đó do chính
--   chủ tiệm soạn trong màn Quy trình → dữ liệu người dùng, dịch là phá.
--
-- PHẦN 2 — chuỗi seed mặc định (bước bán hàng, lý do thua, nguồn khách, tên
--   cam kết SLA). Đây là DỮ LIỆU trong CSDL của từng tiệm nên không thể dịch
--   bằng cách sửa chuỗi. Cách làm: thêm cột `i18n_key` BÊN CẠNH cột `name`.
--     · Có `i18n_key` → giao diện dịch.
--     · Không có → hiện `name` y như cũ.
--     · Chủ tiệm ĐỔI TÊN → trigger tự xoá `i18n_key` ⇒ tên của họ THẮNG
--       vĩnh viễn, mọi đường ghi (web, nhập Excel, script, SQL tay).
--   Backfill CHỈ chạm hàng còn nguyên tên seed mặc định (đúng kỷ luật #32).
--   Cột `name` KHÔNG bị xoá, KHÔNG bị đổi — vẫn là nguồn sự thật.
--
-- KHÔNG nới lỏng policy nào. Mọi thứ ở đây là THÊM (cột nullable, trigger,
-- hàm thay thế giữ nguyên thân đang chạy trên DB thật).
-- ============================================================

-- ============================================================
-- PHẦN 1 — THÔNG BÁO: KHÓA + THAM SỐ
-- ============================================================

-- ------------------------------------------------------------------
-- 1A. Bàn giao khách (#24)
-- ------------------------------------------------------------------
-- Chép nguyên thân hàm ĐANG CHẠY trên DB thật (kiểm quyền, chặn bàn giao ra
-- ngoài tiệm, cố ý không chạm `last_user_message_at`, cách tính "khách đã chờ").
-- Chỉ thêm: khóa dịch + tham số vào dòng thông báo.
-- Tên người bàn giao / tên khách / lý do là DỮ LIỆU người dùng → đưa vào tham
-- số nguyên văn, không dịch. Rỗng thì để rỗng, giao diện tự thay nhãn dự phòng
-- đúng ngôn ngữ đang xem.
create or replace function public.handoff_conversation(
  p_conversation uuid, p_to_user uuid, p_reason text
) returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant   uuid := public.current_tenant_id();
  v_actor    uuid := auth.uid();
  v_conv     public.conversations%rowtype;
  v_from     uuid;
  v_reason   text := left(btrim(coalesce(p_reason, '')), 500);
  v_actor_nm text;
  v_customer text;
  v_waited   int;
  v_id       uuid;
  v_body     text;
begin
  if v_tenant is null or v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_reason = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- Người bấm phải là thành viên hoạt động của tenant hiện tại
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_tenant and m.user_id = v_actor and m.status = 'active')
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_conv
  from public.conversations
  where id = p_conversation and tenant_id = v_tenant;
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  -- CHẶN BÀN GIAO RA NGOÀI TIỆM: người nhận phải là thành viên hoạt động CÙNG tenant
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_tenant and m.user_id = p_to_user and m.status = 'active')
  then
    raise exception 'receiver_not_member' using errcode = '42501';
  end if;

  if v_conv.assignee_user_id is not distinct from p_to_user then
    raise exception 'already_assigned' using errcode = '22023';
  end if;

  v_from := v_conv.assignee_user_id;

  -- Đổi người phụ trách. CỐ Ý KHÔNG chạm `last_user_message_at` → đồng hồ SLA và
  -- cửa sổ 48h Zalo giữ nguyên chu kỳ (xem A1).
  update public.conversations
     set assignee_user_id = p_to_user
   where id = p_conversation;

  insert into public.conversation_handoffs
    (tenant_id, conversation_id, from_user_id, to_user_id, reason, created_by)
  values (v_tenant, p_conversation, v_from, p_to_user, v_reason, v_actor)
  returning id into v_id;

  -- ---- thông báo cho NGƯỜI NHẬN: đúng MỘT dòng cho một lần bàn giao ----
  select p.display_name into v_actor_nm from public.profiles p where p.user_id = v_actor;
  select c.full_name into v_customer
    from public.contacts c where c.id = v_conv.contact_id and c.deleted_at is null;

  -- "Khách đã chờ bao lâu" = mốc khách nhắn cuối mà chưa có tin gửi đi nào sau đó
  -- (định nghĩa GIỐNG HỆT process_sla_timers để hai chỗ không bao giờ lệch số).
  if v_conv.last_user_message_at is not null
     and not exists (
       select 1 from public.messages m
       where m.conversation_id = v_conv.id
         and m.direction = 'out'
         and m.sent_at > v_conv.last_user_message_at)
  then
    v_waited := (floor(extract(epoch from (now() - v_conv.last_user_message_at)) / 60))::int;
  end if;

  v_body := coalesce(nullif(v_actor_nm, ''), 'Đồng nghiệp')
         || ' bàn giao khách ' || coalesce(nullif(v_customer, ''), 'chưa có tên')
         || ' cho bạn. Lý do: ' || v_reason;
  if v_waited is not null then
    v_body := v_body || ' — khách đã chờ ' || public.sla_minutes_vn(greatest(v_waited, 0))
                     || ' chưa ai trả lời.';
  end if;

  insert into public.notifications
    (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
  values (v_tenant, p_to_user, 'handoff',
          left('Bàn giao khách: ' || coalesce(nullif(v_customer, ''), 'chưa có tên'), 200),
          v_body,
          '/app/inbox?c=' || p_conversation::text,
          'handoff.title',
          case when v_waited is null then 'handoff.body' else 'handoff.bodyWaited' end,
          jsonb_build_object(
            'actor',    coalesce(v_actor_nm, ''),
            'customer', coalesce(v_customer, ''),
            'reason',   v_reason,
            'minutes',  greatest(coalesce(v_waited, 0), 0)));

  return jsonb_build_object(
    'handoff_id', v_id, 'from_user_id', v_from, 'waited_minutes', v_waited);
end $$;

revoke execute on function public.handoff_conversation(uuid, uuid, text) from public, anon;
grant  execute on function public.handoff_conversation(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- 1B. Gói cước (#27)
-- ------------------------------------------------------------------
-- CỐ Ý chỉ thay `billing_notify` — KHÔNG đụng 7 chỗ gọi. Mỗi chỗ gọi nằm sâu
-- trong một hàm khác (billing_apply_invoice, record_subscription_payment,
-- run_subscription_lifecycle); chép lại thân những hàm đó chỉ để thêm hai tham
-- số là rủi ro đè mất việc người khác mà chẳng đổi được gì.
-- Khóa suy thẳng từ `p_event` (đã là hằng số của hệ thống), tham số lấy từ
-- `p_payload` mà chỗ gọi vốn đã truyền sẵn.
-- Cột `title`/`body` tiếng Việt vẫn ghi y như cũ → làm bản dự phòng.
create or replace function public.billing_notify(
  p_tenant uuid, p_event text, p_type text, p_title text, p_body text, p_payload jsonb
) returns void
language plpgsql set search_path = public as $$
declare
  v_user uuid := public.billing_owner_user(p_tenant);
  v_key text;
  v_days text;
begin
  insert into public.domain_events
    (tenant_id, event_type, aggregate_type, aggregate_id, payload,
     actor_user_id, source_module, causation_chain)
  values (p_tenant, p_event, 'subscription', p_tenant::text, p_payload,
          null, 'billing', 0);
  if v_user is not null then
    v_key := case p_event
      when 'subscription.plan_changed' then 'billing.planChanged'
      when 'payment.succeeded'         then 'billing.paymentSucceeded'
      when 'subscription.trial_ending' then 'billing.trialEnding'
      when 'subscription.trial_ended'  then 'billing.trialEnded'
      when 'subscription.past_due'     then 'billing.pastDue'
      when 'subscription.suspended'    then 'billing.suspended'
      else null                        -- mốc vòng đời mới → dùng chuỗi đã lưu
    end;
    v_days := coalesce(p_payload ->> 'days_left', '');
    insert into public.notifications
      (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
    values (p_tenant, v_user, p_type, left(p_title, 200), p_body, '/app/settings/billing',
            case when v_key is null then null else v_key || '.title' end,
            case when v_key is null then null else v_key || '.body' end,
            case when v_key is null then '{}'::jsonb else jsonb_build_object(
              -- mã gói ('free'/'pro'/…) và số hoá đơn là ĐỊNH DANH, không dịch
              'plan',    coalesce(p_payload ->> 'plan_code', ''),
              'invoice', coalesce(p_payload ->> 'invoice', ''),
              'days',    case when v_days ~ '^[0-9]+$' then v_days::int else 0 end)
            end);
  end if;
end $$;

revoke execute on function public.billing_notify from anon, authenticated, public;

-- ------------------------------------------------------------------
-- 1C. Biểu mẫu / phê duyệt (#29) — 3 chỗ
-- ------------------------------------------------------------------
-- Quy ước: TIÊU ĐỀ thông báo là câu của hệ thống → dịch được.
-- NỘI DUNG là tiêu đề phiếu do chủ tiệm đặt trong màn Quy trình → dữ liệu
-- người dùng, giữ nguyên văn (chỗ "Yêu cầu bị từ chối" có thêm chữ nối
-- "— lý do:" nên tách khóa riêng, tên phiếu + lý do đi vào tham số).

-- Thân hàm chép nguyên bản đang chạy trên DB thật (kiểm cấp duyệt, chống tạo
-- trùng phiếu khi worker chạy lại bước cũ, giải người duyệt theo levels_config).
create or replace function public.wf_start_approval(
  p_tenant uuid, p_run uuid, p_step integer, p_level integer, p_levels jsonb,
  p_title text, p_body text, p_submission uuid
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
    -- Tiêu đề là câu của hệ thống → có khóa dịch.
    -- Nội dung là TÊN PHIẾU do chủ tiệm đặt → giữ nguyên, KHÔNG gắn khóa.
    insert into public.notifications
      (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
      values (p_tenant, v_u, 'approval', 'Phiếu chờ bạn duyệt', v_title, '/app/approvals',
              'approval.pending.title', null, '{}'::jsonb);
  end loop;

  return v_req;
end $$;

-- Thân hàm chép nguyên bản đang chạy trên DB thật (chế độ "any" cho mỗi cấp,
-- từ chối bắt buộc kèm lý do, đẩy con trỏ step_index rồi chạy tiếp ngay).
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
        insert into public.notifications
          (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
          values (v_req.tenant_id, v_sub.submitted_by, 'approval',
                  'Yêu cầu bị từ chối', v_req.title || ' — lý do: ' || coalesce(v_note, ''),
                  '/app/approvals',
                  'approval.rejected.title', 'approval.rejected.body',
                  -- tên phiếu + lý do là chữ của người dùng → tham số, không dịch
                  jsonb_build_object('subject', coalesce(v_req.title, ''),
                                     'note', coalesce(v_note, '')));
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
      -- nội dung = tên phiếu do chủ tiệm đặt → KHÔNG gắn khóa
      insert into public.notifications
        (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
        values (v_req.tenant_id, v_sub.submitted_by, 'approval',
                'Yêu cầu đã được duyệt', v_req.title, '/app/approvals',
                'approval.approved.title', null, '{}'::jsonb);
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

-- ============================================================
-- PHẦN 2 — CHUỖI SEED MẶC ĐỊNH: CỘT `i18n_key` BÊN CẠNH `name`
-- ============================================================

alter table public.pipeline_stages add column if not exists i18n_key text;
alter table public.lost_reasons    add column if not exists i18n_key text;
alter table public.lead_sources    add column if not exists i18n_key text;
alter table public.sla_policies    add column if not exists i18n_key text;

comment on column public.pipeline_stages.i18n_key is
  'Khóa dịch tên cài sẵn (namespace `seed` trong messages/*.json). NULL = tên do chủ tiệm đặt, hiện nguyên văn. Trigger tự xoá khóa khi `name` đổi.';
comment on column public.lost_reasons.i18n_key is 'Như pipeline_stages.i18n_key.';
comment on column public.lead_sources.i18n_key is 'Như pipeline_stages.i18n_key.';
comment on column public.sla_policies.i18n_key is 'Như pipeline_stages.i18n_key.';

-- ------------------------------------------------------------------
-- 2A. Chủ tiệm đổi tên → khóa dịch tự huỷ, tên của họ thắng
-- ------------------------------------------------------------------
-- Đặt ở DB chứ không ở tầng web: mọi đường ghi đều đi qua đây (giao diện, nhập
-- Excel, script seed, SQL tay). Không có đường nào lách được để tên tự đặt bị
-- một bản dịch giẫm lên.
create or replace function public.clear_i18n_key_on_rename() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.name is distinct from old.name then
    new.i18n_key := null;
  end if;
  return new;
end $$;

revoke execute on function public.clear_i18n_key_on_rename from public, anon, authenticated;

drop trigger if exists pipeline_stages_i18n_key on public.pipeline_stages;
create trigger pipeline_stages_i18n_key before update on public.pipeline_stages
  for each row execute function public.clear_i18n_key_on_rename();

drop trigger if exists lost_reasons_i18n_key on public.lost_reasons;
create trigger lost_reasons_i18n_key before update on public.lost_reasons
  for each row execute function public.clear_i18n_key_on_rename();

drop trigger if exists lead_sources_i18n_key on public.lead_sources;
create trigger lead_sources_i18n_key before update on public.lead_sources
  for each row execute function public.clear_i18n_key_on_rename();

drop trigger if exists sla_policies_i18n_key on public.sla_policies;
create trigger sla_policies_i18n_key before update on public.sla_policies
  for each row execute function public.clear_i18n_key_on_rename();

-- ------------------------------------------------------------------
-- 2B. Tiệm MỚI: seed kèm khóa ngay từ đầu
-- ------------------------------------------------------------------
-- Thân hàm chép nguyên bản đang chạy trên DB thật; chỉ thêm cột `i18n_key` vào
-- 3 câu insert seed. Tên tiếng Việt vẫn ghi y hệt → bản Việt không đổi một chữ.
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
  insert into public.pipeline_stages
    (tenant_id, pipeline_id, name, position, kind, win_probability, i18n_key) values
    (v_tenant, v_pipeline, 'Mới',         0, 'open', 10,  'stage.new'),
    (v_tenant, v_pipeline, 'Đang tư vấn', 1, 'open', 30,  'stage.consulting'),
    (v_tenant, v_pipeline, 'Hẹn lịch',    2, 'open', 60,  'stage.scheduled'),
    (v_tenant, v_pipeline, 'Đã chốt',     3, 'won', 100,  'stage.won'),
    (v_tenant, v_pipeline, 'Quay lại',    4, 'open', 20,  'stage.returning'),
    (v_tenant, v_pipeline, 'Thua',        5, 'lost', 0,   'stage.lost');

  -- Seed 5 lý do thua mặc định (dữ liệu tenant — tiếng Việt theo thiết kế, xem đầu file)
  insert into public.lost_reasons (tenant_id, name, position, i18n_key) values
    (v_tenant, 'Giá cao',             0, 'lostReason.price'),
    (v_tenant, 'Chọn đối thủ',        1, 'lostReason.competitor'),
    (v_tenant, 'Không còn nhu cầu',   2, 'lostReason.noNeed'),
    (v_tenant, 'Không liên lạc được', 3, 'lostReason.unreachable'),
    (v_tenant, 'Khác',                4, 'lostReason.other');

  -- Seed 4 nguồn khách mặc định
  insert into public.lead_sources (tenant_id, name, channel_type, is_system, i18n_key) values
    (v_tenant, 'Zalo',       'zalo',     true, 'source.zalo'),
    (v_tenant, 'Facebook',   'facebook', true, 'source.facebook'),
    (v_tenant, 'Giới thiệu', 'referral', true, 'source.referral'),
    (v_tenant, 'Khác',       'other',    true, 'source.other');

  -- Seed 2 playbook cài sẵn (migration #15)
  perform public.wf_seed_playbooks(v_tenant);
  -- Seed 2 chính sách SLA cài sẵn (migration #17)
  perform public.sla_seed_policies(v_tenant);
  -- Seed ngưỡng phân hạng mặc định (migration #19)
  insert into public.tier_rules (tenant_id) values (v_tenant);

  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid(), 'platform');
  return v_tenant;
end $$;

-- Thân hàm chép nguyên bản đang chạy trên DB thật (#33: 3 chính sách, điều kiện
-- không ghim trạng thái "Chờ", không ghim `type` của việc). Chỉ thêm `i18n_key`.
create or replace function public.sla_seed_policies(p_tenant uuid) returns void
language plpgsql
security definer set search_path = public as $$
begin
  if p_tenant is null then
    return;
  end if;

  insert into public.sla_policies
    (tenant_id, key, name, target_type, condition,
     warn_after_minutes, breach_after_minutes, escalate_to, is_system, i18n_key)
  values
    (p_tenant, 'conversation_first_reply',
     'Hội thoại khách chưa được trả lời',
     'conversation',
     -- Không ghim trạng thái: hội thoại "Chờ" cũng là khách đang đợi.
     -- Hội thoại đã đóng bị loại ngay trong vòng quét của process_sla_timers.
     jsonb_build_object('unanswered', true),
     30, 120, 'manager', true, 'sla.conversationFirstReply'),
    (p_tenant, 'deal_next_action_overdue',
     'Cơ hội quá hạn việc kế tiếp',
     'deal',
     jsonb_build_object('status', 'open', 'overdue', true),
     240, 1440, 'manager', true, 'sla.dealNextActionOverdue'),
    (p_tenant, 'activity_due_overdue',
     'Việc trên hồ sơ khách quá hạn',
     'activity',
     -- KHÔNG ghim `type`: màn "Hôm nay gọi ai" đếm mọi việc chưa xong có hạn.
     -- Ghim loại ở đây là tự tạo lệch số giữa hai màn (xem đầu file, mục B).
     jsonb_build_object('overdue', true),
     240, 1440, 'manager', true, 'sla.activityDueOverdue')
  on conflict (tenant_id, key) where key is not null do nothing;
end $$;

revoke execute on function public.sla_seed_policies from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 2C. Tiệm ĐANG CHẠY: backfill CÓ ĐIỀU KIỆN
-- ------------------------------------------------------------------
-- Chỉ gắn khóa cho hàng CÒN NGUYÊN tên seed mặc định. Ai đã tự đổi tên → không
-- khớp `where` → không bị chạm, bản tiếng Anh vẫn hiện tên họ đặt. Đó là đúng:
-- thà bản tiếng Anh còn tiếng Việt còn hơn giẫm lên chữ của chủ tiệm.
-- `i18n_key is null` để chạy lại migration không ghi đè kết quả về sau.

update public.pipeline_stages s set i18n_key = v.k
  from (values
    ('Mới', 'open', 'stage.new'),
    ('Đang tư vấn', 'open', 'stage.consulting'),
    ('Hẹn lịch', 'open', 'stage.scheduled'),
    ('Đã chốt', 'won', 'stage.won'),
    ('Quay lại', 'open', 'stage.returning'),
    ('Thua', 'lost', 'stage.lost')
  ) as v(n, kind, k)
 where s.i18n_key is null and s.name = v.n and s.kind = v.kind;

update public.lost_reasons r set i18n_key = v.k
  from (values
    ('Giá cao', 'lostReason.price'),
    ('Chọn đối thủ', 'lostReason.competitor'),
    ('Không còn nhu cầu', 'lostReason.noNeed'),
    ('Không liên lạc được', 'lostReason.unreachable'),
    ('Khác', 'lostReason.other')
  ) as v(n, k)
 where r.i18n_key is null and r.name = v.n;

-- Nguồn khách: thêm điều kiện `is_system` — nguồn do chủ tiệm tự thêm ("Tại
-- tiệm", "Tờ rơi phường 5") có thể trùng tên nhưng KHÔNG phải chuỗi cài sẵn.
update public.lead_sources ls set i18n_key = v.k
  from (values
    ('Zalo', 'zalo', 'source.zalo'),
    ('Facebook', 'facebook', 'source.facebook'),
    ('Giới thiệu', 'referral', 'source.referral'),
    ('Khác', 'other', 'source.other')
  ) as v(n, ch, k)
 where ls.i18n_key is null and ls.is_system
   and ls.name = v.n and ls.channel_type = v.ch;

-- Cam kết SLA: neo theo `key` (định danh bền của hệ thống) VÀ tên còn nguyên.
update public.sla_policies p set i18n_key = v.k
  from (values
    ('conversation_first_reply', 'Hội thoại khách chưa được trả lời', 'sla.conversationFirstReply'),
    ('deal_next_action_overdue', 'Cơ hội quá hạn việc kế tiếp',       'sla.dealNextActionOverdue'),
    ('activity_due_overdue',     'Việc trên hồ sơ khách quá hạn',     'sla.activityDueOverdue')
  ) as v(pk, n, k)
 where p.i18n_key is null and p.is_system and p.key = v.pk and p.name = v.n;

-- ------------------------------------------------------------------
-- 2D. Thông báo SLA: kèm luôn khóa của tên cam kết
-- ------------------------------------------------------------------
-- Không có bước này thì thông báo SLA ở bản tiếng Anh đọc thành nửa nọ nửa kia:
-- "Hội thoại khách chưa được trả lời — 2 hours with no action yet."
-- Thân hàm chép nguyên bản đang chạy trên DB thật (#33 đã thêm nhánh
-- 'activity'); chỉ thêm một câu tra `i18n_key` và một tham số `policy_key`.
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
  v_policy_key text;
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
  elsif p_target_type = 'activity' then
    -- Việc gắn thẳng vào khách thì lấy tên khách đó; việc chỉ gắn vào cơ hội thì
    -- lấy khách của cơ hội (ràng buộc `activities_need_link` bảo đảm có ít nhất
    -- một trong hai). `subject` là câu người dùng tự viết ("Gọi lại chị Yến Nhi
    -- chốt gói Platinum") — chính là "việc gì" mà thông báo phải nói ra.
    select coalesce(nullif(a.subject, ''), ''),
           coalesce(ct.full_name, dct.full_name, '')
      into v_subject, v_customer
      from public.activities a
      left join public.contacts ct on ct.id = a.contact_id
      left join public.deals d on d.id = a.deal_id
      left join public.contacts dct on dct.id = d.contact_id
      where a.id = p_target_id;
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

  -- Cam kết còn nguyên tên cài sẵn thì có khóa → dịch được. Chủ tiệm đã tự đặt
  -- tên khác thì `i18n_key` đã bị trigger xoá → v_policy_key null → giao diện
  -- in đúng tên họ đặt.
  select s.i18n_key into v_policy_key from public.sla_policies s where s.id = p_policy;

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
       'policy_key', coalesce(v_policy_key, ''),
       'minutes', v_minutes));
  return true;
end $$;

revoke execute on function public.sla_fire from public, anon, authenticated;
