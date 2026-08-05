-- ============================================================
-- iFan.asia — Migration #33: đồng hồ SLA cho VIỆC GHI TRÊN HỒ SƠ KHÁCH
--
-- LỖ HỔNG ĐANG VÁ (đo được trên tiệm demo trước khi sửa):
--   màn "Hôm nay gọi ai" đếm 4 việc quá hạn = 1 cơ hội + 3 việc trong hồ sơ khách
--   (`activities`), nhưng đồng hồ SLA (#17) chỉ nhận 2 loại mục tiêu:
--   'conversation' và 'deal'. Nghĩa là 3/4 việc quá hạn nằm NGOÀI tầm với: màn
--   hình nhìn thấy chúng, nhưng không ai được nhắc, không có gì leo thang.
--   iFan bán bằng câu "không để khách nào bị quên" — câu đó đang đúng 1/4.
--
-- CÁCH VÁ: thêm LOẠI MỤC TIÊU THỨ BA ('activity') vào chính cỗ máy đang chạy.
--   Không đẻ bảng timer riêng, không đẻ cơ chế chống-bắn-trùng thứ hai.
--
-- A) MỐC BẮT ĐẦU ĐỒNG HỒ = `activities.due_at` (hạn người dùng tự đặt).
--    Đúng vai trò `last_user_message_at` của hội thoại và `next_action_at` của
--    cơ hội: vừa là điểm gốc đo độ trễ, VỪA LÀ MÃ CHU KỲ trong chỉ mục duy nhất
--    `sla_events_once_uidx` (policy_id, target_type, target_id, level,
--    started_at). Hệ quả có sẵn, không phải viết thêm dòng nào:
--      · worker chạy lại 1000 lần vẫn đúng 1 cảnh báo;
--      · người dùng DỜI HẠN việc ⇒ due_at mới ⇒ chu kỳ mới ⇒ đồng hồ lên dây lại
--        và được bắn tiếp;
--      · đánh dấu XONG (done_at) ⇒ rơi khỏi vòng quét ⇒ im lặng.
--
-- B) ĐIỀU KIỆN CHẤM: vẫn bằng public.wf_match_conditions() như 2 loại kia.
--    Trường chấm được: type (note/call/meeting/task), overdue (bool), owner_id.
--    Chính sách cài sẵn CỐ Ý KHÔNG ghim `type`: màn "Hôm nay gọi ai" đếm mọi
--    việc chưa xong có hạn, không phân biệt loại. Ghim type ở đây là tự tạo ra
--    lệch số mới giữa hai màn — đúng cái lỗi migration #31 vừa phải đi dọn.
--
-- C) NGƯỠNG MẶC ĐỊNH: nhắc sau 4 GIỜ trễ, vi phạm sau 1 NGÀY trễ.
--    Việc trong hồ sơ KHÁC BẢN CHẤT với hội thoại. Hội thoại đếm từng phút vì
--    khách đang ngồi chờ máy trả lời. Việc trong hồ sơ là cái hẹn do chính người
--    trong tiệm ghi xuống — trễ vài chục phút là chuyện thường (nhân viên đang
--    đứng phục vụ khách tại chỗ), báo động ở mức 30 phút chỉ tạo nhiễu rồi bị
--    tắt đi, mà chính sách bị tắt thì không cứu được ai.
--      · 4 giờ ≈ hết một buổi làm. Việc hẹn buổi sáng mà đầu giờ chiều chưa động
--        tới là đã lỡ một buổi thật — nhưng vẫn còn nửa ngày để cứu, nên đây là
--        đúng lúc nhắc NGƯỜI PHỤ TRÁCH.
--      · 1 ngày = việc đã trôi sang hôm sau mà không ai đụng. Khách bắt đầu cảm
--        thấy bị bỏ quên → đúng lúc BÁO LÊN QUẢN LÝ. Để lâu hơn (2 ngày) thì
--        không còn là "nhắc", mà là ghi nhận một lời hứa đã vỡ.
--    Trùng số với chính sách cơ hội (#17) là TRÙNG HỢP CÓ LÝ, không phải sao
--    chép: cả hai đều là "bước kế tiếp do người ghi xuống", cùng nhịp buổi/ngày
--    của tiệm. Chủ tiệm sửa được cả hai trên màn Cài đặt → Cam kết phản hồi.
--
-- D) THÔNG BÁO nói rõ VIỆC GÌ, CỦA KHÁCH NÀO — dùng lại đúng bộ khóa dịch +
--    tham số của #32 (`sla.warning.*`, `sla.breached.*`, params.subject =
--    tên việc, params.customer = tên khách). Không thêm khóa mới, không ghi
--    chữ cứng: bản tiếng Anh đọc được ngay mà không phải sửa gì ở tầng giao diện.
--
-- E) Tiệm mới có sẵn chính sách qua create_tenant → sla_seed_policies (#17,
--    KHÔNG cần sửa create_tenant); tiệm đang có được điền ở PHẦN E bên dưới,
--    theo đúng mẫu vá dữ liệu của #31 (chỉ thêm cái thiếu, không đụng cái người
--    dùng đã tự sửa).
--
-- Chuẩn: mọi hàm `create or replace` dưới đây GIỮ NGUYÊN TỪNG DÒNG phần thân
--        đang chạy trên DB (bản #31 cho process_sla_timers, bản #32 cho
--        sla_fire) — chỉ THÊM nhánh 'activity'.
-- ============================================================

-- ============================================================
-- PHẦN A — NHẬN LOẠI MỤC TIÊU THỨ BA
-- ============================================================
-- Nới ràng buộc CHECK (chỉ MỞ RỘNG tập giá trị hợp lệ, không bỏ ràng buộc):
-- vẫn đúng ba giá trị được phép, gõ sai vẫn bị chặn.
alter table public.sla_policies drop constraint sla_policies_target_type_check;
alter table public.sla_policies add constraint sla_policies_target_type_check
  check (target_type in ('conversation','deal','activity'));

alter table public.sla_events drop constraint sla_events_target_type_check;
alter table public.sla_events add constraint sla_events_target_type_check
  check (target_type in ('conversation','deal','activity'));

-- Chỉ mục chống bắn trùng `sla_events_once_uidx` GIỮ NGUYÊN — loại mới dùng
-- chung đúng cơ chế đó, không thêm chỉ mục hay cột cờ nào.

-- ============================================================
-- PHẦN B — sla_fire: biết đọc tên việc + tên khách của một `activity`
-- ============================================================
-- Giữ nguyên toàn bộ phần thân đang chạy (#32). Chỉ thêm nhánh tra cứu thứ ba.
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

-- ============================================================
-- PHẦN C — process_sla_timers: quét thêm nhánh 'activity'
-- ============================================================
-- Nhánh hội thoại và nhánh cơ hội GIỮ NGUYÊN TỪNG DÒNG của bản #31 (hội thoại
-- đã đóng bị loại khỏi vòng quét, mốc cửa sổ 48h Zalo, trần 30 ngày).
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

revoke execute on function public.process_sla_timers from public, anon, authenticated;

-- ============================================================
-- PHẦN D — CHÍNH SÁCH CÀI SẴN THỨ BA
-- ============================================================
-- Giữ nguyên hai chính sách của #17/#31 từng dòng; chỉ THÊM dòng thứ ba.
-- Tên chính sách là DỮ LIỆU của tenant (người dùng sửa/tắt được) nên viết tiếng
-- Việt, cùng quy ước lost_reasons / lead_sources / playbook.
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
     -- Không ghim trạng thái: hội thoại "Chờ" cũng là khách đang đợi.
     -- Hội thoại đã đóng bị loại ngay trong vòng quét của process_sla_timers.
     jsonb_build_object('unanswered', true),
     30, 120, 'manager', true),
    (p_tenant, 'deal_next_action_overdue',
     'Cơ hội quá hạn việc kế tiếp',
     'deal',
     jsonb_build_object('status', 'open', 'overdue', true),
     240, 1440, 'manager', true),
    (p_tenant, 'activity_due_overdue',
     'Việc trên hồ sơ khách quá hạn',
     'activity',
     -- KHÔNG ghim `type`: màn "Hôm nay gọi ai" đếm mọi việc chưa xong có hạn.
     -- Ghim loại ở đây là tự tạo lệch số giữa hai màn (xem đầu file, mục B).
     jsonb_build_object('overdue', true),
     240, 1440, 'manager', true)
  on conflict (tenant_id, key) where key is not null do nothing;
end $$;

revoke execute on function public.sla_seed_policies from public, anon, authenticated;

-- `create_tenant` (#17) đã gọi `sla_seed_policies` — tiệm mới tự có chính sách
-- thứ ba, KHÔNG cần sửa create_tenant.

-- ============================================================
-- PHẦN E — ĐIỀN CHO TIỆM ĐANG CÓ
-- ============================================================
-- Mở màn Cài đặt → Cam kết phản hồi cũng tự điền qua ensure_sla_policies(#17),
-- nhưng đồng hồ chạy nền mỗi phút — không được bắt tiệm đợi tới lần mở màn kế
-- tiếp mới bắt đầu canh. Chỉ THÊM cái đang thiếu; không đụng chính sách nào
-- người dùng đã tự sửa (mẫu vá dữ liệu của #31).
insert into public.sla_policies
  (tenant_id, key, name, target_type, condition,
   warn_after_minutes, breach_after_minutes, escalate_to, is_system)
select t.id, 'activity_due_overdue',
       'Việc trên hồ sơ khách quá hạn',
       'activity',
       jsonb_build_object('overdue', true),
       240, 1440, 'manager', true
from public.tenants t
on conflict (tenant_id, key) where key is not null do nothing;
