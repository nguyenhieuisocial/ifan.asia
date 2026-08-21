-- ════════════════════════════════════════════════════════════════════
-- CHỐT TIỆM PHẢI NẰM THẲNG TRONG CÂU LỆNH
-- ════════════════════════════════════════════════════════════════════
--
-- Cổng `soat-cua-cong-khai` báo đỏ hàm `push_go_dang_ky` (#317): *"gọi được
-- nhưng KHÔNG thấy chốt nào"*.
--
-- Hàm CÓ chốt tiệm thật — nhưng đi qua một biến trung gian:
--
--     v_tenant := public.current_tenant_id();
--     delete … where endpoint = p_endpoint and tenant_id = v_tenant;
--
-- Cổng đọc được khuôn "gán rồi kiểm" nhưng không nhận ra khuôn này, nên nó
-- coi như không có chốt.
--
-- ┌─ VÌ SAO SỬA MÃ CHỨ KHÔNG KHAI MIỄN TRỪ ───────────────────────────
-- Khai miễn trừ được — cổng có sẵn chỗ cho việc đó. Nhưng ở đây sửa mã LÀ
-- CÁCH ĐÚNG HƠN: gọi thẳng `current_tenant_id()` ngay trong mệnh đề `where`
-- vừa ngắn hơn, vừa khiến người đọc sau này thấy chốt ngay dòng đó thay vì
-- phải lần ngược lên tìm biến. Một miễn trừ là một chỗ cổng thôi canh; ở một
-- hàm đụng tới dữ liệu của mọi tiệm thì đừng tạo thêm chỗ như thế.
--
-- Giữ nguyên phép kiểm "không thuộc tiệm nào" — nó trả lời một câu khác:
-- người gọi chưa vào tiệm nào thì phải BÁO, không được im lặng xoá 0 dòng.

create or replace function public.push_go_dang_ky(p_endpoint text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_so int;
begin
  if public.current_tenant_id() is null then
    raise exception 'khong_thuoc_tiem_nao';
  end if;

  -- ⚠️ Chốt tiệm gọi THẲNG ở đây, không qua biến. Không giới hạn theo người,
  --   có chủ ý: quầy lễ tân là máy dùng chung và người bấm nút đang cầm chính
  --   cái máy đó — xem migration #317.
  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and tenant_id = public.current_tenant_id();

  get diagnostics v_so = row_count;
  return v_so;
end;
$$;

revoke all on function public.push_go_dang_ky(text) from public, anon;
grant execute on function public.push_go_dang_ky(text) to authenticated;
