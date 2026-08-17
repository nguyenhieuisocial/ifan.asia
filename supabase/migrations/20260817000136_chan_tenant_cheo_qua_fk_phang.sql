-- ============================================================
-- iFan.asia — Migration #136: chặn tenant chéo qua FK phẳng — đợt rà toàn
-- diện việc #149 (ADR-0019 mục 9 ca 2 đã vá 1 ví dụ ở migration #131,
-- migration này vá NỐT các chỗ còn lại đã đo được thật).
--
-- CÁCH RÀ: liệt kê toàn bộ 63 quan hệ khoá ngoại giữa 2 bảng tenant-scoped
-- (không phải qua tenant_id) trên CSDL thật, chia 4 mảng (CRM, Hộp thư,
-- Lịch hẹn/Đơn hàng, Workflow/khác), cho 4 agent độc lập rà — mỗi agent đọc
-- từng Server Action ghi vào cột đó, đối chiếu RLS `WITH CHECK`, và với ca
-- nghi ngờ thì TỰ TEST THẬT (insert cross-tenant trong transaction rồi
-- rollback). Sau đó tự tay kiểm lại 7 ca quan trọng nhất bằng script test
-- trực tiếp (không tin báo cáo suông) — CẢ 7 đều xác nhận là lỗ THẬT.
--
-- KẾT QUẢ: 51/63 quan hệ AN TOÀN (đi qua RPC `security definer` tự tra
-- tenant, hoặc Server Action select-trước-dùng-lại, hoặc RLS/GRANT đã chặn
-- ghi trực tiếp). 12/63 quan hệ là LỖ THẬT — cùng lớp lỗi với order_lines
-- đã vá ở migration #131 (Server Action nhận ID thẳng từ client, insert
-- không kiểm tenant, RLS `WITH CHECK` chỉ kiểm `tenant_id` của chính dòng
-- đang ghi chứ không kiểm tenant của dòng được TRỎ TỚI):
--
--   contacts.company_id -> companies.id
--   contacts.source_id -> lead_sources.id
--   deals.contact_id -> contacts.id
--   appointments.contact_id -> contacts.id
--   appointments.item_id -> items.id      (trigger cũ chỉ kiểm kind, không kiểm tenant)
--   appointments.resource_id -> resources.id
--   orders.contact_id -> contacts.id
--   orders.source_conversation_id -> conversations.id
--   orders.source_appointment_id -> appointments.id
--   order_lines.order_id -> orders.id     (migration #131 chỉ vá item_id/variant_id, BỎ SÓT order_id)
--   order_payments.order_id -> orders.id
--   item_variants.item_id -> items.id     (trigger cũ chỉ kiểm kind, không kiểm tenant)
--
-- NẶNG NHẤT VỀ TIỀN: order_lines.order_id và order_payments.order_id —
-- order_payments_guard tính tổng "đã thu" bằng SUM(order_lines)/SUM(order_
-- payments) theo order_id, KHÔNG lọc tenant_id. Một dòng hàng/khoản thu giả
-- của tiệm A trỏ vào order_id của tiệm B sẽ cộng thẳng vào tổng tiền đơn
-- THẬT của tiệm B, phá luôn chốt "không thu vượt tổng đơn" của tiệm B.
--
-- VÁ: thêm trigger `*_tenant_guard` cho từng bảng (đúng khuôn
-- `order_lines_tenant_guard`, migration #131) — bảng nào đã có trigger tên
-- khác (appointments_item_kind_guard kiểm KIND, không kiểm TENANT) thì
-- thêm trigger MỚI cạnh, không sửa trigger cũ (mỗi trigger một việc, đúng
-- khuôn đã có trong file này từ trước). order_lines_tenant_guard đã có sẵn
-- thì MỞ RỘNG thân hàm để kiểm thêm order_id, thêm order_id vào cột theo
-- dõi của trigger.
--
-- KHÔNG vá (đã xác nhận AN TOÀN, không phải phỏng đoán): orders.parent_
-- order_id, order_line_costs.order_line_id, cash_entries.order_id/order_
-- payment_id, item_costs.item_id — 5 quan hệ này đi qua đường select-trước
-- -dùng-lại hoặc RLS/GRANT đã chặn ghi trực tiếp, thêm trigger ở đây là
-- speculative (vi phạm D2 — không thêm chốt cho chỗ chưa đo thấy hở).
-- ============================================================

-- ---------- 1. contacts: company_id + source_id ----------

create or replace function public.contacts_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.company_id is not null then
    select tenant_id into v_tenant from public.companies where id = new.company_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'contacts.company_id phải cùng tiệm với khách (company % thuộc tiệm khác)', new.company_id
        using errcode = '23514';
    end if;
  end if;

  if new.source_id is not null then
    select tenant_id into v_tenant from public.lead_sources where id = new.source_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'contacts.source_id phải cùng tiệm với khách (nguồn % thuộc tiệm khác)', new.source_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger contacts_tenant_guard before insert or update of company_id, source_id, tenant_id
  on public.contacts
  for each row execute function public.contacts_tenant_guard();

comment on function public.contacts_tenant_guard() is
  'Task #149 (rà toàn diện, đợt sau migration #131). Chặn contacts.company_id/source_id trỏ vào công ty/nguồn khách của tiệm khác.';

-- ---------- 2. deals: contact_id ----------

create or replace function public.deals_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.contact_id is not null then
    select tenant_id into v_tenant from public.contacts where id = new.contact_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'deals.contact_id phải cùng tiệm với cơ hội (khách % thuộc tiệm khác)', new.contact_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger deals_tenant_guard before insert or update of contact_id, tenant_id
  on public.deals
  for each row execute function public.deals_tenant_guard();

comment on function public.deals_tenant_guard() is
  'Task #149. Chặn deals.contact_id trỏ vào khách của tiệm khác — lộ tên/SĐT/email khách qua trang chi tiết cơ hội.';

-- ---------- 3. appointments: contact_id + item_id + resource_id ----------
-- (cạnh trigger cũ appointments_item_kind_guard — trigger đó CHỈ kiểm
-- items.kind='service', không kiểm tenant; giữ nguyên, thêm trigger mới.)

create or replace function public.appointments_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.contact_id is not null then
    select tenant_id into v_tenant from public.contacts where id = new.contact_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'appointments.contact_id phải cùng tiệm với lịch hẹn (khách % thuộc tiệm khác)', new.contact_id
        using errcode = '23514';
    end if;
  end if;

  if new.item_id is not null then
    select tenant_id into v_tenant from public.items where id = new.item_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'appointments.item_id phải cùng tiệm với lịch hẹn (dịch vụ % thuộc tiệm khác)', new.item_id
        using errcode = '23514';
    end if;
  end if;

  if new.resource_id is not null then
    select tenant_id into v_tenant from public.resources where id = new.resource_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'appointments.resource_id phải cùng tiệm với lịch hẹn (tài nguyên % thuộc tiệm khác)', new.resource_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger appointments_tenant_guard before insert or update of contact_id, item_id, resource_id, tenant_id
  on public.appointments
  for each row execute function public.appointments_tenant_guard();

comment on function public.appointments_tenant_guard() is
  'Task #149. Chặn lịch hẹn trỏ vào khách/dịch vụ/tài nguyên của tiệm khác — khác appointments_item_kind_guard (chỉ kiểm kind, không kiểm tenant).';

-- ---------- 4. orders: contact_id + source_conversation_id + source_appointment_id ----------
-- (orders.parent_order_id KHÔNG vá — đã xác nhận an toàn qua select-trước-
-- dùng-lại trong createReturn().)

create or replace function public.orders_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.contact_id is not null then
    select tenant_id into v_tenant from public.contacts where id = new.contact_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'orders.contact_id phải cùng tiệm với đơn (khách % thuộc tiệm khác)', new.contact_id
        using errcode = '23514';
    end if;
  end if;

  if new.source_conversation_id is not null then
    select tenant_id into v_tenant from public.conversations where id = new.source_conversation_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'orders.source_conversation_id phải cùng tiệm với đơn (hội thoại % thuộc tiệm khác)', new.source_conversation_id
        using errcode = '23514';
    end if;
  end if;

  if new.source_appointment_id is not null then
    select tenant_id into v_tenant from public.appointments where id = new.source_appointment_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'orders.source_appointment_id phải cùng tiệm với đơn (lịch hẹn % thuộc tiệm khác)', new.source_appointment_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger orders_tenant_guard before insert or update of contact_id, source_conversation_id, source_appointment_id, tenant_id
  on public.orders
  for each row execute function public.orders_tenant_guard();

comment on function public.orders_tenant_guard() is
  'Task #149. Chặn orders.contact_id/source_conversation_id/source_appointment_id trỏ sang tiệm khác — lộ dữ liệu qua Thùng rác/join, hoặc trash_list() (security definer, bỏ qua RLS).';

-- ---------- 5. order_lines: MỞ RỘNG trigger cũ, thêm order_id ----------
-- Migration #131 chỉ kiểm item_id/variant_id, BỎ SÓT order_id — đây là lỗ
-- nặng nhất về tiền (order_payments_guard tính tổng theo order_id, không
-- lọc tenant).

create or replace function public.order_lines_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_order_tenant uuid;
  v_item_tenant uuid;
  v_variant_tenant uuid;
begin
  select tenant_id into v_order_tenant from public.orders where id = new.order_id;
  if v_order_tenant is distinct from new.tenant_id then
    raise exception 'order_lines.order_id phải cùng tiệm với dòng hàng (đơn % thuộc tiệm khác)', new.order_id
      using errcode = '23514';
  end if;

  select tenant_id into v_item_tenant from public.items where id = new.item_id;
  if v_item_tenant is distinct from new.tenant_id then
    raise exception 'order_lines.item_id phải cùng tiệm với đơn (item % thuộc tiệm khác)', new.item_id
      using errcode = '23514';
  end if;

  if new.variant_id is not null then
    select tenant_id into v_variant_tenant from public.item_variants where id = new.variant_id;
    if v_variant_tenant is distinct from new.tenant_id then
      raise exception 'order_lines.variant_id phải cùng tiệm với đơn (variant % thuộc tiệm khác)', new.variant_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists order_lines_tenant_guard on public.order_lines;
create trigger order_lines_tenant_guard before insert or update of order_id, item_id, variant_id, tenant_id
  on public.order_lines
  for each row execute function public.order_lines_tenant_guard();

comment on function public.order_lines_tenant_guard() is
  'ADR-0019 mục 9 ca 2 (task #144), MỞ RỘNG ở task #149: bản gốc (migration #131) chỉ kiểm item_id/variant_id, bỏ sót order_id — lỗ nặng nhất về tiền vì order_payments_guard tính tổng đơn theo order_id không lọc tenant.';

-- ---------- 6. order_payments: order_id ----------

create or replace function public.order_payments_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.orders where id = new.order_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'order_payments.order_id phải cùng tiệm với khoản thu (đơn % thuộc tiệm khác)', new.order_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger order_payments_tenant_guard before insert or update of order_id, tenant_id
  on public.order_payments
  for each row execute function public.order_payments_tenant_guard();

comment on function public.order_payments_tenant_guard() is
  'Task #149. Chặn order_payments.order_id trỏ sang đơn của tiệm khác — cùng lớp lỗi nặng về tiền với order_lines.order_id.';

-- ---------- 7. item_variants: item_id ----------
-- (cạnh trigger cũ item_variants_kind_guard — chỉ kiểm items.kind='product'.)

create or replace function public.item_variants_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.items where id = new.item_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'item_variants.item_id phải cùng tiệm với biến thể (mặt hàng % thuộc tiệm khác)', new.item_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger item_variants_tenant_guard before insert or update of item_id, tenant_id
  on public.item_variants
  for each row execute function public.item_variants_tenant_guard();

comment on function public.item_variants_tenant_guard() is
  'Task #149. Chặn item_variants.item_id trỏ vào mặt hàng của tiệm khác — khác item_variants_kind_guard (chỉ kiểm kind, không kiểm tenant).';
