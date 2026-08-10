-- ============================================================
-- iFan.asia — Migration #43: mở hội thoại là ĐÃ ĐỌC THẬT (ghi xuống CSDL)
--
-- VẤN ĐỀ: `conversations.unread_count` chỉ có chỗ CỘNG (webhook Zalo #5 dòng
--   170, Live Chat #23 dòng 384) mà không có một chỗ nào đưa về 0. Hộp thư chỉ
--   xóa badge trong bộ nhớ trình duyệt, nên tải lại trang / đổi bộ lọc / đóng
--   hội thoại / có tin mới về là con số cam cũ hiện lại y nguyên. Sau vài ngày
--   dòng nào cũng đeo một số ⇒ dấu hiệu "chưa đọc" mất sạch tác dụng, khách
--   nhắn mới lọt qua vì nhìn đâu cũng thấy giống nhau.
--
-- SỬA: một hàm đặt unread_count về 0 cho đúng một hội thoại, gọi từ Hộp thư
--   ngay khi mở hội thoại. security invoker — RLS conversations_update (khoanh
--   theo tenant hiện tại, migration #4) áp nguyên, KHÔNG mở thêm quyền nào.
--
-- Chỉ ghi khi con số đang > 0: hội thoại đã sạch mà vẫn UPDATE thì trigger
-- conversations_broadcast (#6) bắn một sự kiện rỗng, Hộp thư của cả tiệm tải
-- lại danh sách mà không có gì đổi.
-- ============================================================

create or replace function public.conversation_mark_read(p_conversation uuid)
returns void
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  update public.conversations
     set unread_count = 0
   where id = p_conversation
     and unread_count > 0
$$;

comment on function public.conversation_mark_read(uuid) is
  'Đánh dấu đã đọc một hội thoại (unread_count = 0). Gọi khi Hộp thư mở hội thoại.';

revoke execute on function public.conversation_mark_read(uuid) from public, anon;
grant execute on function public.conversation_mark_read(uuid) to authenticated;
