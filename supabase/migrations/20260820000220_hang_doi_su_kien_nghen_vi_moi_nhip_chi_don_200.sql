-- ═══════════════════════════════════════════════════════════════════
-- HÀNG ĐỢI SỰ KIỆN BỊ NGHẼN — mỗi nhịp chỉ dọn 200, dữ liệu thật đổ vào
-- nhanh gấp trăm lần
-- ═══════════════════════════════════════════════════════════════════
--
-- ĐO ĐƯỢC (20/08, trên dữ liệu thật sau khi nạp đầy 6 tiệm mẫu):
--
--   • `domain_events` tồn đọng 74.395 dòng chưa xử lý, dòng cũ nhất đã nằm đó
--     gần 1 tiếng.
--   • Nhịp `process-workflow-events` chạy MỖI PHÚT và KHÔNG HỀ HỎNG (7 ngày
--     qua: 10.080 lượt, 0 lượt lỗi). Nó vẫn sống — nhưng mỗi lượt chỉ được
--     phép dọn 200 dòng.
--   • Đo tốc độ rút thật: 400 sự kiện / 2,1 phút = 191 dòng/phút. Với tốc độ
--     đó, đống tồn cần 6,5 TIẾNG mới hết.
--
-- VÌ SAO ĐÂY LÀ HỎNG THẬT, KHÔNG PHẢI "CHẬM MỘT CHÚT":
--
--   Pha 1 lấy việc bằng `order by id limit p_batch` — tức XẾP HÀNG THEO THỨ
--   TỰ. Một sự kiện MỚI phải đứng sau toàn bộ 74.395 dòng cũ. Đã dựng đối
--   chứng để chứng minh (chạy trong transaction rồi rollback):
--
--     - Tạo một `contact.created` mới cho tiệm CÓ workflow đang bật.
--     - Chạy đúng nhịp thật `process_workflow_events(200)` ⇒ sinh ra 0 run.
--       Tức việc tự động của tiệm KHÔNG chạy.
--     - Chạy lại với batch đủ lớn ⇒ sinh ra 1 run.
--
--   Hai kết quả khác nhau trên CÙNG một sự kiện chứng minh: workflow không
--   sai, điều kiện không sai — chỉ có HÀNG ĐỢI là thủ phạm. Nếu hôm nay một
--   tiệm thật thêm khách mới, việc "Gọi khách mới trong 2 giờ" sẽ nổ sau 6,5
--   tiếng, tức là trễ mất chính cái hạn 2 giờ mà nó hứa.
--
-- VÌ SAO 200 LÀ QUÁ NHỎ — và bao nhiêu thì vừa:
--
--   Đo chi phí thật của hàm, mỗi lần trong transaction rồi rollback:
--
--        batch=   200 →  0,10s  (2.041 sự kiện/giây)
--        batch= 1.000 →  0,19s  (5.181 sự kiện/giây)
--        batch= 5.000 →  1,04s  (4.798 sự kiện/giây)
--        batch=20.000 →  3,51s  (5.696 sự kiện/giây)
--
--   Hàm chạy TUYẾN TÍNH và rẻ. Trần 200 không đến từ chi phí — nó là con số
--   chọn từ thời kho chỉ có dữ liệu demo lèo tèo, và chưa ai chỉnh lại khi
--   dữ liệu thật đổ vào. Chọn 5.000: hết ~1 giây, trong khi nhịp cách nhau 60
--   giây ⇒ dư 60 lần chỗ thở. Đống tồn 74k sẽ hết sau ~15 phút thay vì 6,5
--   tiếng.
--
-- ═══════════════════════════════════════════════════════════════════

-- ── A. TÁCH PHA 2 RA KHỎI CỠ BATCH CỦA PHA 1 ───────────────────────
--
-- Bản cũ giới hạn pha 2 bằng `limit p_batch * 5`. Nếu chỉ nâng batch lên
-- 5.000 mà không sửa chỗ này thì pha 2 được phép chạy tới 25.000 workflow
-- run trong MỘT lượt — và pha 2 mới là pha đắt (mỗi run gọi
-- `execute_workflow_run`, đụng bảng thật, tạo việc, bắn chuông).
--
-- Đây là cái bẫy do CHÍNH bản vá này tạo ra, nên phải chặn ngay trong cùng
-- một bản: ghim pha 2 ở 1.000 — ĐÚNG BẰNG giá trị đang chạy hôm nay
-- (200 × 5 = 1.000). Tức pha 2 không đổi một chút nào so với hiện tại; chỉ
-- pha 1 được nới. Nâng riêng pha 1, giữ nguyên pha 2.
--
-- Phần thân hàm còn lại giữ NGUYÊN TỪNG CHỮ so với bản đang chạy.

create or replace function public.process_workflow_events(p_batch integer default 100)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  e public.domain_events%rowtype;
  w public.workflows%rowtype;
  r record;
  v_event jsonb;
  v_agg jsonb;
  v_matched int;
  v_executed int := 0;
  -- Trần riêng cho pha 2, KHÔNG ăn theo p_batch. Xem ghi chú mục A: pha 2
  -- đắt hơn pha 1 nhiều lần, nới pha 1 mà kéo theo pha 2 là tự đào hố.
  c_run_moi_luot constant int := 1000;
begin
  -- Pha 1: ghép event với workflow đang bật → tạo run
  for e in
    select * from public.domain_events
    where processed_at is null
    order by id
    limit p_batch
  loop
    if e.causation_chain > 3 then
      update public.domain_events set processed_at = now() where id = e.id;
      continue;
    end if;

    v_event := to_jsonb(e);
    v_agg := public.wf_aggregate(e.aggregate_type, e.aggregate_id, e.tenant_id);
    v_matched := 0;
    for w in
      select * from public.workflows
      where tenant_id = e.tenant_id and is_active and trigger_event = e.event_type
      order by created_at
    loop
      if public.wf_match_conditions(w.conditions, v_event, v_agg) then
        insert into public.workflow_runs (tenant_id, workflow_id, event_id, depth)
          values (e.tenant_id, w.id, e.id, e.causation_chain)
          on conflict (workflow_id, event_id) do nothing;
        v_matched := v_matched + 1;
      end if;
    end loop;

    -- Không workflow nào quan tâm → xong ngay, không giữ event lại quét mãi
    if v_matched = 0 then
      update public.domain_events set processed_at = now() where id = e.id;
    end if;
  end loop;

  -- Pha 2: chạy các run đến hạn (kể cả run kẹt 'running' quá 10 phút do worker chết)
  for r in
    select id from public.workflow_runs
    where (status in ('pending','failed') and next_attempt_at <= now())
       or (status = 'running' and started_at < now() - interval '10 minutes')
    order by created_at
    limit c_run_moi_luot
  loop
    perform public.execute_workflow_run(r.id);
    v_executed := v_executed + 1;
  end loop;

  -- Pha 3: mọi run của event đã kết thúc (done/dead) → event coi như đã xử lý
  update public.domain_events e2 set processed_at = now()
  where e2.processed_at is null
    and exists (select 1 from public.workflow_runs r2 where r2.event_id = e2.id)
    and not exists (
      select 1 from public.workflow_runs r3
      where r3.event_id = e2.id and r3.status in ('pending','running','failed'));

  return v_executed;
end $function$;

-- ── B. NỚI TRẦN PHA 1: 200 → 5.000 MỖI PHÚT ───────────────────────
--
-- Dùng `cron.schedule` chứ không `unschedule` + `schedule`: từ pg_cron 1.4
-- (bản đang chạy 1.6.4) hàm này ghi đè theo khoá `(jobname, username)`, không
-- sinh bản trùng — cùng cách đã dùng ở #203. Lịch giữ nguyên `* * * * *`,
-- chỉ đổi đúng con số trong lệnh.

select cron.schedule('process-workflow-events', '* * * * *',
  $$select public.process_workflow_events(5000)$$);

-- ── C. VÌ SAO KHÔNG GÌ BÁO — VÀ CHUÔNG CÒN THIẾU ──────────────────
--
-- Điều đáng sợ nhất của ca này không phải con số 200. Là lúc đo, MỌI ĐÈN ĐỀU
-- XANH:
--
--   • 24/24 việc chạy nền báo "succeeded", 7 ngày qua 0 lượt lỗi.
--   • 4/4 nhịp tim của đồng hồ canh im lặng đều tươi.
--   • `dong-ho-im-lang-smoke` 16/16 PASS.
--
-- Mà việc tự động của tiệm vẫn trễ 6,5 tiếng.
--
-- Vì đồng hồ #178 đo "CÓ CHẠY KHÔNG", còn cái hỏng ở đây là "CHẠY CÓ KỊP
-- KHÔNG". Một việc chạy đúng mỗi phút, không lỗi lần nào, mà mỗi lần chỉ
-- ngoạm 200 trong khi 74.000 đang xếp hàng — thì nó vừa "khoẻ" theo mọi thước
-- đo hiện có, vừa vô dụng. Đây đúng loại "hỏng im lặng" mà #178 sinh ra để
-- chặn, chỉ khác chiều đo, nên nó lọt.
--
-- Thêm một cây kim đo ĐỘ TRỄ, không phải độ sống: nếu sự kiện cũ nhất chưa
-- xử lý đã nằm quá 30 phút thì kêu. Chọn 30 phút vì hàng đợi khoẻ luôn rỗng
-- sau mỗi nhịp (đo được: dọn sạch 73.595 dòng trong 15 nhịp); quá 30 phút
-- nghĩa là nhịp không còn theo kịp nguồn đổ vào — đúng cái hôm nay không ai
-- thấy.
--
-- Dùng lại `system_alerts` + khoá `(job_id) where acknowledged_at is null`
-- y như `process_appointment_reminders` đã làm: kêu thì gộp một dòng, cộng
-- dồn lần đếm, KHÔNG đẻ chuông mới mỗi lượt quét.

create or replace function public.event_backlog_scan()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  c_tre_toi_da constant interval := interval '30 minutes';
  v_cu_nhat timestamptz;
  v_ton int;
  v_phut int;
  v_jobid bigint;
begin
  select min(created_at), count(*) into v_cu_nhat, v_ton
    from public.domain_events where processed_at is null;

  select jobid into v_jobid from cron.job where jobname = 'process-workflow-events';
  if v_jobid is null then return 0; end if;

  -- Hàng đợi rỗng hoặc còn tươi ⇒ tắt chuông cũ. Không có bước này thì bảng
  -- đầy tiếng chuông chết và người ta ngừng đọc — bài học đã ghi ở #178.
  if v_cu_nhat is null or now() - v_cu_nhat <= c_tre_toi_da then
    update public.system_alerts set acknowledged_at = now()
     where job_id = v_jobid and acknowledged_at is null;
    return 0;
  end if;

  v_phut := floor(extract(epoch from (now() - v_cu_nhat)) / 60);
  insert into public.system_alerts
      (job_id, job_name, first_failed_at, last_failed_at, fail_count, detail)
    values
      (v_jobid, 'process-workflow-events', now(), now(), 1,
       'Hàng đợi sự kiện trễ ' || v_phut || ' phút (tối đa 30 phút) — còn '
         || v_ton || ' sự kiện chưa xử lý. Việc tự động của tiệm đang nổ muộn '
         || 'chừng đó. Nhịp VẪN chạy và VẪN báo thành công, nên không đèn nào '
         || 'khác đỏ.')
    on conflict (job_id) where acknowledged_at is null
    do update set
      last_failed_at = excluded.last_failed_at,
      fail_count     = system_alerts.fail_count + 1,
      detail         = excluded.detail;
  return v_ton;
end $function$;

revoke all on function public.event_backlog_scan() from public, anon, authenticated;

select cron.schedule('event-backlog-scan', '*/10 * * * *',
  $$select public.event_backlog_scan()$$);
