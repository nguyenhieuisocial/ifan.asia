-- DÙNG ĐIỂM TRẢ ĐƠN — nối nốt nửa còn thiếu của mảng Giữ khách.
--
-- ═══════════════════════════════════════════════════════════════════
-- LỖ
-- ═══════════════════════════════════════════════════════════════════
-- Mảng tích điểm đang chạy MỘT CHIỀU: máy cộng điểm cho khách đúng
-- (`loyalty_earn_for_order` được gọi thật ở màn Đơn hàng), nhưng `loyalty_redeem`
-- KHÔNG chỗ nào gọi — đo 19/08: 0 lời gọi trong app, lib, components. Nghĩa là
-- **điểm chỉ tăng, không tiêu được**. Với khách đó là lời hứa suông; với tiệm đó
-- là một khoản nợ chỉ phình ra.
--
-- ═══════════════════════════════════════════════════════════════════
-- QUYẾT ĐỊNH: ĐỔI ĐIỂM LÀ **TRẢ TIỀN**, KHÔNG PHẢI GIẢM GIÁ
-- ═══════════════════════════════════════════════════════════════════
-- Hai cách làm, chọn cách sau, vì hai lý do đã có sẵn trong kho chứ không phải
-- tôi nghĩ ra hôm nay:
--
--   · Thẻ design chốt **"điểm là NỢ"** (quyết định 4). Khách tiêu điểm là tiệm
--     TRẢ món nợ đó, không phải bán rẻ đi. Ghi thành giảm giá sẽ làm doanh thu
--     tụt xuống trong khi khoản nợ vẫn nằm nguyên trong sổ điểm — số liệu đá nhau.
--   · Kho này **cố ý không có giảm giá cấp đơn** (ghi ở chính thẻ đó). Muốn nhét
--     điểm thành giảm giá thì phải chia nhỏ về từng dòng như voucher, và khi đó
--     nó lại đụng trần giảm giá theo vai (#183) — một khoản khách TỰ trả bằng
--     điểm của mình mà phải xin quản lý duyệt là vô nghĩa.
--
-- ⇒ Điểm đi vào `order_payments` như một cách trả tiền thứ tư.
--
-- Kèm theo, PHẢI chặn một hệ quả: sổ quỹ. `order_payments_emit_cash_entry` xưa
-- nay sinh một phiếu THU cho mọi lần trả tiền. Điểm KHÔNG phải tiền mặt cũng
-- không phải chuyển khoản — **không đồng nào vào két**. Để nguyên là sổ quỹ
-- phình lên bằng tiền không tồn tại, đúng loại lỗi "số liệu đá nhau" đã tốn rất
-- nhiều công dập.

alter table public.order_payments drop constraint if exists order_payments_method_check;
alter table public.order_payments add constraint order_payments_method_check
  check (method in ('cash', 'bank_transfer', 'vietqr', 'points'));

comment on column public.order_payments.method is
  'cash · bank_transfer · vietqr · points. `points` = khách trả bằng điểm tích luỹ: KHÔNG sinh phiếu sổ quỹ vì không có đồng nào vào két (xem #194).';

create or replace function public.order_payments_emit_cash_entry() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $fn$
begin
  -- Trả bằng ĐIỂM không có tiền thật đi vào — bỏ qua sổ quỹ. Đây là chốt duy
  -- nhất giữ cho tổng sổ quỹ khớp tiền đếm được trong két.
  if new.method = 'points' then
    return new;
  end if;

  insert into public.cash_entries
      (tenant_id, direction, amount_vnd, fund, category, order_id, order_payment_id, recorded_by)
    values
      (new.tenant_id, 'in', new.amount_vnd,
       case when new.method = 'cash' then 'cash' else 'bank' end,
       'sale', new.order_id, new.id, new.received_by);
  return new;
end $fn$;

-- ═══════════════════════════════════════════════════════════════════
-- MỘT CỬA DUY NHẤT: trừ điểm và ghi khoản trả trong CÙNG một giao dịch
-- ═══════════════════════════════════════════════════════════════════
-- KHÔNG để tầng web gọi `loyalty_redeem` rồi tự chèn `order_payments`: giữa hai
-- lời gọi mà đứt mạng là khách MẤT điểm nhưng đơn KHÔNG được trừ tiền, và không
-- có đường nào lần ra. Gộp vào một hàm là để chuyện đó không thể xảy ra.
--
-- Trả về jsonb thay vì ném lỗi cho các nhánh NGHIỆP VỤ bình thường (không đủ
-- điểm, đơn đã chốt…) — cùng khuôn `voucher_check`/`discount_request`: người
-- bán hàng cần đọc được LÝ DO, không phải một câu lỗi kỹ thuật.
create or replace function public.loyalty_redeem_for_order(
  p_order_id uuid,
  p_points   integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_order  public.orders;
  v_cfg    public.loyalty_config;
  v_con    bigint;
  v_tien   bigint;
  v_tong   bigint;
  v_da_tra bigint;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin', 'manager', 'staff') then raise exception 'forbidden'; end if;
  if p_points is null or p_points <= 0 then
    return jsonb_build_object('ok', false, 'ly_do', 'so_diem_khong_hop_le');
  end if;

  select * into v_order from public.orders
   where id = p_order_id and tenant_id = v_tenant and deleted_at is null;
  if not found then raise exception 'order_not_found'; end if;

  if v_order.status not in ('draft', 'confirmed') then
    return jsonb_build_object('ok', false, 'ly_do', 'don_da_chot');
  end if;
  -- Điểm thuộc về MỘT khách cụ thể; đơn bán lẻ không gắn khách thì không có ví
  -- nào để trừ. Nói ra thay vì im lặng bỏ qua.
  if v_order.contact_id is null then
    return jsonb_build_object('ok', false, 'ly_do', 'don_khong_co_khach');
  end if;

  v_cfg := public.loyalty_config_get(v_tenant);
  if not v_cfg.is_active then
    return jsonb_build_object('ok', false, 'ly_do', 'chua_bat_tich_diem');
  end if;
  if p_points % v_cfg.redeem_points_unit <> 0 then
    return jsonb_build_object('ok', false, 'ly_do', 'khong_dung_boi_so',
                              'boi_so', v_cfg.redeem_points_unit);
  end if;

  select coalesce(sum(remaining), 0) into v_con from public.loyalty_ledger
   where tenant_id = v_tenant and contact_id = v_order.contact_id
     and remaining > 0 and expires_at > now();
  if v_con < p_points then
    return jsonb_build_object('ok', false, 'ly_do', 'khong_du_diem', 'con', v_con);
  end if;

  -- KHÔNG cho trả quá số còn thiếu của đơn: dư ra là tiệm nợ khách tiền mặt,
  -- mà cả hệ này không có đường hoàn tiền bằng điểm.
  select coalesce(sum(qty * unit_price_vnd - discount_vnd), 0)::bigint
    into v_tong from public.order_lines where order_id = p_order_id;
  select coalesce(sum(amount_vnd), 0)::bigint
    into v_da_tra from public.order_payments where order_id = p_order_id;

  v_tien := (p_points::bigint * v_cfg.redeem_value_vnd / v_cfg.redeem_points_unit);
  if v_tien > v_tong - v_da_tra then
    return jsonb_build_object('ok', false, 'ly_do', 'vuot_so_con_thieu',
                              'con_thieu', greatest(v_tong - v_da_tra, 0));
  end if;

  -- `loyalty_redeem` tự khoá lô điểm và tự kiểm lại số dư — hai quầy cùng bấm
  -- thì chỉ một bên qua. Gọi lại nó thay vì chép logic sang đây.
  perform public.loyalty_redeem(v_order.contact_id, p_points, p_order_id, 'Trả đơn bằng điểm');

  insert into public.order_payments (tenant_id, order_id, method, amount_vnd, received_by)
  values (v_tenant, p_order_id, 'points', v_tien, auth.uid());

  return jsonb_build_object('ok', true, 'giam_vnd', v_tien, 'diem_da_dung', p_points,
                            'con_lai_diem', v_con - p_points);
end;
$fn$;

revoke execute on function public.loyalty_redeem_for_order(uuid, integer) from public, anon;
grant execute on function public.loyalty_redeem_for_order(uuid, integer) to authenticated;

comment on function public.loyalty_redeem_for_order is
  'Khách trả một phần đơn bằng điểm tích luỹ: trừ điểm + ghi khoản trả `points` trong CÙNG giao dịch. Trả jsonb {ok, ly_do?} — nhánh nghiệp vụ KHÔNG ném lỗi. Không sinh phiếu sổ quỹ (không có tiền thật vào két).';
