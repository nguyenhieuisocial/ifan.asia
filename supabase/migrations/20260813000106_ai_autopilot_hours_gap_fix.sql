-- Migration #106 — vá lỗ hổng "chọn ngoài giờ nhưng chưa khai giờ" trong
-- ai_autopilot_decide() (migration #105, ADR-0014).
--
-- LỖI THẬT bắt được khi vẽ thẻ design (man-ai-truc-viec.html, ca C): thẻ hứa
-- "chọn scope='outside_hours' mà tiệm chưa khai business_hours ⇒ AI KHÔNG BAO
-- GIỜ trả lời" — nhưng migration #105 làm NGƯỢC LẠI. Lý do: has_source chỉ
-- cần MỘT trong hai (dịch vụ HOẶC giờ), nên tiệm có dịch vụ mà chưa khai giờ
-- vẫn qua được cửa has_source. Tới bước kiểm giờ, tenant_open_now() trả
-- open=false khi CHƯA CÓ business_hours (đúng — không có gì để so thì không
-- thể nói "đang mở"), nhưng decide() lại đọc open=false là "đang ngoài giờ"
-- ⇒ cho phép gửi MỌI LÚC, kể cả giữa giờ làm việc thật.
--
-- Kiểm bằng chính CSDL thật (không suy đoán): tiệm mẫu có dịch vụ, scope=
-- outside_hours, 0 dòng business_hours ⇒ decide() trả {allowed:true,
-- reason:"ok"} — đúng bug, rồi rollback (không đụng dữ liệu thật).
--
-- SỬA: phân biệt "đang mở" / "đang đóng" / "KHÔNG XÁC ĐỊNH ĐƯỢC" (no_hours).
-- Chỉ 'closed' rõ ràng mới cho gửi; 'no_hours' chặn — đúng lời hứa của thẻ.

create or replace function public.ai_autopilot_decide(p_conversation_id uuid)
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
begin
  if p_conversation_id is null then raise exception 'invalid_conversation'; end if;

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
          -- BA nhánh, không phải hai — 'no_hours' KHÔNG được coi bằng 'đóng cửa'.
          -- Tiệm có dịch vụ nhưng CHƯA khai giờ + chọn "chỉ ngoài giờ": không có
          -- gì để so nên không được PHỎNG ĐOÁN là đang ngoài giờ (mù giờ ≠ đóng
          -- cửa) — đúng lời hứa ở thẻ design man-ai-truc-viec.html ca C.
          v_reason := case (v_open ->> 'reason')
            when 'no_hours' then 'no_source'
            else case when (v_open ->> 'open')::boolean then 'within_hours' else 'ok' end
          end;
        else
          v_reason := 'ok';
        end if;
      end if;
    end if;
  end if;

  if v_reason <> 'ok' then
    insert into public.ai_reply_log (tenant_id, conversation_id, outcome, reason)
      values (v_tenant, p_conversation_id, 'skipped_' || v_reason,
              case when v_reason = 'no_source' and v_has_source
                then 'scope=outside_hours nhưng chưa khai giờ mở cửa — không xác định được lúc nào là "ngoài giờ"'
                else null end);
  end if;

  return jsonb_build_object('allowed', v_reason = 'ok', 'reason', v_reason, 'tenant_id', v_tenant);
end $$;
