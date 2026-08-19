-- GIÁ TRỊ MỘT DÒNG HÀNG — MỘT ĐỊNH NGHĨA DUY NHẤT, ĐÚNG CẢ Ở PHIẾU HOÀN.
-- (19/08/2026, việc #198)
--
-- ═══════════════════════════════════════════════════════════════════
-- LỖ LÀ GÌ
-- ═══════════════════════════════════════════════════════════════════
-- Dòng của phiếu hoàn mang `qty` ÂM (ép bởi `order_lines_sign_guard`, #127)
-- nhưng `discount_vnd` vẫn DƯƠNG (CHECK `discount_vnd >= 0`, cùng #127). Công
-- thức chung mà cả kho đang dùng — `qty * unit_price_vnd - discount_vnd` — vì
-- thế cộng thêm khoản giảm thay vì trừ đi:
--
--     hoàn 2 món giá 1.000.000, đã giảm 400.000
--     công thức chung:  -2 × 1.000.000 − 400.000 = −2.400.000
--     số đúng:         −(2 × 1.000.000 − 400.000) = −1.600.000
--     lệch:                                          −800.000  = 2 × khoản giảm
--
-- Đo thật trên CSDL (một giao dịch rồi rollback), 19/08:
--
--   ┌─────────────────────────────┬──────────────┬──────────────┬────────────┐
--   │ Số gì                       │ KHO ĐANG TÍNH│     SỐ ĐÚNG  │      CHÊNH │
--   ├─────────────────────────────┼──────────────┼──────────────┼────────────┤
--   │ Tổng tiền phiếu hoàn        │   −2.400.000 │   −1.600.000 │   −800.000 │
--   │ Doanh số ghi vào hoa hồng   │   −2.400.000 │   −1.600.000 │   −800.000 │
--   │ Hoa hồng bị trừ lại (5%)    │     −120.000 │      −80.000 │    −40.000 │
--   └─────────────────────────────┴──────────────┴──────────────┴────────────┘
--
--   Hoa hồng đơn gốc cộng 80.000, hoàn hết hàng thì tổng còn −40.000 —
--   đúng phải là 0. Nhân viên MẤT TIỀN THẬT vì một phép cộng sai dấu.
--
-- Hai chỗ chịu hậu quả: (1) tổng tiền phiếu hoàn chủ tiệm đọc trên màn hình,
-- (2) hoa hồng bị trừ lại của nhân viên. Bản #195 đã phải tự tính riêng bằng
-- `abs(qty)` và ghi rõ ở khối ⚠️ đầu file rằng hai chỗ này CÒN SAI — bản này
-- trả nốt.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO LÀ CỘT SINH, KHÔNG PHẢI VÁ TỪNG NƠI
-- ═══════════════════════════════════════════════════════════════════
-- Công thức này đang được CHÉP TAY ở 9 chỗ (5 trong SQL, 4 trong TypeScript).
-- Vá từng chỗ nghĩa là để lại 9 bản chép có thể lệch nhau lần sau — mà lần này
-- đã lệch rồi: #195 tự tính đúng cho riêng nó, phần còn lại vẫn sai. Đặt định
-- nghĩa vào CỘT SINH của bảng thì:
--   · SQL đọc `l.line_total_vnd` thay vì tự nhân;
--   · TypeScript đọc cùng cột đó qua PostgREST — không có bản chép nào ở tầng
--     web nữa, nên không có đường nào để hai tầng lệch nhau;
--   · giá trị được CSDL tự tính lúc ghi, không có đường ghi thô nào đặt sai.
--
-- Luật của cột: đổi dấu số lượng thì đổi dấu giá trị, ĐÚNG BẰNG NHAU.
--     line_total(−q, p, d) = − line_total(q, p, d)
-- Với `qty` dương, biểu thức ra ĐÚNG số cũ (`abs(q) = q`) ⇒ không đơn bán nào
-- đổi số. Chỉ phiếu hoàn được sửa.
--
-- KHÔNG kẹp về 0 (không `greatest(…, 0)` như #195 dùng cho phép tính tỉ lệ):
-- ở đây `greatest` sẽ giấu mất dữ liệu hỏng (giảm nhiều hơn giá dòng) thay vì
-- để nó hiện ra. #195 kẹp vì nó đang chia — số âm ở mẫu số sinh tỉ lệ vô nghĩa.

-- ════════════════════════════════════════════════════════════════════
-- 1. CỘT SINH — định nghĩa DUY NHẤT của "giá trị một dòng hàng"
-- ════════════════════════════════════════════════════════════════════
-- `qty` là `numeric` (#127 — dịch vụ có thể tính 1,5 giờ) nên phải `round`
-- trước khi về `bigint`, đúng như `commission_sinh_cho_don` (#180) vẫn làm.
alter table public.order_lines
  add column if not exists line_total_vnd bigint
  generated always as (
    round(
      (case when qty < 0 then -1 else 1 end)
      * (abs(qty) * unit_price_vnd - discount_vnd)
    )::bigint
  ) stored;

comment on column public.order_lines.line_total_vnd is
  'Gia tri dong hang = so luong × don gia − giam gia, DOI DAU theo dau cua qty. Cot SINH: CSDL tu tinh, khong ghi thang duoc. Doc cot nay thay vi tu nhan — dong phieu hoan co qty AM ma discount_vnd DUONG, nen cong thuc chep tay `qty*unit_price-discount` ra so lon hon that dung hai lan khoan giam (#198).';

-- ════════════════════════════════════════════════════════════════════
-- 2. HOA HỒNG — đọc cột sinh thay vì tự nhân
-- ════════════════════════════════════════════════════════════════════
-- Chỉ đổi hai biểu thức `doanh_so`/`tien`; phần còn lại giữ NGUYÊN của #180
-- (chuỗi ba bậc tra người hưởng, phiếu hoàn trừ về người của đơn gốc,
-- `on conflict do nothing` chống chốt hai lần). Quyền vẫn là quyền #196 đặt —
-- `create or replace` KHÔNG đặt lại ACL, nhưng nhắc lại ở cuối cho khỏi trôi.
create or replace function public.commission_sinh_cho_don(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
begin
  insert into public.commission_entries (
    tenant_id, employee_id, order_line_id, order_id,
    earned_on, amount_vnd, job_type, base_vnd, percent, note, created_by
  )
  select
    d.tenant_id,
    d.employee_id,
    d.line_id,
    d.order_id,
    d.earned_on,
    d.tien,
    d.job_type,
    d.doanh_so,
    d.percent,
    null,
    d.created_by
  from (
    select
      o.tenant_id,
      e.id                                                 as employee_id,
      l.id                                                 as line_id,
      o.id                                                 as order_id,
      (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date as earned_on,
      -- ĐÂY là chỗ sửa của #198: `l.line_total_vnd` thay cho
      -- `round(l.qty * l.unit_price_vnd - l.discount_vnd)`.
      l.line_total_vnd                                     as doanh_so,
      r.percent                                            as percent,
      case when i.kind = 'service' then 'service' else 'product' end as job_type,
      round(l.line_total_vnd * r.percent / 100)::bigint    as tien,
      o.created_by
    from public.orders o
    join public.order_lines l on l.order_id = o.id
    join public.items i       on i.id = l.item_id
    -- Chuỗi ba bậc của điểm (2) ở #180. `left join` + `coalesce` chứ không
    -- `join`: dòng không tra ra người nào phải BIẾN MẤT khỏi kết quả, không
    -- được rơi vào một người mặc định nào.
    left join public.appointments a on a.id = l.appointment_id
    -- Phiếu hoàn trừ về người của ĐƠN GỐC, không phải người xử hoàn.
    left join public.orders parent   on parent.id = o.parent_order_id
    join public.employees e
      on e.tenant_id = o.tenant_id
     and e.user_id = coalesce(
           l.performed_by_user_id,
           a.staff_user_id,
           case when o.kind = 'return' then coalesce(parent.created_by, o.created_by)
                else o.created_by end)
    join public.commission_rates r
      on r.tenant_id = o.tenant_id
     and r.job_type = case when i.kind = 'service' then 'service' else 'product' end
    where o.id = p_order_id
      and o.status = 'completed'
      and o.deleted_at is null
  ) d
  where d.tien <> 0
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.commission_sinh_cho_don(uuid) from public, anon, authenticated;

comment on function public.commission_sinh_cho_don(uuid) is
  'Sinh khoan hoa hong cho moi dong hang cua mot don DA COMPLETED. NOI BO — trigger don hang goi, khong cap cho authenticated (#196). Idempotent nho chi muc commission_mot_dong_mot_nguoi (#167) + on conflict do nothing. Doanh so doc `order_lines.line_total_vnd` (#198) — truoc do tu nhan tay nen phieu hoan CO GIAM GIA bi tru qua tay dung hai lan khoan giam.';

-- ════════════════════════════════════════════════════════════════════
-- 3. THÙNG RÁC — cùng con số, cùng chỗ sai
-- ════════════════════════════════════════════════════════════════════
-- `trash_list` in tổng đơn vào tiêu đề dòng để chủ tiệm nhận ra đơn nào là đơn
-- nào. Phiếu hoàn có giảm giá bị xoá thì tiêu đề đó cũng đọc sai tiền — cùng
-- một lỗi, chỉ khác màn hình. Giữ nguyên bốn nhánh kia của #127.
create or replace function public.trash_list(p_limit int default 100)
returns table (
  entity_type text, entity_id uuid, title text, deleted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
begin
  if v_tenant is null or (select public.app_role()) not in ('owner','admin') then
    raise exception 'forbidden';
  end if;
  return query
    select 'contact'::text, c.id, c.full_name, c.deleted_at
      from public.contacts c
      where c.tenant_id = v_tenant and c.deleted_at is not null
    union all
    select 'deal'::text, d.id, d.title, d.deleted_at
      from public.deals d
      where d.tenant_id = v_tenant and d.deleted_at is not null
    union all
    select 'company'::text, co.id, co.name, co.deleted_at
      from public.companies co
      where co.tenant_id = v_tenant and co.deleted_at is not null
    union all
    select 'appointment'::text, a.id,
           ct.full_name || ' — ' ||
           to_char(a.start_at at time zone t.timezone, 'DD/MM HH24:MI'),
           a.deleted_at
      from public.appointments a
      join public.tenants t on t.id = a.tenant_id
      join public.contacts ct on ct.id = a.contact_id
      where a.tenant_id = v_tenant and a.deleted_at is not null
    union all
    -- Tiêu đề đọc được: tên khách + tổng đơn (tính từ dòng, không đọc cột nào)
    -- + kind — chủ tiệm phân biệt được đơn thường với phiếu hoàn trong thùng rác.
    select 'order'::text, o.id,
           ct.full_name || ' — ' ||
           to_char(coalesce(ol.total, 0), 'FM999G999G999') || 'đ' ||
           case when o.kind = 'return' then ' (hoàn)' else '' end,
           o.deleted_at
      from public.orders o
      join public.contacts ct on ct.id = o.contact_id
      left join lateral (
        -- #198: `line_total_vnd` thay cho `qty * unit_price_vnd - discount_vnd`.
        select sum(line_total_vnd) as total
          from public.order_lines where order_id = o.id
      ) ol on true
      where o.tenant_id = v_tenant and o.deleted_at is not null
    order by 4 desc
    limit p_limit;
end;
$$;
revoke execute on function public.trash_list(int) from public, anon;
grant execute on function public.trash_list(int) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 4. CHỖ CỐ Ý KHÔNG ĐỔI — nói ra để lần sau không ai tưởng bị bỏ sót
-- ════════════════════════════════════════════════════════════════════
-- · `order_payments_guard` (#127) tính tổng đơn bằng công thức chép tay. Với
--   đơn bán (`qty` dương) hai công thức cho ĐÚNG cùng một số. Với phiếu hoàn
--   cả hai đều ra số ÂM, mà `order_payments.amount_vnd` có CHECK `> 0`, nên
--   mọi khoản thu trên phiếu hoàn đều bị chặn y như nhau. Sửa hay không, hành
--   vi không đổi một ly ⇒ không đụng.
-- · `loyalty_earn_for_order` (#158, #159) và `loyalty_settle_return` (#195)
--   chỉ tính trên đơn `kind='order'` (thoát sớm) hoặc đã tự tính bằng `abs`.
--   Cả hai ĐÚNG sẵn.
-- · `voucher_apply` (#159) và `loyalty_redeem_for_order` (#194) chỉ chạy trên
--   đơn `draft/confirmed`; phiếu hoàn có tổng âm nên `min_order_vnd` /
--   `vuot_so_con_thieu` chặn lại. Không chứng minh được là KHÔNG có đường vào
--   — ghi ra đây làm việc theo dõi, không sửa lẫn vào bản này.
-- · `tong_ket_chien_dich` (#181) đi từ `voucher_redemptions`, mà mã giảm giá
--   không gắn được vào phiếu hoàn (điểm trên). Đúng theo đường đi hiện có.
