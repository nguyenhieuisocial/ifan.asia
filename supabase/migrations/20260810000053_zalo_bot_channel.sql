-- ============================================================
-- iFan.asia — Migration #53: Zalo Bot nhắc việc — kênh + ghép nối nhân viên
-- (việc #53 sổ theo dõi; nền tảng bot.zapps.me — API kiểu Telegram, đã xác minh:
--  base https://bot-api.zaloplatforms.com/bot{token}/{method}, miễn phí ~3.000 tin/tháng)
--
-- Phần 1/2 (phần 2 = #54: bản tin digest + hàng đợi gửi + cron).
--   notification_channels  -- bot Zalo của TIỆM (token vào Vault, không plaintext — pattern #10)
--   staff_channel_links    -- nhân viên ↔ chat id Zalo cá nhân (ghép qua mã /link)
--   channel_quota          -- đếm tin đã gửi mỗi tháng (trần miễn phí 3.000)
--   notification_prefs     -- sở thích từng người: bật/tắt loại + giờ nhận bản tin
--   link_codes             -- mã ghép nối 6 số, TTL 10 phút, dùng một lần
--   bot_outbox             -- hàng đợi tin chờ gửi (vé chống trùng theo user+ngày+loại)
--   RPC: connect/disconnect_zalo_bot (owner/admin), bot_notify_status,
--        bot_create_link_code (member), bot_link_via_code + bot_webhook_token
--        (worker, khóa 'bot_ingest_key' trong private.app_config — pattern #5)
--
-- Hai chế độ (như AI gateway): tiệm CHƯA dán token / Vercel CHƯA đặt env
-- BOT_INGEST_KEY → mọi thứ im lặng đứng yên, không lỗi, không spam log.
-- Chuẩn: theo #4/#5/#10/#44 — text+check, timestamptz, definer set search_path
--        (ghim pg_temp — chốt #40), revoke trước grant, policy bọc (select ...).
-- ============================================================

-- ---------- khóa worker (route đọc env BOT_INGEST_KEY khớp giá trị này) ----------
-- Lấy khóa để cấu hình env cho web app:
--   select value from private.app_config where key = 'bot_ingest_key';
-- Khóa này đồng thời là secret_token khi đăng ký webhook với nền tảng bot
-- (nền tảng gửi lại trong header X-Bot-Api-Secret-Token — route so khớp).
insert into private.app_config (key, value)
  values ('bot_ingest_key', encode(gen_random_bytes(24), 'hex'))
  on conflict (key) do nothing;

-- ---------- notification_channels: bot Zalo của tiệm ----------

create table public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('zalo_bot')), -- mai mở rộng: 'zns', 'zalo_oa'
  -- Token nằm trong Vault (secret 'bot:{id}:token') — cột này chỉ giữ uuid secret.
  token_secret_id uuid,
  display_name text, -- account_name của bot (getMe) — nhân viên tìm bot theo tên này
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, kind) -- mỗi tiệm một bot mỗi loại kênh
);

comment on table public.notification_channels is
  'Kênh thông báo ra ngoài của tiệm (đợt 1: Zalo Bot). Token trong Vault, không plaintext.';

alter table public.notification_channels enable row level security;

-- Chỉ owner/admin thấy chi tiết kênh (token thì KHÔNG AI thấy — nằm trong Vault).
-- Nhân viên thường biết "tiệm có bot chưa" qua RPC bot_notify_status bên dưới.
create policy notification_channels_select on public.notification_channels
  for select using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );
-- KHÔNG policy ghi: mọi đường ghi đi qua RPC definer connect/disconnect_zalo_bot.

revoke all on public.notification_channels from anon;
grant select on public.notification_channels to authenticated;

-- ---------- staff_channel_links: nhân viên ↔ chat Zalo cá nhân ----------

create table public.staff_channel_links (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_chat_id text not null check (length(external_chat_id) between 1 and 128),
  linked_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

comment on table public.staff_channel_links is
  'Ghép nối nhân viên với chat Zalo cá nhân (qua mã /link). Mỗi người một chat mỗi tiệm.';

alter table public.staff_channel_links enable row level security;

-- Member chỉ thấy/hủy ghép nối CỦA MÌNH — chat id cá nhân không phải việc của đồng nghiệp.
create policy staff_channel_links_select on public.staff_channel_links
  for select using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );
create policy staff_channel_links_delete on public.staff_channel_links
  for delete using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );
-- KHÔNG policy insert/update: chỉ webhook (RPC definer bot_link_via_code) được ghi.

revoke all on public.staff_channel_links from anon;
grant select, delete on public.staff_channel_links to authenticated;

-- ---------- channel_quota: đếm 3.000 tin miễn phí/tháng ----------

create table public.channel_quota (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  month date not null, -- ngày đầu tháng theo giờ VN
  sent_count int not null default 0,
  primary key (tenant_id, month)
);

comment on table public.channel_quota is
  'Số tin Zalo Bot đã gửi mỗi tháng (trần miễn phí 3.000 — vượt là dừng, xem #54).';

alter table public.channel_quota enable row level security;

-- Owner/admin xem mức dùng trên màn cài đặt; ghi chỉ qua definer (bot_complete_outbox #54).
create policy channel_quota_select on public.channel_quota
  for select using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );

revoke all on public.channel_quota from anon;
grant select on public.channel_quota to authenticated;

-- ---------- notification_prefs: sở thích nhận của từng người ----------

-- pref jsonb, ví dụ:
--   {"enabled": true, "digest_hour": 8, "kinds": {"sla": true, "today": true, "unread": true}}
-- Thiếu khóa nào thì #54 coi như bật/mặc định 8h — client cũ không làm hỏng digest.
create table public.notification_prefs (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pref jsonb not null default '{}'::jsonb check (jsonb_typeof(pref) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

comment on table public.notification_prefs is
  'Sở thích thông báo qua Zalo Bot của từng nhân viên (bật/tắt loại + giờ nhận bản tin).';

alter table public.notification_prefs enable row level security;

-- Member đọc/ghi pref CỦA MÌNH (spec B26). Ghi trực tiếp từ server action —
-- shape đã được zod kiểm; DB chỉ giữ ràng buộc "phải là object".
create policy notification_prefs_select on public.notification_prefs
  for select using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );
create policy notification_prefs_insert on public.notification_prefs
  for insert with check (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );
create policy notification_prefs_update on public.notification_prefs
  for update using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );

revoke all on public.notification_prefs from anon;
grant select, insert, update on public.notification_prefs to authenticated;

-- ---------- link_codes: mã ghép nối 6 số, TTL 10 phút ----------

create table public.link_codes (
  code text primary key check (code ~ '^\d{6}$'),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.link_codes enable row level security;
-- RLS bật, KHÔNG policy → authenticated select luôn 0 dòng; ghi bị chặn hẳn.
-- Giữ grant select (convention bảng tenant-scoped của repo — rls-smoke quét
-- generic bằng select, đóng cửa bằng POLICY chứ không bằng revoke).
revoke all on public.link_codes from anon, authenticated;
grant select on public.link_codes to authenticated;

-- ---------- bot_outbox: hàng đợi tin chờ gửi ----------

create table public.bot_outbox (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_chat_id text not null,
  kind text not null check (kind in ('digest', 'test')),
  -- Vé chống trùng (học FlowX #52): digest = 'digest:<ngày VN>' → mỗi người tối đa
  -- MỘT bản tin mỗi ngày, cron chạy lại không dội bom; test = 'test:<uuid>' (không chặn).
  dedupe_key text not null,
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, dedupe_key)
);

create index bot_outbox_pending_idx on public.bot_outbox (status, id)
  where status in ('pending', 'sending');

alter table public.bot_outbox enable row level security;
-- RLS bật, KHÔNG policy → authenticated select luôn 0 dòng; mọi đường ghi đi
-- qua RPC definer (#54). Giữ grant select như link_codes ở trên.
revoke all on public.bot_outbox from anon, authenticated;
grant select on public.bot_outbox to authenticated;

-- ---------- connect_zalo_bot: owner/admin dán token bot ----------

-- Token đi thẳng vào Vault (secret 'bot:{channel_id}:token') — pattern y hệt
-- connect_zalo_channel (#10). p_bot_name = account_name từ getMe (server action
-- đã gọi để kiểm token sống trước khi lưu).
create or replace function public.connect_zalo_bot(
  p_token text,
  p_bot_name text default null
) returns uuid
language plpgsql
security definer set search_path = pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.app_role();
  v_id uuid;
  v_secret_name text;
  v_secret_id uuid;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;
  if p_token is null or length(btrim(p_token)) < 10 or length(btrim(p_token)) > 512 then
    raise exception 'invalid_input';
  end if;

  select id into v_id from public.notification_channels
    where tenant_id = v_tenant and kind = 'zalo_bot';
  if v_id is null then
    insert into public.notification_channels (tenant_id, kind)
      values (v_tenant, 'zalo_bot')
      returning id into v_id;
  end if;

  v_secret_name := 'bot:' || v_id || ':token';
  select id into v_secret_id from vault.secrets where name = v_secret_name;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(btrim(p_token), v_secret_name);
  else
    perform vault.update_secret(v_secret_id, btrim(p_token));
  end if;

  update public.notification_channels
    set token_secret_id = v_secret_id,
        display_name = coalesce(nullif(btrim(p_bot_name), ''), display_name),
        connected_at = now()
    where id = v_id;

  return v_id;
end $$;
revoke all on function public.connect_zalo_bot(text, text) from public, anon;
grant execute on function public.connect_zalo_bot(text, text) to authenticated;

-- ---------- disconnect_zalo_bot: owner/admin gỡ bot ----------

-- Xóa secret Vault + xóa row kênh. GIỮ staff_channel_links + notification_prefs:
-- dán token mới là chạy lại ngay, nhân viên không phải ghép nối lại.
create or replace function public.disconnect_zalo_bot()
returns void
language plpgsql
security definer set search_path = pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.app_role();
  v_id uuid;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;

  select id into v_id from public.notification_channels
    where tenant_id = v_tenant and kind = 'zalo_bot';
  if v_id is null then
    raise exception 'not_connected';
  end if;

  delete from vault.secrets where name = 'bot:' || v_id || ':token';
  delete from public.notification_channels where id = v_id;
end $$;
revoke all on function public.disconnect_zalo_bot() from public, anon;
grant execute on function public.disconnect_zalo_bot() to authenticated;

-- ---------- bot_notify_status: một RPC cho cả màn cài đặt ----------

-- Trả đúng phần MỖI VAI được thấy: member biết tiệm có bot chưa + trạng thái
-- ghép nối + pref của mình; owner/admin thêm quota + ngày kết nối. Token không
-- bao giờ đi qua đây.
create or replace function public.bot_notify_status()
returns jsonb
language plpgsql
stable
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_uid uuid := auth.uid();
  v_role text := public.app_role();
  v_admin boolean := v_role in ('owner', 'admin');
  v_ch record;
  v_link record;
  v_pref jsonb;
  v_quota int;
begin
  if v_tenant is null or v_uid is null then
    raise exception 'no_tenant_context';
  end if;

  select id, display_name, token_secret_id, connected_at into v_ch
    from notification_channels
    where tenant_id = v_tenant and kind = 'zalo_bot';

  select external_chat_id, linked_at into v_link
    from staff_channel_links
    where tenant_id = v_tenant and user_id = v_uid;

  select pref into v_pref
    from notification_prefs
    where tenant_id = v_tenant and user_id = v_uid;

  select sent_count into v_quota
    from channel_quota
    where tenant_id = v_tenant
      and month = date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date;

  return jsonb_build_object(
    'has_channel', v_ch.id is not null,
    'has_token', v_ch.token_secret_id is not null,
    'bot_name', v_ch.display_name,
    'connected_at', case when v_admin then v_ch.connected_at end,
    'quota_used', case when v_admin then coalesce(v_quota, 0) end,
    'quota_limit', case when v_admin then 3000 end,
    'linked', v_link.linked_at is not null,
    'linked_at', v_link.linked_at,
    'pref', coalesce(v_pref, '{}'::jsonb)
  );
end $$;
revoke all on function public.bot_notify_status() from public, anon;
grant execute on function public.bot_notify_status() to authenticated;

-- ---------- bot_create_link_code: member lấy mã 6 số ----------

create or replace function public.bot_create_link_code()
returns text
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_uid uuid := auth.uid();
  v_code text;
  v_try int := 0;
begin
  if v_tenant is null or v_uid is null then
    raise exception 'no_tenant_context';
  end if;
  -- Chưa có bot thì không phát mã — màn cài đặt cũng đã ẩn nút.
  if not exists (
    select 1 from notification_channels
      where tenant_id = v_tenant and kind = 'zalo_bot'
  ) then
    raise exception 'no_bot';
  end if;

  -- Dọn mã hết hạn + mã cũ của chính người này (mỗi người một mã sống).
  delete from link_codes
    where expires_at < now() or (tenant_id = v_tenant and user_id = v_uid);

  -- random() đủ cho mã 6 số sống 10 phút, dùng một lần: cửa đoán mã là webhook
  -- vốn đã khóa bằng secret_token của nền tảng bot + rate limit IP.
  loop
    v_try := v_try + 1;
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into link_codes (code, tenant_id, user_id, expires_at)
        values (v_code, v_tenant, v_uid, now() + interval '10 minutes');
      exit;
    exception when unique_violation then
      if v_try >= 5 then raise exception 'code_collision'; end if;
    end;
  end loop;

  return v_code;
end $$;
revoke all on function public.bot_create_link_code() from public, anon;
grant execute on function public.bot_create_link_code() to authenticated;

-- ---------- bot_link_via_code: webhook tiêu mã → ghi ghép nối (worker) ----------

-- Gọi từ route webhook (khóa bot_ingest_key — pattern ingest_zalo_event #5).
-- Trả kèm bot_token (Vault) để route nhắn xác nhận lại cho nhân viên; token chỉ
-- lộ cho bên cầm khóa worker, không bao giờ tới client.
create or replace function public.bot_link_via_code(
  p_key text,
  p_channel uuid,
  p_chat_id text,
  p_code text
) returns jsonb
language plpgsql
security definer set search_path = pg_temp as $$
declare
  v_ch record;
  v_token text;
  v_row record;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  select id, tenant_id into v_ch from public.notification_channels
    where id = p_channel and kind = 'zalo_bot';
  if v_ch.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select ds.decrypted_secret into v_token from vault.decrypted_secrets ds
    where ds.name = 'bot:' || v_ch.id || ':token';

  if p_chat_id is null or length(p_chat_id) < 1 or length(p_chat_id) > 128
     or p_code is null or btrim(p_code) !~ '^\d{6}$' then
    return jsonb_build_object('status', 'invalid', 'bot_token', v_token);
  end if;

  delete from public.link_codes where expires_at < now();

  -- Mã phải thuộc ĐÚNG tenant của bot nhận tin — mã tiệm khác không ghép được
  -- (chặn nhầm lẫn cross-tenant khi một người làm ở hai tiệm).
  select code, tenant_id, user_id into v_row from public.link_codes
    where code = btrim(p_code) and tenant_id = v_ch.tenant_id and expires_at >= now();
  if v_row.code is null then
    return jsonb_build_object('status', 'invalid', 'bot_token', v_token);
  end if;

  insert into public.staff_channel_links (tenant_id, user_id, external_chat_id)
    values (v_row.tenant_id, v_row.user_id, p_chat_id)
    on conflict (tenant_id, user_id)
    do update set external_chat_id = excluded.external_chat_id, linked_at = now();

  delete from public.link_codes where code = v_row.code;

  return jsonb_build_object('status', 'linked', 'bot_token', v_token);
end $$;
revoke all on function public.bot_link_via_code(text, uuid, text, text) from public;
grant execute on function public.bot_link_via_code(text, uuid, text, text) to anon, authenticated;

-- ---------- bot_webhook_token: route lấy token trả lời tin thường (worker) ----------

-- Nhân viên nhắn gì đó không phải /link → route vẫn lịch sự chỉ đường. Trả null
-- khi kênh không tồn tại/chưa có token — route im lặng (two-mode).
create or replace function public.bot_webhook_token(p_key text, p_channel uuid)
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
    select ds.decrypted_secret
    from public.notification_channels nc
    join vault.decrypted_secrets ds on ds.name = 'bot:' || nc.id || ':token'
    where nc.id = p_channel and nc.kind = 'zalo_bot'
  );
end $$;
revoke all on function public.bot_webhook_token(text, uuid) from public;
grant execute on function public.bot_webhook_token(text, uuid) to anon, authenticated;
