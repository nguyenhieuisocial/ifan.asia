-- ════════════════════════════════════════════════════════════════════
-- HÀM PHÁT TIN CHAT THIẾU GHIM `pg_temp` CUỐI ĐƯỜNG TÌM
-- ════════════════════════════════════════════════════════════════════
--
-- Bộ nghiệm thu RLS bắt được ngay trong ngày:
--     FAIL 49/661 — Mọi hàm security definer đã ghim pg_temp cuối search_path
--                   còn thiếu: broadcast_chat_changes()
--
-- Hàm này do chính migration #303 tạo ra sáng nay và khai
-- `set search_path to 'public'` — thiếu `pg_temp` ở cuối.
--
-- VÌ SAO NGUY HIỂM: hàm chạy quyền CHỦ SỞ HỮU (`security definer`). Nếu đường
-- tìm không ghim `pg_temp` ở CUỐI, một người dùng bình thường có thể tạo trong
-- lược đồ tạm của phiên mình một hàm/toán tử trùng tên với thứ hàm này gọi tới,
-- và Postgres sẽ chọn bản của họ — tức chạy mã của họ bằng quyền chủ sở hữu.
-- Đây là lối leo quyền kinh điển, và là lý do luật của kho đòi MỌI hàm
-- `security definer` phải ghim `pg_temp` cuối cùng.
--
-- ⚠️ Ghi lại một điều đáng nhớ hơn cả bản vá: **bộ kiểm bắt được lỗ này trong
-- cùng ngày nó sinh ra.** Ca kiểm số 49 không soi một hàm cụ thể nào — nó soi
-- TOÀN BỘ hàm `security definer` và đòi tất cả cùng tuân một luật. Một ca kiểm
-- hỏi "mọi thứ thuộc loại này có đúng luật không" bắt được cả những lỗ chưa ai
-- nghĩ tới, khác hẳn ca kiểm hỏi "chỗ X có đúng không".

create or replace function public.broadcast_chat_changes()
returns trigger
language plpgsql
security definer
-- `pg_temp` PHẢI ở cuối: đặt trước `public` thì chính nó thành chỗ bị chiếm.
set search_path = public, pg_temp
as $$
begin
  perform realtime.broadcast_changes(
    'tenant:' || new.tenant_id::text || ':chat',
    tg_op,           -- sự kiện phía trình duyệt: 'INSERT' | 'UPDATE'
    tg_op,
    tg_table_name,   -- 'chat_messages'
    tg_table_schema,
    new,
    old);
  return null;
end;
$$;

comment on function public.broadcast_chat_changes() is
  'Phát tin nhắn chat tới đúng kênh của tiệm. Ghim pg_temp CUỐI đường tìm (#304) — thiếu nó là mở lối leo quyền qua lược đồ tạm.';
