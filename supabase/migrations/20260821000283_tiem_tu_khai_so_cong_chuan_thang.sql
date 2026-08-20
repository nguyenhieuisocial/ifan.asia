-- #283 — Tiệm tự khai SỐ CÔNG CHUẨN một tháng, thay cho con số 24 đóng cứng.
--
-- Màn Bảng lương gắn cờ "lương cứng đủ tháng mà thiếu công" khi số công dưới
-- **24**. Con số 24 nằm thẳng trong mã (`app/app/payroll/page.tsx`), kèm một
-- chú thích tự khai rất thành thật: *"Thẻ design KHÔNG nói con số này. Chọn 24
-- (tuần 6 ngày, nghỉ chủ nhật) vì đó là nếp phổ biến của tiệm dịch vụ VN."*
--
-- Nếp phổ biến không phải là mọi tiệm. Tiệm nghỉ hai ngày mỗi tuần làm khoảng
-- 22 công là bình thường, nhưng máy vẫn gắn cờ **toàn bộ nhân viên** mỗi tháng.
-- Cảnh báo bật lên hàng loạt trong khi không có gì sai thì người ta học cách
-- bỏ qua nó — và bỏ qua luôn cả lần nó đúng. Một cảnh báo kêu oan đều đặn còn
-- tệ hơn không có cảnh báo, vì nó vừa tốn công đọc vừa dạy người ta ngó lơ.
--
-- Để ở `attendance_settings` chứ không dựng bảng cấu hình mới: đây đúng là bộ
-- số của việc chấm công, nằm cạnh giờ ca chuẩn và mức ân hạn đi muộn (#251) —
-- cùng một màn, cùng một lần sửa.
--
-- Vẫn giữ 24 làm mặc định: tiệm chưa đụng tới thì hành vi không đổi một chút
-- nào so với hôm qua. Đây là mốc để HỎI, không phải để trừ tiền — đúng như
-- quyết định đã ghi trên thẻ design màn Bảng lương.
--
-- Chặn 1..31: 0 công thì cảnh báo không bao giờ bật (thành ra tắt ngầm một
-- chốt soát mà không ai biết), quá 31 thì bật cho mọi người mọi tháng.

alter table public.attendance_settings
  add column if not exists cong_chuan_thang integer not null default 24;

alter table public.attendance_settings
  drop constraint if exists attendance_settings_cong_chuan_hop_le;
alter table public.attendance_settings
  add constraint attendance_settings_cong_chuan_hop_le
  check (cong_chuan_thang between 1 and 31);

comment on column public.attendance_settings.cong_chuan_thang is
  'Số ngày công chuẩn một tháng của tiệm. Mốc để màn Bảng lương HỎI "lương cứng '
  'đủ tháng mà thiếu công", không phải để trừ tiền. Mặc định 24 (tuần 6 ngày) — #283.';

-- ────────────────────────────────────────────────────────────────────
-- PHỤ CẤP · THƯỞNG · PHẠT — ba loại khoản chưa có chỗ đúng để ghi
-- ────────────────────────────────────────────────────────────────────
--
-- Dòng ghi tay trên phiếu lương chỉ có ba loại: tạm ứng, bảo hiểm, và "điều
-- chỉnh". ĐO TRÊN DỮ LIỆU THẬT: **0 dòng** dùng loại "điều chỉnh". Con số 0 ở
-- đây không có nghĩa là không ai cần — nó có nghĩa là cái ô đó **không gọi tên
-- được thứ người ta thật sự muốn ghi**. Phụ cấp xăng xe, thưởng doanh số, phạt
-- đi muộn là ba khoản mà tiệm nào cũng có; hiện chúng phải nhét vào "điều
-- chỉnh" hoặc — nhiều khả năng hơn — nằm ngoài phần mềm.
--
-- Vì sao đáng thêm loại chứ không để chung một ô: phiếu lương là thứ đưa cho
-- người lao động đọc. "Điều chỉnh −200.000đ" là một câu gây cãi nhau; "Phạt đi
-- muộn −200.000đ" thì không. Cùng một số tiền, khác nhau ở chỗ có giải thích
-- được hay không.
--
-- Giữ nguyên 'adjust': nó vẫn đúng cho những khoản thật sự không thuộc ba loại
-- nào (bù sai sót kỳ trước chẳng hạn). Không xoá một loại đang tồn tại chỉ vì
-- hôm nay chưa ai dùng — dữ liệu cũ có thể có, và người sau sẽ tưởng là bỏ sót.
--
-- Dấu tiền do người nhập quyết, không ép ở đây: phụ cấp và thưởng thường dương,
-- phạt thường âm, nhưng có tiệm ghi phạt thành dòng dương rồi trừ ở chỗ khác.
-- Ép dấu là áp nếp kế toán của mình lên tiệm của người ta.

alter table public.payslip_lines
  drop constraint if exists payslip_lines_kind_check;
alter table public.payslip_lines
  add constraint payslip_lines_kind_check
  check (kind in ('base', 'commission', 'overtime', 'advance', 'insurance',
                  'allowance', 'bonus', 'penalty', 'adjust'));
