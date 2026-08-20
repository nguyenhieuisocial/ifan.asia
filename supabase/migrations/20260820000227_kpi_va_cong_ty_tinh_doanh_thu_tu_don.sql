-- KPI mục tiêu doanh thu + "đã mua" theo CÔNG TY: chuyển sang tính TỪ ĐƠN HÀNG.
--
-- ═══════════════════════════════════════════════════════════════════
-- ĐÂY LÀ HAI CHỖ CUỐI CÒN TÍNH DOANH THU THEO CƠ HỘI (ADR-0027 §8.3)
-- ═══════════════════════════════════════════════════════════════════
-- Sau #225 (hồ sơ khách), #206 (chiến dịch), #226 (Tổng quan + Báo cáo nguồn),
-- còn lại đúng hai hàm đọc vẫn tính doanh thu từ deals — đo được 20/08:
--   · kpi_progress: 64 mục tiêu "revenue_won" đo theo cơ hội đã thắng.
--   · company_stats.won_value_vnd: 4 công ty có số > 0, tính theo cơ hội —
--     làm công ty mua bằng ĐƠN (không lập cơ hội) hiện 0đ. Ví dụ đo được: một
--     công ty mua 11.816.000đ qua đơn nhưng cột doanh thu hiện 0.
--
-- Đổi cả hai sang định nghĩa doanh thu-từ-đơn CHUẨN (giống #226/#225):
--   tổng order_lines.line_total_vnd của orders status='completed', chưa xoá,
--   theo orders.created_at. Quy kết nhân viên (KPI) = performed_by, thiếu thì
--   created_by (ADR-0027 §8.2).
--
-- GIỮ theo deals: open_deal_count của công ty (phễu — số cơ hội đang mở, đúng).
-- Nhãn màn đổi kèm trong cùng đợt (messages/*.json) để không đẻ lệch nhãn↔số.

-- ─────────────────────────────────────────────────────────────────
-- 1) company_stats (VIEW) — won_value_vnd sang ĐƠN. Giữ security_invoker=true
--    (RLS người gọi áp: mỗi tiệm chỉ thấy công ty của mình). Giữ TÊN cột
--    won_value_vnd (di sản) + open_deal_count theo deals (phễu).
-- ─────────────────────────────────────────────────────────────────
create or replace view public.company_stats
with (security_invoker = true) as
select co.id as company_id,
       co.tenant_id,
       (select count(*) from public.contacts ct
         where ct.company_id = co.id and ct.deleted_at is null) as contact_count,
       (select count(*) from public.deals d
          join public.contacts ct on ct.id = d.contact_id
         where ct.company_id = co.id and d.deleted_at is null and d.status = 'open') as open_deal_count,
       -- #227: doanh thu = ĐƠN đã hoàn tất của khách thuộc công ty (trước: tổng
       -- cơ hội đã thắng). line_total_vnd là cột sinh (#198) — phiếu hoàn tự trừ.
       (select coalesce(sum(l.line_total_vnd), 0)
          from public.orders o
          join public.contacts ct on ct.id = o.contact_id
          join public.order_lines l on l.order_id = o.id
         where ct.company_id = co.id and o.status = 'completed' and o.deleted_at is null) as won_value_vnd
  from public.companies co
 where co.deleted_at is null;

-- ─────────────────────────────────────────────────────────────────
-- 2) kpi_progress — chỉ số 'revenue_won' sang ĐƠN. Chỉ thay CTE `won`
--    (deals → đơn, quy kết performed_by/created_by); phần còn lại nguyên.
--    Giữ metric key 'revenue_won' (kpi_targets.metric CHECK không đổi) —
--    64 mục tiêu đang đặt vẫn chạy, nay đo theo đơn.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.kpi_progress(p_month date)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with bounds as (
  select date_trunc('month',
           coalesce(p_month, (now() at time zone 'Asia/Ho_Chi_Minh')::date)
         )::date as m_start
),
win as (
  select b.m_start,
         ((b.m_start + interval '1 month')::date) as m_end,
         (b.m_start::timestamp at time zone 'Asia/Ho_Chi_Minh') as t_from,
         (((b.m_start + interval '1 month')::date)::timestamp
            at time zone 'Asia/Ho_Chi_Minh') as t_to,
         ((b.m_start + interval '1 month')::date - b.m_start) as days_in_month,
         least((b.m_start + interval '1 month')::date - b.m_start,
               greatest(0,
                 ((now() at time zone 'Asia/Ho_Chi_Minh')::date - b.m_start) + 1
               )) as days_elapsed
  from bounds b
),
-- #227: doanh thu-theo-nhân-viên tính từ ĐƠN HOÀN TẤT (trước: cơ hội đã thắng).
-- owner_id = người THỰC HIỆN dòng, thiếu thì người lập đơn (ADR-0027 §8.2).
-- Dòng không quy được cho ai (owner_id null) vẫn vào tổng cả-tiệm, không vào
-- mục tiêu cá nhân — giống cách hàm cũ bỏ qua owner null.
won as (
  select coalesce(l.performed_by_user_id, o.created_by) as owner_id,
         sum(l.line_total_vnd)::bigint as revenue
  from public.orders o
  join public.order_lines l on l.order_id = o.id, win w
  where o.deleted_at is null and o.status = 'completed'
    and o.created_at >= w.t_from and o.created_at < w.t_to
  group by 1
),
newc as (
  select c.owner_id, count(*)::bigint as cnt
  from public.contacts c, win w
  where c.deleted_at is null
    and c.created_at >= w.t_from and c.created_at < w.t_to
  group by c.owner_id
),
done as (
  select a.owner_id, count(*)::bigint as cnt
  from public.activities a, win w
  where a.done_at is not null
    and a.done_at >= w.t_from and a.done_at < w.t_to
  group by a.owner_id
),
rows as (
  select k.user_id, k.metric, k.target, k.created_at, k.updated_at,
         (case k.metric
            when 'revenue_won' then
              case when k.user_id is null
                   then (select coalesce(sum(revenue), 0) from won)
                   else coalesce((select revenue from won where owner_id = k.user_id), 0)
              end
            when 'new_contacts' then
              case when k.user_id is null
                   then (select coalesce(sum(cnt), 0) from newc)
                   else coalesce((select cnt from newc where owner_id = k.user_id), 0)
              end
            else
              case when k.user_id is null
                   then (select coalesce(sum(cnt), 0) from done)
                   else coalesce((select cnt from done where owner_id = k.user_id), 0)
              end
          end)::bigint as actual,
         (k.target * w.days_elapsed / w.days_in_month)::bigint as pace
  from public.kpi_targets k
  cross join win w
  where k.month = w.m_start
)
select jsonb_build_object(
  'month',         (select m_start from win),
  'days_in_month', (select days_in_month from win),
  'days_elapsed',  (select days_elapsed from win),
  'targets', coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',    r.user_id,
      'metric',     r.metric,
      'target',     r.target,
      'actual',     r.actual,
      'pace',       r.pace,
      'created_at', r.created_at,
      'updated_at', r.updated_at
    ) order by r.user_id asc nulls first, r.metric asc) from rows r), '[]'::jsonb)
)
$function$;

comment on function public.kpi_progress(date) is
  'Tien do muc tieu thang. #227 (ADR-0027 §8.3): chi so revenue_won doi tu co hoi thang sang DON hoan tat (quy ket performed_by/created_by). Giu metric key revenue_won. Nhan man doi kem trong messages/*.json.';
