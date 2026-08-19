-- KHOÁ CỬA CHO SÁU VIỆC CHẠY NỀN — cùng họ với lỗ ở đồng hồ canh im lặng (#182),
-- tìm ra khi soát tiếp toàn bộ danh sách "ai gọi được cửa nào".
--
-- ═══════════════════════════════════════════════════════════════════
-- LỖ
-- ═══════════════════════════════════════════════════════════════════
-- Sáu hàm dưới đây là việc CHẠY NỀN: bộ hẹn giờ trong CSDL gọi chúng, không
-- màn nào và không đường web nào gọi (đã grep toàn `app/`, `lib/`, `components/`
-- — 0 lời gọi). Nhưng cả sáu đều đang mở cho vai `anon`, mà khoá `anon` nằm
-- công khai trong mã chạy ở trình duyệt. Ai cũng giật được dây chuông:
--
--   · `release_digest()`   — HÚT SẠCH hàng đợi "bản mới đã lên" rồi trả về.
--     Người lạ gọi một phát là bản tin lên bản của lượt đó BIẾN MẤT, không ai
--     biết. Đúng thứ đã chết câm 12 tiếng ngày 19/08, nay lại có đường thứ hai.
--   · `daily_pulse()` / `weekly_pulse()` — soạn bản tin cho founder rồi xếp vào
--     hàng gửi. Gọi bừa là founder nhận tin rác, và tệ hơn: nhận tin SAI NHỊP
--     nên mất luôn ý nghĩa "sáng thứ Hai có tin tức là mọi thứ đang chạy".
--   · `process_telegram_events()` / `scan_user_failures()` — hai bộ xử hàng đợi
--     và quét lỗi. Gọi bừa không phá dữ liệu nhưng làm nhiễu nhịp và tốn lượt.
--   · `rls_auto_enable()` — hàm của event trigger, không có lý do gì lộ ra ngoài.
--
-- Không cái nào LỘ dữ liệu tiệm. Hại của chúng cùng một kiểu với #182: **làm
-- cho tiếng chuông nói dối**. Đó chính là bài học đắt nhất của ngày 19/08.
--
-- ═══════════════════════════════════════════════════════════════════
-- SỬA
-- ═══════════════════════════════════════════════════════════════════
-- Chỉ thu quyền, KHÔNG sửa thân hàm — bộ hẹn giờ chạy bằng vai chủ sở hữu nên
-- không bị ảnh hưởng. Đã kiểm: cả sáu đều có lịch trong `cron.job` hoặc được
-- gọi từ SQL khác, không đường web nào gọi.
revoke execute on function public.release_digest()            from anon, authenticated;
revoke execute on function public.daily_pulse()               from anon, authenticated;
revoke execute on function public.weekly_pulse()              from anon, authenticated;
revoke execute on function public.process_telegram_events(integer) from anon, authenticated;
revoke execute on function public.scan_user_failures()        from anon, authenticated;
revoke execute on function public.rls_auto_enable()           from anon, authenticated;

-- ⚠️ CỐ Ý KHÔNG THU `qr_gen_code()`, dù nó cũng nằm trong danh sách quét.
-- Nó là giá trị mặc định của cột `qr_codes.code`, mà giá trị mặc định chạy bằng
-- vai của người ĐANG CHÈN — thu quyền là làm gãy việc tạo mã QR. Nó cũng không
-- đọc gì: chỉ sinh chuỗi ngẫu nhiên rồi tránh trùng. Ghi ra đây để lần soát sau
-- không ai "dọn nốt cho đủ bộ" rồi làm hỏng.

comment on function public.release_digest is
  'Gộp các bản đã lên thành MỘT bản tin rồi hút sạch hàng đợi. CHỈ bộ hẹn giờ gọi — đã thu quyền của anon/authenticated ở #190 vì gọi bừa là nuốt mất bản tin.';
