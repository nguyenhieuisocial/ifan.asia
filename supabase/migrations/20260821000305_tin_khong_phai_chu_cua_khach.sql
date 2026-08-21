-- ════════════════════════════════════════════════════════════════════
-- TIN KHÔNG PHẢI CHỮ CỦA KHÁCH BỊ NUỐT HOÀN TOÀN
-- ════════════════════════════════════════════════════════════════════
--
-- Khách gửi một tấm ảnh qua Telegram — ảnh vết mụn, ảnh kiểu tóc muốn làm,
-- ảnh hoá đơn chuyển khoản — và **hộp thư im lặng như chưa ai nhắn**.
--
-- Hàm xử tin chỉ nhận tin có `text`; mọi thứ khác bị đánh dấu
-- `unsupported_update` rồi bỏ. Nó CÓ ghi lý do vào nhật ký webhook (nên không
-- phải "nuốt im lặng" theo nghĩa kỹ thuật) — nhưng **không ai đọc nhật ký
-- webhook**, và người cần biết là nhân viên đang ngồi trước hộp thư.
--
-- Hại: nhân viên không biết có người đang chờ; khách thấy tin đã gửi và ngồi
-- đợi trả lời. Đó là mất khách theo cách khó phát hiện nhất — không ai báo
-- lỗi, không dòng nhật ký nào đỏ, chỉ có một người lặng lẽ bỏ đi.
--
-- Hôm nay hại bằng 0 vì chưa kênh Telegram nào sống. Đây là **bẫy chờ ngày mở
-- kênh** — và ngày đó không ai nhớ ra để đi tìm.
--
-- BẢN VÁ: tin không phải chữ nay vào hộp thư dưới dạng một dòng nói rõ khách
-- vừa gửi gì (`[Khách gửi một tấm ảnh]`). Nhân viên mở Telegram xem nội dung
-- thật, nhưng ÍT NHẤT HỌ BIẾT LÀ CÓ. Chú thích kèm ảnh thì lấy luôn — đó là
-- chữ thật của khách, quý hơn nhãn máy đặt.
--
-- ⚠️ CỐ Ý chưa tải ảnh về kho: cần đường lưu tệp, hạn mức dung lượng và một
-- quyết định về việc giữ ảnh khách bao lâu. Ba thứ đó chưa có. Một dòng chữ
-- nói đúng sự thật hôm nay tốt hơn một tính năng ảnh nửa vời.

CREATE OR REPLACE FUNCTION public.process_telegram_events(p_batch integer DEFAULT 20)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_msg record;
  v_ev public.webhook_events%rowtype;
  v_upd jsonb;
  v_channel uuid;
  v_tenant uuid;
  v_from jsonb;
  v_sender text;
  v_text text;
  v_msg_id text;
  v_sent timestamptz;
  v_conv uuid;
  v_message uuid;
  v_contact uuid;
  v_name text;
  v_recent int;
  v_source uuid;
  v_done int := 0;
begin
  for v_msg in select * from pgmq.read('telegram_events', 30, greatest(1, least(p_batch, 50)))
  loop
    begin
      select * into v_ev from public.webhook_events
       where id = (v_msg.message ->> 'webhook_event_id')::bigint;
      if v_ev.id is null or v_ev.processed_at is not null then
        perform pgmq.delete('telegram_events', v_msg.msg_id);
        continue;
      end if;

      v_channel := (v_ev.payload ->> 'channel_id')::uuid;
      v_upd := v_ev.payload -> 'update';
      v_from := v_upd -> 'message' -> 'from';
      v_sender := v_from ->> 'id';
      v_text := v_upd -> 'message' ->> 'text';
      v_msg_id := v_upd -> 'message' ->> 'message_id';
      v_sent := to_timestamp(coalesce((v_upd -> 'message' ->> 'date')::bigint, 0));
      if v_sent is null or v_sent < timestamptz '2000-01-01' then v_sent := now(); end if;

      -- TIN KHÔNG PHẢI CHỮ vẫn phải VÀO HỘP THƯ.
      --
      -- Bản trước bỏ qua mọi tin không có `text`, nên khách gửi một tấm ảnh
      -- (ảnh vết mụn, ảnh kiểu tóc muốn làm, ảnh hoá đơn chuyển khoản) thì hộp
      -- thư IM LẶNG NHƯ CHƯA AI NHẮN. Nhân viên không biết có người đang chờ;
      -- khách thì thấy tin đã gửi và ngồi đợi trả lời. Đó là mất khách theo
      -- cách khó phát hiện nhất — không ai báo lỗi, không dòng nhật ký nào đỏ.
      --
      -- Nay thay bằng một dòng NÓI RÕ khách vừa gửi gì. Nhân viên mở Telegram
      -- xem nội dung thật, nhưng ÍT NHẤT HỌ BIẾT LÀ CÓ. Chú thích kèm ảnh
      -- (`caption`) nếu có thì lấy luôn — đó là chữ thật của khách.
      if v_text is null and v_sender is not null
         and not coalesce((v_from ->> 'is_bot')::boolean, false) then
        v_text := case
          when v_upd -> 'message' -> 'photo' is not null then '[Khách gửi một tấm ảnh]'
          when v_upd -> 'message' -> 'voice' is not null then '[Khách gửi một tin thoại]'
          when v_upd -> 'message' -> 'video' is not null then '[Khách gửi một video]'
          when v_upd -> 'message' -> 'document' is not null then '[Khách gửi một tệp]'
          when v_upd -> 'message' -> 'sticker' is not null then '[Khách gửi một nhãn dán]'
          when v_upd -> 'message' -> 'location' is not null then '[Khách gửi vị trí]'
          when v_upd -> 'message' -> 'contact' is not null then '[Khách gửi một danh thiếp]'
          else null
        end;
        -- Chú thích kèm theo là chữ THẬT của khách — quý hơn nhãn máy đặt.
        if v_text is not null and (v_upd -> 'message' ->> 'caption') is not null then
          v_text := v_text || ' ' || (v_upd -> 'message' ->> 'caption');
        end if;
      end if;

      -- Đến đây mà vẫn không có chữ nào thì mới bỏ qua (tin của bot khác, hoặc
      -- loại cập nhật Telegram không phải tin nhắn) — GHI LÝ DO, không im lặng.
      if v_sender is null or v_text is null or coalesce((v_from ->> 'is_bot')::boolean, false) then
        update public.webhook_events
           set processed_at = now(), error = 'unsupported_update'
         where id = v_ev.id;
        perform pgmq.delete('telegram_events', v_msg.msg_id);
        continue;
      end if;

      select c.tenant_id into v_tenant from public.channels c
       where c.id = v_channel and c.type = 'telegram';
      if v_tenant is null then
        update public.webhook_events
           set processed_at = now(), error = 'channel_not_found'
         where id = v_ev.id;
        perform pgmq.delete('telegram_events', v_msg.msg_id);
        continue;
      end if;

      insert into public.conversations (tenant_id, channel_id, external_user_id, status)
        values (v_tenant, v_channel, v_sender, 'open')
      on conflict (tenant_id, channel_id, external_user_id) where external_user_id is not null
        do update set updated_at = now()
      returning id, contact_id into v_conv, v_contact;

      -- Hồ sơ khách: chỉ tạo cho hội thoại MỚI chưa có hồ sơ, và chỉ khi tiệm
      -- chưa vượt trần 60 hồ sơ mới/giờ từ kênh này.
      if v_contact is null then
        select count(*) into v_recent from public.contacts
         where tenant_id = v_tenant and created_at > now() - interval '1 hour';

        if v_recent < 60 then
          v_name := btrim(coalesce(v_from ->> 'first_name', '') || ' ' || coalesce(v_from ->> 'last_name', ''));
          if v_name = '' then v_name := coalesce('@' || (v_from ->> 'username'), 'Khách Telegram'); end if;

          select id into v_source from public.lead_sources
           where tenant_id = v_tenant and channel_type = 'telegram' limit 1;
          if v_source is null then
            insert into public.lead_sources (tenant_id, name, channel_type)
              values (v_tenant, 'Telegram', 'telegram')
            returning id into v_source;
          end if;

          insert into public.contacts (tenant_id, full_name, source_id)
            values (v_tenant, left(v_name, 120), v_source)
          returning id into v_contact;

          insert into public.contact_identities
              (tenant_id, contact_id, channel_type, external_id, display_name)
            values (v_tenant, v_contact, 'telegram', v_sender, left(v_name, 120))
          on conflict (tenant_id, channel_type, external_id) do nothing;

          update public.conversations set contact_id = v_contact where id = v_conv;
        end if;
      end if;

      insert into public.messages
          (tenant_id, conversation_id, direction, external_message_id, sender_type, content, sent_at)
        values (v_tenant, v_conv, 'in', v_msg_id, 'user', v_text, v_sent)
      on conflict (tenant_id, conversation_id, external_message_id)
        where external_message_id is not null do nothing
      returning id into v_message;

      -- Chỉ cộng khi THẬT SỰ có tin mới — gọi lại lần hai không được đội số.
      if v_message is not null then
        update public.conversations
           set last_message_at = greatest(coalesce(last_message_at, v_sent), v_sent),
               last_user_message_at = greatest(coalesce(last_user_message_at, v_sent), v_sent),
               unread_count = unread_count + 1,
               updated_at = now()
         where id = v_conv;
        update public.channels set last_event_at = now() where id = v_channel;
      end if;

      update public.webhook_events
         set tenant_id = v_tenant, processed_at = now()
       where id = v_ev.id;
      perform pgmq.delete('telegram_events', v_msg.msg_id);
      v_done := v_done + 1;

    exception when others then
      -- Thử lại 5 lần rồi mới bỏ vào thùng lỗi, CÓ GHI LÝ DO. Im lặng nuốt tin
      -- khách là loại thất bại dự án cấm (bài học bug #85).
      if v_msg.read_ct >= 5 then
        update public.webhook_events
           set processed_at = now(), error = 'failed_after_retries: ' || left(sqlerrm, 200)
         where id = (v_msg.message ->> 'webhook_event_id')::bigint;
        perform pgmq.delete('telegram_events', v_msg.msg_id);
      end if;
    end;
  end loop;

  return v_done;
end $function$;
