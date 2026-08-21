-- ════════════════════════════════════════════════════════════════════
-- GỠ ĐĂNG KÝ ĐẨY TRÊN MÁY DÙNG CHUNG
-- ════════════════════════════════════════════════════════════════════
--
-- Cổng `soat-ghi-im-lang` bắt được một lỗ thật ở `xoaDangKyDay`:
--
-- Chính sách RLS của `push_subscriptions` cho phép mỗi người chỉ đụng dòng
-- CỦA MÌNH. Nhưng quầy lễ tân là MÁY DÙNG CHUNG, và một máy chỉ có MỘT địa
-- chỉ đăng ký. Nếu dòng đó còn mang tên chị A (chị A bật rồi đăng xuất) thì
-- chị B bấm "Tắt" sẽ xoá được 0 dòng — và màn hình báo "Đã tắt" trong khi
-- dòng nằm nguyên.
--
-- ⚠️ Đây đúng lớp lỗi mà cổng đó sinh ra để chặn: **0 dòng và 1 dòng đi chung
--   một đường**, và người dùng tin vào một câu không đúng.
--
-- ┌─ CHỮA ────────────────────────────────────────────────────────────
-- Gỡ theo ĐỊA CHỈ ĐĂNG KÝ, trong phạm vi TIỆM của người gọi, không giới hạn
-- theo người. Lý lẽ: người bấm nút đang CẦM CHÍNH CÁI MÁY đó. Ai cầm máy thì
-- có quyền tắt thông báo của máy đó — không cần biết lần trước ai bật.
--
-- ⚠️ Vẫn chốt trong phạm vi tiệm: không cho một tiệm gỡ đăng ký của tiệm khác.
--   Và địa chỉ đăng ký là chuỗi ngẫu nhiên dài do trình duyệt cấp, không đoán
--   được, cũng không lộ ra cho ai ngoài chính máy đó.
--
-- Trả về SỐ DÒNG đã gỡ để tầng web phân biệt được "vừa gỡ xong" với "vốn
-- không có" — hai chuyện khác nhau, và gộp lại chính là cái bẫy ở trên.

create or replace function public.push_go_dang_ky(p_endpoint text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tenant uuid; v_so int;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then raise exception 'khong_thuoc_tiem_nao'; end if;

  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and tenant_id = v_tenant;

  get diagnostics v_so = row_count;
  return v_so;
end;
$$;

revoke all on function public.push_go_dang_ky(text) from public, anon;
grant execute on function public.push_go_dang_ky(text) to authenticated;

comment on function public.push_go_dang_ky(text) is
  'Gỡ đăng ký đẩy theo ĐỊA CHỈ, trong phạm vi tiệm, KHÔNG giới hạn theo người — vì quầy lễ tân là máy dùng chung và người bấm nút đang cầm chính cái máy đó. Trả về số dòng đã gỡ để tầng web phân biệt "vừa gỡ" với "vốn không có" — #317.';
