-- ============================================================
-- iFan.asia — Migration #6: Realtime broadcast cho Inbox
-- Chuẩn 2026 (đã kiểm chứng docs Supabase): KHÔNG dùng postgres_changes
-- (không scale, RLS check per-listener). Thay bằng:
--   DB trigger → realtime.broadcast_changes() → private channel
--   topic 'tenant:{tenant_id}:inbox'
-- Client BẮT BUỘC: await supabase.realtime.setAuth() TRƯỚC khi
--   supabase.channel(topic, { config: { private: true } }).subscribe().
-- Ủy quyền nhận broadcast = RLS select trên realtime.messages (bên dưới).
-- Chuẩn dự án: policy bọc (select ...) cache initplan; idempotent
--   (create or replace + drop ... if exists trước khi create).
-- ============================================================

-- ---------- hàm trigger: phát thay đổi messages/conversations lên topic tenant ----------
-- security definer: client authenticated không có quyền ghi realtime.messages;
-- hàm chạy quyền owner để realtime.broadcast_changes() insert được payload.
-- Trigger chỉ INSERT/UPDATE nên new luôn có; old = null khi INSERT (đúng mẫu
-- chính thức của Supabase — broadcast_changes chấp nhận old null).
create or replace function public.broadcast_inbox_changes() returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  perform realtime.broadcast_changes(
    'tenant:' || new.tenant_id::text || ':inbox', -- topic riêng từng tenant
    tg_op,           -- event phía client: 'INSERT' | 'UPDATE'
    tg_op,           -- operation trong payload
    tg_table_name,   -- 'messages' | 'conversations'
    tg_table_schema, -- 'public'
    new,
    old
  );
  return null;
end $$;

drop trigger if exists messages_broadcast on public.messages;
create trigger messages_broadcast
  after insert or update on public.messages
  for each row execute function public.broadcast_inbox_changes();

drop trigger if exists conversations_broadcast on public.conversations;
create trigger conversations_broadcast
  after insert or update on public.conversations
  for each row execute function public.broadcast_inbox_changes();

-- ---------- RLS trên realtime.messages: ai được NHẬN broadcast private channel ----------
-- Khi client subscribe topic private, Realtime kiểm policy select này với
-- realtime.topic() = topic đang subscribe. Chỉ cho nhận topic
-- 'tenant:{tenant_id}:inbox' của đúng tenant mình (current_tenant_id đã có
-- fallback tra tenant_members ở migration #3 — hoạt động cả khi chưa bật hook).
-- Policy này do dự án tạo trên bảng của Realtime → drop/create được (idempotent).
-- Lưu ý: phần 2 của topic cast ::uuid — mọi topic private bắt đầu 'tenant:'
-- phải mang uuid ở vị trí 2 (quy ước đặt topic của dự án).
drop policy if exists inbox_broadcast_select on realtime.messages;
create policy inbox_broadcast_select on realtime.messages
  for select to authenticated
  using (
    split_part((select realtime.topic()), ':', 1) = 'tenant'
    and split_part((select realtime.topic()), ':', 2)::uuid
        = (select public.current_tenant_id())
  );

-- ============================================================
-- THUỘC ĐỢT 2 — CỐ TÌNH CHƯA LÀM, không phải thiếu sót:
-- - DELETE không broadcast (đợt 1 không xóa message/conversation — đóng bằng status).
-- - Chưa tách topic per-conversation ('tenant:{id}:conversation:{id}'):
--   hiện mọi agent của tenant nhận mọi sự kiện inbox; tenant lớn thì tách
--   để giảm fan-out + đỡ tốn quota message Realtime.
-- - Chưa cắt gọn payload (broadcast_changes gửi nguyên row new/old) —
--   đợt 2 cân nhắc hàm tự build payload tối thiểu (id, conversation_id, ...).
-- - KHÔNG policy insert trên realtime.messages: client không được tự broadcast.
-- ============================================================
