-- ════════════════════════════════════════════════════════════════════
-- PASSKEY — CẤP QUYỀN CHO MÁY CHỦ (và CHỈ máy chủ)
-- ════════════════════════════════════════════════════════════════════
--
-- ĐO THẬT trước khi viết bản này (chạy trong giao dịch rồi huỷ):
--
--   anon           đọc/ghi/xoá  → BỊ TỪ CHỐI  ✓ đúng ý
--   authenticated  đọc/ghi/xoá  → BỊ TỪ CHỐI  ✓ đúng ý
--   service_role   đọc/ghi/xoá  → BỊ TỪ CHỐI  ✗ TÍNH NĂNG CHẾT
--
-- Hai bảng sinh ra trong schema `private` rồi chuyển sang `public` bằng
-- `set schema`. Phép chuyển GIỮ NGUYÊN danh sách quyền cũ — mà bản #323 đã
-- `revoke all` sạch. Nên sau khi chuyển, KHÔNG AI có quyền, kể cả máy chủ.
--
-- ⚠️ Bảng tạo THẲNG trong `public` thì Supabase tự cấp quyền cho cả ba vai qua
--   "default privileges" — nên 19 bảng chỉ-máy-chủ sẵn có chỉ cần bật RLS là
--   xong. Bảng CHUYỂN SANG thì không được hưởng cái đó. Khác biệt này không
--   nhìn ra được khi đọc code; chỉ đo mới thấy.
--
-- ┌─ KẾT QUẢ SAU BẢN NÀY: CHẶN HAI LỚP ───────────────────────────────
-- Lớp 1 — QUYỀN: anon/authenticated không có một quyền nào. Đây là lớp mạnh
--          hơn mẫu 19 bảng kia (ở đó hai vai vẫn có quyền, chỉ bị RLS chặn).
-- Lớp 2 — RLS: bật, không policy nào. Kể cả sau này có ai lỡ tay `grant` thì
--          vẫn không đọc ra dòng nào.
--
-- ⚠️ KHÔNG cấp gì thêm cho anon/authenticated, và KHÔNG viết policy. Hai bảng
--   này chỉ đi qua máy chủ — đó là toàn bộ thiết kế bảo mật của chúng.

grant select, insert, update, delete on public.passkeys to service_role;
grant select, insert, update, delete on public.passkey_challenges to service_role;
