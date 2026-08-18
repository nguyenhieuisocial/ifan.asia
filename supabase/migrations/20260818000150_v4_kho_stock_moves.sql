-- V4 việc 1 — NỀN KHO (ADR-0021 mục 3, 4, 6)
--
-- ĐO THẬT trước khi viết (18/08, CSDL Singapore):
--   · `order_lines` có **170 dòng** đã bán, `stock_moves` KHÔNG TỒN TẠI
--     ⇒ bán xong không ai biết còn lại bao nhiêu. Đó là lý do đợt này tồn tại.
--   · Máy trạng thái đơn: draft → confirmed → completed | cancelled;
--     `kind` = order | return. Đơn ĐÃ chốt VẪN chuyển sang cancelled được
--     (trigger đổi trạng thái ở migration #127 dòng 454 cho phép) ⇒ trigger kho
--     phải xử lý CẢ chiều trả hàng về, không chỉ chiều trừ đi.
--   · Postgres 17.6 ⇒ view có `security_invoker` (kế thừa RLS của bảng gốc).

-- ---------- 1. suppliers — bản TỐI GIẢN (ADR mục 6) ----------
-- Cố ý KHÔNG có công nợ/hạn thanh toán: đó là mảng Két sắt & Công nợ của V5.
-- Làm nửa vời ở đây thì V5 phải đập đi.
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  phone text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_tenant_idx on public.suppliers (tenant_id, name);
alter table public.suppliers enable row level security;

-- CHỈ owner/admin/manager — cùng nhóm đã được tin với giá vốn (ADR-0009 mục 7b,
-- và tiền lệ `item_costs` ở migration #127). staff/viewer không có policy nào
-- ⇒ SELECT trả 0 dòng, kể cả qua JOIN.
create policy suppliers_rw on public.suppliers for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
create trigger suppliers_touch before update on public.suppliers
  for each row execute function public.touch_updated_at();
revoke all on public.suppliers from anon;

comment on table public.suppliers is
  'ADR-0021 mục 6. Nhà cung cấp bản TỐI GIẢN (tên/điện thoại/ghi chú). Công nợ nhà cung cấp thuộc V5 — cố ý chưa có. Quyền: owner/admin/manager, giống item_costs.';

-- ---------- 2. stock_moves — SỔ CÁI KHO, chỉ-thêm (ADR mục 3) ----------
-- Tồn = TỔNG các dòng, KHÔNG nuôi một ô `so_luong_ton`. Một ô số bị sửa từ
-- nhiều đường (bán · nhập · kiểm kê · hoàn) là ô CHẮC CHẮN sẽ lệch, và khi lệch
-- thì không truy được mất ở đâu. Cùng triết lý với tiền ở ADR-0019 mục 5.
--
-- qty: DƯƠNG = hàng vào, ÂM = hàng ra. numeric(14,3) để bán được theo cân/lít,
-- không chỉ theo cái (đơn vị đang dùng thật: chai · tuýp · miếng).
create table public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  qty numeric(14,3) not null check (qty <> 0),
  reason text not null check (reason in ('nhap', 'ban', 'hoan', 'huy', 'kiem_ke', 'hao_hut')),
  ref_type text check (ref_type is null or ref_type in ('order_line', 'purchase_line', 'stocktake_line')),
  ref_id uuid,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Không cho một dòng vừa khai "có chứng từ gốc" vừa để trống mã chứng từ.
alter table public.stock_moves add constraint stock_moves_ref_all_or_none check (
  (ref_type is null and ref_id is null) or (ref_type is not null and ref_id is not null));

create index stock_moves_ton_idx on public.stock_moves (tenant_id, item_id, created_at desc);
-- CHỐNG TRỪ KHO HAI LẦN: mỗi dòng chứng từ chỉ sinh ĐÚNG MỘT dòng kho cho mỗi
-- lý do. Chốt đơn hai lần (bấm đúp, chạy lại việc nền) sẽ đụng khoá này thay vì
-- âm thầm trừ kho gấp đôi — loại lỗi không hiện ra cho tới lúc kiểm kê.
create unique index stock_moves_chung_tu_uniq
  on public.stock_moves (ref_type, ref_id, reason) where ref_id is not null;

alter table public.stock_moves enable row level security;

-- ĐỌC: mọi vai trong tiệm. Số lượng tồn KHÔNG nhạy cảm (giá vốn nằm ở bảng
-- riêng `item_costs` đã khoá) — nhân viên bán hàng phải biết còn bao nhiêu,
-- không thì không bán được.
create policy stock_moves_select on public.stock_moves for select
  using (tenant_id = (select public.current_tenant_id()));

-- GHI TAY: owner/admin/manager. Dòng 'ban'/'hoan'/'huy' KHÔNG đi qua đây —
-- chúng do trigger quyền-cao sinh ra khi chốt/huỷ đơn, nên nhân viên vẫn bán
-- được bình thường mà không cần quyền ghi kho.
create policy stock_moves_insert on public.stock_moves for insert
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));

-- CỐ Ý KHÔNG CÓ policy UPDATE/DELETE: sổ cái là bất biến. Sửa sai thì ghi dòng
-- ngược lại, không sửa dòng cũ (đúng luật ADR-0019 mục 5 đã áp cho tiền).
revoke all on public.stock_moves from anon;

comment on table public.stock_moves is
  'ADR-0021 mục 3. SỔ CÁI KHO chỉ-thêm. Tồn = SUM(qty) qua view stock_levels, KHÔNG có ô số tự nuôi. qty dương=vào/âm=ra. Sửa sai = ghi dòng ngược, không sửa dòng cũ (stock_moves_immutable_guard chặn).';

-- ---------- 3. Chốt bất biến ở CSDL, không ở giao diện ----------
-- ⚠️ BẪY ĐÃ TRÁNH: chặn cứng cả DELETE sẽ làm HỎNG việc XOÁ TIỆM — xoá tiệm
-- kéo theo cascade xoá dòng kho, và CI có phép kiểm canh đúng chuyện đó
-- ("xoá tiệm không bị nhật ký chặn", migration #82). Nên: chặn UPDATE tuyệt
-- đối, còn DELETE chỉ chặn KHI TIỆM CÒN TỒN TẠI. Lúc cascade chạy, dòng
-- `tenants` đã biến mất khỏi ảnh chụp của lệnh hiện tại ⇒ nhánh này cho qua.
-- (Đã đo tận tay bằng cách xoá thật một tiệm tạm rồi rollback — không đoán.)
create or replace function public.stock_moves_immutable_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'stock_moves_immutable: sổ kho không sửa được — ghi một dòng ngược lại thay vì sửa dòng cũ'
      using errcode = '23514';
  end if;
  if exists (select 1 from public.tenants where id = old.tenant_id) then
    raise exception 'stock_moves_immutable: sổ kho không xoá được — ghi một dòng ngược lại thay vì xoá'
      using errcode = '23514';
  end if;
  return old;
end $$;

create trigger stock_moves_immutable_guard
  before update or delete on public.stock_moves
  for each row execute function public.stock_moves_immutable_guard();

-- ---------- 4. Tồn hiện tại = VIEW tính từ sổ (ADR mục 3) ----------
-- Cố ý dùng VIEW chứ không phải bảng tổng hợp: view KHÔNG THỂ lệch khỏi sổ.
-- ADR mục 3 cho phép một bảng tổng hợp phụ, nhưng bảng thì phải có trigger nuôi
-- + công cụ dựng lại + rủi ro lệch — đúng thứ đợt này sinh ra để chống. Khi nào
-- ĐO ĐƯỢC là chậm thì mới đổi, không tối ưu trước khi có số.
-- `security_invoker = on` (PG 15+, ở đây 17.6): view chạy bằng quyền NGƯỜI GỌI
-- nên RLS của stock_moves vẫn che đúng — không có view thì cách ly tiệm thủng.
create view public.stock_levels with (security_invoker = on) as
  select
    sm.tenant_id,
    sm.item_id,
    sum(sm.qty)      as qty_on_hand,
    max(sm.created_at) as last_move_at
  from public.stock_moves sm
  group by sm.tenant_id, sm.item_id;

comment on view public.stock_levels is
  'ADR-0021 mục 3. Tồn hiện tại TÍNH TỪ sổ stock_moves, không phải ô số tự nuôi ⇒ không thể lệch. security_invoker=on để RLS của stock_moves vẫn áp cho người gọi. Tồn ÂM là hợp lệ (ADR mục 5: bán quá tồn thì cảnh báo, không chặn).';

-- ---------- 5. Bán trừ kho / hoàn + huỷ trả kho (ADR mục 4) ----------
-- Chốt nằm ở CSDL, KHÔNG ở giao diện: mọi đường ghi khác (bot, nhập Excel, sửa
-- tay) đều phải đi qua đây, nếu chỉ gọi từ màn hình thì các đường kia âm thầm
-- bỏ qua kho.
--
-- Trừ ĐÚNG LÚC ĐƠN CHỐT, không phải lúc tạo đơn nháp: đơn nháp bị bỏ giữa chừng
-- là chuyện thường ngày, trừ sớm thì tồn bốc hơi mà không ai hiểu vì sao.
--
-- CHỈ hàng hoá vật lý (`items.kind = 'product'`) — dịch vụ không có tồn.
create or replace function public.orders_sinh_dong_kho() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_ly_do text;
  v_dau int;
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'completed' then
    -- Đơn thường trừ kho ('ban'); phiếu hoàn có qty ÂM sẵn (luật dấu ở
    -- migration #127) nên -qty ra DƯƠNG = hàng về kho ('hoan').
    v_ly_do := case when new.kind = 'return' then 'hoan' else 'ban' end;
    v_dau := -1;
  elsif new.status = 'cancelled' and old.status = 'completed' then
    -- Huỷ một đơn ĐÃ chốt ⇒ trả lại đúng phần đã trừ.
    v_ly_do := 'huy';
    v_dau := 1;
  else
    return new;
  end if;

  insert into public.stock_moves (tenant_id, item_id, qty, reason, ref_type, ref_id, note, created_by)
  select ol.tenant_id, ol.item_id, v_dau * ol.qty, v_ly_do, 'order_line', ol.id,
         'Tự động từ đơn ' || new.id, auth.uid()
    from public.order_lines ol
    join public.items i on i.id = ol.item_id
   where ol.order_id = new.id
     and i.kind = 'product'
     and ol.qty <> 0
  on conflict (ref_type, ref_id, reason) where ref_id is not null do nothing;

  return new;
end $$;

create trigger orders_sinh_dong_kho after update of status on public.orders
  for each row execute function public.orders_sinh_dong_kho();

comment on function public.orders_sinh_dong_kho() is
  'ADR-0021 mục 4. Chốt đơn → trừ kho; chốt phiếu hoàn → cộng lại; huỷ đơn đã chốt → trả lại. Chỉ items.kind=product. `on conflict do nothing` + chỉ mục stock_moves_chung_tu_uniq = chống trừ hai lần.';
