-- #51 — Thông báo việc quá hạn NHẢY ĐÚNG DÒNG VIỆC trong hồ sơ khách (B15)
--
-- Bệnh: thông báo "Sắp trễ hẹn"/"Vi phạm cam kết" của một VIỆC (activity) dẫn
--   về '/app/contacts/<id>' trần — người nhận rơi vào đầu hồ sơ khách rồi phải
--   tự dò xem việc nào đang cháy. Hồ sơ khách nay đã có khối "Việc đang chờ"
--   ghim đầu dòng thời gian, mỗi dòng mang anchor DOM `activity-<id>`.
--
-- Sửa: 2 link nhánh 'activity' trỏ về hồ sơ KHÁCH thêm đuôi '#activity-<id>' —
--   trang chi tiết khách đọc hash, cuộn tới + highlight đúng dòng việc (~2s).
--   Link rơi về hồ sơ CƠ HỘI (việc chỉ gắn deal) giữ nguyên: màn cơ hội chưa
--   đọc hash, thêm đuôi chỉ tạo cảm giác có mà không chạy.
--
-- ⚠️⚠️ CẢNH BÁO REGRESSION — ĐỌC TRƯỚC KHI RE-CREATE HÀM NÀY ⚠️⚠️
-- KHI RE-CREATE PHẢI CHÉP TỪ BẢN MỚI NHẤT — ĐÃ DÍNH REGRESSION CHÉP BẢN CŨ:
-- #31/#33 chép `process_sla_timers` từ #17 làm mất link '/app/deals/<id>' của
-- #20, #46 phải đi sửa lại. Quy tắc:
--   · `process_sla_timers`: bản mới nhất tính đến #51 là file NÀY (trước đó #46).
--   · Thân hàm dưới đây CHÉP NGUYÊN từ #46, chỉ đổi 2 link nhánh 'activity'
--     (nhánh contact) thêm '#activity-' || r.id. Từng dòng khác giữ nguyên.
--   · `create or replace` GHI ĐÈ cấu hình hàm → phải ghim lại
--     `search_path = public, pg_temp` (chốt #40); chép nguyên `public` là tự tháo chốt.
-- =============================================================
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
        -- Đuôi '#activity-<id>' (#51): hồ sơ khách cuộn tới + highlight đúng
        -- dòng việc trong khối "Việc đang chờ".
        if r.elapsed >= p.warn_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'activity', r.id, 'warning', r.started_at, r.elapsed,
                               r.owner_id,
                               case
                                 when r.contact_id is not null
                                   then '/app/contacts/' || r.contact_id::text
                                        || '#activity-' || r.id::text
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
                                        || '#activity-' || r.id::text
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
