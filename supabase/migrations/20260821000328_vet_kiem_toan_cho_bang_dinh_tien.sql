-- ════════════════════════════════════════════════════════════════════
-- VẾT KIỂM TOÁN CHO CÁC BẢNG DÍNH TIỀN
-- ════════════════════════════════════════════════════════════════════
--
-- ┌─ CHỖ HỞ ĐANG CÓ ──────────────────────────────────────────────────
-- Đo 21/08: bảng `record_audit` đã có sẵn và đã dùng chung được (`tenant_id,
-- entity_type, entity_id, actor_id, action, diff, at`), nhưng CHỈ MỖI bảng
-- `contacts` ghi vào đó. Mọi thao tác sửa/xoá trên tiền — phiếu quỹ, đơn hàng,
-- lượt thanh toán, dòng hàng, phiếu lương, phiếu giảm giá — KHÔNG để lại vết ai
-- làm gì.
--
-- Đây là chỗ hở có hậu quả THẬT ở tiệm, không phải chuyện lý thuyết: tiệm có
-- nhiều người cùng đụng vào quỹ và đơn. Không có vết thì một khoản chi tự nhiên
-- xuất hiện, hoặc một đơn tự nhiên giảm tiền, là không ai truy được — và người
-- bị nghi oan cũng không có gì để tự minh oan.
--
-- ┌─ VÌ SAO KHÔNG GHI CẢ LƯỢT THÊM MỚI Ở MỌI BẢNG ────────────────────
-- Ghi hết thì `order_lines` (52.745 dòng) và `commission_entries` (50.147
-- dòng) sẽ nhân đôi kho chỉ để chép lại thứ chính dòng dữ liệu đã nói. Luật:
--   · Bảng CÓ cột `created_by` (orders, vouchers) — dòng đó đã tự khai người
--     tạo, KHÔNG cần ghi thêm lượt thêm mới.
--   · Bảng KHÔNG có (`cash_entries`, `order_payments`, `payslips`) — PHẢI ghi,
--     vì "ai ghi khoản chi này" đúng là câu hỏi hay phải trả lời nhất.
--   · `order_lines` — KHÔNG ghi lượt thêm mới (mỗi đơn đẻ ra nhiều dòng), nhưng
--     CÓ ghi sửa và xoá: đổi giá một dòng CHÍNH LÀ đổi tiền của đơn.
--
-- ⚠️ KHÔNG gắn vào `commission_entries` và `stock_moves`. Chúng là kết quả TÍNH
--   RA từ đơn hàng; canh cái gốc là đủ, mà chúng lại là hai bảng nặng nhất.
--
-- ⚠️ `actor_id` sẽ là NULL với những lượt ghi do máy chủ tự chạy (việc nền, cầu
--   nối bot). Đó là sự thật, không phải thiếu sót — và ghi null thật thà hơn là
--   gán bừa cho một người nào đó.

/**
 * Chốt vết kiểm toán DÙNG CHUNG.
 *
 * Nhận hai tham số từ trigger:
 *   TG_ARGV[0] — tên loại đối tượng ghi vào `record_audit.entity_type`.
 *   TG_ARGV[1] — 'co' thì ghi cả lượt THÊM MỚI, 'khong' thì bỏ qua.
 *
 * ⚠️ Một hàm dùng chung, KHÔNG chép ra sáu bản. Sáu bản nghĩa là lần sau sửa
 *   luật thì sửa một chỗ và quên năm chỗ — đúng lớp bệnh mà kho này đã dính
 *   nhiều lần với các chốt chéo tiệm.
 */
create or replace function public.ghi_vet_kiem_toan() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_diff jsonb;
  v_action text;
  v_loai text := tg_argv[0];
  v_ghi_them boolean := coalesce(tg_argv[1], 'khong') = 'co';
  -- Cột hệ thống tự đụng — đổi mấy cột này KHÔNG phải "có người sửa".
  v_on text[] := array['updated_at', 'search_text'];
begin
  if tg_op = 'INSERT' then
    if not v_ghi_them then return new; end if;
    insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
      values (new.tenant_id, v_loai, new.id, auth.uid(), 'created', null);
    return new;

  elsif tg_op = 'DELETE' then
    -- ⚠️ Tiệm cha đang bị xoá (dây chuyền) thì KHÔNG ghi vết: dòng nhật ký sẽ
    --   trỏ vào một tiệm không còn tồn tại, và chính nó cũng chết theo tiệm.
    --   Chép nguyên luật này từ chốt của `contacts` — cùng một lý do.
    if not exists (select 1 from public.tenants where id = old.tenant_id) then
      return old;
    end if;
    insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
      values (old.tenant_id, v_loai, old.id, auth.uid(), 'deleted', to_jsonb(old));
    return old;
  end if;

  -- UPDATE: chỉ ghi khi có cột THẬT SỰ đổi.
  select jsonb_object_agg(o.key, jsonb_build_object('from', o.value, 'to', n.value))
    into v_diff
    from jsonb_each(to_jsonb(old)) o
    join jsonb_each(to_jsonb(new)) n using (key)
    where o.value is distinct from n.value
      and o.key <> all(v_on);

  if v_diff is null then return new; end if;

  -- Xoá mềm và khôi phục là hai việc KHÁC HẲN "sửa" — gọi đúng tên để người
  -- đọc nhật ký không phải tự suy ra từ nội dung thay đổi.
  v_action := case
    when to_jsonb(new) ? 'deleted_at'
     and (to_jsonb(new) ->> 'deleted_at') is distinct from (to_jsonb(old) ->> 'deleted_at')
      then case when (to_jsonb(new) ->> 'deleted_at') is not null then 'deleted' else 'restored' end
    else 'updated'
  end;

  insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
    values (new.tenant_id, v_loai, new.id, auth.uid(), v_action, v_diff);
  return new;
end $$;

-- ── Gắn chốt ────────────────────────────────────────────────────────
-- Phiếu quỹ: ghi CẢ lượt thêm mới — "ai ghi khoản chi này" là câu hỏi hay gặp nhất.
drop trigger if exists cash_entries_audit on public.cash_entries;
create trigger cash_entries_audit
  after insert or update or delete on public.cash_entries
  for each row execute function public.ghi_vet_kiem_toan('cash_entry', 'co');

-- Lượt thanh toán của đơn: cũng không có cột người tạo.
drop trigger if exists order_payments_audit on public.order_payments;
create trigger order_payments_audit
  after insert or update or delete on public.order_payments
  for each row execute function public.ghi_vet_kiem_toan('order_payment', 'co');

-- Phiếu lương: ít dòng, và là chỗ nhạy cảm nhất với nhân viên.
drop trigger if exists payslips_audit on public.payslips;
create trigger payslips_audit
  after insert or update or delete on public.payslips
  for each row execute function public.ghi_vet_kiem_toan('payslip', 'co');

-- Đơn hàng: đã có `created_by` nên KHÔNG ghi lượt thêm mới.
drop trigger if exists orders_audit on public.orders;
create trigger orders_audit
  after update or delete on public.orders
  for each row execute function public.ghi_vet_kiem_toan('order', 'khong');

-- Dòng hàng: không ghi lượt thêm mới (mỗi đơn đẻ nhiều dòng), nhưng sửa giá
-- một dòng CHÍNH LÀ đổi tiền của đơn.
drop trigger if exists order_lines_audit on public.order_lines;
create trigger order_lines_audit
  after update or delete on public.order_lines
  for each row execute function public.ghi_vet_kiem_toan('order_line', 'khong');

-- Phiếu giảm giá: ít dòng, đã có `created_by`.
drop trigger if exists vouchers_audit on public.vouchers;
create trigger vouchers_audit
  after update or delete on public.vouchers
  for each row execute function public.ghi_vet_kiem_toan('voucher', 'khong');

comment on function public.ghi_vet_kiem_toan() is
  'Chốt vết kiểm toán dùng chung cho các bảng dính tiền. MỘT hàm cho mọi bảng — sáu bản chép nghĩa là lần sau sửa luật thì sửa một chỗ và quên năm chỗ. Tham số: loại đối tượng, và có ghi lượt thêm mới hay không — #328.';
