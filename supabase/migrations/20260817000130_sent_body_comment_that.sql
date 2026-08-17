-- Migration #130 — chú thích cột `sent_body` phải NÓI THẬT sau khi gỡ Haiku.
--
-- #122 đặt chú thích: "Bản Haiku soạn lại đã THẬT SỰ gửi". Ngày 17/08 bước
-- Haiku soạn lại ĐÃ BỊ GỠ (lý do đo được: xem đầu migration #129), nên chú
-- thích đó trỏ vào một tính năng không còn tồn tại — người đọc sau sẽ đi tìm
-- code không có, hoặc tệ hơn: tưởng cột này đang có dữ liệu Haiku.
--
-- Đây là ca "tài liệu nói dối" mà dự án đã trả giá nhiều lần (cổng check-ds.mjs
-- không tồn tại, việc #117 tự khai đóng trong khi khoá AI chưa từng có trên máy
-- chủ). Cột chết mà chú thích vẫn khoe tính năng là cùng một họ bệnh.
--
-- CỐ Ý CHƯA GỠ CỘT ở đợt này: gỡ nó phải drop + tạo lại
-- `platform_complete_outbox` — một hàm đang chạy production — chỉ để bỏ một cột
-- nullable vô hại. Không cân xứng. Đã ghi việc theo dõi để dọn gọn một lần
-- (cùng họ với việc #145 bỏ `domain_events.is_sandbox`).

comment on column public.platform_outbox.sent_body is
  'CỘT CHẾT từ 17/08 — không còn ai ghi. Trước đó (#122) dùng để lưu bản Haiku soạn lại, nhưng bước đó đã bị gỡ (xem migration #129) và chưa từng chạy thật lần nào: 60/60 tin tới 17/08 đều null. Giữ lại vì gỡ cột phải tạo lại platform_complete_outbox đang chạy production; đã có việc theo dõi để dọn. ĐỪNG dựng tính năng mới trên cột này.';

-- Điều kiện xem lại
--
-- • Khi dọn cột: nhớ sửa cả `platform_complete_outbox` (bỏ tham số
--   `p_sent_body`, nay đang được `lib/notify/platform-outbox.ts` truyền null
--   tường minh) và lời gọi trong TS — sửa một bên là lỗi runtime trên bản thật,
--   `tsc` không bắt được vì PostgREST khớp tham số lúc chạy.
-- • Nếu ai đó dựng lại bước soạn lại tin bằng AI: đọc "Điều kiện xem lại" của
--   migration #129 TRƯỚC — căn cứ gỡ là giới hạn thông tin, không phải giá.
