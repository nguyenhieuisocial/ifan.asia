-- Doanh thu tích luỹ của khách: tính TỪ ĐƠN HÀNG, thôi cộng đôi với cơ hội.
--
-- ═══════════════════════════════════════════════════════════════════
-- FOUNDER ĐÃ CHỐT (20/08): doanh thu tính từ ĐƠN HÀNG, không phải cơ hội
-- ═══════════════════════════════════════════════════════════════════
-- `recompute_contact_tier` đang cộng HAI nguồn vào `total_revenue`:
--     v_revenue := (tổng cơ hội ĐÃ THẮNG) + (tổng đơn ĐÃ XONG)
--
-- Khách vừa có cơ hội thắng vừa có đơn xong thì bị ĐẾM ĐÔI — đo được 20/08:
-- 13 khách trên 6 tiệm mẫu. Đây là việc #203.
--
-- Founder chốt: doanh thu = đơn hàng. Nên bỏ hẳn nguồn cơ hội khỏi doanh thu.
-- "Đã chi bao nhiêu" giờ = tổng đơn đã xong (đơn bán cộng, phiếu hoàn trừ).
--
-- ═══════════════════════════════════════════════════════════════════
-- "SỐ LẦN MUA" CŨNG PHẢI ĐỔI, KHÔNG THÌ LẠI ĐÁ NHAU
-- ═══════════════════════════════════════════════════════════════════
-- Hạng khách quyết bằng HAI ngưỡng: doanh thu ≥ X, HOẶC "số lần mua" ≥ Y.
-- Bản cũ đếm "số lần mua" = số CƠ HỘI đã thắng. Nếu chỉ đổi doanh thu sang đơn
-- mà để "số lần mua" đếm cơ hội, thì một tiệm bán bằng đơn sẽ có: doanh thu
-- đếm đơn, số-lần-mua đếm cơ hội (= 0) — đúng kiểu "số liệu đá nhau" đang chữa.
--
-- ⇒ Đổi luôn: "số lần mua" = số ĐƠN BÁN đã xong (`kind='order'`, không tính
-- phiếu hoàn). Đó là nghĩa tự nhiên của "khách mua N lần".
--
-- Ngưỡng `vip_min_won_deals` / `regular_min_won_deals` giữ nguyên GIÁ TRỊ (chủ
-- tiệm đã đặt) — chỉ ĐỔI Ý NGHĨA từ "cơ hội thắng" sang "đơn mua". Tên cột vẫn
-- mang chữ "won_deals" là di sản lược đồ; đổi tên cột đụng màn Cài đặt nên để
-- riêng, không gộp vào bản vá dữ liệu này.
--
-- ═══════════════════════════════════════════════════════════════════
-- CÁC TRIGGER TỪ `deals` GIỜ THÀNH VÔ HẠI, KHÔNG CẦN GỠ
-- ═══════════════════════════════════════════════════════════════════
-- `deals_tier_recompute` vẫn gọi hàm này khi cơ hội đổi trạng thái, nhưng hàm
-- nay không đọc `deals` nữa ⇒ cơ hội đổi không làm hạng đổi (trừ khi chạm
-- `last_interaction_at`, là đúng). Để nguyên trigger: một lần tính lại vô hại
-- còn hơn gỡ trigger rồi sau này quên vì sao. Cơ hội cũng hiếm dùng từ khi
-- sản phẩm chạy bằng đơn.

create or replace function public.recompute_contact_tier(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tenant uuid;
  v_since timestamptz;   -- mốc im lặng: tương tác cuối, chưa có thì ngày tạo
  v_revenue bigint;
  v_won int;             -- SỐ LẦN MUA = số đơn bán đã xong (#225, trước là số cơ hội thắng)
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

  -- #225: DOANH THU = đơn ĐÃ XONG (founder chốt 20/08 — tính từ đơn hàng, không
  -- phải cơ hội). Đọc cột sinh `line_total_vnd` (#198), không tự nhân tay: nhờ
  -- thế phiếu hoàn trừ đúng bằng phần đã bán. Không lọc `kind` — đơn bán cộng,
  -- phiếu hoàn trừ, đó là "khách này đã thật sự chi bao nhiêu".
  -- Trước #225 còn cộng thêm tổng cơ hội đã thắng ⇒ khách vừa có cơ hội vừa có
  -- đơn bị đếm đôi (13 khách, việc #203).
  select coalesce(sum(l.line_total_vnd), 0)::bigint
    into v_revenue
    from public.orders o
    join public.order_lines l on l.order_id = o.id
   where o.contact_id = p_contact_id
     and o.status = 'completed'
     and o.deleted_at is null;

  -- #225: SỐ LẦN MUA = số ĐƠN BÁN đã xong (`kind='order'`). Phiếu hoàn
  -- (`kind='return'`) không phải một lần mua nên không đếm.
  select count(*)::int
    into v_won
    from public.orders o
   where o.contact_id = p_contact_id
     and o.status = 'completed'
     and o.kind = 'order'
     and o.deleted_at is null;

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
end $function$;

comment on function public.recompute_contact_tier(uuid) is
  'Tinh lai doanh thu tich luy + hang cua mot khach. #225 (founder chot 20/08): doanh thu = DON DA XONG (ban cong, hoan tru), THOI cong them co hoi da thang — truoc do cong doi, 13 khach bi dem doi (viec #203). "So lan mua" (nguong vip/regular_min_won_deals) cung doi tu "so co hoi thang" sang "so DON BAN da xong (kind=order)". Ten cot van mang "won_deals" la di san luoc do.';

-- Tính lại toàn bộ khách bằng logic mới. `is distinct from` trong hàm bảo đảm
-- chỉ khách THAY ĐỔI mới bị ghi (13 khách đếm đôi + ai đổi hạng) — không phát
-- event thừa cho hàng nghìn khách không đổi.
select public.recompute_contact_tier(id)
  from public.contacts where deleted_at is null;
