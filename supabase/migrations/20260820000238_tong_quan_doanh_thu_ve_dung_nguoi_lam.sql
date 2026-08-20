-- #224 — "Doanh thu theo nhân viên" ở Tổng quan quy về ĐÚNG NGƯỜI LÀM, khớp
-- hoa hồng. Trước đây dashboard_sales chỉ dùng coalesce(performed_by_user_id,
-- created_by) — bỏ qua HAI thứ: (1) cột `performed_by_employee_id` mà bộ chọn
-- "người làm" (#214/Piece 2) LUÔN ghi cho mọi người được chọn, và (2) thợ trên
-- LỊCH HẸN (a.staff_employee_id / a.staff_user_id). Kết quả: mọi dòng gán người
-- làm đều bị tính nhầm sang NGƯỜI TẠO ĐƠN. Hàm hoa hồng (#229) thì quy về
-- employees theo chuỗi employee-first → dashboard lệch hoa hồng.
--
-- VÌ SAO KHÔNG sửa thẳng trong dashboard_sales: hàm đó là SECURITY INVOKER, và
-- bảng employees chỉ owner/admin đọc được (RLS employees_self_or_admin — bảng
-- chứa LƯƠNG). Quản lý (manager) chạy Tổng quan sẽ KHÔNG map được
-- employee_id → tên/người, ra kết quả khác chủ tiệm. Nên mở đúng MỘT CỬA HẸP:
--   · nguoi_lam_tiem() — SECURITY DEFINER, chỉ trả employee_id · person_key ·
--     tên (KHÔNG lương/ngày sinh/điện thoại), phạm vi current_tenant_id() và chỉ
--     cho owner/admin/manager. Founder duyệt 20/08: "cửa đọc-tên, không lộ lương".
-- dashboard_sales GIỮ NGUYÊN là INVOKER — mọi chốt cách ly tiệm + staff-chỉ-thấy-
-- -mình của nó không đổi; chỉ thêm join lịch hẹn (manager đọc được) + cửa hẹp này.
--
-- person_key = coalesce(employees.user_id, employees.id): người có tài khoản khoá
-- theo user_id (gộp đúng với cột phễu deal của họ); thợ CHƯA có tài khoản khoá
-- theo employees.id để vẫn hiện một dòng riêng, khớp hoa hồng + bảng lương.
-- (Giao diện chỉ dùng trường user_id làm KHOÁ DÒNG + tên hiển thị lấy riêng, nên
-- việc trường này đôi khi mang employees.id không gãy gì — vẫn là uuid duy nhất.)

-- ── Cửa hẹp: tên người làm của tiệm hiện tại (KHÔNG lộ lương) ────────────────
create or replace function public.nguoi_lam_tiem()
returns table(employee_id uuid, person_key uuid, full_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id,
         coalesce(e.user_id, e.id) as person_key,
         e.full_name
  from public.employees e
  where e.tenant_id = public.current_tenant_id()
    and public.app_role() in ('owner', 'admin', 'manager')
$$;
revoke all on function public.nguoi_lam_tiem() from public, anon;
grant execute on function public.nguoi_lam_tiem() to authenticated;
comment on function public.nguoi_lam_tiem() is
  'CUA HEP #224: tra ten nguoi lam (employee_id, person_key, full_name) cua tiem hien tai — KHONG lo luong/ngay sinh/dien thoai. Chi owner/admin/manager. De dashboard_sales (INVOKER) quy doanh thu ve dung nguoi lam khop hoa hong, vi employees chi owner/admin doc duoc qua RLS.';

-- ── dashboard_sales: quy doanh thu theo nhân viên về ĐÚNG người làm ─────────
create or replace function public.dashboard_sales(
  p_from      timestamptz,
  p_to        timestamptz,
  p_prev_from timestamptz,
  p_prev_to   timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
with
-- ── PHỄU (GIỮ theo deals) ───────────────────────────────────────────────────
d as (
  select id, owner_id, value_vnd, status, won_at, lost_at, created_at
  from public.deals where deleted_at is null
),
cur_won   as (select * from d where status = 'won'  and won_at  >= p_from      and won_at  < p_to),
prev_won  as (select * from d where status = 'won'  and won_at  >= p_prev_from and won_at  < p_prev_to),
cur_lost  as (select * from d where status = 'lost' and lost_at >= p_from      and lost_at < p_to),
prev_lost as (select * from d where status = 'lost' and lost_at >= p_prev_from and lost_at < p_prev_to),
cur_made  as (select * from d where created_at >= p_from      and created_at < p_to),
prev_made as (select * from d where created_at >= p_prev_from and created_at < p_prev_to),
open_d    as (select * from d where status = 'open'),
ct as (
  select id, owner_id, created_at from public.contacts where deleted_at is null
),
cur_ct  as (select * from ct where created_at >= p_from      and created_at < p_to),
prev_ct as (select * from ct where created_at >= p_prev_from and created_at < p_prev_to),
-- Cửa hẹp: map employee_id → person_key + tên (definer, đã lọc tiệm + vai).
emp as (select employee_id, person_key, full_name from public.nguoi_lam_tiem()),
-- ── TIỀN (ĐỔI sang ĐƠN — ADR-0027 §8) ───────────────────────────────────────
-- Một dòng = một order_line của đơn completed trong cửa sổ. uid = người LÀM
-- (khớp hoa hồng #229): dòng có người làm ghi thẳng → lịch hẹn → user trên
-- dòng/lịch → cuối cùng người lập đơn. day = ngày giờ VN theo orders.created_at.
ord_cur as (
  select o.id as order_id, o.kind,
         coalesce(pe.person_key, ps.person_key,
                  l.performed_by_user_id, a.staff_user_id, o.created_by) as uid,
         (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date   as day,
         l.line_total_vnd
  from public.orders o
  join public.order_lines l on l.order_id = o.id
  left join public.appointments a on a.id = l.appointment_id
  left join emp pe on pe.employee_id = l.performed_by_employee_id
  left join emp ps on ps.employee_id = a.staff_employee_id
  where o.deleted_at is null and o.status = 'completed'
    and o.created_at >= p_from and o.created_at < p_to
),
ord_prev as (
  select l.line_total_vnd
  from public.orders o
  join public.order_lines l on l.order_id = o.id
  where o.deleted_at is null and o.status = 'completed'
    and o.created_at >= p_prev_from and o.created_at < p_prev_to
),
staff_rev as (
  select uid, sum(line_total_vnd)::bigint as revenue
  from ord_cur where uid is not null group by uid
),
-- Biểu đồ NGÀY = doanh thu theo ngày (từ đơn). deals = số ĐƠN BÁN hoàn tất/ngày.
daily as (
  select day,
         sum(line_total_vnd)::bigint                                    as revenue,
         count(distinct order_id) filter (where kind = 'order')::bigint as deals
  from ord_cur group by day
),
-- ids gộp thêm nhân viên có doanh thu ĐƠN (người làm có thể không sở hữu deal nào).
ids as (
  select owner_id as uid from cur_won
  union select owner_id from cur_made
  union select owner_id from open_d
  union select owner_id from cur_ct where owner_id is not null
  union select uid      from staff_rev
),
staff as (
  select i.uid as user_id,
         -- Tên: ưu tiên tên hồ sơ nhân sự (phủ cả thợ CHƯA có tài khoản), lùi về
         -- tên tài khoản. person_key khớp đúng dòng đã quy ở ord_cur.
         coalesce(
           (select en.full_name from emp en where en.person_key = i.uid limit 1),
           (select p.display_name from public.profiles p where p.user_id = i.uid)
         ) as display_name,
         (select count(*)                      from cur_won w   where w.owner_id = i.uid)::bigint as deals_won,
         coalesce((select sr.revenue from staff_rev sr where sr.uid = i.uid), 0)::bigint          as revenue,
         (select count(*)                      from cur_made m   where m.owner_id = i.uid)::bigint as deals_created,
         (select count(*)                      from open_d o    where o.owner_id = i.uid)::bigint as deals_open,
         (select coalesce(sum(o.value_vnd), 0) from open_d o    where o.owner_id = i.uid)::bigint as open_value,
         (select count(*)                      from cur_ct c    where c.owner_id = i.uid)::bigint as new_contacts
  from ids i where i.uid is not null
)
select jsonb_build_object(
  'role', public.app_role(),
  'revenue', jsonb_build_object(
      'current',  (select coalesce(sum(line_total_vnd), 0) from ord_cur),
      'previous', (select coalesce(sum(line_total_vnd), 0) from ord_prev)),
  'deals_won', jsonb_build_object(
      'current',  (select count(*) from cur_won),
      'previous', (select count(*) from prev_won)),
  'deals_lost', jsonb_build_object(
      'current',  (select count(*) from cur_lost),
      'previous', (select count(*) from prev_lost)),
  'deals_created', jsonb_build_object(
      'current',  (select count(*) from cur_made),
      'previous', (select count(*) from prev_made)),
  'new_contacts', jsonb_build_object(
      'current',  (select count(*) from cur_ct),
      'previous', (select count(*) from prev_ct)),
  'open_deals', jsonb_build_object(
      'count', (select count(*) from open_d),
      'value', (select coalesce(sum(value_vnd), 0) from open_d)),
  'daily', (select coalesce(jsonb_agg(
      jsonb_build_object('day', day, 'revenue', revenue, 'deals', deals)
      order by day), '[]'::jsonb) from daily),
  'staff', (select coalesce(jsonb_agg(to_jsonb(s) order by s.revenue desc, s.deals_won desc),
                            '[]'::jsonb) from staff s)
)
$$;

revoke execute on function public.dashboard_sales(timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.dashboard_sales(timestamptz, timestamptz, timestamptz, timestamptz)
  to authenticated;
