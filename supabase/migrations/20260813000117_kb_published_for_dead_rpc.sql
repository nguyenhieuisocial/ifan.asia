-- ADR-0015 — VÁ: khối Kho tri thức biến mất khỏi lời nhắc khi xem trước.
--
-- Bắt được khi bấm tay THẬT nút "Xem AI đang đọc gì" trên demo tenant: đã
-- đăng một mục KB, mà lời nhắc hiện ra KHÔNG có khối "--- KNOWLEDGE BASE ---"
-- nào cả.
--
-- Gốc: `kb_published_for()` (migration #113) chỉ cấp quyền cho `service_role`
-- — đúng cho máy quét AI thật (chạy bằng service client), nhưng màn Cài đặt
-- gọi `gatherAutopilotKb()` bằng client của NGƯỜI ĐANG ĐĂNG NHẬP
-- (`authenticated`). RPC từ chối, và code cũ NUỐT lỗi thành "không có KB" —
-- **hỏng mà không có gì báo**, đúng họ với hai bug trước trong ngày (chốt
-- `null not in`, chốt xoá/gỡ đăng thiếu).
--
-- Vá bằng cách đổi `gatherAutopilotKb()` sang đọc THẲNG bảng qua RLS (xem
-- lib/ai/autopilot-facts.ts) — đúng cho cả hai người gọi mà không cần phân
-- biệt vai. RPC này hết người dùng, gỡ luôn — giữ code chết lại chỉ để lần
-- sau có người tưởng nó vẫn là đường đi đúng.

drop function if exists public.kb_published_for(uuid);
