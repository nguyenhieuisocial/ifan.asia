-- ============================================================
-- iFan.asia — Migration #135: `admin_platform_overview()` và
-- `admin_tenant_health()` (RPC nền cho `/admin`, task #16) đếm/liệt kê
-- GỘP CẢ tiệm mẫu/demo — cùng lớp lỗi với `platform_status.contacts_total`
-- (task #148, migration #133). Phát hiện lúc soát toàn diện việc #149.
--
-- ĐO THẬT trước khi vá: CSDL đang có 9 tiệm — 3 thật, 6 mẫu (67%!). Cả 6
-- tiệm mẫu đều có gói `pro` trạng thái `trialing` (do seed dựng lên để
-- demo). Hệ quả: màn `/admin` (dashboard chính founder theo dõi sức khoẻ
-- kinh doanh) đang hiện:
--   - Tổng số tiệm = 9 thay vì 3 (gấp 3 lần thật)
--   - "Đang dùng thử" (trialing) = 6 tiệm mẫu, không phải khách thật nào
--   - Bảng "sức khoẻ từng tiệm" trộn lẫn 6 dòng demo vào cùng danh sách
--     với 3 tiệm thật, không phân biệt được
--   - `signups_30d`, `healthy/idle/dormant`, TTV cũng bị pha loãng theo
--
-- CHƯA ảnh hưởng tới MRR/ARR (6 tiệm mẫu đang ở trạng thái `trialing`,
-- không tính vào MRR — MRR chỉ cộng `status in ('active','past_due')`) —
-- nhưng vẫn lọc `is_sample` luôn ở đây để phòng xa (nếu sau này có tiệm
-- mẫu nào lỡ chuyển trạng thái `active`, MRR sẽ SAI ngay lập tức mà không
-- ai biết — matching bài học D2 "đừng đợi lỗi xảy ra rồi mới vá chỗ dễ đo").
--
-- VÁ: thêm `and coalesce(t.is_sample, false) = false` ở mọi chỗ truy vấn
-- `public.tenants` trong 2 hàm — cùng luật với `tenants_active` trong
-- `platform_status()` và `contacts_total` (migration #133). Toàn bộ phần
-- còn lại CHÉP NGUYÊN VĂN từ định nghĩa đang chạy thật trên CSDL (đọc qua
-- `pg_get_functiondef`, không viết lại theo trí nhớ).
-- ============================================================

create or replace function public.admin_platform_overview()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_mrr bigint;
  c record;
  h record;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  insert into public.admin_audit_logs (actor_user_id, action)
    values (v_uid, 'platform_overview.read');

  select coalesce(sum(case when s.billing_cycle = 'year'
                           then round(p.price_year / 12.0)
                           else p.price_month end), 0)::bigint
    into v_mrr
    from public.subscriptions s
    join public.plans p on p.code = s.plan_code
    join public.tenants t on t.id = s.tenant_id and coalesce(t.is_sample, false) = false
   where s.status in ('active','past_due') and s.plan_code <> 'free';

  select
    count(*)::int total,
    count(*) filter (where s.status = 'trialing')::int trialing,
    count(*) filter (where s.status = 'active' and s.plan_code <> 'free')::int active_paid,
    count(*) filter (where s.status = 'active' and s.plan_code = 'free')::int active_free,
    count(*) filter (where s.status = 'past_due')::int past_due,
    count(*) filter (where s.status = 'suspended')::int suspended,
    count(*) filter (where s.id is null)::int no_subscription,
    count(*) filter (where t.created_at > now() - interval '30 days')::int signups_30d
    into c
    from public.tenants t
    left join public.subscriptions s
      on s.tenant_id = t.id and s.status <> 'canceled'
   where t.deleted_at is null and coalesce(t.is_sample, false) = false;

  with act as (
    select tenant_id, max(created_at) last_at from public.domain_events group by 1
  ), val as (
    select tenant_id, min(created_at) first_at from public.contacts group by 1
  ), base as (
    select t.id, t.created_at,
           coalesce(a.last_at, t.created_at) last_at,
           v.first_at
      from public.tenants t
      left join act a on a.tenant_id = t.id
      left join val v on v.tenant_id = t.id
     where t.deleted_at is null and coalesce(t.is_sample, false) = false
  )
  select
    count(*) filter (where last_at >= now() - interval '7 days')::int healthy,
    count(*) filter (where last_at <  now() - interval '7 days'
                       and last_at >= now() - interval '30 days')::int idle,
    count(*) filter (where last_at <  now() - interval '30 days')::int dormant,
    count(*) filter (where first_at is not null)::int activated,
    count(*)::int total,
    percentile_cont(0.5) within group (
      order by greatest(extract(epoch from (first_at - created_at)) / 3600.0, 0)
    ) filter (where first_at is not null) ttv_median_hours
    into h
    from base;

  return jsonb_build_object(
    'mrr', v_mrr,
    'arr', v_mrr * 12,
    'tenants', jsonb_build_object(
      'total', c.total, 'trialing', c.trialing,
      'active_paid', c.active_paid, 'active_free', c.active_free,
      'past_due', c.past_due, 'suspended', c.suspended,
      'no_subscription', c.no_subscription, 'signups_30d', c.signups_30d),
    'health', jsonb_build_object(
      'healthy', h.healthy, 'idle', h.idle, 'dormant', h.dormant),
    'ttv', jsonb_build_object(
      'activated', h.activated, 'total', h.total,
      'median_hours', round(coalesce(h.ttv_median_hours, 0)::numeric, 1)),
    'generated_at', now()
  );
end $function$;

create or replace function public.admin_tenant_health(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_rows jsonb;
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  insert into public.admin_audit_logs (actor_user_id, action, meta)
    values (v_uid, 'tenant_health.read', jsonb_build_object('limit', v_limit));

  with act as (
    select tenant_id, max(created_at) last_at from public.domain_events group by 1
  ), val as (
    select tenant_id, min(created_at) first_at from public.contacts group by 1
  )
  select coalesce(jsonb_agg(x order by x_created desc), '[]'::jsonb)
    into v_rows
    from (
      select t.created_at as x_created, jsonb_build_object(
        'tenant_id', t.id,
        'name', t.name,
        'slug', t.slug,
        'created_at', t.created_at,
        'plan_code', coalesce(s.plan_code, 'free'),
        'status', coalesce(s.status, 'none'),
        'mrr', case when s.status in ('active','past_due') and s.plan_code <> 'free'
                    then (case when s.billing_cycle = 'year'
                               then round(p.price_year / 12.0) else p.price_month end)::bigint
                    else 0 end,
        'members', (select count(*) from public.tenant_members m
                     where m.tenant_id = t.id and m.status = 'active'),
        'seat_limit', public.tenant_seat_limit(t.id),
        'last_active_at', coalesce(a.last_at, t.created_at),
        'days_inactive', floor(extract(epoch from (now() - coalesce(a.last_at, t.created_at))) / 86400)::int,
        'ttv_hours', case when v.first_at is null then null
                          else round(greatest(extract(epoch from (v.first_at - t.created_at)) / 3600.0, 0)::numeric, 1)
                     end
      ) as x
      from public.tenants t
      left join public.subscriptions s on s.tenant_id = t.id and s.status <> 'canceled'
      left join public.plans p on p.code = s.plan_code
      left join act a on a.tenant_id = t.id
      left join val v on v.tenant_id = t.id
     where t.deleted_at is null and coalesce(t.is_sample, false) = false
     order by t.created_at desc
     limit v_limit
    ) q;

  return v_rows;
end $function$;

grant execute on function public.admin_platform_overview to authenticated;
revoke execute on function public.admin_platform_overview from anon, public;
grant execute on function public.admin_tenant_health to authenticated;
revoke execute on function public.admin_tenant_health from anon, public;
