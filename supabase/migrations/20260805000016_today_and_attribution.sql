-- ============================================================
-- iFan.asia — Migration #16: màn "Hôm nay gọi ai" + quy kết nguồn → doanh thu
--                            (GĐ2 CRM đợt 2)
--
--   1) today_queue(p_mine_only)        -- INVOKER: 4 khối việc trong ngày của
--                                        1 người bán, gộp trong 1 round-trip
--                                        (không N+1). Ranh giới ngày theo giờ VN.
--   2) source_revenue_report(from,to)  -- INVOKER: bảng nguồn × {khách mới, deal
--                                        thắng, doanh thu} cho CẢ 3 mô hình quy
--                                        kết (first / last / linear) trong 1 lượt.
--   3) domain_events_attribution_idx   -- index phục vụ tra lịch sử "chạm nguồn".
--
-- VÌ SAO ĐỌC domain_events CHO NGUỒN, ĐỌC deals CHO TIỀN:
--   `deals` là NGUỒN SỰ THẬT của giá trị + trạng thái hiện tại (deal sửa giá,
--   mở lại, xóa mềm sau khi thắng — báo cáo phải theo giá trị ĐANG ĐÚNG).
--   `domain_events` là NGUỒN SỰ THẬT của LỊCH SỬ chạm nguồn: `contact.created`
--   mang source_id lúc khách vào sổ (first-touch thật, không bị hồ sơ sửa về sau
--   làm sai lệch), `deal.won` mang source_id tại thời điểm thắng (last-touch),
--   và tập nguồn phân biệt qua contact.created + deal.created + deal.won chính là
--   chuỗi "touch" để chia đều (linear).
--   Dữ liệu trước migration #15 chưa có trigger phát event → mỗi mô hình đều có
--   nhánh dự phòng về contacts.source_id / deals.source_id, để tenant cũ không bị
--   quy về "Chưa rõ nguồn" toàn bộ. Nhánh dự phòng ghi rõ tại chỗ.
--
-- Chuẩn: theo migration #11/#13/#14/#15 — security invoker cho hàm đọc (RLS của
--        NGƯỜI GỌI áp nguyên: staff chỉ thấy phần mình), set search_path,
--        revoke public/anon trước khi grant đích danh authenticated.
--        KHÔNG tạo bảng, KHÔNG đụng policy nào đang có.
-- ============================================================

-- ---------- index tra cứu lịch sử chạm nguồn ----------
-- Truy vấn quy kết luôn lọc theo tenant (RLS) + event_type + aggregate_id.
create index if not exists domain_events_attribution_idx
  on public.domain_events (tenant_id, event_type, aggregate_id)
  where event_type in ('contact.created', 'deal.created', 'deal.won');

-- ============================================================
-- 1) today_queue() — "Hôm nay gọi ai"
-- ============================================================
-- 4 khối, xếp theo độ gấp (US-S4 spec CRM §3):
--   overdue   — việc quá hạn: activity chưa xong đã qua hạn + deal MỞ có
--               next_action_at đã qua.
--   today     — việc còn lại trong hôm nay (giờ VN): từ BÂY GIỜ đến hết ngày.
--               (đã qua giờ = nằm ở khối overdue, không đếm 2 lần)
--   hot       — khách nóng (lead_score ≥ 70) không tương tác ≥ 3 ngày và KHÔNG
--               có việc nào đang chờ; loại luôn khách đã xuất hiện ở 2 khối trên
--               để một người không hiện 2 lần trên cùng màn hình.
--   unanswered— hội thoại mở mà tin CUỐI là của khách. ĐỊNH NGHĨA GIỐNG HỆT
--               dashboard_overview() (migration #11) để 2 màn không bao giờ lệch số.
--
-- p_mine_only: lọc "Của tôi". activities/deals/contacts đã bị RLS khoanh theo
--   người phụ trách với vai staff; conversations thì KHÔNG (hộp thư dùng chung
--   cả tiệm) nên "của tôi" = hội thoại mình phụ trách HOẶC chưa ai nhận.
--   Tầng web luôn truyền true cho staff.
--
-- Danh sách cắt LIST_CAP dòng mỗi khối; số đếm trả về là số THẬT (không bị cắt).
create or replace function public.today_queue(p_mine_only boolean default false)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with
me as (select auth.uid() as uid),
bounds as (
  select ((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 day')
            at time zone 'Asia/Ho_Chi_Minh') as day_end
),
-- việc (activity) chưa xong, có hạn
act as (
  select a.id, a.type, a.subject, a.due_at, a.contact_id,
         c.full_name, c.phone
  from public.activities a
  left join public.contacts c on c.id = a.contact_id and c.deleted_at is null
  where a.done_at is null
    and a.due_at is not null
    and (not p_mine_only or a.owner_id = (select uid from me))
),
-- cơ hội đang mở có mốc "việc kế tiếp"
dl as (
  select d.id, d.title, d.next_action_at, d.next_action_note, d.contact_id,
         c.full_name, c.phone
  from public.deals d
  join public.contacts c on c.id = d.contact_id
  where d.deleted_at is null
    and d.status = 'open'
    and d.next_action_at is not null
    and (not p_mine_only or d.owner_id = (select uid from me))
),
overdue_items as (
  select 'activity'::text as kind, a.id::text as id,
         coalesce(nullif(a.subject, ''), a.type) as title,
         a.type as detail, a.due_at as at,
         a.contact_id, a.full_name, a.phone
  from act a
  where a.due_at < now()
  union all
  select 'deal', d.id::text, d.title,
         coalesce(nullif(d.next_action_note, ''), ''), d.next_action_at,
         d.contact_id, d.full_name, d.phone
  from dl d
  where d.next_action_at < now()
),
today_items as (
  select 'activity'::text as kind, a.id::text as id,
         coalesce(nullif(a.subject, ''), a.type) as title,
         a.type as detail, a.due_at as at,
         a.contact_id, a.full_name, a.phone
  from act a, bounds b
  where a.due_at >= now() and a.due_at < b.day_end
  union all
  select 'deal', d.id::text, d.title,
         coalesce(nullif(d.next_action_note, ''), ''), d.next_action_at,
         d.contact_id, d.full_name, d.phone
  from dl d, bounds b
  where d.next_action_at >= now() and d.next_action_at < b.day_end
),
busy_contacts as (
  select contact_id from overdue_items where contact_id is not null
  union
  select contact_id from today_items where contact_id is not null
),
hot as (
  select c.id, c.full_name, c.phone, c.lead_score, c.last_interaction_at
  from public.contacts c
  where c.deleted_at is null
    and c.lead_score >= 70
    and (c.last_interaction_at is null
         or c.last_interaction_at < now() - interval '3 days')
    and not exists (
      select 1 from public.activities a
      where a.contact_id = c.id and a.done_at is null)
    and not exists (select 1 from busy_contacts b where b.contact_id = c.id)
    and (not p_mine_only or c.owner_id = (select uid from me))
),
unans as (
  select cv.id, coalesce(ct.full_name, cv.external_user_id) as name,
         ch.type as channel_type, ch.display_name as channel_name,
         cv.last_user_message_at as waiting_since, cv.contact_id
  from public.conversations cv
  join public.channels ch on ch.id = cv.channel_id
  left join public.contacts ct on ct.id = cv.contact_id and ct.deleted_at is null
  where cv.status = 'open'
    and cv.last_user_message_at is not null
    and cv.last_user_message_at >= coalesce(cv.last_message_at, cv.last_user_message_at)
    and (not p_mine_only
         or coalesce(cv.assignee_user_id, (select uid from me)) = (select uid from me))
)
select jsonb_build_object(
  'counts', jsonb_build_object(
    'overdue',    (select count(*) from overdue_items),
    'today',      (select count(*) from today_items),
    'hot',        (select count(*) from hot),
    'unanswered', (select count(*) from unans)),
  'overdue', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select kind, id, title, detail, at, contact_id, full_name, phone
      from overdue_items order by at asc limit 50) x),
  'today', (select coalesce(jsonb_agg(y), '[]'::jsonb) from (
      select kind, id, title, detail, at, contact_id, full_name, phone
      from today_items order by at asc limit 50) y),
  'hot', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (
      select id, full_name, phone, lead_score, last_interaction_at
      from hot order by lead_score desc, last_interaction_at asc nulls first
      limit 50) z),
  'unanswered', (select coalesce(jsonb_agg(w), '[]'::jsonb) from (
      select id, name, channel_type, channel_name, waiting_since, contact_id
      from unans order by waiting_since asc limit 50) w)
)
$$;

revoke execute on function public.today_queue(boolean) from public, anon;
grant execute on function public.today_queue(boolean) to authenticated;

-- ============================================================
-- 2) source_revenue_report() — "Nguồn nào ra tiền"
-- ============================================================
-- Cửa sổ [p_from, p_to) — tầng web tính mốc theo giờ VN rồi truyền vào.
--
-- Ba mô hình quy kết (tiêu chí nghiệm thu #16 spec CRM §8):
--   first  — TOÀN BỘ giá trị deal về nguồn ĐẦU TIÊN chạm khách.
--   last   — TOÀN BỘ giá trị deal về nguồn ghi trên deal LÚC THẮNG.
--   linear — CHIA ĐỀU cho mọi nguồn phân biệt đã chạm khách. Chia số nguyên:
--            mỗi nguồn nhận floor(V/n), nguồn CUỐI nhận phần dư ⇒ tổng đúng
--            bằng V tuyệt đối (kể cả chia 3 không tròn).
--
-- Cột trả về:
--   new_contacts  — khách MỚI tạo trong kỳ, đếm theo nguồn FIRST-TOUCH của khách
--                   (nguồn nào MANG khách về — không đổi theo mô hình đang chọn;
--                    tầng web ghi rõ định nghĩa này trên màn hình).
--   deals_*       — số deal thắng quy về nguồn. Với linear, 1 deal chạm 2 nguồn
--                   được đếm ở CẢ HAI (nên tổng cột có thể > số deal thật —
--                   tầng web ghi chú rõ, không giấu).
--   revenue_*     — tiền VNĐ (bigint) quy về nguồn theo mô hình.
--   source_id NULL = khách/deal chưa gắn nguồn ("Chưa rõ nguồn" trên UI).
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
set search_path = public
as $$
with
-- TIỀN + tập deal: lấy từ bảng deals (nguồn sự thật của giá trị hiện tại)
won as (
  select d.id, d.contact_id, d.value_vnd, d.source_id
  from public.deals d
  where d.deleted_at is null
    and d.status = 'won'
    and d.won_at >= p_from and d.won_at < p_to
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
  -- Dự phòng: khách tạo TRƯỚC migration #15 chưa có sự kiện nào mang nguồn
  -- → coi nguồn hiện tại trên hồ sơ là chạm duy nhất.
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
           -- nguồn ghi trong sự kiện deal.won (đúng thời điểm thắng)
           (select nullif(e.payload ->> 'source_id', '')::uuid
            from public.domain_events e
            where e.event_type = 'deal.won' and e.aggregate_id = w.id::text
            order by e.created_at desc, e.id desc limit 1),
           -- dự phòng: nguồn gắn thẳng trên deal, rồi tới nguồn hiện tại của khách
           w.source_id,
           (select c.source_id from public.contacts c where c.id = w.contact_id)
         ) as source_id
  from won w
),
lin as (
  select cn.source_id, w.id as deal_id,
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
agg_first as (select f.source_id, count(*) as deals, sum(w.value_vnd) as revenue
              from won w join first_src f on f.contact_id = w.contact_id group by 1),
agg_last  as (select l.source_id, count(*) as deals, sum(w.value_vnd) as revenue
              from won w join last_src l on l.deal_id = w.id group by 1),
agg_lin   as (select source_id, count(distinct deal_id) as deals, sum(amount) as revenue
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
