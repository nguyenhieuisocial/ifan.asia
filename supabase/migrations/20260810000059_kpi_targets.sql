-- #59 — KPI mục tiêu tháng: kpi_targets + kpi_set_target() + kpi_progress()
--
-- Hồ sơ luồng: "Quy hoạch tính năng hợp nhất (10-08)" mục 9 — chủ/quản lý đặt
-- mục tiêu tháng (3 chỉ số: doanh thu chốt / khách mới / việc xong) cho từng
-- nhân viên hoặc cả tiệm; hệ thống TỰ cộng dồn từ dữ liệu sẵn có (deals won,
-- contacts created, activities done), KHÔNG bảng cộng dồn riêng, KHÔNG nhập
-- tay — luật số 3 "một hành động lõi một đường code đếm".
--
-- Chuẩn theo #52 (source_costs — bảng theo tháng + RPC upsert invoker):
-- tiền bigint VNĐ, month luôn là NGÀY 1, RLS bật ngay khi tạo bảng, policy bọc
-- (select ...) cache initplan, search_path ghim `public, pg_temp` (chốt #40).

create table public.kpi_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- null = mục tiêu CẢ TIỆM (không gắn riêng ai)
  user_id uuid references auth.users(id) on delete cascade,
  -- Luôn là NGÀY 1 của tháng — RPC bên dưới tự chuẩn hóa, check chặn ghi thẳng sai
  month date not null check (month = date_trunc('month', month)::date),
  metric text not null check (metric in ('revenue_won','new_contacts','tasks_done')),
  -- revenue_won: VNĐ · new_contacts / tasks_done: số đếm. Mục tiêu phải dương —
  -- "tắt" một chỉ số là XÓA dòng, không phải đặt 0 (0/0 không có nghĩa gì).
  target bigint not null check (target > 0),
  created_at timestamptz not null default now(),
  -- Đổi mục tiêu giữa tháng → touch trigger đẩy updated_at lên; UI so với
  -- created_at để hiện ghi chú "đã đổi ngày N" (hồ sơ mục 9, kết cục 4).
  updated_at timestamptz not null default now()
);

-- unique với user_id NULLABLE: hai dòng (tenant, NULL, tháng, metric) vẫn phải
-- đụng nhau, mà unique constraint thường coi NULL ≠ NULL nên bỏ lọt → dùng
-- unique INDEX trên biểu thức coalesce (uuid toàn 0 = "cả tiệm").
create unique index kpi_targets_uniq on public.kpi_targets
  (tenant_id, (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)), month, metric);
-- FK có index (chuẩn #4); unique ở trên đã phủ truy vấn chính (tenant, tháng).
create index kpi_targets_user_idx on public.kpi_targets (user_id)
  where user_id is not null;

alter table public.kpi_targets enable row level security;
-- Đọc theo Pattern B như contacts/deals/activities (hồ sơ mục 9 phần 2:
-- "nhân viên chỉ XEM của mình — RLS đúng vai"): staff thấy mục tiêu CỦA MÌNH
-- + mục tiêu CẢ TIỆM; owner/admin/manager thấy hết.
create policy kpi_targets_select on public.kpi_targets for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager')
              or user_id is null
              or user_id = (select auth.uid())));
-- Đặt/sửa/xóa mục tiêu: owner/admin/manager (đúng nhóm được xem báo cáo).
create policy kpi_targets_manage on public.kpi_targets for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger kpi_targets_touch before update on public.kpi_targets
  for each row execute function public.touch_updated_at();

-- ---------- RPC kpi_set_target ----------
-- Gộp "chưa có thì thêm, có rồi thì sửa" vào một lệnh (mẫu upsert_source_cost
-- #52) — bấm lại vô hại. SECURITY INVOKER: RLS của bảng vẫn là chốt quyền
-- thật; kiểm role/thành viên ở đây chỉ để trả lỗi mã ngắn rõ ràng.
-- Giá trị KHÔNG đổi thì KHÔNG update (where ... is distinct from) — tránh touch
-- trigger đẩy updated_at làm hiện oan ghi chú "đã đổi ngày N" khi bấm Lưu lại
-- y nguyên số cũ.
create function public.kpi_set_target(
  p_user_id uuid,   -- null = mục tiêu cả tiệm
  p_month   date,
  p_metric  text,
  p_target  bigint
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if (select public.current_tenant_id()) is null or auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if (select public.app_role()) not in ('owner','admin','manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'month_required' using errcode = '22023';
  end if;
  if p_metric is null
     or p_metric not in ('revenue_won','new_contacts','tasks_done') then
    raise exception 'invalid_metric' using errcode = '22023';
  end if;
  if p_target is null or p_target <= 0 then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  -- Mục tiêu cá nhân phải gắn vào người ĐANG LÀM Ở TIỆM — chặn ghi rác cho
  -- uuid lạ (FK auth.users không kiểm được membership).
  if p_user_id is not null and not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = (select public.current_tenant_id())
      and m.user_id = p_user_id and m.status = 'active')
  then
    raise exception 'not_a_member' using errcode = '22023';
  end if;

  insert into public.kpi_targets (tenant_id, user_id, month, metric, target)
  values ((select public.current_tenant_id()), p_user_id,
          date_trunc('month', p_month)::date, p_metric, p_target)
  on conflict (tenant_id,
               (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)),
               month, metric)
    do update set target = excluded.target
    where kpi_targets.target is distinct from excluded.target;
end;
$$;

revoke execute on function public.kpi_set_target(uuid, date, text, bigint) from public, anon;
grant execute on function public.kpi_set_target(uuid, date, text, bigint) to authenticated;

-- ---------- RPC kpi_progress ----------
-- Một lượt trả đủ: mục tiêu tháng + số THỰC ĐẠT đếm từ dữ liệu gốc + "nhịp"
-- (pace = target × ngày-đã-qua ÷ số-ngày-tháng, chia nguyên) để UI hiện nhãn
-- vượt/hụt nhịp kiểu GoK — không tải deal/contact về web đếm.
--
-- ĐỊNH NGHĨA SỐ — TÁI DÙNG Y HỆT các hàm đang chạy (luật "một đường code đếm"):
--   · revenue_won  = sum(value_vnd) deal deleted_at is null, status='won',
--                    won_at trong [from, to), theo owner_id — CHÉP ĐÚNG cách
--                    dashboard_sales (#21, cur_won/staff.revenue) và
--                    source_revenue_report (#16, CTE won) đang đếm doanh thu thắng.
--   · new_contacts = contacts deleted_at is null, created_at trong cửa sổ,
--                    theo owner_id — như dashboard_sales (#21, cur_ct).
--   · tasks_done   = activities có done_at trong cửa sổ, theo owner_id — cùng
--                    trường done_at mà today_queue #49 đếm 'done_today'.
-- Cửa sổ = THÁNG DƯƠNG LỊCH giờ VN, nửa mở [ngày 1, ngày 1 tháng sau) — cùng
-- quy ước mốc-tính-ở-đâu-giờ-VN của các hàm trên.
--
-- SECURITY INVOKER: RLS deals/contacts/activities (Pattern B) áp nguyên — staff
-- gọi chỉ đếm được số CỦA MÌNH (đúng nhu cầu khối "Hôm nay"); manager trở lên
-- đếm được cả đội (bảng Báo cáo). Dòng target cả-tiệm do staff gọi sẽ chỉ cộng
-- phần staff thấy — tầng web không hiện dòng đó cho staff.
create function public.kpi_progress(p_month date)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
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
         -- ngày đã qua TÍNH CẢ hôm nay, kẹp [0, số ngày tháng]: tháng cũ = đủ
         -- tháng (pace = target), tháng tương lai = 0
         least((b.m_start + interval '1 month')::date - b.m_start,
               greatest(0,
                 ((now() at time zone 'Asia/Ho_Chi_Minh')::date - b.m_start) + 1
               )) as days_elapsed
  from bounds b
),
won as (
  select d.owner_id, coalesce(sum(d.value_vnd), 0)::bigint as revenue
  from public.deals d, win w
  where d.deleted_at is null and d.status = 'won'
    and d.won_at >= w.t_from and d.won_at < w.t_to
  group by d.owner_id
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
         -- chia NGUYÊN (floor) — nhịp là mốc so sánh, không cần lẻ
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
$$;

revoke execute on function public.kpi_progress(date) from public, anon;
grant execute on function public.kpi_progress(date) to authenticated;
