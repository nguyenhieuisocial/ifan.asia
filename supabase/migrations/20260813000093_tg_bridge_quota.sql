-- Migration #93 — chặn đốt hạn mức + ghi lại chi phí thật của cầu nối Telegram.
--
-- RỦI RO ĐANG MỞ (chưa ai chạm tới nhưng cửa vẫn mở): bot nằm trong nhóm nhiều
-- người. Mỗi câu hỏi tiêu 3.500–17.000đ hạn mức Claude của founder. Một người
-- nhắn liên tục — vô tình hay cố ý — là **đốt sạch hạn mức tuần**, và founder
-- chỉ biết khi Claude Code báo hết hạn mức giữa lúc đang cần làm việc.
--
-- Chặn ở CỔNG VÀO (webhook) chứ không ở cầu nối: chặn sớm thì người hỏi biết
-- ngay, và câu hỏi không kịp tiêu tốn gì.
--
-- Chủ dự án KHÔNG bị chặn (webhook truyền p_daily_cap = null) — anh ấy trả tiền
-- cho gói này và cần dùng cho việc thật.

alter table public.tg_bridge_queue
  add column if not exists cost_usd numeric(10, 4);

comment on column public.tg_bridge_queue.cost_usd is
  'Chi phí quy đổi của một câu trả lời. Ghi lại để founder thấy mức dùng thật, không phải đoán.';

/**
 * Đẩy câu hỏi vào hàng đợi, có kiểm hạn mức ngày theo NGƯỜI.
 * p_daily_cap null = không giới hạn (dùng cho chủ dự án).
 */
create or replace function public.tg_bridge_enqueue(
  p_key text,
  p_chat text,
  p_thread int,
  p_user text,
  p_text text,
  p_daily_cap int default null
)
returns jsonb
language plpgsql
volatile
security definer set search_path = pg_temp as $$
declare
  v_id bigint;
  v_alive boolean;
  v_today int;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  if p_daily_cap is not null then
    -- Đếm theo NGÀY GIỜ VIỆT NAM, không theo giờ quốc tế: hạn mức phải làm
    -- mới lúc nửa đêm ở đây, không phải 7 giờ sáng.
    select count(*) into v_today
    from public.tg_bridge_queue
    where user_id = p_user
      and created_at >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                        at time zone 'Asia/Ho_Chi_Minh';

    if v_today >= p_daily_cap then
      return jsonb_build_object('over_limit', true, 'used', v_today, 'cap', p_daily_cap);
    end if;
  end if;

  insert into public.tg_bridge_queue (chat_id, thread_id, user_id, question)
  values (p_chat, p_thread, p_user, left(coalesce(p_text, ''), 4000))
  returning id into v_id;

  select coalesce(max(seen_at) > now() - interval '2 minutes', false)
    into v_alive
  from private.bridge_heartbeat where name = 'telegram';

  return jsonb_build_object('id', v_id, 'bridge_alive', v_alive, 'over_limit', false);
end $$;

/** Đóng việc, kèm chi phí để founder theo dõi được mức dùng. */
create or replace function public.tg_bridge_complete(
  p_key text,
  p_id bigint,
  p_answer text,
  p_error text default null,
  p_cost numeric default null
)
returns void
language plpgsql
volatile
security definer set search_path = pg_temp as $$
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  update public.tg_bridge_queue
     set status = case when p_error is null then 'done' else 'failed' end,
         answer = left(p_answer, 8000),
         error = left(p_error, 500),
         cost_usd = p_cost,
         done_at = now()
   where id = p_id;
end $$;

revoke all on function public.tg_bridge_enqueue(text, text, int, text, text, int) from public;
revoke all on function public.tg_bridge_complete(text, bigint, text, text, numeric) from public;
grant execute on function public.tg_bridge_enqueue(text, text, int, text, text, int) to anon, authenticated;
grant execute on function public.tg_bridge_complete(text, bigint, text, text, numeric) to anon, authenticated;

-- Bản cũ 5 tham số không còn ai gọi — bỏ đi để không có hai cửa cùng tên gây
-- nhầm lẫn khi đọc lại sau này.
drop function if exists public.tg_bridge_enqueue(text, text, int, text, text);
drop function if exists public.tg_bridge_complete(text, bigint, text, text);

/** Thêm mức dùng cầu nối hôm nay vào /trangthai — founder thấy số thật. */
create or replace function public.platform_status(p_key text)
returns jsonb
language plpgsql
stable
security definer set search_path = pg_temp as $$
declare
  v_now timestamptz := now();
  v_day_start timestamptz := date_trunc('day', v_now at time zone 'Asia/Ho_Chi_Minh')
                             at time zone 'Asia/Ho_Chi_Minh';
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  return jsonb_build_object(
    'tenants_active', (
      select count(*) from public.tenants
      where deleted_at is null and coalesce(is_sample, false) = false
    ),
    'tenants_24h', (
      select count(*) from public.tenants
      where deleted_at is null and coalesce(is_sample, false) = false
        and created_at >= v_now - interval '24 hours'
    ),
    'tenants_7d', (
      select count(*) from public.tenants
      where deleted_at is null and coalesce(is_sample, false) = false
        and created_at >= v_now - interval '7 days'
    ),
    'contacts_total', (
      select count(*) from public.contacts where deleted_at is null
    ),
    'help_open', (
      select count(*) from public.help_requests where closed_at is null
    ),
    'sessions_live', (
      select count(*) from public.support_sessions
      where ended_at is null and expires_at > v_now
    ),
    'bot_asks_today', (
      select count(*) from public.tg_bridge_queue where created_at >= v_day_start
    ),
    'bot_cost_today', (
      select coalesce(sum(cost_usd), 0) from public.tg_bridge_queue
      where created_at >= v_day_start
    ),
    'at', to_char(v_now at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
  );
end $$;

revoke all on function public.platform_status(text) from public;
grant execute on function public.platform_status(text) to anon, authenticated;
