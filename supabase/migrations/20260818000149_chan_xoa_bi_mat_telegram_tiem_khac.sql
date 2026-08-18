-- Việc #177 — disconnect_telegram_channel() XÓA được bí mật Telegram (token +
-- mã hook) của TIỆM KHÁC, dù chỉ được thiết kế để chủ tiệm tự ngắt kênh CỦA
-- MÌNH. Khác kiểu với các lỗ hôm nay (không phải ĐỌC trộm, mà là XÓA trộm).
--
-- ĐO THẬT (dữ liệu giả trong transaction, không đụng dữ liệu thật):
--   đóng vai owner tiệm A, gọi disconnect_telegram_channel(<mã kênh tiệm B>)
--   → chạy xong không báo lỗi, bí mật của tiệm B trong vault BỊ XÓA, trong
--   khi channels.status của tiệm B KHÔNG đổi (vẫn 'active') — tức là chủ
--   tiệm B không có cách nào biết bot của mình vừa bị rút ruột.
--
-- GỐC RỄ: hàm có kiểm quyền (phải là owner) và có UPDATE lọc đúng
-- `tenant_id = v_tenant`, NHƯNG câu DELETE khỏi vault.secrets ngay sau đó
-- lại dùng thẳng p_channel_id do người gọi truyền vào, KHÔNG lọc tenant —
-- nên dù UPDATE khớp 0 dòng (kênh không thuộc tiệm mình), DELETE vẫn chạy.
-- Hàm anh em `disconnect_zalo_channel()` làm ĐÚNG: kiểm tồn tại + đúng
-- tenant bằng `exists(...)` TRƯỚC khi đụng tới vault. Vá theo đúng khuôn đó.
--
-- Tiện thể revoke luôn quyền `anon` — migration gốc (#97) chỉ định
-- `grant execute ... to authenticated`, nhưng quyền mặc định của Supabase
-- vẫn âm thầm cấp thêm cho `anon` (đúng bẫy vừa gặp ở #175). Ở đây không
-- khai thác được qua đường anon (không có auth.uid() hợp lệ → 'forbidden'
-- ngay từ bước kiểm vai), nhưng dọn cho khớp ý định ban đầu.

create or replace function public.disconnect_telegram_channel(p_channel_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text;
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;

  select m.role into v_role from public.tenant_members m
   where m.tenant_id = v_tenant and m.user_id = auth.uid() and m.status = 'active';
  if v_role is distinct from 'owner' then raise exception 'forbidden'; end if;

  if not exists (
    select 1 from public.channels
      where id = p_channel_id and tenant_id = v_tenant and type = 'telegram'
  ) then
    raise exception 'channel_not_found';
  end if;

  update public.channels
     set status = 'disconnected', secret_ref = null, updated_at = now()
   where id = p_channel_id and tenant_id = v_tenant and type = 'telegram';

  delete from vault.secrets
   where name in ('telegram:' || p_channel_id || ':token',
                  'telegram:' || p_channel_id || ':hook');
end $function$;

revoke execute on function public.disconnect_telegram_channel(uuid) from anon;
