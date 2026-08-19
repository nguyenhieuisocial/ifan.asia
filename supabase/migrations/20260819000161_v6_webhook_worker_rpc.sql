-- V6 integrations (19/08/2026) — hàm cho worker gửi webhook + đếm lượt khoá API.
-- Đi kèm migration #160. Tách file vì #160 đã áp rồi (không sửa bản đã áp).

-- ════════════════════════════════════════════════════════════════════
-- 1. NHẬN VIỆC
-- ════════════════════════════════════════════════════════════════════
-- Khuôn "claim" giống bot_outbox: đánh dấu ĐANG LÀM trong cùng một câu lệnh với
-- lúc chọn, dùng `for update skip locked`. Không có nó thì hai lượt worker chạy
-- chồng nhau sẽ cùng lấy một phiếu và bên nhận nhận tin hai lần.
create or replace function public.webhook_claim(p_max integer default 20)
returns table (
  delivery_id uuid,
  endpoint_id uuid,
  url         text,
  secret      text,
  event_type  text,
  payload     jsonb,
  attempts    integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with lay as (
    select d.id from public.webhook_deliveries d
     where d.status = 'pending' and d.next_attempt_at <= now()
     order by d.next_attempt_at
     limit p_max
     for update skip locked
  ),
  danh_dau as (
    update public.webhook_deliveries d
       set claimed_at = now(), attempts = d.attempts + 1
      from lay where d.id = lay.id
      returning d.*
  )
  select m.id, m.endpoint_id, e.url, e.secret, m.event_type, m.payload, m.attempts
    from danh_dau m
    join public.webhook_endpoints e on e.id = m.endpoint_id;
end;
$$;
revoke execute on function public.webhook_claim(integer) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 2. GHI KẾT QUẢ
-- ════════════════════════════════════════════════════════════════════
-- Gộp cả hai chiều vào MỘT hàm để phiếu gửi và sức khoẻ đường báo luôn được cập
-- nhật cùng lúc. Tách ra hai lời gọi thì có lúc ghi được cái này mà mất cái kia,
-- và màn hình sẽ hiện đường báo "khoẻ" trong khi phiếu toàn hỏng.
create or replace function public.webhook_ghi_ket_qua(
  p_delivery_id uuid,
  p_thanh_cong  boolean,
  p_loi         text default null,
  p_toi_da_thu  integer default 25,
  p_lan_sau     timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ep  uuid;
  v_thu integer;
begin
  select endpoint_id, attempts into v_ep, v_thu
    from public.webhook_deliveries where id = p_delivery_id;
  if v_ep is null then return; end if;

  if p_thanh_cong then
    update public.webhook_deliveries
       set status = 'sent', sent_at = now(), last_error = null
     where id = p_delivery_id;
    -- Gửi được MỘT lần là đường báo sống lại: đếm hỏng liên tiếp về 0.
    update public.webhook_endpoints
       set consecutive_failures = 0, last_success_at = now()
     where id = v_ep;
  else
    update public.webhook_deliveries
       set status = case when v_thu >= p_toi_da_thu then 'dead' else 'pending' end,
           last_error = left(coalesce(p_loi, 'khong_ro'), 300),
           next_attempt_at = coalesce(p_lan_sau, now() + interval '5 minutes'),
           claimed_at = null
     where id = p_delivery_id;
    update public.webhook_endpoints
       set consecutive_failures = consecutive_failures + 1,
           last_error = left(coalesce(p_loi, 'khong_ro'), 300),
           last_error_at = now()
     where id = v_ep;
  end if;
end;
$$;
revoke execute on function public.webhook_ghi_ket_qua(uuid, boolean, text, integer, timestamptz)
  from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 3. THẢ PHIẾU BỊ KẸT
-- ════════════════════════════════════════════════════════════════════
-- Worker chết giữa chừng (hết giờ chạy, máy chủ khởi động lại) thì phiếu đã nhận
-- nằm lại với claimed_at còn nguyên và KHÔNG AI lấy nữa — hàng đợi tắc im lặng.
-- Quá 10 phút thì coi như worker đó đã chết, thả phiếu cho lượt sau.
create or replace function public.webhook_tha_phieu_ket()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  update public.webhook_deliveries
     set claimed_at = null
   where status = 'pending' and claimed_at is not null
     and claimed_at < now() - interval '10 minutes';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.webhook_tha_phieu_ket() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 4. GHI MỐC DÙNG KHOÁ API
-- ════════════════════════════════════════════════════════════════════
-- Cột "dùng lần cuối" là thứ quan trọng nhất của màn Khoá API (quyết định 3 của
-- thẻ design): khoá không ai dùng mà vẫn sống là cửa mở bỏ quên.
create or replace function public.api_key_touch(p_key_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.api_keys
     set last_used_at = now(), call_count = call_count + 1
   where id = p_key_id and status = 'active';
$$;
revoke execute on function public.api_key_touch(uuid) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 5. DỌN PHIÊN TREO — bảo vệ khả năng SỬA CẤU TRÚC của cả hệ thống
-- ════════════════════════════════════════════════════════════════════
-- Đo được 19/08 khi migration #160 bị chặn ba lượt liền: một kết nối bỏ dở nằm
-- "idle in transaction" 215 giây, giữ khoá trên hàng loạt bảng. Và
-- `idle_in_transaction_session_timeout` đang là 0 — CSDL KHÔNG tự dọn, nghĩa là
-- một giao dịch bị bỏ quên có thể chặn MỌI thay đổi cấu trúc vô thời hạn.
--
-- 5 phút đủ rộng cho mọi giao dịch thật của app (giao dịch dài nhất là bộ kiểm
-- rls-smoke, ~90 giây) và đủ chặt để một kết nối chết không khoá cả hệ thống.
do $$
begin
  execute format('alter database %I set idle_in_transaction_session_timeout = %L',
                 current_database(), '5min');
exception when insufficient_privilege then
  raise warning '[ops] không đủ quyền đặt idle_in_transaction_session_timeout — cần làm trên Dashboard';
end;
$$;
