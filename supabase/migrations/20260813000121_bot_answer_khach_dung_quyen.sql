-- VÁ #120 — nhánh "khách <tên>" của bot_answer() RỘNG HƠN QUYỀN trong app.
--
-- Bắt được khi tự soi lại chính mã vừa viết đêm nay (không phải do ai báo).
--
-- ══ LỖI ══
-- Policy `contacts_select` đang chạy (migration #65):
--     tenant_id = tiệm hiện tại
--     AND ( app_role() in ('owner','admin','manager','viewer')
--           OR owner_id = auth.uid() )
-- ⇒ vai **staff** CHỈ đọc được khách do CHÍNH MÌNH phụ trách.
--
-- Nhưng #120 viết nhánh khách chỉ lọc `tenant_id`, không lọc theo vai/người
-- phụ trách ⇒ một nhân viên thường nhắn "khách <tên>" qua Zalo lấy được
-- **mọi khách trong tiệm kèm số điện thoại**, tức nhiều hơn hẳn thứ họ mở
-- app ra xem được.
--
-- Đây đúng họ với lỗ migration #119 tối qua: một năng lực mới đặt trên ranh
-- giới danh tính, và nó nới rộng hơn ranh giới sẵn có. Tự tái phạm sau vài
-- tiếng — nên ghi lại thành luật ở dưới chứ không chỉ vá.
--
-- ══ VÌ SAO KIỂM TỰ ĐỘNG KHÔNG BẮT ĐƯỢC ══
-- Ca 6 của #120 dùng nhân viên vai `staff` tra một khách **không có người phụ
-- trách** (`owner_id` NULL) rồi kỳ vọng TÌM THẤY — tức chính bài kiểm đã đóng
-- dấu cho hành vi sai. Bài kiểm chỉ chứng minh được điều nó nghĩ tới; nó nghĩ
-- "tìm được khách là đạt", không nghĩ "ai được phép tìm".
--
-- ══ VÁ ══
-- Chép ĐÚNG luật của `contacts_select` vào hàm. Không thể dùng lại policy vì
-- hàm chạy `security definer` (bỏ qua RLS) — nên chép kèm con trỏ về nguồn
-- gốc; đổi policy thì phải đổi cả đây.
--
-- Kèm: thoát ký tự đại diện `%` `_` trong chuỗi người dùng nhập. Không thoát
-- thì nhắn "khách %" là khớp toàn bộ danh sách — vẫn nằm trong quyền của
-- người đó sau khi vá trên, nhưng là hành vi không ai cố ý thiết kế.

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
  v_role text;
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
  v_pattern text;
  v_xem_het boolean;
  v_overdue int;
  v_due_today int;
  v_items text;
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
  -- người nhắn tự khai. Chốt 3: lấy LUÔN vai ở đây — vai quyết định phạm vi
  -- đọc khách bên dưới, và phải là vai CÒN HIỆU LỰC lúc này.
  select l.user_id, m.role into v_uid, v_role
    from public.staff_channel_links l
    join public.tenant_members m
      on m.tenant_id = l.tenant_id and m.user_id = l.user_id and m.status = 'active'
   where l.tenant_id = v_ch.tenant_id and l.external_chat_id = p_chat_id;

  if v_uid is null then
    return jsonb_build_object(
      'reply',
      'Chưa nối tài khoản nào (hoặc đã đổi chỗ làm).' || E'\n\n' ||
        '1. Mở iFan → Cài đặt → Thông báo → bấm "Tạo mã liên kết"' || E'\n' ||
        '2. Nhắn lại đây: /link <mã 6 số>',
      'token', v_token
    );
  end if;

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

  select count(*) into v_today_used from public.bot_outbox
    where tenant_id = v_ch.tenant_id and user_id = v_uid and kind = 'answer'
      and sent_at >= v_day_start and sent_at < v_day_end;

  if v_today_used > c_daily_cap then
    return jsonb_build_object('reply', null, 'token', v_token);
  elsif v_today_used = c_daily_cap then
    v_reply := 'Bạn đã hỏi đủ ' || c_daily_cap || ' lượt hôm nay rồi. Mai hỏi lại nhé!';
  else
    v_norm := lower(btrim(coalesce(p_text, '')));
    v_unacc := public.immutable_unaccent(v_norm);

    if v_unacc ~ '^(khach|sdt|so dien thoai)\s+\S' then
      v_query := btrim(regexp_replace(btrim(p_text), '^\S+\s+', ''));
      -- Thoát ký tự đại diện của ILIKE — "khách %" không được biến thành
      -- "khớp tất cả". Thoát dấu \ TRƯỚC, nếu không là thoát nhầm chồng lên.
      v_pattern := replace(replace(replace(
        public.immutable_unaccent(lower(v_query)), '\', '\\'), '%', '\%'), '_', '\_');

      -- CHÉP ĐÚNG luật policy `contacts_select` (migration #65). Hàm này chạy
      -- security definer nên KHÔNG được RLS che hộ — đổi policy đó thì phải
      -- đổi cả đây. Vai `staff` chỉ thấy khách mình phụ trách.
      v_xem_het := coalesce(v_role, '') in ('owner', 'admin', 'manager', 'viewer');

      select string_agg(
          '  · ' || c.full_name || coalesce(' — ' || c.phone, ''), E'\n' order by c.full_name)
        into v_reply
        from (
          select c2.full_name, c2.phone
            from public.contacts c2
            where c2.tenant_id = v_ch.tenant_id and c2.deleted_at is null
              and (v_xem_het or c2.owner_id = v_uid)
              and c2.search_text ilike '%' || v_pattern || '%'
            order by c2.full_name
            limit 3
        ) c;
      v_reply := coalesce('Khách khớp "' || v_query || '":' || E'\n' || v_reply,
        'Không thấy khách nào tên "' || v_query || '"' ||
        case when v_xem_het then '.' else ' trong danh sách bạn phụ trách.' end);

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

    elsif v_unacc ~ 'viec|con gi|lam gi' then
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

-- ══ LUẬT RÚT RA (lần hai trong một đêm, nên viết thành luật) ══
-- Mỗi cửa MỚI đọc dữ liệu ngoài app (bot, webhook, RPC definer) phải trả lời
-- được: "người này mở app ra có xem được đúng chừng này không?". Nhiều hơn là
-- lỗ, kể cả khi không ai cố ý. Hàm `security definer` bỏ qua RLS nên KHÔNG có
-- lưới đỡ nào — luật phải chép tay và chép đúng.
--
-- Và: bài kiểm phải hỏi "AI được phép", không chỉ "có ra kết quả không". Ca 6
-- của #120 chạy xanh trên đúng hành vi sai vì nó chỉ hỏi vế thứ hai.
