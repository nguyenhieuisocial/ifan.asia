-- V7 team — VÁ mâu thuẫn giữa hai migration: quản lý DUYỆT bảng công nhưng
-- KHÔNG đọc được TÊN người mình đang duyệt.
--
-- ═══════════════════════════════════════════════════════════════════
-- MÂU THUẪN, ĐO THẬT KHÔNG PHẢI ĐOÁN
-- ═══════════════════════════════════════════════════════════════════
-- `timesheets` mở cho manager (duyệt bảng công là việc của họ — quyết định 3
-- của thẻ man-bang-luong). Nhưng `employees` chỉ mở cho owner/admin, vì hồ sơ
-- nhân sự chứa `base_salary_vnd` và `dob` — hai thứ thuộc đúng nhóm "lương
-- không được lộ".
--
-- Kết quả: quản lý mở màn Chấm công thấy một danh sách MÃ NGẮN, không biết
-- dòng nào của ai. Duyệt bảng công mà không biết đang duyệt cho ai thì việc
-- duyệt vô nghĩa.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO KHÔNG NỚI THẲNG `employees_self_or_admin`
-- ═══════════════════════════════════════════════════════════════════
-- Thêm 'manager' vào policy đó là mở LUÔN cả `base_salary_vnd` — đúng thứ cả
-- mảng này được dựng để giấu. RLS chặn theo DÒNG, không chặn theo CỘT, nên
-- không có cách nào nới nửa vời ở đó.
--
-- Cũng KHÔNG lách bằng cách để màn hình chạy dưới quyền quản trị: như vậy là
-- dựng bộ quyền thứ hai ở tầng web, đúng thứ luật kho cấm — và lần sau ai sửa
-- màn hình sẽ vô tình mở rộng hơn ý định.
--
-- ⇒ Mở một khe HẸP và TƯỜNG MINH: một hàm chỉ trả về id + tên, không trả bất
-- kỳ cột nhạy cảm nào. Muốn biết hàm này lộ gì thì đọc đúng 5 dòng dưới đây.
create or replace function public.employees_ten()
returns table (id uuid, full_name text, user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.full_name, e.user_id
    from public.employees e
   where e.tenant_id = (select public.current_tenant_id())
     and (select public.app_role()) in ('owner', 'admin', 'manager');
$$;

revoke all on function public.employees_ten() from public, anon;
grant execute on function public.employees_ten() to authenticated;

comment on function public.employees_ten is
  'Chỉ id + tên + user_id của nhân sự trong tiệm, cho vai owner/admin/manager. '
  'Tồn tại vì quản lý duyệt bảng công nhưng KHÔNG được đọc hồ sơ nhân sự (có '
  'lương cứng + ngày sinh). Thêm cột vào đây = mở rộng lỗ, phải cân nhắc kỹ.';
