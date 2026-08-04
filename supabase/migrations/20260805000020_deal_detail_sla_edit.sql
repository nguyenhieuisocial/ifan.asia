-- ============================================================
-- iFan.asia — Migration #20: link thông báo SLA trỏ ĐÚNG cơ hội
--
-- Bối cảnh: migration #17 ghi rõ trong thân hàm "Chưa có màn chi tiết cơ hội
-- (đợt 1) → link về bảng Cơ hội". Màn `/app/deals/[id]` nay đã có, nên thông báo
-- "Cơ hội quá hạn việc kế tiếp" phải mở THẲNG cơ hội đó — người nhận bấm là thấy
-- việc cần làm, không phải tự dò trong bảng Kanban.
--
-- PHẠM VI: chỉ đổi 2 chuỗi link trong `process_sla_timers`. Phần hội thoại giữ
-- nguyên (`/app/inbox?c=<id>` vốn đã trỏ đúng). Không đụng bảng, chỉ mục, RLS.
--
-- VÌ SAO KHÔNG THÊM RPC "cập nhật chính sách có kiểm quyền":
--   sửa ngưỡng trên giao diện đi thẳng qua UPDATE bình thường, vì hàng rào đã đủ:
--     · RLS `sla_policies_manage` (migration #17) — chỉ owner/admin ĐÚNG tenant;
--     · check `warn_after_minutes > 0`, `breach_after_minutes > 0`;
--     · check `sla_policies_order` (breach > warn);
--     · check `escalate_to in ('owner','manager') or <uuid>`.
--   Thêm một RPC definer chỉ để lặp lại đúng các luật đó là thêm đường ghi thứ
--   hai vào cùng một bảng — nhiều mã hơn, nhiều chỗ sai lệch hơn, không an toàn
--   hơn. Giao diện chặn sai TRƯỚC khi gửi để người dùng đọc được lời giải thích;
--   DB vẫn là lưới cuối nếu ai đó gọi thẳng API.
-- ============================================================

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

        -- Link mở THẲNG màn chi tiết cơ hội (thay link tạm '/app/deals' của #17)
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
    end if;
  end loop;

  return v_fired;
end $$;

-- `create or replace` giữ nguyên quyền cũ; nhắc lại cho rõ ràng (chuẩn #15/#17):
-- worker chạy bằng cron/service role, người dùng cuối không gọi được.
revoke execute on function public.process_sla_timers from public, anon, authenticated;
