-- ════════════════════════════════════════════════════════════════════
-- #334 — THƯƠNG HIỆU TIỆM (thẻ `man-thuong-hieu-tiem`)
-- ════════════════════════════════════════════════════════════════════
-- Trang mặt tiền và trang đặt lịch là thứ KHÁCH CỦA TIỆM nhìn thấy. Hôm nay
-- chúng hiện hai chữ cái viết tắt thay cho logo, và dùng màu cam của iFan — nên
-- một spa cao cấp gửi đường dẫn cho khách thì khách thấy một trang trông giống
-- hệt trang của quán ăn bên cạnh.
--
-- ⚠️ LƯU MÃ MÀU ĐÃ DUYỆT, KHÔNG LƯU MÃ HEX. Tám màu trong bảng chọn đều đã đo
--   là chữ trắng trên nền đó vẫn đọc được (WCAG 4.5:1). Nếu lưu hex thì ai gõ
--   thẳng vào kho dữ liệu là lách được cả bảng — và hậu quả rơi vào KHÁCH CỦA
--   TIỆM: nút "Đặt lịch" thành chữ trắng trên nền vàng nhạt, không đọc nổi, mà
--   chính chủ tiệm cũng không biết vì trên màn của họ nhìn vẫn "đẹp".
--   Danh sách đóng ở đây là chốt cuối; tầng web chỉ là lớp lịch sự.
--
-- ⚠️ `logo_url` ĐÃ CÓ SẴN TRONG BẢNG `tenants` TỪ LÂU — và chưa từng được dùng
--   ở đâu (đo 22/08: 0 tệp nhắc tới, 0/10 tiệm có logo). Bản vá này không thêm
--   cột mới cho nó, chỉ bắt đầu dùng. Ghi lại để người sau khỏi tưởng đây là
--   cột mới rồi đi tìm bản vá tạo ra nó.

alter table public.tenants
  add column if not exists mau_thuong_hieu text;

alter table public.tenants
  drop constraint if exists tenants_mau_thuong_hieu_hop_le;

alter table public.tenants
  add constraint tenants_mau_thuong_hieu_hop_le check (
    mau_thuong_hieu is null or mau_thuong_hieu in (
      'cam', 'xanh-ngoc', 'xanh-duong', 'tim', 'hong', 'do', 'xanh-la', 'nau'
    )
  );

comment on column public.tenants.mau_thuong_hieu is
  'MÃ màu đã duyệt (không phải hex) — tám màu đều đạt tương phản 4.5:1 với chữ trắng. NULL = dùng màu iFan (#334).';

comment on column public.tenants.logo_url is
  'Logo tiệm, hiện ở bốn trang khách của tiệm nhìn thấy. Trống hoặc hỏng ⇒ quay về hai chữ cái đầu của tên tiệm (#334).';

/**
 * Đọc thương hiệu của một tiệm theo SLUG — cho các trang CÔNG KHAI.
 *
 * ⚠️ Các trang đó mở cho người chưa đăng nhập, nên không thể đọc bảng `tenants`
 *   qua RLS. Hàm này security definer và CHỈ trả về ba thứ vô hại: tên, CÓ hay
 *   KHÔNG có logo, và mã màu. Không trả gói cước, không trả mã số thuế, không
 *   trả số tài khoản ngân hàng — những thứ nằm cùng bảng và KHÔNG phải việc của
 *   khách.
 *
 * ⚠️ TRẢ `co_logo` (đúng/sai), KHÔNG trả đường dẫn tệp. Đường dẫn có dạng
 *   `<mã tiệm>/thuong-hieu/…`, tức là nó lộ mã tiệm cho bất kỳ ai gọi hàm. Ảnh
 *   được phục vụ qua `/api/logo/<tiệm>`, nơi máy chủ tự tra đường dẫn.
 *
 * ⚠️ Tiệm đã xoá hoặc đang tắt ⇒ trả rỗng. Không để một tiệm ngừng hoạt động
 *   vẫn còn thương hiệu hiện ra ở đâu đó.
 */
create or replace function public.thuong_hieu_cong_khai(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'ten', t.name,
        'co_logo', nullif(btrim(coalesce(t.logo_url, '')), '') is not null,
        'mau', t.mau_thuong_hieu
      )
      from public.tenants t
      where t.slug = p_slug
        and t.deleted_at is null
        and coalesce(t.status, 'active') = 'active'
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.thuong_hieu_cong_khai(text) from public;
grant execute on function public.thuong_hieu_cong_khai(text) to anon, authenticated;

/**
 * Đặt thương hiệu — chỉ chủ tiệm và quản trị tiệm.
 *
 * ⚠️ Quản lý (`manager`) KHÔNG đổi được. Đây là bộ mặt của tiệm với khách, cùng
 *   nhóm với tên tiệm và mã số thuế — không phải việc vận hành hằng ngày.
 */
create or replace function public.dat_thuong_hieu(
  p_logo_url text,
  p_mau text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tenant uuid;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'ly_do', 'no_tenant_context');
  end if;
  if public.app_role() not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'ly_do', 'forbidden');
  end if;

  update public.tenants
     set logo_url = nullif(btrim(coalesce(p_logo_url, '')), ''),
         mau_thuong_hieu = nullif(btrim(coalesce(p_mau, '')), ''),
         updated_at = now()
   where id = v_tenant;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    -- Mã màu ngoài danh sách tám màu đã duyệt.
    return jsonb_build_object('ok', false, 'ly_do', 'mau_khong_hop_le');
end;
$$;

revoke all on function public.dat_thuong_hieu(text, text) from public, anon;
grant execute on function public.dat_thuong_hieu(text, text) to authenticated;
