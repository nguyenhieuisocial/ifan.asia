-- Migration #108 — nền bổ sung để cắm AI trực việc vào đường tin đến thật
-- (ADR-0014 mục 9 việc 4, docs/adr/0014-v25-ai-truc-viec.md).
--
-- Ba lỗ migration #105/#106 để lại KHÔNG PHẢI THIẾU SÓT mà là câu hỏi mở đã
-- ghi rõ trong đầu file #105 — nay trả lời:
--
--   1. "Chống trùng theo tin nhắn nào?" — decide()/record() trước chỉ nhận
--      conversation_id, nên máy quét (chạy lại mỗi ~1 phút cho tới khi hội
--      thoại được trả lời) sẽ QUYẾT ĐỊNH LẠI cùng một tin khách nhiều lần,
--      sinh nhật ký trùng và có thể GỬI TRÙNG khi trần vừa được nới. Nay mọi
--      quyết định gắn với ĐÚNG một `trigger_message_id` (tin khách vừa tới),
--      chỉ mục DUY NHẤT chặn quyết định trùng ở tầng CSDL — không tin vào
--      code Node "chỉ gọi một lần" (bất biến 1).
--
--   2. "Lượt AI trực việc có cộng vào trần tháng theo gói không?" — CÓ, dùng
--      LẠI đúng bảng `usage_counters` + `plan_limit()` đã có (luật D1: một
--      trần chi phí, không phải hai hệ thống song song). `increment_usage()`
--      đọc `current_tenant_id()` từ JWT — không có trong máy quét chạy bằng
--      service role (không phiên đăng nhập). Thêm `increment_usage_for()`
--      THÂN Y HỆT, chỉ khác nhận `p_tenant` làm tham số thay vì đọc JWT.

-- ---------- 1. Chống trùng theo tin nhắn kích hoạt ----------

alter table public.ai_reply_log
  add column if not exists trigger_message_id uuid references public.messages(id) on delete set null;

-- Một tin khách chỉ được QUYẾT ĐỊNH đúng một lần — dù là quyết định chặn
-- (decide() tự ghi) hay quyết định sau khi đã hỏi AI (app gọi record()).
-- NULL (dữ liệu cũ trước migration này, nếu có) không tính trùng — mặc định
-- Postgres cho unique index bỏ qua NULL, đúng ý.
create unique index if not exists ai_reply_log_trigger_message_uidx
  on public.ai_reply_log (trigger_message_id);

comment on column public.ai_reply_log.trigger_message_id is
  'Tin khách khiến máy quét chạy quyết định này. Chỉ mục DUY NHẤT chống máy quét quyết định lại cùng một tin (chạy lại mỗi ~1 phút cho tới khi hội thoại hết is_unanswered).';

-- ---------- 2. ai_autopilot_decide — thêm p_trigger_message_id ----------
-- Ký hiệu cũ (1 tham số) CHƯA có caller thật nào ngoài kịch bản thử của chính
-- đợt này — đổi thẳng chữ ký, không cần giữ overload cũ (khác tình huống
-- tg_release_mark, migration #107, nơi đã có caller thật đang chạy).

drop function if exists public.ai_autopilot_decide(uuid);

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
    -- ON CONFLICT DO NOTHING: máy quét gọi lại đúng tin này (ví dụ chạy hai
    -- lượt gần nhau) thì lượt sau thấy hàng đã có, không raise lỗi, không ghi
    -- đè — trả lại NHẤT QUÁN đúng như lượt đầu.
    insert into public.ai_reply_log (tenant_id, conversation_id, trigger_message_id, outcome)
      values (v_tenant, p_conversation_id, p_trigger_message_id, 'skipped_' || v_reason)
      on conflict (trigger_message_id) do nothing;
  end if;

  return jsonb_build_object('allowed', v_reason = 'ok', 'reason', v_reason, 'tenant_id', v_tenant);
end $$;
revoke execute on function public.ai_autopilot_decide(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_autopilot_decide(uuid, uuid) to service_role;

comment on function public.ai_autopilot_decide(uuid, uuid) is
  'ADR-0014 mục 8 + 10. Gọi TRƯỚC khi hỏi AI, MỘT LẦN cho mỗi tin khách (p_trigger_message_id). allowed=false đã tự ghi log; allowed=true thì caller gọi ai_reply_log_record() sau khi biết kết cục thật.';

-- ---------- 3. ai_reply_log_record — thêm p_trigger_message_id ----------

drop function if exists public.ai_reply_log_record(uuid, text, text, uuid);

create or replace function public.ai_reply_log_record(
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_outcome text,
  p_reason text default null,
  p_sent_message_id uuid default null
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if p_outcome not in ('sent','skipped_out_of_scope','error') then
    raise exception 'invalid_outcome';
  end if;
  if p_trigger_message_id is null then raise exception 'invalid_trigger_message'; end if;
  select c.tenant_id into v_tenant
    from public.conversations c where c.id = p_conversation_id;
  if v_tenant is null then raise exception 'conversation_not_found'; end if;

  insert into public.ai_reply_log
    (tenant_id, conversation_id, trigger_message_id, outcome, reason, message_id)
    values (v_tenant, p_conversation_id, p_trigger_message_id, p_outcome, p_reason,
            case when p_outcome = 'sent' then p_sent_message_id else null end)
    on conflict (trigger_message_id) do nothing;

  if p_outcome = 'sent' then
    perform public.wf_emit(v_tenant, 'ai.replied', 'conversation', p_conversation_id::text,
                           jsonb_build_object('message_id', p_sent_message_id));
  end if;
end $$;
revoke execute on function public.ai_reply_log_record(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.ai_reply_log_record(uuid, uuid, text, text, uuid) to service_role;

comment on function public.ai_reply_log_record(uuid, uuid, text, text, uuid) is
  'ADR-0014 mục 4. Chỉ nhận 3 outcome caller mới biết được sau khi gọi AI (sent/skipped_out_of_scope/error) — 5 outcome còn lại đã do ai_autopilot_decide() tự ghi.';

-- ---------- 4. increment_usage_for — bản service-role của increment_usage ----------
-- THÂN Y HỆT increment_usage (migration #27, subscription_lifecycle) — chỉ
-- khác nguồn tenant. Sửa increment_usage thì phải soát cả hàm này (2 nơi,
-- không tránh được: một hàm đọc JWT, hàm kia phải nhận tham số vì máy quét
-- không có phiên đăng nhập nào để đọc).

create or replace function public.increment_usage_for(
  p_tenant uuid, p_metric text, p_amount bigint default 1
)
returns bigint
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_period text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM');
  v_used bigint;
  v_limit bigint;
begin
  if p_tenant is null then raise exception 'no_tenant_context'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 100 then
    raise exception 'invalid_amount';
  end if;
  if p_metric is null or p_metric !~ '^[a-z_]{1,50}$' then
    raise exception 'invalid_metric';
  end if;
  insert into public.usage_counters as uc (tenant_id, metric, period, used, limit_value)
    values (p_tenant, p_metric, v_period, p_amount, public.plan_limit(p_tenant, p_metric))
  on conflict (tenant_id, metric, period) do update
    set used = uc.used + excluded.used,
        limit_value = excluded.limit_value,
        updated_at = now()
  returning used, limit_value into v_used, v_limit;
  if v_limit is not null and v_used > v_limit then
    raise exception 'quota_exceeded';
  end if;
  return v_used;
end $$;
revoke execute on function public.increment_usage_for(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.increment_usage_for(uuid, text, bigint) to service_role;

comment on function public.increment_usage_for(uuid, text, bigint) is
  'Bản increment_usage() dùng khi KHÔNG có JWT tenant (máy quét AI trực việc chạy service role). Cùng một bảng usage_counters, cùng một trần theo gói — luật D1, không phải hệ đếm thứ hai.';
