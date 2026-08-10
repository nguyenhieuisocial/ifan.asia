-- =============================================================
-- iFan.asia — Migration #48: /admin — "Hóa đơn chờ thu" + nút "Đã nhận tiền"
--
-- Bệnh: #47 đã cho CHỦ TIỆM thấy phiếu đang chờ + số tài khoản của iFan để
--   chuyển khoản, nhưng phía FOUNDER chưa có chỗ nào liệt kê phiếu 'open'
--   TOÀN nền tảng — tiền về tài khoản rồi vẫn phải mở SQL editor gọi
--   record_subscription_payment bằng tay mới kích hoạt được gói cho khách.
--
-- Sửa — theo ĐÚNG mẫu RPC admin #28 (security definer + is_platform_admin()
-- ở dòng đầu + ghi admin_audit_logs + grant authenticated, revoke anon/public):
--   1) admin_open_invoices()  — phiếu status='open' toàn nền tảng: số phiếu,
--      tên tiệm + slug, gói, số phải thu, ngày tạo. Đúng tinh thần #28: chỉ
--      chuyện tiền giữa iFan và tiệm — KHÔNG có dữ liệu khách của tiệm.
--   2) admin_record_payment(p_invoice_number, p_amount, p_ref) — founder thấy
--      tiền về thì bấm "Đã nhận tiền": kiểm quyền rồi ủy quyền cho
--      record_subscription_payment (#27) với provider='manual', trả jsonb
--      NGUYÊN VẸN cho UI diễn giải (applied / duplicate / underpaid / ...).
--
-- KHÔNG có trong migration này (cố ý): không đụng luồng tạo phiếu / áp phiếu
--   (#27) — mọi logic tiền vẫn nằm đúng một chỗ là record_subscription_payment.
-- =============================================================

/**
 * DANH SÁCH PHIẾU CHỜ THU toàn nền tảng — mới nhất lên đầu (khớp thứ tự
 * `open_invoices` của billing_overview #47). Tiệm đã xóa mềm không hiện:
 * không còn ai để thu, phiếu đó xử lý tay nếu cần.
 */
create or replace function public.admin_open_invoices()
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_rows jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  insert into public.admin_audit_logs (actor_user_id, action)
    values (v_uid, 'open_invoices.read');

  select coalesce(jsonb_agg(jsonb_build_object(
             'number', i.number,
             'tenant_name', t.name,
             'tenant_slug', t.slug,
             'plan_code', i.plan_code,
             'amount_due', i.amount_due,
             'created_at', i.created_at)
           order by i.created_at desc), '[]'::jsonb)
    into v_rows
    from public.subscription_invoices i
    join public.tenants t on t.id = i.tenant_id
   where i.status = 'open' and t.deleted_at is null;

  return v_rows;
end $$;
grant execute on function public.admin_open_invoices to authenticated;
revoke execute on function public.admin_open_invoices from anon, public;

/**
 * GHI NHẬN TIỀN VỀ (founder bấm tay). Chỉ là CỬA CÓ KIỂM QUYỀN — toàn bộ
 * logic tiền ủy quyền cho record_subscription_payment (#27), hàm đó ĐÃ
 * idempotent sẵn nhờ unique(provider, provider_ref): bấm trùng số biên lai
 * trả {duplicate:true} chứ không ghi 2 lần; thiếu tiền trả {underpaid:true};
 * phiếu đã trả trả {already_paid:true}. Trả jsonb NGUYÊN VẸN, không diễn
 * giải lại ở tầng SQL.
 *
 * record_subscription_payment bị revoke khỏi authenticated (#27) — hàm này
 * chạy dưới owner (security definer) nên gọi được; client chỉ có cửa này.
 */
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
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;

  v_result := public.record_subscription_payment(p_invoice_number, 'manual', p_ref, p_amount);

  -- Dấu vết: ai ghi nhận, phiếu nào, bao nhiêu tiền, biên lai gì, kết quả ra sao.
  -- (Hàm trên raise thì transaction hủy cả dòng log — đúng: không có gì xảy ra.)
  insert into public.admin_audit_logs (actor_user_id, action, meta)
    values (v_uid, 'payment.record',
            jsonb_build_object('invoice', p_invoice_number, 'amount', p_amount,
                               'ref', p_ref, 'result', v_result));

  return v_result;
end $$;
grant execute on function public.admin_record_payment to authenticated;
revoke execute on function public.admin_record_payment from anon, public;
