-- Migration #100 — lệnh cho chủ đề + sức khoẻ cầu nối trong /trangthai.
--
-- BA LỖ THẬT, không phải thêm lệnh cho dài danh sách:
--
-- 1. Bot ÂM THẦM chặn câu lạc chủ đề. Người bị chỉ sang chỗ khác mà không biết
--    chủ đề này rốt cuộc dùng để làm gì — luật vô hình thì người ta cứ vi phạm.
--    ⇒ /chude cho ai cũng xem được phạm vi.
--
-- 2. Cột `scope` KHÔNG AI GHI ĐƯỢC. Chủ đề mới thì webhook tự học TÊN nhưng để
--    phạm vi trống (= không giới hạn), và chỉ sửa được bằng cách vào thẳng cơ
--    sở dữ liệu. Bảng có cột mà không có đường ghi là cột chết.
--    ⇒ /phamvi để chủ dự án đặt ngay trong chủ đề đó.
--
-- 3. Không có cách nào biết cầu nối trên máy founder còn sống hay không, trừ
--    khi hỏi một câu rồi chờ. Nhịp tim đã ghi sẵn từ #91 mà chưa ai đọc ra.
--    ⇒ thêm vào /trangthai, KHÔNG đẻ lệnh mới cho một dòng thông tin.

/** Đặt phạm vi cho một chủ đề. Chỉ người có quyền (webhook tự kiểm trước khi gọi). */
create or replace function public.tg_topic_set_scope(
  p_key text, p_chat text, p_thread int, p_scope text
)
returns jsonb
language plpgsql
volatile
security definer set search_path = pg_temp as $$
declare v_name text;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;
  if p_thread is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_topic');
  end if;

  -- Chỉ đặt cho chủ đề ĐÃ BIẾT. Chưa biết nghĩa là chưa ai nhắn trong đó lần
  -- nào — đặt phạm vi cho một luồng chưa từng tồn tại là ghi rác.
  update public.tg_topics
     set scope = nullif(btrim(left(p_scope, 500)), ''), updated_at = now()
   where chat_id = p_chat and thread_id = p_thread
  returning name into v_name;

  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_topic');
  end if;
  return jsonb_build_object('ok', true, 'name', v_name);
end $$;

revoke all on function public.tg_topic_set_scope(text, text, int, text) from public;
grant execute on function public.tg_topic_set_scope(text, text, int, text) to anon, authenticated;

/** Thêm sức khoẻ cầu nối vào /trangthai — nhịp tim có sẵn từ #91, chưa ai đọc. */
create or replace function public.platform_status(p_key text)
returns jsonb
language plpgsql
stable
security definer set search_path = pg_temp as $$
declare
  v_now timestamptz := now();
  v_day_start timestamptz := date_trunc('day', v_now at time zone 'Asia/Ho_Chi_Minh')
                             at time zone 'Asia/Ho_Chi_Minh';
  v_seen timestamptz;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  select max(seen_at) into v_seen from private.bridge_heartbeat where name = 'telegram';

  return jsonb_build_object(
    'tenants_active', (select count(*) from public.tenants
       where deleted_at is null and coalesce(is_sample, false) = false),
    'tenants_24h', (select count(*) from public.tenants
       where deleted_at is null and coalesce(is_sample, false) = false
         and created_at >= v_now - interval '24 hours'),
    'tenants_7d', (select count(*) from public.tenants
       where deleted_at is null and coalesce(is_sample, false) = false
         and created_at >= v_now - interval '7 days'),
    'contacts_total', (select count(*) from public.contacts where deleted_at is null),
    'help_open', (select count(*) from public.help_requests where closed_at is null),
    'sessions_live', (select count(*) from public.support_sessions
       where ended_at is null and expires_at > v_now),
    'bot_asks_today', (select count(*) from public.tg_bridge_queue where created_at >= v_day_start),
    'bot_cost_today', (select coalesce(sum(cost_usd), 0) from public.tg_bridge_queue
       where created_at >= v_day_start),
    'bridge_alive', coalesce(v_seen > v_now - interval '2 minutes', false),
    'bridge_seen_min', case when v_seen is null then null
       else greatest(0, floor(extract(epoch from (v_now - v_seen)) / 60)::int) end,
    'at', to_char(v_now at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
  );
end $$;

revoke all on function public.platform_status(text) from public;
grant execute on function public.platform_status(text) to anon, authenticated;
