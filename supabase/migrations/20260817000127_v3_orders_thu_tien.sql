-- ============================================================
-- iFan.asia — Migration #127: V3 "Tiền thật" việc 2 — `orders` + `order_lines`
-- + `order_payments` + `cash_entries` (ADR-0019, docs/adr/0019-v3-tien-that.md
-- mục 5–7, mục 8 việc 2). Đọc ADR trước khi sửa file này.
--
-- BỐN QUYẾT ĐỊNH ĐÃ CHỐT Ở ADR, KHÔNG PHẢI TỰ CHỌN Ở ĐÂY:
--   · Đơn `completed` thì CSDL KHOÁ dòng hàng (mục 5) — không giao diện khoá.
--   · Tổng đơn KHÔNG lưu cột, tính từ dòng (mục 5).
--   · Hoàn hàng = ĐƠN MỚI kind='return', số lượng ÂM, đơn gốc không đổi (mục 5).
--   · KHÔNG bảng `visits`/`invoices` (mục 4, 7).
--
-- MỘT QUYẾT ĐỊNH KIẾN TRÚC MỚI, giải đúng nợ ADR để lại ("chặn giá vốn ở CSDL
-- — để dành lúc dựng lãi gộp"): kho này CHỈ CÓ MỘT vai Postgres
-- (`authenticated`) cho mọi vai app (owner/admin/manager/staff/viewer) — phân
-- quyền luôn là RLS theo DÒNG qua `app_role()`, KHÔNG có tiền lệ che THEO CỘT.
-- Che một cột (`cost_vnd`) mà vẫn cho đọc các cột khác CÙNG DÒNG không làm
-- được bằng RLS thường. Giải pháp: tách `cost_vnd` ra bảng con RIÊNG
-- (`item_costs`, `order_line_costs`) với RLS SIÊNG chỉ owner/admin/manager
-- đọc được — đúng khuôn hàng rào-theo-dòng đã có khắp kho, không phát minh
-- view/INSTEAD-OF-trigger chưa từng dùng ở đâu trong 90 bảng hiện có.
-- `order_line_costs` KHÔNG có policy ghi cho client — giá vốn chốt lúc bán
-- do TRIGGER (security definer) tự chép từ `item_costs`, không ai gõ tay.
-- ============================================================

-- ---------- 1. items.cost_vnd → item_costs (tách để che theo dòng) ----------
-- Migration #125 tạo cost_vnd ngay trên items, ghi rõ "để dành lúc dựng lãi
-- gộp (task #141)" — ĐÂY là lúc đó. items mới có 4 dòng thật, cost_vnd luôn
-- NULL (cột 4 ngày tuổi, chưa ai từng nhập) — dời bây giờ không mất dữ liệu.

create table public.item_costs (
  item_id uuid primary key references public.items(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cost_vnd bigint check (cost_vnd is null or cost_vnd >= 0),
  updated_at timestamptz not null default now()
);
alter table public.item_costs enable row level security;
-- CHỈ owner/admin/manager — cùng nhóm đã được tin với giá vốn/nhà cung cấp
-- (ADR-0009 mục 7b: "ma trận quyền 34.6 đã tin manager với giá vốn và nhà
-- cung cấp"). staff/viewer không có policy nào ⇒ SELECT trả 0 dòng.
create policy item_costs_rw on public.item_costs for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
create trigger item_costs_touch before update on public.item_costs
  for each row execute function public.touch_updated_at();
revoke all on public.item_costs from anon;

comment on table public.item_costs is
  'ADR-0019 mục 9. Giá vốn TÁCH khỏi items để RLS che theo DÒNG (bảng riêng) — staff/viewer không có policy nào nên không đọc được, kể cả qua JOIN. KHÔNG dòng = "chưa nhập giá vốn", không phải giá vốn = 0.';

alter table public.items drop column cost_vnd;

-- ---------- 2. Cấu hình ngân hàng của TIỆM (ADR mục 6) ----------
-- 3 cột CÙNG có hoặc CÙNG trống — nửa vời (có số TK, thiếu tên chủ TK) là
-- QR sai mà không ai biết cho tới khi khách chuyển nhầm. owner/admin sửa
-- (policy tenants_update có sẵn từ migration #2); MỌI vai đọc (policy
-- tenants_select có sẵn) — số tài khoản in trên QR đưa khách xem, không phải
-- bí mật. KHÔNG nhầm với tài khoản của iFan (master mục 5 việc 2) — đây là
-- tài khoản của TIỆM để KHÁCH trả tiền cho TIỆM.

alter table public.tenants
  add column bank_code text,
  add column bank_account_no text,
  add column bank_account_name text,
  add constraint tenants_bank_all_or_none check (
    (bank_code is null and bank_account_no is null and bank_account_name is null)
    or
    (bank_code is not null and bank_account_no is not null and bank_account_name is not null)
  );

comment on column public.tenants.bank_code is
  'Mã ngân hàng theo chuẩn VietQR/Napas (vd 970422 = MB). Cả 3 cột bank_* cùng có hoặc cùng trống (tenants_bank_all_or_none).';

-- ---------- 3. orders ----------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- 'order' đơn thường · 'return' phiếu hoàn — trỏ NGƯỢC về đơn gốc, KHÔNG
  -- bao giờ sửa đơn gốc (ADR mục 5). parent_order_id chỉ có nghĩa khi return.
  kind text not null default 'order' check (kind in ('order', 'return')),
  parent_order_id uuid references public.orders(id) on delete restrict,
  -- Cả 3 cửa vào (hồ sơ khách/khung chat/lịch hẹn — ADR mục 8 việc 4) đều bắt
  -- đầu TỪ một khách hàng đã biết. Khách vãng lai không hồ sơ CHƯA có đường
  -- ghi ở V3 (nhóm đo được là spa/salon đặt lịch, không phải bán lẻ ẩn danh)
  -- — không tạo cột nullable cho trường hợp chưa ai ghi (D2).
  contact_id uuid not null references public.contacts(id) on delete restrict,
  -- ĐÚNG 4 giá trị (ADR mục 5) — cắt 'fulfilling': chỉ có nghĩa khi giao hàng,
  -- mà ship cắt khỏi V3 (mục 8 bảng CẮT). Không ai sinh ra = D2.
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'completed', 'cancelled')),
  -- Giá trên dòng đã-gồm-thuế hay chưa — lấy từ cài đặt tiệm LÚC TẠO đơn,
  -- chốt luôn (không đọc lại cài đặt sau — cùng lý do chốt price/tax_rate
  -- trên dòng, ADR mục 7).
  price_includes_tax boolean not null default false,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200),
  cancelled_by uuid references auth.users(id) on delete set null,
  -- Cửa vào — biết đơn này bắt đầu từ đâu (khung chat / lịch hẹn), nullable vì
  -- cửa vào thứ 3 (hồ sơ khách) không gắn hội thoại/ca cụ thể nào.
  source_conversation_id uuid references public.conversations(id) on delete set null,
  source_appointment_id uuid references public.appointments(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  -- Bất biến 11: xoá mềm, vào Thùng rác 30 ngày — xem trash_* cuối file.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;
create index orders_tenant_created_idx on public.orders (tenant_id, created_at desc) where deleted_at is null;
create index orders_contact_idx on public.orders (contact_id);
create index orders_parent_idx on public.orders (parent_order_id) where parent_order_id is not null;

-- Pattern B (khuôn appointments, migration #83): owner/admin/manager/viewer
-- thấy CẢ TIỆM; staff chỉ thấy đơn MÌNH TẠO (created_by — đơn có thể gồm
-- nhiều người làm nhiều dòng khác nhau, "ai làm dòng nào" là chuyện của
-- order_lines.performed_by_user_id, không phải phạm vi bảng orders).
create policy orders_select on public.orders for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner', 'admin', 'manager', 'viewer')
              or created_by = (select auth.uid())));
create policy orders_insert on public.orders for insert
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer');
create policy orders_update on public.orders for update
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) <> 'viewer'
         and ((select public.app_role()) in ('owner', 'admin', 'manager')
              or created_by = (select auth.uid())))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner', 'admin', 'manager')
                   or created_by = (select auth.uid())));
-- Xoá CỨNG chỉ owner/admin/manager (khuôn appointments_delete). Đường dùng
-- thật của app là xoá MỀM (deleted_at) qua orders_update ở trên.
create policy orders_delete on public.orders for delete
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'));
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
revoke all on public.orders from anon;

comment on table public.orders is
  'ADR-0019 mục 5. Tổng đơn KHÔNG lưu cột — tính SUM từ order_lines. Đơn completed thì order_lines_lock_guard khoá dòng hàng ở CSDL, không phải giao diện.';

-- ---------- 4. order_lines ----------

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  variant_id uuid references public.item_variants(id) on delete restrict,
  -- "Một lượt khách" = một đơn nhiều dòng, KHÔNG dựng bảng `visits` (ADR mục
  -- 4). Dòng nào sinh từ ca làm nào (nullable — dòng bán hàng hoá không gắn
  -- ca) + ai làm dòng NÀY (khác created_by của đơn — người xử lý thu ngân
  -- không nhất thiết là người làm dịch vụ).
  appointment_id uuid references public.appointments(id) on delete set null,
  performed_by_user_id uuid references auth.users(id) on delete set null,
  -- ÂM cho phiếu hoàn (kind='return' của đơn cha) — ép dấu đúng bằng trigger
  -- order_lines_sign_guard bên dưới, CHECK constraint không với tới bảng khác.
  qty numeric not null default 1 check (qty <> 0),
  -- Giá CHỐT lúc bán — KHÔNG đọc lại items.price_vnd sau đó (ADR mục 5: bảng
  -- giá đổi sau không được sửa ngược vào đơn đã bán, cùng luật đã áp cho
  -- appointments.price_vnd).
  unit_price_vnd bigint not null check (unit_price_vnd >= 0),
  -- Phần giảm giá cả đơn ĐÃ PHÂN BỔ về dòng này theo tỷ lệ tiền — KHÔNG có
  -- cột giảm giá ở đầu đơn (ADR mục 5: lãi gộp tính theo mặt hàng, giảm giá
  -- treo ở đầu đơn làm mọi báo cáo lãi sai lệch một khoản không truy được).
  discount_vnd bigint not null default 0 check (discount_vnd >= 0),
  -- Thuế suất TẠI THỜI ĐIỂM BÁN (ADR mục 7, trả nợ 31.77) — sự thật lịch sử,
  -- không tính lại từ cài đặt hôm nay. Mặc định 0 (item chưa khai thuế).
  tax_rate numeric not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.order_lines enable row level security;
create index order_lines_order_idx on public.order_lines (order_id);
create index order_lines_item_idx on public.order_lines (item_id);
create index order_lines_appointment_idx on public.order_lines (appointment_id) where appointment_id is not null;

create policy order_lines_select on public.order_lines for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner', 'admin', 'manager', 'viewer')
              or exists (
                select 1 from public.orders o
                where o.id = order_lines.order_id and o.created_by = (select auth.uid())
              )));
create policy order_lines_write on public.order_lines for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) <> 'viewer'
         and ((select public.app_role()) in ('owner', 'admin', 'manager')
              or exists (
                select 1 from public.orders o
                where o.id = order_lines.order_id and o.created_by = (select auth.uid())
              )))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner', 'admin', 'manager')
                   or exists (
                     select 1 from public.orders o
                     where o.id = order_lines.order_id and o.created_by = (select auth.uid())
                   )));
revoke all on public.order_lines from anon;

comment on table public.order_lines is
  'ADR-0019 mục 4+5+7. appointment_id/performed_by_user_id thay cho bảng visits. Chốt giá+thuế TẠI THỜI ĐIỂM BÁN. Khoá khi đơn completed (order_lines_lock_guard).';

-- ---------- 5. item_id chỉ nhận item CÒN BÁN được đúng nghĩa 24a ----------
-- (Guard "chỉ item kind=service mới gắn được appointment" đặt ở mục 8 —
-- appointments.item_id đã có guard riêng từ migration #125; ở đây order_lines
-- không giới hạn kind vì MỘT đơn bán CẢ dịch vụ lẫn hàng hoá trong cùng đơn,
-- đúng tinh thần "một lượt khách = một đơn nhiều dòng, không phân biệt loại".)

-- ---------- 6. order_line_costs — giá vốn chốt lúc bán, CHỈ đọc được bởi owner/admin/manager ----------

create table public.order_line_costs (
  order_line_id uuid primary key references public.order_lines(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cost_vnd bigint check (cost_vnd is null or cost_vnd >= 0),
  created_at timestamptz not null default now()
);
alter table public.order_line_costs enable row level security;
create policy order_line_costs_select on public.order_line_costs for select
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'));
-- KHÔNG có policy insert/update/delete cho client — chỉ trigger security
-- definer bên dưới được ghi (bypass RLS vì chạy quyền chủ hàm, đúng khuôn
-- appointments_emit_events). Client cố insert thẳng sẽ bị chặn hoàn toàn.
revoke all on public.order_line_costs from anon, authenticated;
grant select on public.order_line_costs to authenticated; -- RLS lọc dòng thật

comment on table public.order_line_costs is
  'ADR-0019 mục 9. Giá vốn CHỐT lúc bán (snapshot từ item_costs), do trigger order_lines_snapshot_cost tự ghi — không ai gõ tay, không policy ghi cho client. SELECT chỉ owner/admin/manager.';

create or replace function public.order_lines_snapshot_cost() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_cost bigint;
begin
  select cost_vnd into v_cost from public.item_costs where item_id = new.item_id;
  insert into public.order_line_costs (order_line_id, tenant_id, cost_vnd)
    values (new.id, new.tenant_id, v_cost);
  return new;
end $$;

create trigger order_lines_snapshot_cost after insert on public.order_lines
  for each row execute function public.order_lines_snapshot_cost();

-- ---------- 7. order_payments ----------
-- Khuôn subscription_payments (migration #27): provider/provider_ref mặc
-- định 'manual'/uuid ngẫu nhiên (luôn duy nhất) cho tiền mặt; khi có nguồn
-- thật (VietQR có mã giao dịch, sau này API ngân hàng) truyền provider_ref
-- thật ⇒ unique index cho IDEMPOTENT miễn phí, không cần code tự kiểm trùng.

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null check (method in ('cash', 'bank_transfer', 'vietqr')),
  amount_vnd bigint not null check (amount_vnd > 0),
  provider text not null default 'manual' check (provider ~ '^[a-z_]{2,20}$'),
  provider_ref text not null default gen_random_uuid()::text,
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.order_payments enable row level security;
create unique index order_payments_idem on public.order_payments (provider, provider_ref);
create index order_payments_order_idx on public.order_payments (order_id);

create policy order_payments_select on public.order_payments for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner', 'admin', 'manager', 'viewer')
              or exists (
                select 1 from public.orders o
                where o.id = order_payments.order_id and o.created_by = (select auth.uid())
              )));
-- Sổ sách BẤT BIẾN (khuôn stock_moves/commission_entries — ADR mục 5): CHỈ
-- insert. Sửa/xoá một khoản đã thu là sửa chứng từ — không có đường đó.
create policy order_payments_insert on public.order_payments for insert
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer');
revoke all on public.order_payments from anon;

comment on table public.order_payments is
  'ADR-0019 mục 6+9. BẤT BIẾN — chỉ insert, không update/delete. Trigger order_payments_guard chặn thu vượt tổng đơn. Trigger order_payments_emit_cash_entry tự sinh phiếu thu (D1 — không gõ hai lần).';

-- ---------- 8. cash_entries (hợp đồng 24h — sổ, không phải kế toán) ----------

create table public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  amount_vnd bigint not null check (amount_vnd > 0),
  -- "Túi tiền" nào — tiệm nhỏ luôn tách mặt/bank, đối soát theo đúng túi.
  fund text not null default 'cash' check (fund in ('cash', 'bank')),
  -- Đóng — thẻ bấm, không gõ tự do (thẻ design man-thu-chi đã chốt). Bộ giá
  -- trị KHỞI ĐIỂM, chưa theo pack ngành (D2: chưa có màn cấu hình theo pack
  -- thì chưa dựng cột pack_key riêng — mở khi có nhu cầu thật).
  category text not null check (category in (
    'sale', 'refund', 'supplier_payment', 'salary', 'commission',
    'rent', 'utility', 'marketing', 'other_in', 'other_out'
  )),
  note text check (note is null or char_length(note) <= 500),
  -- NULL = ghi tay. Có nguồn = tự vào sổ (thẻ design: "TỰ VÀO SỔ hay GHI TAY
  -- và ai ghi — sổ tiền mà không biết ai ghi thì không ai dám tin").
  order_id uuid references public.orders(id) on delete set null,
  order_payment_id uuid references public.order_payments(id) on delete set null,
  recorded_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.cash_entries enable row level security;
create index cash_entries_tenant_created_idx on public.cash_entries (tenant_id, created_at desc) where deleted_at is null;

-- Sổ quỹ là dữ liệu tài chính CẢ TIỆM — cùng mức nhạy cảm với giá vốn
-- (item_costs ở trên), nên cùng nhóm được đọc: owner/admin/manager. Ghi tay
-- (chi tiền thuê mặt bằng…) cũng chỉ nhóm này — khoản TỰ VÀO SỔ từ thanh
-- toán thì trigger security definer ghi thay, không qua policy này.
create policy cash_entries_rw on public.cash_entries for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));
revoke all on public.cash_entries from anon;

comment on table public.cash_entries is
  'Hợp đồng 24h. KHÔNG định khoản kép — là SỔ, không phải kế toán (giữ nguyên ranh giới 19d). order_payments_emit_cash_entry tự sinh phiếu thu, không gõ hai lần.';

-- ---------- 9. Trigger: khoá dòng hàng khi đơn đã completed/cancelled ----------
-- ADR mục 5 "luật cứng": đơn completed thì CSDL khoá — không giao diện khoá.
-- Áp cho CẢ insert/update/delete trên order_lines (không chỉ update): thêm
-- dòng mới vào một đơn đã completed cũng là sửa chứng từ trong im lặng.

create or replace function public.order_lines_lock_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_order_id uuid;
  v_status text;
begin
  v_order_id := coalesce(new.order_id, old.order_id);
  select status into v_status from public.orders where id = v_order_id;
  if v_status in ('completed', 'cancelled') then
    raise exception 'order_locked: đơn % đã % — sửa sai thì tạo phiếu điều chỉnh mới, không sửa dòng cũ', v_order_id, v_status
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger order_lines_lock_guard before insert or update or delete on public.order_lines
  for each row execute function public.order_lines_lock_guard();

-- ---------- 10. Trigger: dấu số lượng khớp loại đơn (order dương / return âm) ----------

create or replace function public.order_lines_sign_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.orders where id = new.order_id;
  if v_kind = 'return' and new.qty >= 0 then
    raise exception 'Dòng hàng của phiếu hoàn (kind=return) phải có qty ÂM (đơn %)', new.order_id
      using errcode = '23514';
  end if;
  if v_kind = 'order' and new.qty <= 0 then
    raise exception 'Dòng hàng của đơn thường (kind=order) phải có qty DƯƠNG (đơn %)', new.order_id
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger order_lines_sign_guard before insert or update of qty, order_id on public.order_lines
  for each row execute function public.order_lines_sign_guard();

-- ---------- 11. Trigger: chặn thu vượt tổng đơn ----------
-- ADR mục 9 nghiệm thu: "Tổng đã thu > tổng tiền đơn — BỊ CHẶN". Tổng đơn
-- tính SUM từ order_lines (mục 5 — không có cột lưu sẵn).

create or replace function public.order_payments_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_total bigint;
  v_paid bigint;
begin
  select coalesce(sum(qty * unit_price_vnd - discount_vnd), 0) into v_total
    from public.order_lines where order_id = new.order_id;
  select coalesce(sum(amount_vnd), 0) into v_paid
    from public.order_payments where order_id = new.order_id;
  if v_paid + new.amount_vnd > v_total then
    raise exception 'payment_exceeds_order_total: đơn % tổng %đ, đã thu %đ, thu thêm %đ sẽ vượt',
      new.order_id, v_total, v_paid, new.amount_vnd
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger order_payments_guard before insert on public.order_payments
  for each row execute function public.order_payments_guard();

-- ---------- 12. Trigger: thu tiền TỰ sinh phiếu quỹ (D1 — không gõ hai lần) ----------
-- Trực tiếp trong CÙNG transaction với order_payments (không qua domain_events
-- + consumer bất đồng bộ) — bảo đảm ĐÚNG MỘT phiếu quỹ cho mỗi lần thu, không
-- phụ thuộc một job nền có chạy hay không.

create or replace function public.order_payments_emit_cash_entry() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  insert into public.cash_entries
      (tenant_id, direction, amount_vnd, fund, category, order_id, order_payment_id, recorded_by)
    values
      (new.tenant_id, 'in', new.amount_vnd,
       case when new.method = 'cash' then 'cash' else 'bank' end,
       'sale', new.order_id, new.id, new.received_by);
  return new;
end $$;

create trigger order_payments_emit_cash_entry after insert on public.order_payments
  for each row execute function public.order_payments_emit_cash_entry();

-- ---------- 13. Sự kiện (bất biến 12) — ĐÚNG 5, khai ở EVENT_CATALOG.md + master §32 ----------
-- order.created / order.confirmed / order.completed / order.cancelled /
-- payment.received. Không có 'order.returned' riêng — phiếu hoàn đi qua ĐÚNG
-- cùng máy trạng thái, tự phát order.created/confirmed/completed như đơn
-- thường; consumer phân biệt qua payload.kind='return' (tránh phình tập event
-- chỉ để lặp lại thông tin đã có trong payload).

create or replace function public.orders_emit_events() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'kind', new.kind,
    'parent_order_id', new.parent_order_id,
    'contact_id', new.contact_id,
    'created_by', new.created_by);

  if tg_op = 'INSERT' then
    perform public.wf_emit(new.tenant_id, 'order.created', 'order', new.id::text, v_payload);
    return new;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    return new;
  end if;

  if new.status is distinct from old.status and new.status in ('confirmed', 'completed', 'cancelled') then
    perform public.wf_emit(
      new.tenant_id, 'order.' || new.status, 'order', new.id::text,
      case when new.status = 'cancelled'
        then v_payload || jsonb_build_object('cancel_reason', new.cancel_reason, 'cancelled_by', new.cancelled_by)
        else v_payload end);
  end if;
  return new;
end $$;

create trigger orders_emit_events after insert or update on public.orders
  for each row execute function public.orders_emit_events();

create or replace function public.order_payments_emit_event() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  perform public.wf_emit(new.tenant_id, 'payment.received', 'order_payment', new.id::text,
    jsonb_build_object('order_id', new.order_id, 'method', new.method,
                        'amount_vnd', new.amount_vnd, 'received_by', new.received_by));
  return new;
end $$;

create trigger order_payments_emit_event after insert on public.order_payments
  for each row execute function public.order_payments_emit_event();

-- ---------- 14. Thùng rác 30 ngày: nối orders vào hạ tầng dùng chung ----------
-- Bất biến 11 + 13. Chỉ THÊM nhánh 'order' vào 3 hàm sẵn có (đã có nhánh
-- 'appointment' từ migration #83), không đổi hành vi các nhánh khác.

create or replace function public.trash_list(p_limit int default 100)
returns table (
  entity_type text, entity_id uuid, title text, deleted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
begin
  if v_tenant is null or (select public.app_role()) not in ('owner','admin') then
    raise exception 'forbidden';
  end if;
  return query
    select 'contact'::text, c.id, c.full_name, c.deleted_at
      from public.contacts c
      where c.tenant_id = v_tenant and c.deleted_at is not null
    union all
    select 'deal'::text, d.id, d.title, d.deleted_at
      from public.deals d
      where d.tenant_id = v_tenant and d.deleted_at is not null
    union all
    select 'company'::text, co.id, co.name, co.deleted_at
      from public.companies co
      where co.tenant_id = v_tenant and co.deleted_at is not null
    union all
    select 'appointment'::text, a.id,
           ct.full_name || ' — ' ||
           to_char(a.start_at at time zone t.timezone, 'DD/MM HH24:MI'),
           a.deleted_at
      from public.appointments a
      join public.tenants t on t.id = a.tenant_id
      join public.contacts ct on ct.id = a.contact_id
      where a.tenant_id = v_tenant and a.deleted_at is not null
    union all
    -- Tiêu đề đọc được: tên khách + tổng đơn (tính từ dòng, không đọc cột nào)
    -- + kind — chủ tiệm phân biệt được đơn thường với phiếu hoàn trong thùng rác.
    select 'order'::text, o.id,
           ct.full_name || ' — ' ||
           to_char(coalesce(ol.total, 0), 'FM999G999G999') || 'đ' ||
           case when o.kind = 'return' then ' (hoàn)' else '' end,
           o.deleted_at
      from public.orders o
      join public.contacts ct on ct.id = o.contact_id
      left join lateral (
        select sum(qty * unit_price_vnd - discount_vnd) as total
          from public.order_lines where order_id = o.id
      ) ol on true
      where o.tenant_id = v_tenant and o.deleted_at is not null
    order by 4 desc
    limit p_limit;
end;
$$;
revoke execute on function public.trash_list(int) from public, anon;
grant execute on function public.trash_list(int) to authenticated;

create or replace function public.trash_restore(p_entity_type text, p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
begin
  if v_tenant is null or (select public.app_role()) not in ('owner','admin') then
    raise exception 'forbidden';
  end if;
  if p_entity_type = 'contact' then
    update public.contacts set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  elsif p_entity_type = 'deal' then
    update public.deals set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  elsif p_entity_type = 'company' then
    update public.companies set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  elsif p_entity_type = 'appointment' then
    update public.appointments set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  elsif p_entity_type = 'order' then
    update public.orders set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  else
    raise exception 'invalid_entity_type';
  end if;
end;
$$;
revoke execute on function public.trash_restore(text, uuid) from public, anon;
grant execute on function public.trash_restore(text, uuid) to authenticated;

create or replace function public.trash_purge_expired()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.contacts where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.deals where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.companies where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.appointments where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.orders where deleted_at is not null and deleted_at < now() - interval '30 days';
end;
$$;
revoke execute on function public.trash_purge_expired() from public, anon, authenticated;
-- Job 'trash-purge-nightly' đã có từ migration #60 — không đăng ký lại.
