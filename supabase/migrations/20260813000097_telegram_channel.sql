-- Migration #97 — Telegram làm kênh chat khách hàng thứ ba (ADR-0013, task #116).
--
-- Vì sao Telegram: Zalo OA đòi pháp nhân + chờ duyệt, đúng thứ chặn tiệm nhỏ
-- mới mở. Bot Telegram thì ai cũng tạo được trong 2 phút, miễn phí, không duyệt
-- — với tiệm chưa có OA, đây là kênh chat khách hàng DUY NHẤT bật được ngay.
--
-- Sao y đường Zalo (#4, #5, #10) chứ không nghĩ cách mới: mọi bài học chống
-- trùng / thử lại / thùng lỗi có ghi lý do đều đã nằm trong đó.

-- ── 1. Nới ba chốt kiểm giá trị ─────────────────────────────────────────────
-- Chưa migration nào nới mấy chốt này, nên phải bỏ đúng tên chốt rồi thêm lại.
-- Giữ NGUYÊN danh sách cũ, chỉ thêm 'telegram' — bớt một giá trị là dữ liệu cũ
-- thành không hợp lệ.

alter table public.channels drop constraint if exists channels_type_check;
alter table public.channels add constraint channels_type_check
  check (type in ('zalo_oa','facebook','instagram','tiktok_shop','livechat','gmail','telegram'));

alter table public.contact_identities drop constraint if exists contact_identities_channel_type_check;
alter table public.contact_identities add constraint contact_identities_channel_type_check
  check (channel_type in ('zalo_oa','facebook','instagram','tiktok_shop','livechat','gmail','telegram'));

alter table public.webhook_events drop constraint if exists webhook_events_provider_check;
alter table public.webhook_events add constraint webhook_events_provider_check
  check (provider in ('zalo','meta','google','tiktok','livechat','telegram'));

alter table public.lead_sources drop constraint if exists lead_sources_channel_type_check;
alter table public.lead_sources add constraint lead_sources_channel_type_check
  check (channel_type in ('zalo','facebook','tiktok','website','referral','direct','other','telegram'));

-- Một bot chỉ thuộc MỘT tiệm trên toàn hệ thống. Thiếu chỉ số này thì hai tiệm
-- cùng dán một token là tin khách chạy nhầm sang tiệm khác — rò dữ liệu.
create unique index if not exists channels_telegram_global_uidx
  on public.channels (external_id) where type = 'telegram';

select pgmq.create('telegram_events');

-- ── 2. Nối bot: token vào Vault, không vào bảng ─────────────────────────────

/**
 * Nối bot Telegram cho tiệm đang mở. Trả về mã kênh + bí mật webhook.
 *
 * `p_bot_id` là phần số trước dấu hai chấm của token — định danh bot, không
 * phải bí mật. Token đầy đủ đi thẳng vào Vault, KHÔNG lưu ở bảng nào.
 */
create or replace function public.connect_telegram_channel(
  p_bot_id text,
  p_bot_token text,
  p_bot_name text default null
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text;
  v_channel uuid;
  v_secret text;
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;

  select m.role into v_role from public.tenant_members m
   where m.tenant_id = v_tenant and m.user_id = auth.uid() and m.status = 'active';
  if v_role is distinct from 'owner' then raise exception 'forbidden'; end if;

  if p_bot_id !~ '^\d{5,}$' or length(coalesce(p_bot_token, '')) < 20 then
    raise exception 'invalid_request';
  end if;

  insert into public.channels (tenant_id, type, external_id, display_name, status, connected_at)
    values (v_tenant, 'telegram', p_bot_id, coalesce(p_bot_name, 'Telegram'), 'active', now())
  on conflict (tenant_id, type, external_id) do update
    set status = 'active', display_name = coalesce(excluded.display_name, public.channels.display_name),
        connected_at = now(), updated_at = now()
  returning id into v_channel;

  perform private.set_channel_secret('telegram:' || v_channel || ':token', p_bot_token);

  -- Bí mật webhook riêng từng kênh: token bot lộ ra là mất bot, còn bí mật này
  -- lộ ra chỉ cho phép giả tin nhắn — hai thứ khác nhau, không dùng chung.
  v_secret := encode(gen_random_bytes(24), 'hex');
  perform private.set_channel_secret('telegram:' || v_channel || ':hook', v_secret);

  update public.channels set secret_ref = 'telegram:' || v_channel
   where id = v_channel;

  return jsonb_build_object('channel_id', v_channel, 'hook_secret', v_secret);
end $$;

/** Cho tầng server đọc token bot khi cần gửi tin đi. Không mở cho client. */
create or replace function public.get_telegram_channel_secrets(p_channel_id uuid)
returns table (bot_token text, hook_secret text)
language plpgsql
stable
security definer set search_path = public, pg_temp as $$
begin
  return query
    select
      (select decrypted_secret from vault.decrypted_secrets
        where name = 'telegram:' || p_channel_id || ':token' limit 1),
      (select decrypted_secret from vault.decrypted_secrets
        where name = 'telegram:' || p_channel_id || ':hook' limit 1);
end $$;

-- ── 3. Nhận tin: ghi biên nhận rồi mới xử ──────────────────────────────────

/**
 * Ghi tin Telegram vào sổ biên nhận + đẩy vào hàng đợi.
 *
 * Chống trùng theo (provider, external_event_id): Telegram GỌI LẠI khi không
 * nhận được 200, nên không chống trùng là nhân bản tin nhắn khách.
 */
create or replace function public.ingest_telegram_event(
  p_key text,
  p_channel uuid,
  p_external_event_id text,
  p_payload jsonb
)
returns bigint
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  if length(p_payload::text) > 65536 then raise exception 'payload_too_large'; end if;

  insert into public.webhook_events (provider, tenant_id, external_event_id, payload)
    select 'telegram', c.tenant_id,
           -- Mã tin của Telegram chỉ duy nhất TRONG MỘT CHAT, nên phải gắn kèm
           -- mã kênh, nếu không hai tiệm có tin trùng số là nuốt mất một tin.
           p_channel::text || ':' || p_external_event_id,
           jsonb_build_object('channel_id', p_channel, 'update', p_payload)
      from public.channels c where c.id = p_channel and c.type = 'telegram' and c.status = 'active'
  on conflict (provider, external_event_id) do nothing
  returning id into v_id;

  if v_id is null then return null; end if;
  perform pgmq.send('telegram_events', jsonb_build_object('webhook_event_id', v_id));
  return v_id;
end $$;

/**
 * Xử tin trong hàng đợi: dựng hội thoại + hồ sơ khách + tin nhắn.
 *
 * TỰ TẠO HỒ SƠ KHÁCH — khác Zalo, có chủ đích (ADR-0013 mục 5): Telegram cho
 * TÊN THẬT và @tên, không như Zalo chỉ cho mã số. Không tạo hồ sơ thì hộp thư
 * lại hiện "Khách 482913", tức vứt đi đúng thứ Telegram cho hơn.
 *
 * Đổi lại phải có TRẦN CHỐNG LỤT: bot Telegram là địa chỉ công khai, không có
 * trần thì một người rảnh bơm được hàng nghìn hồ sơ rác vào tiệm người ta.
 */
create or replace function public.process_telegram_events(p_batch int default 20)
returns int
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
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

      -- Chỉ nhận tin CHỮ từ người thật. Tin của bot khác, ảnh, sticker… bỏ qua
      -- nhưng GHI LÝ DO, không im lặng nuốt mất.
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
end $$;

/** Đá nhịp xử ngay sau khi nhận, không chờ cron. */
create or replace function public.trigger_telegram_processing(p_key text)
returns int
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;
  return public.process_telegram_events(20);
end $$;

revoke all on function public.connect_telegram_channel(text, text, text) from public;
revoke all on function public.get_telegram_channel_secrets(uuid) from public;
revoke all on function public.ingest_telegram_event(text, uuid, text, jsonb) from public;
revoke all on function public.process_telegram_events(int) from public;
revoke all on function public.trigger_telegram_processing(text) from public;
grant execute on function public.connect_telegram_channel(text, text, text) to authenticated;
grant execute on function public.get_telegram_channel_secrets(uuid) to service_role;
grant execute on function public.ingest_telegram_event(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.trigger_telegram_processing(text) to anon, authenticated;

-- Lưới an toàn: nhịp đá ở trên có thể trượt (mạng, hàm lỗi giữa chừng), cron
-- bảo đảm không tin nào nằm lại trong hàng đợi quá một phút mà không ai đụng.
select cron.schedule('process-telegram-events', '* * * * *',
  'select public.process_telegram_events(50)');


/**
 * Cổng vào chỉ cần biết bí mật CÓ KHỚP hay không — không cần cầm bí mật.
 *
 * Trả về boolean thay vì trả bí mật ra: webhook là cửa công khai, cho nó cầm
 * token bot là mở rộng thiệt hại nếu cửa đó có lỗ. So sánh trong CSDL, bên
 * ngoài chỉ nhận đúng/sai.
 */
create or replace function public.telegram_verify_hook(
  p_key text, p_channel uuid, p_secret text
)
returns boolean
language plpgsql
stable
security definer set search_path = public, pg_temp as $$
declare v_want text;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  select decrypted_secret into v_want from vault.decrypted_secrets
   where name = 'telegram:' || p_channel || ':hook' limit 1;

  return v_want is not null and p_secret is not null and v_want = p_secret;
end $$;

revoke all on function public.telegram_verify_hook(text, uuid, text) from public;
grant execute on function public.telegram_verify_hook(text, uuid, text) to anon, authenticated;


/**
 * Ngắt bot Telegram: tắt kênh + XOÁ HẲN bí mật khỏi kho.
 *
 * Xoá chứ không chỉ đổi trạng thái: token bot còn nằm lại là còn cửa gửi tin
 * dưới danh nghĩa tiệm. "Ngắt kết nối" mà bí mật vẫn còn thì không phải ngắt.
 *
 * KHÔNG xoá hội thoại và tin nhắn cũ — đó là dữ liệu khách hàng, ngắt kênh là
 * thôi nhận tin mới chứ không phải xoá lịch sử.
 */
create or replace function public.disconnect_telegram_channel(p_channel_id uuid)
returns void
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text;
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;

  select m.role into v_role from public.tenant_members m
   where m.tenant_id = v_tenant and m.user_id = auth.uid() and m.status = 'active';
  if v_role is distinct from 'owner' then raise exception 'forbidden'; end if;

  update public.channels
     set status = 'disconnected', secret_ref = null, updated_at = now()
   where id = p_channel_id and tenant_id = v_tenant and type = 'telegram';

  delete from vault.secrets
   where name in ('telegram:' || p_channel_id || ':token',
                  'telegram:' || p_channel_id || ':hook');
end $$;

revoke all on function public.disconnect_telegram_channel(uuid) from public;
grant execute on function public.disconnect_telegram_channel(uuid) to authenticated;
