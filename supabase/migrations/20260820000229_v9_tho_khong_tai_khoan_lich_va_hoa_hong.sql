-- V9 · #214 — Thợ KHÔNG cần tài khoản: xếp lịch + tính hoa hồng
-- ════════════════════════════════════════════════════════════════════
-- Founder duyệt 20/08. Trước bản này, MỌI nhận diện người-làm-ca /
-- người-hưởng-hoa-hồng đi qua auth.users:
--   · appointments.staff_user_id  NOT NULL → auth.users
--   · order_lines.performed_by_user_id     → auth.users
--   · commission_sinh_cho_don JOIN employees THEO e.user_id
-- Một thợ có employees.user_id = NULL (chưa/không dùng app) rớt khỏi mọi
-- phép nối: KHÔNG đặt lịch được, và hàm hoa hồng không sinh khoản nào —
-- đúng thứ cảnh báo #210 mô tả ("hoa hồng LUÔN = 0, không gì báo").
--
-- Bản vá: lấy employees.id làm DANH TÍNH CHUẨN cho ca + hoa hồng.
-- Người có tài khoản nối qua employees.user_id; người không app có
-- employees.user_id = NULL nhưng vẫn có employees.id → nối được.

-- ══════════════════════════════════════════════════════════════════
-- A. LỊCH HẸN — mang danh tính employee
-- ══════════════════════════════════════════════════════════════════

-- A1. Cột trỏ employees. `on delete restrict` cùng lý do staff_user_id:
--     lịch sử ca không biến mất theo hồ sơ nhân sự; nghỉ việc = chuyển ca.
alter table public.appointments
  add column staff_employee_id uuid references public.employees(id) on delete restrict;

-- A2. staff_user_id: bỏ NOT NULL (ca của thợ không tài khoản không có user_id).
alter table public.appointments
  alter column staff_user_id drop not null;

-- A3. Backfill: mỗi ca cũ → employee tương ứng cùng tiệm (1:1 nhờ
--     employees_user_unique). Ca của người không có hồ sơ employees giữ
--     nguyên staff_user_id, staff_employee_id = NULL (vẫn hợp lệ ở A4/A5).
update public.appointments a
   set staff_employee_id = e.id
  from public.employees e
 where e.tenant_id = a.tenant_id
   and e.user_id  = a.staff_user_id
   and a.staff_employee_id is null;

-- A4. Ít nhất MỘT danh tính — không cho ca không người làm.
alter table public.appointments
  add constraint appointments_staff_present
  check (staff_user_id is not null or staff_employee_id is not null);

-- A5. Cột SINH danh-tính-chuẩn cho khoá chống trùng: ưu tiên employee_id,
--     lùi user_id cho ca cũ chưa map. employee.id và user.id đều uuid ngẫu
--     nhiên ở hai bảng khác nhau → không đụng độ giá trị.
alter table public.appointments
  add column staff_ref uuid
  generated always as (coalesce(staff_employee_id, staff_user_id)) stored;

-- A6. Đổi EXCLUDE chống trùng thợ: staff_user_id → staff_ref (phủ CẢ thợ
--     không app). Phân hoạch theo staff_ref TRÙNG KHÍT phân hoạch cũ theo
--     staff_user_id (map 1:1) → không sinh vi phạm mới trên dữ liệu đang có.
alter table public.appointments drop constraint appointments_no_overlap_staff;
alter table public.appointments
  add constraint appointments_no_overlap_staff
  exclude using gist (
    tenant_id with =,
    staff_ref with =,
    tstzrange(start_at, end_at) with &&
  ) where (status in ('booked','arrived') and deleted_at is null);

comment on constraint appointments_no_overlap_staff on public.appointments is
  'ADR-0009 mục 6 + #214: một thợ không ở hai chỗ, phủ CẢ thợ không tài khoản. Khoá theo staff_ref = coalesce(staff_employee_id, staff_user_id). Tầng web dịch 23P01 thành "slot vừa bị giữ, chọn giờ khác".';

-- Chỉ mục đọc lịch theo thợ-employee (song song appointments_staff_start_idx cũ).
create index appointments_staff_emp_start_idx
  on public.appointments (tenant_id, staff_employee_id, start_at)
  where deleted_at is null and staff_employee_id is not null;

-- ══════════════════════════════════════════════════════════════════
-- B. HOA HỒNG — người hưởng có thể KHÔNG có tài khoản
-- ══════════════════════════════════════════════════════════════════

-- B1. Dòng đơn ghi thẳng người thực hiện là employee (khi biết cụ thể).
--     `on delete set null` cùng khuôn performed_by_user_id: xoá hồ sơ nhân
--     sự không được xoá dòng đơn.
alter table public.order_lines
  add column performed_by_employee_id uuid references public.employees(id) on delete set null;

comment on column public.order_lines.performed_by_employee_id is
  'Người THỰC HIỆN dòng hàng, khi là thợ KHÔNG có tài khoản (#214). Ưu tiên hơn performed_by_user_id ở hàm hoa hồng. Đa số đường đi resolve qua appointments.staff_employee_id nên cột này thường NULL — có để đường ghi thẳng khi bán không qua lịch hẹn.';

-- B2. Ghi đè commission_sinh_cho_don: resolve người-hưởng qua employees.id
--     TRỰC TIẾP trước (dòng ghi thẳng / ca gắn employee), rồi mới lùi qua
--     user_id (đường ba bậc cũ của #180). Chỉ đổi phép JOIN employees —
--     mọi thứ khác (doanh_so = line_total_vnd #198, on conflict, revoke)
--     GIỮ NGUYÊN. Người không tài khoản có employees.user_id NULL vẫn ra
--     đúng employees.id nên hết cảnh "hoa hồng = 0" của #210.
create or replace function public.commission_sinh_cho_don(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
begin
  insert into public.commission_entries (
    tenant_id, employee_id, order_line_id, order_id,
    earned_on, amount_vnd, job_type, base_vnd, percent, note, created_by
  )
  select
    d.tenant_id,
    d.employee_id,
    d.line_id,
    d.order_id,
    d.earned_on,
    d.tien,
    d.job_type,
    d.doanh_so,
    d.percent,
    null,
    d.created_by
  from (
    select
      o.tenant_id,
      e.id                                                 as employee_id,
      l.id                                                 as line_id,
      o.id                                                 as order_id,
      (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date as earned_on,
      l.line_total_vnd                                     as doanh_so,
      r.percent                                            as percent,
      case when i.kind = 'service' then 'service' else 'product' end as job_type,
      round(l.line_total_vnd * r.percent / 100)::bigint    as tien,
      o.created_by
    from public.orders o
    join public.order_lines l on l.order_id = o.id
    join public.items i       on i.id = l.item_id
    left join public.appointments a on a.id = l.appointment_id
    left join public.orders parent   on parent.id = o.parent_order_id
    -- #214: resolve employees.id TRỰC TIẾP trước (dòng ghi thẳng, ca gắn
    -- employee — phủ thợ KHÔNG tài khoản), rồi lùi qua user_id (chuỗi ba bậc
    -- #180: performed_by_user_id → staff_user_id → người lập đơn; phiếu hoàn
    -- trừ về người của đơn GỐC). `join` chứ không `left join`: dòng không tra
    -- ra người nào phải BIẾN MẤT, không rơi vào một người mặc định nào.
    join public.employees e
      on e.tenant_id = o.tenant_id
     and e.id = coalesce(
           l.performed_by_employee_id,
           a.staff_employee_id,
           (select e2.id from public.employees e2
             where e2.tenant_id = o.tenant_id
               and e2.user_id = coalesce(
                     l.performed_by_user_id,
                     a.staff_user_id,
                     case when o.kind = 'return' then coalesce(parent.created_by, o.created_by)
                          else o.created_by end)
             limit 1))
    join public.commission_rates r
      on r.tenant_id = o.tenant_id
     and r.job_type = case when i.kind = 'service' then 'service' else 'product' end
    where o.id = p_order_id
      and o.status = 'completed'
      and o.deleted_at is null
  ) d
  where d.tien <> 0
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.commission_sinh_cho_don(uuid) from public, anon, authenticated;

comment on function public.commission_sinh_cho_don(uuid) is
  'Sinh khoan hoa hong cho moi dong hang cua mot don DA COMPLETED. NOI BO — trigger don hang goi, khong cap cho authenticated (#196). #214: resolve nguoi huong qua employees.id (phu tho KHONG tai khoan) roi lui qua user_id. Idempotent nho commission_mot_dong_mot_nguoi (#167) + on conflict. Doanh so doc order_lines.line_total_vnd (#198).';
