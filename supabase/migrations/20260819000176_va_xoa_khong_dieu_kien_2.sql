-- VÁ tiếp: câu `update` thiếu `where` thứ HAI, cùng lớp lỗi với #175.
--
-- Cổng kiểm `scripts/soat-xoa-khong-dieu-kien.mjs` (viết ngay sau sự cố băng-rôn
-- chết câm 12 tiếng) quét toàn bộ hàm CSDL và tìm thêm được cái này. Nó CHƯA nổ
-- chỉ vì `cron_failure_scan` mới chỉ chạy bằng lịch trong CSDL — nhưng ngày nào
-- có ai gọi nó qua cửa công khai là hỏng y hệt, và cũng im lặng y hệt.
--
-- Bảng `cron_scan_state` cố ý CHỈ CÓ MỘT DÒNG (mốc quét gần nhất), nên `where
-- true` giữ nguyên đúng ý "đặt lại mốc" mà vẫn thoả chốt chặn của máy chủ.
--
-- Đây là lý do phải có cổng máy thay vì tự nhắc nhau: cái thứ nhất mất 12 tiếng
-- mới lộ ra, cái thứ hai lộ ra trong 3 phút.

CREATE OR REPLACE FUNCTION public.cron_failure_scan()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  update public.cron_scan_state set last_scanned_at = v_new_mark where true;
end;
$function$
;
