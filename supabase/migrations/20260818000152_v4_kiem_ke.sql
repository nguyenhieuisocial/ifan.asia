-- V4 việc 6 (nền) — KIỂM KÊ (ADR-0021 mục 8 việc 6)
--
-- Luật cốt lõi: **không có ô nào sửa thẳng số tồn.** Người đếm nhập SỐ ĐẾM
-- ĐƯỢC, máy tự tính chênh lệch so với sổ, và chốt phiên thì sinh dòng điều
-- chỉnh CÓ LÝ DO vào sổ kho. Nhờ vậy mọi chênh lệch đều truy được về sau:
-- "tháng trước hụt 3 chai vì vỡ" khác hẳn "tự nhiên số nhảy".
--
-- Vì sao lưu cả `ton_theo_so` tại thời điểm đếm: tồn đổi liên tục (đang kiểm
-- kê vẫn có người bán). Không chụp lại số sổ lúc đếm thì sau này không ai
-- dựng lại được phép trừ đã ra con số chênh lệch kia.

create table public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'dang_dem' check (status in ('dang_dem', 'da_chot', 'da_huy')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stocktakes_tenant_idx on public.stocktakes (tenant_id, created_at desc);
alter table public.stocktakes enable row level security;
create policy stocktakes_rw on public.stocktakes for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
create trigger stocktakes_touch before update on public.stocktakes
  for each row execute function public.touch_updated_at();
revoke all on public.stocktakes from anon;

create table public.stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stocktake_id uuid not null references public.stocktakes(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  ton_theo_so numeric(14,3) not null,          -- ảnh chụp sổ lúc đếm
  dem_thuc_te numeric(14,3) not null check (dem_thuc_te >= 0),
  ly_do text check (ly_do is null or ly_do in ('vo_hong', 'het_han', 'mat', 'ghi_nham')),
  created_at timestamptz not null default now(),
  unique (stocktake_id, item_id)               -- một mặt hàng đếm một lần mỗi phiên
);
create index stocktake_lines_phien_idx on public.stocktake_lines (stocktake_id);
alter table public.stocktake_lines enable row level security;
create policy stocktake_lines_rw on public.stocktake_lines for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
revoke all on public.stocktake_lines from anon;

-- Khoá phiên đã chốt — cùng luật với đơn hàng (#127) và phiếu nhập (#151).
create or replace function public.stocktake_lines_lock_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare v_status text;
begin
  select status into v_status from public.stocktakes
   where id = coalesce(new.stocktake_id, old.stocktake_id);
  if v_status in ('da_chot', 'da_huy') then
    raise exception 'stocktake_locked: phiên kiểm kê đã đóng — mở phiên mới để sửa, không sửa phiên cũ'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger stocktake_lines_lock_guard
  before insert or update or delete on public.stocktake_lines
  for each row execute function public.stocktake_lines_lock_guard();

-- Chốt phiên → sinh dòng điều chỉnh vào sổ kho. CHỈ những dòng có CHÊNH LỆCH.
-- Dòng đếm đúng bằng sổ không sinh gì — ghi một dòng qty = 0 vừa vô nghĩa vừa
-- vướng ràng buộc `qty <> 0` của sổ.
create or replace function public.stocktakes_sinh_dong_kho() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status <> 'da_chot' then return new; end if;

  insert into public.stock_moves (tenant_id, item_id, qty, reason, ref_type, ref_id, note, created_by)
  select sl.tenant_id, sl.item_id, sl.dem_thuc_te - sl.ton_theo_so,
         case when sl.ly_do in ('vo_hong', 'het_han', 'mat') then 'hao_hut' else 'kiem_ke' end,
         'stocktake_line', sl.id,
         'Kiểm kê ' || new.id || coalesce(' — ' || sl.ly_do, ''), auth.uid()
    from public.stocktake_lines sl
   where sl.stocktake_id = new.id
     and sl.dem_thuc_te <> sl.ton_theo_so
  on conflict (ref_type, ref_id, reason) where ref_id is not null do nothing;

  update public.stocktakes set closed_at = now() where id = new.id and closed_at is null;
  return new;
end $$;

create trigger stocktakes_sinh_dong_kho after update of status on public.stocktakes
  for each row execute function public.stocktakes_sinh_dong_kho();

comment on table public.stocktakes is
  'ADR-0021 việc 6. Kiểm kê: người đếm nhập SỐ ĐẾM ĐƯỢC, máy tính chênh lệch, chốt phiên thì sinh dòng điều chỉnh CÓ LÝ DO vào stock_moves. KHÔNG có đường nào sửa thẳng số tồn.';
comment on column public.stocktake_lines.ton_theo_so is
  'Ảnh chụp tồn theo sổ TẠI LÚC ĐẾM. Tồn đổi liên tục (đang kiểm kê vẫn có người bán) — không chụp lại thì sau này không dựng lại được phép trừ ra con số chênh lệch.';
