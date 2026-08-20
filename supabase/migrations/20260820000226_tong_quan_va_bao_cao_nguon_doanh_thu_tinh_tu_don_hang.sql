-- ============================================================
-- iFan.asia — Migration #226: Tổng quan + Báo cáo nguồn — DOANH THU tính từ ĐƠN
--                             HÀNG (ADR-0027 §8), KHÔNG còn từ cơ hội (deals)
--
--   Sửa CÙNG MỘT migration hai hàm đọc của màn Tổng quan và báo cáo "Nguồn nào
--   ra tiền" — vì BẤT BIẾN #21 đòi hai màn KHỚP ĐẾN TỪNG ĐỒNG (cùng định nghĩa
--   doanh thu + cùng mốc thời gian). Tách ra hai lần deploy là mở cửa cho lệch số.
--     1) dashboard_sales(from,to,prev_from,prev_to)   — số màn Tổng quan
--     2) source_revenue_report(from,to)               — báo cáo phân bổ nguồn
--
-- ── VÌ SAO ĐỔI (ADR-0027 "Đường A" đã chốt 20/08) ──────────────────────────
--   Doanh thu CHÍNH THỨC = ĐƠN HÀNG đã hoàn tất, KHÔNG phải cơ hội đã thắng.
--   Cơ hội "thắng" từ nay chỉ còn là chỉ số PHỄU (đếm, tỉ lệ chốt, giá trị đang
--   mở), không còn là tiền. Đây là bước "kéo Tổng quan + báo cáo nguồn về đơn"
--   trong danh sách thi công ADR-0027 §8.3 (recompute_contact_tier #225 và
--   campaign_tong_ket #206 đã chuyển trước).
--
-- ── ĐỊNH NGHĨA DOANH THU-TỪ-ĐƠN (dùng Y HỆT ở CẢ HAI hàm để khớp đến đồng) ──
--   Doanh thu trong [from, to) = TỔNG order_lines.line_total_vnd của các orders
--   có status='completed', deleted_at is null, created_at ∈ [from, to).
--   · Mốc ghi nhận = orders.created_at (ADR-0027 §8.1 — đơn không có completed_at).
--   · KHÔNG lọc kind: line_total_vnd là CỘT SINH (#198) — dòng phiếu hoàn
--     (kind='return') tự mang giá trị ÂM, nên cộng tất = doanh thu RÒNG. KHÔNG
--     tự nhân tay (chép công thức qty*đơn_giá-giảm sẽ trừ khoản giảm hai lần).
--   Đúng công thức #206/#225 đang dùng cho doanh thu-từ-đơn.
--
-- ── QUY KẾT NHÂN VIÊN (ADR-0027 §8.2) ──────────────────────────────────────
--   Doanh thu theo nhân viên = order_lines.performed_by_user_id (người THỰC HIỆN
--   dòng — cũng là người được tính hoa hồng), thiếu thì lùi về orders.created_by
--   (người lập đơn). Dòng cả hai đều rỗng ⇒ không quy được cho ai, không hiện ở
--   bảng nhân viên (vẫn cộng vào doanh thu tổng) — giống cách hàm cũ bỏ qua uid null.
--
-- ── GIỮ NGUYÊN (không đụng) ────────────────────────────────────────────────
--   · Mọi con số PHỄU vẫn theo deals: deals_won / deals_lost / deals_created /
--     new_contacts / open_deals (count+value); các cột phễu của staff
--     (deals_won, deals_created, deals_open, open_value, new_contacts).
--   · Cấu trúc quy-kết-NGUỒN của báo cáo (touches / first_src / last_src / linear
--     từ domain_events) — đó là về NGUỒN KHÁCH, độc lập với nguồn TIỀN. Chỉ thay
--     CTE `won` (deals → đơn) và cách ĐẾM; downstream chạy gần như nguyên.
--   · SHAPE JSON của dashboard_sales và 9 cột TABLE của source_revenue_report giữ
--     Y HỆT (app/app/dashboard-range.ts + app/app/reports/sources/types.ts) —
--     đổi Ý NGHĨA vài con số, KHÔNG đổi tên/thứ tự khoá ⇒ frontend không vỡ.
--
-- ── LƯU Ý LƯỢC ĐỒ (đã kiểm trên schema, KHÔNG đoán) ────────────────────────
--   · orders KHÔNG có cột `source_id` (chỉ có source_conversation_id /
--     source_appointment_id — đó là "cửa vào", không phải nguồn-khách/lead_source).
--     ⇒ trong `won` đặt source_id = null: đơn không mang nguồn tiền, nên last_src
--     tự lùi qua nhánh dự phòng về NGUỒN HIỆN TẠI của khách (đúng ý "chạm cuối"
--     khi đơn không tự khai nguồn). first_src/linear vẫn quy theo lịch sử chạm
--     nguồn của KHÁCH nên không phụ thuộc chuyện đơn có nguồn hay không.
--   · line_total_vnd là cột SINH stored (#198), đã đổi dấu sẵn theo qty.
--
-- ── LỰA CHỌN VỀ PHIẾU HOÀN (nêu rõ) ────────────────────────────────────────
--   · DOANH THU (tiền): để NET — phiếu hoàn (âm) trừ ra. (KHÔNG lọc kind.)
--   · ĐẾM số đơn (dashboard daily.deals; báo cáo deals_first/last/linear): CHỈ
--     đếm đơn BÁN (kind='order') để phiếu hoàn không thổi phồng "số đơn". Việc
--     đếm không ảnh hưởng bất biến #21 (bất biến đó về TIỀN).
--
-- ── LỰA CHỌN VỀ daily.deals (nêu rõ) ───────────────────────────────────────
--   Đã đọc frontend (dashboard-panels.tsx / page.tsx / dashboard-range.ts): biểu
--   đồ ngày là "doanh thu theo ngày" — chỉ vẽ daily[].revenue; daily[].deals hiện
--   KHÔNG được component nào hiển thị nhưng vẫn nằm trong kiểu DashboardSales.
--   ⇒ giữ khoá `deals`, cho nó nghĩa = SỐ ĐƠN BÁN hoàn tất trong ngày (nhất quán
--   với daily.revenue-từ-đơn), thay cho "số deal thắng trong ngày" trước đây.
--
-- Chuẩn kỹ thuật: create or replace GIỮ nguyên chữ ký + language sql stable +
--   security invoker (RLS người gọi áp nguyên: staff chỉ thấy đơn mình tạo, y
--   như bản cũ theo deals). search_path ghim 'public','pg_temp' (nối tiếp #142).
--   Cấp lại revoke/grant ở cuối cho khỏi trôi (create or replace không đặt lại ACL).
-- ============================================================

-- ============================================================
-- 1) dashboard_sales() — số màn Tổng quan
-- ============================================================
create or replace function public.dashboard_sales(
  p_from      timestamptz,
  p_to        timestamptz,
  p_prev_from timestamptz,
  p_prev_to   timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
with
-- ── PHỄU (GIỮ theo deals) ───────────────────────────────────────────────────
d as (
  select id, owner_id, value_vnd, status, won_at, lost_at, created_at
  from public.deals where deleted_at is null
),
cur_won   as (select * from d where status = 'won'  and won_at  >= p_from      and won_at  < p_to),
prev_won  as (select * from d where status = 'won'  and won_at  >= p_prev_from and won_at  < p_prev_to),
cur_lost  as (select * from d where status = 'lost' and lost_at >= p_from      and lost_at < p_to),
prev_lost as (select * from d where status = 'lost' and lost_at >= p_prev_from and lost_at < p_prev_to),
cur_made  as (select * from d where created_at >= p_from      and created_at < p_to),
prev_made as (select * from d where created_at >= p_prev_from and created_at < p_prev_to),
open_d    as (select * from d where status = 'open'),
ct as (
  select id, owner_id, created_at from public.contacts where deleted_at is null
),
cur_ct  as (select * from ct where created_at >= p_from      and created_at < p_to),
prev_ct as (select * from ct where created_at >= p_prev_from and created_at < p_prev_to),
-- ── TIỀN (ĐỔI sang ĐƠN — ADR-0027 §8) ───────────────────────────────────────
-- Một dòng = một order_line của đơn completed trong cửa sổ. uid = người quy kết
-- doanh thu (§8.2). day = ngày giờ VN theo orders.created_at (§8.1).
ord_cur as (
  select o.id as order_id, o.kind,
         coalesce(l.performed_by_user_id, o.created_by)         as uid,
         (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date   as day,
         l.line_total_vnd
  from public.orders o
  join public.order_lines l on l.order_id = o.id
  where o.deleted_at is null and o.status = 'completed'
    and o.created_at >= p_from and o.created_at < p_to
),
ord_prev as (
  select l.line_total_vnd
  from public.orders o
  join public.order_lines l on l.order_id = o.id
  where o.deleted_at is null and o.status = 'completed'
    and o.created_at >= p_prev_from and o.created_at < p_prev_to
),
staff_rev as (
  select uid, sum(line_total_vnd)::bigint as revenue
  from ord_cur where uid is not null group by uid
),
-- Biểu đồ NGÀY = doanh thu theo ngày (từ đơn). deals = số ĐƠN BÁN hoàn tất/ngày.
daily as (
  select day,
         sum(line_total_vnd)::bigint                                    as revenue,
         count(distinct order_id) filter (where kind = 'order')::bigint as deals
  from ord_cur group by day
),
-- ids gộp thêm nhân viên có doanh thu ĐƠN (cashier có thể không sở hữu deal nào).
ids as (
  select owner_id as uid from cur_won
  union select owner_id from cur_made
  union select owner_id from open_d
  union select owner_id from cur_ct where owner_id is not null
  union select uid      from staff_rev
),
staff as (
  select i.uid as user_id,
         (select p.display_name from public.profiles p where p.user_id = i.uid) as display_name,
         (select count(*)                      from cur_won w   where w.owner_id = i.uid)::bigint as deals_won,
         -- coalesce NGOÀI truy vấn con: staff_rev là phép nhóm (không tổng hợp) nên
         -- nhân viên không có doanh thu đơn sẽ cho 0 ROW → scalar NULL nếu coalesce
         -- nằm trong. Bọc ngoài mới ra 0 (nếu không, revenue=NULL phá order by desc).
         coalesce((select sr.revenue from staff_rev sr where sr.uid = i.uid), 0)::bigint          as revenue,
         (select count(*)                      from cur_made m   where m.owner_id = i.uid)::bigint as deals_created,
         (select count(*)                      from open_d o    where o.owner_id = i.uid)::bigint as deals_open,
         (select coalesce(sum(o.value_vnd), 0) from open_d o    where o.owner_id = i.uid)::bigint as open_value,
         (select count(*)                      from cur_ct c    where c.owner_id = i.uid)::bigint as new_contacts
  from ids i where i.uid is not null
)
select jsonb_build_object(
  'role', public.app_role(),
  'revenue', jsonb_build_object(
      'current',  (select coalesce(sum(line_total_vnd), 0) from ord_cur),
      'previous', (select coalesce(sum(line_total_vnd), 0) from ord_prev)),
  'deals_won', jsonb_build_object(
      'current',  (select count(*) from cur_won),
      'previous', (select count(*) from prev_won)),
  'deals_lost', jsonb_build_object(
      'current',  (select count(*) from cur_lost),
      'previous', (select count(*) from prev_lost)),
  'deals_created', jsonb_build_object(
      'current',  (select count(*) from cur_made),
      'previous', (select count(*) from prev_made)),
  'new_contacts', jsonb_build_object(
      'current',  (select count(*) from cur_ct),
      'previous', (select count(*) from prev_ct)),
  'open_deals', jsonb_build_object(
      'count', (select count(*) from open_d),
      'value', (select coalesce(sum(value_vnd), 0) from open_d)),
  'daily', (select coalesce(jsonb_agg(
      jsonb_build_object('day', day, 'revenue', revenue, 'deals', deals)
      order by day), '[]'::jsonb) from daily),
  'staff', (select coalesce(jsonb_agg(to_jsonb(s) order by s.revenue desc, s.deals_won desc),
                            '[]'::jsonb) from staff s)
)
$$;

revoke execute on function public.dashboard_sales(timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.dashboard_sales(timestamptz, timestamptz, timestamptz, timestamptz)
  to authenticated;

-- ============================================================
-- 2) source_revenue_report() — "Nguồn nào ra tiền"
-- ============================================================
-- Chỉ thay CTE `won` (deals → ĐƠN HOÀN TẤT) và cách ĐẾM (kind='order'). Toàn bộ
-- cấu trúc quy-kết-NGUỒN (touches/first_src/last_src/linear + nhánh dự phòng
-- contacts.source_id) giữ nguyên — đó là về NGUỒN KHÁCH, độc lập nguồn TIỀN.
create or replace function public.source_revenue_report(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  source_id      uuid,
  source_name    text,
  new_contacts   bigint,
  deals_first    bigint,
  revenue_first  bigint,
  deals_last     bigint,
  revenue_last   bigint,
  deals_linear   bigint,
  revenue_linear bigint
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
with
-- TIỀN + tập "won": ĐỔI sang ĐƠN HOÀN TẤT (ADR-0027 §8) thay cho deals.
--   value_vnd = tổng line_total_vnd (#198 — phiếu hoàn ÂM ⇒ NET).
--   kind: giữ để phần ĐẾM chỉ đếm đơn bán.
--   source_id = null: đơn KHÔNG mang nguồn-khách (orders không có cột source_id)
--     ⇒ last_src tự lùi về nguồn HIỆN TẠI của khách (xem coalesce trong last_src).
--   contact_id is not null: giữ theo mẫu; orders.contact_id vốn NOT NULL nên
--     điều kiện này không loại đơn nào (đảm bảo bằng đúng tập đơn với dashboard).
won as (
  select o.id, o.contact_id, o.kind,
         null::uuid as source_id,
         (select coalesce(sum(l.line_total_vnd), 0)
            from public.order_lines l where l.order_id = o.id)::bigint as value_vnd
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
lin as (
  select cn.source_id, w.id as deal_id, w.kind,
         case when cn.ord = cn.n
              then w.value_vnd - (cn.n - 1) * (w.value_vnd / cn.n)
              else w.value_vnd / cn.n
         end as amount
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
-- ĐẾM: chỉ đơn bán (kind='order'); REVENUE: net (mọi kind, hoàn âm trừ ra).
agg_first as (select f.source_id,
                     count(*) filter (where w.kind = 'order') as deals,
                     sum(w.value_vnd)                          as revenue
              from won w join first_src f on f.contact_id = w.contact_id group by 1),
agg_last  as (select l.source_id,
                     count(*) filter (where w.kind = 'order') as deals,
                     sum(w.value_vnd)                          as revenue
              from won w join last_src l on l.deal_id = w.id group by 1),
agg_lin   as (select source_id,
                     count(distinct deal_id) filter (where kind = 'order') as deals,
                     sum(amount)                                            as revenue
              from lin group by 1),
keys as (
  select source_id from agg_new
  union select source_id from agg_first
  union select source_id from agg_last
  union select source_id from agg_lin
)
select k.source_id,
       ls.name as source_name,
       coalesce(an.n, 0)::bigint            as new_contacts,
       coalesce(af.deals, 0)::bigint        as deals_first,
       coalesce(af.revenue, 0)::bigint      as revenue_first,
       coalesce(al.deals, 0)::bigint        as deals_last,
       coalesce(al.revenue, 0)::bigint      as revenue_last,
       coalesce(ali.deals, 0)::bigint       as deals_linear,
       coalesce(ali.revenue, 0)::bigint     as revenue_linear
from keys k
left join public.lead_sources ls on ls.id = k.source_id
left join agg_new   an  on an.source_id  is not distinct from k.source_id
left join agg_first af  on af.source_id  is not distinct from k.source_id
left join agg_last  al  on al.source_id  is not distinct from k.source_id
left join agg_lin   ali on ali.source_id is not distinct from k.source_id
order by coalesce(af.revenue, 0) desc, ls.name asc nulls last
$$;

revoke execute on function public.source_revenue_report(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.source_revenue_report(timestamptz, timestamptz)
  to authenticated;
