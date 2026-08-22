-- ════════════════════════════════════════════════════════════════════
-- BẬT CHỤP ẢNH KHI CHẤM CÔNG CHO MỌI TIỆM
-- ════════════════════════════════════════════════════════════════════
--
-- Chỉ đạo founder 22/08, nguyên văn: *"toàn bộ ảnh khuôn mặt user đều phải được
-- lưu lại, nếu liên quan đến chấm công thì hiện ảnh đã chụp để click check nếu
-- cần"*.
--
-- ⚠️ ĐỔI HÀNH VI THẤY ĐƯỢC: từ nay nhân viên phải chụp ảnh mới chấm công được.
--   Đây là thay đổi người dùng cảm nhận ngay, không phải sửa ngầm.
--
-- ⚠️ VÌ SAO KHÔNG SỢ KẸT KHI MÁY HỎNG CAMERA: kho đã có sẵn "chấm công giúp"
--   (#234) — đồng nghiệp chấm hộ bằng máy của họ, và lượt đó LUÔN bị gắn cờ để
--   quản lý biết. Founder đã tính trước chuyện này từ trước khi giao việc.
--   Không có đường lùi đó thì bật ảnh bắt buộc là khoá người ta ngoài cửa.
--
-- ⚠️ ẢNH ĐÃ ĐƯỢC THU NHỎ TRƯỚC KHI LƯU (cạnh dài 720px). Không có bước đó thì
--   bật cho toàn hệ thống sẽ ngốn khoảng nửa gigabyte mỗi tháng, mà gói lưu trữ
--   đang dùng chỉ có một gigabyte — tức khoảng hai tháng là phải trả thêm.
--
-- ⚠️ AI XEM ĐƯỢC ẢNH CỦA AI đã chốt ở #363 TRƯỚC bản này, cố ý theo thứ tự đó:
--   chính người đó và quản lý trở lên. Bật ảnh trước khi có chốt xem là phát
--   tán dữ liệu cá nhân rồi mới đi rào.

-- Tiệm MỚI mặc định có bật.
alter table public.attendance_settings
  alter column require_selfie set default true;

-- Tiệm ĐANG CÓ: bật hết.
-- Cố ý KHÔNG chừa ngoại lệ nào — chỉ đạo là "toàn bộ". Tiệm nào muốn tắt thì tự
-- tắt trong màn Cài đặt chấm công; đó là quyết định của chủ tiệm, không phải
-- của bản vá này.
update public.attendance_settings set require_selfie = true where require_selfie = false;

comment on column public.attendance_settings.require_selfie is
  'Bắt chụp ảnh khi chấm công. Mặc định BẬT từ 22/08 (chỉ đạo founder). Máy hỏng camera vẫn chấm được nhờ "chấm công giúp" (#234). Ai xem được ảnh của ai: xem #363.';
