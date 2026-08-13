-- Migration #111 — dọn nốt chỗ chưa sạch của #110, phát hiện khi kiểm chính #110.
--
-- #110 chặn được vòng lặp đốt lượt AI (đúng mục tiêu), nhưng kiểm kỹ thì thấy
-- sau khi đã chốt "thôi không thử nữa", MỖI lượt quét sau vẫn:
--   1. Ghi đè lại dòng nhật ký (tăng `attempts` mãi) — ồn, không cần.
--   2. In ra câu SAI SỰ THẬT: "đã thử 4 lần… 5 lần…" trong khi AI chỉ thật sự
--      được gọi 3 lần. Founder đọc màn Nhật ký sẽ thấy con số tự tăng dù không
--      có lần gọi nào nữa.
--
-- Chuyện tiền đã an toàn từ #110 (allowed=false ⇒ không gọi AI), nên đây là
-- lỗi NÓI SAI, không phải lỗi tốn tiền. Nhưng nói sai trên chính cái sổ dựng
-- ra để "không hỏng im lặng" thì vẫn phải sửa.
--
-- SỬA: đưa luôn điều kiện `attempts < 3` vào mệnh đề giành chỗ. Hết 3 lần thì
-- dòng đó KHÔNG giành lại được nữa ⇒ không ghi đè, không đếm tiếp. Lý do trả
-- về phân biệt rõ hai ca khác hẳn nhau:
--   * 'error_cap'      — đã thử đủ 3 lần, thôi, chờ người.
--   * 'already_claimed'— lượt quét khác đang giữ chỗ, mình nhường.

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
    select exists (select 1 from public.services s where s.tenant_id = v_tenant and s.is_active)
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

  -- GIÀNH CHỖ. Ba điều kiện để được giành lại một dòng đã có:
  --   * 'error' và CHƯA đủ 3 lần thử  → lỗi tạm thời, đáng thử tiếp;
  --   * 'claimed' quá 5 phút          → chỗ mồ côi (tiến trình chết giữa chừng).
  -- Hết 3 lần thì KHÔNG khớp mệnh đề nào ⇒ dòng đứng yên, không đếm tiếp (#111).
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
    -- Không giành được — nói RÕ vì sao, hai ca này khác hẳn nhau về ý nghĩa.
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
                            'attempt', v_attempts);
end $$;
revoke execute on function public.ai_autopilot_decide(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_autopilot_decide(uuid, uuid) to service_role;
