-- #56 — RPC lost_reasons_report: báo cáo "Vì sao thua"
--
-- Vì sao: đánh thua deal BẮT BUỘC chọn lý do (bảng lost_reasons, #4) nhưng chưa
-- có màn nào cộng dồn lại — dữ liệu quý nhất về lỗ hổng bán hàng đang nằm chết.
-- Màn /app/reports/lost-reasons hỏi: kỳ này thua vì gì, tỷ trọng bao nhiêu, và
-- so với kỳ liền trước thì lý do nào đang phình ra (học mẫu "Why we lose" của GoK).
--
-- Một lượt RPC trả đủ 2 kỳ (đang xem + kỳ liền trước) để đếm DB-side — không
-- tải deal về đếm ở web (bệnh cũ đã trị, task #24/#29), không gọi 2 lượt.
--
-- Cửa sổ nửa mở [from, to) — tầng web tính mốc theo giờ VN rồi truyền vào
-- (cùng quy ước source_revenue_report #16):
--   p_from      NULL = không chặn dưới (kỳ "Tất cả")
--   p_prev_from NULL = không so kỳ trước (cột prev_cnt trả 0 hết)
--
-- SECURITY INVOKER: RLS bảng deals vẫn là chốt quyền thật. Màn báo cáo đã chặn
-- staff ở tầng app theo REPORT_ROLES (manager trở lên thấy mọi deal của tiệm).
-- search_path ghim `public, pg_temp` (chốt #40).
create or replace function public.lost_reasons_report(
  p_from      timestamptz,
  p_to        timestamptz,
  p_prev_from timestamptz,
  p_prev_to   timestamptz
)
returns table (
  reason_id   uuid,   -- NULL = deal thua không còn lý do (lý do đã bị xoá)
  reason_name text,   -- tên đã lưu; tầng web tra i18n_key để dịch tên cài sẵn
  cnt         bigint, -- số deal thua trong kỳ đang xem
  prev_cnt    bigint  -- số deal thua trong kỳ liền trước (0 nếu không so)
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with lost as (
  select d.lost_reason_id,
         count(*) filter (where (p_from is null or d.lost_at >= p_from)
                            and d.lost_at < p_to)                       as cnt,
         count(*) filter (where p_prev_from is not null
                            and d.lost_at >= p_prev_from
                            and d.lost_at < p_prev_to)                  as prev_cnt
  from public.deals d
  where d.deleted_at is null
    and d.status = 'lost'
    and d.lost_at is not null
    and d.lost_at < p_to
    -- chặn dưới = mốc sớm nhất còn dùng: kỳ trước nếu có, không thì kỳ đang xem
    and (p_from is null or d.lost_at >= coalesce(p_prev_from, p_from))
  group by d.lost_reason_id
)
select l.lost_reason_id, r.name, l.cnt, l.prev_cnt
from lost l
left join public.lost_reasons r on r.id = l.lost_reason_id
where l.cnt > 0 or l.prev_cnt > 0
order by l.cnt desc, r.name asc nulls last
$$;

revoke execute on function public.lost_reasons_report(timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.lost_reasons_report(timestamptz, timestamptz, timestamptz, timestamptz)
  to authenticated;
