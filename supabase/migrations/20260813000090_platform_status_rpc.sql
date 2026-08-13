-- Migration #90 — RPC `platform_status` cho bot Telegram nội bộ đội ngũ.
--
-- Vì sao là RPC security definer chứ KHÔNG dùng service_role key ở webhook:
-- service_role bỏ qua toàn bộ RLS, lỡ rò là mất sạch dữ liệu mọi tiệm. Hàm
-- này chỉ trả về SỐ ĐẾM TỔNG HỢP toàn nền tảng — không một dòng dữ liệu khách
-- nào ra ngoài — nên quyền cấp cho webhook đúng bằng thứ nó cần, không hơn
-- (khuôn `platform_webhook_token` migration #79).
--
-- Cổng vào: p_key phải khớp private.app_config['bot_ingest_key'] — CÙNG khoá
-- các cửa bot khác đang dùng, không sinh thêm bí mật phải quản lý riêng.

create or replace function public.platform_status(p_key text)
returns jsonb
language plpgsql
stable
security definer set search_path = pg_temp as $$
declare
  v_now timestamptz := now();
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  return jsonb_build_object(
    -- Tiệm mẫu (is_sample) là dữ liệu trình diễn của chính iFan, KHÔNG phải
    -- khách — đếm vào là tự lừa mình về quy mô thật.
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
    -- "Cần giúp?" còn treo — lọc theo closed_at chứ không theo cột status:
    -- bảng chưa có dòng nào nên tập giá trị status thật chưa quan sát được,
    -- closed_at is null thì đúng ở mọi trường hợp.
    'help_open', (
      select count(*) from public.help_requests where closed_at is null
    ),
    'sessions_live', (
      select count(*) from public.support_sessions
      where ended_at is null and expires_at > v_now
    ),
    'at', to_char(v_now at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
  );
end $$;

revoke all on function public.platform_status(text) from public;
grant execute on function public.platform_status(text) to anon, authenticated;

comment on function public.platform_status(text) is
  'Số đếm tổng hợp toàn nền tảng cho bot nội bộ (Telegram). Chỉ trả số, không trả dữ liệu khách.';
