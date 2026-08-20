-- #251 — GIỜ CA: đi muộn · về sớm · tăng ca máy TỰ TÍNH từ lần chấm thật.
-- Thẻ design: design-system/man-nhan-su-cham-cong.html (mục "Giờ ca — đi muộn,
-- về sớm, tăng ca máy tự tính").
--
-- ════════════════════════════════════════════════════════════════════
-- ĐÂY LÀ CÁI GỐC MÀ CHÍNH KHO NÀY ĐÃ CHỈ ĐÍCH DANH
-- ════════════════════════════════════════════════════════════════════
-- Thẻ design tự khai, mục "Bốn chỗ CỐ Ý chưa làm":
--   "ca KHÔNG có giờ bắt đầu/kết thúc (gốc rễ của việc tăng ca và đi trễ phải
--    nhập tay)"
-- và `tinhLaiBangCong()` trong `app/app/team/actions.ts` giải thích vì sao nó
-- chịu thua:
--   "muốn biết đi trễ phải có giờ bắt đầu ca, mà bảng `shifts` chỉ có sáng/
--    chiều/cả ngày chứ không có giờ. Bịa ra một con số rồi tính lương theo nó
--    là thứ tệ hơn để trống."
-- Cả hai câu đều ĐÚNG. Bản này không lật chúng — nó gỡ đúng cái điều kiện làm
-- chúng đúng: cho ca có giờ, rồi số tự tính ra từ dữ liệu thật.
--
-- VÌ SAO ĐÁNG SỬA, đo bằng đường tiền chứ không bằng "phần mềm nào cũng có":
--   · `timesheets.late_count` và `timesheets.overtime_hours` là hai cột CÓ
--     THẬT, có mặt trên bảng công (cột "Đi trễ", "Tăng ca"), nhưng LUÔN bằng 0
--     trừ khi quản lý gõ tay — `tinhLaiBangCong()` cố ý không đụng vào chúng.
--   · `app/app/payroll/actions.ts` lấy thẳng `sheet.overtime_hours` nhân
--     `employees.overtime_rate_vnd` thành một dòng tiền trên phiếu lương.
--   ⇒ Tiền tăng ca của cả tiệm đang dựa trên một con số GÕ TAY, không đối chiếu
--     được với bất kỳ lần chấm công nào. Đó vừa là chỗ trả nhầm, vừa là chỗ
--     không ai cãi lại được khi nhân viên hỏi "hôm đó em ở lại tới mấy giờ?".
--
-- ════════════════════════════════════════════════════════════════════
-- BỐN ĐIỂM CHỐT
-- ════════════════════════════════════════════════════════════════════
--
-- (1) GIỜ MẶC ĐỊNH ĐẶT Ở TIỆM, GIỜ RIÊNG ĐẶT Ở TỪNG Ô CA. Bắt gõ giờ cho từng
--     ô là 7 ngày × 15 người = 105 lần gõ mỗi tuần — không ai làm, và tính năng
--     không ai dùng thì bằng không có. ⇒ tiệm khai một bộ giờ chuẩn; ô ca chỉ
--     mang giờ khi nó KHÁC bộ chuẩn (ca gãy, hôm nay vào muộn có phép).
--
-- (2) CA "CẢ NGÀY" KHÔNG CÓ CẶP GIỜ RIÊNG — nó là từ đầu ca sáng tới hết ca
--     chiều. Thêm `shift_full_start/end` là mở đường cho hai sự thật lệch nhau
--     (sửa giờ ca sáng mà quên sửa giờ ca cả ngày).
--
-- (3) CÓ ÂN HẠN, VÀ CÓ NGƯỠNG TỐI THIỂU CHO TĂNG CA. Không có ân hạn thì đến
--     muộn 40 giây cũng vào sổ đi trễ — sổ đó không ai tin nữa. Không có ngưỡng
--     tăng ca thì nán lại 3 phút mỗi ngày cộng thành ~1 giờ công mỗi tháng, và
--     lương trả theo nó.
--
-- (4) KHÔNG CÓ CA QUA ĐÊM. Ràng buộc bắt `end_time > start_time`. Tiệm/spa/
--     salon đóng cửa trong ngày; dựng sẵn ca qua đêm là code không ai chạy, mà
--     nhánh không ai chạy thì không ai biết nó hỏng. Ngày nào thật sự cần thì
--     đó là một quyết định riêng, không phải thứ nhét kèm vào đây.

-- ── A. Bộ giờ chuẩn của tiệm ─────────────────────────────────────────
-- Đặt vào `attendance_settings` (#232) chứ không dựng bảng mới: bảng đó đã
-- đúng là "cấu hình chấm công theo tiệm", và giờ ca là thứ lần chấm được đem
-- ra so. Tách bảng ở đây là chia đôi một khối cấu hình để rồi phải join lại.
--
-- Giá trị mặc định lấy theo nhịp tiệm/salon VN phổ biến (sáng 8:30–13:00,
-- chiều 13:00–21:30). Đây là ĐIỂM XUẤT PHÁT cho tiệm chưa khai, không phải
-- luật — mọi tiệm chỉnh được.
alter table public.attendance_settings
  add column if not exists shift_morning_start   time not null default '08:30',
  add column if not exists shift_morning_end     time not null default '13:00',
  add column if not exists shift_afternoon_start time not null default '13:00',
  add column if not exists shift_afternoon_end   time not null default '21:30',
  add column if not exists late_grace_min integer not null default 5
    check (late_grace_min between 0 and 120),
  add column if not exists overtime_min_minutes integer not null default 30
    check (overtime_min_minutes between 0 and 240);

-- Giờ kết thúc phải sau giờ bắt đầu — nếu không, "về sớm" và "tăng ca" đổi dấu
-- cho nhau và bảng công ra số âm đọc như số dương.
alter table public.attendance_settings
  drop constraint if exists attendance_settings_gio_ca_hop_le;
alter table public.attendance_settings
  add constraint attendance_settings_gio_ca_hop_le check (
    shift_morning_end > shift_morning_start
    and shift_afternoon_end > shift_afternoon_start
  );

comment on column public.attendance_settings.shift_morning_start is
  '#251 — gio bat dau ca SANG cua tiem. Ca "ca ngay" = tu day den shift_afternoon_end, KHONG co cap gio rieng (diem chot 2).';
comment on column public.attendance_settings.late_grace_min is
  '#251 — an han di muon (phut). Vao tre trong khoang nay KHONG tinh la di muon. Mac dinh 5: khong co an han thi tre 40 giay cung vao so, va so do khong ai tin nua.';
comment on column public.attendance_settings.overtime_min_minutes is
  '#251 — nguong toi thieu de mot ngay duoc tinh tang ca (phut). Mac dinh 30: khong co nguong thi nan lai 3 phut moi ngay cong thanh ~1 gio cong moi thang, va luong tra theo no.';

-- ── B. Giờ riêng của từng ô ca ───────────────────────────────────────
-- Cả hai null = dùng bộ giờ chuẩn của tiệm theo `kind`. Đây là trường hợp
-- THƯỜNG; hai cột này chỉ mang giá trị khi ô ca đó KHÁC chuẩn.
--
-- KHOÁ BẢNG: `shifts` đo được 9.388 dòng (21/08, chỉ `select`). Thêm cột
-- NULLABLE không viết lại bảng (Postgres 11+), còn ràng buộc CHECK bên dưới có
-- quét bảng — nhưng mọi dòng cũ đều null cả hai cột nên vế đầu của CHECK thoả
-- ngay. Bảng này chỉ ghi khi quản lý bấm một ô lịch, KHÔNG phải bảng nóng như
-- `attendance_punches` (migration #234 cấm ALTER vì lý do đó) ⇒ áp thẳng được.
alter table public.shifts
  add column if not exists start_time time,
  add column if not exists end_time   time;

-- Một nửa cặp giờ là dữ liệu không dùng được: có giờ vào mà không có giờ ra thì
-- không tính nổi về sớm lẫn tăng ca. Bắt đủ cặp hoặc không có cặp nào.
alter table public.shifts
  drop constraint if exists shifts_gio_rieng_hop_le;
alter table public.shifts
  add constraint shifts_gio_rieng_hop_le check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  );

comment on column public.shifts.start_time is
  '#251 — gio bat dau RIENG cua o ca nay. Null = dung bo gio chuan cua tiem theo kind (attendance_settings). Chi dat khi o ca KHAC chuan: ca gay, hom nay vao muon co phep.';

-- ── C. Hai số mới trên bảng công ─────────────────────────────────────
-- `late_count` (số LẦN) và `overtime_hours` (số GIỜ) đã có sẵn từ #166 — bản
-- này không thêm cột trùng, chỉ làm cho chúng được MÁY tính thay vì gõ tay.
-- Thêm đúng hai số mà số-lần không nói được:
--   · đi muộn 1 lần 45 phút và đi muộn 1 lần 2 phút ra cùng `late_count = 1`;
--     tiệm phạt theo phút thì con số đó vô dụng.
--   · về sớm trước nay KHÔNG có chỗ nào ghi — nó là mặt còn lại của tăng ca,
--     thiếu nó thì bảng công chỉ kể phần có lợi cho một bên.
alter table public.timesheets
  add column if not exists late_minutes integer not null default 0
    check (late_minutes >= 0),
  add column if not exists early_leave_minutes integer not null default 0
    check (early_leave_minutes >= 0);

comment on column public.timesheets.late_minutes is
  '#251 — TONG so phut di muon trong ky, may tinh tu lan cham that so voi gio ca (da tru an han). Khac late_count (so LAN): muon 45 phut va muon 2 phut deu ra late_count=1.';
comment on column public.timesheets.early_leave_minutes is
  '#251 — TONG so phut ve som trong ky. Mat con lai cua tang ca: thieu no thi bang cong chi ke phan co loi cho mot ben.';
