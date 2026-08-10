-- ============================================================
-- iFan.asia — Migration #54: Zalo Bot phần 2/2 — bản tin digest + worker gửi
-- (phần 1 = #53: bảng + RLS + ghép nối. Đọc chú thích đầu #53 trước.)
--
--   bot_digest_run()       -- cron 15 phút/lần: GOM thông báo chưa đọc + việc
--                             đến hạn/quá hạn + cảnh báo SLA thành MỘT bản tin
--                             mỗi người mỗi ngày (đúng giờ họ chọn), xếp vào
--                             bot_outbox. KHÔNG bắn lẻ từng thông báo.
--   bot_claim_outbox()     -- worker (route) nhận lô tin chờ + token Vault
--   bot_complete_outbox()  -- worker báo kết quả: sent → cộng quota; fail → thử lại
--   bot_enqueue_test()     -- nút "Gửi thử cho tôi" trên màn cài đặt
--   cron 'zalo-bot-digest' -- */15 * * * *
--
-- Quota: trần 3.000 tin miễn phí/tháng (channel_quota #53). Chạm trần → dừng
-- xếp bản tin + rung chuông system_alerts (#44) cho platform admin, KHÔNG chết ngầm.
-- Điểm dừng an toàn: tiệm chưa dán token → bot_claim_outbox không nhả tin của
-- tiệm đó (đứng yên im lặng); bản tin pending quá 2 ngày bị dọn, không dội bom
-- khi kênh sống lại.
-- ============================================================

-- ---------- bot_digest_run: gom bản tin (cron gọi) ----------

create or replace function public.bot_digest_run()
returns int
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  c_cap constant int := 3000; -- trần miễn phí của nền tảng bot (3.000 tin/tháng)
  v_now_vn timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  v_today date := v_now_vn::date;
  v_hour int := extract(hour from v_now_vn)::int;
  v_month date := date_trunc('month', v_now_vn)::date;
  -- hết ngày hôm nay theo giờ VN, đổi về timestamptz (cùng cách tính today_queue #45)
  v_day_end timestamptz := ((v_today + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_jobid bigint;
  r record;
  v_n int := 0;
  v_show_unread boolean;
  v_show_today boolean;
  v_show_sla boolean;
  v_unread int;
  v_unread_sla int;
  v_overdue int;
  v_due_today int;
  v_items text;
  v_body text;
  v_has boolean;
begin
  -- Dọn rác mỗi lượt chạy (nhẹ, có index/bảng nhỏ):
  delete from link_codes where expires_at < now() - interval '1 hour';
  delete from bot_outbox
    where status in ('sent', 'failed') and created_at < now() - interval '30 days';
  -- Bản tin chờ quá 2 ngày (tiệm chưa dán token / worker chưa được kích) → bỏ.
  delete from bot_outbox
    where status = 'pending' and created_at < now() - interval '2 days';

  for r in
    select l.tenant_id, l.user_id, l.external_chat_id,
           coalesce(p.pref, '{}'::jsonb) as pref
    from staff_channel_links l
    join notification_channels nc
      on nc.tenant_id = l.tenant_id and nc.kind = 'zalo_bot'
     and nc.token_secret_id is not null
    left join notification_prefs p
      on p.tenant_id = l.tenant_id and p.user_id = l.user_id
  loop
    -- Đọc pref PHÒNG THỦ (client chỉ sửa được pref của mình nhưng jsonb tự do):
    -- thiếu/hỏng khóa nào thì dùng mặc định bật + 8 giờ sáng.
    if coalesce(r.pref ->> 'enabled', 'true') <> 'true' then continue; end if;
    if (case when (r.pref ->> 'digest_hour') ~ '^\d{1,2}$'
             then least((r.pref ->> 'digest_hour')::int, 23)
             else 8 end) <> v_hour then
      continue;
    end if;

    -- Vé chống trùng: hôm nay đã có bản tin (kể cả đang chờ gửi) thì thôi —
    -- cron 15 phút chạy 4 lần trong khung giờ nhưng chỉ lần đầu xếp tin.
    if exists (
      select 1 from bot_outbox o
        where o.tenant_id = r.tenant_id and o.user_id = r.user_id
          and o.dedupe_key = 'digest:' || v_today
    ) then
      continue;
    end if;

    -- Quota: chạm trần là DỪNG + rung chuông #44, không chết ngầm.
    if coalesce((
      select q.sent_count from channel_quota q
        where q.tenant_id = r.tenant_id and q.month = v_month
    ), 0) >= c_cap then
      select jobid into v_jobid from cron.job where jobname = 'zalo-bot-digest';
      if v_jobid is not null then
        insert into system_alerts
            (job_id, job_name, first_failed_at, last_failed_at, fail_count, detail)
          values
            (v_jobid, 'zalo-bot-digest', now(), now(), 1,
             'Tiệm ' || r.tenant_id || ' chạm trần ' || c_cap
               || ' tin Zalo Bot trong tháng — bản tin tạm dừng tới đầu tháng sau.')
          on conflict (job_id) where acknowledged_at is null
          do update set
            last_failed_at = excluded.last_failed_at,
            fail_count     = system_alerts.fail_count + 1,
            detail         = excluded.detail;
      end if;
      continue;
    end if;

    v_show_unread := coalesce(r.pref #>> '{kinds,unread}', 'true') = 'true';
    v_show_today  := coalesce(r.pref #>> '{kinds,today}',  'true') = 'true';
    v_show_sla    := coalesce(r.pref #>> '{kinds,sla}',    'true') = 'true';

    -- Thông báo chưa đọc (7 ngày gần nhất — không kéo cả núi thông báo cũ).
    select count(*), count(*) filter (where n.type = 'sla')
      into v_unread, v_unread_sla
      from notifications n
      where n.tenant_id = r.tenant_id and n.user_id = r.user_id
        and n.read_at is null and n.created_at > now() - interval '7 days';

    -- Việc CÓ HẠN của tôi — cùng định nghĩa với today_queue (#45): activity chưa
    -- xong có due_at + deal mở có next_action_at.
    select
      count(*) filter (where x.at < now()),
      count(*) filter (where x.at >= now() and x.at < v_day_end)
      into v_overdue, v_due_today
      from (
        select a.due_at as at from activities a
          where a.tenant_id = r.tenant_id and a.owner_id = r.user_id
            and a.done_at is null and a.due_at is not null and a.due_at < v_day_end
        union all
        select d.next_action_at from deals d
          where d.tenant_id = r.tenant_id and d.owner_id = r.user_id
            and d.deleted_at is null and d.status = 'open'
            and d.next_action_at is not null and d.next_action_at < v_day_end
      ) x;

    -- 3 việc sát hạn nhất, kèm giờ VN — đủ để biết cầm máy gọi ai trước.
    select string_agg(y.line, E'\n' order by y.at) into v_items from (
      select z.at,
             '  · ' || z.title || ' (' ||
             to_char(z.at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ')' as line
      from (
        select coalesce(nullif(a.subject, ''), a.type) as title, a.due_at as at
          from activities a
          where a.tenant_id = r.tenant_id and a.owner_id = r.user_id
            and a.done_at is null and a.due_at is not null and a.due_at < v_day_end
        union all
        select d.title, d.next_action_at from deals d
          where d.tenant_id = r.tenant_id and d.owner_id = r.user_id
            and d.deleted_at is null and d.status = 'open'
            and d.next_action_at is not null and d.next_action_at < v_day_end
        order by at asc
        limit 3
      ) z
    ) y;

    -- Ghép bản tin — tiếng Việt (thị trường chính; nội dung notification trong
    -- DB cũng là tiếng Việt). Route sẽ nối thêm link mở app khi gửi.
    v_body := 'iFan — nhắc việc ngày ' || to_char(v_now_vn, 'DD/MM');
    v_has := false;

    if v_show_unread and v_unread > 0 then
      v_body := v_body || E'\n' || '• Thông báo chưa đọc: ' || v_unread;
      if v_show_sla and v_unread_sla > 0 then
        v_body := v_body || ' (có ' || v_unread_sla || ' cảnh báo trễ hẹn)';
      end if;
      v_has := true;
    elsif v_show_sla and v_unread_sla > 0 then
      -- Tắt mục "chưa đọc" nhưng vẫn muốn nghe cảnh báo SLA.
      v_body := v_body || E'\n' || '• Cảnh báo trễ hẹn chưa đọc: ' || v_unread_sla;
      v_has := true;
    end if;

    if v_show_today and (v_overdue > 0 or v_due_today > 0) then
      v_body := v_body || E'\n' || '• Việc quá hạn: ' || v_overdue
                || ' — đến hạn hôm nay: ' || v_due_today;
      if v_items is not null then
        v_body := v_body || E'\n' || v_items;
      end if;
      v_has := true;
    end if;

    -- Không có gì đáng báo → không gửi (tiết kiệm quota, không làm phiền).
    if not v_has then continue; end if;

    insert into bot_outbox
        (tenant_id, user_id, external_chat_id, kind, dedupe_key, body)
      values
        (r.tenant_id, r.user_id, r.external_chat_id, 'digest',
         'digest:' || v_today, left(v_body, 1900))
      on conflict (tenant_id, user_id, dedupe_key) do nothing;
    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;

comment on function public.bot_digest_run is
  'Gom thông báo chưa đọc + việc đến hạn + cảnh báo SLA thành bản tin Zalo Bot (1 người/1 ngày/1 tin), xếp vào bot_outbox theo giờ nhận trong notification_prefs.';

-- Chỉ pg_cron gọi — không mở cho client.
revoke all on function public.bot_digest_run() from public, anon, authenticated;

select cron.schedule('zalo-bot-digest', '*/15 * * * *', $$select public.bot_digest_run()$$);

-- ---------- bot_claim_outbox: worker nhận lô tin chờ (route gọi, có khóa) ----------

-- Chỉ nhả tin của tiệm ĐÃ CÓ token (two-mode: chưa dán token thì tin nằm yên).
-- Nhận là chuyển 'sending' + đếm lượt thử; kẹt 'sending' >10 phút coi như route
-- chết giữa chừng → nhả lại; quá 5 lượt thử → 'failed' hẳn.
create or replace function public.bot_claim_outbox(p_key text, p_batch int default 20)
returns table (o_id bigint, o_chat text, o_kind text, o_body text, o_token text)
language plpgsql
security definer set search_path = pg_temp as $$
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;
  if p_batch is null or p_batch < 1 or p_batch > 100 then
    raise exception 'invalid_input';
  end if;

  -- Vé đã cháy hết lượt thử mà vẫn kẹt 'sending' → chốt failed (không claim lại).
  update public.bot_outbox o
    set status = 'failed', last_error = coalesce(o.last_error, 'max_attempts')
    where o.status = 'sending'
      and o.claimed_at < now() - interval '10 minutes'
      and o.attempts >= 5;

  return query
  with pick as (
    select o.id
    from public.bot_outbox o
    join public.notification_channels nc
      on nc.tenant_id = o.tenant_id and nc.kind = 'zalo_bot'
     and nc.token_secret_id is not null
    where (o.status = 'pending'
           or (o.status = 'sending' and o.claimed_at < now() - interval '10 minutes'))
      and o.attempts < 5
    order by o.id
    limit p_batch
    for update of o skip locked
  ),
  claimed as (
    update public.bot_outbox o
      set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
      where o.id in (select p.id from pick p)
      returning o.id, o.tenant_id, o.external_chat_id, o.kind, o.body
  )
  select c.id, c.external_chat_id, c.kind, c.body,
         (select ds.decrypted_secret from vault.decrypted_secrets ds
            where ds.name = 'bot:' || nc.id || ':token')
  from claimed c
  join public.notification_channels nc
    on nc.tenant_id = c.tenant_id and nc.kind = 'zalo_bot';
end $$;
revoke all on function public.bot_claim_outbox(text, int) from public;
grant execute on function public.bot_claim_outbox(text, int) to anon, authenticated;

-- ---------- bot_complete_outbox: worker báo kết quả từng tin ----------

create or replace function public.bot_complete_outbox(
  p_key text,
  p_id bigint,
  p_ok boolean,
  p_error text default null
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_row bot_outbox%rowtype;
  v_month date := date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  select * into v_row from bot_outbox where id = p_id for update;
  if not found then return; end if;

  if p_ok then
    update bot_outbox set status = 'sent', sent_at = now(), last_error = null
      where id = p_id;
    -- Đếm quota lúc GỬI THÀNH CÔNG — đúng con số nền tảng bot đếm.
    insert into channel_quota (tenant_id, month, sent_count)
      values (v_row.tenant_id, v_month, 1)
      on conflict (tenant_id, month)
      do update set sent_count = channel_quota.sent_count + 1;
  else
    update bot_outbox
      set status = case when attempts >= 5 then 'failed' else 'pending' end,
          last_error = left(coalesce(p_error, 'send_failed'), 500)
      where id = p_id;
  end if;
end $$;
revoke all on function public.bot_complete_outbox(text, bigint, boolean, text) from public;
grant execute on function public.bot_complete_outbox(text, bigint, boolean, text) to anon, authenticated;

-- ---------- bot_enqueue_test: nút "Gửi thử cho tôi" ----------

-- Member đã ghép nối + tiệm có token → xếp một tin thử vào outbox (route gửi
-- ngay sau đó). dedupe_key ngẫu nhiên — gửi thử nhiều lần không bị vé chặn;
-- chống spam bằng rate limit ở server action.
create or replace function public.bot_enqueue_test()
returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  c_cap constant int := 3000;
  v_tenant uuid := public.current_tenant_id();
  v_uid uuid := auth.uid();
  v_link staff_channel_links%rowtype;
begin
  if v_tenant is null or v_uid is null then
    raise exception 'no_tenant_context';
  end if;
  if not exists (
    select 1 from notification_channels
      where tenant_id = v_tenant and kind = 'zalo_bot' and token_secret_id is not null
  ) then
    raise exception 'no_bot';
  end if;

  select * into v_link from staff_channel_links
    where tenant_id = v_tenant and user_id = v_uid;
  if not found then
    raise exception 'not_linked';
  end if;

  if coalesce((
    select sent_count from channel_quota
      where tenant_id = v_tenant
        and month = date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date
  ), 0) >= c_cap then
    raise exception 'quota_exceeded';
  end if;

  insert into bot_outbox (tenant_id, user_id, external_chat_id, kind, dedupe_key, body)
    values (v_tenant, v_uid, v_link.external_chat_id, 'test',
            'test:' || gen_random_uuid(),
            'iFan gửi thử thành công! Kênh nhắc việc qua Zalo của bạn đã sẵn sàng — '
              || 'bản tin sẽ đến đúng giờ bạn chọn trong Cài đặt → Thông báo.');
end $$;
revoke all on function public.bot_enqueue_test() from public, anon;
grant execute on function public.bot_enqueue_test() to authenticated;
