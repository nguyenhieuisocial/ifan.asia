-- VÁ BỐN LỖ TIỀN ĐO ĐƯỢC TRÊN DỮ LIỆU THẬT (20/08/2026, việc #206)
--
-- Bốn lỗ dưới đây không phải suy đoán: mỗi lỗ được dựng lại trên CSDL thật
-- trong một giao dịch rồi rollback, và mỗi lỗ có ĐỐI CHỨNG chứng minh đường
-- bình thường KHÔNG hỏng. Số đo trước/sau nằm ngay tại mỗi mục.
--
--   LỖ 1 · lãi gộp TỰ SINH LỜI ẢO mỗi khi khách trả hàng      (nặng nhất)
--   LỖ 2 · hồ sơ khách ghi "đã mua 0đ" trong khi đã mua hàng triệu
--   LỖ 3 · huỷ đơn đã xong: kho trả lại, doanh thu mất, HOA HỒNG VẪN CÒN
--   LỖ 4 · xoá đơn vào thùng rác: tiền + hoa hồng + dòng kho Ở LẠI
--
-- Cộng thêm: hai hàm CSDL còn CHÉP TAY công thức giá trị dòng hàng thay vì đọc
-- cột sinh `line_total_vnd` (#198) — cùng lớp bệnh, trả nốt ở mục 5.


-- ════════════════════════════════════════════════════════════════════
-- LỖ 1 — GIÁ VỐN CỦA DÒNG PHIẾU HOÀN PHẢI LÀ GIÁ VỐN CỦA DÒNG GỐC
-- ════════════════════════════════════════════════════════════════════
--
-- ĐO ĐƯỢC (bán 1 món rồi hoàn đúng món đó — đúng phải ra 0đ lãi gộp):
--
--   ┌────────────────────────┬──────────────┬──────────────┬────────────┐
--   │ Mặt hàng               │ vốn chốt lúc │ vốn dòng hoàn│ lãi gộp ra │
--   │                        │ bán          │ (giá hôm nay)│            │
--   ├────────────────────────┼──────────────┼──────────────┼────────────┤
--   │ Massage (ĐỐI CHỨNG,    │       90.000 │       90.000 │      0  ✓  │
--   │   vốn không đổi)       │              │              │            │
--   │ Serum dưỡng ẩm HA      │      180.000 │      247.500 │ +67.500 ✗  │
--   │ Kem chống nắng SPF50   │      140.000 │      176.000 │ +36.000 ✗  │
--   └────────────────────────┴──────────────┴──────────────┴────────────┘
--
-- ĐỐI CHỨNG 2 (đã chạy): nhân ba toàn bộ giá vốn hôm nay ⇒ lãi gộp tháng 7
-- KHÔNG đổi (13.325.000 trước và sau). Đơn bán cũ KHÔNG bị viết lại — chỉ dòng
-- phiếu hoàn ăn giá hôm nay. Tức là bệnh nằm đúng ở lúc CHÈN dòng hoàn.
--
-- GỐC: `order_lines_snapshot_cost` (#127) chụp giá vốn từ `item_costs` lúc chèn
-- dòng, KHÔNG phân biệt dòng bán với dòng hoàn. Mà `item_costs` bị mỗi phiếu
-- nhập hàng ĐÈ LẠI theo giá lần nhập (#151) — đo trong kho: 4/8 mặt hàng đã
-- trôi giá (dầu gội 70.000→99.000 · kem 140.000→176.000 · mặt nạ 15.000→24.750
-- · serum 180.000→247.500). Nên đây là lỗi CHẮC CHẮN TÁI DIỄN, không phải ca hiếm.
--
-- ── VÁ Ở TẦNG NÀO, VÀ VÌ SAO KHÔNG PHẢI Ở `createReturn` ──────────────
-- `order_line_costs` KHÔNG có policy ghi cho client (#127) — tầng web KHÔNG
-- ghi nổi cột này kể cả khi muốn; trigger `security definer` là ĐƯỜNG GHI DUY
-- NHẤT. Vá ở `createReturn` vì thế vừa không làm được, vừa sai chỗ: người ghi
-- thẳng qua PostgREST (tạo `orders` kind=return rồi chèn `order_lines`) vẫn đi
-- qua trigger này và vẫn phải ra số đúng. Một chốt ở đúng chỗ nghẽn phủ cả hai
-- đường; hai chốt ở hai tầng là hai chỗ có thể lệch nhau (luật D2).
-- ⇒ VÁ TẠI TRIGGER. `app/app/orders/actions.ts` KHÔNG cần đổi cho lỗ này.
--
-- ── TRA DÒNG GỐC BẰNG GÌ ──────────────────────────────────────────────
-- Dòng phiếu hoàn KHÔNG có cột trỏ về dòng gốc (`order_lines` không có
-- `parent_order_line_id`). Đường có sẵn: `orders.parent_order_id` → dòng của
-- đơn gốc CÙNG `item_id` + `variant_id`.
--
-- CỐ Ý KHÔNG thêm cột `parent_order_line_id`: người ghi thẳng qua API sẽ không
-- điền nó, nên trigger VẪN phải có nhánh tra theo mặt hàng — cột mới chỉ thêm
-- một đường thứ hai chứ không bỏ được đường thứ nhất (luật D2, và Mục 2 "không
-- code suy đoán").
--
-- Nhiều dòng cùng mặt hàng trong một đơn thì lấy dòng nào: thực tế cả hai dòng
-- chụp CÙNG một giá (cùng `item_costs`, cùng giao dịch). Nếu vẫn lệch thì thứ
-- tự `cost_vnd nulls first, pl.id` chọn bản THẬN TRỌNG: dòng nào CHƯA từng
-- nhập giá vốn (null) thì dòng hoàn cũng để null — giữ nguyên cảnh báo "lãi
-- gộp chưa đủ" của màn Lãi gộp thay vì bịa ra một con số; sau đó là giá vốn
-- NHỎ NHẤT, tức là hoàn lại ít vốn nhất, không bao giờ thổi phồng lãi gộp.

create or replace function public.order_lines_snapshot_cost() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_cost   bigint;
  v_parent uuid;
begin
  -- Dòng của PHIẾU HOÀN: giá vốn phải là giá vốn CHỐT LÚC BÁN của dòng gốc,
  -- không phải giá `item_costs` hôm nay.
  select o.parent_order_id into v_parent
    from public.orders o
   where o.id = new.order_id and o.kind = 'return';

  if v_parent is not null then
    select lc.cost_vnd into v_cost
      from public.order_lines pl
      join public.order_line_costs lc on lc.order_line_id = pl.id
     where pl.order_id  = v_parent
       and pl.item_id   = new.item_id
       and pl.variant_id is not distinct from new.variant_id
     order by lc.cost_vnd nulls first, pl.id
     limit 1;
    if found then
      insert into public.order_line_costs (order_line_id, tenant_id, cost_vnd)
        values (new.id, new.tenant_id, v_cost);
      return new;
    end if;
  end if;

  -- Mọi đường còn lại giữ NGUYÊN hành vi #127: đơn bán, phiếu hoàn không có
  -- đơn gốc, hoặc đơn gốc không có dòng nào cùng mặt hàng (dữ liệu bất thường
  -- — không im lặng bịa số, chỉ rơi về đúng cách cũ).
  select ic.cost_vnd into v_cost from public.item_costs ic where ic.item_id = new.item_id;
  insert into public.order_line_costs (order_line_id, tenant_id, cost_vnd)
    values (new.id, new.tenant_id, v_cost);
  return new;
end $$;

comment on function public.order_lines_snapshot_cost() is
  'Chup gia von luc chen dong hang. DONG PHIEU HOAN chep gia von cua DONG GOC (orders.parent_order_id + cung item_id/variant_id) chu KHONG doc item_costs hom nay — #127 khong phan biet hai loai dong nen moi phieu hoan sinh lai ao dung bang phan gia von da troi (do 20/08: serum +67.500, kem chong nang +36.000). Dong ban giu nguyen hanh vi cu.';


-- ════════════════════════════════════════════════════════════════════
-- LỖ 2 — DOANH THU TÍCH LUỸ PHẢI ĐẾM CẢ ĐƠN HÀNG, KHÔNG CHỈ CƠ HỘI
-- ════════════════════════════════════════════════════════════════════
--
-- ĐO ĐƯỢC: 7 khách · 33.970.000đ đơn ĐÃ XONG bị ghi 0đ trên hồ sơ.
--   Trần Ngọc Anh   — màn ghi 0đ, thật 6.910.000đ qua 9 đơn, hạng vẫn "Mới"
--                     trong khi ngưỡng VIP của tiệm là 5 triệu.
--   Nguyễn Thu Hà 6.210.000 · Trịnh Lan Hương 5.910.000 · Hoàng Yến Nhi
--   4.625.000 · Lê Thị Minh Thư 3.815.000 · Bùi Thanh Trúc 3.410.000 ·
--   Đặng Kim Ngân 3.410.000.
--
-- ĐỐI CHỨNG: `total_revenue` khớp 86/86 với tổng cơ hội đã thắng ⇒ con số
-- KHÔNG hỏng, nó đếm THIẾU MỘT NGUỒN.
--
-- GỐC: `recompute_contact_tier` (#19) cộng doanh thu CHỈ từ bảng `deals`, và
-- không trigger nào từ `orders` gọi lại nó. Mảng Đơn hàng dựng sau (#127) chưa
-- bao giờ được nối vào.
--
-- ── ĐẾM HAI LẦN? ĐÃ ĐO TRƯỚC KHI CHỐT CÁCH CỘNG ──────────────────────
-- Nếu một cơ hội đã thắng ĐẺ RA đơn hàng thì cộng cả hai là gấp đôi. Đo:
--   · KHÔNG có cột nào nối `orders` với `deals` (soát toàn bộ cột hai bảng:
--     0 cột `deal%` ở orders, 0 cột `order%` ở deals);
--   · KHÔNG có đường code nào tạo đơn từ một cơ hội (soát mọi chỗ ghi `orders`);
--   · 14 khách có cơ hội thắng · 10 khách có đơn xong · 3 khách có CẢ HAI, và
--     ở cả 3 thì số tiền lẫn số lượt đều KHÁC nhau (9.600.000/1 lượt so với
--     6.475.000/9 đơn · 7.000.000/1 so với 6.040.000/8 · 3.500.000/1 so với
--     3.855.000/8) — hai nguồn ghi hai việc khác nhau, không phải một việc ghi
--     hai lần.
-- ⇒ CỘNG THẲNG hai nguồn. Không có quan hệ nào để trừ trùng, và bịa ra một
--    phép trừ trùng theo ngày/số tiền là đoán mò trên tiền thật.
--
-- ── CHỖ CỐ Ý KHÔNG ĐỔI ───────────────────────────────────────────────
-- `v_won` (SỐ LẦN MUA, dùng cho ngưỡng `vip_min_won_deals`/
-- `regular_min_won_deals`) VẪN chỉ đếm `deals`. Hai lý do:
--   · ngưỡng đó chủ tiệm tự đặt với nghĩa "số cơ hội đã thắng"; nhét thêm đơn
--     hàng vào là đổi ý nghĩa một con số người ta đã cấu hình, sau lưng họ;
--   · lỗ được báo là lỗ TIỀN ("đã mua 0đ"), và tiền đi bằng `total_revenue`.
-- Khách chỉ mua bằng đơn hàng vẫn lên hạng ĐÚNG qua ngưỡng TIỀN (đo bên dưới:
-- Trần Ngọc Anh 6.910.000 ≥ 5.000.000 ⇒ VIP). Ghi ra đây làm việc theo dõi,
-- không lẫn vào bản này.
--
-- Phiếu hoàn TỰ ĐỘNG trừ đúng: dòng phiếu hoàn mang `line_total_vnd` ÂM (#198),
-- nên không cần nhánh riêng — mua 2 triệu rồi hoàn hết ra đúng 0đ.

create or replace function public.recompute_contact_tier(p_contact_id uuid)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_since timestamptz;   -- mốc im lặng: tương tác cuối, chưa có thì ngày tạo
  v_revenue bigint;
  v_don bigint;
  v_won int;
  v_vip_revenue bigint;
  v_vip_won int;
  v_regular_won int;
  v_dormant_days int;
  v_tier text;
begin
  select c.tenant_id, coalesce(c.last_interaction_at, c.created_at)
    into v_tenant, v_since
    from public.contacts c
   where c.id = p_contact_id and c.deleted_at is null;
  if not found then return; end if;

  -- Nguồn 1: cơ hội đã thắng (nguyên văn #19).
  select coalesce(sum(d.value_vnd), 0)::bigint, count(*)::int
    into v_revenue, v_won
    from public.deals d
   where d.contact_id = p_contact_id
     and d.status = 'won'
     and d.deleted_at is null;

  -- Nguồn 2 (#206): đơn hàng ĐÃ XONG. Đọc cột sinh `line_total_vnd` (#198) —
  -- KHÔNG tự nhân tay, và nhờ thế phiếu hoàn trừ lại đúng bằng phần đã bán.
  -- Không lọc `kind`: đơn bán cộng vào, phiếu hoàn trừ ra, đó chính là "khách
  -- này đã thật sự chi bao nhiêu".
  select coalesce(sum(l.line_total_vnd), 0)::bigint
    into v_don
    from public.orders o
    join public.order_lines l on l.order_id = o.id
   where o.contact_id = p_contact_id
     and o.status = 'completed'
     and o.deleted_at is null;

  v_revenue := v_revenue + v_don;

  -- left join (select 1): tenant chưa có dòng cấu hình vẫn được phân hạng theo mặc định
  select coalesce(tr.vip_min_revenue, 20000000),
         coalesce(tr.vip_min_won_deals, 5),
         coalesce(tr.regular_min_won_deals, 2),
         coalesce(tr.dormant_after_days, 90)
    into v_vip_revenue, v_vip_won, v_regular_won, v_dormant_days
    from (select 1) as one
    left join public.tier_rules tr on tr.tenant_id = v_tenant;

  if v_since < now() - make_interval(days => v_dormant_days) then
    v_tier := 'dormant';
  elsif v_revenue >= v_vip_revenue or v_won >= v_vip_won then
    v_tier := 'vip';
  elsif v_won >= v_regular_won then
    v_tier := 'regular';
  else
    v_tier := 'new';
  end if;

  -- Điều kiện `is distinct from` là thứ bảo đảm "không đổi ⇒ không phát event":
  -- không có dòng nào bị ghi thì contacts_emit_events cũng không chạy.
  update public.contacts
     set total_revenue = v_revenue,
         tier = v_tier
   where id = p_contact_id
     and (total_revenue is distinct from v_revenue or tier is distinct from v_tier);
end $$;

comment on function public.recompute_contact_tier(uuid) is
  'Tinh lai doanh thu tich luy + hang cua mot khach. Doanh thu = tong co hoi DA THANG + tong don DA XONG (#206 — truoc do chi dem deals nen 7 khach voi 33.970.000d don da xong bi ghi 0d). So LAN MUA (nguong vip_min_won_deals) VAN chi dem deals: nguong do chu tiem dat voi nghia "co hoi da thang".';

-- Trigger từ `orders` — thứ #19 chưa từng có. Danh sách cột OF = đúng các đầu
-- vào của phép cộng mới (`status`, `contact_id`, `deleted_at`), không thừa.
-- Dòng hàng KHÔNG cần trigger riêng: `order_lines_lock_guard` (#127) khoá dòng
-- khi đơn `completed`, nên dòng không thể đổi sau lúc đơn được tính.
create or replace function public.orders_tier_recompute() returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  if new.contact_id is not null then
    perform public.recompute_contact_tier(new.contact_id);
  end if;
  -- Chuyển đơn sang khách khác: khách CŨ mất doanh thu đó, phải tính lại luôn
  -- (cùng khuôn `deals_tier_recompute` của #19).
  if tg_op = 'UPDATE'
     and old.contact_id is distinct from new.contact_id
     and old.contact_id is not null then
    perform public.recompute_contact_tier(old.contact_id);
  end if;
  return null;
end $$;
revoke execute on function public.orders_tier_recompute() from public, anon;

drop trigger if exists orders_tier_recompute on public.orders;
create trigger orders_tier_recompute
  after insert or update of status, contact_id, deleted_at on public.orders
  for each row execute function public.orders_tier_recompute();

-- Backfill: không có dòng này thì 7 khách kia vẫn hiện 0đ mãi mãi — trigger chỉ
-- bắt được đơn đổi trạng thái TỪ GIỜ TRỞ ĐI. Khách nào thật sự đổi hạng sẽ phát
-- `contact.tier_changed` như mọi lần đổi hạng khác (#15), đúng bằng đường mà
-- backfill của #19 đã đi.
select public.recompute_contact_tier(id) from public.contacts where deleted_at is null;


-- ════════════════════════════════════════════════════════════════════
-- LỖ 3 — HUỶ ĐƠN ĐÃ XONG PHẢI TRỪ LẠI HOA HỒNG
-- ════════════════════════════════════════════════════════════════════
--
-- ĐO ĐƯỢC: đơn 1.000.000đ → Xong ⇒ hoa hồng 50.000đ, kho −1.
--           Huỷ ⇒ kho +1 (ĐÚNG), đơn rơi khỏi doanh thu, hoa hồng VẪN 50.000đ.
--
-- GỐC: trigger `orders_sinh_hoa_hong` (#180) chỉ có nhánh khi đơn VÀO
-- `completed`, không có nhánh khi đơn RỜI. Trigger kho `orders_sinh_dong_kho`
-- (#150) ĐÃ có nhánh `completed → cancelled` — bản này chép đúng khuôn đó, để
-- hai sổ đi cùng nhịp thay vì mỗi sổ một luật.
--
-- ĐỐI CHỨNG: phiếu hoàn thì trừ ĐÚNG (hoa hồng đi theo `qty` âm) ⇒ cơ chế trừ
-- CÓ TỒN TẠI, chỉ không phủ đường huỷ.
--
-- ── VÌ SAO GHI KHOẢN TRỪ CHỨ KHÔNG XOÁ KHOẢN CŨ ──────────────────────
-- Xoá là mất dấu vết một khoản đã từng được tính vào phiếu lương, và kho có
-- hẳn cổng `scripts/soat-xoa-khong-dieu-kien.mjs` chặn đúng lớp đó. Ghi thêm
-- một dòng ÂM giữ nguyên sổ, đúng khuôn `commission_sinh_cho_hop_dong(...,
-- p_reversal => true)` mà #180 đã dùng cho hợp đồng gói bị huỷ.
--
-- `earned_on` của khoản trừ = HÔM NAY, không phải ngày đơn. Lý do đúng bằng lý
-- do #180 đã ghi: nhét khoản trừ vào tháng đã trả lương xong là sửa ngược một
-- kỳ đã chốt. Khoản trừ rơi vào kỳ đang mở = đòi lại ở kỳ lương tới, đúng cách
-- một khoản truy thu thật vận hành.

-- Chỉ mục cũ `(order_line_id, employee_id)` không cho khoản trừ tồn tại cạnh
-- khoản cộng của cùng dòng. Thêm `is_reversal` vào khoá — ĐÚNG hình dạng
-- `commission_mot_hop_dong_mot_nguoi` (#180) đã dùng cho gói.
-- Nới khoá theo chiều này KHÔNG mất tính chống-trùng cũ: khoản cộng luôn mang
-- `is_reversal = false` nên vẫn duy nhất trên (dòng, người, false) — chốt đơn
-- hai lần vẫn không nhân đôi tiền; và huỷ hai lần cũng chỉ trừ một lần.
drop index if exists public.commission_mot_dong_mot_nguoi;
create unique index commission_mot_dong_mot_nguoi
  on public.commission_entries (order_line_id, employee_id, is_reversal)
  where order_line_id is not null;

create or replace function public.commission_dao_cho_don(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
begin
  -- Soi ĐÚNG các khoản đã sinh cho đơn này rồi ghi ảnh âm của chúng. Không
  -- tính lại từ tỉ lệ hôm nay: tỉ lệ có thể đã đổi từ lúc chốt đơn, và trừ
  -- theo tỉ lệ mới là đòi lại số tiền chưa từng trả.
  insert into public.commission_entries (
    tenant_id, employee_id, order_line_id, order_id, is_reversal,
    earned_on, amount_vnd, job_type, base_vnd, percent, note, created_by
  )
  select
    ce.tenant_id, ce.employee_id, ce.order_line_id, ce.order_id, true,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    -ce.amount_vnd, ce.job_type, -ce.base_vnd, ce.percent,
    'Huỷ đơn đã chốt', ce.created_by
  from public.commission_entries ce
  where ce.order_id = p_order_id
    and ce.order_line_id is not null
    and ce.is_reversal = false
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.commission_dao_cho_don(uuid) from public, anon, authenticated;

comment on function public.commission_dao_cho_don(uuid) is
  'Ghi khoan hoa hong AM doi ung tung khoan da sinh cho mot don, khi don ROI khoi completed. Chep anh am cua khoan cu (khong tinh lai theo ti le hom nay — ti le co the da doi). earned_on = HOM NAY de khong sua nguoc mot ky luong da chot (#180). Idempotent nho chi muc commission_mot_dong_mot_nguoi da co them is_reversal.';

create or replace function public.orders_sinh_hoa_hong()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.commission_sinh_cho_don(new.id);
  elsif new.status = 'cancelled' and old.status = 'completed' then
    -- ĐÚNG cặp nhánh của `orders_sinh_dong_kho` (#150). CỐ Ý không bắt mọi
    -- đường rời `completed` (ví dụ completed → confirmed): đơn quay lại
    -- `completed` sau đó sẽ bị chỉ mục duy nhất chặn không cho cộng lại, và
    -- người bán mất tiền oan. Huỷ là nhánh DUY NHẤT hôm nay có nghĩa "đơn này
    -- không còn là doanh thu", và đó cũng đúng bằng nhánh sổ kho đang chạy —
    -- hai sổ cùng nhịp thì không bao giờ nói hai câu khác nhau về một đơn.
    perform public.commission_dao_cho_don(new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.orders_sinh_hoa_hong() from public, anon, authenticated;

drop trigger if exists orders_sinh_hoa_hong on public.orders;
create trigger orders_sinh_hoa_hong
  after update of status on public.orders
  for each row
  when (new.status is distinct from old.status
        and (new.status = 'completed' or old.status = 'completed'))
  execute function public.orders_sinh_hoa_hong();

comment on function public.orders_sinh_hoa_hong() is
  'Chot don -> sinh hoa hong; HUY don DA CHOT -> ghi khoan tru doi ung (#206). Truoc #206 chi co nhanh vao completed nen huy mot don 1.000.000d tra lai kho nhung de nguyen 50.000d hoa hong.';


-- ════════════════════════════════════════════════════════════════════
-- LỖ 4 — XOÁ MỀM ĐƠN ĐÃ PHÁT SINH TIỀN: CHẶN, KHÔNG LAN CỜ
-- ════════════════════════════════════════════════════════════════════
--
-- ĐO ĐƯỢC (đơn 2.000.000đ đã thu đủ, xoá mềm): hoa hồng 100.000đ · sổ quỹ
-- 2.000.000đ · kho −1 ĐỀU CÒN NGUYÊN, chỉ màn Đơn/Lãi gộp/Excel là mất — ba
-- màn đó lọc `deleted_at is null`, còn `cash_entries`/`commission_entries`/
-- `stock_moves` không có đường lan cờ xoá.
--
-- ── ĐO TRƯỚC KHI QUYẾT, VÀ KẾT QUẢ ĐỔI CÁCH QUYẾT ────────────────────
-- Điểm xuất phát là "`orders.deleted_at` chỉ được ĐỌC, chưa có đường nào GHI,
-- 0 đơn đang mang giá trị" ⇒ nếu đúng thế thì thêm nhánh cho một trạng thái
-- chưa tồn tại là đoán mò (luật D2, đúng như #204 đã kết luận cho
-- `order_payments_guard`).
--
-- Đo lại thì ĐÚNG MỘT NỬA, và nửa còn lại đổi kết luận:
--   · 0/87 đơn đang mang `deleted_at` — đúng;
--   · 0 chỗ trong tầng web ghi `orders.deleted_at` — đúng (soát mọi chỗ ghi);
--   · NHƯNG RLS `orders_update` (#127) KHÔNG chặn cột đó: đo bằng phiên chủ
--     tiệm thật ⇒ `update orders set deleted_at = now()` GHI ĐƯỢC ngay hôm nay
--     qua PostgREST, và tiền/hoa hồng/kho ở lại y như báo cáo.
-- ⇒ Đây KHÔNG phải "trạng thái chưa tồn tại". Đây là trạng thái ĐI TỚI ĐƯỢC mà
--    KHÔNG AI GÁC. Chặn nó không phải đoán mò — là đóng một cửa đang mở.
--
-- ── VÌ SAO CHẶN CHỨ KHÔNG LAN CỜ XOÁ ─────────────────────────────────
-- Lan cờ sang ba sổ tiền đòi trả lời trước một loạt câu hỏi SẢN PHẨM chưa ai
-- hỏi: sổ quỹ đã nhận tiền thật thì "xoá" nghĩa là gì (tiền có trả lại khách
-- không)? phiếu lương đã trả rồi thì khoản hoa hồng biến mất hay bị đòi lại?
-- khôi phục từ thùng rác thì ba sổ dựng lại thế nào? Dựng một cơ chế xoá mềm
-- cho tiền mà không có màn hình nào, không có quyết định sản phẩm nào — ĐÓ mới
-- là đoán mò, và là kiểu đoán mò đắt nhất.
--
-- Đường ĐÚNG đã có sẵn và đã chạy: muốn bỏ một đơn ĐÃ CHỐT thì HUỶ nó — kho trả
-- lại (#150) và, từ bản này, hoa hồng trừ lại (LỖ 3 ở trên).
--
-- ── LUẬT HẸP TỚI ĐÂU: BỘ GÁC CŨ ĐÃ TRẢ LỜI, KHÔNG PHẢI TÔI ───────────
-- Bản đầu của chốt này chặn theo "đơn đã phát sinh TIỀN", kể cả khoản THU. Chạy
-- thử thì thấy nó làm ĐỎ một ca đang xanh của `scripts/rls-smoke.mjs` (V3 ca9a/
-- ca9b): ca đó CỐ Ý xoá mềm một đơn CÒN NHÁP đã đặt cọc 150.000đ rồi khẳng định
-- đơn vào Thùng rác và khôi phục lại được. Tức là "đơn chưa chốt có tiền cọc
-- vẫn bỏ thùng rác được" là QUYẾT ĐỊNH ĐÃ CHỐT của kho, có bộ gác canh — không
-- phải chỗ cho bản vá này lật.
--
-- Và quyết định đó đứng vững: khoản cọc là tiền tiệm ĐÃ NHẬN THẬT, nó nằm ở sổ
-- quỹ theo quyền riêng của sổ quỹ; còn đơn nháp thì CHƯA TỪNG được tính vào
-- doanh thu (mọi báo cáo lọc `status = 'completed'`). Bỏ một đơn nháp vào thùng
-- rác vì thế không làm lệch con số nào.
--
-- Cái LÀM LỆCH là đơn ĐÃ TỪNG CHỐT: đúng lúc đó hoa hồng sinh ra, kho bị trừ,
-- và đơn bắt đầu được tính vào doanh thu. Xoá mềm nó = rút MỘT vế khỏi ba sổ
-- đang khớp nhau. Nên luật hẹp đúng bằng chỗ đau:
--
--   chặn khi đơn ĐANG `completed`, hoặc CÒN DẤU VẾT đã từng chốt
--   (có khoản hoa hồng, hoặc có dòng kho sinh từ dòng hàng của đơn).
--
-- Khoản THU đứng một mình KHÔNG chặn — đó đúng là ca của bộ gác cũ.

create or replace function public.orders_soft_delete_guard() returns trigger
language plpgsql
-- `security definer`: hàm phải THẤY được `commission_entries` và `stock_moves`
-- của cả tiệm. Chạy quyền người gọi thì RLS lọc mất dòng của người khác, chốt
-- chặn trả "không có gì cả" và cho xoá — một chốt chặn nhìn qua RLS là một
-- chốt chặn nói dối.
security definer set search_path = public, pg_temp as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if new.status = 'completed'
       or exists (select 1 from public.commission_entries ce where ce.order_id = new.id)
       or exists (select 1 from public.stock_moves sm
                    join public.order_lines l on l.id = sm.ref_id
                   where sm.ref_type = 'order_line' and l.order_id = new.id)
    then
      raise exception 'order_completed_no_trash: đơn % đã từng chốt (đã sinh hoa hồng và dòng kho) — không bỏ vào thùng rác được. Muốn bỏ đơn thì HUỶ đơn: kho trả lại và hoa hồng trừ lại đúng, sổ sách không hở.',
        new.id using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.orders_soft_delete_guard() from public, anon;

drop trigger if exists orders_soft_delete_guard on public.orders;
-- `before update of deleted_at`: khôi phục từ thùng rác (`deleted_at = null`)
-- KHÔNG bị chặn — nhánh trên chỉ bắt chiều ĐANG XOÁ.
create trigger orders_soft_delete_guard
  before update of deleted_at on public.orders
  for each row execute function public.orders_soft_delete_guard();

comment on function public.orders_soft_delete_guard() is
  'Chan xoa mem mot don DA TUNG CHOT (status completed, hoac con commission_entries / stock_moves). Ly do: cac so tien khong theo co deleted_at, nen don xoa mem bien mat khoi man Don/Lai gop/Excel trong khi hoa hong + dong kho + so quy o lai (do 20/08: 100.000d hoa hong, 2.000.000d so quy, kho -1). Duong dung de bo mot don da chot la HUY don. CO Y khong chan don chua chot chi co khoan THU (tien coc): rls-smoke V3 ca9a/ca9b canh dung hanh vi do. Khoi phuc tu thung rac khong bi chan.';


-- ════════════════════════════════════════════════════════════════════
-- 5. NỢ TIỀM ẨN — HAI HÀM CÒN CHÉP TAY CÔNG THỨC GIÁ TRỊ DÒNG
-- ════════════════════════════════════════════════════════════════════
--
-- #198 đặt định nghĩa DUY NHẤT của "giá trị một dòng hàng" vào cột sinh
-- `order_lines.line_total_vnd` (đổi dấu theo dấu `qty`), rồi sửa hai chỗ đọc.
-- Ba chỗ được báo là còn chép tay; đo lại từng chỗ:
--
--   ┌───────────────────────────────┬──────────────────────────────────────┐
--   │ Hàm                           │ ĐO ĐƯỢC                              │
--   ├───────────────────────────────┼──────────────────────────────────────┤
--   │ order_payments_guard (#204)   │ chép tay. Trên PHIẾU HOÀN hai công    │
--   │                               │ thức ra −2.400.000 và −1.600.000 —   │
--   │                               │ KHÁC NHAU. Hành vi thì không đổi      │
--   │                               │ (amount_vnd có CHECK > 0 nên thu vào │
--   │                               │ phiếu hoàn bị chặn ở cả hai bản).    │
--   │                               │ ⇒ SỬA, để câu báo lỗi in đúng số     │
--   │                               │   tổng đơn và để còn MỘT định nghĩa. │
--   ├───────────────────────────────┼──────────────────────────────────────┤
--   │ campaign_tong_ket (#181)      │ chép tay, và ĐI TỚI ĐƯỢC: đo thấy    │
--   │                               │ `voucher_redemptions` GHI ĐƯỢC một   │
--   │                               │ lượt trỏ vào PHIẾU HOÀN (chỉ hàm     │
--   │                               │ `voucher_apply` chặn — #200 — chứ     │
--   │                               │ RLS thì không). Khi đó doanh thu     │
--   │                               │ chiến dịch lệch ĐÚNG HAI LẦN khoản   │
--   │                               │ giảm. ⇒ SỬA.                         │
--   ├───────────────────────────────┼──────────────────────────────────────┤
--   │ order_lines_discount_cap_guard│ KHÔNG chép công thức giá trị dòng —  │
--   │ (#183)                        │ nó tính `qty × đơn giá` làm MẪU SỐ   │
--   │                               │ của tỷ lệ giảm, cố ý không trừ giảm  │
--   │                               │ giá. Và `qty` âm không bao giờ tới    │
--   │                               │ được: hai chốt độc lập chặn trước —  │
--   │                               │ ④ miễn cho `kind='return'` (đo: ghi   │
--   │                               │ được, không bị chặn) và               │
--   │                               │ `order_lines_sign_guard` (#127) cấm   │
--   │                               │ qty âm trên đơn bán. ⇒ KHÔNG ĐỤNG.   │
--   │                               │ Cột sinh cũng không dùng được ở đây:  │
--   │                               │ trigger `before`, cột sinh chưa tính. │
--   └───────────────────────────────┴──────────────────────────────────────┘
--
-- Hôm nay 0/170 dòng hàng có giảm giá nên chưa đồng nào lệch. Nhưng
-- `createReturn` chép giảm giá theo tỷ lệ, nên PHIẾU HOÀN ĐẦU TIÊN của một
-- dòng CÓ giảm giá là lúc cả hai chỗ trên bắt đầu sai.

-- ── 5a. order_payments_guard — giữ NGUYÊN hai nhánh của #204 ──────────
create or replace function public.order_payments_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_total bigint;
  v_paid bigint;
  v_status text;
begin
  select status into v_status
    from public.orders
   where id = new.order_id and tenant_id = new.tenant_id;
  if v_status = 'cancelled' then
    raise exception 'order_cancelled: đơn % đã huỷ — không thu tiền vào đơn đã huỷ; trả lại tiền thì tạo phiếu hoàn',
      new.order_id
      using errcode = '23514';
  end if;

  -- #206: `line_total_vnd` thay cho `qty * unit_price_vnd - discount_vnd`.
  select coalesce(sum(line_total_vnd), 0) into v_total
    from public.order_lines where order_id = new.order_id;
  select coalesce(sum(amount_vnd), 0) into v_paid
    from public.order_payments where order_id = new.order_id;
  if v_paid + new.amount_vnd > v_total then
    raise exception 'payment_exceeds_order_total: đơn % tổng %đ, đã thu %đ, thu thêm %đ sẽ vượt',
      new.order_id, v_total, v_paid, new.amount_vnd
      using errcode = '23514';
  end if;
  return new;
end $$;

comment on function public.order_payments_guard() is
  'Chot chan truoc khi ghi mot khoan thu: don da huy thi khong thu, va tong thu khong vuot tong don. Nhanh don-da-huy them o #204. Tong don doc `order_lines.line_total_vnd` (#206) thay vi chep tay — voi don ban hai cach cho cung mot so, voi phieu hoan cach chep tay in ra so lon hon that dung hai lan khoan giam trong cau bao loi.';

-- ── 5b. campaign_tong_ket — giữ NGUYÊN toàn bộ phần còn lại của #181 ──
create or replace function public.campaign_tong_ket(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c         public.campaigns;
  v_ket       timestamptz;
  v_dai       interval;
  v_revenue   bigint := 0;
  v_discount  bigint := 0;
  v_cogs      bigint := 0;
  v_thieu     integer := 0;
  v_uses      integer := 0;
  v_moi       integer := 0;
  v_trong     integer := 0;
  v_nen       integer := 0;
  v_optout    integer := 0;
begin
  select * into v_c from public.campaigns where id = p_campaign_id;
  if not found then raise exception 'campaign_not_found'; end if;

  -- Điểm (5): kỳ đo dừng ở mốc sớm nhất trong ba mốc — dừng máy, hết hạn, bây giờ.
  v_ket := least(coalesce(v_c.stopped_at, v_c.end_at), now());
  if v_ket < v_c.start_at then v_ket := v_c.start_at; end if;
  v_dai := v_ket - v_c.start_at;

  -- ── Tiền: chỉ đơn đã hoàn tất có dùng mã của chiến dịch (điểm 1 + 2) ──
  -- #206: `l.line_total_vnd` thay cho `l.qty * l.unit_price_vnd - l.discount_vnd`.
  select
    coalesce(sum(l.line_total_vnd), 0)::bigint,
    count(*) filter (where lc.cost_vnd is null),
    coalesce(sum(lc.cost_vnd * l.qty) filter (where lc.cost_vnd is not null), 0)::bigint
  into v_revenue, v_thieu, v_cogs
  from public.voucher_redemptions vr
  join public.vouchers v   on v.id = vr.voucher_id
  join public.orders o     on o.id = vr.order_id
  join public.order_lines l on l.order_id = o.id
  left join public.order_line_costs lc on lc.order_line_id = l.id
  where v.campaign_id = p_campaign_id
    and o.status = 'completed'
    and o.deleted_at is null;

  select coalesce(sum(vr.discount_vnd), 0)::bigint, count(*)
  into v_discount, v_uses
  from public.voucher_redemptions vr
  join public.vouchers v on v.id = vr.voucher_id
  join public.orders o   on o.id = vr.order_id
  where v.campaign_id = p_campaign_id
    and o.status = 'completed'
    and o.deleted_at is null;

  -- Điểm (3): cộng NGƯỢC tiền giảm vào doanh thu, vì nó đã bị trừ sẵn ở dòng hàng.
  v_revenue := v_revenue + v_discount;

  -- ── Khách mới: chưa từng có đơn hoàn tất nào TRƯỚC ngày chiến dịch bắt đầu ──
  select count(*) into v_moi
  from (
    select distinct o.contact_id
    from public.voucher_redemptions vr
    join public.vouchers v on v.id = vr.voucher_id
    join public.orders o   on o.id = vr.order_id
    where v.campaign_id = p_campaign_id
      and o.status = 'completed'
      and o.deleted_at is null
  ) kh
  where not exists (
    select 1 from public.orders o2
     where o2.contact_id = kh.contact_id
       and o2.tenant_id = v_c.tenant_id
       and o2.status = 'completed'
       and o2.deleted_at is null
       and o2.created_at < v_c.start_at
  );

  -- ── Điểm (5): phần thật sự tăng thêm so với nền ──
  select count(*) into v_trong
    from public.orders o
   where o.tenant_id = v_c.tenant_id
     and o.kind = 'order'
     and o.status = 'completed'
     and o.deleted_at is null
     and o.created_at >= v_c.start_at
     and o.created_at <  v_ket;

  select count(*) into v_nen
    from public.orders o
   where o.tenant_id = v_c.tenant_id
     and o.kind = 'order'
     and o.status = 'completed'
     and o.deleted_at is null
     and o.created_at >= v_c.start_at - v_dai
     and o.created_at <  v_c.start_at;

  -- ── Quyết định 5 của thẻ: cái giá phải trả, đo bằng người rút đồng ý ──
  -- Chỉ tính người ĐÃ NHẬN TIN của ĐÚNG chiến dịch này, và rút SAU khi nhận —
  -- rút trước đó là chuyện của đợt khác, đổ lên đầu đợt này là đổ oan.
  select count(distinct rcp.contact_id) into v_optout
    from public.campaign_send_recipients rcp
    join public.campaign_sends s on s.id = rcp.send_id
    join public.contacts ct      on ct.id = rcp.contact_id
   where s.campaign_id = p_campaign_id
     and ct.marketing_consent = 'withdrawn'
     and ct.marketing_consent_withdrawn_at is not null
     and ct.marketing_consent_withdrawn_at >= s.send_at;

  insert into public.campaign_summary (
    campaign_id, tenant_id, generated_at,
    revenue_vnd, discount_vnd, ad_cost_vnd, cogs_vnd, net_vnd,
    uses_count, new_customer_count, incremental_count, opt_out_count,
    cogs_missing_lines
  ) values (
    p_campaign_id, v_c.tenant_id, now(),
    v_revenue, v_discount, v_c.ad_cost_vnd, greatest(v_cogs, 0),
    v_revenue - v_discount - v_c.ad_cost_vnd - greatest(v_cogs, 0),
    v_uses, v_moi, v_trong - v_nen, v_optout,
    v_thieu
  )
  on conflict (campaign_id) do update set
    generated_at       = excluded.generated_at,
    revenue_vnd        = excluded.revenue_vnd,
    discount_vnd       = excluded.discount_vnd,
    ad_cost_vnd        = excluded.ad_cost_vnd,
    cogs_vnd           = excluded.cogs_vnd,
    net_vnd            = excluded.net_vnd,
    uses_count         = excluded.uses_count,
    new_customer_count = excluded.new_customer_count,
    incremental_count  = excluded.incremental_count,
    opt_out_count      = excluded.opt_out_count,
    cogs_missing_lines = excluded.cogs_missing_lines;
end;
$$;
revoke execute on function public.campaign_tong_ket(uuid) from public, anon, authenticated;

comment on function public.campaign_tong_ket(uuid) is
  'Tinh lai bang tong ket cua mot chien dich tu orders + voucher_redemptions + order_line_costs. Chay lai duoc bao nhieu lan cung duoc (upsert theo campaign_id). Doanh thu doc `order_lines.line_total_vnd` (#206) — truoc do chep tay nen mot luot dung ma tro vao PHIEU HOAN (RLS cho ghi, chi voucher_apply chan) lam doanh thu lech dung hai lan khoan giam. Hang rao vai o campaign_tong_ket_yeu_cau().';
