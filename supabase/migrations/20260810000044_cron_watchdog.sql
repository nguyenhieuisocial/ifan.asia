-- #44 — Chuông báo job nền hỏng + dọn lịch sử pg_cron (học FlowX: hỏng là phải kêu, không chết ngầm)
--
-- Bối cảnh đo thật 10/08: 10 job pg_cron đang chạy, 0 lần hỏng, nhưng bảng
-- cron.job_run_details đã 21.071 dòng sau 5 ngày (~4.3k/ngày vì 3 job chạy
-- mỗi phút) — không dọn sẽ phình chết gói miễn phí 500MB.
--
-- Thiết kế:
--   1. system_alerts        — cảnh báo mức NỀN TẢNG (không thuộc tenant nào, nên
--                             KHÔNG đi qua outbox domain_events vốn tenant-scoped;
--                             chỉ platform admin đọc/ghi nhận qua RLS).
--                             Mỗi job chỉ giữ MỘT cảnh báo đang mở (unique partial
--                             index) — hỏng lặp lại thì cộng dồn, không dội bom.
--   2. cron_scan_state      — "mực nước" lần quét cuối: mỗi lần hỏng chỉ đếm đúng
--                             một lần, quét lại không đếm trùng.
--   3. cron_failure_scan()  — chạy 10 phút/lần, quét các lần chạy ĐÃ KẾT THÚC
--                             với status='failed' kể từ mực nước.
--   4. cron-history-cleanup — mỗi ngày xóa lịch sử chạy cũ hơn 14 ngày
--                             (giữ ~60k dòng ổn định thay vì 1.5M dòng/năm).
--
-- Hiển thị: màn /admin (cổng is_platform_admin). Đẩy ra kênh ngoài (Zalo Bot)
-- là việc #53 — cần founder tự tạo bot trước.

create table public.system_alerts (
  id bigint generated always as identity primary key,
  job_id bigint not null,
  job_name text not null,
  first_failed_at timestamptz not null,
  last_failed_at timestamptz not null,
  fail_count integer not null default 1,
  detail text not null,
  acknowledged_at timestamptz
);

comment on table public.system_alerts is
  'Cảnh báo nền tảng (job nền hỏng...). Một cảnh báo đang mở cho mỗi job; admin ghi nhận bằng acknowledged_at.';

-- Mỗi job chỉ một cảnh báo đang mở — hỏng tiếp thì cộng dồn vào dòng đó.
create unique index system_alerts_open_per_job
  on public.system_alerts (job_id)
  where acknowledged_at is null;

alter table public.system_alerts enable row level security;

create policy system_alerts_select on public.system_alerts
  for select using (public.is_platform_admin());

create policy system_alerts_ack on public.system_alerts
  for update using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on public.system_alerts from anon;
grant select, update on public.system_alerts to authenticated;

-- Mực nước quét — đúng 1 dòng, chỉ hàm quét (chạy dưới quyền owner) đụng tới.
create table public.cron_scan_state (
  id boolean primary key default true check (id),
  last_scanned_at timestamptz not null
);

insert into public.cron_scan_state (last_scanned_at) values (now());

alter table public.cron_scan_state enable row level security;
-- RLS bật, KHÔNG policy: không ai đọc/ghi qua API; hàm security definer (owner) vẫn dùng được.
revoke all on public.cron_scan_state from anon, authenticated;

create or replace function public.cron_failure_scan()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz;
  v_new_mark timestamptz;
begin
  select last_scanned_at into v_since from public.cron_scan_state for update;

  -- Chỉ xét lần chạy ĐÃ KẾT THÚC sau mực nước — lần đang chạy chưa có kết cục,
  -- đợi lần quét sau; nhờ vậy mỗi thất bại được đếm đúng một lần.
  select coalesce(max(d.end_time), v_since) into v_new_mark
  from cron.job_run_details d
  where d.end_time > v_since;

  insert into public.system_alerts (job_id, job_name, first_failed_at, last_failed_at, fail_count, detail)
  select
    d.jobid,
    coalesce(min(j.jobname), 'job #' || d.jobid),
    min(d.start_time),
    max(d.start_time),
    count(*)::int,
    left(coalesce((array_agg(d.return_message order by d.start_time desc))[1], '(không có thông điệp lỗi)'), 500)
  from cron.job_run_details d
  left join cron.job j on j.jobid = d.jobid
  where d.status = 'failed'
    and d.end_time > v_since
  group by d.jobid
  on conflict (job_id) where acknowledged_at is null
  do update set
    last_failed_at = excluded.last_failed_at,
    fail_count     = system_alerts.fail_count + excluded.fail_count,
    detail         = excluded.detail;

  update public.cron_scan_state set last_scanned_at = v_new_mark;
end;
$$;

comment on function public.cron_failure_scan is
  'Quét cron.job_run_details tìm lần chạy failed kể từ mực nước; gộp vào system_alerts (một cảnh báo mở/job).';

-- Chỉ pg_cron (chạy dưới postgres) gọi — không mở cho client.
revoke execute on function public.cron_failure_scan from public, anon, authenticated;

select cron.schedule('cron-failure-scan', '*/10 * * * *', $$select public.cron_failure_scan()$$);

-- Dọn lịch sử chạy cũ hơn 14 ngày — cùng họ với qr-throttle-cleanup / app-rate-limit-cleanup.
select cron.schedule(
  'cron-history-cleanup',
  '23 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '14 days'$$
);
