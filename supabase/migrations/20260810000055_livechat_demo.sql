-- ============================================================
-- iFan.asia — Migration #55: Trang thử Live Chat do iFan host
--
-- Trang /livechat-demo?key=<khóa nhúng> là trang mẫu do iFan dựng sẵn để chủ
-- shop nhắn thử NGAY sau khi lưu cài đặt, không phải chờ dán mã lên website.
-- Widget trên trang đó gửi Origin = chính tên miền iFan — không nằm trong
-- whitelist của tiệm nào, nên cần một "origin ảo" được phép đi qua:
--
--   1. Tầng web (app/api/livechat/*) thấy Origin đúng bằng SITE_URL thì đổi
--      thành sentinel 'ifan:demo' trước khi gọi RPC (lib/channels/livechat.ts).
--      Sentinel không thể trùng whitelist: allowed_origins bắt buộc dạng
--      https?://… (kiểm trong livechat_setup), còn sentinel không có scheme đó.
--   2. private.livechat_resolve chấp nhận sentinel bên cạnh whitelist. KHÔNG
--      nới gì khác: khóa vẫn phải đúng, kênh vẫn phải đang bật ('active'),
--      mọi rate limit trong livechat_send/livechat_poll giữ nguyên.
--   3. livechat_send KHÔNG ghi channels.last_event_at cho tin từ trang thử:
--      last_event_at là BẰNG CHỨNG đoạn mã đã nằm trên website thật (màn cài
--      đặt, thẻ kênh và banner Hộp thư đều dựa vào đó) — tin thử từ trang của
--      iFan không được phép giả bằng chứng ấy. Tin thử vẫn tạo hội thoại và đổ
--      về Hộp thư như thường (đó chính là mục đích của trang thử).
--
-- Mặt an ninh: kẻ gõ curl vốn đã giả được header Origin thành website thật của
-- tiệm (tên miền lộ sẵn ở chính nơi dán mã nhúng), nên sentinel không mở thêm
-- đường tấn công nào — whitelist origin chỉ chặn được trình duyệt (trang khác
-- nhúng trộm widget), còn cửa chặn thật cho kẻ bắn thẳng API vẫn là bộ đếm
-- rate limit theo phiên + IP trong DB (migration #23/#25), không đổi.
--
-- Chép từ bản MỚI NHẤT: cả hai hàm chỉ định nghĩa ở #23, chưa migration nào
-- sửa thân hàm. #40 ghim pg_temp bằng ALTER (và chỉ quét schema public) —
-- `create or replace` ghi đè proconfig nên ở đây ghim thẳng
-- `set search_path = public, pg_temp` ngay trong định nghĩa.
-- ============================================================

-- ---------- private.livechat_resolve: nhận thêm origin ảo của trang thử ----------

-- Trả về hàng channels khi VÀ CHỈ KHI: khóa đúng, kênh đang bật, origin nằm
-- trong whitelist của CHÍNH tenant đó HOẶC là origin ảo 'ifan:demo' (trang thử
-- do iFan host — xem đầu file). Mọi trường hợp còn lại → 'forbidden'
-- (một mã lỗi duy nhất → không dò được khóa nào tồn tại).
create or replace function private.livechat_resolve(
  p_embed_key text,
  p_origin text
) returns public.channels
language plpgsql
security definer set search_path = public, pg_temp as $$
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
  -- So khớp TUYỆT ĐỐI (scheme + host + port), không wildcard, không so tiền tố.
  -- Ngoại lệ DUY NHẤT: 'ifan:demo' — tầng web chỉ đặt giá trị này khi request
  -- đến từ chính tên miền iFan (trang thử), không bao giờ chuyển tiếp từ khách.
  if p_origin is null
     or not (p_origin = 'ifan:demo'
             or (v_channel.config -> 'allowed_origins' ? lower(p_origin))) then
    raise exception 'forbidden';
  end if;
  return v_channel;
end $$;
revoke execute on function private.livechat_resolve(text, text) from public, anon, authenticated;

-- ---------- livechat_send: tin từ trang thử không tính là "tin thật từ website" ----------

-- Chép nguyên bản #23, chỉ đổi ĐÚNG một chỗ: update channels.last_event_at
-- được bọc điều kiện p_origin <> 'ifan:demo' (xem đầu file).
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
security definer set search_path = public, pg_temp as $$
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

  -- Mốc "đã nhận tin THẬT từ website" — tin từ trang thử của iFan không tính
  -- (xem đầu file), nếu không màn cài đặt sẽ khoe "đang chạy" khi mã chưa dán.
  if p_origin <> 'ifan:demo' then
    update public.channels set last_event_at = v_now where id = v_channel.id;
  end if;

  return jsonb_build_object(
    'message_id', v_message_id, 'sent_at', v_now, 'created', v_created);
end $$;
revoke execute on function public.livechat_send(text, text, text, text, text, text, text, text)
  from public;
grant execute on function public.livechat_send(text, text, text, text, text, text, text, text)
  to anon, authenticated;
