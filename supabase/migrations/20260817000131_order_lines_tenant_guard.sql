-- ============================================================
-- iFan.asia — Migration #129: chặn order_lines gắn mặt hàng CỦA TIỆM KHÁC.
--
-- Bắt được khi viết ca D3 mục 9 ADR-0019 vào rls-smoke.mjs (task #144, đo
-- THẬT chứ không đoán từ tên cột): `order_lines.item_id`/`variant_id` chỉ là
-- FK PHẲNG tới `items(id)`/`item_variants(id)` — không tự nhiên kiểm "item đó
-- có cùng tiệm với đơn hay không". RLS `order_lines_write` chỉ kiểm
-- `order_lines.tenant_id = current_tenant_id()`, KHÔNG kiểm tenant_id của
-- item được trỏ tới. Trước migration này: một dòng hàng của tiệm A CÓ THỂ
-- trỏ vào mặt hàng của tiệm B — tiệm A "bán" được hàng của tiệm B, giá/tên
-- hàng của tiệm B rò rỉ ra qua join, và báo cáo lãi gộp tiệm A cộng nhầm giá
-- vốn của tiệm B.
--
-- Cùng khuôn `appointments_item_kind_guard` (migration #125) — trigger kiểm
-- tại CSDL, không phải giao diện (bất biến 1).
--
-- Ghi vào task #149 (rà soát is_sample=true và các lỗ hổng liên quan): đây
-- LÀ một ví dụ cụ thể của lớp lỗi "thiếu kiểm tenant chéo qua FK phẳng" —
-- CHƯA rà hết 90 bảng xem còn chỗ nào khác (vd contacts.company_id,
-- orders.contact_id) có cùng lớp lỗi này hay không. Task #149 vẫn mở cho
-- việc rà toàn diện đó — migration này chỉ vá ĐÚNG chỗ đo được.
-- ============================================================

create or replace function public.order_lines_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_item_tenant uuid;
  v_variant_tenant uuid;
begin
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

create trigger order_lines_tenant_guard before insert or update of item_id, variant_id, tenant_id
  on public.order_lines
  for each row execute function public.order_lines_tenant_guard();

comment on function public.order_lines_tenant_guard() is
  'ADR-0019 mục 9 ca 2 (task #144). Chặn order_lines trỏ vào item/variant của tiệm khác — FK phẳng không tự kiểm tenant, phải thêm trigger.';
