-- Nhật ký quản trị: điền TÊN TIỆM khi ghi nhận đã thu tiền của một tiệm.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO CHỈ SỬA MỘT HÀM TRONG NĂM
-- ═══════════════════════════════════════════════════════════════════
-- Quyển nhật ký `admin_audit_logs` tồn tại để trả lời "người của iFan đã mở
-- dữ liệu của TIỆM NÀO, lúc nào". Migration #216 mở đường đọc, #218 dựng màn.
-- Nhưng đo được (20/08): cả 21 dòng đều có `tenant_id` NULL — ô lọc theo tiệm
-- không có lựa chọn nào.
--
-- Xét từng hàm ghi sổ để biết cái nào SAI, cái nào ĐÚNG:
--
--   · admin_platform_overview  — xem tổng quan TOÀN nền tảng, không thuộc tiệm
--   · admin_tenant_health      — xem sức khoẻ TẤT CẢ tiệm, không thuộc một tiệm
--   · admin_open_invoices      — liệt kê hoá đơn mở CỦA MỌI tiệm, không một tiệm
--   · admin_pending_help_requests — danh sách yêu cầu TOÀN nền tảng
--        → BỐN hàm trên: `tenant_id` NULL là ĐÚNG. Chúng thật sự không thuộc
--          tiệm nào. Điền đại một tiệm vào là bịa.
--
--   · admin_record_payment     — ghi nhận ĐÃ THU TIỀN của ĐÚNG MỘT tiệm
--        → Đây là hàm DUY NHẤT sai: nó biết chắc tiền của tiệm nào (qua số hoá
--          đơn) mà lại bỏ trống. Đây cũng là dòng nhật ký QUAN TRỌNG NHẤT —
--          "ai ở iFan đã ghi nhận thu tiền của tiệm X" là câu kế toán và khách
--          đều có quyền hỏi.
--
-- ⇒ Sửa đúng một hàm. "Vá cho đủ năm hàm" sẽ là điền tiệm giả vào bốn dòng
-- vốn đúng là toàn-nền-tảng — làm hỏng chính cái nó định sửa.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO AN TOÀN DÙ HÀM ĐỘNG TỚI TIỀN
-- ═══════════════════════════════════════════════════════════════════
-- KHÔNG đụng một chữ nào vào logic thu tiền: `record_subscription_payment`
-- (hàm thật sự ghi tiền) giữ nguyên. Chỉ thêm MỘT phép tra cứu tiệm và MỘT
-- cột vào dòng nhật ký — dòng vốn đã được ghi ở đây.
--
-- Thứ tự an toàn: dòng nhật ký chạy SAU khi `record_subscription_payment`
-- thành công. Nếu số hoá đơn sai, hàm đó `raise exception 'invoice_not_found'`
-- và huỷ cả giao dịch — không tới được dòng nhật ký. Nên tới đây thì hoá đơn
-- (và tiệm của nó) CHẮC CHẮN tồn tại; tra cứu không bao giờ ra NULL.
--
-- Thân hàm giữ NGUYÊN VĂN bản đang chạy, chỉ thêm phần đánh dấu bằng `-- #224`.

create or replace function public.admin_record_payment(
  p_invoice_number text,
  p_amount bigint,
  p_ref text
) returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_tenant uuid;  -- #224
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;

  v_result := public.record_subscription_payment(p_invoice_number, 'manual', p_ref, p_amount);

  -- #224: tra tiệm từ số hoá đơn. Tới được đây nghĩa là hàm trên đã thành công,
  -- nên hoá đơn chắc chắn tồn tại — tra cứu không ra NULL.
  select tenant_id into v_tenant
    from public.subscription_invoices where number = p_invoice_number;

  -- Dấu vết: ai ghi nhận, TIỆM NÀO, phiếu nào, bao nhiêu tiền, biên lai gì, kết quả ra sao.
  -- (Hàm trên raise thì transaction hủy cả dòng log — đúng: không có gì xảy ra.)
  insert into public.admin_audit_logs (actor_user_id, action, tenant_id, meta)
    values (v_uid, 'payment.record', v_tenant,
            jsonb_build_object('invoice', p_invoice_number, 'amount', p_amount,
                               'ref', p_ref, 'result', v_result));

  return v_result;
end $$;

comment on function public.admin_record_payment(text, bigint, text) is
  'Ghi nhan da thu tien mot hoa don goi cuoc (chi platform admin). #224: dong nhat ky gio dien tenant_id tra tu so hoa don — truoc do bo trong nen man nhat ky khong loc duoc theo tiem. KHONG dung logic thu tien (record_subscription_payment giu nguyen), chi them mot phep tra cuu tiem. Bon ham admin khac (platform_overview, tenant_health, open_invoices, pending_help_requests) co y de tenant_id NULL vi la thao tac toan nen tang.';
