-- ============================================================
-- iFan.asia — Migration #21: pipeline metric_daily + rollup TỰ CHỮA LÀNH
--                            + RPC màn Tổng quan (doanh thu so kỳ trước,
--                              hiệu suất nhân viên)  — GĐ2 "Báo cáo đợt 1 (lõi)"
-- Spec: "07 Dashboard và Báo cáo" §5 (metric_daily), §6 job 2 (rollup-verify),
--       §8 tiêu chí 3 (múi giờ VN), 5 (phân quyền staff), 12 (tự chữa lành).
--
--   1) metric_daily              -- bảng gộp số theo NGÀY GIỜ VN × nhân viên
--   2) metric_daily_source()     -- definer: số liệu 1 khoảng ngày tính THẲNG từ
--                                   bảng nguồn (deals/contacts) — định nghĩa duy nhất
--   3) rollup_metric_daily()     -- definer: xóa-rồi-ghi cả khoảng ⇒ chạy lại
--                                   KHÔNG BAO GIỜ nhân đôi (idempotent do cấu trúc)
--   4) rollup_metric_daily_run() -- definer: cron. TỰ CHỮA LÀNH — dò ngày CÓ dữ
--                                   liệu nguồn nhưng THIẾU trong bảng gộp rồi đắp bù,
--                                   cộng cửa sổ N ngày gần nhất luôn tính lại
--                                   (bắt trường hợp sửa số lùi ngày).
--   5) cron 'metric-daily-rollup' 02:00 VN (= 19:00 UTC — pg_cron chạy UTC,
--      tiền lệ migration #8/#11)
--   6) dashboard_sales()         -- INVOKER: doanh thu/deal/khách kỳ này VS kỳ
--                                   trước + chuỗi ngày + hiệu suất từng nhân viên
--
-- VÌ SAO dashboard_sales() ĐỌC THẲNG BẢNG NGUỒN, KHÔNG ĐỌC metric_daily:
--   Màn Tổng quan và báo cáo "Nguồn nào ra tiền" (source_revenue_report,
--   migration #16) phải KHỚP TUYỆT ĐỐI — hai màn lệch số là mất uy tín ngay
--   buổi demo. source_revenue_report đọc `deals` trực tiếp (giá trị ĐANG ĐÚNG);
--   nếu Tổng quan đọc bảng gộp thì mọi deal vừa chốt / vừa sửa giá sẽ lệch cho
--   tới lần rollup kế tiếp. Đọc chung một nguồn ⇒ không thể lệch, và số cũng
--   LIVE đúng nghĩa (chốt deal xong tải lại là thấy).
--   metric_daily là NỀN cho đợt 2 (báo cáo định kỳ, xuất Excel, KPI target,
--   biểu đồ dài ngày) — nơi ảnh chụp theo ngày mới là thứ cần, không phải số live.
--
-- Chuẩn: theo migration #11/#16 — hàm ĐỌC cho người dùng = security invoker
--        (RLS của NGƯỜI GỌI áp nguyên: staff chỉ thấy phần mình); hàm GHI =
--        security definer, lọc tenant_id tường minh, revoke public/anon/authenticated.
--        KHÔNG nới lỏng policy nào đang có.
-- ============================================================

-- ============================================================
-- 1) Bảng metric_daily
-- ============================================================
-- `day` là NGÀY THEO GIỜ VN (đã quy đổi lúc ghi — KHÔNG lưu ngày UTC).
-- `dim_user_id` = nhân viên phụ trách (deals.owner_id / contacts.owner_id);
--   NULL = bản ghi không gắn ai (khách chưa có người phụ trách).
-- Đợt 1 chỉ mở chiều NHÂN VIÊN. Chiều nguồn đã có báo cáo riêng
--   (source_revenue_report) nên không nhân bản ở đây; chiều kênh/sản phẩm/giai
--   đoạn mở khi module Kho/Bán hàng có dữ liệu (spec §5) — thêm cột rỗng lúc này
--   chỉ là code phỏng đoán.
-- value_sum = tiền VNĐ (bigint) · value_count = số bản ghi.

create table public.metric_daily (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric_key text not null check (metric_key in (
    'revenue_won',    -- tiền từ deal THẮNG trong ngày (sum) + số deal (count)
    'deals_created',  -- deal tạo trong ngày
    'deals_lost',     -- deal thua trong ngày
    'contacts_new'    -- khách mới vào sổ trong ngày
  )),
  day date not null,
  dim_user_id uuid,
  value_sum bigint not null default 0,
  value_count bigint not null default 0,
  computed_at timestamptz not null default now()
);

-- Chốt chặn TẦNG DB cho "chạy lại không nhân đôi": không thể tồn tại 2 dòng
-- cùng (tenant, chỉ số, ngày, nhân viên) — kể cả khi có bug ở tầng ghi.
create unique index metric_daily_key_idx on public.metric_daily (
  tenant_id, metric_key, day,
  coalesce(dim_user_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index metric_daily_tenant_day_idx on public.metric_daily (tenant_id, day);
create index metric_daily_user_idx on public.metric_daily (tenant_id, dim_user_id, day)
  where dim_user_id is not null;

alter table public.metric_daily enable row level security;

-- Đọc: Pattern B như contacts/deals (migration #4) — owner/admin/manager thấy cả
-- tiệm; STAFF CHỈ THẤY DÒNG CỦA CHÍNH MÌNH (spec §5 + §8 tiêu chí 5).
-- KHÔNG có policy ghi: số liệu chỉ sinh qua rollup (definer/cron), client không
-- tự sửa được — cùng nguyên tắc tenant_weekly_digests (migration #11).
create policy metric_daily_select on public.metric_daily for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager')
              or dim_user_id = (select auth.uid())));

grant select on public.metric_daily to authenticated;
revoke all on public.metric_daily from anon;

-- ============================================================
-- 2) metric_daily_source() — ĐỊNH NGHĨA SỐ (một chỗ duy nhất)
-- ============================================================
-- Trả về số liệu của khoảng ngày [p_from, p_to] (bao gồm 2 đầu, theo GIỜ VN)
-- tính thẳng từ bảng nguồn. Vừa dùng để GHI (rollup), vừa dùng để DÒ ngày thiếu.
--
-- RANH GIỚI NGÀY: `ts at time zone 'Asia/Ho_Chi_Minh'` đổi timestamptz sang giờ
-- VN rồi mới lấy ::date ⇒ deal chốt 23:30 ngày 15 (16:30 UTC) nằm ở ngày 15,
-- deal chốt 00:30 ngày 16 nằm ở ngày 16 (spec §8 tiêu chí 3).
-- Cửa sổ quét cũng ghim theo giờ VN: [p_from 00:00 VN, (p_to+1) 00:00 VN).
create or replace function public.metric_daily_source(
  p_tenant uuid,
  p_from   date,
  p_to     date
)
returns table (
  metric_key  text,
  day         date,
  dim_user_id uuid,
  value_sum   bigint,
  value_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh')      as t_from,
           ((p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')  as t_to
  )
  select 'revenue_won'::text,
         (d.won_at at time zone 'Asia/Ho_Chi_Minh')::date,
         d.owner_id,
         sum(d.value_vnd)::bigint,
         count(*)::bigint
  from public.deals d, b
  where d.tenant_id = p_tenant and d.deleted_at is null and d.status = 'won'
    and d.won_at >= b.t_from and d.won_at < b.t_to
  group by 2, 3
  union all
  select 'deals_created',
         (d.created_at at time zone 'Asia/Ho_Chi_Minh')::date,
         d.owner_id,
         sum(d.value_vnd)::bigint,
         count(*)::bigint
  from public.deals d, b
  where d.tenant_id = p_tenant and d.deleted_at is null
    and d.created_at >= b.t_from and d.created_at < b.t_to
  group by 2, 3
  union all
  select 'deals_lost',
         (d.lost_at at time zone 'Asia/Ho_Chi_Minh')::date,
         d.owner_id,
         sum(d.value_vnd)::bigint,
         count(*)::bigint
  from public.deals d, b
  where d.tenant_id = p_tenant and d.deleted_at is null and d.status = 'lost'
    and d.lost_at >= b.t_from and d.lost_at < b.t_to
  group by 2, 3
  union all
  select 'contacts_new',
         (c.created_at at time zone 'Asia/Ho_Chi_Minh')::date,
         c.owner_id,
         0::bigint,
         count(*)::bigint
  from public.contacts c, b
  where c.tenant_id = p_tenant and c.deleted_at is null
    and c.created_at >= b.t_from and c.created_at < b.t_to
  group by 2, 3
$$;

revoke execute on function public.metric_daily_source(uuid, date, date)
  from public, anon, authenticated;

-- ============================================================
-- 3) rollup_metric_daily() — gộp lại một khoảng ngày
-- ============================================================
-- XÓA cả khoảng rồi GHI lại từ nguồn. Không cộng dồn ⇒ chạy 1 lần hay 10 lần
-- kết quả y hệt nhau (spec §8 tiêu chí 13). Trả về số dòng đã ghi.
create or replace function public.rollup_metric_daily(
  p_tenant uuid,
  p_from   date,
  p_to     date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  delete from public.metric_daily
   where tenant_id = p_tenant and day >= p_from and day <= p_to;

  insert into public.metric_daily
    (tenant_id, metric_key, day, dim_user_id, value_sum, value_count)
  select p_tenant, s.metric_key, s.day, s.dim_user_id, s.value_sum, s.value_count
  from public.metric_daily_source(p_tenant, p_from, p_to) s;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.rollup_metric_daily(uuid, date, date)
  from public, anon, authenticated;

-- ============================================================
-- 4) rollup_metric_daily_run() — cron TỰ CHỮA LÀNH
-- ============================================================
-- Với MỌI tenant, gộp lại các ngày:
--   (a) ngày CÓ dữ liệu nguồn nhưng KHÔNG có dòng nào trong metric_daily
--       → cron chết / deploy lỗi / ai đó xóa tay đều rơi vào đây, tự đắp bù
--       mà không cần người can thiệp;
--   (b) p_lookback_days ngày gần nhất — luôn tính lại để bắt việc sửa số lùi
--       ngày (deal đổi giá, mở lại, xóa mềm sau khi thắng).
-- Trần lịch sử 2 năm để lần chạy đầu ở tenant rất cũ không quét vô hạn.
-- Trả về TỔNG SỐ NGÀY đã gộp lại (0 = không có gì phải chữa ngoài cửa sổ gần).
create or replace function public.rollup_metric_daily_run(
  p_lookback_days integer default 7
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_start date;
  v_days  integer := 0;
  t       record;
  d       date;
begin
  for t in select id from public.tenants loop
    select least(
      (select min((x.created_at at time zone 'Asia/Ho_Chi_Minh'))::date
         from public.deals x where x.tenant_id = t.id and x.deleted_at is null),
      (select min((x.created_at at time zone 'Asia/Ho_Chi_Minh'))::date
         from public.contacts x where x.tenant_id = t.id and x.deleted_at is null)
    ) into v_start;
    if v_start is null then continue; end if;               -- tenant chưa có dữ liệu
    if v_start < v_today - 730 then v_start := v_today - 730; end if;

    for d in
      select s.day
        from public.metric_daily_source(t.id, v_start, v_today) s
       where not exists (select 1 from public.metric_daily m
                          where m.tenant_id = t.id and m.day = s.day)
      union
      select gs::date
        from generate_series(
               greatest(v_start, v_today - (p_lookback_days - 1)),
               v_today,
               interval '1 day') gs
    loop
      perform public.rollup_metric_daily(t.id, d, d);
      v_days := v_days + 1;
    end loop;
  end loop;
  return v_days;
end;
$$;

revoke execute on function public.rollup_metric_daily_run(integer)
  from public, anon, authenticated;

-- 19:00 UTC = 02:00 giờ VN (spec §6 job 2 "rollup-verify" chạy 02:00 VN)
select cron.schedule('metric-daily-rollup', '0 19 * * *',
                     $$select public.rollup_metric_daily_run(7)$$);

-- ============================================================
-- 5) dashboard_sales() — số liệu màn Tổng quan
-- ============================================================
-- SECURITY INVOKER: chạy bằng JWT người dùng ⇒ RLS `deals`/`contacts` áp nguyên.
-- Nhờ vậy STAFF chỉ tính được trên deal/khách của chính mình — phân quyền
-- "staff chỉ thấy số mình" nằm ở TẦNG DB, không phụ thuộc tầng web nhớ lọc.
--
-- Cửa sổ [p_from, p_to) và [p_prev_from, p_prev_to): tầng web tính mốc theo giờ
-- VN rồi truyền vào — GIỐNG HỆT cách báo cáo nguồn làm (vnRange), nên cùng bộ
-- lọc là cùng cửa sổ, không thể lệch.
--
-- Định nghĩa số (khớp source_revenue_report migration #16: cùng bảng `deals`,
-- cùng điều kiện status='won' + deleted_at is null + won_at trong cửa sổ):
--   revenue        = tổng value_vnd deal THẮNG trong kỳ
--   deals_won/lost = số deal thắng/thua trong kỳ (theo won_at/lost_at)
--   deals_created  = deal tạo trong kỳ · new_contacts = khách vào sổ trong kỳ
--   open_deals     = ẢNH CHỤP hiện tại (không theo kỳ) — tiền đang trên bàn
--   daily          = doanh thu từng ngày (giờ VN) trong kỳ, chỉ ngày CÓ tiền
--   staff          = từng nhân viên: deal thắng, doanh thu, khách mới, deal mở
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
set search_path = public
as $$
with
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
daily as (
  select (won_at at time zone 'Asia/Ho_Chi_Minh')::date as day,
         sum(value_vnd)::bigint as revenue,
         count(*)::bigint       as deals
  from cur_won group by 1
),
ids as (
  select owner_id as uid from cur_won
  union select owner_id from cur_made
  union select owner_id from open_d
  union select owner_id from cur_ct where owner_id is not null
),
staff as (
  select i.uid as user_id,
         (select p.display_name from public.profiles p where p.user_id = i.uid) as display_name,
         (select count(*)                       from cur_won w where w.owner_id = i.uid)::bigint as deals_won,
         (select coalesce(sum(w.value_vnd), 0)  from cur_won w where w.owner_id = i.uid)::bigint as revenue,
         (select count(*)                       from cur_made m where m.owner_id = i.uid)::bigint as deals_created,
         (select count(*)                       from open_d o where o.owner_id = i.uid)::bigint as deals_open,
         (select coalesce(sum(o.value_vnd), 0)  from open_d o where o.owner_id = i.uid)::bigint as open_value,
         (select count(*)                       from cur_ct c where c.owner_id = i.uid)::bigint as new_contacts
  from ids i where i.uid is not null
)
select jsonb_build_object(
  'role', public.app_role(),
  'revenue', jsonb_build_object(
      'current',  (select coalesce(sum(value_vnd), 0) from cur_won),
      'previous', (select coalesce(sum(value_vnd), 0) from prev_won)),
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

-- ---------- backfill: gộp toàn bộ lịch sử cho tenant sẵn có ----------
-- Lần đầu bảng rỗng ⇒ mọi ngày có dữ liệu đều là "ngày thiếu" ⇒ tự đắp đủ.
select public.rollup_metric_daily_run(7);
