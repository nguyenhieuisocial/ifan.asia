-- #285 — Bảng công ghi thêm SỐ PHÚT LÀM THẬT, để trả lương theo giờ tính được.
--
-- #284 mở ba kiểu trả lương cứng: theo tháng · theo ngày công · theo giờ. Hai
-- kiểu đầu tính được ngay từ số liệu đang có (`work_days`). Kiểu thứ ba thì
-- KHÔNG: bảng công đếm ngày, đếm số lần đi muộn, đếm phút muộn và phút về sớm
-- — nhưng chưa chỗ nào giữ **tổng số phút thật sự làm việc**.
--
-- Đây đúng là loại nợ mà kho này gọi tên là "dựng rồi bỏ": mở một kiểu trả
-- lương mà không tính được nó thì người dùng chọn xong sẽ nhận phiếu lương 0đ
-- và không hiểu vì sao. Nên bù nốt cột còn thiếu trong CÙNG một lượt, thay vì
-- để lại một nửa.
--
-- Số phút lấy từ chính hai mốc chấm công của mỗi ngày — cùng nguồn với phép
-- tính đi muộn / về sớm / tăng ca (#251), nên không đẻ ra nguồn thứ hai để rồi
-- lệch. Ngày nghỉ CÓ LƯƠNG được cộng theo độ dài ca chuẩn của hôm đó: nghỉ
-- phép năm là ngày được trả tiền, trả theo giờ mà đếm 0 giờ thì thành nghỉ
-- không lương — đúng cái lỗi vừa vá ở #250, không lặp lại ở đơn vị khác.
--
-- Quên chấm ra thì ngày đó cộng 0 phút, giống nếp đã chốt ở #251 ("chỗ cố ý
-- không đoán"): không có mốc ra thì không suy ra được người đó về lúc nào, và
-- đoán hộ ở đây là đoán ra tiền.

alter table public.timesheets
  add column if not exists work_minutes integer not null default 0;

alter table public.timesheets
  drop constraint if exists timesheets_work_minutes_hop_le;
alter table public.timesheets
  add constraint timesheets_work_minutes_hop_le
  check (work_minutes >= 0 and work_minutes <= 31 * 24 * 60);

comment on column public.timesheets.work_minutes is
  'Tổng số phút làm thật trong kỳ, cộng từ hai mốc chấm công mỗi ngày; ngày nghỉ '
  'có lương cộng theo độ dài ca chuẩn. Dùng cho kiểu trả lương theo giờ — #285.';
