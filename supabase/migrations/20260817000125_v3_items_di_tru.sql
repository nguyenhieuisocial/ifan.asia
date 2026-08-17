-- ============================================================
-- iFan.asia — Migration #125: V3 "Tiền thật" việc 1 — di trú `services` →
-- `items` (ADR-0019, docs/adr/0019-v3-tien-that.md mục 3). Đọc ADR trước khi
-- sửa file này — quyết định GỘP thay vì dựng bảng thứ hai đã CHỐT ở đó.
--
-- VIỆC RỦI RO NHẤT CỦA ĐỢT V3 (ADR mục 8): đổi tên một bảng đang chạy thật
-- (V2 "Lịch hẹn", chạy từ 13/08) và sửa MỌI nơi gọi tới nó trong CÙNG migration
-- — không rải rác qua nhiều đợt, để không có khoảng thời gian nào code và
-- CSDL lệch tên nhau.
--
-- ĐO trước khi làm (ADR mục 2, 17/08): `services` mới 4 dòng, `appointments`
-- 0 dòng — di trú bây giờ không bao giờ rẻ hơn nữa.
--
-- BỐN VIỆC trong file này:
--   1. Đổi tên bảng + mọi constraint/index/policy/trigger cho khớp tên mới
--      (RENAME COLUMN/CONSTRAINT không tự sửa THÂN hàm plpgsql — phải tự tay
--      sửa từng hàm bên dưới, xem điểm dễ sai nhất ở cuối file).
--   2. Thêm cột (kind/cost_vnd/unit/group_name), đổi is_active → status
--      (draft/active/discontinued — 24a việc 46).
--   3. Dựng `item_variants` (24a) + guard chỉ gắn được vào item kind=product.
--   4. Đổi `appointments.service_id` → `item_id` + guard chỉ gắn được vào
--      item kind=service (ADR mục 3 "Việc di trú cụ thể").
--
-- CỐ TÌNH CHƯA LÀM ở migration này (thuộc migration B, task #141 — ADR mục 9):
-- chặn CỘT `cost_vnd` với vai `staff` ở tầng CSDL. Kho này dùng ĐÚNG MỘT vai
-- Postgres (`authenticated`) cho mọi vai app (owner/admin/manager/staff/viewer)
-- — phân quyền hiện tại luôn là RLS theo DÒNG qua `app_role()`, chưa có tiền
-- lệ che THEO CỘT. Che cột thật cần REVOKE cấp Postgres (chặn TẤT CẢ vai app,
-- kể cả owner) hoặc một view/RPC riêng — đó là quyết định kiến trúc, để dành
-- lúc dựng lãi gộp (task #141) khi mới có nơi thật sự cần đọc `cost_vnd`.
-- Bây giờ `cost_vnd` đọc được qua policy `items_select` như mọi cột khác.
-- ============================================================

-- ---------- 1. Đổi tên bảng + mọi đối tượng phụ thuộc ----------

alter table public.services rename to items;

alter table public.items rename constraint services_pkey to items_pkey;
alter table public.items rename constraint services_tenant_id_fkey to items_tenant_id_fkey;
alter table public.items rename constraint services_tenant_id_name_key to items_tenant_id_name_key;
alter table public.items rename constraint services_name_check to items_name_check;
alter table public.items rename constraint services_duration_minutes_check to items_duration_minutes_check;
alter table public.items rename constraint services_price_vnd_check to items_price_vnd_check;

alter policy services_select on public.items rename to items_select;
alter policy services_manage on public.items rename to items_manage;

alter trigger services_touch on public.items rename to items_touch;

-- ---------- 2. Cột mới: kind / cost_vnd / unit / group_name / status ----------
-- `duration_minutes` gốc là NOT NULL (chỉ dịch vụ dùng) — nới ra trước khi có
-- dòng kind=product cần NULL ở cột này. Check `> 0` gốc VẪN đúng cho NULL
-- (Postgres coi kết quả NULL của phép so sánh là "qua", không phải "fail"),
-- nên không phải viết lại check đó.

alter table public.items alter column duration_minutes drop not null;

alter table public.items
  add column kind text not null default 'service' check (kind in ('service','product')),
  add column cost_vnd bigint check (cost_vnd is null or cost_vnd >= 0),
  add column unit text check (unit is null or char_length(btrim(unit)) between 1 and 20),
  add column group_name text check (group_name is null or char_length(btrim(group_name)) <= 60);

comment on column public.items.kind is
  'service = dịch vụ theo lịch (cần duration_minutes) · product = hàng hoá bán lẻ (cần unit). ADR-0019 mục 3.';
comment on column public.items.cost_vnd is
  'Giá vốn — NULLABLE (24a): NULL nghĩa là "chưa nhập", không phải "giá vốn = 0". Dùng tính lãi gộp ở V3 việc 7.';
comment on column public.items.unit is
  'Đơn vị BÁN của product (cái/hộp/kg…). Bắt buộc khi kind=product, PHẢI trống khi kind=service (constraint items_kind_fields_check).';
comment on column public.items.group_name is
  'Nhóm hiển thị TỰ DO — không phải khoá ngoại tới bảng danh mục riêng. Chưa có màn quản lý danh mục thì chưa dựng bảng categories (D2).';

-- Vòng đời (24a việc 46): bool 2 giá trị không mang nổi "chưa mở bán" khác
-- "đã ngừng bán" — hai trạng thái cần hai cách xử lý khác hẳn nhau ở màn
-- Hàng hoá (V3 việc 3). Backfill giữ nguyên ý nghĩa cũ: true → active,
-- false → discontinued (không có dòng nào từng ở trạng thái "chưa mở bán"
-- trước migration này, vì cột đó chưa từng tồn tại).
alter table public.items add column status text;
update public.items set status = case when is_active then 'active' else 'discontinued' end;
alter table public.items alter column status set not null;
alter table public.items alter column status set default 'active';
alter table public.items add constraint items_status_check
  check (status in ('draft', 'active', 'discontinued'));
alter table public.items drop column is_active;

comment on column public.items.status is
  'draft = đang soạn, chưa mở bán · active = đang bán · discontinued = ngừng bán (không phải xoá — lịch/đơn cũ vẫn đọc được tên). ADR-0019 mục 3.';

-- Ràng buộc chéo theo `kind` — CSDL từ chối dữ liệu nửa vời (bất biến 1).
alter table public.items add constraint items_kind_fields_check check (
  (kind = 'service' and duration_minutes is not null and unit is null)
  or
  (kind = 'product' and duration_minutes is null and unit is not null)
);

comment on table public.items is
  'ADR-0019 mục 3 — di trú từ `services` (migration #83, ADR-0009). Catalog DUY NHẤT cho dịch vụ (kind=service) và hàng hoá (kind=product). `item_variants` mở rộng cho product có biến thể. CẤM dựng bảng thứ hai cùng nghĩa — nơi thứ hai luôn thành nơi lỗi thời (D1).';

-- ---------- 3. item_variants (24a) ----------
-- tenant_id đặt LUÔN trên bảng con thay vì chỉ join qua item_id — đúng khuôn
-- dùng khắp kho (vd. business_closures) để RLS không cần subquery hai tầng.

create table public.item_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  -- Thuộc tính ĐÓNG theo pack ngành (size/màu…), khai trước trong
  -- industry_packs — KHÔNG phải chỗ tự do đặt tên thuộc tính (24a).
  attributes jsonb not null default '{}'::jsonb,
  -- Giá đè. NULL = dùng price_vnd của item gốc.
  price_vnd bigint check (price_vnd is null or price_vnd >= 0),
  sku text check (sku is null or char_length(btrim(sku)) between 1 and 60),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- NULL không đụng NULL trong UNIQUE (Postgres) ⇒ nhiều biến thể chưa gán
  -- SKU vẫn tồn tại song song; chỉ SKU ĐÃ ĐẶT mới phải là duy nhất trong tiệm.
  unique (tenant_id, sku)
);
alter table public.item_variants enable row level security;
create policy item_variants_select on public.item_variants for select
  using (tenant_id = (select public.current_tenant_id()));
create policy item_variants_manage on public.item_variants for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
create trigger item_variants_touch before update on public.item_variants
  for each row execute function public.touch_updated_at();
revoke all on public.item_variants from anon;
create index item_variants_item_idx on public.item_variants (item_id);

comment on table public.item_variants is
  'ADR-0019 mục 3 (hợp đồng 24a). Biến thể của item kind=product. Trigger item_variants_kind_guard chặn gắn variant vào item kind=service.';

create or replace function public.item_variants_kind_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.items where id = new.item_id;
  if v_kind is distinct from 'product' then
    raise exception 'item_variants chỉ gắn được vào item kind=product (item % là %)', new.item_id, v_kind
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger item_variants_kind_guard before insert or update of item_id
  on public.item_variants
  for each row execute function public.item_variants_kind_guard();

-- ---------- 4. appointments.service_id → item_id ----------

alter table public.appointments rename column service_id to item_id;
alter table public.appointments rename constraint appointments_service_id_fkey to appointments_item_id_fkey;
alter index appointments_service_idx rename to appointments_item_idx;

comment on column public.appointments.item_id is
  'Trỏ vào items kind=service (guard: appointments_item_kind_guard). Nullable: item có thể bị gỡ khỏi bảng giá sau — ca cũ vẫn đọc được, giá đã chốt nằm ở price_vnd ngay trên ca này.';

create or replace function public.appointments_item_kind_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_kind text;
begin
  if new.item_id is null then
    return new;
  end if;
  select kind into v_kind from public.items where id = new.item_id;
  if v_kind is distinct from 'service' then
    raise exception 'Lịch hẹn chỉ gắn được item kind=service (item % là %)', new.item_id, v_kind
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger appointments_item_kind_guard before insert or update of item_id
  on public.appointments
  for each row execute function public.appointments_item_kind_guard();

-- ---------- ĐIỂM DỄ SAI NHẤT của file này ----------
-- RENAME COLUMN/CONSTRAINT chỉ cập nhật những gì Postgres lưu dưới dạng CÂY
-- ĐÃ PHÂN TÍCH (index predicate, check constraint, định nghĩa view) — KHÔNG
-- đụng vào thân hàm plpgsql, vì thân hàm được lưu dưới dạng VĂN BẢN thô. Bốn
-- hàm dưới đây có nhắc `service_id`/`public.services` trong thân — tất cả
-- phải CREATE OR REPLACE lại nguyên vẹn, chỉ đổi đúng chỗ đó. Bỏ sót một hàm
-- ở đây là bug âm thầm: hàm vẫn chạy (Postgres không báo lỗi cột không tồn
-- tại cho tới khi hàm thật sự thực thi), nhưng đọc nhầm bảng/cột đã đổi tên.

-- ---- appointments_emit_events (migration #83, ADR-0009) — payload key ----
create or replace function public.appointments_emit_events() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'contact_id', new.contact_id,
    'staff_user_id', new.staff_user_id,
    'resource_id', new.resource_id,
    'item_id', new.item_id,
    'start_at', new.start_at,
    'end_at', new.end_at,
    'price_vnd', new.price_vnd,
    'source', new.source);

  if tg_op = 'INSERT' then
    perform public.wf_emit(new.tenant_id, 'appointment.booked', 'appointment',
                           new.id::text, v_payload);
    return null;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    return null;
  end if;

  if new.status is distinct from old.status then
    perform public.wf_emit(
      new.tenant_id, 'appointment.' || new.status, 'appointment', new.id::text,
      case when new.status = 'cancelled'
        then v_payload || jsonb_build_object('cancel_reason', new.cancel_reason,
                                             'cancelled_by', auth.uid())
        else v_payload end);
  end if;
  return null;
end $$;

-- ---- process_appointment_reminders (migration #85) — join sang items ----
-- Chép NGUYÊN VẸN thân hàm gốc từ migration #85 — chỉ đổi đúng một chỗ:
-- `left join public.services s on s.id = a.service_id` → `public.items` /
-- `a.item_id`. Không được tự ý viết lại logic (bịa lại thân hàm là bug âm
-- thầm nguy hiểm nhất của kiểu migration này — xem cảnh báo phía trên).
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
    left join public.items s on s.id = a.item_id
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

-- Chỉ pg_cron gọi — không mở cho client (khuôn bot_digest_run/process_sla_timers,
-- giữ đúng revoke gốc của migration #85).
revoke all on function public.process_appointment_reminders(int) from public, anon, authenticated;

-- ---- bot_answer (migration #121) — nhánh "lịch": join sang items ----
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
        left join public.items s on s.id = a.item_id
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

-- CREATE OR REPLACE không xoá quyền đã cấp trên hàm (privilege gắn theo chữ
-- ký hàm, không theo thân hàm) — re-issue chỉ để khớp NGUYÊN VĂN migration
-- #121 gốc, không phải vì thiếu quyền.
revoke all on function public.bot_answer(text, uuid, text, text) from public;
grant execute on function public.bot_answer(text, uuid, text, text) to anon, authenticated;

-- ---- apply_industry_pack (migration #83) — insert vào items ----
-- Đọc JSON key vẫn là 'services' trong industry_packs.content (dữ liệu ngành
-- đã seed từ migration #83, đổi tên key ở đây không đổi được dữ liệu cũ và
-- không cần thiết — chỉ đích ghi đổi từ bảng `services` sang `items`).
create or replace function public.apply_industry_pack(p_pack_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_sample jsonb;
  v_services jsonb;
  v_tag text;
  v_qr jsonb;
  v_svc jsonb;
  v_inactive_days int;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if (select public.app_role()) not in ('owner','admin') then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.industry_packs where key = p_pack_key) then
    raise exception 'invalid_pack_key';
  end if;

  update public.tenants set industry = p_pack_key where id = v_tenant;

  select content -> 'sample_data', content -> 'services'
    into v_sample, v_services
    from public.industry_packs where key = p_pack_key;

  -- Tags mẫu — arbiter phải khớp đúng partial unique index tags_tenant_id_name_active_idx
  for v_tag in select jsonb_array_elements_text(coalesce(v_sample -> 'tags', '[]'::jsonb))
  loop
    insert into public.tags (tenant_id, name) values (v_tenant, v_tag)
      on conflict (tenant_id, name) where deleted_at is null do nothing;
  end loop;

  -- Câu trả lời nhanh mẫu
  for v_qr in select jsonb_array_elements(coalesce(v_sample -> 'quick_replies', '[]'::jsonb))
  loop
    insert into public.quick_replies (tenant_id, title, content, sort_order)
      values (v_tenant, v_qr ->> 'title', v_qr ->> 'content', coalesce((v_qr ->> 'sort_order')::int, 0))
      on conflict (tenant_id, title) do nothing;
  end loop;

  -- Dịch vụ mẫu — nay ghi vào `items` với kind='service', status='active'
  -- (giữ đúng hành vi cũ: seed xong là dùng được ngay, không qua nháp).
  for v_svc in select jsonb_array_elements(coalesce(v_services, '[]'::jsonb))
  loop
    insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd, sort_order, status)
      values (v_tenant, 'service', v_svc ->> 'name',
              (v_svc ->> 'duration_minutes')::int,
              coalesce((v_svc ->> 'price_vnd')::bigint, 0),
              coalesce((v_svc ->> 'sort_order')::int, 0),
              'active')
      on conflict (tenant_id, name) do nothing;
  end loop;

  -- 2 view mặc định (24p, mục 36.10A) — số ngày khác nhau vì nhịp quay lại
  -- tự nhiên của từng nghề khác nhau (quán cà phê 1 tuần/lần vs nha khoa
  -- khám định kỳ 6 tháng). Đây là con số KHỞI ĐIỂM, tiệm sửa lại được.
  v_inactive_days := case p_pack_key
    when 'spa' then 60
    when 'kham' then 180
    when 'pet' then 75
    when 'fnb' then 30
    when 'shop' then 45
    when 'retail' then 60
    when 'education' then 90
    else 60 -- 'other' và mọi key ngoài danh sách trên
  end;

  insert into public.saved_views (tenant_id, user_id, screen, name, query, vocab_version, position)
    values
      (v_tenant, null, 'contacts', 'Cần kéo về', 'tier=vip&inactive_days=' || v_inactive_days, 1, 0),
      (v_tenant, null, 'contacts', 'Khách mới', 'tier=new', 1, 1)
    on conflict do nothing;

  perform public.record_audit_log('tenant', v_tenant, 'pack_applied', jsonb_build_object('pack_key', p_pack_key));
end;
$$;
