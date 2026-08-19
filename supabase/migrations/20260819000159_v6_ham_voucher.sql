-- V6 retention (19/08/2026) — hàm áp voucher, và VÁ một lỗi tính hai lần.
--
-- ⚠️ LUẬT CỦA KHO NÀY, đọc kỹ trước khi sửa: KHÔNG có giảm giá cấp ĐƠN.
-- `order_lines.discount_vnd` là chỗ duy nhất ghi giảm giá (migration #127 dòng
-- 166-168 nói rõ: "giảm giá treo ở đầu đơn làm mọi báo cáo lãi sai lệch một
-- khoản không truy được"). Nên voucher KHÔNG được lưu như một khoản trừ riêng —
-- nó phải PHÂN BỔ về từng dòng theo tỷ lệ tiền. Bảng `voucher_redemptions` chỉ
-- là biên nhận để đếm lượt và truy vết, KHÔNG phải một khoản trừ thứ hai.
--
-- Hệ quả tốt: `order_payments_guard` (so tiền thu với tổng dòng) tự động hạ trần
-- thu tiền, và báo cáo lãi gộp tự đúng — không phải sửa chỗ nào khác.

-- ════════════════════════════════════════════════════════════════════
-- VÁ: loyalty_earn_for_order trừ voucher HAI LẦN
-- ════════════════════════════════════════════════════════════════════
-- Bản ở migration #158 lấy tổng dòng RỒI trừ tiếp `voucher_redemptions.discount_vnd`.
-- Nhưng voucher đã nằm sẵn trong `order_lines.discount_vnd` (luật trên) ⇒ khách
-- bị trừ điểm hai lần cho cùng một khoản giảm. Bắt được ngay khi khảo sát luồng
-- đơn hàng, trước khi có đơn thật nào chạy qua.
create or replace function public.loyalty_earn_for_order(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_order  public.orders;
  v_cfg    public.loyalty_config;
  v_thuc   bigint;
  v_diem   integer;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin', 'manager', 'staff') then raise exception 'forbidden'; end if;

  select * into v_order from public.orders
   where id = p_order_id and tenant_id = v_tenant and deleted_at is null;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.contact_id is null then return 0; end if;   -- khách vãng lai, không có ví
  if v_order.kind <> 'order' then return 0; end if;      -- đơn hoàn/trả không tích

  v_cfg := public.loyalty_config_get(v_tenant);
  if not v_cfg.is_active then return 0; end if;

  -- Tổng dòng ĐÃ trừ mọi giảm giá, kể cả phần voucher đã phân bổ vào.
  select coalesce(sum(qty * unit_price_vnd - discount_vnd), 0)::bigint
    into v_thuc from public.order_lines where order_id = p_order_id;

  v_diem := floor(greatest(v_thuc, 0) / v_cfg.vnd_per_point)::integer;
  if v_diem <= 0 then return 0; end if;

  insert into public.loyalty_ledger
    (tenant_id, contact_id, delta_points, reason, order_id, expires_at, remaining, created_by)
  values
    (v_tenant, v_order.contact_id, v_diem, 'order', p_order_id,
     now() + make_interval(months => v_cfg.expire_months), v_diem, auth.uid())
  on conflict (order_id) where reason = 'order' do nothing;

  if not found then return 0; end if;   -- đơn này đã tích rồi
  return v_diem;
end;
$$;
revoke execute on function public.loyalty_earn_for_order(uuid) from public, anon;
grant execute on function public.loyalty_earn_for_order(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- XEM THỬ MỘT MÃ (không ghi gì)
-- ════════════════════════════════════════════════════════════════════
-- Màn Tạo đơn dựng giỏ hàng ở trình duyệt và chỉ ghi đơn khi bấm "Tạo đơn", nên
-- lúc gõ mã thì CHƯA CÓ đơn để mà áp. Hàm này chấm điểm một mã trên con số tạm.
--
-- Quyết định 2 của thẻ design: KHÔNG ném lỗi mà TRẢ VỀ lý do. Im lặng bỏ qua một
-- ưu đãi là khách cãi nhau tại quầy mà nhân viên không biết giải thích.
create or replace function public.voucher_check(
  p_code       text,
  p_subtotal   bigint,
  p_contact_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_v      public.vouchers;
  v_dung   integer;
  v_cua_kh integer;
  v_giam   bigint;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if p_subtotal is null or p_subtotal < 0 then raise exception 'invalid_subtotal'; end if;

  select * into v_v from public.vouchers
   where tenant_id = v_tenant and upper(code) = upper(trim(p_code));
  if not found then return jsonb_build_object('ok', false, 'ly_do', 'khong_ton_tai'); end if;

  if v_v.status <> 'active' then
    return jsonb_build_object('ok', false, 'ly_do', 'da_dung', 'ma', v_v.code);
  end if;
  if v_v.expires_at <= now() then
    return jsonb_build_object('ok', false, 'ly_do', 'het_han', 'ma', v_v.code,
                              'het_han_luc', v_v.expires_at);
  end if;

  select count(*) into v_dung from public.voucher_redemptions where voucher_id = v_v.id;
  if v_dung >= v_v.max_uses then
    return jsonb_build_object('ok', false, 'ly_do', 'het_luot', 'ma', v_v.code,
                              'da_dung', v_dung, 'toi_da', v_v.max_uses);
  end if;

  if p_subtotal < v_v.min_order_vnd then
    return jsonb_build_object('ok', false, 'ly_do', 'chua_du_don_toi_thieu', 'ma', v_v.code,
                              'can_tu', v_v.min_order_vnd);
  end if;

  if v_v.per_customer_limit is not null then
    if p_contact_id is null then
      return jsonb_build_object('ok', false, 'ly_do', 'can_chon_khach', 'ma', v_v.code);
    end if;
    select count(*) into v_cua_kh from public.voucher_redemptions
     where voucher_id = v_v.id and contact_id = p_contact_id;
    if v_cua_kh >= v_v.per_customer_limit then
      return jsonb_build_object('ok', false, 'ly_do', 'khach_dung_het_luot', 'ma', v_v.code,
                                'toi_da_moi_khach', v_v.per_customer_limit);
    end if;
  end if;

  if v_v.new_customer_only then
    if p_contact_id is null then
      return jsonb_build_object('ok', false, 'ly_do', 'can_chon_khach', 'ma', v_v.code);
    end if;
    if exists (select 1 from public.orders
                where tenant_id = v_tenant and contact_id = p_contact_id
                  and kind = 'order' and status <> 'draft' and deleted_at is null) then
      return jsonb_build_object('ok', false, 'ly_do', 'chi_danh_cho_khach_moi', 'ma', v_v.code);
    end if;
  end if;

  -- Trần tiền giảm là chốt chặn CUỐI, đứng sau mọi cách tính.
  v_giam := case v_v.kind
              when 'percent' then (p_subtotal * v_v.percent_off / 100)::bigint
              else v_v.amount_off_vnd
            end;
  v_giam := least(v_giam, v_v.max_discount_vnd, p_subtotal);
  if v_giam <= 0 then
    return jsonb_build_object('ok', false, 'ly_do', 'giam_bang_khong', 'ma', v_v.code);
  end if;

  return jsonb_build_object('ok', true, 'ma', v_v.code, 'voucher_id', v_v.id,
                            'giam_vnd', v_giam, 'cham_tran_tien', v_giam = v_v.max_discount_vnd);
end;
$$;
revoke execute on function public.voucher_check(text, bigint, uuid) from public, anon;
grant execute on function public.voucher_check(text, bigint, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- ÁP MÃ VÀO ĐƠN THẬT (ghi)
-- ════════════════════════════════════════════════════════════════════
-- Kiểm LẠI TỪ ĐẦU, không tin kết quả `voucher_check` mà màn hình gửi lên: giữa
-- lúc gõ mã và lúc bấm "Tạo đơn", quầy khác có thể vừa dùng nốt lượt cuối.
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

  -- KHOÁ dòng voucher trước khi đếm lượt: hai quầy cùng gõ mã còn 1 lượt cuối
  -- đều thấy "còn lượt" rồi cùng ghi ⇒ vượt trần. Kiểm ở tầng web không đỡ được.
  select * into v_v from public.vouchers
   where tenant_id = v_tenant and upper(code) = upper(trim(p_code))
   for update;
  if not found then return jsonb_build_object('ok', false, 'ly_do', 'khong_ton_tai'); end if;

  select coalesce(sum(qty * unit_price_vnd - discount_vnd), 0)::bigint
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
    select id, (qty * unit_price_vnd - discount_vnd)::bigint as tien
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
revoke execute on function public.voucher_apply(uuid, text) from public, anon;
grant execute on function public.voucher_apply(uuid, text) to authenticated;
