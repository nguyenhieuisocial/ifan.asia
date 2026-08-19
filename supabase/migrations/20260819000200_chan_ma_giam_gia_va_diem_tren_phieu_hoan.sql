-- CHẶN TƯỜNG MINH: mã giảm giá và trả-bằng-điểm KHÔNG áp cho PHIẾU HOÀN.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO — "đang chặn được" không có nghĩa là "có chốt"
-- ═══════════════════════════════════════════════════════════════════
-- Cả hai hàm chỉ kiểm TRẠNG THÁI đơn (`draft`/`confirmed`), không kiểm LOẠI đơn
-- (`kind`). Một phiên trước SUY LUẬN rằng "tổng phiếu hoàn âm nên tự chặn gián
-- tiếp" — nhưng không đo. Đã đo, trên CSDL thật, đóng vai nhân viên, mọi phép
-- thử rollback:
--
--   ① voucher_apply lên phiếu hoàn  → NÉM `invalid_subtotal`
--   ② loyalty_redeem_for_order      → trả `vuot_so_con_thieu, con_thieu: 0`
--   ③ ĐỐI CHỨNG trên đơn bán        → cả hai chạy bình thường (giảm 100.000đ,
--                                      tiêu 1000 điểm) ⇒ phép đo không rỗng
--
-- Kết luận: suy luận ĐÚNG kết quả nhưng SAI nguyên nhân. Không cái nào là chốt
-- về loại đơn cả:
--
--   · ① là một ngoại lệ KỸ THUẬT bật lên từ `voucher_check` khi tổng đơn âm.
--     Người bán hàng nhận một câu lỗi kỹ thuật giữa lúc đang nói chuyện với
--     khách — trái hẳn khuôn của kho ("mỗi mã một câu riêng, gộp thành 'không
--     dùng được' là để nhân viên đứng trước mặt khách mà không biết giải thích").
--   · ② là chốt "không trả quá số còn thiếu" ăn may: tổng phiếu hoàn âm nên
--     `greatest(v_tong - v_da_tra, 0)` ra 0. Câu hiện ra cho nhân viên là
--     "Đơn chỉ còn thiếu 0đ" — VÔ NGHĨA với một phiếu hoàn.
--
-- Nguy hiểm thật nằm ở chỗ khác: **sửa một công thức không liên quan là chốt
-- biến mất trong im lặng.** Đúng hôm nay migration #198 vừa đổi cách tính giá
-- trị dòng hàng; chỉ cần lần sau ai đó đổi tiếp `voucher_check` hay bỏ luật
-- "không trả quá số còn thiếu" là mã giảm giá ghi thẳng vào dòng phiếu hoàn,
-- không ai hay. Đây đúng loại "chốt sai" mà cổng kiểm KHÔNG bắt được — chỉ bắt
-- được kiểu "quên hẳn".
--
-- ⇒ Thay hai chốt tình cờ bằng MỘT chốt tường minh, đặt sớm, có lý do đọc được.

-- ════════════════════════════════════════════════════════════════════
-- ① voucher_apply
-- ════════════════════════════════════════════════════════════════════
-- Giữ NGUYÊN VĂN thân hàm #159, chỉ thêm chốt loại đơn ngay sau chốt trạng thái.
-- Một thay đổi kèm theo, nói rõ để không ai tưởng là vô tình: hai chỗ tính tiền
-- dòng nay đọc cột sinh `line_total_vnd` (#198) thay vì chép lại công thức
-- `qty * unit_price_vnd - discount_vnd`. Với ĐƠN BÁN hai cách ra CÙNG một số —
-- và sau bản này thì đơn bán là loại DUY NHẤT đi qua được hàm — nên không đổi
-- hành vi. Lý do đổi: #198 gom công thức về một nguồn để hai tầng không lệch
-- nhau; để lại một bản chép tay ở đây là dựng lại đúng cái vừa dẹp.
create or replace function public.voucher_apply(p_order_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_order  public.orders;
  v_v      public.vouchers;
  v_kq     jsonb;
  v_tong   bigint;
  v_giam   bigint;
  v_da_chia bigint := 0;
  v_dong   record;
  v_phan   bigint;
  v_cuoi   uuid;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin', 'manager', 'staff') then raise exception 'forbidden'; end if;

  select * into v_order from public.orders
   where id = p_order_id and tenant_id = v_tenant and deleted_at is null;
  if not found then raise exception 'order_not_found'; end if;
  -- Đơn đã hoàn tất thì `order_lines_lock_guard` khoá dòng — báo sớm cho rõ ràng
  -- thay vì để lỗi trigger khó hiểu bật lên giữa chừng.
  if v_order.status not in ('draft', 'confirmed') then
    return jsonb_build_object('ok', false, 'ly_do', 'don_da_chot');
  end if;
  -- CHỐT MỚI (#200). Phiếu hoàn là tiệm TRẢ tiền lại cho khách; giảm giá ở đây
  -- vừa vô nghĩa vừa làm sai số tiền hoàn. Trước bản này chỗ này ném
  -- `invalid_subtotal` — chặn được, nhưng bằng một câu lỗi kỹ thuật.
  if v_order.kind <> 'order' then
    return jsonb_build_object('ok', false, 'ly_do', 'khong_ap_cho_phieu_hoan');
  end if;

  -- KHOÁ dòng voucher trước khi đếm lượt: hai quầy cùng gõ mã còn 1 lượt cuối
  -- đều thấy "còn lượt" rồi cùng ghi ⇒ vượt trần. Kiểm ở tầng web không đỡ được.
  select * into v_v from public.vouchers
   where tenant_id = v_tenant and upper(code) = upper(trim(p_code))
   for update;
  if not found then return jsonb_build_object('ok', false, 'ly_do', 'khong_ton_tai'); end if;

  select coalesce(sum(line_total_vnd), 0)::bigint
    into v_tong from public.order_lines where order_id = p_order_id;

  v_kq := public.voucher_check(v_v.code, v_tong, v_order.contact_id);
  if not (v_kq->>'ok')::boolean then return v_kq; end if;
  v_giam := (v_kq->>'giam_vnd')::bigint;

  -- ── PHÂN BỔ về từng dòng theo tỷ lệ tiền ──
  -- Dòng cuối nhận phần dư của phép chia, để tổng phân bổ khớp ĐÚNG số giảm.
  -- Chia đều rồi làm tròn từng dòng là cách sinh ra chênh vài đồng không ai truy
  -- được — đúng thứ mà luật "không giảm giá cấp đơn" sinh ra để tránh.
  select id into v_cuoi from public.order_lines
   where order_id = p_order_id order by sort_order desc, id desc limit 1;

  for v_dong in
    select id, line_total_vnd::bigint as tien
      from public.order_lines where order_id = p_order_id
     order by sort_order, id
  loop
    if v_dong.id = v_cuoi then
      v_phan := v_giam - v_da_chia;
    else
      v_phan := case when v_tong > 0 then (v_giam * v_dong.tien / v_tong)::bigint else 0 end;
    end if;
    if v_phan > 0 then
      update public.order_lines set discount_vnd = discount_vnd + v_phan where id = v_dong.id;
      v_da_chia := v_da_chia + v_phan;
    end if;
  end loop;

  insert into public.voucher_redemptions
    (tenant_id, voucher_id, order_id, contact_id, discount_vnd, created_by)
  values (v_tenant, v_v.id, p_order_id, v_order.contact_id, v_giam, auth.uid());

  return jsonb_build_object('ok', true, 'ma', v_v.code, 'giam_vnd', v_giam,
                            'cham_tran_tien', v_kq->'cham_tran_tien');
exception
  when unique_violation then
    -- Chỉ mục `voucher_redemptions_order_unique`: một đơn chỉ mang một mã.
    return jsonb_build_object('ok', false, 'ly_do', 'don_da_co_ma');
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- ② loyalty_redeem_for_order
-- ════════════════════════════════════════════════════════════════════
-- Giữ nguyên văn thân hàm #194, thêm đúng một chốt.
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
  -- CHỐT MỚI (#200). Trả bằng điểm nghĩa là khách TRẢ cho tiệm; ở phiếu hoàn
  -- tiền đi chiều ngược lại nên không có gì để trả. Trước bản này chỗ này rơi
  -- vào chốt "không trả quá số còn thiếu" và hiện ra câu "Đơn chỉ còn thiếu 0đ"
  -- — chặn đúng nhưng nói sai, và sẽ biến mất nếu luật kia đổi.
  -- Việc quyết toán điểm cho phiếu hoàn đã có đường riêng: `loyalty_settle_return`
  -- (#195), chạy tự động khi phiếu hoàn chuyển sang Xong.
  if v_order.kind <> 'order' then
    return jsonb_build_object('ok', false, 'ly_do', 'khong_ap_cho_phieu_hoan');
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
  select coalesce(sum(line_total_vnd), 0)::bigint
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

comment on function public.voucher_apply is
  'Áp mã giảm giá vào đơn. CHỈ đơn bán (`kind = ''order''`) — phiếu hoàn trả `khong_ap_cho_phieu_hoan` (#200).';
comment on function public.loyalty_redeem_for_order is
  'Khách trả một phần đơn bằng điểm tích luỹ: trừ điểm + ghi khoản trả `points` trong CÙNG giao dịch. CHỈ đơn bán — phiếu hoàn trả `khong_ap_cho_phieu_hoan` (#200); quyết toán điểm cho phiếu hoàn đi đường `loyalty_settle_return` (#195). Không sinh phiếu sổ quỹ.';
