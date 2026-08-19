-- ĐỒNG HỒ CANH IM LẶNG — bài học lớn nhất ngày 19/08/2026.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO CÓ FILE NÀY
-- ═══════════════════════════════════════════════════════════════════
-- Hôm nay HAI thứ hỏng suốt ~12 tiếng mà không có gì báo:
--   1. Băng-rôn "Bản mới đã lên" — một câu xoá thiếu `where` làm cả giao dịch
--      đổ, lượt nào cũng đổ y hệt. Web vẫn lên bản đều, chỉ có tiếng báo là tắt.
--   2. Cổng kiểm tự động đỏ 6 lượt liên tiếp.
-- Người phát hiện cả hai là FOUNDER, bằng cách tự thấy Telegram im.
--
-- Kho đã có `cron_failure_scan` (#44) — nhưng nó chỉ thấy việc chạy nền HỎNG,
-- không thấy việc chạy nền IM. Hai chuyện khác nhau:
--   · HỎNG = có chạy, có ném lỗi ⇒ `cron.job_run_details` ghi lại ⇒ đã canh.
--   · IM   = không chạy nữa, hoặc chạy xong mà đầu ra ngoài đời tắt ngấm
--            ⇒ KHÔNG có dòng nào để đọc ⇒ trước hôm nay KHÔNG AI CANH.
-- "Không có tin xấu" và "không có tin nào" nhìn giống hệt nhau — đó là toàn bộ
-- vấn đề. File này làm cho chúng khác nhau.
--
-- ═══════════════════════════════════════════════════════════════════
-- CÁCH LÀM: KHAI TRƯỚC KỲ VỌNG, RỒI ĐO SỰ VẮNG MẶT
-- ═══════════════════════════════════════════════════════════════════
-- Không thể phát hiện "thiếu" nếu chưa nói trước là "phải có". Nên mỗi nhịp
-- phải được KHAI TÊN và KHAI KHOẢNG CÁCH TỐI ĐA ở bảng dưới. Nhịp chưa khai =
-- nhịp không được canh, và điều đó nhìn thấy được (bảng này là danh sách đóng).
create table if not exists public.heartbeats (
  key             text primary key,
  -- NULL = đã khai nhưng CHƯA BAO GIỜ thấy chạy. Đây là trạng thái đáng ngờ
  -- NHẤT (nhịp chưa từng sống), không phải "chưa có dữ liệu, bỏ qua".
  last_seen_at    timestamptz,
  max_gap_minutes int not null check (max_gap_minutes > 0),
  mo_ta           text not null,
  -- Tắt canh một nhịp phải NÓI LÝ DO — tắt im lặng thì đúng bằng không có canh.
  tam_tat_ly_do   text check (tam_tat_ly_do is null or length(trim(tam_tat_ly_do)) > 0),
  created_at      timestamptz not null default now()
);
alter table public.heartbeats enable row level security;
-- Không tiệm nào đọc/ghi được: đây là dữ liệu vận hành nền tảng, không phải
-- dữ liệu của tiệm. Chỉ hàm security-definer và màn quản trị nền tảng chạm tới.
revoke all on public.heartbeats from anon, authenticated;

comment on table public.heartbeats is
  'Danh sách ĐÓNG các nhịp chạy nền phải sống, kèm khoảng vắng tối đa cho phép. Có mặt ở đây mới được canh — thêm nhịp mới thì PHẢI khai vào đây.';

-- ── Nhịp nào phải sống ────────────────────────────────────────────────
-- Khoảng cho phép = chu kỳ thật NHÂN ~3, để một lượt trượt lẻ không kêu oan.
-- Cổng hay kêu oan là cổng bị người ta tắt đi — đã học đúng bài này hôm nay.
insert into public.heartbeats (key, max_gap_minutes, mo_ta) values
  ('web.bot_outbox', 45,
   'Nhịp 15 phút từ Vercel: dọn hàng đợi tin nhân viên, chuông founder, dò bản mới. Chính nhịp này chết câm 12 tiếng ngày 19/08.'),
  ('web.webhook_dispatch', 20,
   'Nhịp 5 phút từ Vercel: đẩy tin sang phần mềm khác của tiệm.'),
  ('db.cron_scheduler', 35,
   'Bộ hẹn giờ TRONG kho dữ liệu. Chết cái này là 12 việc nền chết theo mà không ai biết.'),
  ('db.silence_scan', 35,
   'Chính đồng hồ canh này. Canh mà không ai canh lại thì nó im là cả hệ im.')
on conflict (key) do update set
  max_gap_minutes = excluded.max_gap_minutes,
  mo_ta = excluded.mo_ta;

-- ── Đóng dấu "tôi còn sống" ───────────────────────────────────────────
-- Nhịp chạy ở Vercel gọi hàm này. `p_key` phải có sẵn trong bảng: gõ sai tên là
-- 0 dòng và hàm trả false — KHÔNG âm thầm tạo nhịp mới, vì một nhịp tự sinh ra
-- do gõ nhầm sẽ không bao giờ được ai canh mà cũng không ai biết nó tồn tại.
create or replace function public.heartbeat_touch(p_key text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_n int;
begin
  update public.heartbeats set last_seen_at = now() where key = p_key;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$fn$;
revoke all on function public.heartbeat_touch(text) from public;
grant execute on function public.heartbeat_touch(text) to authenticated, anon;

comment on function public.heartbeat_touch is
  'Nhịp chạy nền đóng dấu "còn sống". Tên gõ sai ⇒ trả false, KHÔNG tự tạo nhịp mới.';

-- ── Quét sự im lặng ───────────────────────────────────────────────────
-- Ghi vào `system_alerts` để DÙNG LẠI đường báo đã có: trigger
-- `system_alerts_platform_notify` đẩy sang Telegram founder, kèm vé chống trùng
-- tối đa 1 tin/ngày/job. Không dựng đường báo thứ hai.
--
-- `job_id` phải KHÔNG đụng id thật của bộ hẹn giờ (số dương nhỏ), nên dùng số ÂM
-- suy ra từ tên nhịp — ổn định qua các lượt chạy, để cảnh báo của cùng một nhịp
-- gộp vào MỘT dòng thay vì đẻ dòng mới mỗi 10 phút.
create or replace function public.silence_scan()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
  v_n int := 0;
  v_job_id bigint;
  v_cron_last timestamptz;
begin
  -- Bộ hẹn giờ trong CSDL tự đóng dấu: lần chạy gần nhất của BẤT KỲ việc nào
  -- cũng chứng minh nó còn sống. Không phải sửa 12 hàm sẵn có.
  select max(d.end_time) into v_cron_last from cron.job_run_details d;
  if v_cron_last is not null then
    update public.heartbeats set last_seen_at = v_cron_last where key = 'db.cron_scheduler';
  end if;

  update public.heartbeats set last_seen_at = now() where key = 'db.silence_scan';

  for r in
    select * from public.heartbeats
     where tam_tat_ly_do is null
       and (last_seen_at is null
            or now() - last_seen_at > make_interval(mins => max_gap_minutes))
  loop
    v_job_id := -(abs(hashtext(r.key)) % 1000000000) - 1;
    v_n := v_n + 1;

    insert into public.system_alerts (job_id, job_name, first_failed_at, last_failed_at, fail_count, detail)
    values (
      v_job_id,
      'im lặng: ' || r.key,
      coalesce(r.last_seen_at, now()),
      now(),
      1,
      case
        when r.last_seen_at is null
          then 'Nhịp "' || r.key || '" CHƯA BAO GIỜ chạy kể từ khi được khai. ' || r.mo_ta
        else 'Nhịp "' || r.key || '" im '
             || round(extract(epoch from (now() - r.last_seen_at)) / 60)::text
             || ' phút (cho phép tối đa ' || r.max_gap_minutes || ' phút). ' || r.mo_ta
      end
    )
    -- Còn im thì mỗi lượt quét cộng thêm một lần đếm, nhưng vé chống trùng của
    -- trigger giữ đúng 1 tin/ngày — báo lặp là báo bị bỏ qua.
    on conflict (job_id) where acknowledged_at is null
    do update set last_failed_at = now(),
                  fail_count = public.system_alerts.fail_count + 1,
                  detail = excluded.detail;
  end loop;

  -- Nhịp sống lại thì TỰ TẮT chuông. Cảnh báo phải tự dọn, nếu không bảng đầy
  -- tiếng chuông cũ và không ai phân biệt được cái nào còn thật.
  update public.system_alerts a
     set acknowledged_at = now()
   where a.acknowledged_at is null
     and a.job_id < 0
     and exists (
       select 1 from public.heartbeats h
        where a.job_name = 'im lặng: ' || h.key
          and (h.tam_tat_ly_do is not null
               or (h.last_seen_at is not null
                   and now() - h.last_seen_at <= make_interval(mins => h.max_gap_minutes)))
     );

  return v_n;
end;
$fn$;
revoke all on function public.silence_scan() from public, anon, authenticated;

comment on function public.silence_scan is
  'Tìm nhịp chạy nền đã IM quá lâu và bật chuông; nhịp sống lại thì tự tắt chuông. Khác cron_failure_scan: cái kia thấy việc CHẠY MÀ HỎNG, cái này thấy việc KHÔNG CHẠY NỮA.';

-- Chạy mỗi 10 phút, cùng nhịp với bộ quét thất bại đã có.
select cron.schedule('silence-scan', '*/10 * * * *', 'select public.silence_scan();')
 where not exists (select 1 from cron.job where jobname = 'silence-scan');
