-- ============================================================
-- HAI MƯƠI SÁU CHỐT CHẶN CHÉO TIỆM — 10 mảng dựng SAU đợt rà #136
--
-- ═══════════════════════════════════════════════════════════════════
-- LỚP BỆNH (nhắc lại cho bản sau đọc được một mình)
-- ═══════════════════════════════════════════════════════════════════
-- Bảng con chỉ kiểm `tenant_id` của CHÍNH DÒNG NÓ, không kiểm bản ghi CHA có
-- cùng tiệm hay không. Người tiệm A ghi một dòng mang `tenant_id = A` nhưng
-- khoá ngoại trỏ sang bản ghi của tiệm B — RLS thấy `tenant_id` khớp nên cho
-- qua. Đây là đợt rà thứ ba của cùng lớp bệnh: #131 (1 cạnh) → #136 (12 cạnh)
-- → #204 (4 cạnh, mảng Hợp đồng) → bản này (26 cạnh, 10 mảng còn lại).
--
-- ═══════════════════════════════════════════════════════════════════
-- ĐÃ ĐO, KHÔNG ĐOÁN — 41 cạnh thử ghi thật, 26 LỌT / 15 CHẶN
-- ═══════════════════════════════════════════════════════════════════
-- Quét lại toàn bộ khoá ngoại MỘT CỘT giữa hai bảng ĐỀU CÓ `tenant_id`, đối
-- chiếu với chốt đang có (đọc `pg_trigger`, KHÔNG chép tay), rồi chia theo mốc
-- #136 (17/08). Số ĐO ĐƯỢC ngày 20/08, khác số ghi trong #204 — ghi cả hai để
-- ai đọc sau còn đối chiếu được thay vì tưởng một bên gõ nhầm:
--
--            #204 ghi        đo lại 20/08     vì sao lệch
--   tổng      108              110           #204 đếm thiếu 2 cạnh
--   có chốt    24               18           #204 đếm theo BẢNG có trigger,
--                                            bản này đếm theo CỘT thật sự
--                                            nằm trong `tgattr` của trigger
--   sau #136   40               45           #204 bỏ sót mảng Chat nội bộ
--                                            (#169) và Việc/Dự án (#168)
--
-- Trừ 4 cạnh #204 vừa vá ⇒ 41 cạnh phải đo. Mỗi cạnh dựng hai tiệm trong MỘT
-- giao dịch, đóng vai `authenticated` bằng `request.jwt.claims`, ghi dòng con
-- của tiệm A trỏ sang bản ghi cha của tiệm B, rồi rollback. Mỗi khẳng định một
-- SAVEPOINT riêng — không có nó thì một lệnh hỏng làm hỏng cả giao dịch và mọi
-- lệnh sau báo "bị chặn" GIẢ (bẫy này đã làm hỏng một phép đo thật hôm nay).
--
-- ⚠️ LUẬT QUAN TRỌNG NHẤT, giữ nguyên từ #204: **"chưa có chốt" KHÔNG đồng
-- nghĩa "có lỗ"**. 15/41 cạnh CHẶN sẵn, và không cạnh nào trong số đó được thêm
-- trigger ở đây. Rải chốt cho chỗ chưa đo là trả phí ghi vĩnh viễn cho một lỗ
-- không tồn tại, và làm loãng ý nghĩa của chính lớp chốt này.
--
-- 15 CẠNH CHẶN SẴN — ghi rõ CÁI GÌ đang giữ, vì biết ai giữ mới biết chỗ nào trống:
--   · RLS không có policy INSERT nào (client ghi thẳng là bị từ chối; đường ghi
--     thật đi qua hàm `security definer` tự tra tiệm):
--       voucher_redemptions.voucher_id / .contact_id / .order_id
--       loyalty_ledger.contact_id / .order_id
--       discount_approvals.order_id / .order_line_id
--       webhook_deliveries.endpoint_id
--   · Policy tự kiểm quan hệ, không cần trigger:
--       attendance_punches.employee_id, leave_requests.employee_id
--         → `employee_id in (select id from employees where user_id = auth.uid())`
--       internal_messages.thread_id
--         → `exists (select 1 from internal_threads t where t.id = thread_id)`,
--           mà `internal_threads` có RLS ⇒ luồng tiệm khác vô hình
--       internal_mentions.message_id
--         → đòi `m.sender_user_id = auth.uid()`
--   · Trigger có sẵn nhưng KHÔNG mang tên `*_tenant_guard` (nên phép quét theo
--     tên đã suýt xếp nhầm chúng vào nhóm "chưa có chốt"):
--       task_blocks.blocker_id / .blocked_id  → `task_blocks_mot_tang` (#168)
--       campaign_send_recipients.contact_id   → `campaign_recipient_guard` (#171)
--   ⇒ Bài học cho cổng soát: **đừng nhận diện chốt bằng TÊN trigger.** Cổng
--     `scripts/soat-canh-cheo-tiem.mjs` đọc THÂN hàm trigger, không đọc tên.
--
-- ═══════════════════════════════════════════════════════════════════
-- HẬU QUẢ — đo thật, không suy luận
-- ═══════════════════════════════════════════════════════════════════
-- Cạnh lọt mà không đụng được gì thì hại khác hẳn cạnh làm sai sổ tiền. Nên
-- năm cạnh nặng nhất được đo tiếp: A ghi chèn xong thì B còn làm được việc của
-- mình không. Chỗ đau nằm ở chỉ mục DUY NHẤT không có `tenant_id` — chúng khoá
-- theo id của bản ghi CHA, nên một dòng của tiệm A CHIẾM CHỖ vĩnh viễn của B:
--
--   ① `payslips_mot_ky_mot_nguoi (period_id, employee_id)` — NẶNG NHẤT.
--      A ghi phiếu lương `tenant_id = A` trên KỲ LƯƠNG + NHÂN VIÊN của B  => LỌT
--      B chạy bảng lương (upsert on conflict period_id, employee_id)      => phiếu
--        rơi vào ĐÚNG DÒNG CỦA TIỆM A, `gross_vnd = 5.000.000` của nhân viên B
--        ghi thẳng vào bản ghi mà A đọc được.
--      Tức là không chỉ phá bảng lương của B — nó LỘ LƯƠNG. Trái thẳng thẻ
--      thiết kế "quản lý không được xem lương người khác" (ngoại lệ so với cả
--      kho), và người xem ở đây còn không cùng công ty.
--   ② `commission_mot_dong_mot_nguoi (order_line_id, employee_id)`
--      A ghi hoa hồng 1đ trỏ vào dòng hàng + nhân viên của B              => LỌT
--      B ghi khoản hoa hồng THẬT 50.000đ cho chính nhân viên mình         => BỊ CHẶN
--        (`23505 duplicate key`) — ĐỐI CHỨNG: khi chưa ai chiếm thì B ghi được.
--      ⇒ 1đ của người ngoài TRIỆT TIÊU hoa hồng thật của nhân viên tiệm B.
--   ③ `satisfaction_surveys_appointment_unique (appointment_id)`
--      A chiếm chỗ đánh giá trên lịch hẹn của B ⇒ B KHÔNG BAO GIỜ tạo được
--      phiếu đánh giá thật cho lịch hẹn của chính mình.
--   ④ `stocktake_lines (stocktake_id, item_id)`
--      A chiếm một dòng đếm ⇒ B không đếm được mặt hàng đó trong phiếu kiểm kê
--      của chính mình ⇒ phiếu kiểm kê thiếu dòng mà không ai biết vì sao.
--   ⑤ `campaign_summary_pkey (campaign_id)`
--      A ghi tổng kết cho chiến dịch của B ⇒ B không tổng kết được chiến dịch
--      của mình, và số liệu B nhìn thấy là số do người ngoài đặt.
--
-- Các cạnh còn lại nhẹ hơn (ghi rác vào sổ của mình, trỏ vào bản ghi tiệm khác
-- mà RLS vẫn che khi đọc) nhưng cùng một lớp bệnh nên vá cùng một khuôn — để
-- đợt rà sau không phải phân loại lại từ đầu.
--
-- ═══════════════════════════════════════════════════════════════════
-- DỮ LIỆU ĐANG CÓ — tự đo TRƯỚC khi áp, không tin con số ai chép
-- ═══════════════════════════════════════════════════════════════════
-- Đếm dòng vi phạm sẵn trên cả 26 cạnh (left join bảng cha, so `tenant_id`):
--   **0 dòng lệch / tổng 97 dòng đang có** (stock_moves 88 · purchase_lines 4×2
--   · purchases 1, các bảng còn lại 0 dòng).
-- ⇒ Không chốt nào đụng phải dòng cũ. Vá bây giờ là chặn trước, không phải dọn.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO TRIGGER, KHÔNG PHẢI KHOÁ NGOẠI GHÉP
-- ═══════════════════════════════════════════════════════════════════
-- Khoá ngoại ghép `(tenant_id, cha_id)` cần thêm khoá DUY NHẤT `(tenant_id, id)`
-- trên TỪNG bảng cha — tức 19 chỉ mục thừa, trả phí mỗi lần ghi mãi mãi. Nặng
-- hơn: nó dựng CƠ CHẾ THỨ HAI cho cùng một luật, khiến mọi đợt rà sau phải nhớ
-- tìm cả hai hình dạng. Kho đã có đúng MỘT khuôn (`*_tenant_guard`, #131/#136/
-- #204) — bản này chép nguyên khuôn đó, không phát minh khuôn mới.
--
-- BẢNG NÀO ĐÃ CÓ TRIGGER TÊN KHÁC thì thêm trigger MỚI cạnh nó, không sửa
-- trigger cũ (`stock_moves_immutable_guard`, `purchase_lines_lock_guard`,
-- `stocktake_lines_lock_guard`, `payslips_locked`, `payslip_lines_locked`) —
-- mỗi trigger một việc, đúng lựa chọn #136 đã ghi lý do.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÀ MỘT CỔNG CANH, để đây là đợt rà CUỐI của lớp bệnh này
-- ═══════════════════════════════════════════════════════════════════
-- #136 là đợt rà MỘT LẦN, không để lại cổng nào — nên 10 mảng dựng sau nó đều
-- bắt đầu lại từ số không và không có gì báo. Đó chính là lý do có 26 lỗ này.
-- Bản vá đi kèm `scripts/soat-canh-cheo-tiem.mjs` (cắm vào CI): nó tự liệt kê
-- mọi cạnh, tự đọc chốt từ CSDL, và ĐỎ với cạnh chưa chốt mà chưa khai miễn trừ.
-- ============================================================

-- ---------- 1. commission_entries: employee_id + order_id + order_line_id + contract_id ----------
-- Cạnh nặng thứ hai của cả đợt (hậu quả ② ở trên).

create or replace function public.commission_entries_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.employee_id is not null then
    select tenant_id into v_tenant from public.employees where id = new.employee_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'commission_entries.employee_id phải cùng tiệm với khoản hoa hồng (nhân viên % thuộc tiệm khác)', new.employee_id
        using errcode = '23514';
    end if;
  end if;

  if new.order_id is not null then
    select tenant_id into v_tenant from public.orders where id = new.order_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'commission_entries.order_id phải cùng tiệm với khoản hoa hồng (đơn % thuộc tiệm khác)', new.order_id
        using errcode = '23514';
    end if;
  end if;

  if new.order_line_id is not null then
    select tenant_id into v_tenant from public.order_lines where id = new.order_line_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'commission_entries.order_line_id phải cùng tiệm với khoản hoa hồng (dòng hàng % thuộc tiệm khác)', new.order_line_id
        using errcode = '23514';
    end if;
  end if;

  if new.contract_id is not null then
    select tenant_id into v_tenant from public.contracts where id = new.contract_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'commission_entries.contract_id phải cùng tiệm với khoản hoa hồng (hợp đồng % thuộc tiệm khác)', new.contract_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger commission_entries_tenant_guard
  before insert or update of employee_id, order_id, order_line_id, contract_id, tenant_id
  on public.commission_entries
  for each row execute function public.commission_entries_tenant_guard();

comment on function public.commission_entries_tenant_guard() is
  'Chặn khoản hoa hồng trỏ vào nhân viên/đơn/dòng hàng/hợp đồng của tiệm khác. Đo 20/08: chỉ mục duy nhất `commission_mot_dong_mot_nguoi` KHÔNG có tenant_id, nên một khoản 1đ của tiệm A chiếm chỗ (order_line_id, employee_id) làm khoản hoa hồng THẬT 50.000đ của tiệm B bị từ chối (23505). Khuôn *_tenant_guard của #131/#136/#204 (#205).';

-- ---------- 2. payslips: employee_id + period_id ----------
-- CẠNH NẶNG NHẤT CỦA CẢ ĐỢT (hậu quả ① ở trên): nó làm LỘ LƯƠNG sang tiệm khác.

create or replace function public.payslips_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.employees where id = new.employee_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'payslips.employee_id phải cùng tiệm với phiếu lương (nhân viên % thuộc tiệm khác)', new.employee_id
      using errcode = '23514';
  end if;

  select tenant_id into v_tenant from public.payroll_periods where id = new.period_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'payslips.period_id phải cùng tiệm với phiếu lương (kỳ lương % thuộc tiệm khác)', new.period_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger payslips_tenant_guard
  before insert or update of employee_id, period_id, tenant_id
  on public.payslips
  for each row execute function public.payslips_tenant_guard();

comment on function public.payslips_tenant_guard() is
  'Chặn phiếu lương trỏ vào nhân viên / kỳ lương của tiệm khác. Đo 20/08 — nặng nhất cả đợt: chỉ mục `payslips_mot_ky_mot_nguoi (period_id, employee_id)` không có tenant_id, nên phiếu chiếm chỗ của tiệm A hứng trọn lượt upsert bảng lương của tiệm B ⇒ lương thật 5.000.000đ của nhân viên B ghi vào dòng tiệm A ĐỌC ĐƯỢC. Trái thẻ "quản lý không xem lương người khác" (#205).';

-- ---------- 3. payslip_lines: payslip_id ----------

create or replace function public.payslip_lines_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.payslips where id = new.payslip_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'payslip_lines.payslip_id phải cùng tiệm với dòng lương (phiếu % thuộc tiệm khác)', new.payslip_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger payslip_lines_tenant_guard
  before insert or update of payslip_id, tenant_id
  on public.payslip_lines
  for each row execute function public.payslip_lines_tenant_guard();

comment on function public.payslip_lines_tenant_guard() is
  'Chặn dòng lương trỏ vào phiếu lương của tiệm khác — `capNhatTongPhieu` cộng lại phiếu theo payslip_id, không lọc tiệm (#205).';

-- ---------- 4. vouchers: campaign_id ----------

create or replace function public.vouchers_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.campaign_id is not null then
    select tenant_id into v_tenant from public.campaigns where id = new.campaign_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'vouchers.campaign_id phải cùng tiệm với mã giảm giá (chiến dịch % thuộc tiệm khác)', new.campaign_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger vouchers_tenant_guard
  before insert or update of campaign_id, tenant_id
  on public.vouchers
  for each row execute function public.vouchers_tenant_guard();

comment on function public.vouchers_tenant_guard() is
  'Chặn mã giảm giá gắn vào chiến dịch của tiệm khác — trần chi giảm giá của chiến dịch tính theo campaign_id (#205).';

-- ---------- 5. purchases: supplier_id ----------

create or replace function public.purchases_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.supplier_id is not null then
    select tenant_id into v_tenant from public.suppliers where id = new.supplier_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'purchases.supplier_id phải cùng tiệm với phiếu nhập (nhà cung cấp % thuộc tiệm khác)', new.supplier_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger purchases_tenant_guard
  before insert or update of supplier_id, tenant_id
  on public.purchases
  for each row execute function public.purchases_tenant_guard();

comment on function public.purchases_tenant_guard() is
  'Chặn phiếu nhập trỏ vào nhà cung cấp của tiệm khác — công nợ nhà cung cấp cộng theo supplier_id (#205).';

-- ---------- 6. purchase_lines: purchase_id + item_id ----------

create or replace function public.purchase_lines_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.purchases where id = new.purchase_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'purchase_lines.purchase_id phải cùng tiệm với dòng nhập (phiếu nhập % thuộc tiệm khác)', new.purchase_id
      using errcode = '23514';
  end if;

  select tenant_id into v_tenant from public.items where id = new.item_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'purchase_lines.item_id phải cùng tiệm với dòng nhập (mặt hàng % thuộc tiệm khác)', new.item_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger purchase_lines_tenant_guard
  before insert or update of purchase_id, item_id, tenant_id
  on public.purchase_lines
  for each row execute function public.purchase_lines_tenant_guard();

comment on function public.purchase_lines_tenant_guard() is
  'Chặn dòng nhập trỏ vào phiếu nhập / mặt hàng của tiệm khác — cùng lớp lỗi tiền với order_lines.order_id đã vá ở #136 (#205).';

-- ---------- 7. supplier_payments: purchase_id + supplier_id ----------

create or replace function public.supplier_payments_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.purchase_id is not null then
    select tenant_id into v_tenant from public.purchases where id = new.purchase_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'supplier_payments.purchase_id phải cùng tiệm với khoản chi (phiếu nhập % thuộc tiệm khác)', new.purchase_id
        using errcode = '23514';
    end if;
  end if;

  if new.supplier_id is not null then
    select tenant_id into v_tenant from public.suppliers where id = new.supplier_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'supplier_payments.supplier_id phải cùng tiệm với khoản chi (nhà cung cấp % thuộc tiệm khác)', new.supplier_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger supplier_payments_tenant_guard
  before insert or update of purchase_id, supplier_id, tenant_id
  on public.supplier_payments
  for each row execute function public.supplier_payments_tenant_guard();

comment on function public.supplier_payments_tenant_guard() is
  'Chặn khoản trả nhà cung cấp trỏ sang phiếu nhập / nhà cung cấp của tiệm khác — cùng lớp lỗi tiền với order_payments.order_id đã vá ở #136 (#205).';

-- ---------- 8. stock_moves: item_id ----------
-- (cạnh trigger cũ `stock_moves_immutable_guard` — trigger đó canh SỔ BẤT BIẾN,
-- không canh tiệm; giữ nguyên, thêm trigger mới.)

create or replace function public.stock_moves_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.items where id = new.item_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'stock_moves.item_id phải cùng tiệm với dòng sổ kho (mặt hàng % thuộc tiệm khác)', new.item_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger stock_moves_tenant_guard
  before insert or update of item_id, tenant_id
  on public.stock_moves
  for each row execute function public.stock_moves_tenant_guard();

comment on function public.stock_moves_tenant_guard() is
  'Chặn dòng sổ kho trỏ vào mặt hàng của tiệm khác. Khác `stock_moves_immutable_guard` (canh sổ bất biến, không canh tiệm). Đo 20/08: view `stock_levels` gom theo (tenant_id, item_id) nên tồn kho của tiệm B KHÔNG đổi — nhưng dòng vẫn ghi được, và mọi phép đọc theo item_id không lọc tiệm về sau đều dính (#205).';

-- ---------- 9. stocktake_lines: stocktake_id + item_id ----------
-- (cạnh trigger cũ `stocktake_lines_lock_guard` — canh phiếu đã chốt.)

create or replace function public.stocktake_lines_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.stocktakes where id = new.stocktake_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'stocktake_lines.stocktake_id phải cùng tiệm với dòng kiểm kê (phiếu kiểm kê % thuộc tiệm khác)', new.stocktake_id
      using errcode = '23514';
  end if;

  select tenant_id into v_tenant from public.items where id = new.item_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'stocktake_lines.item_id phải cùng tiệm với dòng kiểm kê (mặt hàng % thuộc tiệm khác)', new.item_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger stocktake_lines_tenant_guard
  before insert or update of stocktake_id, item_id, tenant_id
  on public.stocktake_lines
  for each row execute function public.stocktake_lines_tenant_guard();

comment on function public.stocktake_lines_tenant_guard() is
  'Chặn dòng kiểm kê trỏ vào phiếu kiểm kê / mặt hàng của tiệm khác. Đo 20/08 (hậu quả ④): khoá duy nhất (stocktake_id, item_id) không có tenant_id ⇒ một dòng của tiệm A chiếm chỗ làm tiệm B KHÔNG đếm được mặt hàng đó trong phiếu của chính mình (#205).';

-- ---------- 10. timesheets: employee_id ----------

create or replace function public.timesheets_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.employees where id = new.employee_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'timesheets.employee_id phải cùng tiệm với bảng công (nhân viên % thuộc tiệm khác)', new.employee_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger timesheets_tenant_guard
  before insert or update of employee_id, tenant_id
  on public.timesheets
  for each row execute function public.timesheets_tenant_guard();

comment on function public.timesheets_tenant_guard() is
  'Chặn bảng công trỏ vào nhân viên của tiệm khác — bảng công là ĐẦU VÀO của bảng lương, sai ở đây chảy thẳng vào tiền (#205).';

-- ---------- 11. shifts: employee_id ----------

create or replace function public.shifts_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.employees where id = new.employee_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'shifts.employee_id phải cùng tiệm với ca làm (nhân viên % thuộc tiệm khác)', new.employee_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger shifts_tenant_guard
  before insert or update of employee_id, tenant_id
  on public.shifts
  for each row execute function public.shifts_tenant_guard();

comment on function public.shifts_tenant_guard() is
  'Chặn ca làm trỏ vào nhân viên của tiệm khác (#205).';

-- ---------- 12. employees: candidate_id ----------

create or replace function public.employees_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.candidate_id is not null then
    select tenant_id into v_tenant from public.candidates where id = new.candidate_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'employees.candidate_id phải cùng tiệm với nhân viên (ứng viên % thuộc tiệm khác)', new.candidate_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger employees_tenant_guard
  before insert or update of candidate_id, tenant_id
  on public.employees
  for each row execute function public.employees_tenant_guard();

comment on function public.employees_tenant_guard() is
  'Chặn hồ sơ nhân viên trỏ vào ứng viên của tiệm khác — hồ sơ ứng viên chứa CV, SĐT, đánh giá phỏng vấn (#205).';

-- ---------- 13. candidates: job_opening_id ----------

create or replace function public.candidates_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.job_opening_id is not null then
    select tenant_id into v_tenant from public.job_openings where id = new.job_opening_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'candidates.job_opening_id phải cùng tiệm với ứng viên (tin tuyển % thuộc tiệm khác)', new.job_opening_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger candidates_tenant_guard
  before insert or update of job_opening_id, tenant_id
  on public.candidates
  for each row execute function public.candidates_tenant_guard();

comment on function public.candidates_tenant_guard() is
  'Chặn ứng viên gắn vào tin tuyển dụng của tiệm khác — số ứng viên trên tin đếm theo job_opening_id (#205).';

-- ---------- 14. interviews: candidate_id ----------

create or replace function public.interviews_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.candidates where id = new.candidate_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'interviews.candidate_id phải cùng tiệm với buổi phỏng vấn (ứng viên % thuộc tiệm khác)', new.candidate_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger interviews_tenant_guard
  before insert or update of candidate_id, tenant_id
  on public.interviews
  for each row execute function public.interviews_tenant_guard();

comment on function public.interviews_tenant_guard() is
  'Chặn buổi phỏng vấn trỏ vào ứng viên của tiệm khác (#205).';

-- ---------- 15. interview_notes: interview_id ----------

create or replace function public.interview_notes_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.interviews where id = new.interview_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'interview_notes.interview_id phải cùng tiệm với nhận xét (buổi phỏng vấn % thuộc tiệm khác)', new.interview_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger interview_notes_tenant_guard
  before insert or update of interview_id, tenant_id
  on public.interview_notes
  for each row execute function public.interview_notes_tenant_guard();

comment on function public.interview_notes_tenant_guard() is
  'Chặn nhận xét phỏng vấn trỏ vào buổi phỏng vấn của tiệm khác (#205).';

-- ---------- 16. campaign_sends: campaign_id ----------

create or replace function public.campaign_sends_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.campaigns where id = new.campaign_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'campaign_sends.campaign_id phải cùng tiệm với đợt gửi (chiến dịch % thuộc tiệm khác)', new.campaign_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger campaign_sends_tenant_guard
  before insert or update of campaign_id, tenant_id
  on public.campaign_sends
  for each row execute function public.campaign_sends_tenant_guard();

comment on function public.campaign_sends_tenant_guard() is
  'Chặn đợt gửi trỏ vào chiến dịch của tiệm khác (#205).';

-- ---------- 17. campaign_send_recipients: send_id ----------
-- (cạnh trigger cũ `campaign_recipient_guard` — trigger đó ĐÃ kiểm tiệm của
-- `contact_id` nhưng KHÔNG kiểm `send_id`; giữ nguyên, thêm trigger mới.)

create or replace function public.campaign_send_recipients_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.campaign_sends where id = new.send_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'campaign_send_recipients.send_id phải cùng tiệm với người nhận (đợt gửi % thuộc tiệm khác)', new.send_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger campaign_send_recipients_tenant_guard
  before insert or update of send_id, tenant_id
  on public.campaign_send_recipients
  for each row execute function public.campaign_send_recipients_tenant_guard();

comment on function public.campaign_send_recipients_tenant_guard() is
  'Chặn người nhận trỏ vào đợt gửi của tiệm khác. Khác `campaign_recipient_guard` (#171) — trigger đó đã kiểm tiệm của contact_id nhưng BỎ SÓT send_id, đúng kiểu bỏ sót order_id của order_lines ở #131 (#205).';

-- ---------- 18. campaign_summary: campaign_id ----------

create or replace function public.campaign_summary_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.campaigns where id = new.campaign_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'campaign_summary.campaign_id phải cùng tiệm với bản tổng kết (chiến dịch % thuộc tiệm khác)', new.campaign_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger campaign_summary_tenant_guard
  before insert or update of campaign_id, tenant_id
  on public.campaign_summary
  for each row execute function public.campaign_summary_tenant_guard();

comment on function public.campaign_summary_tenant_guard() is
  'Chặn bản tổng kết trỏ vào chiến dịch của tiệm khác. Đo 20/08 (hậu quả ⑤): campaign_id LÀ khoá chính, không có tenant_id ⇒ tiệm A chiếm chỗ thì tiệm B không tổng kết được chiến dịch của chính mình (#205).';

-- ---------- 19. satisfaction_surveys: appointment_id ----------

create or replace function public.satisfaction_surveys_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.appointments where id = new.appointment_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'satisfaction_surveys.appointment_id phải cùng tiệm với phiếu đánh giá (lịch hẹn % thuộc tiệm khác)', new.appointment_id
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger satisfaction_surveys_tenant_guard
  before insert or update of appointment_id, tenant_id
  on public.satisfaction_surveys
  for each row execute function public.satisfaction_surveys_tenant_guard();

comment on function public.satisfaction_surveys_tenant_guard() is
  'Chặn phiếu đánh giá trỏ vào lịch hẹn của tiệm khác. Đo 20/08 (hậu quả ③): khoá duy nhất trên appointment_id không có tenant_id ⇒ tiệm A chiếm chỗ thì tiệm B KHÔNG BAO GIỜ tạo được phiếu đánh giá cho lịch hẹn của chính mình (#205).';
