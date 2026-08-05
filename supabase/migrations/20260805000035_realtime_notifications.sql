-- ============================================================
-- iFan.asia — Migration #35: Đẩy thông báo TỨC THỜI, nhưng CHỈ tới đúng chủ nhân
--
-- VẤN ĐỀ PHẢI TRÁNH (đã ghi trong components/notifications/notification-bell.tsx):
--   Policy `inbox_broadcast_select` (migration #6) cho phép MỌI thành viên tenant
--   nghe MỌI topic bắt đầu bằng 'tenant:'. RLS cộng nhau bằng OR, nên nếu đặt
--   thông báo trên topic 'tenant:{id}:user:{id}' thì đồng nghiệp nghe được của
--   nhau — phá đúng nguyên tắc "chỉ báo việc của TÔI".
--
-- CÁCH GIẢI (không đụng một chữ vào policy nào đang có):
--   Dùng KHÔNG GIAN TOPIC KHÁC HẲN: 'user:{user_id}:notifications'.
--   Policy #6 bắt buộc split_part(topic,':',1) = 'tenant' → với topic bắt đầu
--   'user:' nó LUÔN sai, nên OR không thể mở cửa. Topic này trước migration
--   này KHÔNG có policy nào cho phép (mặc định RLS = cấm), nên policy thêm
--   dưới đây là quyền MỚI hoàn toàn, không phải nới quyền cũ:
--     chỉ đúng người có auth.uid() khớp phần 2 của topic mới nghe được.
--   → KHÔNG nới `conversations`, KHÔNG nới `inbox_broadcast_select`.
--
-- AN TOÀN THEO CHIỀU SÂU: payload phát đi chỉ là TÍN HIỆU RỖNG (không có
--   tiêu đề, nội dung, link, id). Client nhận tín hiệu rồi tự hỏi lại DB bằng
--   câu select đã bị `notifications_select` khoanh về đúng dòng của mình. Cho
--   dù có ai nghe nhầm được topic thì cũng không đọc được gì.
--
-- Chuẩn dự án: broadcast qua trigger (KHÔNG postgres_changes), policy bọc
--   (select ...) để cache initplan, idempotent (drop if exists trước create).
-- ============================================================

-- ---------- hàm trigger: báo cho ĐÚNG người nhận là "có thông báo mới" ----------
-- security definer: client authenticated không có quyền ghi realtime.messages.
--
-- Bọc exception: bảng `notifications` được ghi bởi cron SLA (#17), workflow
-- (#15), bàn giao khách (#24)... Việc phát tín hiệu HỎNG (hết quota Realtime,
-- thiếu partition...) TUYỆT ĐỐI không được làm hỏng việc GHI thông báo — thà
-- mất tín hiệu (client vẫn còn nhịp hỏi lại dự phòng) còn hơn mất thông báo.
create or replace function public.broadcast_notification() returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  if new.user_id is null then
    return null;
  end if;
  begin
    perform realtime.send(
      -- Tín hiệu rỗng có chủ ý — xem ghi chú "AN TOÀN THEO CHIỀU SÂU" ở đầu file.
      '{}'::jsonb,
      'INSERT',                                        -- event phía client
      'user:' || new.user_id::text || ':notifications', -- topic riêng từng người
      true                                             -- private → bắt buộc qua RLS
    );
  exception when others then
    null;
  end;
  return null;
end $$;

-- Chỉ INSERT: đánh dấu đã đọc là thao tác của chính người đó trên máy họ, không
-- cần phát; và "đánh dấu tất cả đã đọc" sẽ bắn hàng loạt tín hiệu vô ích.
drop trigger if exists notifications_broadcast on public.notifications;
create trigger notifications_broadcast
  after insert on public.notifications
  for each row execute function public.broadcast_notification();

-- ---------- RLS: ai được NHẬN tín hiệu trên topic 'user:{id}:notifications' ----------
-- So sánh bằng TEXT, KHÔNG cast ::uuid: topic do client tự đặt, cast chuỗi lạ
-- sẽ ném lỗi cho toàn bộ lượt kiểm policy. auth.uid() mới là nguồn sự thật —
-- client khai gian id trong topic thì điều kiện sai, subscribe bị từ chối.
drop policy if exists notifications_broadcast_select on realtime.messages;
create policy notifications_broadcast_select on realtime.messages
  for select to authenticated
  using (
    split_part((select realtime.topic()), ':', 1) = 'user'
    and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text
    and split_part((select realtime.topic()), ':', 3) = 'notifications'
  );

-- ============================================================
-- CỐ TÌNH CHƯA LÀM:
-- - Không phát khi UPDATE (đánh dấu đã đọc) — xem lý do ở trigger.
-- - Không gộp payload thật vào tín hiệu: đổi lại client tốn thêm 1 lượt hỏi,
--   nhưng bù lại rò rỉ là bất khả kể cả khi policy tương lai viết sai.
-- - KHÔNG policy insert trên realtime.messages: client vẫn không tự phát được.
-- ============================================================
