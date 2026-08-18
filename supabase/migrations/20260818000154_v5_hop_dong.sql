-- V5 việc 2 (nền) — HỢP ĐỒNG & GÓI ĐỊNH KỲ (ADR-0022)
--
-- Ba bảng:
--   service_packages  — template gói dịch vụ (số buổi, hiệu lực, giá niêm yết).
--   contracts         — bản mua thật: copy số buổi + giá TẠI THỜI ĐIỂM MUA.
--   contract_sessions — dùng một buổi từ hợp đồng.
--
-- Triết lý: gói là template tái dùng; hợp đồng là bản sao bất biến tại thời
-- điểm bán (giống order_lines copy giá từ item_costs — ADR-0019 mục 6).
-- Trigger giữ sessions_used đồng bộ và tự chuyển status khi dùng hết.

-- ==================== 1. GÓI DỊCH VỤ ====================
create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  -- sessions_total: số buổi trong gói. Không có "gói không giới hạn" — dùng
  -- giá trị lớn (e.g. 9999) nếu muốn, nhưng phải có con số cụ thể.
  sessions_total int not null check (sessions_total > 0),
  -- validity_days: null = vô thời hạn. Tính từ starts_at của hợp đồng.
  validity_days int check (validity_days is null or validity_days > 0),
  price_vnd bigint not null check (price_vnd >= 0),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_packages_tenant_idx on public.service_packages (tenant_id, status, created_at desc);
alter table public.service_packages enable row level security;
create trigger service_packages_touch before update on public.service_packages
  for each row execute function public.touch_updated_at();

-- Tạo/sửa/xoá gói: owner/admin/manager.
-- Xem danh sách gói: mọi vai — nhân viên cần xem để bán.
create policy service_packages_select on public.service_packages for select
  using (tenant_id = (select public.current_tenant_id()));
create policy service_packages_manage on public.service_packages for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
revoke all on public.service_packages from anon;

comment on table public.service_packages is
  'ADR-0022. Template gói dịch vụ. Hợp đồng sao chép sessions_total + price_vnd tại thời điểm mua nên gói có thể thay đổi mà không ảnh hưởng hợp đồng cũ.';

-- ==================== 2. HỢP ĐỒNG ====================
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  package_id uuid not null references public.service_packages(id) on delete restrict,
  -- Copy từ gói tại thời điểm mua — không FK vào sessions_total của gói.
  sessions_total int not null check (sessions_total > 0),
  sessions_used int not null default 0 check (sessions_used >= 0),
  starts_at date not null default current_date,
  -- expires_at: null = vô thời hạn. Tính khi tạo = starts_at + validity_days.
  expires_at date,
  -- price_paid_vnd: có thể khác price_vnd của gói (giảm giá, VIP, v.v.)
  price_paid_vnd bigint not null check (price_paid_vnd >= 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'transfer', 'qr')),
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ràng buộc: không thể dùng nhiều buổi hơn tổng số buổi.
  constraint contracts_sessions_check check (sessions_used <= sessions_total)
);

create index contracts_tenant_idx on public.contracts (tenant_id, status, created_at desc);
create index contracts_contact_idx on public.contracts (contact_id, status);
alter table public.contracts enable row level security;
create trigger contracts_touch before update on public.contracts
  for each row execute function public.touch_updated_at();

-- Xem hợp đồng: mọi vai — nhân viên cần xem để đổi buổi.
create policy contracts_select on public.contracts for select
  using (tenant_id = (select public.current_tenant_id()));
-- Tạo/sửa/xoá hợp đồng: owner/admin/manager.
create policy contracts_manage on public.contracts for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
revoke all on public.contracts from anon;

comment on table public.contracts is
  'ADR-0022. Hợp đồng mua gói: sessions_total/price_paid_vnd copy từ gói tại thời điểm mua. sessions_used tăng tự động qua trigger khi thêm contract_sessions.';

-- ==================== 3. DÙNG BUỔI ====================
create table public.contract_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  -- appointment_id: liên kết lịch hẹn nếu có. Một buổi không bắt buộc phải có lịch.
  appointment_id uuid references public.appointments(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index contract_sessions_contract_idx on public.contract_sessions (contract_id, created_at desc);
alter table public.contract_sessions enable row level security;

-- Mọi vai: nhân viên cần đổi buổi cho khách.
create policy contract_sessions_all on public.contract_sessions for all
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
revoke all on public.contract_sessions from anon;

comment on table public.contract_sessions is
  'ADR-0022. Dùng một buổi từ hợp đồng. Trigger contract_sessions_cap kiểm không dùng quá tổng và tự tăng sessions_used + chuyển status khi hết.';

-- ==================== 4. TRIGGER: CHỐT CHẶN + TĂNG SESSIONS_USED ====================
-- Trigger chạy BEFORE INSERT để block khi hợp đồng đã đầy, sau đó trigger
-- AFTER INSERT để tăng sessions_used + tự chuyển status. Tách làm 2 vì
-- BEFORE có thể block không có row; AFTER cần row đã tồn tại để JOIN ngược lại.

-- 4a. BEFORE: không cho đổi buổi khi sessions_used >= sessions_total hoặc status không phải active
create or replace function public.contract_sessions_cap() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_used int;
  v_total int;
  v_status text;
begin
  select sessions_used, sessions_total, status
    into v_used, v_total, v_status
    from public.contracts where id = new.contract_id;

  if v_status = 'cancelled' then
    raise exception 'contract_cancelled: hợp đồng đã huỷ'
      using errcode = '23514';
  end if;

  if v_status = 'completed' or v_used >= v_total then
    raise exception 'contract_full: hợp đồng đã dùng hết buổi'
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger contract_sessions_cap
  before insert on public.contract_sessions
  for each row execute function public.contract_sessions_cap();

-- 4b. AFTER: tăng sessions_used và chuyển status nếu hết buổi
create or replace function public.contract_sessions_sync() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_used int;
  v_total int;
begin
  update public.contracts
     set sessions_used = sessions_used + 1,
         status = case
                    when sessions_used + 1 >= sessions_total then 'completed'
                    else status
                  end,
         updated_at = now()
   where id = new.contract_id
  returning sessions_used, sessions_total into v_used, v_total;

  return new;
end $$;

create trigger contract_sessions_sync
  after insert on public.contract_sessions
  for each row execute function public.contract_sessions_sync();
