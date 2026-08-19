-- DỌN ĐỒ CHẾT + BẮT MẤY CHỖ TỰ KHAI SAI PHẢI NÓI THẬT.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO
-- ═══════════════════════════════════════════════════════════════════
-- Một bảng chết KHÔNG tốn gì cả — hại của nó là làm người đọc kho tin rằng
-- chỗ đó đã có. Hôm nay chuyện đó xảy ra thật: hồ sơ năng lực (ADR-0012) khai
-- "nhật ký thao tác — chạy thật ✅" và trỏ vào `audit_logs`, trong khi bảng ấy
-- **0 dòng, không hàm nào ghi, không màn nào đọc, suốt 18 ngày**. Nhật ký thao
-- tác THẬT nằm ở `record_audit` (196 dòng, do trigger hồ sơ khách ghi). Khai
-- đúng việc nhưng sai chỗ — ai đọc để làm tiếp sẽ đi nhầm bảng.
--
-- ⚠️ Suýt bỏ nhầm: lượt soát đầu tiên báo `audit_logs` còn 5 hàm nhắc tới, đủ
-- để kết luận "đang dùng". Soi lại thì cả 5 nhắc `admin_audit_logs` — một bảng
-- KHÁC, đang sống (7 chỗ dùng). Phép tìm của chính tôi khớp nhầm vì tên bảng
-- này là hậu tố của tên bảng kia. Đã tìm lại có phân biệt ranh giới chữ rồi mới
-- dám bỏ. Ghi ra vì đây đúng kiểu sai làm mất dữ liệu thật.
--
-- ═══════════════════════════════════════════════════════════════════
-- BỎ — đã kiểm đủ bốn điều trước khi bỏ: 0 dòng · 0 hàm/view nhắc tới ·
-- 0 khoá ngoại trỏ về · có thứ khác đã thay thế và đang chạy.
-- ═══════════════════════════════════════════════════════════════════
drop table if exists public.audit_logs;        -- thay bằng `record_audit` (196 dòng)
drop table if exists public.canned_responses;  -- thay bằng `quick_replies` (12 chỗ dùng)

-- ═══════════════════════════════════════════════════════════════════
-- KHÔNG BỎ, NHƯNG BẮT NÓI THẬT
-- ═══════════════════════════════════════════════════════════════════
-- Ba thứ dưới đây KHÔNG chết — chúng là tính năng dựng xong phần móng mà chưa
-- có đường vào. Bỏ đi là xoá mất ý đồ thiết kế; để nguyên chú thích cũ thì
-- người đọc tưởng đã nối. Nên giữ lại và ghi thẳng vào chú thích là CHƯA NỐI.
comment on function public.qr_attribute_contact(text, uuid) is
  'Gắn nguồn khách theo mã QR khách vừa quét. ⚠️ CHƯA AI GỌI — đầu nối này chưa được nối vào luồng nào (kiểm 19/08: 0 lời gọi trong app, lib, script và trong chính CSDL). Đây là tính năng còn thiếu đường vào, không phải hàm chết.';

comment on table public.merge_logs is
  'Nhật ký gộp khách trùng — `merge_contacts` CÓ ghi vào đây. ⚠️ Nhưng CHƯA màn nào đọc (kiểm 19/08), nên gộp nhầm thì hiện không có đường tra lại. Thiếu màn đọc, không thiếu dữ liệu.';

comment on table public.tenant_pack_overrides is
  'Từ vựng ngành riêng của từng tiệm. `tenant_pack_view()` CÓ đọc bảng này. ⚠️ Nhưng KHÔNG chỗ nào ghi vào (kiểm 19/08: 0 insert/update trong toàn kho), nên tính năng "tiệm tự sửa từ vựng" chưa có đường vào.';
