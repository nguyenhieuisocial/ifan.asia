-- ADR-0015 việc 4+5 — cắm Kho tri thức thành nguồn sự thật THỨ 5 của AI trực
-- việc, và mang "lời dặn riêng" của tiệm tới tầng gọi AI.
--
-- Hai việc CSDL cần làm để tầng Node dùng được, không đụng logic quyết định
-- đã có (ai_autopilot_decide chỉ quyết "được gọi AI hay không" — KHÔNG đổi):
--
--   1. `ai_autopilot_decide()` đã đọc `select * into v_cfg from ai_autopilot`
--      nhưng KHÔNG trả `custom_instruction` ra ngoài — Node phải hỏi lại bằng
--      một câu riêng nếu không vá. Vá bằng cách thêm đúng MỘT trường vào kết
--      quả `allowed=true` (không đổi hành vi cho, chỉ đổi hành vi cho — tránh
--      round-trip thừa, tận dụng hàng đã đọc sẵn).
--
--   2. `ai_reply_log_record()` chưa nhận `kb_ids` (cột đã có từ #113) lẫn
--      `data_conflict` (cột MỚI — ADR mục "xung đột dữ liệu": KB nói giờ mở
--      cửa khác ô có cấu trúc thì ô có cấu trúc THẮNG, và PHẢI GHI NHẬT KÝ để
--      tiệm thấy mà sửa — im lặng bỏ qua là để lỗi tự lặp lại mãi).

alter table public.ai_reply_log
  add column if not exists data_conflict text
    check (data_conflict is null or char_length(data_conflict) <= 300);

comment on column public.ai_reply_log.data_conflict is
  'ADR-0015. Model tự khai khi thấy kho tri thức nói khác với 4 nguồn có cấu trúc (VD giờ mở cửa). Ô có cấu trúc LUÔN thắng khi trả lời khách — cột này chỉ để tiệm THẤY mà sửa dữ liệu gốc, không đổi câu trả lời đã gửi.';

-- ---------- 1. ai_autopilot_decide: trả thêm custom_instruction ----------

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

  -- DUY NHẤT dòng đổi so với migration #111: mang custom_instruction ra ngoài
  -- cho tầng Node — hàng v_cfg đã đọc sẵn ở trên, không tốn round-trip mới.
  return jsonb_build_object('allowed', true, 'reason', 'ok', 'tenant_id', v_tenant,
                            'attempt', v_attempts, 'custom_instruction', v_cfg.custom_instruction);
end $$;
revoke execute on function public.ai_autopilot_decide(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_autopilot_decide(uuid, uuid) to service_role;

-- ---------- 2. ai_reply_log_record: nhận kb_ids + data_conflict ----------

create or replace function public.ai_reply_log_record(
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_outcome text,
  p_reason text default null,
  p_sent_message_id uuid default null,
  p_kb_ids uuid[] default null,
  p_data_conflict text default null
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
  v_da_ghi boolean;
begin
  if p_outcome not in ('sent','skipped_out_of_scope','error') then
    raise exception 'invalid_outcome';
  end if;
  if p_trigger_message_id is null then raise exception 'invalid_trigger_message'; end if;
  select c.tenant_id into v_tenant
    from public.conversations c where c.id = p_conversation_id;
  if v_tenant is null then raise exception 'conversation_not_found'; end if;

  insert into public.ai_reply_log
    (tenant_id, conversation_id, trigger_message_id, outcome, reason, message_id, kb_ids, data_conflict, attempts)
    values (v_tenant, p_conversation_id, p_trigger_message_id, p_outcome, p_reason,
            case when p_outcome = 'sent' then p_sent_message_id else null end,
            p_kb_ids, p_data_conflict, 1)
    on conflict (trigger_message_id) do update
      set outcome = excluded.outcome, reason = excluded.reason,
          message_id = excluded.message_id, kb_ids = excluded.kb_ids,
          data_conflict = excluded.data_conflict, created_at = now()
      where public.ai_reply_log.outcome in ('claimed', 'error')
    returning true into v_da_ghi;

  if p_outcome = 'sent' and v_da_ghi is not null then
    perform public.wf_emit(v_tenant, 'ai.replied', 'conversation', p_conversation_id::text,
                           jsonb_build_object('message_id', p_sent_message_id));
  end if;
end $$;
revoke execute on function public.ai_reply_log_record(uuid, uuid, text, text, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.ai_reply_log_record(uuid, uuid, text, text, uuid, uuid[], text) to service_role;
-- Chữ ký CŨ (5 tham số) không còn ai gọi sau khi sửa autopilot-run.ts trong
-- cùng đợt này — xoá để tránh hai bản cùng tồn tại gây nhầm khi tra cứu.
drop function if exists public.ai_reply_log_record(uuid, uuid, text, text, uuid);
