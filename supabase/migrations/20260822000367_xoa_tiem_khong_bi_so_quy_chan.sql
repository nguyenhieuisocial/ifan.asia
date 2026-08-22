-- ════════════════════════════════════════════════════════════════════
-- XOÁ TIỆM ĐANG BỊ CHÍNH SỔ QUỸ CHẶN LẠI
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠️ LỖI CÓ THẬT, đã thử bằng lệnh: tiệm nào có **dù chỉ một** phiếu quỹ thì
--   `delete from public.tenants where id = …` **thất bại** với
--   `so_quy_khong_duoc_xoa_dong_tien`. Tức đường xoá tiệm đang hỏng.
--
-- ┌─ HAI LUẬT ĐÚNG, ĐẶT CẠNH NHAU THÀNH SAI ──────────────────────────
-- · #302 (21/08): **sổ tiền không xoá dòng, không ngoại lệ.** Đúng — sổ tiền mà
--   xoá được dòng thì nó thôi là sổ. Sửa sai phải ghi dòng đối ứng ngược chiều,
--   hai dòng cùng nằm lại làm bằng chứng.
-- · #270: khoá ngoại từ kỳ lương sang phiếu quỹ để `on delete set null`, kèm
--   giải thích *"xoá cứng một phiếu quỹ chỉ xảy ra khi xoá tiệm"*.
--
--   Người viết #302 không biết #270 đang dựa vào đúng con đường mà #302 bịt.
--   Không ai sai; hai luật đúng đặt cạnh nhau thì thành một cửa khoá kín.
--
-- ┌─ VÁ THẾ NÀO ──────────────────────────────────────────────────────
-- Cho qua ĐÚNG MỘT trường hợp: khi bản ghi tiệm **không còn tồn tại**. Trong
-- Postgres, `delete from tenants` xoá dòng cha TRƯỚC rồi mới lan xuống con —
-- nên khi chốt của bảng con chạy, tiệm đã biến mất. Ngược lại, người dùng bình
-- thường xoá một phiếu quỹ thì tiệm vẫn còn đó ⇒ vẫn bị chặn như cũ.
--
-- ⚠️ ĐÂY KHÔNG PHẢI NỚI LUẬT. Luật "sổ tiền không xoá dòng" giữ nguyên với mọi
--   thao tác của người dùng. Chỉ mở đúng lối mà #270 vốn đã giả định là có, và
--   lối đó chỉ đi được khi cả cái tiệm đã bị xoá — lúc đó không còn sổ nào để
--   bảo vệ nữa.
--
-- ⚠️ KHÔNG dùng `session_replication_role = 'replica'` để né chốt. Cách đó tắt
--   luôn KHOÁ NGOẠI, và để lại con trỏ mồ côi khắp nơi. Một script trong kho đã
--   dùng cách đó; đừng học theo.

create or replace function public.cash_entries_cam_xoa_cung()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $ham$
begin
  -- Tiệm đã không còn ⇒ đây là lượt lan theo lệnh xoá tiệm, cho đi.
  if not exists (select 1 from public.tenants where id = old.tenant_id) then
    return old;
  end if;

  raise exception 'so_quy_khong_duoc_xoa_dong_tien'
    using hint = 'Sổ tiền không xoá dòng. Ghi một dòng đối ứng ngược chiều để sửa.';
end $ham$;

comment on function public.cash_entries_cam_xoa_cung() is
  'Cấm xoá cứng dòng sổ quỹ. NGOẠI LỆ DUY NHẤT: khi chính cái tiệm đang bị xoá (bản ghi tenants đã biến mất) — nếu không thì #302 chặn luôn đường xoá tiệm mà #270 đang dựa vào (#367).';
