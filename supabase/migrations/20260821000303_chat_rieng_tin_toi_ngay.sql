-- #303 — CHAT NỘI BỘ RIÊNG: TIN TỚI NGAY, THÔI TỰ HỎI LẠI MỖI 20 GIÂY.
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO CẦN — và vì sao bản đầu cố ý chưa làm
-- ════════════════════════════════════════════════════════════════════
--
-- Màn chat riêng (#298) dựng xong trong một lượt và cố ý để lại phần này: nó
-- tự hỏi lại máy chủ mỗi 20 giây khi đang mở. Dùng được, nhưng một chỗ để
-- nhắn nhau mà chậm tới 20 giây thì người ta quay lại Zalo — đúng thứ tính
-- năng này sinh ra để thay thế.
--
-- Hạ tầng đã có sẵn và đang chạy thật: Hộp thư khách dùng **Broadcast** từ
-- migration #6. Bản này chép đúng khuôn đó, không phát minh gì.
--
-- ⚠️ KHÔNG dùng `postgres_changes`. Lý do ghi nguyên văn ở #6: *"Chuẩn 2026
-- (đã kiểm chứng docs Supabase): KHÔNG dùng postgres_changes (không scale,
-- RLS check per-listener)."* Toàn kho không có một dòng `alter publication
-- supabase_realtime` nào — đừng là người đầu tiên thêm.
--
-- ════════════════════════════════════════════════════════════════════
-- AI NGHE ĐƯỢC KÊNH NÀY
-- ════════════════════════════════════════════════════════════════════
--
-- Topic là `tenant:{mã tiệm}:chat`, và luật dưới đây chỉ cho nghe khi mã tiệm
-- trong topic khớp `current_tenant_id()` của người nghe. Sau migration #301,
-- hàm ấy đã kiểm lại tư cách thành viên thay vì tin phiếu đăng nhập — nên
-- **người vừa bị gỡ khỏi tiệm không nghe được nữa**, kể cả khi phiếu còn hạn.
--
-- KHÔNG có luật `insert` trên `realtime.messages`: người dùng không tự phát
-- được tin vào kênh. Chỉ trigger của cơ sở dữ liệu phát.

create or replace function public.broadcast_chat_changes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'tenant:' || new.tenant_id::text || ':chat',
    tg_op,           -- sự kiện phía trình duyệt: 'INSERT' | 'UPDATE'
    tg_op,
    tg_table_name,   -- 'chat_messages'
    tg_table_schema,
    new,
    old
  );
  return null;
end $$;

drop trigger if exists chat_messages_broadcast on public.chat_messages;
create trigger chat_messages_broadcast
  after insert or update on public.chat_messages
  for each row execute function public.broadcast_chat_changes();

-- Luật nghe: chỉ thành viên CÒN HIỆU LỰC của đúng tiệm đó.
--
-- ⚠️ Không thay thế luật `inbox_broadcast_select` đang có trên cùng bảng
-- `realtime.messages` — Postgres gộp nhiều luật SELECT bằng OR, nên hai luật
-- sống chung được, mỗi luật gác một loại topic. Đặt tên riêng để không ai
-- `create or replace` đè nhầm.
drop policy if exists chat_broadcast_select on realtime.messages;
create policy chat_broadcast_select on realtime.messages
  for select to authenticated
  using (
    split_part((select realtime.topic()), ':', 1) = 'tenant'
    and split_part((select realtime.topic()), ':', 3) = 'chat'
    and split_part((select realtime.topic()), ':', 2)::uuid
        = (select public.current_tenant_id())
  );

comment on function public.broadcast_chat_changes() is
  'Phát tin chat nội bộ tới trình duyệt qua Broadcast, topic tenant:{id}:chat (#303). Chép khuôn Hộp thư #6 — KHÔNG dùng postgres_changes.';
