-- Vá migration #83: quên revoke execute cho hàm trigger
-- appointments_emit_events(). Hàm mới trong schema public nhận grant EXECUTE
-- mặc định của PUBLIC ⇒ anon gọi được qua /rest/v1/rpc/. Ba hàm cùng loại
-- (contacts/deals/companies_emit_events, migration #15 dòng 267–269) đều đã
-- revoke từ lâu — đây là lệch khuôn, không phải quyết định mới.
--
-- Bắt được bằng `npx supabase db advisors --linked --type security`, không
-- phải đoán: lint `anon_security_definer_function_executable` gắn cờ ĐÚNG một
-- hàm là appointments_emit_events, ba hàm cũ sạch.
revoke execute on function public.appointments_emit_events from public, anon;
