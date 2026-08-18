-- V4 việc 3 (nền) — PHIẾU NHẬP HÀNG (ADR-0021 mục 6)
--
-- Vì sao là CHỨNG TỪ riêng chứ không chỉ vài dòng `stock_moves` reason='nhap':
-- một lần nhập cần nhớ NHẬP CỦA AI, GIÁ BAO NHIÊU, và các dòng cùng một lần
-- nhập phải đi với nhau. Nhét hết vào sổ kho thì mất cả ba. Sổ kho ghi HỆ QUẢ
-- (kho tăng mấy cái), chứng từ ghi NGUYÊN NHÂN (mua của ai, giá nào) — giống
-- hệt cách `orders` + `order_lines` sinh ra dòng bán ở migration #150.
--
-- Máy trạng thái CỐ Ý GIỐNG ĐƠN HÀNG (draft → completed | cancelled): chủ tiệm
-- nhỏ vừa học xong luồng đơn hàng ở V3, bắt họ học một luồng thứ hai khác kiểu
-- là tự làm khó người dùng. Nháp KHÔNG đụng kho; chốt mới vào kho.

-- ---------- 1. purchases ----------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'completed', 'cancelled')),
  note text,
  received_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchases_tenant_idx on public.purchases (tenant_id, created_at desc);
alter table public.purchases enable row level security;

-- Giá nhập = giá vốn ⇒ cùng nhóm quyền với `item_costs`/`suppliers`:
-- owner/admin/manager. staff/viewer không có policy nào ⇒ 0 dòng, kể cả JOIN.
create policy purchases_rw on public.purchases for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
create trigger purchases_touch before update on public.purchases
  for each row execute function public.touch_updated_at();
revoke all on public.purchases from anon;

-- ---------- 2. purchase_lines ----------
-- QUY ĐỔI ĐƠN VỊ (ADR mục 6): tiệm mua THÙNG nhưng bán CHAI.
--   `qty_mua`     = số lượng theo đơn vị MUA (2 thùng)
--   `he_so`       = 1 đơn vị mua bằng mấy đơn vị bán (1 thùng = 24 chai)
--   `don_gia_mua` = giá của 1 đơn vị MUA (240.000đ/thùng)
-- ⇒ kho tăng qty_mua × he_so (48 chai), giá vốn 1 chai = don_gia_mua / he_so.
-- Cố ý KHÔNG dựng cả hệ thống đơn vị đo: một hệ số trên mỗi dòng là đủ cho
-- tiệm nhỏ, và không có đơn mua thì không ai ghi hệ số (lý do ADR-0019 dời
-- việc này từ V3 sang V4).
create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  qty_mua numeric(14,3) not null check (qty_mua > 0),
  he_so numeric(14,3) not null default 1 check (he_so > 0),
  don_gia_mua bigint not null check (don_gia_mua >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index purchase_lines_phieu_idx on public.purchase_lines (purchase_id, sort_order);
alter table public.purchase_lines enable row level security;
create policy purchase_lines_rw on public.purchase_lines for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
revoke all on public.purchase_lines from anon;

comment on column public.purchase_lines.he_so is
  'ADR-0021 mục 6. 1 đơn vị MUA = mấy đơn vị BÁN (1 thùng = 24 chai). Kho tăng qty_mua × he_so; giá vốn 1 đơn vị bán = don_gia_mua / he_so.';

-- ---------- 3. Khoá chứng từ đã chốt (cùng luật với đơn hàng) ----------
-- Tiền lệ: `order_lines_lock_guard` ở migration #127. Sửa phiếu đã chốt là sửa
-- chứng từ trong im lặng, mà kho đã tăng theo phiếu đó rồi.
create or replace function public.purchase_lines_lock_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_status text;
begin
  select status into v_status from public.purchases
   where id = coalesce(new.purchase_id, old.purchase_id);
  if v_status in ('completed', 'cancelled') then
    raise exception 'purchase_locked: phiếu nhập đã % — sửa sai thì tạo phiếu điều chỉnh mới, không sửa dòng cũ', v_status
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger purchase_lines_lock_guard
  before insert or update or delete on public.purchase_lines
  for each row execute function public.purchase_lines_lock_guard();

-- ---------- 4. Chốt phiếu → hàng vào kho + cập nhật giá vốn ----------
-- Chốt nằm ở CSDL, không ở giao diện (bất biến 1) — giống hệt trigger bán hàng
-- ở migration #150, để mọi đường ghi khác đều phải đi qua.
create or replace function public.purchases_sinh_dong_kho() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'completed' then
    insert into public.stock_moves (tenant_id, item_id, qty, reason, ref_type, ref_id, note, created_by)
    select pl.tenant_id, pl.item_id, pl.qty_mua * pl.he_so, 'nhap', 'purchase_line', pl.id,
           'Nhập theo phiếu ' || new.id, auth.uid()
      from public.purchase_lines pl
     where pl.purchase_id = new.id
    on conflict (ref_type, ref_id, reason) where ref_id is not null do nothing;

    -- Giá vốn = giá MỚI NHẤT nhập vào, quy về đơn vị BÁN. Cố ý KHÔNG tính giá
    -- bình quân: tiệm nhỏ hỏi "cái này nhập bao nhiêu" là hỏi lần nhập gần nhất,
    -- và bình quân cần lịch sử tồn theo lô — thuộc V4.5 (lô + hạn dùng).
    insert into public.item_costs (item_id, tenant_id, cost_vnd, updated_at)
    select distinct on (pl.item_id)
           pl.item_id, pl.tenant_id, (pl.don_gia_mua / pl.he_so)::bigint, now()
      from public.purchase_lines pl
     where pl.purchase_id = new.id
     order by pl.item_id, pl.sort_order desc
    on conflict (item_id) do update
      set cost_vnd = excluded.cost_vnd, updated_at = now();

  elsif new.status = 'cancelled' and old.status = 'completed' then
    -- Huỷ phiếu ĐÃ chốt ⇒ rút lại đúng phần đã nhập. Giá vốn KHÔNG khôi phục
    -- về giá cũ: không lưu giá trước đó, và đoán mò một con số tiền là tệ hơn
    -- để nguyên số cuối cùng người dùng nhìn thấy.
    insert into public.stock_moves (tenant_id, item_id, qty, reason, ref_type, ref_id, note, created_by)
    select pl.tenant_id, pl.item_id, -(pl.qty_mua * pl.he_so), 'huy', 'purchase_line', pl.id,
           'Huỷ phiếu nhập ' || new.id, auth.uid()
      from public.purchase_lines pl
     where pl.purchase_id = new.id
    on conflict (ref_type, ref_id, reason) where ref_id is not null do nothing;
  end if;

  return new;
end $$;

create trigger purchases_sinh_dong_kho after update of status on public.purchases
  for each row execute function public.purchases_sinh_dong_kho();

comment on table public.purchases is
  'ADR-0021 mục 6. Phiếu nhập: nháp KHÔNG đụng kho, chốt mới vào kho (giống máy trạng thái đơn hàng ở V3). Chốt → sinh stock_moves reason=nhap + cập nhật item_costs theo giá nhập mới nhất quy về đơn vị bán.';
