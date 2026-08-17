-- ============================================================
-- iFan.asia — Migration #133: `platform_status()` đếm `contacts_total` gộp cả
-- khách của tiệm mẫu/demo, trong khi `tenants_active`/`tenants_24h`/
-- `tenants_7d` (cùng hàm) đã lọc đúng `is_sample=false`. Phát hiện lúc soát
-- lại V3 (task #148).
--
-- ĐO THẬT trên CSDL production trước khi vá: 86 khách đang có trong hệ
-- thống, nhưng **0 khách thuộc tiệm KHÔNG PHẢI mẫu** — nghĩa là con số bot
-- báo cho founder ("N khách") từ trước tới nay **100% là dữ liệu demo**,
-- không phải khách thật nào cả. Sửa ĐÚNG MỘT dòng, thêm join + lọc cùng
-- khuôn với 3 dòng tenants_* ngay phía trên.
-- ============================================================

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
    -- Sửa #148: loại khách của tiệm mẫu — cùng luật với tenants_* ở trên.
    'contacts_total', (select count(*) from public.contacts c
       join public.tenants t on t.id = c.tenant_id
       where c.deleted_at is null and coalesce(t.is_sample, false) = false),
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
