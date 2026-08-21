-- #293 — HAI CON SỐ VỀ TIỀN ĐANG NÓI SAI SỰ THẬT. Cả hai đã đo trên dữ liệu
-- thật trước khi sửa, không phải nghi ngờ.
--
-- ═══════════════════════════════════════════════════════════════════
-- LỖ 1 — "thật sự tăng thêm nhờ ưu đãi" KHÔNG BIẾT chiến dịch có tồn tại
-- ═══════════════════════════════════════════════════════════════════
-- `campaign_tong_ket()` (từ #181, sửa lại ở #206) tính:
--
--     incremental_count = (đơn hoàn tất CẢ TIỆM trong kỳ)
--                       − (đơn hoàn tất CẢ TIỆM kỳ nền dài bằng đúng thế)
--
-- Không một mệnh đề nào trong hai câu đếm đó nhắc tới `p_campaign_id`. Nó
-- không nối tới voucher, không nối tới lượt dùng mã, không nối tới danh sách
-- người nhận tin. Xoá sạch chiến dịch đi con số vẫn y nguyên.
--
-- Rồi màn `/app/events` in nó ra kèm chữ **"nhờ"**:
--     "{n} lượt thật sự tăng thêm so với khi không chạy ưu đãi"
--
-- ĐO ĐƯỢC (20/08, trên CSDL thật, chỉ `select`):
--   · "Cuối tuần mua 2 tặng 1"  → 3.325 lượt "tăng thêm"
--     trong khi **0 lượt dùng mã, 0đ doanh thu từ mã**.
--   · "Khách cũ quay lại"       → 1.129 lượt "tăng thêm"
--     trong khi **chưa gắn một mã nào** vào chiến dịch.
--
-- Đây không phải sai số. Đây là một phép đo KHÁC bị dán nhãn của phép đo này.
-- Mùa cao điểm hay một đợt bão đơn hàng cũng đẩy con số ấy lên, rồi chủ tiệm
-- đọc thành "ưu đãi của tôi kéo về 3.325 lượt" và đổ thêm tiền quảng cáo.
--
-- ── VÌ SAO XOÁ HẲN CỘT, KHÔNG PHẢI ĐỔI NHÃN ──────────────────────────
-- Kho này có luật: *chưa đo được thì không được viết chữ khẳng định*
-- (`app/app/events/queries.ts`, luật 2). Có hai đường chữa:
--   (b) giữ phép so kỳ, đổi nhãn thành "doanh số cả tiệm kỳ này so với kỳ
--       trước" và nói rõ nó không bóc tách được phần do chiến dịch;
--   (a) đổi sang con số ĐO ĐƯỢC THẬT, bỏ hẳn chữ "nhờ".
--
-- Chọn (a). Lý do: (b) vẫn đặt một con số cả-tiệm nằm giữa thẻ MỘT chiến
-- dịch, và cái nhãn không cứu được thế đứng đó — người đọc vẫn tự nối nhân
-- quả, vì mọi dòng khác trên thẻ ấy đều nói về chiến dịch này. Nói cách khác
-- (b) chữa câu chữ mà không chữa chỗ đặt.
--
-- Còn vì sao XOÁ CỘT chứ không chỉ thôi hiển thị: giữ lại một cột tên
-- `incremental_count` nằm trên `campaign_summary` là để lại đúng cái bẫy mà
-- kho này đã tự ghi lại trong `lib/finance/gross-margin.ts` —
-- *"một chú thích sai nguy hiểm hơn không có chú thích: nó tiêu diệt sự nghi
-- ngờ"*. Người sau grep thấy tên cột đó sẽ tin nó nghĩa đúng như tên, và
-- dựng lại đúng lời khẳng định này ở một màn khác. Cột không còn ai ghi vào
-- mà vẫn còn tên thì tệ hơn cột đã biến mất.
--
-- ── THAY BẰNG GÌ — hai con số CÓ nối tới chiến dịch ──────────────────
-- `recipients_count`         = số người ĐÃ NHẬN tin của ĐÚNG chiến dịch này.
-- `recipients_ordered_count` = trong số đó, bao nhiêu người có đơn HOÀN TẤT
--                              SAU thời điểm nhận tin, trong kỳ đo.
--
-- Hai số này nói đúng thứ chúng đếm và không nói gì hơn: chúng KHÔNG khẳng
-- định người đó mua *vì* nhận tin (muốn biết điều đó phải có nhóm đối chứng,
-- mà kho này chưa có). Nhưng khác hẳn con số cũ ở hai điểm quyết định:
--   1. chúng chỉ động đậy khi chiến dịch NÀY có gửi tin — không gửi thì bằng 0;
--   2. chúng có mẫu số. "120 trong 140 người nhận" tự nó chặn cách đọc thổi
--      phồng, còn "3.325" thì trôi tự do.
-- Câu chữ trên màn hình vì thế nêu cả tử lẫn mẫu và dừng ở chữ "đã mua hàng
-- sau khi nhận tin" — không có chữ "nhờ".
--
-- ĐO THỬ trước khi viết (cùng CSDL, chỉ `select`):
--   "Cuối tuần mua 2 tặng 1"  140 người nhận → 120 người đã mua sau đó
--   "Khách cũ quay lại"       120 người nhận →  92 người đã mua sau đó
-- Số nằm trong khoảng có thật, chặn trên bởi số người nhận.
--
-- ═══════════════════════════════════════════════════════════════════
-- LỖ 2 — cột "Lời/Lỗ" của màn Nguồn CHƯA TRỪ GIÁ VỐN, và không nói ra
-- ═══════════════════════════════════════════════════════════════════
-- `app/app/reports/sources/sources-view.tsx` tính `lời = doanh thu − tiền
-- quảng cáo`. Giá vốn không xuất hiện ở bất kỳ đâu trong phép tính, mà tiêu
-- đề cột vẫn là "Lời/Lỗ" và bốn ghi chú cuối trang không câu nào nói ra.
--
-- Giá vốn KHÔNG thiếu — nó nằm sẵn trong `order_line_costs` (chốt lúc bán,
-- #127), cùng nguồn mà màn Lãi gộp đã dùng. Đây là chỗ QUÊN NỐI.
--
-- ĐO ĐƯỢC (90 ngày gần nhất, trên CSDL thật) — "Lời/Lỗ" đang phóng to:
--   Mỹ Phẩm Ngọc Trai   1.284.580.000 → thật 412.694.000   (+68%)
--   Sắc Màu Boutique    1.082.266.000 → thật 469.062.000   (+57%)
--   Cafe Góc Phố        1.227.137.000 → thật 760.994.000   (+38%)
--   Spa Thú Cưng            771.448.000 → thật 521.217.000   (+32%)
--   Spa Hương Sen       1.489.142.500 → thật 1.050.021.250 (+29%)
-- Với tiệm bán mỹ phẩm, số đang hiện GẤP HƠN BA LẦN sự thật. Đây là con số
-- người ta dùng để quyết định đổ thêm tiền vào nguồn nào.
--
-- Sửa: trừ giá vốn THẬT. Doanh thu đang được quy cho nguồn theo ba mô hình
-- (chạm đầu · chạm cuối · chia đều), nên giá vốn phải quy theo ĐÚNG mô hình
-- ấy — nếu không thì tử số và mẫu số nói về hai tập đơn khác nhau. Vì vậy
-- phép trừ phải làm TRONG hàm này, không làm được ở tầng web (tầng web chỉ
-- nhận số đã cộng dồn theo nguồn).
--
-- Dòng CHƯA nhập giá vốn (`cost_vnd is null`) KHÔNG được cộng thành 0 — cộng
-- thành 0 là âm thầm phóng đại lãi đúng cái kiểu vừa vá. Chúng được đếm
-- riêng, và màn hình đổi NHÃN cột thành cận trên khi đếm > 0, y hệt cách màn
-- Sự kiện đã làm với "Còn lại (nhiều nhất)".
--
-- Đo phủ sóng: 50.077 dòng hàng của đơn hoàn tất, 3.922 dòng (7,8%) chưa có
-- giá vốn ⇒ trừ thật là làm được, phần cận trên chỉ chạm số ít nguồn.
--
-- KIỂM BẤT BIẾN (chạy trong giao dịch rồi rollback, trước khi viết file này):
--   tổng cogs_first = tổng cogs_last = tổng cogs_linear = giá vốn thật của kỳ
--   tổng revenue_* giữ nguyên như trước ⇒ bản vá không đụng vào doanh thu.

-- ═══════════════════════════════════════════════════════════════════
-- PHẦN 1 — CỘT
-- ═══════════════════════════════════════════════════════════════════

alter table public.campaign_summary
  add column if not exists recipients_count         integer not null default 0,
  add column if not exists recipients_ordered_count integer not null default 0;

comment on column public.campaign_summary.recipients_count is
  'Số người ĐÃ NHẬN tin của chính chiến dịch này (đếm theo người, không theo lượt gửi).';
comment on column public.campaign_summary.recipients_ordered_count is
  'Trong số người đã nhận tin: bao nhiêu người có đơn HOÀN TẤT sau thời điểm nhận, trong kỳ đo. KHÔNG phải quan hệ nhân quả — không có nhóm đối chứng thì không kết luận được là "nhờ" chiến dịch.';

-- Xoá cột bịa. Xem phần LỖ 1 ở đầu file để biết vì sao xoá chứ không đổi nhãn.
alter table public.campaign_summary drop column if exists incremental_count;

-- ═══════════════════════════════════════════════════════════════════
-- PHẦN 2 — TỔNG KẾT CHIẾN DỊCH
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.campaign_tong_ket(p_campaign_id uuid)
returns void
language plpgsql
security definer set search_path = public, pg_temp
as $function$
declare
  v_c         public.campaigns;
  v_ket       timestamptz;
  v_revenue   bigint := 0;
  v_discount  bigint := 0;
  v_cogs      bigint := 0;
  v_thieu     integer := 0;
  v_uses      integer := 0;
  v_moi       integer := 0;
  v_nhan      integer := 0;
  v_nhan_mua  integer := 0;
  v_optout    integer := 0;
begin
  select * into v_c from public.campaigns where id = p_campaign_id;
  if not found then raise exception 'campaign_not_found'; end if;

  -- Kỳ đo dừng ở mốc sớm nhất trong ba mốc — dừng máy, hết hạn, bây giờ.
  v_ket := least(coalesce(v_c.stopped_at, v_c.end_at), now());
  if v_ket < v_c.start_at then v_ket := v_c.start_at; end if;

  -- ── Tiền: chỉ đơn đã hoàn tất có dùng mã của chiến dịch ──
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

  -- Cộng NGƯỢC tiền giảm vào doanh thu, vì nó đã bị trừ sẵn ở dòng hàng.
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

  -- ── THAY CHO `incremental_count` ĐÃ XOÁ ──
  -- Đếm theo NGƯỜI, không theo lượt gửi: gửi một người ba đợt vẫn là một người.
  select count(distinct rcp.contact_id) into v_nhan
    from public.campaign_send_recipients rcp
    join public.campaign_sends s on s.id = rcp.send_id
   where s.campaign_id = p_campaign_id;

  -- Điều kiện `o.created_at >= s.send_at` là chỗ quan trọng nhất của phép đếm
  -- này: đơn mua TRƯỚC khi nhận tin thì không liên quan gì tới đợt gửi, tính
  -- vào là dựng lại đúng lời nói dối vừa gỡ. Chặn trên bởi v_ket để con số
  -- không lớn dần mãi sau khi chiến dịch đã kết thúc.
  select count(distinct rcp.contact_id) into v_nhan_mua
    from public.campaign_send_recipients rcp
    join public.campaign_sends s on s.id = rcp.send_id
   where s.campaign_id = p_campaign_id
     and exists (
       select 1 from public.orders o
        where o.contact_id = rcp.contact_id
          and o.tenant_id  = v_c.tenant_id
          and o.kind       = 'order'
          and o.status     = 'completed'
          and o.deleted_at is null
          and o.created_at >= s.send_at
          and o.created_at <  v_ket
     );

  -- ── Cái giá phải trả, đo bằng người rút đồng ý ──
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
    uses_count, new_customer_count, opt_out_count,
    recipients_count, recipients_ordered_count,
    cogs_missing_lines
  ) values (
    p_campaign_id, v_c.tenant_id, now(),
    v_revenue, v_discount, v_c.ad_cost_vnd, greatest(v_cogs, 0),
    v_revenue - v_discount - v_c.ad_cost_vnd - greatest(v_cogs, 0),
    v_uses, v_moi, v_optout,
    v_nhan, v_nhan_mua,
    v_thieu
  )
  on conflict (campaign_id) do update set
    generated_at             = excluded.generated_at,
    revenue_vnd              = excluded.revenue_vnd,
    discount_vnd             = excluded.discount_vnd,
    ad_cost_vnd              = excluded.ad_cost_vnd,
    cogs_vnd                 = excluded.cogs_vnd,
    net_vnd                  = excluded.net_vnd,
    uses_count               = excluded.uses_count,
    new_customer_count       = excluded.new_customer_count,
    opt_out_count            = excluded.opt_out_count,
    recipients_count         = excluded.recipients_count,
    recipients_ordered_count = excluded.recipients_ordered_count,
    cogs_missing_lines       = excluded.cogs_missing_lines;
end;
$function$;

-- Mọi bản tổng kết đã lưu đều mang con số bịa. Tính lại hết ngay trong bản vá
-- này: để nguyên là còn nguyên hai cột 0 nằm cạnh những số đúng — người đọc
-- không có cách nào phân biệt "chưa tính lại" với "đo được đúng bằng 0".
do $$
declare r record;
begin
  for r in select campaign_id from public.campaign_summary loop
    perform public.campaign_tong_ket(r.campaign_id);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- PHẦN 3 — BÁO CÁO NGUỒN: TRỪ GIÁ VỐN THẬT
-- ═══════════════════════════════════════════════════════════════════
-- Hàm đổi danh sách cột trả về nên phải drop rồi tạo lại (Postgres không cho
-- `create or replace` khi khác chữ ký OUT). Cả hai lệnh nằm trong CÙNG một
-- giao dịch của migration ⇒ không có khoảnh khắc nào hàm biến mất với người
-- đang dùng.
--
-- KHÔNG đặt `security definer`: giá vốn phải chịu RLS của `order_line_costs`
-- (chỉ owner/admin/manager). Đã soát khớp quyền — `REPORT_ROLES` của màn này
-- (`app/app/reports/sources/page.tsx`) đúng bằng owner/admin/manager, nên
-- không tồn tại vai nào đọc được báo cáo mà bị RLS cắt mất giá vốn rồi thấy
-- lãi phồng lên trong im lặng. Nếu sau này ai nới quyền vào màn này thì PHẢI
-- soát lại đúng chỗ đó, không thì lỗ vừa vá sẽ mở lại theo đường quyền.

drop function if exists public.source_revenue_report(timestamptz, timestamptz);

create function public.source_revenue_report(p_from timestamptz, p_to timestamptz)
returns table(
  source_id uuid, source_name text, new_contacts bigint,
  deals_first  bigint, revenue_first  bigint, cogs_first  bigint, cogs_missing_first  bigint,
  deals_last   bigint, revenue_last   bigint, cogs_last   bigint, cogs_missing_last   bigint,
  deals_linear bigint, revenue_linear bigint, cogs_linear bigint, cogs_missing_linear bigint
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with
-- TIỀN + tập "won": ĐƠN HOÀN TẤT (ADR-0027 §8) thay cho deals.
--   value_vnd = tổng line_total_vnd (#198 — phiếu hoàn ÂM ⇒ NET).
--   cogs_vnd  = tổng cost_vnd × qty (#293). `qty` âm ở dòng phiếu hoàn nên giá
--     vốn cũng âm theo — cùng dấu với doanh thu, không phải cộng nhầm chiều.
--   cogs_missing = số dòng CHƯA nhập giá vốn. Cộng chúng thành 0 là phóng đại
--     lãi trong im lặng, nên đếm riêng để màn hình đổi nhãn thành cận trên.
--   kind: giữ để phần ĐẾM chỉ đếm đơn bán.
--   source_id = null: đơn KHÔNG mang nguồn-khách (orders không có cột source_id)
--     ⇒ last_src tự lùi về nguồn HIỆN TẠI của khách (xem coalesce trong last_src).
won as (
  select o.id, o.contact_id, o.kind,
         null::uuid as source_id,
         (select coalesce(sum(l.line_total_vnd), 0)
            from public.order_lines l
           where l.order_id = o.id)::bigint as value_vnd,
         (select coalesce(sum(lc.cost_vnd * l.qty), 0)
            from public.order_lines l
            join public.order_line_costs lc on lc.order_line_id = l.id
           where l.order_id = o.id and lc.cost_vnd is not null)::bigint as cogs_vnd,
         (select count(*)
            from public.order_lines l
            left join public.order_line_costs lc on lc.order_line_id = l.id
           where l.order_id = o.id and lc.cost_vnd is null)::bigint as cogs_missing
  from public.orders o
  where o.deleted_at is null
    and o.status = 'completed'
    and o.created_at >= p_from and o.created_at < p_to
    and o.contact_id is not null
),
won_contacts as (select distinct contact_id from won),
-- NGUỒN: mọi "chạm" có ghi source_id trong lịch sử sự kiện
touches as (
  select
    case when e.aggregate_type = 'contact' then e.aggregate_id::uuid
         else nullif(e.payload ->> 'contact_id', '')::uuid end as contact_id,
    nullif(e.payload ->> 'source_id', '')::uuid as source_id,
    e.created_at, e.id
  from public.domain_events e
  where e.event_type in ('contact.created', 'deal.created', 'deal.won')
    and nullif(e.payload ->> 'source_id', '') is not null
),
cs_events as (
  select wc.contact_id, t.source_id,
         min(t.created_at) as first_at, min(t.id) as first_id
  from won_contacts wc
  join touches t on t.contact_id = wc.contact_id
  group by wc.contact_id, t.source_id
),
cs as (
  select * from cs_events
  union all
  -- Dự phòng: khách chưa có sự kiện nào mang nguồn → nguồn hiện tại trên hồ sơ
  -- là chạm duy nhất.
  select wc.contact_id, c.source_id, c.created_at, 0::bigint
  from won_contacts wc
  join public.contacts c on c.id = wc.contact_id
  where not exists (select 1 from cs_events r where r.contact_id = wc.contact_id)
),
cs_n as (
  select contact_id, source_id,
         row_number() over (partition by contact_id order by first_at, first_id) as ord,
         count(*) over (partition by contact_id) as n
  from cs
),
first_src as (select contact_id, source_id from cs_n where ord = 1),
last_src as (
  select w.id as deal_id,
         coalesce(
           -- lookup deal.won theo aggregate_id: RỖNG với đơn (id đơn ≠ id deal)
           (select nullif(e.payload ->> 'source_id', '')::uuid
            from public.domain_events e
            where e.event_type = 'deal.won' and e.aggregate_id = w.id::text
            order by e.created_at desc, e.id desc limit 1),
           -- w.source_id = null (đơn không có nguồn) → tới nguồn hiện tại của khách
           w.source_id,
           (select c.source_id from public.contacts c where c.id = w.contact_id)
         ) as source_id
  from won w
),
-- Chia đều: giá vốn chia Y HỆT cách doanh thu chia (phần dư dồn vào nguồn cuối)
-- nên tổng cộng lại đúng bằng giá vốn thật, không rơi rớt đồng nào.
--
-- `cogs_missing` thì CỐ Ý không chia — mỗi nguồn của đơn ấy nhận TRỌN số dòng
-- thiếu. Chia một con "dòng hàng" ra ba phần thì 1 dòng thiếu / 3 nguồn thành
-- 0-0-1, và hai nguồn kia sẽ khoe giá vốn đầy đủ trong khi phần chia của chúng
-- vẫn thiếu — tức là im lặng nói quá về lãi, đúng cái bệnh đang vá. Đếm thừa
-- thì cùng lắm bắt màn hình nói "cận trên" rộng hơn cần thiết; đếm thiếu thì
-- nói sai. Vì tổng của cột này KHÔNG còn cộng lại đúng ở mô hình chia đều,
-- tầng web chỉ được dùng nó như CỜ (> 0 ⇒ chưa đủ giá vốn), tuyệt đối không
-- in con số ấy ra như một số đếm.
lin as (
  select cn.source_id, w.id as deal_id, w.kind,
         case when cn.ord = cn.n
              then w.value_vnd - (cn.n - 1) * (w.value_vnd / cn.n)
              else w.value_vnd / cn.n
         end as amount,
         case when cn.ord = cn.n
              then w.cogs_vnd - (cn.n - 1) * (w.cogs_vnd / cn.n)
              else w.cogs_vnd / cn.n
         end as cogs_amount,
         w.cogs_missing as cogs_missing
  from won w
  join cs_n cn on cn.contact_id = w.contact_id
),
new_c as (
  select coalesce(
           (select nullif(e.payload ->> 'source_id', '')::uuid
            from public.domain_events e
            where e.event_type = 'contact.created' and e.aggregate_id = c.id::text
            order by e.created_at asc, e.id asc limit 1),
           c.source_id) as source_id
  from public.contacts c
  where c.deleted_at is null
    and c.created_at >= p_from and c.created_at < p_to
),
agg_new   as (select source_id, count(*) as n from new_c group by 1),
-- ĐẾM: chỉ đơn bán (kind='order'); REVENUE/COGS: net (mọi kind, hoàn âm trừ ra).
agg_first as (select f.source_id,
                     count(*) filter (where w.kind = 'order') as deals,
                     sum(w.value_vnd)                          as revenue,
                     sum(w.cogs_vnd)                           as cogs,
                     sum(w.cogs_missing)                       as cogs_missing
              from won w join first_src f on f.contact_id = w.contact_id group by 1),
agg_last  as (select l.source_id,
                     count(*) filter (where w.kind = 'order') as deals,
                     sum(w.value_vnd)                          as revenue,
                     sum(w.cogs_vnd)                           as cogs,
                     sum(w.cogs_missing)                       as cogs_missing
              from won w join last_src l on l.deal_id = w.id group by 1),
agg_lin   as (select source_id,
                     count(distinct deal_id) filter (where kind = 'order') as deals,
                     sum(amount)                                            as revenue,
                     sum(cogs_amount)                                       as cogs,
                     sum(cogs_missing)                                      as cogs_missing
              from lin group by 1),
keys as (
  select source_id from agg_new
  union select source_id from agg_first
  union select source_id from agg_last
  union select source_id from agg_lin
)
select k.source_id,
       ls.name as source_name,
       coalesce(an.n, 0)::bigint             as new_contacts,
       coalesce(af.deals, 0)::bigint         as deals_first,
       coalesce(af.revenue, 0)::bigint       as revenue_first,
       coalesce(af.cogs, 0)::bigint          as cogs_first,
       coalesce(af.cogs_missing, 0)::bigint  as cogs_missing_first,
       coalesce(al.deals, 0)::bigint         as deals_last,
       coalesce(al.revenue, 0)::bigint       as revenue_last,
       coalesce(al.cogs, 0)::bigint          as cogs_last,
       coalesce(al.cogs_missing, 0)::bigint  as cogs_missing_last,
       coalesce(ali.deals, 0)::bigint        as deals_linear,
       coalesce(ali.revenue, 0)::bigint      as revenue_linear,
       coalesce(ali.cogs, 0)::bigint         as cogs_linear,
       coalesce(ali.cogs_missing, 0)::bigint as cogs_missing_linear
from keys k
left join public.lead_sources ls on ls.id = k.source_id
left join agg_new   an  on an.source_id  is not distinct from k.source_id
left join agg_first af  on af.source_id  is not distinct from k.source_id
left join agg_last  al  on al.source_id  is not distinct from k.source_id
left join agg_lin   ali on ali.source_id is not distinct from k.source_id
order by coalesce(af.revenue, 0) desc, ls.name asc nulls last
$function$;

grant execute on function public.source_revenue_report(timestamptz, timestamptz)
  to authenticated, service_role;
