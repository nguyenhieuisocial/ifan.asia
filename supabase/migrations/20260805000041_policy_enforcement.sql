-- =============================================================
-- iFan.asia — Migration #41: Ép HAI chính sách kinh doanh xuống TẦNG CSDL
--
-- Cả hai chốt này trước đây chỉ nằm ở tầng web, nghĩa là gọi thẳng PostgREST là
-- đi vòng được. Đưa xuống DB để mọi đường vào (server action, gọi thẳng API,
-- SQL tay của người dùng) đều phải qua cùng một cửa.
--
-- ---------------------------------------------------------------------------
-- PHẦN A — THÔNG TIN GÓI CƯỚC CHỈ DÀNH CHO CHỦ TIỆM VÀ QUẢN TRỊ VIÊN
-- ---------------------------------------------------------------------------
--   `billing_overview()`, `tenant_seats()`, `quote_plan_change()` đang chỉ chặn
--   theo TENANT, không chặn theo VAI → nhân viên/quản lý gọi API đọc được gói,
--   hạn mức, số ghế, ngày hết hạn.
--
--   Vì sao siết: đó là chuyện CHI TIÊU của chủ tiệm. Nhân viên biết "tiệm đang
--   xài gói Miễn phí, 2/3 chỗ" không giúp gì cho việc của họ mà lại là thông
--   tin thương mại riêng. `admin` được xem vì họ quản người dùng nên cần biết
--   còn mấy chỗ trống trước khi mời thêm người.
--
--   Vai được lấy từ `tenant_members` theo `auth.uid()` — KHÔNG tin claim JWT
--   (cùng nguyên tắc migration #28: danh tính đáng tin duy nhất là `auth.uid()`
--   do Supabase ký; dự án còn đang chạy nhánh fallback của #3 nên claim `role`
--   có thể cũ).
--
-- ---------------------------------------------------------------------------
-- PHẦN B — MỘT TÀI KHOẢN MẶC ĐỊNH CHỈ MỞ ĐƯỢC MỘT TIỆM
-- ---------------------------------------------------------------------------
--   `create_tenant()` đang chỉ đòi "đã đăng nhập". Chốt "đã có tiệm rồi thì
--   thôi" nằm ở `app/auth/actions.ts` → gọi thẳng RPC là mở được vô hạn tiệm,
--   mỗi tiệm một lượt dùng thử 30 ngày.
--
--   KHÔNG chặn cứng vĩnh viễn: chuỗi spa nhiều chi nhánh là nhu cầu thật. Bảng
--   `tenant_creation_limits` cho founder nâng hạn mức cho TỪNG tài khoản cụ thể.
--   Vắng dòng = mặc định 1 tiệm.
--
--   ĐẾM THẾ NÀO: đếm MỌI dòng `tenant_members` của tài khoản, không chỉ dòng
--   `owner`. Đây đúng bằng luật mà tầng web đang áp từ trước ("đã thuộc tiệm nào
--   thì thôi") nên siết xuống DB KHÔNG làm đổi hành vi của một ai đang dùng.
--   Đếm hẹp hơn (chỉ `owner`) sẽ vô tình mở cửa cho nhân viên tiệm khác tự mở
--   tiệm riêng — một thay đổi sản phẩm không ai yêu cầu.
--
-- KHÔNG có trong migration này (cố ý):
--   · không nới lỏng bất kỳ policy nào đang có — chỉ THÊM chốt;
--   · không đụng `change_plan` (đã tự kiểm vai chủ tiệm từ #27);
--   · không làm màn quản trị hạn mức trong app — founder ghi thẳng SQL editor,
--     giống `platform_admins` của #28. Chưa có nhu cầu đủ lớn để làm giao diện;
--   · không làm nút "mở thêm chi nhánh" trong app. Tài khoản được nâng hạn mức
--     vào thẳng `/onboarding` là tạo được tiệm tiếp theo — đủ dùng cho vài ca
--     ngoại lệ founder tự duyệt, chưa đáng làm giao diện riêng.
-- =============================================================

-- =============================================================
-- PHẦN A — CHỐT VAI CHO THÔNG TIN GÓI CƯỚC
-- =============================================================

/**
 * Người đang gọi có được xem chuyện tiền nong của tiệm này không?
 * CHỈ `owner` và `admin`. Đọc thẳng `tenant_members` theo `auth.uid()`.
 *
 * security definer vì `tenant_members` bật RLS và hàm này được chính các RPC
 * definer gọi; revoke khỏi client để không ai dùng nó dò vai người khác.
 */
create or replace function public.can_read_billing(p_tenant uuid)
returns boolean
language sql stable
security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.tenant_members tm
     where tm.tenant_id = p_tenant
       and tm.user_id   = auth.uid()
       and tm.status    = 'active'
       and tm.role in ('owner', 'admin')
  )
$$;
comment on function public.can_read_billing(uuid) is
  'Chỉ owner/admin của tiệm được xem gói cước, hạn mức, số ghế (migration #41).';
revoke execute on function public.can_read_billing(uuid) from anon, authenticated, public;

-- ---------- billing_overview(): giữ NGUYÊN thân, thêm chốt vai ----------
-- Bản gốc đọc từ DB thật bằng pg_get_functiondef trước khi viết đè (#27 + các
-- bản vá sau đó). Thay đổi DUY NHẤT: 2 dòng kiểm `can_read_billing`.
create or replace function public.billing_overview()
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $function$
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
  -- #41: chuyện chi tiêu của chủ tiệm — nhân viên/quản lý không đọc được
  if not public.can_read_billing(v_tenant) then raise exception 'forbidden'; end if;
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
end $function$;
grant execute on function public.billing_overview to authenticated;
revoke execute on function public.billing_overview from anon, public;

-- ---------- tenant_seats(): giữ NGUYÊN thân, thêm chốt vai ----------
create or replace function public.tenant_seats()
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_limit bigint;
  v_members bigint;
  v_pending bigint;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- #41: số ghế là hạn mức của GÓI — cùng nhóm thông tin với gói cước
  if not public.can_read_billing(v_tenant) then raise exception 'forbidden'; end if;
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
end $function$;
grant execute on function public.tenant_seats to authenticated;
revoke execute on function public.tenant_seats from anon, public;

-- ---------- quote_plan_change(): giữ NGUYÊN thân, thêm chốt vai ----------
create or replace function public.quote_plan_change(p_plan_code text, p_cycle text)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $function$
declare v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- #41: báo giá đổi gói lộ nguyên bảng giá + số dư của tiệm
  if not public.can_read_billing(v_tenant) then raise exception 'forbidden'; end if;
  return public.billing_quote(v_tenant, p_plan_code, p_cycle);
end $function$;
grant execute on function public.quote_plan_change to authenticated;
revoke execute on function public.quote_plan_change from anon, public;

-- =============================================================
-- PHẦN B — HẠN MỨC SỐ TIỆM MỘT TÀI KHOẢN ĐƯỢC MỞ
-- =============================================================

/**
 * Nâng hạn mức cho MỘT tài khoản cụ thể. Vắng dòng = mặc định 1 tiệm.
 *
 * RLS BẬT, KHÔNG CÓ POLICY NÀO — giống `platform_admins` của #28:
 * anon/authenticated không đọc, không ghi, không tự nâng hạn mức cho mình.
 * Chỉ service role (founder qua SQL editor) chạm được:
 *
 *   insert into public.tenant_creation_limits (user_id, max_tenants, note)
 *   select id, 3, 'Chuỗi spa 3 chi nhánh - hợp đồng 08/2026'
 *     from auth.users where email = 'chu-tiem@...';
 */
create table if not exists public.tenant_creation_limits (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  max_tenants  int not null default 1 check (max_tenants >= 0),
  note         text,
  created_at   timestamptz not null default now()
);
comment on table public.tenant_creation_limits is
  'Hạn mức số tiệm mỗi tài khoản được mở. Vắng dòng = 1. RLS bật, KHÔNG policy — chỉ service role ghi được.';
comment on column public.tenant_creation_limits.note is
  'Vì sao được nâng — để lần sau còn biết đường mà xét lại.';
alter table public.tenant_creation_limits enable row level security;

/**
 * Tài khoản này còn mở thêm được tiệm nào không?
 *
 * Có hàm này để tầng web KHÔNG phải chép lại luật hạn mức lần thứ hai. Bảng
 * `tenant_creation_limits` không đọc được từ client (RLS bật, không policy) nên
 * nếu không có cửa này thì web chỉ còn cách đoán — và tài khoản được founder
 * nâng hạn mức sẽ bị chính màn web chặn trước khi kịp gọi `create_tenant`.
 *
 * Chỉ trả ĐÚNG/SAI về CHÍNH mình: không lộ trần là bao nhiêu, không dò được ai.
 */
create or replace function public.can_create_tenant()
returns boolean
language sql stable
security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
     and (select count(*) from public.tenant_members tm where tm.user_id = auth.uid())
       < coalesce((select l.max_tenants from public.tenant_creation_limits l
                    where l.user_id = auth.uid()), 1)
$$;
comment on function public.can_create_tenant() is
  'Tài khoản đang đăng nhập còn mở thêm được tiệm không (migration #41). Chỉ trả đúng/sai về chính mình.';
grant execute on function public.can_create_tenant to authenticated;
revoke execute on function public.can_create_tenant from anon, public;

-- ---------- create_tenant(): giữ NGUYÊN thân, thêm chốt hạn mức ----------
-- Bản gốc đọc từ DB thật bằng pg_get_functiondef (bản mới nhất sau #1/#2/#4/
-- #13/#15/#17/#19). Thay đổi DUY NHẤT: khối kiểm hạn mức ngay sau kiểm đăng nhập.
create or replace function public.create_tenant(p_name text, p_slug text)
returns uuid
language plpgsql
security definer set search_path = public, pg_temp as $function$
declare
  v_tenant uuid;
  v_pipeline uuid;
  v_max int;
  v_joined int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- #41: mặc định MỘT tiệm/tài khoản, nâng được cho từng tài khoản.
  -- Khóa theo user trước khi đếm: hai lời gọi song song không cùng lọt qua cửa
  -- (không có khóa thì mở 10 tab bấm cùng lúc là lách được cả chốt này).
  perform pg_advisory_xact_lock(hashtext('create_tenant:' || auth.uid()::text));
  v_max := coalesce(
    (select l.max_tenants from public.tenant_creation_limits l where l.user_id = auth.uid()),
    1);
  select count(*) into v_joined from public.tenant_members tm
    where tm.user_id = auth.uid();
  if v_joined >= v_max then
    raise exception 'tenant_limit_reached';
  end if;

  insert into public.tenants (name, slug, trial_ends_at)
    values (p_name, lower(p_slug), now() + interval '30 days')
    returning id into v_tenant;
  insert into public.tenant_members (tenant_id, user_id, role, joined_at)
    values (v_tenant, auth.uid(), 'owner', now());

  -- Seed pipeline mặc định "Bán hàng" + 6 stage (win_probability mặc định, chỉnh được)
  insert into public.pipelines (tenant_id, name, is_default, position)
    values (v_tenant, 'Bán hàng', true, 0)
    returning id into v_pipeline;
  insert into public.pipeline_stages
    (tenant_id, pipeline_id, name, position, kind, win_probability, i18n_key) values
    (v_tenant, v_pipeline, 'Mới',         0, 'open', 10,  'stage.new'),
    (v_tenant, v_pipeline, 'Đang tư vấn', 1, 'open', 30,  'stage.consulting'),
    (v_tenant, v_pipeline, 'Hẹn lịch',    2, 'open', 60,  'stage.scheduled'),
    (v_tenant, v_pipeline, 'Đã chốt',     3, 'won', 100,  'stage.won'),
    (v_tenant, v_pipeline, 'Quay lại',    4, 'open', 20,  'stage.returning'),
    (v_tenant, v_pipeline, 'Thua',        5, 'lost', 0,   'stage.lost');

  -- Seed 5 lý do thua mặc định (dữ liệu tenant — tiếng Việt theo thiết kế, xem đầu file)
  insert into public.lost_reasons (tenant_id, name, position, i18n_key) values
    (v_tenant, 'Giá cao',             0, 'lostReason.price'),
    (v_tenant, 'Chọn đối thủ',        1, 'lostReason.competitor'),
    (v_tenant, 'Không còn nhu cầu',   2, 'lostReason.noNeed'),
    (v_tenant, 'Không liên lạc được', 3, 'lostReason.unreachable'),
    (v_tenant, 'Khác',                4, 'lostReason.other');

  -- Seed 4 nguồn khách mặc định
  insert into public.lead_sources (tenant_id, name, channel_type, is_system, i18n_key) values
    (v_tenant, 'Zalo',       'zalo',     true, 'source.zalo'),
    (v_tenant, 'Facebook',   'facebook', true, 'source.facebook'),
    (v_tenant, 'Giới thiệu', 'referral', true, 'source.referral'),
    (v_tenant, 'Khác',       'other',    true, 'source.other');

  -- Seed 2 playbook cài sẵn (migration #15)
  perform public.wf_seed_playbooks(v_tenant);
  -- Seed 2 chính sách SLA cài sẵn (migration #17)
  perform public.sla_seed_policies(v_tenant);
  -- Seed ngưỡng phân hạng mặc định (migration #19)
  insert into public.tier_rules (tenant_id) values (v_tenant);

  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid(), 'platform');
  return v_tenant;
end $function$;
grant execute on function public.create_tenant to authenticated;
revoke execute on function public.create_tenant from anon, public;
