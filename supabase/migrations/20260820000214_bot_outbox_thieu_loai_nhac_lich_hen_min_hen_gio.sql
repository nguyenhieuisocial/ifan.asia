-- `bot_outbox.kind` không cho phép loại tin mà chính hệ thống đang chèn.
--
-- ═══════════════════════════════════════════════════════════════════
-- MÌN HẸN GIỜ: CHƯA NỔ CHỈ VÌ CHƯA AI DÙNG TÍNH NĂNG
-- ═══════════════════════════════════════════════════════════════════
-- Ràng buộc `bot_outbox_kind_check` chỉ cho ba loại:
--     CHECK (kind = ANY (ARRAY['digest', 'test', 'answer']))
--
-- Nhưng hàm `process_appointment_reminders()` chèn `kind = 'appointment_reminder'`.
-- Và việc chạy nền `process-appointment-reminders` đang **BẬT, 15 phút một lần**.
--
-- ĐO 20/08 trên CSDL thật (giao dịch rồi rollback, mỗi phép một savepoint):
--     kind = 'appointment_reminder'  →  BỊ CHẶN, 23514 bot_outbox_kind_check
--     kind = 'digest'   (ĐỐI CHỨNG)  →  CHÈN ĐƯỢC
--     kind = 'bia-dat'  (ĐỐI CHỨNG)  →  BỊ CHẶN
-- Hai đối chứng để loại hai cách đo hỏng: nếu 'digest' cũng hỏng thì lỗi ở bộ
-- đo chứ không ở ràng buộc; nếu kind bịa ra lại lọt thì ràng buộc không hoạt
-- động và phép đầu chặn vì lý do khác.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO NÓ CHƯA NỔ, VÀ VÌ SAO ĐIỀU ĐÓ LÀM NÓ NGUY HIỂM HƠN
-- ═══════════════════════════════════════════════════════════════════
-- `staff_channel_links` hiện **0 dòng** — chưa nhân viên nào ghép nối Zalo Bot.
-- Không có người nhận thì hàm không chèn dòng nào, nên nó chạy 96 lượt mỗi
-- ngày mà luôn "thành công".
--
-- **Người ĐẦU TIÊN ghép nối bot sẽ làm vỡ việc nhắc lịch hẹn** — và vỡ theo
-- kiểu tệ nhất: hàm ném lỗi giữa chừng, nên MỌI nhắc lịch trong cùng lượt chạy
-- đó mất theo, kể cả của người khác. Người bị mất lịch hẹn không hề biết, vì
-- thứ hỏng là cái ĐÁNG LẼ PHẢI ĐẾN chứ không phải cái hiện ra sai.
--
-- Đây đúng lớp bệnh mà kho này đã đặt tên: *"chốt chạy đúng chưa có nghĩa là
-- xong"*. Việc nền xanh 96 lượt/ngày không chứng minh nó chạy được — nó chỉ
-- chứng minh chưa có gì để làm.
--
-- ═══════════════════════════════════════════════════════════════════
-- CHỌN NỚI RÀNG BUỘC, KHÔNG SỬA HÀM
-- ═══════════════════════════════════════════════════════════════════
-- Hai đường vá:
--   (a) sửa hàm chèn `kind='digest'` cho khớp ràng buộc
--   (b) thêm `'appointment_reminder'` vào ràng buộc
--
-- Chọn (b). Vì `kind` không chỉ là nhãn — nó là thứ tầng phát tin và màn nhật
-- ký dùng để PHÂN BIỆT loại tin. Dồn nhắc lịch vào chung nhãn 'digest' thì bản
-- tin kinh doanh và nhắc lịch hẹn trộn làm một; sau này muốn tắt riêng một
-- loại, hoặc đếm riêng, sẽ không tách ra được nữa. (a) chữa được lỗi hôm nay
-- bằng cách xoá mất một thông tin có thật.
--
-- Ràng buộc viết lại thành danh sách ĐẦY ĐỦ chứ không cộng dồn, để đọc một lần
-- là thấy hết các loại hợp lệ.

alter table public.bot_outbox drop constraint bot_outbox_kind_check;

alter table public.bot_outbox add constraint bot_outbox_kind_check
  check (kind = any (array['digest', 'test', 'answer', 'appointment_reminder']));

comment on constraint bot_outbox_kind_check on public.bot_outbox is
  'Bốn loại tin bot được phép xếp hàng. THÊM LOẠI MỚI THÌ PHẢI SỬA Ở ĐÂY: migration #214 sinh ra vì `process_appointment_reminders()` chèn loại thứ tư mà ràng buộc chỉ khai ba — việc chạy nền 15 phút/lần vẫn xanh suốt vì chưa ai ghép nối bot, người đầu tiên ghép nối sẽ làm vỡ cả lượt nhắc lịch.';
