-- ============================================================
-- iFan.asia — Migration #23: Live Chat widget (kênh website)
-- Spec: "02 Omnichannel Inbox" §4.5/§4.6 + Quy hoạch GĐ2 "Live Chat widget".
--
-- ĐÂY LÀ ĐIỂM CHẠM INTERNET KHÔNG XÁC THỰC. Nguyên tắc bảo mật:
--   1. Khách vãng lai KHÔNG có JWT → mọi thao tác đi qua RPC security definer
--      nhận (embed_key + Origin + visitor token). Client KHÔNG bao giờ chạm
--      thẳng bảng (không policy insert/update cho anon ở bất kỳ bảng nào).
--   2. embed_key là khóa CÔNG KHAI (nằm trong mã nguồn trang khách) — nó CHỈ
--      resolve ra 1 kênh và CHỈ trả về lời chào do chủ shop tự soạn. Không trả
--      tên tenant, id tenant, tên kênh hay bất kỳ dữ liệu nội bộ nào.
--   3. Cổng thật là whitelist tên miền (config.allowed_origins). Sai khóa và
--      sai tên miền trả CÙNG một lỗi 'forbidden' → không dò được khóa hợp lệ.
--   4. Token phiên khách: 32 byte ngẫu nhiên sinh ở tầng web, DB chỉ lưu
--      sha256 → lộ DB cũng không chiếm được phiên. Khách A không thể đọc hội
--      thoại khách B vì mọi truy vấn neo theo token_hash.
--   5. Ghi chú nội bộ (sender_type='system') TUYỆT ĐỐI không lọt ra widget —
--      livechat_poll lọc trắng danh sách sender_type.
--   6. Rate limit nằm Ở TẦNG DB (không phải chỉ ở app): lib/rate-limit.ts
--      fail-open khi chưa cấu hình Upstash, không thể là chốt chặn duy nhất.
--
-- channels.embed_key            -- khóa nhúng công khai, CHỈ RPC definer đặt được
-- livechat_visitors             -- phiên khách vãng lai (token hash + bộ đếm rate limit)
-- livechat_setup()              -- owner/admin: bật/tắt, lời chào, whitelist tên miền
-- livechat_session()            -- anon: bootstrap widget + nối lại hội thoại cũ
-- livechat_send()               -- anon: khách gửi tin (tạo phiên ở tin đầu tiên)
-- livechat_poll()               -- anon: lấy tin mới của ĐÚNG phiên đó
-- Chuẩn: theo migration #4/#5/#10 — text+check, timestamptz, definer
--        set search_path, revoke public trước khi grant đích danh.
-- ============================================================

-- ---------- Hằng số nghiệp vụ (đồng bộ với lib/channels/livechat.ts) ----------
-- Tin tối đa 2000 ký tự · 20 tin/60s mỗi khách · 240 lượt poll/60s mỗi khách
-- · 10 phiên mới/giờ mỗi (kênh, IP) · tối đa 10 tên miền whitelist.

-- ---------- channels: khóa nhúng công khai ----------

alter table public.channels
  add column if not exists embed_key text;

-- Khóa nhúng là định danh TOÀN CỤC (widget chỉ gửi khóa, không gửi tenant).
create unique index if not exists channels_embed_key_uidx
  on public.channels (embed_key)
  where embed_key is not null;

-- Mỗi tenant đúng 1 kênh Live Chat — tránh nhiều widget mồ côi.
create unique index if not exists channels_livechat_one_per_tenant_uidx
  on public.channels (tenant_id)
  where type = 'livechat';

-- Tra cứu khóa nhúng ở đường nóng (mỗi tin khách gửi đều đi qua).
create index if not exists channels_livechat_idx
  on public.channels (type, status)
  where type = 'livechat';

-- Chốt chặn: embed_key CHỈ được sinh bởi livechat_setup() (32 hex ngẫu nhiên).
-- Không cho owner/admin tự đặt khóa yếu qua PostgREST — policy channels_manage
-- cho phép họ ghi cột bất kỳ, nên cần trigger chặn riêng cột này.
-- Cờ 'ifan.livechat_key' là GUC transaction-local, chỉ hàm definer bên dưới đặt
-- được; client PostgREST không có đường gọi set_config.
create or replace function public.channels_guard_embed_key() returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  if coalesce(current_setting('ifan.livechat_key', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.embed_key is not null then
      raise exception 'embed_key_readonly';
    end if;
  elsif new.embed_key is distinct from old.embed_key then
    raise exception 'embed_key_readonly';
  end if;
  return new;
end $$;
-- Hàm trả kiểu `trigger` → PostgREST không expose được, không cần revoke riêng.

drop trigger if exists channels_guard_embed_key on public.channels;
create trigger channels_guard_embed_key
  before insert or update on public.channels
  for each row execute function public.channels_guard_embed_key();

-- ---------- livechat_visitors: phiên khách vãng lai ----------

-- Nhận diện phiên KHÔNG cần đăng nhập: web sinh token 32 byte, trả về trình
-- duyệt (localStorage theo origin của chủ shop), DB chỉ giữ sha256 của token.
-- Tải lại trang → gửi lại token → nối đúng conversation cũ.
create table public.livechat_visitors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  -- sha256(token) dạng hex — KHÔNG BAO GIỜ lưu token gốc
  token_hash text not null,
  -- sha256(ip || ':' || embed_key) — chống lụt tin theo IP mà không lưu IP thô
  ip_hash text,
  current_url text,
  user_agent text,
  contact_id uuid references public.contacts(id) on delete set null,
  -- Bộ đếm cửa sổ trượt 60s, nằm ngay trên hàng phiên (không cần bảng riêng)
  msg_window_start timestamptz not null default now(),
  msg_window_count int not null default 0,
  poll_window_start timestamptz not null default now(),
  poll_window_count int not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index livechat_visitors_token_uidx
  on public.livechat_visitors (token_hash);
create index livechat_visitors_conversation_idx
  on public.livechat_visitors (conversation_id)
  where conversation_id is not null;
create index livechat_visitors_flood_idx
  on public.livechat_visitors (channel_id, ip_hash, created_at desc)
  where ip_hash is not null;

alter table public.livechat_visitors enable row level security;
-- ĐỌC: thành viên tenant (hồ sơ khách vãng lai hiện trong Hộp thư).
-- GHI: KHÔNG có policy nào — chỉ RPC security definer bên dưới ghi được.
-- (Khách vãng lai là anon: current_tenant_id() null → không select được gì.)
create policy livechat_visitors_select on public.livechat_visitors for select
  using (tenant_id = (select public.current_tenant_id()));

-- ---------- Helper nội bộ: resolve khóa nhúng + whitelist tên miền ----------

-- Trả về hàng channels khi VÀ CHỈ KHI: khóa đúng, kênh đang bật, origin nằm
-- trong whitelist của CHÍNH tenant đó. Mọi trường hợp còn lại → 'forbidden'
-- (một mã lỗi duy nhất → không dò được khóa nào tồn tại).
create or replace function private.livechat_resolve(
  p_embed_key text,
  p_origin text
) returns public.channels
language plpgsql
security definer set search_path = public as $$
declare
  v_channel public.channels%rowtype;
begin
  if p_embed_key is null or length(p_embed_key) not between 16 and 128 then
    raise exception 'forbidden';
  end if;
  select * into v_channel
    from public.channels
    where embed_key = p_embed_key and type = 'livechat' and status = 'active';
  if not found then
    raise exception 'forbidden';
  end if;
  -- So khớp TUYỆT ĐỐI (scheme + host + port), không wildcard, không so tiền tố
  if p_origin is null
     or not (v_channel.config -> 'allowed_origins' ? lower(p_origin)) then
    raise exception 'forbidden';
  end if;
  return v_channel;
end $$;
revoke execute on function private.livechat_resolve(text, text) from public, anon, authenticated;

-- ---------- livechat_setup: chủ shop cấu hình widget (owner/admin) ----------
-- Lưu ý: pgcrypto nằm ở schema `extensions` trên Supabase, mà hàm này khóa
-- search_path = public (chuẩn bảo mật của dự án) → gen_random_bytes phải gọi
-- đủ tên schema, nếu không sẽ lỗi khi chạy thật.

-- Tạo kênh Live Chat lần đầu (kèm sinh embed_key), các lần sau chỉ cập nhật.
-- Trả về khóa nhúng + cấu hình để màn Cài đặt hiển thị đoạn mã.
create or replace function public.livechat_setup(
  p_enabled boolean,
  p_greeting text,
  p_origins text[]
) returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.app_role();
  v_channel public.channels%rowtype;
  v_origin text;
  v_clean text[] := '{}';
  v_greeting text := left(btrim(coalesce(p_greeting, '')), 300);
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'forbidden';
  end if;

  -- Chuẩn hóa + kiểm tên miền: chỉ scheme://host[:port], KHÔNG path/query/
  -- wildcard. Trả lỗi rõ để màn Cài đặt chỉ đúng dòng sai cho chủ shop.
  if coalesce(array_length(p_origins, 1), 0) > 10 then
    raise exception 'too_many_origins';
  end if;
  foreach v_origin in array coalesce(p_origins, '{}'::text[]) loop
    v_origin := lower(btrim(v_origin));
    continue when v_origin = '';
    if v_origin !~ '^https?://[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:[0-9]{1,5})?$' then
      raise exception 'invalid_origin';
    end if;
    if not (v_clean @> array[v_origin]) then
      v_clean := v_clean || v_origin;
    end if;
  end loop;

  select * into v_channel
    from public.channels where tenant_id = v_tenant and type = 'livechat';

  -- Cờ cho phép ghi embed_key trong đúng transaction này (xem trigger ở trên).
  -- PERFORM ghi đè biến FOUND nên nhánh dưới kiểm v_channel.id, không kiểm FOUND.
  perform set_config('ifan.livechat_key', 'on', true);

  if v_channel.id is null then
    insert into public.channels
        (tenant_id, type, display_name, status, embed_key, config, connected_at)
      values (
        v_tenant, 'livechat', 'Live Chat',
        case when coalesce(p_enabled, true) then 'active' else 'disconnected' end,
        encode(extensions.gen_random_bytes(16), 'hex'),
        jsonb_build_object('greeting', v_greeting, 'allowed_origins', to_jsonb(v_clean)),
        now())
      returning * into v_channel;
  else
    update public.channels
      set status = case when coalesce(p_enabled, true) then 'active' else 'disconnected' end,
          config = coalesce(config, '{}'::jsonb)
                   || jsonb_build_object('greeting', v_greeting,
                                         'allowed_origins', to_jsonb(v_clean)),
          -- kênh cũ chưa có khóa (không xảy ra ở luồng thường) → sinh bù
          embed_key = coalesce(embed_key, encode(extensions.gen_random_bytes(16), 'hex')),
          connected_at = coalesce(connected_at, now())
      where id = v_channel.id
      returning * into v_channel;
  end if;

  perform set_config('ifan.livechat_key', 'off', true);

  return jsonb_build_object(
    'channel_id', v_channel.id,
    'embed_key', v_channel.embed_key,
    'enabled', v_channel.status = 'active',
    'greeting', v_channel.config ->> 'greeting',
    'allowed_origins', coalesce(v_channel.config -> 'allowed_origins', '[]'::jsonb));
end $$;
revoke execute on function public.livechat_setup(boolean, text, text[]) from public, anon;
grant execute on function public.livechat_setup(boolean, text, text[]) to authenticated;

-- ---------- livechat_session: widget khởi động / nối lại phiên cũ ----------

-- KHÔNG tạo hàng nào khi khách mới chỉ mở trang (tránh rác + tránh lụt): phiên
-- chỉ sinh ở tin nhắn ĐẦU TIÊN (livechat_send). Ở đây chỉ xác thực khóa/tên
-- miền, trả lời chào, và nếu có token hợp lệ thì trả lịch sử hội thoại.
create or replace function public.livechat_session(
  p_embed_key text,
  p_origin text,
  p_token_hash text
) returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_channel public.channels%rowtype := private.livechat_resolve(p_embed_key, p_origin);
  v_visitor public.livechat_visitors%rowtype;
  v_messages jsonb := '[]'::jsonb;
begin
  if p_token_hash is not null then
    select * into v_visitor
      from public.livechat_visitors
      where token_hash = p_token_hash and channel_id = v_channel.id;
    if found then
      update public.livechat_visitors set last_seen_at = now() where id = v_visitor.id;
      -- Chỉ tin của ĐÚNG hội thoại này; sender_type 'system' = ghi chú nội bộ,
      -- KHÔNG BAO GIỜ trả về widget.
      select coalesce(jsonb_agg(m order by m.sent_at), '[]'::jsonb) into v_messages
        from (
          select id, direction, sender_type, content, sent_at
            from public.messages
            where conversation_id = v_visitor.conversation_id
              and sender_type in ('user','agent','ai')
            order by sent_at desc
            limit 50
        ) m;
    end if;
  end if;

  -- CHỈ trả lời chào (do chủ shop tự soạn để hiện công khai) — không tên
  -- tenant, không id, không tên kênh.
  return jsonb_build_object(
    'greeting', coalesce(v_channel.config ->> 'greeting', ''),
    'known', v_visitor.id is not null,
    'messages', v_messages);
end $$;
revoke execute on function public.livechat_session(text, text, text) from public;
grant execute on function public.livechat_session(text, text, text) to anon, authenticated;

-- ---------- livechat_send: khách gửi tin ----------

create or replace function public.livechat_send(
  p_embed_key text,
  p_origin text,
  p_token_hash text,
  p_new_token_hash text,
  p_ip_hash text,
  p_text text,
  p_page_url text,
  p_user_agent text
) returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_channel public.channels%rowtype := private.livechat_resolve(p_embed_key, p_origin);
  v_visitor public.livechat_visitors%rowtype;
  v_text text := btrim(coalesce(p_text, ''));
  v_created boolean := false;
  v_conversation uuid;
  v_message_id uuid;
  v_now timestamptz := now();
  v_recent int;
begin
  if v_text = '' then raise exception 'invalid_request'; end if;
  -- Giới hạn độ dài là luật DB, không phải chỉ validate ở client
  if length(v_text) > 2000 then raise exception 'message_too_long'; end if;

  if p_token_hash is not null then
    select * into v_visitor
      from public.livechat_visitors
      where token_hash = p_token_hash and channel_id = v_channel.id
      for update;
  end if;

  if v_visitor.id is null then
    -- Phiên mới: chống lụt theo (kênh, IP) — 10 phiên/giờ
    if p_new_token_hash is null or length(p_new_token_hash) <> 64 then
      raise exception 'invalid_request';
    end if;
    if p_ip_hash is not null then
      select count(*) into v_recent
        from public.livechat_visitors
        where channel_id = v_channel.id and ip_hash = p_ip_hash
          and created_at > v_now - interval '1 hour';
      if v_recent >= 10 then raise exception 'rate_limited'; end if;
    end if;

    insert into public.livechat_visitors
        (tenant_id, channel_id, token_hash, ip_hash, current_url, user_agent,
         msg_window_start, msg_window_count)
      values (v_channel.tenant_id, v_channel.id, p_new_token_hash, p_ip_hash,
              left(coalesce(p_page_url, ''), 500), left(coalesce(p_user_agent, ''), 300),
              v_now, 1) -- tin đầu tiên đã tính vào cửa sổ 60s
      returning * into v_visitor;

    insert into public.conversations
        (tenant_id, channel_id, external_user_id, status)
      values (v_channel.tenant_id, v_channel.id, 'lc_' || v_visitor.id, 'open')
      on conflict (tenant_id, channel_id, external_user_id)
        where external_user_id is not null
      do update set updated_at = now()
      returning id into v_conversation;

    update public.livechat_visitors
      set conversation_id = v_conversation where id = v_visitor.id;
    v_created := true;
  else
    v_conversation := v_visitor.conversation_id;
    if v_conversation is null then raise exception 'forbidden'; end if;
    -- Chống lụt tin: cửa sổ trượt 60s, 20 tin — khóa hàng ở FOR UPDATE trên
    -- nên hai request song song không lách được bộ đếm.
    if v_visitor.msg_window_start < v_now - interval '60 seconds' then
      update public.livechat_visitors
        set msg_window_start = v_now, msg_window_count = 1, last_seen_at = v_now,
            current_url = left(coalesce(p_page_url, current_url), 500)
        where id = v_visitor.id;
    elsif v_visitor.msg_window_count >= 20 then
      raise exception 'rate_limited';
    else
      update public.livechat_visitors
        set msg_window_count = msg_window_count + 1, last_seen_at = v_now,
            current_url = left(coalesce(p_page_url, current_url), 500)
        where id = v_visitor.id;
    end if;
  end if;

  insert into public.messages
      (tenant_id, conversation_id, direction, sender_type, content, sent_at)
    values (v_channel.tenant_id, v_conversation, 'in', 'user', v_text, v_now)
    returning id into v_message_id;

  update public.conversations
    set last_message_at = v_now,
        last_user_message_at = v_now,
        unread_count = unread_count + 1
    where id = v_conversation;

  update public.channels set last_event_at = v_now where id = v_channel.id;

  return jsonb_build_object(
    'message_id', v_message_id, 'sent_at', v_now, 'created', v_created);
end $$;
revoke execute on function public.livechat_send(text, text, text, text, text, text, text, text)
  from public;
grant execute on function public.livechat_send(text, text, text, text, text, text, text, text)
  to anon, authenticated;

-- ---------- livechat_poll: khách lấy tin mới của CHÍNH phiên mình ----------

create or replace function public.livechat_poll(
  p_embed_key text,
  p_origin text,
  p_token_hash text,
  p_after timestamptz
) returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_channel public.channels%rowtype := private.livechat_resolve(p_embed_key, p_origin);
  v_visitor public.livechat_visitors%rowtype;
  v_now timestamptz := now();
  v_messages jsonb;
begin
  if p_token_hash is null then raise exception 'forbidden'; end if;
  -- Neo theo token_hash + channel_id: khách A không có cách nào chạm hội thoại
  -- của khách B (không nhận conversation_id từ client).
  select * into v_visitor
    from public.livechat_visitors
    where token_hash = p_token_hash and channel_id = v_channel.id
    for update;
  if not found or v_visitor.conversation_id is null then
    raise exception 'forbidden';
  end if;

  -- Chống lụt poll: 240 lượt/60s (widget hỏi 3s/lần → dư 12 lần biên độ)
  if v_visitor.poll_window_start < v_now - interval '60 seconds' then
    update public.livechat_visitors
      set poll_window_start = v_now, poll_window_count = 1, last_seen_at = v_now
      where id = v_visitor.id;
  elsif v_visitor.poll_window_count >= 240 then
    raise exception 'rate_limited';
  else
    update public.livechat_visitors
      set poll_window_count = poll_window_count + 1, last_seen_at = v_now
      where id = v_visitor.id;
  end if;

  select coalesce(jsonb_agg(m order by m.sent_at), '[]'::jsonb) into v_messages
    from (
      select id, direction, sender_type, content, sent_at
        from public.messages
        where conversation_id = v_visitor.conversation_id
          and sender_type in ('user','agent','ai')   -- 'system' = ghi chú nội bộ
          and sent_at > coalesce(p_after, v_now - interval '1 day')
        order by sent_at
        limit 100
    ) m;

  return jsonb_build_object('messages', v_messages, 'now', v_now);
end $$;
revoke execute on function public.livechat_poll(text, text, text, timestamptz) from public;
grant execute on function public.livechat_poll(text, text, text, timestamptz) to anon, authenticated;
