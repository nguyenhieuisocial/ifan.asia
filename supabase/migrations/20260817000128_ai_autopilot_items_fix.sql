-- ============================================================
-- iFan.asia — Migration #128: vá `ai_autopilot_decide()` còn đọc bảng
-- `services` đã bị đổi tên (migration #125, ADR-0019 mục 3, task #140,
-- 17/08). Migration #125 đã CREATE OR REPLACE lại appointments_emit_events,
-- process_appointment_reminders, bot_answer, apply_industry_pack — nhưng BỎ
-- SÓT hàm này vì nó không lộ ra qua grep "services" ở tầng web (chỉ gọi từ
-- server-side khi có tin nhắn đến), lộ ra khi chạy thật `rls-smoke.mjs` lúc
-- nghiệm thu D3 cho V3 (task #144): `relation "public.services" does not
-- exist`.
--
-- NGHIÊM TRỌNG: đây là bug ĐANG SỐNG trên web thật — mọi lần AI trực việc
-- (ADR-0014, đã chạy thật từ 13/08) cố quyết định có trả lời hay không đều
-- gặp lỗi CSDL ngay tại bước kiểm "đã khai dịch vụ chưa" (has_source), tức
-- TOÀN BỘ tính năng AI trực việc bị hỏng từ lúc migration #125 áp (17/08),
-- không phải lỗi mới do V3 gây ra — V3 chỉ là nơi PHÁT HIỆN.
--
-- Sửa ĐÚNG MỘT chỗ: `services.is_active` (bool, đã bỏ) → `items` với
-- `kind='service' and status='active'` (đúng vòng đời 3 trạng thái mới).
-- Toàn bộ phần còn lại của hàm CHÉP NGUYÊN VĂN từ migration #116
-- (ai_autopilot_kb_wiring.sql, bản mới nhất trước migration này) — đối
-- chiếu từng dòng, không "tiện tay sửa thêm" gì khác (bài học đã ghi ở
-- migration #125: chép nhầm theo trí nhớ thay vì đọc file thật).
-- ============================================================

create or replace function public.ai_autopilot_decide(
  p_conversation_id uuid, p_trigger_message_id uuid
)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
  v_cfg public.ai_autopilot%rowtype;
  v_has_source boolean;
  v_sent_today int;
  v_sent_in_conv int;
  v_open jsonb;
  v_reason text;
  v_chi_tiet text;
  v_attempts int;
  v_cur_outcome text;
  v_cur_attempts int;
begin
  if p_conversation_id is null or p_trigger_message_id is null then
    raise exception 'invalid_conversation';
  end if;

  select c.tenant_id into v_tenant
    from public.conversations c where c.id = p_conversation_id;
  if v_tenant is null then raise exception 'conversation_not_found'; end if;

  select * into v_cfg from public.ai_autopilot where tenant_id = v_tenant;

  if v_cfg.tenant_id is null or not v_cfg.enabled then
    v_reason := 'off';
  else
    -- DUY NHẤT dòng đổi so với migration #116: services(is_active) đã đổi
    -- tên + đổi vòng đời thành items(kind='service', status='active').
    select exists (select 1 from public.items s where s.tenant_id = v_tenant and s.kind = 'service' and s.status = 'active')
        or exists (select 1 from public.business_hours h where h.tenant_id = v_tenant)
      into v_has_source;

    if not v_has_source then
      v_reason := 'no_source';
    else
      select count(*) into v_sent_today from public.ai_reply_log
        where tenant_id = v_tenant and outcome = 'sent'
          and created_at >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                            at time zone 'Asia/Ho_Chi_Minh';
      if v_sent_today >= v_cfg.daily_cap then
        v_reason := 'daily_cap';
      else
        select count(*) into v_sent_in_conv from public.ai_reply_log
          where tenant_id = v_tenant and conversation_id = p_conversation_id and outcome = 'sent';
        if v_sent_in_conv >= v_cfg.max_turns_per_conversation then
          v_reason := 'turn_cap';
        elsif v_cfg.scope = 'outside_hours' then
          v_open := public.tenant_open_now(v_tenant);
          if (v_open ->> 'reason') = 'no_hours' then
            v_reason := 'no_source';
            v_chi_tiet := 'scope=outside_hours nhưng chưa khai giờ mở cửa — không xác định được lúc nào là "ngoài giờ"';
          elsif (v_open ->> 'open')::boolean then
            v_reason := 'within_hours';
          else
            v_reason := 'ok';
          end if;
        else
          v_reason := 'ok';
        end if;
      end if;
    end if;
  end if;

  if v_reason <> 'ok' then
    insert into public.ai_reply_log
      (tenant_id, conversation_id, trigger_message_id, outcome, reason)
      values (v_tenant, p_conversation_id, p_trigger_message_id, 'skipped_' || v_reason, v_chi_tiet)
      on conflict (trigger_message_id) do nothing;
    return jsonb_build_object('allowed', false, 'reason', v_reason, 'tenant_id', v_tenant);
  end if;

  insert into public.ai_reply_log
    (tenant_id, conversation_id, trigger_message_id, outcome, attempts)
    values (v_tenant, p_conversation_id, p_trigger_message_id, 'claimed', 1)
    on conflict (trigger_message_id) do update
      set outcome = 'claimed',
          attempts = public.ai_reply_log.attempts + 1,
          reason = null,
          created_at = now()
      where (public.ai_reply_log.outcome = 'error'
             and public.ai_reply_log.attempts < 3)
         or (public.ai_reply_log.outcome = 'claimed'
             and public.ai_reply_log.created_at < now() - interval '5 minutes')
    returning attempts into v_attempts;

  if v_attempts is null then
    select outcome, attempts into v_cur_outcome, v_cur_attempts
      from public.ai_reply_log where trigger_message_id = p_trigger_message_id;
    return jsonb_build_object(
      'allowed', false,
      'reason', case
        when v_cur_outcome = 'error' and v_cur_attempts >= 3 then 'error_cap'
        when v_cur_outcome in ('sent','skipped_out_of_scope') then 'already_done'
        else 'already_claimed'
      end,
      'attempts', v_cur_attempts,
      'tenant_id', v_tenant);
  end if;

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'tenant_id', v_tenant,
                            'attempt', v_attempts, 'custom_instruction', v_cfg.custom_instruction);
end $$;
revoke execute on function public.ai_autopilot_decide(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_autopilot_decide(uuid, uuid) to service_role;
