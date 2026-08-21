-- ════════════════════════════════════════════════════════════════════
-- GỠ NỐT RÀNG BUỘC CŨ ĐANG CHẶN KÊNH CHỦ ĐỀ
-- ════════════════════════════════════════════════════════════════════
--
-- Migration #307 thêm loại kênh 'topic' và có `drop constraint if exists` cho
-- ràng buộc hình dạng cũ — nhưng **drop theo tên ĐOÁN**
-- (`chat_channels_kind_shape_check`), trong khi tên thật trong cơ sở dữ liệu là
-- `chat_channels_hinh_dang`.
--
-- `if exists` nuốt lỗi im lặng, nên migration chạy XONG và báo thành công,
-- trong khi ràng buộc cũ vẫn nằm nguyên và chặn mọi kênh chủ đề. Phép thử ngay
-- sau đó mới lộ ra: ba ca đầu đều đỏ với cùng một câu.
--
-- ⚠️ Bài học ghi lại: `drop ... if exists` với tên ĐOÁN là một câu lệnh **luôn
-- thành công và có thể chẳng làm gì**. Muốn gỡ một ràng buộc thì đọc tên thật
-- ra trước (`pg_constraint`), đừng suy từ quy ước đặt tên — kho này có cả tên
-- tiếng Việt lẫn tên Postgres tự sinh.

alter table public.chat_channels drop constraint if exists chat_channels_hinh_dang;

-- Ràng buộc đúng đã có từ #307 (`chat_channels_kind_shape_check`) và bao đủ cả
-- ba loại, nên ở đây chỉ cần gỡ cái cũ.

do $$
begin
  -- Nói ra ngay nếu vẫn còn một ràng buộc nào KHÔNG biết tới 'topic' — thà
  -- migration đỏ còn hơn để lỗ nằm im thêm một lượt nữa.
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.chat_channels'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) not like '%topic%'
       and pg_get_constraintdef(oid) like '%kind%'
  ) then
    raise exception 'Vẫn còn ràng buộc chưa biết tới loại kênh topic';
  end if;
end $$;
