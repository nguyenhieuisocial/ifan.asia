-- #46 — Thông báo trỏ ĐÚNG ĐÍCH: cơ hội mở thẳng hồ sơ, phiếu duyệt mở đúng tab
--
-- Bệnh 1 (regression): #20 đã sửa link thông báo SLA của CƠ HỘI thành
--   '/app/deals/<id>' (mở thẳng màn chi tiết). Nhưng #31 re-create
--   `process_sla_timers` bằng cách chép thân hàm từ bản #17 CŨ (còn link tạm
--   '/app/deals' kèm câu chú "chưa có màn chi tiết") và #33 chép tiếp từ #31 —
--   sửa của #20 bị đè mất mà không ai hay. Người nhận cảnh báo "Cơ hội quá hạn"
--   bấm vào lại rơi giữa bảng Kanban, phải tự dò đúng cái lỗi #20 đã trả tiền sửa.
--
-- Bệnh 2: thông báo "Yêu cầu đã được duyệt"/"Yêu cầu bị từ chối" gửi cho NGƯỜI
--   NỘP phiếu nhưng link về '/app/approvals' trần — màn Duyệt mở tab mặc định
--   "Chờ tôi duyệt", trong khi phiếu của người nộp nằm ở tab "Yêu cầu của tôi".
--   Sửa thành '/app/approvals?tab=mine' (Tabs của màn Duyệt nay đọc ?tab= từ URL,
--   giá trị tab đúng theo code: pending / handled / mine).
--
-- ⚠️⚠️ CẢNH BÁO REGRESSION — ĐỌC TRƯỚC KHI SỬA 2 HÀM DƯỚI ĐÂY ⚠️⚠️
-- KHI RE-CREATE HÀM NÀY PHẢI CHÉP TỪ BẢN MỚI NHẤT — ĐÃ DÍNH REGRESSION CHÉP BẢN
-- CŨ: #31/#33 chép `process_sla_timers` từ #17 làm mất link '/app/deals/<id>'
-- của #20, và chính migration này phải đi sửa lại. Quy tắc:
--   · `process_sla_timers`: bản mới nhất tính đến #46 là file NÀY (trước đó #33).
--   · `wf_decide_approval`:  bản mới nhất tính đến #46 là file NÀY (trước đó #36).
--   · Chỉ đổi đúng chỗ cần đổi, từng dòng còn lại giữ nguyên bản mới nhất.
--   · `create or replace` GHI ĐÈ cấu hình hàm → phải ghim lại
--     `search_path = public, pg_temp` (chốt #40); chép nguyên `public` là tự tháo chốt.
-- =============================================================

-- ------------------------------------------------------------------
-- 1) process_sla_timers — thân hàm CHÉP TỪ BẢN #33 (bản mới nhất),
--    chỉ đổi 2 link nhánh 'deal': '/app/deals' → '/app/deals/' || r.id
--    (khôi phục đúng sửa của #20) + ghim pg_temp cuối search_path.
-- ------------------------------------------------------------------
create or replace function public.process_sla_timers(p_batch int default 500) returns int
language plpgsql
security definer set search_path = public, pg_temp as $$
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
          -- hội thoại ĐÃ ĐÓNG là việc đã xong, không còn đồng hồ nào chạy
          and c.status <> 'closed'
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

        -- Link mở THẲNG màn chi tiết cơ hội (#20). KHÔNG lùi về '/app/deals'
        -- trần của #17 — xem cảnh báo regression đầu file.
        if r.elapsed >= p.warn_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'deal', r.id, 'warning', r.started_at, r.elapsed,
                               r.owner_id, '/app/deals/' || r.id::text) then
          v_fired := v_fired + 1;
        end if;

        if r.elapsed >= p.breach_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'deal', r.id, 'breached', r.started_at, r.elapsed,
                               r.owner_id, '/app/deals/' || r.id::text) then
          v_fired := v_fired + 1;
        end if;
      end loop;

    elsif p.target_type = 'activity' then
      -- Cùng tập việc mà màn "Hôm nay gọi ai" gọi là QUÁ HẠN (today_queue, #31):
      -- chưa xong (done_at is null) + có hạn (due_at is not null) + hạn đã qua.
      -- Đánh dấu xong ⇒ rơi khỏi vòng quét ngay ⇒ không bắn thêm mốc nào.
      for r in
        select a.id,
               a.type,
               a.owner_id,
               a.due_at as started_at,
               (floor(extract(epoch from (now() - a.due_at)) / 60))::int as elapsed,
               a.contact_id,
               a.deal_id
        from public.activities a
        where a.tenant_id = p.tenant_id
          and a.done_at is null
          and a.due_at is not null
          and a.due_at > now() - interval '30 days'
          and a.due_at <= now() - make_interval(mins => p.warn_after_minutes)
        order by a.due_at
        limit p_batch
      loop
        v_target := jsonb_build_object(
          'type', r.type,
          'overdue', true,
          'owner_id', r.owner_id);
        if not public.wf_match_conditions(
             p.condition, jsonb_build_object('payload', v_target), '{}'::jsonb) then
          continue;
        end if;

        -- Bấm vào thông báo phải tới đúng chỗ LÀM ĐƯỢC việc: hồ sơ khách (nơi
        -- màn "Hôm nay gọi ai" cũng dẫn tới), hoặc hồ sơ cơ hội nếu việc chỉ gắn
        -- vào cơ hội. Cả hai đều là màn đã có thật.
        if r.elapsed >= p.warn_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'activity', r.id, 'warning', r.started_at, r.elapsed,
                               r.owner_id,
                               case
                                 when r.contact_id is not null
                                   then '/app/contacts/' || r.contact_id::text
                                 else '/app/deals/' || r.deal_id::text
                               end) then
          v_fired := v_fired + 1;
        end if;

        if r.elapsed >= p.breach_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'activity', r.id, 'breached', r.started_at, r.elapsed,
                               r.owner_id,
                               case
                                 when r.contact_id is not null
                                   then '/app/contacts/' || r.contact_id::text
                                 else '/app/deals/' || r.deal_id::text
                               end) then
          v_fired := v_fired + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_fired;
end $$;

-- `create or replace` giữ nguyên quyền cũ; nhắc lại cho rõ (chuẩn #15/#17/#20):
-- worker chạy bằng cron/service role, người dùng cuối không gọi được.
revoke execute on function public.process_sla_timers from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 2) wf_decide_approval — thân hàm CHÉP TỪ BẢN #36 (bản mới nhất),
--    chỉ đổi 2 link thông báo cho NGƯỜI NỘP phiếu:
--    '/app/approvals' → '/app/approvals?tab=mine' (đúng tab "Yêu cầu của tôi")
--    + ghim pg_temp cuối search_path.
-- ------------------------------------------------------------------
create or replace function public.wf_decide_approval(
  p_request uuid, p_decision text, p_note text default null
) returns text
language plpgsql
security definer set search_path = public, pg_temp as $$
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
                  -- người NỘP phiếu bấm vào phải rơi đúng tab "Yêu cầu của tôi"
                  '/app/approvals?tab=mine',
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
                'Yêu cầu đã được duyệt', v_req.title,
                -- người NỘP phiếu bấm vào phải rơi đúng tab "Yêu cầu của tôi"
                '/app/approvals?tab=mine',
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

-- `create or replace` giữ nguyên quyền cũ; nhắc lại cho rõ (chuẩn #29):
-- RPC người dùng gọi trực tiếp (đã tự kiểm quyền bên trong).
revoke execute on function public.wf_decide_approval(uuid, text, text) from public, anon;
grant execute on function public.wf_decide_approval(uuid, text, text) to authenticated;
