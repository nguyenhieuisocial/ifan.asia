-- csatQc (19/08/2026) — MỘT lịch hẹn chỉ đẻ MỘT phiếu đánh giá.
--
-- Vì sao cần: nhân viên bấm "Hoàn thành" nhiều lần (bấm nhầm rồi bấm lại, hoặc
-- hai người cùng mở màn Lịch) thì mỗi lần lại sinh thêm một phiếu + một link.
-- Khách nhận nhiều link cho cùng một buổi, và số "đã gửi / đã trả lời" đếm sai.
-- Chặn ở CSDL chứ không ở web: hai lượt bấm gần nhau đều thấy "chưa có phiếu"
-- rồi cùng ghi — kiểm ở tầng web không đỡ được (cùng bài học ADR-0009 mục 6).
create unique index if not exists satisfaction_surveys_appointment_unique
  on public.satisfaction_surveys (appointment_id);

-- Index cũ (không unique) thành thừa: index unique ở trên tra cứu được y hệt.
drop index if exists satisfaction_surveys_appointment_idx;
