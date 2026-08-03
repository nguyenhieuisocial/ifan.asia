-- ============================================================
-- iFan.asia — Migration #5: Pipeline webhook Zalo OA (ACK-trước-xử-lý-sau)
-- private.app_config          -- khóa nạp tin sinh TRONG DB từng môi trường (không nằm trong repo)
-- ingest_zalo_event()         -- RPC anon: so key → webhook_events + pgmq.send (idempotent)
-- process_zalo_events()       -- worker trong DB: đọc queue → conversations/messages
-- trigger_zalo_processing()   -- RPC mỏng: web kích xử lý ngay sau ACK, không cần service key
-- cron 'process-zalo-events'  -- lưới an toàn mỗi phút khi web không kích
-- Chuẩn: theo migration #4 (text+check, timestamptz, definer set search_path,
--        revoke public trước khi grant đích danh).
-- ============================================================

-- ---------- schema private + app_config ----------

-- Schema private KHÔNG nằm trong exposed schemas của PostgREST → không truy cập
-- được qua API; chỉ đọc qua function security definer hoặc kết nối DB trực tiếp.
create schema private;
revoke all on schema private from public;

create table private.app_config (
  key text primary key,
  value text not null
);

-- Khóa nạp tin sinh ngẫu nhiên ngay trong DB — mỗi môi trường một khóa, repo không chứa.
-- Lấy khóa để cấu hình env ZALO_INGEST_KEY cho web app:
--   select value from private.app_config where key = 'zalo_ingest_key';
insert into private.app_config (key, value)
  values ('zalo_ingest_key', encode(gen_random_bytes(24), 'hex'))
  on conflict (key) do nothing;

-- ---------- ingest_zalo_event: cửa nạp sự kiện (anon gọi được, có khóa) ----------

create or replace function public.ingest_zalo_event(
  p_ingest_key text,
  p_external_event_id text,
  p_payload jsonb
) returns bigint
language plpgsql
security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if p_ingest_key is null
     or (select value from private.app_config where key = 'zalo_ingest_key')
        is distinct from p_ingest_key then
    raise exception 'invalid_ingest_key';
  end if;
  if p_external_event_id is null or length(p_external_event_id) = 0 then
    raise exception 'missing_external_event_id';
  end if;
  if octet_length(p_payload::text) > 65536 then
    raise exception 'payload_too_large';
  end if;

  insert into public.webhook_events (provider, tenant_id, external_event_id, payload)
    values ('zalo', null, p_external_event_id, coalesce(p_payload, '{}'::jsonb))
    on conflict (provider, external_event_id) do nothing
    returning id into v_id;

  -- Retry trùng của Zalo (12h): đã nhận rồi → null, không lỗi, không enqueue lại
  if v_id is null then
    return null;
  end if;

  perform pgmq.send('zalo_events', jsonb_build_object('webhook_event_id', v_id));
  return v_id;
end $$;
revoke execute on function public.ingest_zalo_event from public;
grant execute on function public.ingest_zalo_event to anon, authenticated;

-- ---------- process_zalo_events: worker trong DB (KHÔNG grant cho client) ----------

create or replace function public.process_zalo_events(p_batch int default 20) returns int
language plpgsql
security definer set search_path = public as $$
declare
  r record;
  v_done int := 0;
  v_webhook_id bigint;
  v_evt public.webhook_events%rowtype;
  v_oa_id text;
  v_event_name text;
  v_sender_id text;
  v_msg_id text;
  v_text text;
  v_sent_at timestamptz;
  v_channel_id uuid;
  v_tenant_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
begin
  for r in select * from pgmq.read('zalo_events', 60, p_batch) loop
    -- message hỏng (không có webhook_event_id hợp lệ) → archive, không retry
    begin
      v_webhook_id := nullif(r.message ->> 'webhook_event_id', '')::bigint;
    exception when others then
      v_webhook_id := null;
    end;
    if v_webhook_id is null then
      perform pgmq.archive('zalo_events', r.msg_id);
      continue;
    end if;

    begin
      select * into v_evt from public.webhook_events where id = v_webhook_id;
      if not found then
        perform pgmq.archive('zalo_events', r.msg_id);
        continue;
      end if;
      if v_evt.processed_at is not null then
        -- đã xử lý ở lần trước (delete dở giữa chừng) → chỉ dọn queue
        perform pgmq.delete('zalo_events', r.msg_id);
        continue;
      end if;

      v_oa_id      := v_evt.payload ->> 'oa_id';
      v_event_name := v_evt.payload ->> 'event_name';
      v_sender_id  := v_evt.payload -> 'sender' ->> 'id';
      v_msg_id     := v_evt.payload -> 'message' ->> 'msg_id';
      v_text       := v_evt.payload -> 'message' ->> 'text';
      v_sent_at    := case
        when (v_evt.payload ->> 'timestamp') ~ '^\d{10,16}$'
          then to_timestamp(((v_evt.payload ->> 'timestamp')::bigint) / 1000.0)
        else now()
      end;

      -- Đợt 1 chỉ xử lý tin văn bản user gửi; sự kiện khác ghi lý do + archive (không retry vô hạn)
      if v_event_name is distinct from 'user_send_text'
         or v_sender_id is null or v_msg_id is null then
        update public.webhook_events
          set error = 'unsupported_event: ' || coalesce(v_event_name, '(null)')
          where id = v_evt.id;
        perform pgmq.archive('zalo_events', r.msg_id);
        continue;
      end if;

      select id, tenant_id into v_channel_id, v_tenant_id
        from public.channels
        where type = 'zalo_oa' and external_id = v_oa_id
        order by created_at
        limit 1;
      if v_channel_id is null then
        update public.webhook_events
          set error = 'oa_not_found: ' || coalesce(v_oa_id, '(null)')
          where id = v_evt.id;
        perform pgmq.archive('zalo_events', r.msg_id);
        continue;
      end if;

      insert into public.conversations (tenant_id, channel_id, external_user_id, status)
        values (v_tenant_id, v_channel_id, v_sender_id, 'open')
        on conflict (tenant_id, channel_id, external_user_id)
          where external_user_id is not null
        do update set updated_at = now()
        returning id into v_conversation_id;

      insert into public.messages
          (tenant_id, conversation_id, direction, external_message_id, sender_type, content, sent_at)
        values (v_tenant_id, v_conversation_id, 'in', v_msg_id, 'user', v_text, v_sent_at)
        on conflict (tenant_id, conversation_id, external_message_id)
          where external_message_id is not null
        do nothing
        returning id into v_message_id;

      -- Chỉ bump khi tin THẬT SỰ mới — retry không cộng unread_count 2 lần
      if v_message_id is not null then
        update public.conversations
          set last_message_at = greatest(coalesce(last_message_at, v_sent_at), v_sent_at),
              last_user_message_at = greatest(coalesce(last_user_message_at, v_sent_at), v_sent_at),
              unread_count = unread_count + 1
          where id = v_conversation_id;
      end if;

      update public.webhook_events
        set tenant_id = v_tenant_id, processed_at = now(), error = null
        where id = v_evt.id;

      perform pgmq.delete('zalo_events', r.msg_id);
      v_done := v_done + 1;
    exception when others then
      if r.read_ct >= 5 then
        -- quá 5 lần đọc vẫn lỗi → dead-letter: ghi lý do + archive
        update public.webhook_events
          set error = 'failed_after_retries: ' || sqlerrm
          where id = v_webhook_id;
        perform pgmq.archive('zalo_events', r.msg_id);
      end if;
      -- read_ct < 5: không delete → message quay lại queue sau visibility timeout (retry)
    end;
  end loop;
  return v_done;
end $$;
-- KHÔNG cho client gọi trực tiếp: chỉ postgres/cron và RPC trigger_zalo_processing
revoke execute on function public.process_zalo_events from public, anon, authenticated;

-- ---------- trigger_zalo_processing: web kích xử lý ngay sau ACK ----------

create or replace function public.trigger_zalo_processing(p_ingest_key text) returns int
language plpgsql
security definer set search_path = public as $$
begin
  if p_ingest_key is null
     or (select value from private.app_config where key = 'zalo_ingest_key')
        is distinct from p_ingest_key then
    raise exception 'invalid_ingest_key';
  end if;
  return public.process_zalo_events(20);
end $$;
revoke execute on function public.trigger_zalo_processing from public;
grant execute on function public.trigger_zalo_processing to anon;

-- ---------- Lịch nền: lưới an toàn khi web không kích ----------

select cron.schedule('process-zalo-events', '* * * * *', 'select public.process_zalo_events(50)');
