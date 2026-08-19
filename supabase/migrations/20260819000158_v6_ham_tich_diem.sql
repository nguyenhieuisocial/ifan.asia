-- V6 retention (19/08/2026) — các hàm ghi sổ điểm.
--
-- Sổ điểm không có policy ghi (migration #157) ⇒ MỌI đường vào sổ đều đi qua ba
-- hàm dưới đây. Đó là chủ đích: trần, hạn, và thứ tự tiêu lô là luật của tiệm,
-- không phải thứ mỗi màn hình tự diễn giải một kiểu.
--
-- Cả ba đều SECURITY DEFINER (phải ghi vào bảng bị khoá) nên đều TỰ KIỂM tiệm
-- và vai ngay dòng đầu — bài học #175/#177: definer mà quên lọc tiệm là cửa
-- vượt tiệm, và `revoke ... from anon` phải viết tường minh vì hàm mới mặc định
-- cho PUBLIC gọi.

-- Lấy luật tích điểm của tiệm, tạo dòng mặc định nếu tiệm chưa từng mở màn Cài đặt.
create or replace function public.loyalty_config_get(p_tenant uuid)
returns public.loyalty_config
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg public.loyalty_config;
begin
  insert into public.loyalty_config (tenant_id) values (p_tenant)
  on conflict (tenant_id) do nothing;
  select * into v_cfg from public.loyalty_config where tenant_id = p_tenant;
  return v_cfg;
end;
$$;
revoke execute on function public.loyalty_config_get(uuid) from public, anon;

-- ════════════════════════════════════════════════════════════════════
-- CỘNG ĐIỂM CHO MỘT ĐƠN
-- ════════════════════════════════════════════════════════════════════
-- Trả về số điểm đã cộng (0 = không cộng, kèm lý do trong `note` của sổ nếu có).
--
-- Tính trên số tiền KHÁCH THỰC TRẢ (đã trừ giảm giá dòng + voucher), không phải
-- giá gốc: tích điểm trên phần đã giảm là tự nhân đôi khoản lỗ.
create or replace function public.loyalty_earn_for_order(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant  uuid := (select public.current_tenant_id());
  v_role    text := (select public.app_role());
  v_order   public.orders;
  v_cfg     public.loyalty_config;
  v_goc     bigint;
  v_voucher bigint;
  v_thuc    bigint;
  v_diem    integer;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- Vai Chỉ xem không bán hàng ⇒ không phát sinh điểm.
  if v_role not in ('owner', 'admin', 'manager', 'staff') then raise exception 'forbidden'; end if;

  select * into v_order from public.orders
   where id = p_order_id and tenant_id = v_tenant and deleted_at is null;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.contact_id is null then return 0; end if;   -- khách vãng lai, không có ví
  if v_order.kind <> 'order' then return 0; end if;      -- đơn hoàn/trả không tích

  v_cfg := public.loyalty_config_get(v_tenant);
  if not v_cfg.is_active then return 0; end if;

  select coalesce(sum(qty * unit_price_vnd - discount_vnd), 0)::bigint
    into v_goc from public.order_lines where order_id = p_order_id;
  select coalesce(sum(discount_vnd), 0)::bigint
    into v_voucher from public.voucher_redemptions where order_id = p_order_id;

  v_thuc := greatest(v_goc - v_voucher, 0);
  v_diem := floor(v_thuc / v_cfg.vnd_per_point)::integer;
  if v_diem <= 0 then return 0; end if;

  -- Chỉ mục unique `loyalty_ledger_order_unique` chặn tích hai lần cho cùng đơn.
  -- Dùng on conflict thay vì tự kiểm trước: hai lượt thu tiền sát nhau đều thấy
  -- "chưa tích" rồi cùng ghi — kiểm ở tầng gọi không đỡ được.
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
-- TIÊU ĐIỂM
-- ════════════════════════════════════════════════════════════════════
-- Trả về số tiền (đồng) khách được giảm. Tiêu lô SẮP HẾT HẠN TRƯỚC — nếu tiêu lô
-- mới trước thì lô cũ nằm chờ tới ngày hết hạn rồi bốc hơi, khách mất điểm oan.
create or replace function public.loyalty_redeem(
  p_contact_id uuid,
  p_points     integer,
  p_order_id   uuid default null,
  p_note       text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_cfg    public.loyalty_config;
  v_con    bigint;
  v_lo     record;
  v_lay    integer;
  v_conlai integer := p_points;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin', 'manager', 'staff') then raise exception 'forbidden'; end if;
  if p_points is null or p_points <= 0 then raise exception 'invalid_points'; end if;

  if not exists (select 1 from public.contacts
                  where id = p_contact_id and tenant_id = v_tenant and deleted_at is null) then
    raise exception 'contact_not_found';
  end if;

  v_cfg := public.loyalty_config_get(v_tenant);
  if not v_cfg.is_active then raise exception 'loyalty_off'; end if;
  -- Chỉ đổi theo đúng bội số đã công bố ("1.000 điểm đổi 100.000đ"): cho đổi lẻ
  -- thì con số quy đổi trên màn hình và số tiền giảm thật sẽ lệch nhau.
  if p_points % v_cfg.redeem_points_unit <> 0 then raise exception 'not_multiple'; end if;

  -- KHOÁ các lô của đúng khách này trước khi đọc số dư: hai quầy cùng bấm "Dùng
  -- ngay" cho một khách đều thấy đủ điểm rồi cùng trừ ⇒ tiêu quá số có.
  perform 1 from public.loyalty_ledger
   where tenant_id = v_tenant and contact_id = p_contact_id and remaining > 0
   for update;

  select coalesce(sum(remaining), 0) into v_con from public.loyalty_ledger
   where tenant_id = v_tenant and contact_id = p_contact_id
     and remaining > 0 and expires_at > now();
  if v_con < p_points then raise exception 'not_enough_points'; end if;

  for v_lo in
    select id, remaining from public.loyalty_ledger
     where tenant_id = v_tenant and contact_id = p_contact_id
       and remaining > 0 and expires_at > now()
     order by expires_at asc, created_at asc
  loop
    exit when v_conlai <= 0;
    v_lay := least(v_lo.remaining, v_conlai);
    update public.loyalty_ledger set remaining = remaining - v_lay where id = v_lo.id;
    v_conlai := v_conlai - v_lay;
  end loop;

  insert into public.loyalty_ledger
    (tenant_id, contact_id, delta_points, reason, order_id, note, remaining, created_by)
  values (v_tenant, p_contact_id, -p_points, 'redeem', p_order_id, p_note, 0, auth.uid());

  return (p_points::bigint * v_cfg.redeem_value_vnd / v_cfg.redeem_points_unit);
end;
$$;
revoke execute on function public.loyalty_redeem(uuid, integer, uuid, text) from public, anon;
grant execute on function public.loyalty_redeem(uuid, integer, uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- TẶNG ĐIỂM TAY (giới thiệu bạn, bù trừ khiếu nại)
-- ════════════════════════════════════════════════════════════════════
-- Chỉ quản lý trở lên: tặng điểm là tặng NỢ của tiệm, không phải thao tác bán hàng.
create or replace function public.loyalty_grant(
  p_contact_id uuid,
  p_points     integer,
  p_reason     text default 'manual',
  p_note       text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_cfg    public.loyalty_config;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'forbidden'; end if;
  if p_points is null or p_points <= 0 then raise exception 'invalid_points'; end if;
  if p_reason not in ('referral', 'manual', 'adjust') then raise exception 'invalid_reason'; end if;

  if not exists (select 1 from public.contacts
                  where id = p_contact_id and tenant_id = v_tenant and deleted_at is null) then
    raise exception 'contact_not_found';
  end if;

  v_cfg := public.loyalty_config_get(v_tenant);

  insert into public.loyalty_ledger
    (tenant_id, contact_id, delta_points, reason, note, expires_at, remaining, created_by)
  values (v_tenant, p_contact_id, p_points, p_reason, p_note,
          now() + make_interval(months => v_cfg.expire_months), p_points, auth.uid());

  return p_points;
end;
$$;
revoke execute on function public.loyalty_grant(uuid, integer, text, text) from public, anon;
grant execute on function public.loyalty_grant(uuid, integer, text, text) to authenticated;
