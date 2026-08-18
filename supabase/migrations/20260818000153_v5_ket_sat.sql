-- V5 việc 1 (nền) — KÉT SẮT & CÔNG NỢ NCC (ADR-0022)
--
-- Hai bảng:
--   shift_closings  — chốt sổ ca: snapshot tiền mặt cuối ca, so sánh thực tế vs kỳ vọng.
--   supplier_payments — thanh toán nhà cung cấp: theo dõi số dư nợ NCC.
--
-- Triết lý: KHÔNG làm kế toán kép, KHÔNG lưu installment schedule.
-- Mục tiêu: tiệm biết "hết ca còn bao nhiêu tiền" và "còn nợ NCC ai, bao nhiêu" —
-- đủ để chủ tiệm nhỏ kiểm soát mà không cần phần mềm kế toán thật.

-- ==================== 1. CHỐT SỔ CA ====================
create table public.shift_closings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  closed_by uuid references auth.users(id) on delete set null,
  shift_date date not null default current_date,
  -- opening_cash: tiền đầu ca (VND nguyên — cùng quy ước bigint với cash_entries).
  -- Lấy actual_cash của ca ngay trước, hoặc nhập tay khi mở tiệm lần đầu.
  opening_cash bigint not null default 0 check (opening_cash >= 0),
  -- actual_cash: tiền ĐẾM THỰC TẾ trong két cuối ca.
  actual_cash bigint not null check (actual_cash >= 0),
  -- expected_cash: snapshot kỳ vọng tại thời điểm chốt =
  --   opening_cash + sum(cash_entries IN cash, ca này) − sum(cash_entries OUT cash, ca này).
  -- Lưu snapshot, không tính lại — cash_entries có thể sửa sau khi chốt.
  expected_cash bigint not null,
  -- variance: chênh lệch (âm = thiếu, dương = thừa). Generated column để luôn nhất quán.
  variance bigint generated always as (actual_cash - expected_cash) stored,
  note text,
  created_at timestamptz not null default now()
);

create index shift_closings_tenant_idx on public.shift_closings (tenant_id, created_at desc);
alter table public.shift_closings enable row level security;

-- owner/admin/manager: chốt ca là thao tác quản lý. staff/viewer KHÔNG thấy.
create policy shift_closings_rw on public.shift_closings for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
revoke all on public.shift_closings from anon;

comment on table public.shift_closings is
  'ADR-0022. Chốt sổ ca: snapshot tiền mặt cuối ca. opening_cash lấy từ actual_cash ca trước. expected_cash là snapshot tại thời điểm chốt (không tính lại sau đó). variance = actual - expected.';
comment on column public.shift_closings.expected_cash is
  'Snapshot kỳ vọng lúc chốt = opening_cash + net_cash_entries trong ca này. Lưu snapshot để trung thực với thời điểm chốt, không bị méo nếu cash_entries được sửa sau.';

-- ==================== 2. THANH TOÁN NHÀ CUNG CẤP ====================
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  -- purchase_id: tuỳ chọn — ghi chú trả tiền cho phiếu nhập nào (đối soát dễ hơn).
  -- Nếu trả chung nhiều phiếu thì để null.
  purchase_id uuid references public.purchases(id) on delete set null,
  amount_vnd bigint not null check (amount_vnd > 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'transfer')),
  paid_at timestamptz not null default now(),
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index supplier_payments_tenant_idx on public.supplier_payments (tenant_id, created_at desc);
create index supplier_payments_supplier_idx on public.supplier_payments (supplier_id, created_at desc);
alter table public.supplier_payments enable row level security;

-- Cùng nhóm quyền giá vốn + phiếu nhập: owner/admin/manager. staff/viewer không thấy.
create policy supplier_payments_rw on public.supplier_payments for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
revoke all on public.supplier_payments from anon;

comment on table public.supplier_payments is
  'ADR-0022. Thanh toán NCC: theo dõi số dư nợ = sum(purchases.tong_tien completed) − sum(supplier_payments.amount_vnd). Không làm installment schedule hoặc kế toán kép.';
