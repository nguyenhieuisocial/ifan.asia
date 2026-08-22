-- ════════════════════════════════════════════════════════════════════
-- BẬT LẠI CHỤP ẢNH KHI CHẤM CÔNG — LẦN NÀY LUỒNG ĐÃ CHẠY ĐƯỢC THẬT
-- ════════════════════════════════════════════════════════════════════
--
-- Bản #365 bật công tắc này theo chỉ đạo founder ("toàn bộ ảnh khuôn mặt user
-- đều phải được lưu lại"). Vài phút sau phải tắt khẩn cấp, và bản #366 ghi sổ
-- lần tắt đó cùng ĐIỀU KIỆN để bật lại: *phải có người chụp thử THÀNH CÔNG*.
-- Lý do tắt: camera bị chặn bởi chính app, nên bật ảnh bắt buộc = khoá toàn bộ
-- nhân viên ngoài cửa chấm công.
--
-- Điều kiện đó nay đã có bằng chứng. Nhưng phải nói cho đúng, vì đây là chỗ dễ
-- tự lừa mình nhất.
--
-- ┌─ ĐÃ CHỨNG MINH ĐƯỢC GÌ (22/08) ────────────────────────────────────
-- Chạy TRỌN luồng trên BẢN DỰNG THẬT (`npm run build` + `next start`), bằng
-- trình duyệt thật, đăng nhập tài khoản thật, ghi vào kho thật rồi dọn sạch:
--
--   mở camera → khung hình 1280×960 về tới canvas → thu nhỏ còn 720×540 →
--   đóng dấu tên tiệm + địa chỉ + giờ lên pixel → tải lên kho `tenant-files` →
--   sổ chấm công ghi đường dẫn (có mã nhân viên, đúng chốt #363) →
--   bảng "Chấm công cả tiệm" ký được link, vẽ lại được ảnh →
--   bấm ảnh nhỏ mở được khung xem lớn.
--
-- 18/18 mục ĐẠT. Bộ kiểm nằm ở `scripts/anh-cham-cong-smoke.mjs`, đã cắm vào
-- CI (khối có máy chủ chạy), và đã được CHỨNG MINH LÀ ĐỎ ĐƯỢC: phá lần lượt ba
-- mắt xích khác nhau (header camera · gắn luồng vào thẻ video · bước thu nhỏ)
-- thì cả ba lần đều đỏ đúng chỗ, khôi phục lại thì xanh.
--
-- ┌─ HAI MẮT XÍCH NỮA VỪA ĐƯỢC SỬA HÔM NAY ────────────────────────────
-- Chuyện đáng nhớ nhất: sau khi header `camera=()` được sửa, luồng VẪN chưa
-- chạy. Còn một chỗ đứt thứ hai, im lặng hơn hẳn — thẻ `<video>` chỉ được dựng
-- khi đã ở trạng thái "live", mà mã lại gắn luồng camera vào nó TRƯỚC lúc đó,
-- nên `srcObject` không bao giờ được gắn. Đo trên bản dựng thật: `srcObject`
-- rỗng, `videoWidth = 0`. Người dùng thấy đèn camera sáng, khung xem trước đen,
-- bấm "Chụp" thì không có gì xảy ra. Không lỗi nào bị ném, không dòng log nào.
-- Cùng lỗi ấy có ở cả màn "nạp mặt" (#223/#225).
--
-- Và chỗ thứ ba, chỉ thấy được khi NHÌN tấm ảnh đầu tiên chụp ra: địa chỉ ở góc
-- trái-dưới dài quá nên chạy đè lên GIỜ ở góc phải-dưới. Thứ bị che chính là
-- thứ quan trọng nhất trên một tấm ảnh dùng để đối chất.
--
-- ⇒ Bài học ghi lại: bản #365 bị chặn bởi MỘT lỗi tưởng là duy nhất. Thực tế có
--   BA. Sửa cái nhìn thấy rồi bật lại ngay là canh bạc; cái đáng làm là dựng
--   cổng đi hết chuỗi, rồi mới bật.
--
-- ┌─ CHƯA CHỨNG MINH ĐƯỢC GÌ — NÓI THẲNG ──────────────────────────────
-- Bộ kiểm nạp một tệp video do chính nó dựng ra làm nguồn camera, KHÔNG dùng
-- camera phần cứng. Nên ba thứ sau vẫn chưa có bằng chứng:
--   · hộp thoại xin quyền camera trên máy thật (Chrome/Safari tự vẽ, không phải
--     phần iFan viết);
--   · Safari trên iPhone — nơi khó nhất cho `getUserMedia` (thẻ `<video>` đã có
--     `playsInline muted` như iOS đòi, nhưng chưa ai chạy thử);
--   · máy không có camera, hoặc người dùng bấm "Chặn".
--
-- ⚠️ VÌ SAO VẪN BẬT DÙ CÒN BA CHỖ ĐÓ. Cả ba đều đã có đường lùi sẵn: "chấm công
--   giúp" (#234) — đồng nghiệp chấm hộ bằng máy của họ, và lượt đó LUÔN bị gắn
--   cờ để quản lý biết. Không có đường lùi ấy thì bản vá này không nên tồn tại.
--   Và chủ tiệm nào muốn tắt vẫn tắt được ngay trong màn Cài đặt chấm công.

-- Tiệm MỚI mặc định có bật.
alter table public.attendance_settings
  alter column require_selfie set default true;

-- Tiệm ĐANG CÓ: bật hết. Cố ý KHÔNG chừa ngoại lệ — chỉ đạo là "toàn bộ".
update public.attendance_settings set require_selfie = true where require_selfie = false;

comment on column public.attendance_settings.require_selfie is
  'Bắt chụp ảnh khi chấm công. Mặc định BẬT từ 22/08 (chỉ đạo founder #365, bật lại ở #369 sau khi trọn luồng chạy được và có cổng canh scripts/anh-cham-cong-smoke.mjs). Máy hỏng camera vẫn chấm được nhờ "chấm công giúp" (#234). Ai xem được ảnh của ai: xem #363.';
