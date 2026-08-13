-- Migration #120 — Zalo Bot trả lời được câu hỏi của nhân viên (ADR-0016, task #128).
--
-- TRA CỨU tường minh, KHÔNG gọi AI — xem ADR-0016 mục 4 cho lý do. Ba ý hiểu
-- được: "việc" (copy nguyên logic bot_digest_run #54 — không có hai định
-- nghĩa "việc của tôi"), "lịch" (appointments #83), "khách <tên>" (contacts).
-- Ngoài ba ý đó: nói thẳng làm được gì, không đoán.
--
-- BỐN CHỐT QUYỀN (ADR mục 5):
--   1. Phạm vi tiệm đến từ p_channel (webhook ?ch=), KHÔNG từ người nhắn.
--   2. Chỉ trả dữ liệu CỦA CHÍNH NGƯỜI HỎI — v1 không có "xem cả tiệm".
--   3. Join tenant_members status='active' — kiểm CÒN HIỆU LỰC lúc trả lời,
--      không chỉ kiểm "có hàng liên kết" (đúng bài học migration #119 tối nay:
--      người bị gỡ khỏi tiệm mà hàng liên kết còn sót vẫn hỏi được là một lỗ).
--   4. Ép ở CSDL (security definer + p_key), route chỉ chuyển tin.
--
-- Trần (ADR mục 6): mỗi câu trả lời tốn 1 tin channel_quota (giữ trần 3.000/
-- tháng của tiệm — đúng con số nền tảng bot đếm). Trần riêng 20 câu/người/ngày:
-- đến đúng lượt thứ 21 thì trả MỘT câu báo hết lượt (tin đó cũng tính), các
-- lượt sau trong ngày HOÀN TOÀN im lặng (reply=null, route không gửi gì).
--
-- Đếm lượt/ngày: dùng LẠI bot_outbox (không thêm bảng, đúng hệ quả ADR mục 8)
-- — mở rộng cột kind để nhận 'answer', mỗi câu trả lời/báo-hết-lượt là một
-- dòng status='sent' ngay lúc ghi (gửi đồng bộ trong request, không qua hàng
-- đợi worker). dedupe_key ngẫu nhiên vì CỐ Ý không chặn trùng — mỗi lần hỏi là
-- một lượt riêng, khác hẳn ý nghĩa dedupe của bản tin digest.

alter table public.bot_outbox drop constraint if exists bot_outbox_kind_check;
alter table public.bot_outbox add constraint bot_outbox_kind_check
  check (kind in ('digest', 'test', 'answer'));

create or replace function public.bot_answer(
  p_key text,
  p_channel uuid,
  p_chat_id text,
  p_text text
) returns jsonb
language plpgsql
security definer set search_path = pg_temp as $$
declare
  c_daily_cap constant int := 20;
  c_month_cap constant int := 3000;
  v_ch record;
  v_token text;
  v_uid uuid;
  v_active boolean;
  v_now_vn timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  v_today date := v_now_vn::date;
  v_day_start timestamptz := (v_today::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_day_end timestamptz := ((v_today + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_month date := date_trunc('month', v_now_vn)::date;
  v_month_used int;
  v_today_used int;
  v_norm text;
  v_unacc text;
  v_reply text;
  v_kind text := 'answer';
  v_query text;
  v_overdue int;
  v_due_today int;
  v_items text;
  r record;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  select id, tenant_id into v_ch from public.notification_channels
    where id = p_channel and kind = 'zalo_bot';
  if v_ch.id is null then
    return jsonb_build_object('reply', null, 'token', null);
  end if;

  select ds.decrypted_secret into v_token from vault.decrypted_secrets ds
    where ds.name = 'bot:' || v_ch.id || ':token';

  -- Chốt 1: tiệm đến từ v_ch.tenant_id (chính webhook), không phải điều gì
  -- người nhắn tự khai. Chốt 3: chưa liên kết HOẶC đã bị gỡ khỏi tiệm đều đi
  -- chung một nhánh — không tiết lộ trạng thái thành viên cho người ngoài.
  select l.user_id into v_uid from public.staff_channel_links l
    where l.tenant_id = v_ch.tenant_id and l.external_chat_id = p_chat_id;

  if v_uid is not null then
    select exists (
      select 1 from public.tenant_members m
       where m.tenant_id = v_ch.tenant_id and m.user_id = v_uid and m.status = 'active'
    ) into v_active;
  end if;

  if v_uid is null or not coalesce(v_active, false) then
    return jsonb_build_object(
      'reply',
      'Chưa nối tài khoản nào (hoặc đã đổi chỗ làm).' || E'\n\n' ||
        '1. Mở iFan → Cài đặt → Thông báo → bấm "Tạo mã liên kết"' || E'\n' ||
        '2. Nhắn lại đây: /link <mã 6 số>',
      'token', v_token
    );
  end if;

  -- Trần THÁNG của tiệm — dừng hoàn toàn, im lặng phía người hỏi, nhưng rung
  -- chuông thật (đúng khuôn bot_digest_run #54: cùng một job 'zalo-bot-digest',
  -- vì gốc của cả hai đường tắc là MỘT: tiệm hết hạn mức Zalo Bot tháng này).
  select coalesce((
    select q.sent_count from public.channel_quota q
      where q.tenant_id = v_ch.tenant_id and q.month = v_month
  ), 0) into v_month_used;
  if v_month_used >= c_month_cap then
    declare v_jobid bigint;
    begin
      select jobid into v_jobid from cron.job where jobname = 'zalo-bot-digest';
      if v_jobid is not null then
        insert into public.system_alerts
            (job_id, job_name, first_failed_at, last_failed_at, fail_count, detail)
          values
            (v_jobid, 'zalo-bot-digest', now(), now(), 1,
             'Tiệm ' || v_ch.tenant_id || ' chạm trần ' || c_month_cap
               || ' tin Zalo Bot trong tháng — bản tin lẫn hỏi đáp đều tạm dừng tới đầu tháng sau.')
          on conflict (job_id) where acknowledged_at is null
          do update set
            last_failed_at = excluded.last_failed_at,
            fail_count     = system_alerts.fail_count + 1,
            detail         = excluded.detail;
      end if;
    end;
    return jsonb_build_object('reply', null, 'token', v_token);
  end if;

  -- Trần NGÀY của người hỏi — đếm số dòng 'answer' đã ghi hôm nay.
  select count(*) into v_today_used from public.bot_outbox
    where tenant_id = v_ch.tenant_id and user_id = v_uid and kind = 'answer'
      and sent_at >= v_day_start and sent_at < v_day_end;

  if v_today_used > c_daily_cap then
    return jsonb_build_object('reply', null, 'token', v_token); -- đã báo hết lượt rồi — im tiếp
  elsif v_today_used = c_daily_cap then
    v_reply := 'Bạn đã hỏi đủ ' || c_daily_cap || ' lượt hôm nay rồi. Mai hỏi lại nhé!';
  else
    -- Hiểu ý bằng khớp từ khoá trên chữ đã bỏ dấu — tập đóng 3 ý, ngoài đó
    -- nói thẳng làm được gì, không đoán (ADR-0016 mục 4).
    v_norm := lower(btrim(coalesce(p_text, '')));
    v_unacc := public.immutable_unaccent(v_norm);

    if v_unacc ~ '^(khach|sdt|so dien thoai)\s+\S' then
      v_query := btrim(regexp_replace(btrim(p_text), '^\S+\s+', ''));
      select string_agg(
          '  · ' || c.full_name || coalesce(' — ' || c.phone, ''), E'\n' order by c.full_name)
        into v_reply
        from public.contacts c
        where c.tenant_id = v_ch.tenant_id and c.deleted_at is null
          and c.search_text ilike '%' || public.immutable_unaccent(lower(v_query)) || '%'
        limit 3;
      v_reply := coalesce('Khách khớp "' || v_query || '":' || E'\n' || v_reply,
        'Không thấy khách nào tên "' || v_query || '".');

    elsif v_unacc ~ 'lich|hen|may gio' then
      select string_agg(
          '  · ' || to_char(a.start_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI')
            || ' — ' || c.full_name
            || coalesce(' (' || s.name || ')', ''),
          E'\n' order by a.start_at)
        into v_reply
        from public.appointments a
        join public.contacts c on c.id = a.contact_id
        left join public.services s on s.id = a.service_id
        where a.tenant_id = v_ch.tenant_id and a.staff_user_id = v_uid
          and a.deleted_at is null and a.status not in ('cancelled', 'no_show')
          and a.start_at >= v_day_start and a.start_at < v_day_end;
      v_reply := coalesce('Lịch hôm nay của bạn:' || E'\n' || v_reply,
        'Hôm nay bạn chưa có ca nào.');

    -- KHÔNG dùng "hom nay" đứng riêng — quá chung, bắt nhầm cả câu không liên
    -- quan tới việc ("thời tiết hôm nay thế nào"). Bắt được nhờ ca7 thấy ĐỎ.
    elsif v_unacc ~ 'viec|con gi|lam gi' then
      -- COPY nguyên logic bot_digest_run() (migration #54) — cùng định nghĩa
      -- "việc của tôi" với bản tin nhắc mỗi sáng, không viết hai lần.
      select
        count(*) filter (where x.at < now()),
        count(*) filter (where x.at >= now() and x.at < v_day_end)
        into v_overdue, v_due_today
        from (
          select a.due_at as at from public.activities a
            where a.tenant_id = v_ch.tenant_id and a.owner_id = v_uid
              and a.done_at is null and a.due_at is not null and a.due_at < v_day_end
          union all
          select d.next_action_at from public.deals d
            where d.tenant_id = v_ch.tenant_id and d.owner_id = v_uid
              and d.deleted_at is null and d.status = 'open'
              and d.next_action_at is not null and d.next_action_at < v_day_end
        ) x;

      select string_agg(y.line, E'\n' order by y.at) into v_items from (
        select z.at,
               '  · ' || z.title || ' (' ||
               to_char(z.at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ')' as line
        from (
          select coalesce(nullif(a.subject, ''), a.type) as title, a.due_at as at
            from public.activities a
            where a.tenant_id = v_ch.tenant_id and a.owner_id = v_uid
              and a.done_at is null and a.due_at is not null and a.due_at < v_day_end
          union all
          select d.title, d.next_action_at from public.deals d
            where d.tenant_id = v_ch.tenant_id and d.owner_id = v_uid
              and d.deleted_at is null and d.status = 'open'
              and d.next_action_at is not null and d.next_action_at < v_day_end
          order by at asc
          limit 3
        ) z
      ) y;

      v_reply := 'Quá hạn: ' || v_overdue || ' · Tới hạn hôm nay: ' || v_due_today;
      if v_items is not null then
        v_reply := v_reply || E'\n\n' || v_items;
      end if;

    else
      v_reply :=
        'Mình hiểu được 3 việc: hỏi "việc" (việc quá hạn/tới hạn của bạn), ' ||
        '"lịch" (ca hôm nay của bạn), hoặc "khách <tên>" (tìm số điện thoại khách). ' ||
        'Câu khác thì chịu, bạn hỏi trực tiếp trong app nhé.';
    end if;
  end if;

  insert into public.bot_outbox
      (tenant_id, user_id, external_chat_id, kind, dedupe_key, body, status, sent_at)
    values
      (v_ch.tenant_id, v_uid, p_chat_id, v_kind, v_kind || ':' || gen_random_uuid(), v_reply, 'sent', now());
  insert into public.channel_quota (tenant_id, month, sent_count)
    values (v_ch.tenant_id, v_month, 1)
    on conflict (tenant_id, month) do update set sent_count = channel_quota.sent_count + 1;

  return jsonb_build_object('reply', v_reply, 'token', v_token);
end $$;

revoke all on function public.bot_answer(text, uuid, text, text) from public;
grant execute on function public.bot_answer(text, uuid, text, text) to anon, authenticated;

-- bot_webhook_token() (migration #53) chỉ có một nơi gọi trong mã web: nhánh
-- "chỉ đường lấy mã" mà route vừa thay bằng bot_answer() ở trên — bot_answer()
-- tự tự tính token trong đúng nhánh "chưa liên kết". Gỡ hàm mồ côi thay vì để
-- lại làm bẫy cho lần sau (đúng lý do đã gỡ kb_published_for, migration #117).
drop function if exists public.bot_webhook_token(text, uuid);
