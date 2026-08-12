-- ============================================================
-- iFan.asia — Migration #85: V2 việc 6 — Nhắc lịch hẹn (ADR-0009 mục 7 hàng 6,
-- docs/adr/0009-v2-lich-hen.md). Việc CUỐI của V2 — xong file này là đủ 6/6.
--
-- Đọc `docs/EVENT_CATALOG.md` mục "Lịch hẹn V2" trước khi sửa file này: đã
-- ghi sẵn "Job nhắc nhân viên đọc thẳng start_at lúc gửi nên luôn thấy giờ
-- mới" — vì vậy job này QUÉT THẲNG bảng `appointments` (không nghe
-- `appointment.booked`), đúng lý do `appointment.rescheduled` bị CỐ Ý KHÔNG
-- PHÁT ở migration #83.
--
-- NHẮC NHÂN VIÊN: tự động, bắn ngay (không đợi digest 1 lần/ngày):
--   chuông (`notifications`) + Zalo Bot (`bot_outbox`, kind mới
--   'appointment_reminder', cùng quota/2-chế-độ #53/#54).
--
--   ĐÍNH CHÍNH so với chữ ADR mục 3 (liệt kê 3 kênh "đã chạy thật":
--   bot_outbox + activities + chuông): bên thi công KHÔNG ghi vào `activities`.
--   Lý do — soát trước khi code phát hiện một lỗi thật, không phải ý thích:
--   activities không có cơ chế tự đóng (chỉ người bấm "xong" mới set
--   `done_at`), nên mỗi ca hẹn sinh một "việc" không ai đóng sẽ nằm QUÁ HẠN
--   VĨNH VIỄN trên /app/today và hồ sơ khách — càng nhiều ca hẹn càng dồn rác,
--   không phải giả thuyết mà là hệ quả tất định của chính định nghĩa
--   `today_queue` (activities.done_at is null). Nối `activities` đúng cách
--   cần thêm cột liên kết + tự đóng theo trạng thái ca — lớn hơn hẳn "thêm 1
--   job pg_cron" của phạm vi việc 6, nên KHÔNG làm ở đây, ghi sổ làm sau (xem
--   "Điều kiện xem lại" cuối file). Chuông + Zalo Bot đã giao trọn nghĩa
--   "nhắc nhân viên tự động" — không mất chức năng, chỉ bớt một kênh có lỗi.
--
-- NHẮC KHÁCH: MÁY SOẠN, NGƯỜI BẤM GỬI (ADR mục 3) — chưa có kênh nào tự gửi
-- được cho khách (Zalo OA chờ pháp nhân). Tin soạn sẵn nằm NGAY trong nội
-- dung thông báo chuông (không thêm ô nhập/nút gửi mới — đúng phạm vi ADR
-- mục 7 hàng 6 "thêm 1 job pg_cron"); thông báo trỏ THẲNG vào đúng hội thoại
-- (`/app/inbox?c=...`, cùng khuôn `sla_fire`), lễ tân đọc — dán — bấm gửi
-- bằng ô trả lời ĐÃ CÓ SẴN (`sendReply`, việc 5). Máy không tự gọi sendReply
-- thay khách.
--
-- IDEMPOTENT: cột `appointments.reminded_at` — mỗi ca CHỈ nhắc đúng MỘT lần.
-- Dời giờ (`rescheduleAppointment`) PHẢI nhả lại mốc nhắc, nếu không ca dời
-- sang giờ khác sẽ vĩnh viễn không được nhắc — bắt lúc soát trước khi code,
-- cùng loại lỗi với việc gắn nhãn `source` sai ở việc 5 (xem trigger dưới).
-- ============================================================

-- ---------- appointments.reminded_at ----------

alter table public.appointments add column reminded_at timestamptz;

comment on column public.appointments.reminded_at is
  'V2 việc 6 — mốc job process_appointment_reminders() đã bắn nhắc nhân viên. NULL = chưa nhắc. Dời start_at phải đưa về NULL (trigger appointments_reset_reminder).';

-- Quét job chỉ cần ca CÒN GIỮ CHỖ, CHƯA nhắc, sắp tới — partial index nhỏ gọn,
-- khớp đúng mệnh đề WHERE của process_appointment_reminders() bên dưới.
create index appointments_reminder_due_idx
  on public.appointments (start_at)
  where status = 'booked' and deleted_at is null and reminded_at is null;

-- Dời giờ (kéo-thả trên màn Lịch / dialog) phải nhả lại mốc nhắc — ca ở giờ
-- MỚI vẫn cần được nhắc, không được coi là "đã nhắc" theo giờ CŨ.
create or replace function public.appointments_reset_reminder() returns trigger
language plpgsql as $$
begin
  if new.start_at is distinct from old.start_at then
    new.reminded_at := null;
  end if;
  return new;
end $$;

create trigger appointments_reset_reminder before update on public.appointments
  for each row execute function public.appointments_reset_reminder();

-- ---------- bot_outbox: thêm loại tin 'appointment_reminder' ----------
-- Bắn NGAY lúc job chạy (không gộp vào digest 1 lần/ngày — nhắc lịch cần tới
-- kịp trước giờ hẹn), dùng chung hàng đợi + worker gửi + quota tháng của #54.

alter table public.bot_outbox drop constraint if exists bot_outbox_kind_check;
alter table public.bot_outbox add constraint bot_outbox_kind_check
  check (kind in ('digest', 'test', 'appointment_reminder'));

-- ---------- process_appointment_reminders: cron 15 phút/lần ----------
-- Quét ca `booked`, chưa nhắc, bắt đầu trong tối đa 60 phút tới. Idempotent
-- bằng `reminded_at` (đặt ngay sau khi xử lý xong một ca, KHÔNG đợi hết batch
-- — job chết giữa chừng thì lần sau chỉ nhắc lại đúng phần chưa kịp làm).
create or replace function public.process_appointment_reminders(p_batch int default 200)
returns int
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  c_lead_minutes constant int := 60; -- khớp cadence cron 15 phút: nhắc trước 45–60 phút
  c_cap constant int := 3000;        -- trần Zalo Bot miễn phí/tháng, CHUNG bảng đếm với digest (#54)
  v_month date := date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date;
  r record;
  v_time text;
  v_service text;
  v_draft text;
  v_conv_id uuid;
  v_link text;
  v_chat_id text;
  v_quota_left boolean;
  v_jobid bigint;
  v_n int := 0;
begin
  for r in
    select a.id, a.tenant_id, a.contact_id, a.staff_user_id, a.start_at,
           ct.full_name as contact_name,
           coalesce(s.name, 'dịch vụ đã đặt') as service_name,
           t.timezone
    from public.appointments a
    join public.contacts ct on ct.id = a.contact_id
    join public.tenants t on t.id = a.tenant_id
    left join public.services s on s.id = a.service_id
    where a.status = 'booked'
      and a.deleted_at is null
      and a.reminded_at is null
      and a.start_at > now()
      and a.start_at <= now() + make_interval(mins => c_lead_minutes)
    order by a.start_at
    limit p_batch
  loop
    v_time := to_char(r.start_at at time zone r.timezone, 'HH24:MI');
    v_service := r.service_name;
    -- Soạn sẵn — xưng "tiệm", gọi thẳng tên khách (không chêm anh/chị: máy
    -- không đoán giới), cùng tông với success.draftMessage của việc 5.
    v_draft := 'Dạ tiệm nhắc ' || r.contact_name || ' có lịch hẹn ' || v_service
      || ' lúc ' || v_time || ' hôm nay nha. Hẹn gặp ' || r.contact_name || '!';

    -- Hội thoại gần nhất của khách (nếu có) — link mở THẲNG đúng khung chat,
    -- đúng ADR mục 3 "qua đúng khung chat đang mở". Ca đặt từ màn Lịch
    -- (source='calendar') có thể chưa từng có hội thoại nào → về /app/calendar.
    select cv.id into v_conv_id
      from public.conversations cv
      where cv.tenant_id = r.tenant_id and cv.contact_id = r.contact_id
      order by cv.last_message_at desc nulls last
      limit 1;
    v_link := case when v_conv_id is not null
                   then '/app/inbox?c=' || v_conv_id::text
                   else '/app/calendar' end;

    -- 1) Chuông trong app — bắn ngay, chứa sẵn tin gợi ý gửi khách.
    insert into public.notifications (tenant_id, user_id, type, title, body, link)
    values (
      r.tenant_id, r.staff_user_id, 'appointment_reminder',
      'Sắp tới: ' || v_service || ' lúc ' || v_time,
      r.contact_name || ' — ' || v_service || ' lúc ' || v_time || E'\n\n'
        || '— Tin gợi ý gửi khách —' || E'\n' || v_draft,
      v_link);

    -- 2) Zalo Bot — chỉ khi nhân viên đã ghép nối bot VÀ tiệm chưa chạm trần
    -- quota tháng. dedupe_key theo appointment_id: job chạy lại/kẹt lưới
    -- không dội bom hai tin cho cùng một ca.
    select l.external_chat_id into v_chat_id
      from public.staff_channel_links l
      join public.notification_channels nc
        on nc.tenant_id = l.tenant_id and nc.kind = 'zalo_bot'
       and nc.token_secret_id is not null
      where l.tenant_id = r.tenant_id and l.user_id = r.staff_user_id;

    if v_chat_id is not null then
      v_quota_left := coalesce((
        select q.sent_count from public.channel_quota q
          where q.tenant_id = r.tenant_id and q.month = v_month
      ), 0) < c_cap;

      if v_quota_left then
        insert into public.bot_outbox
            (tenant_id, user_id, external_chat_id, kind, dedupe_key, body)
          values (
            r.tenant_id, r.staff_user_id, v_chat_id, 'appointment_reminder',
            'appt_reminder:' || r.id::text,
            'iFan nhắc: ' || r.contact_name || ' — ' || v_service || ' lúc ' || v_time
              || ' hôm nay. Mở app xem tin soạn sẵn gửi khách.')
          on conflict (tenant_id, user_id, dedupe_key) do nothing;
      else
        -- Chạm trần: dừng nhắc qua Zalo + rung chuông cho platform admin
        -- (#44), KHÔNG chết ngầm. Chuông trong app cho nhân viên (bước 1)
        -- vẫn chạy bình thường — chỉ kênh Zalo bị dừng.
        select jobid into v_jobid from cron.job where jobname = 'process-appointment-reminders';
        if v_jobid is not null then
          insert into public.system_alerts
              (job_id, job_name, first_failed_at, last_failed_at, fail_count, detail)
            values
              (v_jobid, 'process-appointment-reminders', now(), now(), 1,
               'Tiệm ' || r.tenant_id || ' chạm trần ' || c_cap
                 || ' tin Zalo Bot trong tháng — nhắc lịch qua Zalo tạm dừng tới đầu tháng sau (chuông trong app vẫn chạy).')
            on conflict (job_id) where acknowledged_at is null
            do update set
              last_failed_at = excluded.last_failed_at,
              fail_count     = system_alerts.fail_count + 1,
              detail         = excluded.detail;
        end if;
      end if;
    end if;

    update public.appointments set reminded_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;

comment on function public.process_appointment_reminders is
  'V2 việc 6 (ADR-0009 mục 7 hàng 6): quét appointments sắp tới trong 60 phút, chưa nhắc — bắn chuông + Zalo Bot cho nhân viên, kèm tin soạn sẵn cho khách (chưa gửi — lễ tân tự bấm gửi trong khung chat).';

-- Chỉ pg_cron gọi — không mở cho client (khuôn bot_digest_run/process_sla_timers).
revoke all on function public.process_appointment_reminders(int) from public, anon, authenticated;

select cron.schedule('process-appointment-reminders', '*/15 * * * *',
                     'select public.process_appointment_reminders(200)');

-- ============================================================
-- Điều kiện xem lại (khuôn ADR-0009 cuối file):
--
-- - Nối `activities` đúng cách (thêm cột liên kết `appointment_id` + tự đóng
--   `done_at` theo trigger appointments_emit_events khi ca chuyển
--   arrived/done/cancelled/no_show) — khi làm, sửa luôn phần "ĐÍNH CHÍNH" ở
--   đầu file này và migration ghi rõ đây là bản đủ 3/3 kênh ADR mục 3.
-- - Khi Zalo OA cắm xong ⇒ đọc lại ADR-0009 "Điều kiện xem lại": ba việc đi
--   CÙNG NHAU (adapter NotifyChannel · trạng thái confirmed · bật nhắc khách
--   tự động) — lúc đó job này thêm nhánh gửi thẳng cho khách, không đập lại.
-- ============================================================
