-- V7 team (19/08/2026) — Hồ sơ nhân sự · Chấm công · Bảng công · Xếp ca · Nghỉ phép.
-- Thẻ design: design-system/man-nhan-su-cham-cong.html (5 quyết định đã chốt).
--
-- ════════════════════════════════════════════════════════════════════
-- BA ĐIỂM MÔ HÌNH PHẢI CHỐT TRƯỚC, ghi lại để người sau không mở lại
-- ════════════════════════════════════════════════════════════════════
--
-- (1) "CHI NHÁNH" KHÔNG TRỞ THÀNH MỘT BẢNG. Bốn trong sáu thẻ V7-V8 viết
--     "Chi nhánh Quận 1" như một thuộc tính BÊN TRONG một tiệm. Nhưng kho này
--     đã mô hình hoá chuỗi bằng NHIỀU TIỆM (ADR-0005, việc #68) và cơ chế chuyển
--     tiệm đã chạy thật. Thêm `branch_id` bên trong tiệm là dựng CÁCH THỨ HAI để
--     nói cùng một chuyện — hai cách là hai sự thật, và chúng sẽ lệch nhau.
--     ⇒ Một chi nhánh = một tiệm. Nếu sau này founder muốn chi nhánh nằm TRONG
--     một tiệm thì đó là một quyết định kiến trúc riêng (ADR), không phải thứ
--     nhét kèm vào migration nhân sự.
--
-- (2) VIỆC DỰ ÁN DÙNG LẠI `activities`, KHÔNG dựng bảng việc thứ hai. (Chuẩn bị
--     cho mảng projects — xem migration kế.) Ghi ở đây vì cùng một luật: một
--     loại dữ liệu, một nơi ghi.
--
-- (3) HỒ SƠ NHÂN SỰ TÁCH KHỎI `tenant_members`. `tenant_members` là QUYỀN TRUY
--     CẬP phần mềm (vai, trạng thái). Hồ sơ nhân sự là THÔNG TIN LAO ĐỘNG (ngày
--     vào, lương cứng, số điện thoại). Trộn hai thứ nghĩa là mời một người vào
--     phần mềm cũng thành tuyển dụng, và gỡ quyền cũng thành cho nghỉ việc.

-- ════════════════════════════════════════════════════════════════════
-- 1. HỒ SƠ NHÂN SỰ
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.employees (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  -- Người CHƯA có tài khoản phần mềm vẫn phải có hồ sơ (thử việc, nhân viên
  -- không dùng máy tính) ⇒ nullable, và đó là chủ đích.
  user_id    uuid references auth.users(id) on delete set null,
  full_name  text not null check (length(trim(full_name)) between 1 and 120),
  phone      text,
  dob        date,
  started_on date not null default current_date,
  ended_on   date,
  -- Mức lương: nguồn cho bảng lương. Để ở đây vì nó là thuộc tính của NGƯỜI,
  -- không phải của kỳ lương.
  base_salary_vnd bigint not null default 0 check (base_salary_vnd >= 0),
  overtime_rate_vnd bigint not null default 0 check (overtime_rate_vnd >= 0),
  -- Quỹ phép năm (thẻ design: "còn 7 ngày trong năm").
  annual_leave_days smallint not null default 12 check (annual_leave_days >= 0),
  note       text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint employees_ngay_hop_le check (ended_on is null or ended_on >= started_on)
);
-- Một tài khoản chỉ gắn MỘT hồ sơ trong một tiệm.
create unique index if not exists employees_user_unique
  on public.employees (tenant_id, user_id) where user_id is not null;
create index if not exists employees_tenant_idx on public.employees (tenant_id, ended_on nulls first);

drop trigger if exists employees_touch on public.employees;
create trigger employees_touch before update on public.employees
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 2. CHẤM CÔNG — gắn cờ, KHÔNG chặn
-- ════════════════════════════════════════════════════════════════════
-- Quyết định 1: ở ngoài vùng thì GẮN CỜ + hỏi lý do, KHÔNG CHẶN. Chặn cứng là
-- ngày mất sóng GPS cả tiệm không ai chấm được — hỏng việc thật để chống một
-- gian lận giả định.
create table if not exists public.attendance_punches (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  punched_at timestamptz not null default now(),
  kind       text not null check (kind in ('in', 'out')),
  lat        numeric(9,6),
  lng        numeric(9,6),
  distance_m integer check (distance_m >= 0),
  -- ⚠️ Cột này do TRIGGER tính, KHÔNG nhận từ client. Nếu client gửi được cờ thì
  -- gửi `false` là vô hiệu hoá toàn bộ quyết định 1.
  out_of_range boolean not null default false,
  reason     text check (reason is null or length(reason) <= 300),
  created_at timestamptz not null default now(),

  -- Ngoài vùng thì BẮT BUỘC có lý do. Chỉ hỏi trên màn hình thì bỏ trống được
  -- bằng đúng một request.
  constraint attendance_ngoai_vung_phai_co_ly_do
    check (not out_of_range or (reason is not null and length(trim(reason)) > 0))
);
create index if not exists attendance_nguoi_idx
  on public.attendance_punches (tenant_id, employee_id, punched_at desc);

-- Bán kính coi là "tại tiệm". 300m đủ rộng cho sai số GPS trong nhà, đủ hẹp để
-- chấm từ quán cà phê đầu đường vẫn bị gắn cờ.
create or replace function public.attendance_set_flag()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_ban_kinh integer := 300;
begin
  -- Cờ LUÔN do máy quyết, bất kể client gửi gì lên.
  new.out_of_range := (new.distance_m is null) or (new.distance_m > v_ban_kinh);
  return new;
end;
$$;
drop trigger if exists attendance_flag on public.attendance_punches;
create trigger attendance_flag before insert or update on public.attendance_punches
  for each row execute function public.attendance_set_flag();

-- ════════════════════════════════════════════════════════════════════
-- 3. BẢNG CÔNG — chốt rồi thì KHOÁ
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.timesheets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  -- Kỳ = ngày 1 của tháng. Cùng quy ước với source_costs/kpi_targets đã có.
  period      date not null check (extract(day from period) = 1),
  work_days   numeric(5,2) not null default 0 check (work_days >= 0),
  overtime_hours numeric(6,2) not null default 0 check (overtime_hours >= 0),
  late_count  smallint not null default 0 check (late_count >= 0),
  flag_count  smallint not null default 0 check (flag_count >= 0),
  status      text not null default 'draft' check (status in ('draft', 'closed')),
  closed_by   uuid references auth.users(id),
  closed_at   timestamptz,
  unlock_reason text check (unlock_reason is null or length(trim(unlock_reason)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint timesheets_da_chot check (
    (status = 'draft'  and closed_by is null and closed_at is null) or
    (status = 'closed' and closed_by is not null and closed_at is not null)
  )
);
create unique index if not exists timesheets_mot_ky_mot_nguoi
  on public.timesheets (tenant_id, employee_id, period);
create index if not exists timesheets_ky_idx on public.timesheets (tenant_id, period desc, status);

drop trigger if exists timesheets_touch on public.timesheets;
create trigger timesheets_touch before update on public.timesheets
  for each row execute function public.touch_updated_at();

-- Chốt rồi thì khoá. Cùng luật với chốt sổ quỹ (thẻ design viện dẫn đích danh).
-- Mở khoá BẮT BUỘC ghi lý do — đó là điều kiện duy nhất cho phép sửa.
create or replace function public.timesheets_lock_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'closed' then
    -- Đường DUY NHẤT để sửa: chuyển về draft kèm lý do mở khoá.
    if new.status = 'draft' and new.unlock_reason is not null
       and length(trim(new.unlock_reason)) > 0 then
      return new;
    end if;
    raise exception 'timesheet_locked';
  end if;
  return new;
end;
$$;
drop trigger if exists timesheets_lock on public.timesheets;
create trigger timesheets_lock before update on public.timesheets
  for each row execute function public.timesheets_lock_guard();

drop trigger if exists timesheets_no_delete on public.timesheets;
create or replace function public.timesheets_no_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'closed' then raise exception 'timesheet_locked'; end if;
  return old;
end;
$$;
create trigger timesheets_no_delete before delete on public.timesheets
  for each row execute function public.timesheets_no_delete();

-- ⚠️ Khoá bảng tổng mà QUÊN khoá từng lần chấm là một đường lách rõ ràng: sửa
-- lần chấm rồi tính lại là bảng công đã chốt vẫn đổi. Chặn cả hai đầu.
create or replace function public.punch_locked_period_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_ky date := date_trunc('month', coalesce(new.punched_at, old.punched_at))::date;
begin
  if exists (
    select 1 from public.timesheets t
     where t.employee_id = coalesce(new.employee_id, old.employee_id)
       and t.period = v_ky and t.status = 'closed'
  ) then
    raise exception 'period_closed';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists punch_locked_period on public.attendance_punches;
create trigger punch_locked_period before insert or update or delete on public.attendance_punches
  for each row execute function public.punch_locked_period_guard();

-- ════════════════════════════════════════════════════════════════════
-- 4. XẾP CA + NGHỈ PHÉP
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.shifts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date   date not null,
  kind        text not null check (kind in ('morning', 'afternoon', 'full', 'off')),
  note        text check (note is null or length(note) <= 200),
  created_at  timestamptz not null default now()
);
-- Một người một ngày một ca. Thẻ không nói, nhưng hai ca chồng nhau cho cùng một
-- người là dữ liệu vô nghĩa — và cảnh báo "thiếu người" sẽ đếm sai theo.
create unique index if not exists shifts_mot_nguoi_mot_ngay
  on public.shifts (tenant_id, employee_id, work_date);
create index if not exists shifts_ngay_idx on public.shifts (tenant_id, work_date);

create table if not exists public.leave_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  from_date   date not null,
  to_date     date not null,
  kind        text not null default 'paid' check (kind in ('paid', 'unpaid', 'sick')),
  reason      text check (reason is null or length(reason) <= 300),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by  uuid references auth.users(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),

  constraint leave_ngay_hop_le check (to_date >= from_date),
  constraint leave_da_quyet check (
    (status = 'pending'  and decided_by is null and decided_at is null) or
    (status <> 'pending' and decided_by is not null and decided_at is not null)
  )
);
create index if not exists leave_cho_duyet_idx
  on public.leave_requests (tenant_id, status, from_date);

-- ════════════════════════════════════════════════════════════════════
-- 5. QUYỀN — thẻ design ghi đích danh "chặn ở CSDL, không chặn ở giao diện"
-- ════════════════════════════════════════════════════════════════════
alter table public.employees          enable row level security;
alter table public.attendance_punches enable row level security;
alter table public.timesheets         enable row level security;
alter table public.shifts             enable row level security;
alter table public.leave_requests     enable row level security;

-- Hồ sơ nhân sự chứa lương + ngày sinh + số điện thoại ⇒ chỉ chủ/quản trị.
-- Nhân viên đọc được ĐÚNG hồ sơ của mình (để biết quỹ phép còn bao nhiêu).
create policy employees_self_or_admin on public.employees
  for select using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.app_role()) in ('owner', 'admin') or user_id = (select auth.uid()))
  );
create policy employees_manage on public.employees
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );

-- Quyết định 5: nhân viên chỉ xem CÔNG VÀ LỊCH CỦA CHÍNH MÌNH; bảng công cả
-- tiệm là của quản lý trở lên.
create policy attendance_select on public.attendance_punches
  for select using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.app_role()) in ('owner', 'admin', 'manager')
         or employee_id in (select id from public.employees where user_id = (select auth.uid())))
  );
-- Ai cũng tự chấm công cho CHÍNH MÌNH — nhưng không chấm hộ người khác.
create policy attendance_self_insert on public.attendance_punches
  for insert with check (
    tenant_id = (select public.current_tenant_id())
    and employee_id in (select id from public.employees where user_id = (select auth.uid()))
  );

create policy timesheets_select on public.timesheets
  for select using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.app_role()) in ('owner', 'admin', 'manager')
         or employee_id in (select id from public.employees where user_id = (select auth.uid())))
  );
-- Duyệt/chốt bảng công: quản lý trở lên. Không có dòng này thì nhân viên tự chốt
-- bảng công của chính mình rồi lương tính theo đó.
create policy timesheets_manage on public.timesheets
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

create policy shifts_select on public.shifts
  for select using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.app_role()) in ('owner', 'admin', 'manager')
         or employee_id in (select id from public.employees where user_id = (select auth.uid())))
  );
create policy shifts_manage on public.shifts
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

create policy leave_select on public.leave_requests
  for select using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.app_role()) in ('owner', 'admin', 'manager')
         or employee_id in (select id from public.employees where user_id = (select auth.uid())))
  );
-- Ai cũng XIN nghỉ cho chính mình…
create policy leave_self_insert on public.leave_requests
  for insert with check (
    tenant_id = (select public.current_tenant_id())
    and employee_id in (select id from public.employees where user_id = (select auth.uid()))
  );
-- …nhưng QUYẾT là việc của quản lý trở lên.
create policy leave_decide on public.leave_requests
  for update using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );
