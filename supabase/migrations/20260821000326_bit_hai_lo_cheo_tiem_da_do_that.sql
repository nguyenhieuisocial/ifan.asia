-- ════════════════════════════════════════════════════════════════════
-- BỊT HAI LỖ CHÉO TIỆM — ĐÃ ĐO THẬT, KHÔNG ĐOÁN
-- ════════════════════════════════════════════════════════════════════
--
-- Đợt rà thứ TƯ của cùng một lớp bệnh (#131 → #136 → #204 → #205 → bản này).
-- Bảng con chỉ kiểm `tenant_id` của CHÍNH DÒNG NÓ, không kiểm bản ghi CHA có
-- cùng tiệm không. Người tiệm A ghi dòng mang `tenant_id = A` nhưng khoá ngoại
-- trỏ sang bản ghi tiệm B — RLS thấy `tenant_id` khớp nên cho qua.
--
-- ┌─ ĐO NGÀY 21/08 bằng `scripts/do-canh-cheo-tiem.mjs` ──────────────
-- 10 cạnh cổng `soat-canh-cheo-tiem` báo "chưa có chốt", thử ghi thật trong
-- giao dịch rồi rollback, đóng vai `authenticated` của tiệm A:
--
--     LỌT 2  ·  CHẶN 5  ·  chưa đo được 3
--
-- ⚠️ "Chưa có chốt" KHÔNG đồng nghĩa "có lỗ": 5 cạnh đã bị RLS/quyền chặn sẵn.
--   Và ngược lại — "ghi hỏng" KHÔNG đồng nghĩa "đã chặn". Lượt đo đầu báo 7
--   CHẶN, nhưng 2 trong số đó hỏng vì lý do KHÁC (ràng buộc `category`, và đơn
--   đã `completed` nên vướng `order_locked`). Siết lại phép đo — chỉ nhận
--   42501 hoặc 23514 có chữ "tiệm" là bằng chứng — thì một trong hai cái đó
--   hiện nguyên hình là LỖ. Bài học: đọc MÃ LỖI, đừng đọc "có lỗi hay không".
--
-- ┌─ HAI LỖ, VÀ THIỆT HẠI THẬT CỦA CHÚNG ─────────────────────────────
-- 1. `order_lines.performed_by_employee_id` — ĐÂY LÀ LỖ DÍNH TIỀN. Dòng hàng
--    của tiệm A ghi được người thực hiện là NHÂN VIÊN TIỆM B. Hệ quả: tên thợ
--    tiệm khác hiện trên đơn, và bảng hoa hồng/lương tính cho người không thuộc
--    tiệm mình. Cùng lớp với lỗ LỘ LƯƠNG mà #205 đã phải vá.
--
-- 2. `contacts.referred_by_contact_id` — khách của tiệm A khai được "người giới
--    thiệu" là KHÁCH TIỆM B. Hệ quả: tên và thông tin khách của tiệm khác lộ
--    qua màn giới thiệu, và điểm thưởng giới thiệu chảy sai chỗ.
--
-- ⚠️ NỐI VÀO CHỐT SẴN CÓ, không dựng chốt thứ hai. Cả hai bảng ĐÃ có
--   `*_tenant_guard` — chúng chỉ chưa canh đúng hai cột này. Dựng thêm một
--   trigger cùng việc là chia luật ra hai nơi, và lần sau sửa một nơi quên nơi
--   kia.

-- ── 1. order_lines: thêm phép kiểm người thực hiện ──────────────────
create or replace function public.order_lines_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_order_tenant uuid;
  v_item_tenant uuid;
  v_variant_tenant uuid;
  v_emp_tenant uuid;
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

  -- MỚI (#326): người thực hiện phải là thợ CỦA TIỆM NÀY.
  if new.performed_by_employee_id is not null then
    select tenant_id into v_emp_tenant from public.employees where id = new.performed_by_employee_id;
    if v_emp_tenant is distinct from new.tenant_id then
      raise exception 'order_lines.performed_by_employee_id phải cùng tiệm với đơn (nhân viên % thuộc tiệm khác)', new.performed_by_employee_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

-- ⚠️ PHẢI khai lại danh sách cột của trigger: `create or replace function` KHÔNG
--   đụng tới trigger, mà trigger cũ chỉ nổ khi `order_id, item_id, variant_id,
--   tenant_id` đổi. Sửa mỗi thân hàm thì phép kiểm mới nằm im mỗi lần người ta
--   chỉ đổi cột người thực hiện — đúng thao tác thường gặp nhất khi gán thợ.
drop trigger if exists order_lines_tenant_guard on public.order_lines;
create trigger order_lines_tenant_guard
  before insert or update of order_id, item_id, variant_id, performed_by_employee_id, tenant_id
  on public.order_lines
  for each row execute function public.order_lines_tenant_guard();

-- ── 2. contacts: thêm phép kiểm người giới thiệu ────────────────────
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

  -- MỚI (#326): người giới thiệu phải là khách CỦA TIỆM NÀY.
  if new.referred_by_contact_id is not null then
    select tenant_id into v_tenant from public.contacts where id = new.referred_by_contact_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'contacts.referred_by_contact_id phải cùng tiệm với khách (người giới thiệu % thuộc tiệm khác)', new.referred_by_contact_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists contacts_tenant_guard on public.contacts;
create trigger contacts_tenant_guard
  before insert or update of company_id, source_id, referred_by_contact_id, tenant_id
  on public.contacts
  for each row execute function public.contacts_tenant_guard();
