-- #214 phần UI — cửa đọc DANH SÁCH THỢ ĐẶT LỊCH ĐƯỢC
-- ════════════════════════════════════════════════════════════════════
-- Màn Lịch đổi nguồn dropdown từ tenant_members → employees (để xếp lịch
-- cho thợ KHÔNG có tài khoản, #229). NHƯNG RLS employees_self_or_admin chỉ
-- cho owner/admin thấy CẢ TIỆM; manager/staff chỉ thấy hồ sơ của CHÍNH họ
-- (đúng — bảng employees chứa base_salary_vnd, không cho manager dòm lương
-- người khác). Nếu dropdown đọc thẳng employees thì MANAGER chạy lịch không
-- thấy nhân viên nào.
--
-- Cửa này trả ĐÚNG 3 cột không nhạy cảm (id, tên, user_id) của nhân viên
-- CÒN LÀM trong tiệm đang mở, cho MỌI thành viên đăng nhập — tên nhân viên
-- vốn đã hiện công khai trên lịch, không phải bí mật như lương.
create or replace function public.bookable_staff()
returns table (id uuid, full_name text, user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.full_name, e.user_id
  from public.employees e
  where e.tenant_id = public.current_tenant_id()
    and e.ended_on is null
  order by e.full_name;
$$;

revoke execute on function public.bookable_staff() from public, anon;
grant execute on function public.bookable_staff() to authenticated;

comment on function public.bookable_staff() is
  'Danh sach tho CON LAM cua tiem dang mo (id, ten, user_id) cho dropdown Lich + resolve nguoi lam khi ghi lich/hoa hong (#214). SECURITY DEFINER de manager/staff cung doc duoc (RLS employees chi cho owner/admin thay ca tiem vi bang employees chua luong). Chi tra 3 cot khong nhay cam, scope theo current_tenant_id().';
