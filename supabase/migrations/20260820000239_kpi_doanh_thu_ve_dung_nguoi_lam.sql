-- #227 (nối tiếp #224): kpi_progress quy "doanh thu theo nhân viên" (chỉ số
-- revenue_won) về ĐÚNG NGƯỜI LÀM, khớp hoa hồng — y như đã sửa cho Tổng quan.
--
-- CTE `won` cũ quy owner_id = coalesce(performed_by_user_id, created_by), BỎ QUA
-- cột performed_by_employee_id (bộ chọn người-làm LUÔN ghi) và thợ trên lịch hẹn
-- ⇒ mục tiêu KPI đo theo NGƯỜI TẠO ĐƠN, lệch với Tổng quan (#224) và hoa hồng.
--
-- Dùng lại đúng CỬA HẸP đã mở ở #224: public.nguoi_lam_tiem() (definer, chỉ TÊN
-- người làm — KHÔNG lộ lương, phạm vi tiệm + owner/admin/manager). kpi_progress
-- GIỮ NGUYÊN là SECURITY INVOKER (mọi chốt RLS của nó không đổi); chỉ đổi cách
-- quy owner_id + thêm join lịch hẹn.
--
-- person_key = coalesce(employees.user_id, employees.id): người có tài khoản khoá
-- theo user_id → khớp mục tiêu KPI (kpi_targets.user_id là user). Thợ vãng lai
-- CHƯA có tài khoản → person_key = employees.id, KHÔNG khớp mục tiêu ai (đúng: họ
-- không có mục tiêu cá nhân), nhưng doanh thu vẫn vào TỔNG cả-tiệm (user_id null).
-- Nhân viên thường (staff) chỉ thấy đơn MÌNH TẠO (orders_select) nên created_by
-- luôn là fallback đúng cho thẻ KPI cá nhân; cửa hẹp phục vụ màn Báo cáo (quản lý+).

create or replace function public.kpi_progress(p_month date)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with bounds as (
  select date_trunc('month',
           coalesce(p_month, (now() at time zone 'Asia/Ho_Chi_Minh')::date)
         )::date as m_start
),
win as (
  select b.m_start,
         ((b.m_start + interval '1 month')::date) as m_end,
         (b.m_start::timestamp at time zone 'Asia/Ho_Chi_Minh') as t_from,
         (((b.m_start + interval '1 month')::date)::timestamp
            at time zone 'Asia/Ho_Chi_Minh') as t_to,
         ((b.m_start + interval '1 month')::date - b.m_start) as days_in_month,
         least((b.m_start + interval '1 month')::date - b.m_start,
               greatest(0,
                 ((now() at time zone 'Asia/Ho_Chi_Minh')::date - b.m_start) + 1
               )) as days_elapsed
  from bounds b
),
-- Cửa hẹp: map employee_id → person_key (definer, đã lọc tiệm + vai).
emp as (select employee_id, person_key from public.nguoi_lam_tiem()),
-- #227/#224: doanh thu-theo-người quy về NGƯỜI LÀM (khớp hoa hồng #229): người
-- làm ghi thẳng trên dòng → thợ của lịch hẹn → user trên dòng/lịch → người lập đơn.
-- owner_id null (không quy được cho ai) vẫn vào tổng cả-tiệm, không vào mục tiêu cá nhân.
won as (
  select coalesce(pe.person_key, ps.person_key,
                  l.performed_by_user_id, a.staff_user_id, o.created_by) as owner_id,
         sum(l.line_total_vnd)::bigint as revenue
  from public.orders o
  join public.order_lines l on l.order_id = o.id
  left join public.appointments a on a.id = l.appointment_id
  left join emp pe on pe.employee_id = l.performed_by_employee_id
  left join emp ps on ps.employee_id = a.staff_employee_id
  cross join win w
  where o.deleted_at is null and o.status = 'completed'
    and o.created_at >= w.t_from and o.created_at < w.t_to
  group by 1
),
newc as (
  select c.owner_id, count(*)::bigint as cnt
  from public.contacts c, win w
  where c.deleted_at is null
    and c.created_at >= w.t_from and c.created_at < w.t_to
  group by c.owner_id
),
done as (
  select a.owner_id, count(*)::bigint as cnt
  from public.activities a, win w
  where a.done_at is not null
    and a.done_at >= w.t_from and a.done_at < w.t_to
  group by a.owner_id
),
rows as (
  select k.user_id, k.metric, k.target, k.created_at, k.updated_at,
         (case k.metric
            when 'revenue_won' then
              case when k.user_id is null
                   then (select coalesce(sum(revenue), 0) from won)
                   else coalesce((select revenue from won where owner_id = k.user_id), 0)
              end
            when 'new_contacts' then
              case when k.user_id is null
                   then (select coalesce(sum(cnt), 0) from newc)
                   else coalesce((select cnt from newc where owner_id = k.user_id), 0)
              end
            else
              case when k.user_id is null
                   then (select coalesce(sum(cnt), 0) from done)
                   else coalesce((select cnt from done where owner_id = k.user_id), 0)
              end
          end)::bigint as actual,
         (k.target * w.days_elapsed / w.days_in_month)::bigint as pace
  from public.kpi_targets k
  cross join win w
  where k.month = w.m_start
)
select jsonb_build_object(
  'month',         (select m_start from win),
  'days_in_month', (select days_in_month from win),
  'days_elapsed',  (select days_elapsed from win),
  'targets', coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',    r.user_id,
      'metric',     r.metric,
      'target',     r.target,
      'actual',     r.actual,
      'pace',       r.pace,
      'created_at', r.created_at,
      'updated_at', r.updated_at
    ) order by r.user_id asc nulls first, r.metric asc) from rows r), '[]'::jsonb)
)
$function$;

comment on function public.kpi_progress(date) is
  'Tien do muc tieu thang. #227 doi revenue_won sang DON hoan tat; #224/#227 quy doanh thu-theo-nguoi ve DUNG NGUOI LAM (performed_by_employee_id -> lich hen -> user -> nguoi lap don) qua cua hep nguoi_lam_tiem(), khop hoa hong. Giu metric key revenue_won.';
