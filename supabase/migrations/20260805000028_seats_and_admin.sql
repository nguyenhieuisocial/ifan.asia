-- =============================================================
-- iFan.asia — Migration #28: Giới hạn số nhân viên theo gói + Super-admin lõi
--
-- PHẦN A — GHẾ NGỒI (seats): gói cho tối đa bao nhiêu người thì chỉ thêm được
--   bấy nhiêu. Chặn ở TẦNG DB bằng trigger nên gọi thẳng PostgREST cũng không
--   lách được (policy `members_manage` của #2 vẫn cho owner/admin insert thẳng
--   vào tenant_members — trigger là lớp chặn thật).
--
-- PHẦN B — SUPER-ADMIN: màn DUY NHẤT trong hệ thống nhìn xuyên tenant.
--   Nguyên tắc bảo mật:
--     1) Danh tính super-admin nằm ở bảng `platform_admins` — RLS BẬT, KHÔNG
--        CÓ POLICY NÀO. anon/authenticated không đọc, không ghi, không tự thêm
--        mình. Chỉ service role (founder qua SQL editor) ghi được.
--     2) KHÔNG dựa vào JWT claim: dự án đang chạy nhánh fallback của #3 (hook
--        Custom Access Token có thể chưa bật) nên claim không đáng tin. Danh
--        tính duy nhất đáng tin là `auth.uid()` — do Supabase ký, người dùng
--        không sửa được.
--     3) KHÔNG THÊM MỘT POLICY NÀO cho bảng nghiệp vụ. Cửa duy nhất là các RPC
--        security definer có `is_platform_admin()` ở dòng đầu. Tường cách ly
--        tenant của người dùng thường KHÔNG bị đụng tới.
--     4) CHỈ SỐ TỔNG HỢP. Không có tên khách, không có tin nhắn, không có deal
--        — dữ liệu riêng tư của khách hàng của tiệm không đi qua cửa này.
--
-- KHÔNG có trong migration này (cố ý):
--   mrr_snapshots + cron (biểu đồ xu hướng — MRR hiện tính trực tiếp, luôn đúng),
--   impersonation, sửa gói tay, feature flags (spec §4.3 mục 17-20, đợt sau).
-- =============================================================

-- =============================================================
-- PHẦN A — GIỚI HẠN SỐ NHÂN VIÊN THEO GÓI
-- =============================================================

/**
 * Số ghế ĐANG CHIẾM của một tiệm = thành viên đang hoạt động
 *                                 + lời mời còn hiệu lực (chưa hết hạn).
 *
 * Vì sao đếm cả lời mời: nếu không, tiệm gói Miễn phí (3 ghế, 1 chủ) gửi 50
 * lời mời một lúc rồi 50 người bấm nhận — tất cả đều "hợp lệ" tại thời điểm mời.
 * Ghế bị giữ ngay khi mời, nhả ra khi lời mời bị thu hồi / hết hạn.
 */
create or replace function public.tenant_seats_used(p_tenant uuid)
returns bigint
language sql stable
security definer set search_path = public as $$
  select (select count(*) from public.tenant_members
            where tenant_id = p_tenant and status = 'active')
       + (select count(*) from public.invitations
            where tenant_id = p_tenant and status = 'pending' and expires_at > now())
$$;
revoke execute on function public.tenant_seats_used from anon, authenticated, public;

/**
 * Trần ghế của gói đang giữ. null = không giới hạn (gói Doanh nghiệp).
 * Dùng lại `plan_limit` của #27 để chỉ có MỘT nơi định nghĩa hạn mức:
 *   trialing/active/past_due → hạn mức gói đang giữ
 *   suspended/canceled       → 0 (tài khoản chỉ xem, không thêm người)
 */
create or replace function public.tenant_seat_limit(p_tenant uuid)
returns bigint
language sql stable
security definer set search_path = public as $$
  select public.plan_limit(p_tenant, 'max_members')
$$;
revoke execute on function public.tenant_seat_limit from anon, authenticated, public;

/**
 * LỚP CHẶN TẦNG DB. Gắn trên cả `tenant_members` lẫn `invitations` nên mọi
 * đường vào đều đi qua đây: server action, gọi thẳng PostgREST, hay SQL tay.
 * Chỉ kiểm khi ghế THỰC SỰ bị chiếm thêm — đổi vai, sửa tên, gỡ người đều không
 * chạm vào ràng buộc này.
 */
create or replace function public.enforce_seat_limit() returns trigger
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid := new.tenant_id;
  -- trạng thái nghĩa là "đang chiếm 1 ghế" của từng bảng
  v_busy text := case when tg_table_name = 'tenant_members' then 'active' else 'pending' end;
  v_takes boolean;
  v_limit bigint;
  v_used bigint;
begin
  -- Chỉ kiểm khi ghế THỰC SỰ bị chiếm thêm. (Không gộp điều kiện vào một biểu
  -- thức có OLD: nhánh INSERT chưa có OLD, mà SQL không bảo đảm short-circuit.)
  if tg_op = 'INSERT' then
    v_takes := new.status = v_busy;
  else
    v_takes := new.status = v_busy and old.status is distinct from v_busy;
  end if;

  if not v_takes then return new; end if;

  v_limit := public.tenant_seat_limit(v_tenant);
  if v_limit is null then return new; end if;   -- gói không giới hạn

  v_used := public.tenant_seats_used(v_tenant);
  if v_used >= v_limit then
    raise exception 'seat_limit_reached'
      using detail = format('used=%s limit=%s', v_used, v_limit);
  end if;
  return new;
end $$;

create trigger tenant_members_seat_limit
  before insert or update of status on public.tenant_members
  for each row execute function public.enforce_seat_limit();

create trigger invitations_seat_limit
  before insert or update of status on public.invitations
  for each row execute function public.enforce_seat_limit();

/**
 * Số ghế của tiệm ĐANG ĐĂNG NHẬP — cho màn Nhân viên và màn Gói của tôi.
 * `over_limit` = đang thừa người so với gói (chỉ xảy ra khi HẠ GÓI).
 *
 * QUYẾT ĐỊNH VỀ HẠ GÓI KHI ĐANG THỪA NGƯỜI:
 *   Không chặn hạ gói, KHÔNG tự xóa ai. Người đang có giữ nguyên quyền truy cập.
 *   Chỉ khoá việc THÊM người mới cho tới khi số người về dưới trần.
 *   Lý do: (a) xóa người là mất dữ liệu phân công, không được phép làm âm thầm;
 *   (b) chặn hạ gói sẽ giam khách trong gói đắt — và cron hết-dùng-thử của #27
 *   tự hạ về Miễn phí, chặn sẽ làm cron gãy.
 */
create or replace function public.tenant_seats()
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_limit bigint;
  v_members bigint;
  v_pending bigint;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  v_limit := public.tenant_seat_limit(v_tenant);
  select count(*) into v_members from public.tenant_members
    where tenant_id = v_tenant and status = 'active';
  select count(*) into v_pending from public.invitations
    where tenant_id = v_tenant and status = 'pending' and expires_at > now();
  return jsonb_build_object(
    'members', v_members,
    'pending', v_pending,
    'used', v_members + v_pending,
    'limit', v_limit,
    'over_limit', v_limit is not null and (v_members + v_pending) > v_limit
  );
end $$;
grant execute on function public.tenant_seats to authenticated;
revoke execute on function public.tenant_seats from anon, public;

/**
 * Nhận lời mời. Người được mời chưa thuộc tiệm nào → RLS của `invitations`
 * không cho họ tự tra token, nên phải đi qua hàm definer này.
 *
 * Token gốc chỉ tồn tại trong đường link; DB chỉ giữ SHA-256 (cột token_hash
 * của #2) — lộ database vẫn không dựng lại được link mời.
 *
 * Đánh dấu lời mời "đã nhận" TRƯỚC khi thêm thành viên: ghế của chính lời mời
 * này nhả ra trước, nếu không trigger đếm thành 2 ghế và chặn nhầm người cuối.
 */
create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  inv public.invitations;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid_token'; end if;

  select * into inv from public.invitations
    where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
    for update;
  if inv.id is null then raise exception 'invalid_token'; end if;
  if inv.status <> 'pending' then raise exception 'invitation_used'; end if;
  if inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = inv.id;
    raise exception 'invitation_expired';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if lower(v_email) is distinct from lower(inv.email::text) then
    raise exception 'invitation_email_mismatch';
  end if;

  update public.invitations set status = 'accepted' where id = inv.id;

  insert into public.tenant_members (tenant_id, user_id, role, status, invited_by, joined_at)
    values (inv.tenant_id, v_uid, inv.role, 'active', inv.invited_by, now())
  on conflict (tenant_id, user_id) do update
    set status = 'active', role = excluded.role, joined_at = now();

  return jsonb_build_object('tenant_id', inv.tenant_id, 'role', inv.role);
end $$;
grant execute on function public.accept_invitation to authenticated;
revoke execute on function public.accept_invitation from anon, public;

/**
 * `billing_overview` của #27 đếm ghế bằng `count(*) tenant_members` — tính cả
 * người đã gỡ và bỏ sót lời mời đang treo, tức là màn Gói hiện một con số còn
 * luồng mời chặn theo con số khác. Thay đổi DUY NHẤT: dùng chung
 * `tenant_seats_used` để hai nơi luôn nói cùng một điều.
 */
create or replace function public.billing_overview()
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  s public.subscriptions;
  p public.plans;
  v_period text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM');
  v_ai_used bigint;
  v_members bigint;
  v_end timestamptz;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  s := public.live_subscription(v_tenant);
  select * into p from public.plans where code = coalesce(s.plan_code, 'free');

  select coalesce(used, 0) into v_ai_used from public.usage_counters
    where tenant_id = v_tenant and metric = 'ai_calls' and period = v_period;
  v_members := public.tenant_seats_used(v_tenant);

  v_end := case when s.status = 'trialing' then coalesce(s.trial_ends_at, s.current_period_end)
                else s.current_period_end end;

  return jsonb_build_object(
    'status', coalesce(s.status, 'none'),
    'plan_code', p.code,
    'plan_name_vi', p.name_vi,
    'plan_name_en', p.name_en,
    'billing_cycle', coalesce(s.billing_cycle, 'month'),
    'price_month', p.price_month,
    'price_year', p.price_year,
    'period_end', v_end,
    'days_left', greatest(ceil(extract(epoch from (v_end - now())) / 86400)::int, 0),
    'grace_ends_at', s.grace_ends_at,
    'cancel_at_period_end', coalesce(s.cancel_at_period_end, false),
    'credit_balance', coalesce(s.credit_balance, 0),
    'usage', jsonb_build_array(
      jsonb_build_object('metric', 'ai_calls', 'used', coalesce(v_ai_used, 0),
                         'limit', public.plan_limit(v_tenant, 'ai_calls')),
      jsonb_build_object('metric', 'members', 'used', v_members,
                         'limit', public.tenant_seat_limit(v_tenant))
    )
  );
end $$;
grant execute on function public.billing_overview to authenticated;
revoke execute on function public.billing_overview from anon, public;

-- =============================================================
-- PHẦN B — SUPER-ADMIN (chỉ founder của iFan)
-- =============================================================

/**
 * Ai là super-admin. RLS BẬT, KHÔNG CÓ POLICY NÀO → anon/authenticated không
 * select, không insert, không update, không delete. Cấp quyền chỉ bằng service
 * role / SQL editor:
 *   insert into public.platform_admins (user_id)
 *   select id from auth.users where email = 'email-cua-founder@...';
 *
 * Bảng để TRỐNG sau migration (fail-closed): chưa cấp cho ai thì màn super-admin
 * trả 404 với TẤT CẢ mọi người, kể cả owner.
 */
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'super' check (role in ('super','support')),
  note text,
  created_at timestamptz not null default now()
);
comment on table public.platform_admins is
  'Danh sách super-admin nền tảng. RLS bật, KHÔNG policy — chỉ service role ghi/đọc được.';
alter table public.platform_admins enable row level security;

/**
 * Nhật ký hành động super-admin (append-only). Mỗi lần mở màn tổng quan hay
 * đọc danh sách tiệm đều để lại dấu vết: ai, lúc nào, xem gì.
 * RLS bật, KHÔNG policy → không ai đọc/sửa/xóa từ client.
 */
create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  tenant_id uuid references public.tenants(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_time_idx on public.admin_audit_logs (created_at desc);
alter table public.admin_audit_logs enable row level security;

/**
 * Danh tính super-admin — CHỈ dựa vào `auth.uid()` (Supabase ký trong JWT,
 * người dùng không sửa được) đối chiếu bảng mà họ không ghi được.
 * KHÔNG đọc app_metadata/user_metadata: metadata phụ thuộc hook Custom Access
 * Token, mà dự án đang chạy được cả khi hook TẮT (#3) — claim thiếu sẽ thành
 * "không phải admin", nhưng nếu ai đó bật được đường ghi metadata thì thành
 * cửa hậu. Bảng + auth.uid() không có rủi ro đó.
 *
 * Trả boolean về CHÍNH người gọi nên cấp cho authenticated là an toàn.
 */
create or replace function public.is_platform_admin() returns boolean
language sql stable
security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
grant execute on function public.is_platform_admin to authenticated;
revoke execute on function public.is_platform_admin from anon, public;

/**
 * TỔNG QUAN NỀN TẢNG — MRR, số tiệm theo trạng thái, sức khỏe, TTV.
 * CHỈ SỐ TỔNG HỢP: không có một dòng dữ liệu kinh doanh nào của tiệm đi qua đây.
 *
 * Định nghĩa:
 *   MRR       = doanh thu quy về THÁNG của các thuê bao đang thu tiền
 *               (active + past_due, gói có phí). Trả năm chia 12.
 *               Dùng thử chưa trả đồng nào → không tính, đếm riêng.
 *   Sức khỏe  = khoảng cách tới lần phát sinh việc gần nhất (domain_events):
 *               ≤7 ngày còn chạy · 8–30 ngày đang nguội · >30 ngày đã bỏ.
 *   TTV       = từ lúc tạo tiệm tới lúc có KHÁCH ĐẦU TIÊN trong hệ thống
 *               (bảng contacts) — mốc "dùng thật" đầu tiên. Lấy trung vị.
 */
create or replace function public.admin_platform_overview()
returns jsonb
language plpgsql
security definer set search_path = public as $$
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
   where t.deleted_at is null;

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
     where t.deleted_at is null
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
end $$;
grant execute on function public.admin_platform_overview to authenticated;
revoke execute on function public.admin_platform_overview from anon, public;

/**
 * DANH SÁCH TIỆM — mỗi dòng chỉ có: tên tiệm, tên miền phụ, ngày tạo, gói,
 * trạng thái, doanh thu tháng, SỐ người, lần hoạt động gần nhất, TTV.
 *
 * CỐ Ý KHÔNG CÓ: tên khách hàng, số điện thoại, tin nhắn, đơn hàng, email nhân
 * viên. Đó là dữ liệu riêng tư của khách hàng iFan — founder không cần nó để
 * đo sức khỏe kinh doanh, nên cửa này không mở ra nó.
 */
create or replace function public.admin_tenant_health(p_limit int default 100)
returns jsonb
language plpgsql
security definer set search_path = public as $$
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
     where t.deleted_at is null
     order by t.created_at desc
     limit v_limit
    ) q;

  return v_rows;
end $$;
grant execute on function public.admin_tenant_health to authenticated;
revoke execute on function public.admin_tenant_health from anon, public;
