-- Sửa lỗi do CHÍNH migration #145 (việc #173) vừa gây ra — phát hiện ngay bằng
-- cổng rls-smoke: phép kiểm "KB ca10" chuyển từ PASS sang FAIL.
--
-- CHUYỆN GÌ ĐÃ XẢY RA
-- #145 thêm `kb_entries_delete` giới hạn xoá cho owner/admin ở TẦNG RLS. Nghe
-- có vẻ chặt hơn, nhưng nó chen lên TRƯỚC trigger `kb_delete_unpublish_guard`
-- (migration #115) — vốn là người gác được thiết kế cho việc này và biết BÁO
-- LỖI RÕ RÀNG: `raise exception 'kb_delete_forbidden'` kèm hint "Chỉ chủ tiệm
-- hoặc quản trị viên được xoá mục kho tri thức."
--
-- Hậu quả: nhân viên bấm xoá thì không còn nhận được câu giải thích nào nữa —
-- RLS lọc mất dòng, lệnh xoá trả về "0 dòng, KHÔNG lỗi". Đúng cái bẫy im lặng
-- đã đóng đinh thành một ca riêng trong cổng ("lệnh SỬA bị RLS chặn thì không
-- ném lỗi, chỉ trả 0 dòng"). Cùng ngày vá bẫy đó ở chỗ khác thì lại tự tay tạo
-- ra một cái mới ở đây.
--
-- CÁCH ĐÚNG
-- Trả RLS xoá về đúng mức cũ (chỉ xét cùng tiệm) và để TRIGGER giữ vai người
-- gác. Trigger đã chặn đủ: nó từ chối mọi vai khác owner/admin — kể cả vai Chỉ
-- xem — nên KHÔNG hở gì về bảo mật, chỉ khác ở chỗ người dùng được nghe lý do.
--
-- Bài học ghi lại: "chặt hơn ở tầng thấp hơn" không phải lúc nào cũng tốt hơn.
-- Khi đã có một người gác biết nói, đừng dựng thêm một bức tường câm phía trước.

drop policy if exists kb_entries_delete on public.kb_entries;

create policy kb_entries_delete on public.kb_entries for delete
  using (tenant_id = (select public.current_tenant_id()));
