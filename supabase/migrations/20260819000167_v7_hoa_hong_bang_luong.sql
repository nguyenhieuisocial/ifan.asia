-- V7 payroll (19/08/2026) — Hoa hồng + Bảng lương.
-- Thẻ design: design-system/man-bang-luong.html (5 quyết định đã chốt).
--
-- ════════════════════════════════════════════════════════════════════
-- MỘT PHỤ THUỘC CHẶN MÀ SỔ TÍNH NĂNG BỎ SÓT
-- ════════════════════════════════════════════════════════════════════
-- Thẻ bảng lương lấy HOA HỒNG làm đầu vào bắt buộc ("hoa hồng → 38 lượt làm cụ
-- thể"). Nhưng `commission_entries` CHƯA TỪNG TỒN TẠI: nó chỉ được nhắc như một
-- khuôn mẫu trong chú thích migration #127, và như một giá trị `category` của
-- `cash_entries`. Kho có thẻ design `man-hoa-hong.html` nhưng mảng đó KHÔNG nằm
-- trong danh sách 30 mảng của `lib/feature-registry.ts`.
--
-- ⇒ Dựng `commission_entries` ở đây KHÔNG phải phình phạm vi. Không có nó thì
-- phiếu lương có một dòng tiền không giải thích được, đúng thứ quyết định 2 cấm.
-- Đã ghi thành việc theo dõi riêng để mảng "Hoa hồng" được vào sổ tính năng.

-- ════════════════════════════════════════════════════════════════════
-- 1. HOA HỒNG — sổ BẤT BIẾN, cùng khuôn sổ kho
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.commission_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  -- Gốc của khoản hoa hồng: một dòng hàng đã bán. Có gốc thì phiếu lương bấm
  -- được về tận nơi (quyết định 2).
  order_line_id uuid references public.order_lines(id) on delete set null,
  order_id      uuid references public.orders(id) on delete set null,
  earned_on   date not null default current_date,
  amount_vnd  bigint not null check (amount_vnd <> 0),
  note        text check (note is null or length(note) <= 300),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
-- Một dòng hàng sinh ĐÚNG MỘT khoản hoa hồng cho một người. Chốt đơn hai lần
-- (bấm nhầm, retry mạng) không nhân đôi tiền hoa hồng.
create unique index if not exists commission_mot_dong_mot_nguoi
  on public.commission_entries (order_line_id, employee_id)
  where order_line_id is not null;
create index if not exists commission_ky_idx
  on public.commission_entries (tenant_id, employee_id, earned_on);

-- ════════════════════════════════════════════════════════════════════
-- 2. KỲ LƯƠNG
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.payroll_periods (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  period     date not null check (extract(day from period) = 1),
  status     text not null default 'draft' check (status in ('draft', 'closed')),
  total_vnd  bigint not null default 0 check (total_vnd >= 0),
  closed_by  uuid references auth.users(id),
  closed_at  timestamptz,
  unlock_reason text check (unlock_reason is null or length(trim(unlock_reason)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payroll_da_chot check (
    (status = 'draft'  and closed_by is null and closed_at is null) or
    (status = 'closed' and closed_by is not null and closed_at is not null)
  )
);
create unique index if not exists payroll_mot_ky_mot_tiem
  on public.payroll_periods (tenant_id, period);

drop trigger if exists payroll_periods_touch on public.payroll_periods;
create trigger payroll_periods_touch before update on public.payroll_periods
  for each row execute function public.touch_updated_at();

create table if not exists public.payslips (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  period_id   uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  -- Thực nhận là TỔNG CÁC DÒNG, không phải ô gõ. Cùng khuôn
  -- `shift_closings.variance` đã có: số dẫn xuất thì để CSDL tự tính.
  gross_vnd   bigint not null default 0,
  deduction_vnd bigint not null default 0 check (deduction_vnd >= 0),
  net_vnd     bigint generated always as (gross_vnd - deduction_vnd) stored,
  created_at  timestamptz not null default now()
);
create unique index if not exists payslips_mot_ky_mot_nguoi
  on public.payslips (period_id, employee_id);

-- Mỗi dòng tiền PHẢI có gốc. Quyết định 1+2: "không có ô nào gõ tay tự do" và
-- "không được có con số nào không giải thích được".
create table if not exists public.payslip_lines (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  payslip_id uuid not null references public.payslips(id) on delete cascade,
  kind       text not null check (kind in ('base', 'commission', 'overtime', 'advance', 'insurance', 'adjust')),
  amount_vnd bigint not null check (amount_vnd <> 0),
  -- Con trỏ về gốc. `source_type` not null ⇒ một INSERT thẳng cũng không tạo ra
  -- được dòng tiền không giải thích được.
  source_type text not null check (source_type in ('timesheet', 'commission', 'cash_entry', 'manual')),
  source_id   uuid,
  label      text check (label is null or length(label) <= 200),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  -- 'manual' là đường duy nhất KHÔNG có gốc máy — nên nó BẮT BUỘC có nhãn giải
  -- thích và người ghi. Không có ngoại lệ im lặng.
  constraint payslip_lines_co_goc check (
    (source_type = 'manual' and label is not null and created_by is not null)
    or (source_type <> 'manual' and source_id is not null)
  )
);
create index if not exists payslip_lines_phieu_idx on public.payslip_lines (payslip_id);

-- ════════════════════════════════════════════════════════════════════
-- 3. HAI CHỐT CHẶN LIÊN BẢNG
-- ════════════════════════════════════════════════════════════════════
-- (a) KHÔNG chốt được kỳ lương khi bảng công cùng kỳ chưa chốt (quyết định 1).
--     Không có cách nào ép điều này ở giao diện.
create or replace function public.payroll_close_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'closed' and old.status = 'draft' then
    if exists (
      select 1 from public.payslips p
       where p.period_id = new.id
         and not exists (
           select 1 from public.timesheets t
            where t.employee_id = p.employee_id
              and t.period = new.period
              and t.status = 'closed')
    ) then
      raise exception 'timesheet_not_closed';
    end if;
  end if;

  -- (b) Chốt rồi thì khoá. Đường sửa duy nhất: mở khoá kèm lý do.
  if old.status = 'closed' then
    if new.status = 'draft' and new.unlock_reason is not null
       and length(trim(new.unlock_reason)) > 0 then
      return new;
    end if;
    raise exception 'payroll_locked';
  end if;
  return new;
end;
$$;
drop trigger if exists payroll_close on public.payroll_periods;
create trigger payroll_close before update on public.payroll_periods
  for each row execute function public.payroll_close_guard();

-- Khoá cả phiếu lương và từng dòng khi kỳ đã chốt — khoá mỗi bảng tổng là để hở.
create or replace function public.payslip_locked_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_period uuid := coalesce(
  (select period_id from public.payslips where id = coalesce(new.payslip_id, old.payslip_id)),
  coalesce(new.period_id, old.period_id));
begin
  if exists (select 1 from public.payroll_periods where id = v_period and status = 'closed') then
    raise exception 'payroll_locked';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists payslips_locked on public.payslips;
create trigger payslips_locked before insert or update or delete on public.payslips
  for each row execute function public.payslip_locked_guard();
drop trigger if exists payslip_lines_locked on public.payslip_lines;
create trigger payslip_lines_locked before insert or update or delete on public.payslip_lines
  for each row execute function public.payslip_locked_guard();

-- ════════════════════════════════════════════════════════════════════
-- 4. QUYỀN — chỗ nguy hiểm nhất của thẻ này
-- ════════════════════════════════════════════════════════════════════
alter table public.commission_entries enable row level security;
alter table public.payroll_periods    enable row level security;
alter table public.payslips           enable row level security;
alter table public.payslip_lines      enable row level security;

-- ⚠️ NGOẠI LỆ SO VỚI GẦN HẾT KHO: `manager` KHÔNG được xem lương.
-- Thẻ design có hẳn bảng "Ai xem được gì": quản lý DUYỆT BẢNG CÔNG nhưng KHÔNG
-- XEM LƯƠNG — "biết lương đồng nghiệp làm hỏng không khí tiệm nhanh nhất".
-- Ở mọi bảng tài chính khác trong kho, manager đi cùng owner/admin. Ở đây KHÔNG.
-- Giấu menu là vô nghĩa: một lời gọi API là đọc lương cả tiệm.
create policy payroll_periods_rw on public.payroll_periods
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );

-- Nhân viên đọc ĐÚNG phiếu của mình; quản lý không đọc phiếu của ai.
create policy payslips_select on public.payslips
  for select using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.app_role()) in ('owner', 'admin')
         or employee_id in (select id from public.employees where user_id = (select auth.uid())))
  );
create policy payslips_manage on public.payslips
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );

create policy payslip_lines_select on public.payslip_lines
  for select using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.app_role()) in ('owner', 'admin')
         or payslip_id in (
           select p.id from public.payslips p
             join public.employees e on e.id = p.employee_id
            where e.user_id = (select auth.uid())))
  );
create policy payslip_lines_manage on public.payslip_lines
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );

-- Hoa hồng: nhân viên xem được của mình (đó là tiền của họ), quản lý xem cả tiệm
-- (họ điều phối ai làm gì) — nhưng đây KHÔNG phải lương, chỉ là một cấu phần.
create policy commission_select on public.commission_entries
  for select using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.app_role()) in ('owner', 'admin', 'manager')
         or employee_id in (select id from public.employees where user_id = (select auth.uid())))
  );
create policy commission_manage on public.commission_entries
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );
