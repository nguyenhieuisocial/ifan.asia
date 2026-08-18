-- Việc #170 — vai "Chỉ xem" ĐANG GỬI ĐƯỢC TIN NHẮN THẬT cho khách.
--
-- Đo 18/08 trên CSDL thật, đóng đúng vai qua request.jwt.claims:
--   vai viewer -> chèn messages: THÀNH CÔNG
--   vai staff  -> chèn messages: THÀNH CÔNG
-- Luật cũ `messages_insert` chỉ xét `tenant_id = current_tenant_id()`, KHÔNG
-- xét vai. Cùng cảnh với conversations_insert/update.
--
-- Vì sao nghiêm trọng: màn Đội ngũ hứa với chủ tiệm rằng vai Chỉ xem "không
-- sửa được gì", và nút "Xem demo nhanh" trên trang đăng nhập CÔNG KHAI đưa
-- người lạ vào tiệm mẫu bằng đúng vai này — mật khẩu in ngay dưới nút. Đợt
-- siết vai Chỉ xem trước đây (việc #163) đã khoá 4 bảng nhưng BỎ SÓT 2 bảng
-- của Hộp thư.
--
-- KHÔNG ảnh hưởng đường tin ĐẾN: webhook Zalo/Telegram và AI trực việc đều
-- dùng khoá máy chủ (createServiceClient) nên đi vòng qua RLS. Đã kiểm từng
-- file: lib/channels/telegram.ts, lib/channels/zalo.ts, lib/ai/autopilot-run.ts.
--
-- Mọi thao tác ghi trên conversations trong app đều là việc của NGƯỜI TRỰC
-- (giao việc, đổi trạng thái, gắn khách, dấu thời điểm tin cuối) — vai Chỉ xem
-- không có việc gì ở đó.

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );
