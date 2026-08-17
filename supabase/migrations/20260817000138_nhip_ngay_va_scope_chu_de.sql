-- Migration #138 — nhịp ngày đo ĐÚNG GIAI ĐOẠN + mô tả 8 chủ đề khớp thiết kế.
-- Hồ sơ: ADR-0020 mục 3.3 và 3.4 (việc 2 và 3 trong 4).
--
-- ĐO ĐƯỢC (17/08): `daily_pulse` có cron chạy MỖI NGÀY 20:00 giờ VN, chạy
-- THÀNH CÔNG, mà chỉ **1 tin trong 30 ngày**. Đọc hàm ra ngay:
--
--     if v_tenants = 0 and v_contacts = 0 and v_help = 0 then return false;
--
-- Không tiệm mới, không khách mới, không yêu cầu Cần giúp ⇒ im. **Cố ý, và cố ý
-- đó ĐÚNG** ("không có gì thì đừng làm ồn"). Nhưng nó đo đúng ba thứ iFan
-- **chưa có** — trong khi thứ founder theo dõi hằng ngày ở giai đoạn này là
-- TIẾN ĐỘ THI CÔNG. Nhịp ngày vì thế trống rỗng đúng lúc nó cần nhất.
--
-- BA ĐỔI (ADR-0020 mục 3.3):
--   1. Thêm phần "Sản phẩm" — số bản ra, mảng đổi trạng thái. Đây cũng là chỗ
--      hứng phần việc nội bộ đã bị #133 chặn khỏi chủ đề Thông báo: nó không
--      biến mất, chỉ dồn về một dòng tổng cuối ngày.
--   2. Phần "Khách" NÓI RA khi bằng 0 thay vì làm cả tin biến mất — để im lặng
--      có nghĩa, founder không phải tự đoán giữa "không có việc gì" và "bot hỏng".
--   3. Chỉ im khi CẢ BA phần rỗng (không bản nào, không khách nào, máy không
--      hỏng gì). Ngày như vậy thì im là đúng.
--
-- VÁ KÈM, KHÔNG PHẢI SCOPE CREEP — hai lỗi ĐANG SỐNG trong chính hàm này:
--   a. `v_asks` (câu hỏi gửi bot) được ĐẾM nhưng không nằm trong điều kiện phát
--      ⇒ ngày chỉ có câu hỏi thì vẫn im. Nay tính vào.
--   b. `contacts` đếm KHÔNG lọc tiệm mẫu ⇒ khách của tiệm demo bị cộng vào số
--      thật. Đây là việc theo dõi **#148**, và viết lại một hàm mà để nguyên
--      phép đếm sai thì tin tổng kết sẽ nói số sai — không thể tách ra được.
--      **#148 đóng tại đây.**

create or replace function public.daily_pulse()
returns boolean
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                             at time zone 'Asia/Ho_Chi_Minh';
  v_tenants int;
  v_contacts int;
  v_asks int;
  v_help int;
  v_releases int;
  v_features int;
  v_loi_may int;
  v_body text;
begin
  -- Khách (giai đoạn này thường bằng 0 — vẫn phải nói ra)
  select count(*) into v_tenants from public.tenants
   where deleted_at is null and coalesce(is_sample,false) = false and created_at >= v_day_start;
  -- #148: chỉ đếm khách của tiệm THẬT. Trước đây thiếu điều kiện này nên khách
  -- của tiệm demo bị cộng vào, làm con số tự lừa mình về quy mô.
  select count(*) into v_contacts from public.contacts c
   where c.deleted_at is null and c.created_at >= v_day_start
     and exists (select 1 from public.tenants t
                  where t.id = c.tenant_id and coalesce(t.is_sample,false) = false);
  select count(*) into v_asks from public.tg_bridge_queue where created_at >= v_day_start;
  select count(*) into v_help from public.help_requests where created_at >= v_day_start;

  -- Sản phẩm — đếm từ chính hàng đợi tin, nguồn duy nhất đã có, không dựng
  -- bảng đếm mới (D2).
  select count(*) into v_releases from public.platform_outbox
   where kind = 'release' and created_at >= v_day_start;
  select count(*) into v_features from public.platform_outbox
   where kind = 'feature_change' and created_at >= v_day_start;

  -- Máy — việc chạy nền hỏng trong ngày.
  select count(*) into v_loi_may from public.platform_outbox
   where kind in ('system_alert', 'channel_down') and created_at >= v_day_start;

  -- Im CHỈ KHI cả ba phần rỗng.
  if v_tenants = 0 and v_contacts = 0 and v_help = 0 and v_asks = 0
     and v_releases = 0 and v_features = 0 and v_loi_may = 0 then
    return false;
  end if;

  v_body := '🌙 Tổng kết ' ||
            to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM');

  if v_releases > 0 or v_features > 0 then
    v_body := v_body || E'\n\nSản phẩm';
    if v_releases > 0 then
      v_body := v_body || E'\n· ' || v_releases ||
                case when v_releases = 1 then ' tin bản mới' else ' tin bản mới' end;
    end if;
    if v_features > 0 then
      v_body := v_body || E'\n· ' || v_features || ' lần danh sách mảng đổi trạng thái';
    end if;
  end if;

  v_body := v_body || E'\n\nKhách';
  if v_tenants = 0 and v_contacts = 0 and v_help = 0 and v_asks = 0 then
    -- Câu này là CHỦ ĐÍCH, không phải chỗ trống: im lặng phải có nghĩa.
    v_body := v_body || E'\n· chưa có tiệm mới, chưa có khách mới, chưa có yêu cầu Cần giúp';
  else
    if v_tenants > 0  then v_body := v_body || E'\n· ' || v_tenants  || ' tiệm mới đăng ký'; end if;
    if v_contacts > 0 then v_body := v_body || E'\n· ' || v_contacts || ' khách hàng mới'; end if;
    if v_help > 0     then v_body := v_body || E'\n· ' || v_help     || ' yêu cầu Cần giúp'; end if;
    if v_asks > 0     then v_body := v_body || E'\n· ' || v_asks     || ' câu hỏi gửi bot'; end if;
  end if;

  if v_loi_may > 0 then
    v_body := v_body || E'\n\nMáy\n· ' || v_loi_may ||
              ' việc chạy nền hỏng — xem chủ đề Kỹ thuật';
  end if;

  perform public.platform_notify('daily_pulse',
    'pulse:' || to_char(v_day_start, 'YYYY-MM-DD'), v_body);
  return true;
end $$;

comment on function public.daily_pulse() is
  'Tổng kết ngày, 3 phần: Sản phẩm · Khách · Máy (ADR-0020 mục 3.3, migration #138). Phần Khách NÓI RA khi bằng 0 — cố ý, để im lặng có nghĩa. Chỉ im khi CẢ BA phần rỗng. Đếm khách đã lọc tiệm mẫu (đóng việc #148).';

-- ②  Mô tả 8 chủ đề khớp bảng chốt ADR-0020 mục 3.1, và khai RÕ luồng nào chưa
--     có gì đổ vào (mục 3.4) — để không ai tưởng đã có canh. Đúng bài học của
--     tuần này: thứ chưa tồn tại phải TỰ KHAI là chưa tồn tại.
update public.tg_topics set scope =
  'thông báo một chiều từ đội ngũ: bản mới có gì, thay đổi ảnh hưởng người dùng. '
  'Tin bản mới GỘP MỖI GIỜ (không còn mỗi bản một tin) — bản vá bảo mật và bản có '
  'mảng đổi trạng thái vẫn ra ngay. Cuối ngày có tin tổng kết. Việc dọn dẹp nội bộ '
  'KHÔNG vào đây. KHÔNG thảo luận ở đây — bàn thì sang chủ đề đúng nội dung'
  where thread_id = 8;

update public.tg_topics set scope =
  'tính năng sản phẩm iFan: mảng nào vừa dùng được, màn nào có gì, lộ trình. Máy tự '
  'đổ vào đây mỗi lần một mảng đổi trạng thái. KHÔNG phải chỗ báo hỏng — cái gì '
  'đang lỗi thì sang chủ đề Lỗi'
  where thread_id = 2;

update public.tg_topics set scope =
  'khách hàng và bán hàng: tiệm nào vừa đăng ký, ai đang cần giúp. Hai loại tin này '
  'gửi NGAY, không gộp — quý và hiếm. (Hai luồng billing và churn đã khai sẵn nhưng '
  'CHƯA có gì đổ vào, sẽ có ở đợt V6/V8)'
  where thread_id = 25;

update public.tg_topics set scope =
  'kỹ thuật và vận hành hệ thống: mã nguồn, cơ sở dữ liệu, hạ tầng, triển khai. Máy '
  'tự đổ vào đây cảnh báo việc chạy nền hỏng, gửi NGAY. Khác chủ đề Lỗi ở chỗ: Lỗi '
  'là NGƯỜI thấy sai, đây là MÁY tự khai. (Hai luồng system_alert và channel_down đã '
  'khai sẵn; tới 17/08 chưa có tin nào — vì chưa có việc hỏng, không phải vì chưa nối)'
  where thread_id = 27;

-- Điều kiện xem lại
--
-- • Khi iFan có tiệm thật đầu tiên ⇒ đọc lại thứ tự 3 phần của nhịp ngày. Lúc đó
--   "Khách" mới là phần chính và "Sản phẩm" nên co lại. Thiết kế hiện tại CỐ Ý
--   nghiêng về thi công **vì giai đoạn này chưa có khách**, không phải vì thi
--   công quan trọng hơn khách.
-- • Khi `billing`/`churn`/`system_alert`/`channel_down` có producer đầu tiên ⇒ gỡ
--   câu "chưa có gì đổ vào" khỏi `scope` chủ đề tương ứng, nếu không chính nó
--   thành thông tin sai.
-- • Nếu nhịp ngày im quá 2 ngày liền trong lúc vẫn có bản ra ⇒ job `daily-pulse`
--   hoặc điều kiện đếm đã hỏng. Đo: `cron.job_run_details` + đếm tay
--   `platform_outbox` theo ngày. (Đúng loại lỗi đã xảy ra: cron chạy thành công
--   nhưng hàm tự chặn không phát.)
