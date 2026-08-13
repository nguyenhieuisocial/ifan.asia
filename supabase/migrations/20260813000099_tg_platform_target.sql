-- Migration #99 — chuông báo founder tìm người nhận từ LIÊN KẾT TÀI KHOẢN.
--
-- LỖI CẤU HÌNH bắt được 13/08 nhờ bắt kết quả tự khai kênh đã dùng: máy chủ
-- KHÔNG có biến `TELEGRAM_OWNER_IDS`. Hệ quả im lặng, không ai thấy:
--   · chuông báo "Cần giúp?" chạy sang Zalo — nơi founder không trực;
--   · webhook coi chính founder là NGƯỜI THƯỜNG ⇒ anh ấy bị tính hạn mức
--     20 câu/ngày trên chính bot của mình.
--
-- Chữa tận gốc thay vì đi khai thêm một biến môi trường nữa: danh sách người
-- có quyền đã nằm sẵn trong CSDL từ #96 (liên kết tài khoản). Đọc từ đó thì
-- máy chủ và máy founder dùng CÙNG MỘT NGUỒN, và thêm người chỉ là nối tài
-- khoản chứ không phải sửa cấu hình rồi triển khai lại.

create or replace function public.tg_platform_target(p_key text)
returns text
language plpgsql
stable
security definer set search_path = pg_temp as $$
declare v_id text;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  -- Người nối gần nhất có vai chủ/quản trị. Nhiều người nối thì lấy người mới
  -- nhất: chuông này là chuông RIÊNG, gửi cho cả nhóm là làm loãng cảnh báo.
  select l.telegram_user_id into v_id
    from public.user_telegram_links l
    join public.tenant_members m
      on m.user_id = l.user_id and m.status = 'active' and m.role in ('owner','admin')
   order by l.linked_at desc
   limit 1;

  return v_id;
end $$;

revoke all on function public.tg_platform_target(text) from public;
grant execute on function public.tg_platform_target(text) to anon, authenticated;
