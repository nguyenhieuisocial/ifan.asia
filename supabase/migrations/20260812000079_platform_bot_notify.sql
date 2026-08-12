-- ============================================================
-- iFan.asia — Migration #79: "Chuông nền tảng" — bot Zalo riêng báo founder
-- khi có "Cần giúp?" hoặc cảnh báo hệ thống (ADR-0007, docs/adr/0007-chuong-
-- canh-bao-nen-tang.md). Đọc chú thích đầu ADR trước khi sửa file này.
--
-- KHÔNG dùng lại notification_channels/staff_channel_links/bot_outbox (#53) —
-- 5 bảng đó đều buộc tenant_id, mà founder không phải thành viên tiệm nào
-- (ADR mục 3 phương án A). Token là hằng số (Vault 'platform_bot:token', đã
-- cất 12/08), chat id founder cũng là hằng số (private.app_config) — MỘT
-- người nhận, không cần bảng kênh/ghép nối. Chỉ thêm MỘT bảng hàng đợi.
--
--   platform_outbox        -- hàng đợi tin chờ gửi, KHÔNG tenant_id
--   platform_notify()      -- nội bộ: chưa ghép nối → im lặng bỏ qua, có vé
--                             chống trùng theo dedupe_key (revoke khỏi client)
--   help_requests_platform_notify_trigger   -- AFTER INSERT, vé 'help:<id>'
--   system_alerts_platform_notify_trigger   -- AFTER INSERT OR UPDATE,
--                                               vé 'alert:<job_id>:<ngày VN>'
--   platform_claim_outbox / platform_complete_outbox  -- worker (route), y
--                             khuôn bot_claim_outbox/bot_complete_outbox (#54)
--   platform_bot_new_pair_code / platform_bot_pair / platform_webhook_token
--                           -- ghép nối qua "/link <mã>", y khuôn #53
--
-- NỘI DUNG TIN: chỉ tín hiệu (tên tiệm + có/không cho xem màn hình + dẫn mở
-- /admin) — TUYỆT ĐỐI không kèm help_requests.message (ADR mục 5: giữ nguyên
-- vẹn nhật ký admin_audit_logs, không mở đường vòng đọc mà không để lại vết).
-- ============================================================

-- ---------- platform_outbox: hàng đợi tin chờ gửi (một người nhận) ----------

create table public.platform_outbox (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('help_request', 'system_alert')),
  -- Vé chống trùng: 'help:<id>' (1 yêu cầu = tối đa 1 tin) hoặc
  -- 'alert:<job_id>:<ngày VN>' (1 job hỏng = tối đa 1 tin/ngày).
  dedupe_key text not null unique,
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

comment on table public.platform_outbox is
  'Hàng đợi tin Zalo báo founder (ADR-0007) — không tenant_id, một người nhận duy nhất (private.app_config.platform_bot_chat_id).';

create index platform_outbox_pending_idx on public.platform_outbox (status, id)
  where status in ('pending', 'sending');

alter table public.platform_outbox enable row level security;
-- RLS bật, KHÔNG policy, KHÔNG grant — đúng quy ước platform_admins/
-- admin_audit_logs (ADR mục 8): đây là dữ liệu vận hành nền tảng, không phải
-- dữ liệu của một tiệm cụ thể nào để mà cấp select-rồi-chặn-bằng-policy.
revoke all on public.platform_outbox from anon, authenticated;

-- ---------- platform_notify: xếp tin vào hàng đợi (nội bộ, trigger gọi) ----------

create or replace function public.platform_notify(
  p_kind text,
  p_dedupe_key text,
  p_body text
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  -- Chưa ghép nối (founder chưa nhắn "/link <mã>") → đứng yên im lặng, không
  -- lỗi, không sinh dòng nào (hai chế độ như mọi cửa bot khác trong kho).
  if (select value from private.app_config where key = 'platform_bot_chat_id') is null then
    return;
  end if;

  insert into public.platform_outbox (kind, dedupe_key, body)
    values (p_kind, p_dedupe_key, p_body)
    on conflict (dedupe_key) do nothing;
end $$;

comment on function public.platform_notify is
  'Xếp tin vào platform_outbox nếu đã ghép nối; vé chống trùng theo dedupe_key. Chỉ gọi từ trigger nội bộ.';

-- Chỉ trigger nội bộ gọi — không mở cho client (đúng lỗi tự gây ở #77, đã vá #78).
revoke execute on function public.platform_notify(text, text, text) from anon, authenticated, public;

-- ---------- Trigger: yêu cầu "Cần giúp?" mới → chuông ----------

create or replace function public.help_requests_platform_notify()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant_name text;
begin
  select name into v_tenant_name from public.tenants where id = new.tenant_id;

  perform public.platform_notify(
    'help_request',
    'help:' || new.id,
    'iFan — tiệm "' || coalesce(v_tenant_name, new.tenant_id::text) || '" vừa bấm Cần giúp?'
      || case when new.allow_screen_view then ' (đã cho phép xem màn hình)' else '' end
      || E'.\nMở /admin để xử lý.'
  );
  return new;
end $$;

comment on function public.help_requests_platform_notify is
  'Báo founder qua Zalo khi có yêu cầu "Cần giúp?" mới — CHỈ tín hiệu, không kèm nội dung message (ADR-0007 mục 5).';

revoke execute on function public.help_requests_platform_notify() from anon, authenticated, public;

drop trigger if exists help_requests_platform_notify_trigger on public.help_requests;
create trigger help_requests_platform_notify_trigger
  after insert on public.help_requests
  for each row execute function public.help_requests_platform_notify();

-- ---------- Trigger: cảnh báo hệ thống mới/lặp lại → chuông (tối đa 1 tin/ngày/job) ----------

create or replace function public.system_alerts_platform_notify()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  perform public.platform_notify(
    'system_alert',
    'alert:' || new.job_id || ':' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
    'iFan — cảnh báo hệ thống: job "' || new.job_name || '" đang hỏng.' || E'\n' || left(new.detail, 1500)
  );
  return new;
end $$;

comment on function public.system_alerts_platform_notify is
  'Báo founder qua Zalo khi có cảnh báo hệ thống mới hoặc job vẫn còn hỏng — vé chống trùng theo job+ngày, tối đa 1 tin/ngày/job.';

revoke execute on function public.system_alerts_platform_notify() from anon, authenticated, public;

drop trigger if exists system_alerts_platform_notify_trigger on public.system_alerts;
create trigger system_alerts_platform_notify_trigger
  after insert or update on public.system_alerts
  for each row execute function public.system_alerts_platform_notify();

-- ---------- platform_claim_outbox: worker nhận lô tin chờ (route gọi, có khóa) ----------
-- Y khuôn bot_claim_outbox (#54), bỏ tenant_id — chat id + token là hằng số,
-- tra tại thời điểm claim (không chốt cứng vào từng dòng lúc insert): đổi bot
-- hay đổi chat id giữa chừng thì tin đang chờ vẫn gửi đúng đích mới.
create or replace function public.platform_claim_outbox(p_key text, p_batch int default 20)
returns table (o_id bigint, o_chat text, o_kind text, o_body text, o_token text)
language plpgsql
security definer set search_path = pg_temp as $$
declare
  v_chat text;
  v_token text;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;
  if p_batch is null or p_batch < 1 or p_batch > 100 then
    raise exception 'invalid_input';
  end if;

  select value into v_chat from private.app_config where key = 'platform_bot_chat_id';
  select ds.decrypted_secret into v_token from vault.decrypted_secrets ds
    where ds.name = 'platform_bot:token';

  -- Chưa ghép nối hoặc chưa có token → đứng yên, không claim gì (two-mode).
  if v_chat is null or v_token is null then
    return;
  end if;

  update public.platform_outbox o
    set status = 'failed', last_error = coalesce(o.last_error, 'max_attempts')
    where o.status = 'sending'
      and o.claimed_at < now() - interval '10 minutes'
      and o.attempts >= 5;

  return query
  with pick as (
    select o.id
    from public.platform_outbox o
    where (o.status = 'pending'
           or (o.status = 'sending' and o.claimed_at < now() - interval '10 minutes'))
      and o.attempts < 5
    order by o.id
    limit p_batch
    for update of o skip locked
  ),
  claimed as (
    update public.platform_outbox o
      set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
      where o.id in (select p.id from pick p)
      returning o.id, o.kind, o.body
  )
  select c.id, v_chat, c.kind, c.body, v_token
  from claimed c;
end $$;
revoke all on function public.platform_claim_outbox(text, int) from public;
grant execute on function public.platform_claim_outbox(text, int) to anon, authenticated;

-- ---------- platform_complete_outbox: worker báo kết quả từng tin ----------
-- Y khuôn bot_complete_outbox (#54), bỏ đếm quota — một người nhận, khối
-- lượng cực nhỏ, chưa có lý do thật để theo dõi trần 3.000 tin/tháng riêng.
create or replace function public.platform_complete_outbox(
  p_key text,
  p_id bigint,
  p_ok boolean,
  p_error text default null
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  if p_ok then
    update public.platform_outbox set status = 'sent', sent_at = now(), last_error = null
      where id = p_id;
  else
    update public.platform_outbox
      set status = case when attempts >= 5 then 'failed' else 'pending' end,
          last_error = left(coalesce(p_error, 'send_failed'), 500)
      where id = p_id;
  end if;
end $$;
revoke all on function public.platform_complete_outbox(text, bigint, boolean, text) from public;
grant execute on function public.platform_complete_outbox(text, bigint, boolean, text) to anon, authenticated;

-- ---------- Ghép nối: mã một lần, không dựng màn hình (ADR mục 6) ----------

-- Chỉ platform admin gọi được — đủ để dùng qua SQL editor / script một lần,
-- chưa có nhu cầu thật để dựng nút bấm riêng (mục 2 luật chung: không xây
-- trước khi cần).
create or replace function public.platform_bot_new_pair_code()
returns text
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_code text;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into private.app_config (key, value) values ('platform_bot_pair_code', v_code)
    on conflict (key) do update set value = excluded.value;
  return v_code;
end $$;
revoke all on function public.platform_bot_new_pair_code() from public, anon;
grant execute on function public.platform_bot_new_pair_code() to authenticated;

-- Webhook gọi khi founder nhắn "/link <mã>" — khóa worker + mã một lần, y
-- khuôn bot_link_via_code. Trả kèm bot_token để route nhắn xác nhận lại
-- (cả hai nhánh, kể cả mã sai) — token chỉ lộ cho bên cầm khóa worker.
create or replace function public.platform_bot_pair(
  p_key text,
  p_chat_id text,
  p_code text
) returns jsonb
language plpgsql
security definer set search_path = pg_temp as $$
declare
  v_token text;
  v_expected text;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  select ds.decrypted_secret into v_token from vault.decrypted_secrets ds
    where ds.name = 'platform_bot:token';

  if p_chat_id is null or length(p_chat_id) < 1 or length(p_chat_id) > 128
     or p_code is null then
    return jsonb_build_object('status', 'invalid', 'bot_token', v_token);
  end if;

  select value into v_expected from private.app_config where key = 'platform_bot_pair_code';
  if v_expected is null or btrim(p_code) <> v_expected then
    return jsonb_build_object('status', 'invalid', 'bot_token', v_token);
  end if;

  insert into private.app_config (key, value) values ('platform_bot_chat_id', p_chat_id)
    on conflict (key) do update set value = excluded.value;
  -- Mã dùng một lần — xóa ngay sau khi tiêu, không đợi hết hạn theo giờ.
  delete from private.app_config where key = 'platform_bot_pair_code';

  return jsonb_build_object('status', 'linked', 'bot_token', v_token);
end $$;
revoke all on function public.platform_bot_pair(text, text, text) from public;
grant execute on function public.platform_bot_pair(text, text, text) to anon, authenticated;

-- Tin thường (không phải "/link") gửi tới bot nền tảng → route vẫn lịch sự
-- chỉ đường, y khuôn bot_webhook_token.
create or replace function public.platform_webhook_token(p_key text)
returns text
language plpgsql
stable
security definer set search_path = pg_temp as $$
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;
  return (
    select ds.decrypted_secret from vault.decrypted_secrets ds
      where ds.name = 'platform_bot:token'
  );
end $$;
revoke all on function public.platform_webhook_token(text) from public;
grant execute on function public.platform_webhook_token(text) to anon, authenticated;
