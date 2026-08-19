-- Năm cột ngày đang lấy mặc định theo GIỜ QUỐC TẾ, phải theo giờ Việt Nam.
--
-- ═══════════════════════════════════════════════════════════════════
-- BẪY ĐANG SỐNG, ĐO ĐƯỢC NGAY LÚC VIẾT DÒNG NÀY
-- ═══════════════════════════════════════════════════════════════════
-- Máy chủ CSDL chạy múi giờ UTC. Đo 20/08/2026 lúc rạng sáng giờ Việt Nam:
--
--     current_setting('TimeZone')                        →  UTC
--     current_date                                       →  2026-08-19
--     (now() at time zone 'Asia/Ho_Chi_Minh')::date      →  2026-08-20
--
-- Lệch ĐÚNG MỘT NGÀY, và lệch suốt khung **00:00–06:59 giờ Việt Nam mỗi ngày**
-- — tức 7 tiếng trong 24 tiếng, hơn một phần tư thời gian.
--
-- Đây là cùng một bệnh đã vá ở tầng ứng dụng (việc #192: bốn việc chạy nền
-- tưởng chạy 3h đêm hoá ra chạy 10h sáng, và ba chỗ ghi ngày lùi một ngày).
-- Lần đó vá ở tầng Node bằng khuôn `Date.now() + 7*3600*1000`. Nhưng **mặc
-- định của cột nằm trong chính CSDL**, tầng Node không với tới được.
--
-- ═══════════════════════════════════════════════════════════════════
-- KHUÔN ĐÚNG ĐÃ CÓ SẴN TRONG CHÍNH CSDL NÀY — 2/7 CỘT ĐÃ DÙNG
-- ═══════════════════════════════════════════════════════════════════
-- Quét toàn bộ cột kiểu `date` có mặc định: **7 cột**, trong đó
--     ĐÚNG  candidates.applied_on   ((now() at time zone 'Asia/Ho_Chi_Minh'))::date
--     ĐÚNG  job_openings.opened_on  ((now() at time zone 'Asia/Ho_Chi_Minh'))::date
--     BẪY   commission_entries.earned_on   CURRENT_DATE
--     BẪY   contracts.starts_at            CURRENT_DATE
--     BẪY   employees.started_on           CURRENT_DATE
--     BẪY   projects.started_on            CURRENT_DATE
--     BẪY   shift_closings.shift_date      CURRENT_DATE
--
-- Nên đây KHÔNG phải chuyện tranh luận cách làm — kho đã chốt cách đúng rồi,
-- năm cột này chỉ là những cột viết trước hoặc viết vội chưa theo. Việc cần
-- làm là kéo cả bảy về một khuôn, và để lại cổng canh (xem cuối file).
--
-- ═══════════════════════════════════════════════════════════════════
-- CHƯA HỎNG AI — VÀ ĐÓ CHÍNH LÀ LÝ DO PHẢI VÁ BÂY GIỜ
-- ═══════════════════════════════════════════════════════════════════
-- Đo trên dữ liệu thật, cả năm bảng: **0 dòng**. Không dòng nào đang lệch, vì
-- chưa tiệm thật nào dùng tới. Đối chứng: hai cột đã vá đúng cũng 0 dòng.
--
-- Vá lúc bảng còn rỗng là lúc RẺ NHẤT: đổi mặc định KHÔNG đụng dòng đã có, nên
-- không có gì để sửa ngược, không có gì để đối soát. Đợi tới lúc có dữ liệu
-- thì mỗi dòng sai là một bảng lương phải tính lại.
--
-- Cái giá nếu để nguyên, xếp theo mức đau:
--   · `commission_entries.earned_on`  hoa hồng rơi sang kỳ lương THÁNG TRƯỚC
--     nếu chốt vào rạng sáng mùng 1 — nhân viên nhận thiếu, và không ai nhìn
--     ra vì con số vẫn "có".
--   · `shift_closings.shift_date`     chốt ca đêm (đúng khung 00:00–07:00, tức
--     ca đêm LUÔN rơi vào khung này) bị ghi sang hôm trước ⇒ đối soát tiền mặt
--     lệch ngày, hai ca cùng một ngày còn ca kia trống.
--   · `contracts.starts_at`           khách mua gói 30 buổi lúc 00:30 mất trọn
--     một ngày sử dụng; mua lúc 00:30 mùng 1 thì hợp đồng rơi sang tháng trước.
--   · `employees.started_on`          thâm niên lệch một ngày.
--   · `projects.started_on`           ngày bắt đầu dự án lệch một ngày.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO KHÔNG ĐỔI `TimeZone` CỦA CẢ MÁY CHỦ CHO XONG
-- ═══════════════════════════════════════════════════════════════════
-- Đổi múi giờ máy chủ sẽ sửa cả năm chỗ này bằng một dòng, nhưng nó cũng lặng
-- lẽ đổi nghĩa của MỌI phép so ngày/giờ đang chạy — kể cả những chỗ đang cố ý
-- dùng UTC (mốc thời gian sự kiện, hạn thẻ, so với API bên thứ ba). Sửa một
-- chỗ đau bằng cách đổi luật nền cho tất cả là đúng kiểu bản vá sinh ra ba lỗ
-- mới. Ghim từng cột thì phạm vi đúng bằng thứ mình muốn đổi.
--
-- Và ghi rõ để không ai hiểu nhầm phạm vi: bản vá này **chỉ đổi MẶC ĐỊNH của
-- cột**. Chỗ nào tầng ứng dụng tự truyền ngày thì mặc định không chạy — những
-- chỗ đó đã theo khuôn `+7 tiếng` từ việc #192. Đây là lớp gác thứ hai cho
-- những chỗ QUÊN truyền, chứ không thay thế lớp thứ nhất.

alter table public.commission_entries
  alter column earned_on  set default ((now() at time zone 'Asia/Ho_Chi_Minh'))::date;
alter table public.contracts
  alter column starts_at  set default ((now() at time zone 'Asia/Ho_Chi_Minh'))::date;
alter table public.employees
  alter column started_on set default ((now() at time zone 'Asia/Ho_Chi_Minh'))::date;
alter table public.projects
  alter column started_on set default ((now() at time zone 'Asia/Ho_Chi_Minh'))::date;
alter table public.shift_closings
  alter column shift_date set default ((now() at time zone 'Asia/Ho_Chi_Minh'))::date;

comment on column public.commission_entries.earned_on is
  'Ngày ghi nhận hoa hồng, theo GIỜ VIỆT NAM. Không dùng CURRENT_DATE: máy chủ chạy UTC nên từ 00:00 đến 06:59 giờ VN nó trả về HÔM QUA — chốt hoa hồng rạng sáng mùng 1 sẽ rơi sang kỳ lương tháng trước (migration #213).';
comment on column public.shift_closings.shift_date is
  'Ngày của ca, theo GIỜ VIỆT NAM. Ca đêm LUÔN nằm trong khung 00:00–07:00 giờ VN — đúng khung mà CURRENT_DATE trả về hôm qua, nên cột này là chỗ bẫy cắn thường xuyên nhất (migration #213).';
comment on column public.contracts.starts_at is
  'Ngày bắt đầu hợp đồng, theo GIỜ VIỆT NAM. Bán gói lúc 00:30 mà ghi ngày hôm qua là khách mất trọn một ngày sử dụng (migration #213).';
comment on column public.employees.started_on is
  'Ngày vào làm, theo GIỜ VIỆT NAM (migration #213).';
comment on column public.projects.started_on is
  'Ngày bắt đầu dự án, theo GIỜ VIỆT NAM (migration #213).';
