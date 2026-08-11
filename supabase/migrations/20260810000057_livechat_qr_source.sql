-- ============================================================
-- iFan.asia — Migration #57: QR tự gắn nguồn dặm cuối qua widget Live Chat (B06)
--
-- Dặm cuối của mã QR: khách quét /q/<code> → trang đích web được kèm
-- ?ifan_qr=<code> (app/q/[code]/route.ts đã gắn sẵn từ #24) → widget Live Chat
-- trên trang đó đọc tham số và gửi kèm TIN ĐẦU TIÊN — tức đúng lúc phiên khách
-- được tạo (nguyên tắc #23: phiên chỉ sinh ở tin nhắn đầu, /api/livechat/session
-- không tạo bản ghi nào và ở đây vẫn giữ nguyên như thế). livechat_send nhận
-- thêm p_qr_code và, chỉ trong nhánh tạo phiên mới, sinh hồ sơ khách gắn
-- source_id của mã QR — nối thẳng vào báo cáo quy kết nguồn có sẵn (#16/#24:
-- contacts.source_id là chỗ QR đổ về, không đẻ hệ đo thứ hai).
--
-- Luật xử lý mã (cố ý "mềm" — ?ifan_qr nằm trên URL, ai cũng sửa được, không
-- phải dữ liệu tin cậy):
--   1. Mã đúng định dạng + thuộc ĐÚNG tenant của kênh + đang bật → contact mới
--      nhận source_id của mã.
--   2. Mã lạ / sai tenant / đã tắt / sai định dạng → BỎ QUA IM LẶNG: phiên vẫn
--      tạo, contact vẫn sinh nhưng source để trống. Tuyệt đối không trả lỗi —
--      khách đang muốn nhắn tin, không được chặn vì một cái ref hỏng.
--   3. Không có p_qr_code (widget thường, không đi qua QR) → hành vi Y HỆT bản
--      #55: không tạo contact nào ở đây (gắn nguồn "Website" mặc định cho khách
--      Live Chat là mục khác, migration này không đụng).
--
-- Chống spam GIỮ NGUYÊN: contact chỉ sinh trong nhánh tạo phiên mới, nhánh đó
-- vốn nằm sau chốt 10 phiên/giờ/(kênh, IP) — không mở đường mới để bơm rác
-- (riêng tải trang kèm ?ifan_qr vẫn không tạo gì, vì session không tạo bản ghi).
--
-- Chép từ bản MỚI NHẤT: livechat_send lấy nguyên văn #55 (= #23 + điều kiện
-- 'ifan:demo' cho last_event_at), chỉ THÊM tham số p_qr_code và khối gắn nguồn.
-- `create or replace` ghi đè proconfig → ghim lại `set search_path = public,
-- pg_temp` ngay trong định nghĩa (bài học #40).
-- ============================================================

-- Đổi chữ ký (thêm tham số cuối) — phải DROP bản 8 tham số trước: để cả hai bản
-- cùng tồn tại thì lời gọi theo tên tham số của PostgREST khớp cả hai (bản mới
-- có default) → lỗi nhập nhằng. Bản web cũ gọi 8 tham số vẫn chạy với bản mới
-- nhờ default null.
drop function if exists public.livechat_send(text, text, text, text, text, text, text, text);

create function public.livechat_send(
  p_embed_key text,
  p_origin text,
  p_token_hash text,
  p_new_token_hash text,
  p_ip_hash text,
  p_text text,
  p_page_url text,
  p_user_agent text,
  -- Mã QR khách mang theo từ ?ifan_qr trên trang đích (B06) — default null để
  -- widget/tầng web bản cũ chưa gửi tham số này vẫn gọi được y như trước.
  p_qr_code text default null
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
  -- B06: mã QR dặm cuối — chuẩn hóa một lần, dùng trong nhánh tạo phiên mới
  v_qr text := lower(btrim(coalesce(p_qr_code, '')));
  v_qr_source uuid;
  v_contact uuid;
  v_guest_name text;
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

    -- B06: khách vào từ mã QR → sinh hồ sơ khách NGAY LÚC TẠO PHIÊN và gắn
    -- nguồn của mã (luật mã lạ: xem đầu file — bỏ qua im lặng, source trống).
    if v_qr <> '' then
      if v_qr ~ '^[a-z0-9]{8,16}$' then
        select q.source_id into v_qr_source
          from public.qr_codes q
          where q.code = v_qr
            and q.tenant_id = v_channel.tenant_id  -- mã tiệm khác KHÔNG gắn chéo
            and q.is_active;
        -- không thấy → v_qr_source vẫn null: đi tiếp, không lỗi
      end if;
      -- Tên tạm theo đúng kiểu Hộp thư đang gọi khách vãng lai ("Khách {6 ký tự
      -- cuối}") — nhân viên đổi tên thật khi hỏi được khách.
      v_guest_name := 'Khách web ' || right(v_visitor.id::text, 6);
      insert into public.contacts (tenant_id, full_name, source_id)
        values (v_channel.tenant_id, v_guest_name, v_qr_source)
        returning id into v_contact;
      -- Map định danh kênh → contact (chuẩn #4) để gộp trùng/định danh sau này
      -- tìm được; external_id trùng khớp conversations.external_user_id.
      insert into public.contact_identities
          (tenant_id, contact_id, channel_type, external_id, display_name)
        values (v_channel.tenant_id, v_contact, 'livechat', 'lc_' || v_visitor.id, v_guest_name)
        on conflict (tenant_id, channel_type, external_id) do nothing;
      update public.livechat_visitors
        set contact_id = v_contact where id = v_visitor.id;
      update public.conversations
        set contact_id = v_contact
        where id = v_conversation and contact_id is null;
    end if;
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
  -- (migration #55), nếu không màn cài đặt sẽ khoe "đang chạy" khi mã chưa dán.
  if p_origin <> 'ifan:demo' then
    update public.channels set last_event_at = v_now where id = v_channel.id;
  end if;

  return jsonb_build_object(
    'message_id', v_message_id, 'sent_at', v_now, 'created', v_created);
end $$;
revoke execute on function public.livechat_send(text, text, text, text, text, text, text, text, text)
  from public;
grant execute on function public.livechat_send(text, text, text, text, text, text, text, text, text)
  to anon, authenticated;
