-- V8 events (19/08/2026) — ĐƯỜNG GHI cho `campaign_summary`.
-- Thẻ design: design-system/man-su-kien-marketing.html.
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO CÓ BẢN NÀY
-- ════════════════════════════════════════════════════════════════════
-- #171 dựng bảng `campaign_summary` với đủ 10 cột, và màn `/app/events` đọc nó
-- đúng: có dòng thì vẽ, không có thì nói thẳng "chưa có bản tổng kết" chứ không
-- vẽ số giả. Nhưng KHÔNG CÓ GÌ GHI VÀO BẢNG ĐÓ — nên câu "chưa có" là câu duy
-- nhất màn đó từng nói. Chủ tiệm chạy xong một đợt ưu đãi không biết nó có hiệu
-- quả không, trong khi "đo được mới gọi là chiến dịch" là lý do tồn tại của cả
-- mảng.
--
-- ════════════════════════════════════════════════════════════════════
-- SÁU CHỖ PHẢI CHỐT TRƯỚC — ghi lại để người sau không mở lại
-- ════════════════════════════════════════════════════════════════════
--
-- (1) ĐƠN NÀO LÀ ĐƠN CỦA CHIẾN DỊCH. Đường nối duy nhất có thật:
--     `voucher_redemptions.order_id` → `vouchers.campaign_id`. Không có cột
--     `orders.campaign_id` nào, và KHÔNG dựng thêm ở đây — #171 đã chốt "chiến
--     dịch không dựng hệ mã thứ hai", cột đó là hệ thứ hai đội lốt.
--
-- (2) CHỈ ĐƠN `completed`. Đơn nháp/đã huỷ chưa phải tiền. Cùng luật với
--     `lib/finance/gross-margin.ts` ("đơn ĐÃ XONG trong kỳ") — hai chỗ cùng tính
--     doanh thu mà lệch định nghĩa thì hai báo cáo cãi nhau.
--     ⚠️ Hệ quả PHẢI nói ra trên màn: `uses_count` ở đây có thể NHỎ HƠN con số
--     "đã cho đi bao nhiêu" trên thẻ chiến dịch, vì con số kia đếm MỌI lượt dùng
--     (đúng như vậy: trần tiền giảm phải chặn cả lượt trên đơn chưa chốt).
--
-- (3) DOANH THU LÀ SỐ TRƯỚC KHI TRỪ MÃ. `voucher_apply` (#159) cộng thẳng tiền
--     giảm vào `order_lines.discount_vnd`, nên tổng dòng ĐÃ TRỪ mã rồi. Nếu lấy
--     tổng dòng làm `revenue_vnd` rồi `net = revenue − discount` thì tiền giảm
--     bị trừ HAI LẦN. Nên: revenue = tổng dòng + tiền giảm của mã chiến dịch.
--     Khi đó `revenue − discount` đúng bằng số tiệm thật sự ghi nhận.
--
-- (4) GIÁ VỐN: đọc `order_line_costs` (giá vốn CHỐT LÚC BÁN, #127), KHÔNG đọc
--     `item_costs` hôm nay — giá nhập tháng sau không được sửa ngược vào đơn
--     tháng trước. Dòng chưa từng nhập giá vốn có `cost_vnd = null`.
--     ⛔ CỘNG NULL THÀNH 0 LÀ BỊA SỐ, và bịa đúng chiều nguy hiểm: giá vốn thiếu
--     ⇒ "còn lại" phồng lên ⇒ chủ tiệm tưởng đợt ưu đãi có lãi. Cột `cogs_vnd`
--     là `not null` (#171) nên không để trống được ⇒ thêm cột đếm số dòng thiếu
--     giá vốn, và màn hình PHẢI nói "chưa trừ đủ giá vốn, đây là cận trên" khi
--     con số đó > 0. Cùng khuôn `hasUnknownCost` đã dùng ở gross-margin.ts.
--
-- (5) "THẬT SỰ TĂNG THÊM" (quyết định 2 của thẻ) so với NỀN nào. Chọn: tổng đơn
--     đã hoàn tất của CẢ TIỆM trong khoảng chạy, trừ đi tổng đơn đã hoàn tất
--     trong khoảng DÀI BẰNG ĐÚNG NHƯ THẾ ngay trước ngày bắt đầu. Đếm lượt dùng
--     mã thì chỉ đếm được người đã đến — không trả lời được câu hỏi thật ("chạy
--     ưu đãi có kéo thêm khách không, hay chỉ giảm giá cho khách vốn đã đến").
--     Số này ÂM ĐƯỢC, và cột `incremental_count` của #171 CỐ Ý không có
--     `check >= 0` — âm nghĩa là đợt đó bán ít hơn lúc không chạy gì.
--     Khoảng chạy cắt tại `now()` nếu chiến dịch còn đang chạy: so nửa kỳ với
--     một kỳ đủ là tự bịa ra một con số âm.
--
-- (6) AI ĐỌC ĐƯỢC BẢN TỔNG KẾT — SIẾT LẠI so với #171. Policy cũ mở cho cả tiệm,
--     cùng dòng lý lẽ với `campaigns_select` ("nhân viên đứng quầy phải biết
--     đang chạy ưu đãi gì"). Lý lẽ đó đúng cho NỘI DUNG ưu đãi, không đúng cho
--     `cogs_vnd`/`revenue_vnd`: đó là giá vốn và doanh thu, đúng loại dữ liệu mà
--     #147 đã đi siết riêng theo vai, và `order_line_costs` (#127) chỉ cho
--     owner/admin/manager đọc. Để nguyên là dựng một đường vòng đọc giá vốn:
--     `select cogs_vnd from campaign_summary`. Bảng rỗng suốt từ #171 nên chưa
--     ai chạm phải — siết TRƯỚC khi bản này làm nó có dữ liệu thật.

-- ════════════════════════════════════════════════════════════════════
-- 1. CỘT ĐO ĐỘ ĐẦY ĐỦ CỦA GIÁ VỐN (điểm 4)
-- ════════════════════════════════════════════════════════════════════
alter table public.campaign_summary
  add column if not exists cogs_missing_lines integer not null default 0
    check (cogs_missing_lines >= 0);

comment on column public.campaign_summary.cogs_missing_lines is
  'So DONG HANG cua chien dich chua tung nhap gia von (order_line_costs.cost_vnd is null). > 0 nghia la cogs_vnd THIEU va net_vnd la CAN TREN, khong phai so that — man hinh phai noi ra. Cong null thanh 0 se phong to "con lai" dung chieu lam chu tiem tuong dot uu dai co lai.';

-- ════════════════════════════════════════════════════════════════════
-- 2. TÍNH TỔNG KẾT
-- ════════════════════════════════════════════════════════════════════
-- `security definer`: phải đọc `order_line_costs` (RLS chỉ owner/admin/manager)
-- và phải chạy được cả khi người kích hoạt là `staff` — trigger tự-dừng khi chạm
-- trần (#171) do một lượt dùng mã kích hoạt, mà lượt đó thường do nhân viên ghi.
-- ⇒ KHÔNG kiểm vai trong hàm này; hàng rào vai nằm ở hàm gọi tay bên dưới.
--
-- KHÔNG có `delete`/`update` trần trong hàm (cổng soat-xoa-khong-dieu-kien.mjs):
-- `insert … on conflict (campaign_id) do update` là mệnh đề của INSERT, luôn
-- giới hạn đúng một dòng theo khoá chính.
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
  select
    coalesce(sum(l.qty * l.unit_price_vnd - l.discount_vnd), 0)::bigint,
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
  'Tinh lai bang tong ket cua mot chien dich tu orders + voucher_redemptions + order_line_costs. Chay lai duoc bao nhieu lan cung duoc (upsert theo campaign_id). KHONG kiem vai: trigger tu-dung khi cham tran chay trong phien cua nhan vien ghi luot dung ma. Hang rao vai o campaign_tong_ket_yeu_cau().';

-- ── Cửa gọi TAY, có hàng rào vai ────────────────────────────────────
create or replace function public.campaign_tong_ket_yeu_cau(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tenant uuid;
begin
  -- `security definer` bỏ qua RLS ⇒ phải tự dựng lại CẢ HAI hàng rào: đúng tiệm
  -- và đủ vai. Thiếu vế tiệm là cho đọc số liệu tiệm khác qua một uuid đoán được.
  select tenant_id into v_tenant from public.campaigns where id = p_campaign_id;
  if v_tenant is null or v_tenant <> public.current_tenant_id() then
    raise exception 'campaign_not_found';
  end if;
  if public.app_role() not in ('owner', 'admin', 'manager') then
    raise exception 'forbidden';
  end if;
  perform public.campaign_tong_ket(p_campaign_id);
end;
$$;
revoke execute on function public.campaign_tong_ket_yeu_cau(uuid) from public, anon;
grant execute on function public.campaign_tong_ket_yeu_cau(uuid) to authenticated;

-- ── Tự tính khi chiến dịch dừng lại ─────────────────────────────────
-- Thẻ: "đo được mới gọi là chiến dịch". Đợi ai đó nhớ bấm nút là đúng thứ đã làm
-- bảng này rỗng suốt từ #171. Hai lối dừng đều bắt: máy tự dừng vì chạm trần
-- ('stopped') và người chốt vì hết ngày ('ended').
create or replace function public.campaigns_tu_tong_ket()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.campaign_tong_ket(new.id);
  return new;
end;
$$;
revoke execute on function public.campaigns_tu_tong_ket() from public, anon;

drop trigger if exists campaigns_tu_tong_ket on public.campaigns;
create trigger campaigns_tu_tong_ket
  after update of status on public.campaigns
  for each row
  when (new.status in ('stopped', 'ended') and old.status is distinct from new.status)
  execute function public.campaigns_tu_tong_ket();

-- ════════════════════════════════════════════════════════════════════
-- 3. QUYỀN ĐỌC — siết theo điểm (6)
-- ════════════════════════════════════════════════════════════════════
drop policy if exists campaign_summary_select on public.campaign_summary;
create policy campaign_summary_select on public.campaign_summary
  for select using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

comment on table public.campaign_summary is
  'Bang tong ket chien dich. GHI: chi qua campaign_tong_ket() (trigger khi chien dich dung, hoac campaign_tong_ket_yeu_cau() goi tay) — khong ai go tay. DOC: owner/admin/manager, KHONG mo ca tiem nhu #171 dat ban dau, vi cogs_vnd/revenue_vnd la gia von va doanh thu (cung loai du lieu #147 da siet, cung nhom quyen order_line_costs).';
