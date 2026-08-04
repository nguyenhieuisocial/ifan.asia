-- =============================================================
-- iFan.asia — Migration #27: Vòng đời gói thuê bao + hạn mức theo gói
--
-- PHẠM VI: phần KHÔNG phụ thuộc nhà cung cấp thanh toán.
--   A. Danh mục gói (plans) — nguồn sự thật DUY NHẤT của giá + hạn mức
--   B. Thuê bao (subscriptions) + vòng đời: trialing → active → past_due
--      → suspended → canceled
--   C. Toán tiền: pro-rata nâng/hạ gói giữa kỳ, trả năm giảm 15%
--   D. Hoá đơn + RANH GIỚI THANH TOÁN (record_subscription_payment) —
--      idempotent, chỉ service role gọi được
--   E. Hạn mức theo gói nối vào increment_usage/usage_counters sẵn có (#2/#7)
--   F. Cron chuyển trạng thái — IDEMPOTENT, không bắn thông báo trùng
--
-- KHÔNG có trong migration này (chờ chốt SePay/PayOS + pháp nhân):
--   gọi API cổng thanh toán, sinh mã VietQR, xử lý webhook. Chỗ nhận tiền
--   dừng đúng ở record_subscription_payment() — nối cổng chỉ cần một lớp
--   mỏng gọi hàm này.
--
-- GHI CHÚ THIẾT KẾ:
--   1) subscriptions.plan_code dùng CHECK constraint thay vì FK sang plans.
--      Lý do: scripts/rls-smoke.mjs dò FK của bảng tenant-scoped rồi seed bản
--      ghi cha bằng `select ... where tenant_id = $1`; plans là bảng PLATFORM
--      (không có tenant_id) nên FK sang nó sẽ làm smoke test gãy. Danh mục gói
--      cố định 4 mã nên CHECK là ràng buộc đủ mạnh.
--   2) Tenant mới nhận subscription qua TRIGGER trên tenants (không sửa
--      create_tenant): create_tenant đang được nhiều migration song song
--      `create or replace` toàn thân hàm — thêm trigger là cách duy nhất
--      không giẫm chân nhau.
--   3) Chống bắn trùng học từ #17 (sla_events_once_uidx): unique index trên
--      (subscription_id, kind, cycle_key) + chỉ thông báo khi INSERT thật sự
--      tạo được dòng.
-- =============================================================

-- =============================================================
-- PHẦN A — DANH MỤC GÓI (nguồn sự thật của giá)
-- =============================================================

create table public.plans (
  code text primary key check (code in ('free','basic','pro','business')),
  name_vi text not null,
  name_en text not null,
  price_month bigint not null check (price_month >= 0),
  price_year bigint not null check (price_year >= 0),
  -- {"ai_calls": 200, "max_members": 10} — null/thiếu khoá = không giới hạn
  limits jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  -- Giảm 15% năm phải ĐÚNG ĐẾN ĐỒNG kể cả khi super-admin sửa giá tay.
  -- Giá catalog đều là bội của 1000 nên phép chia nguyên này là chính xác.
  constraint plans_year_is_85_percent
    check (price_year = price_month * 12 * 85 / 100)
);

comment on table public.plans is
  'Danh mục gói cước — NGUỒN SỰ THẬT của giá. Trang bảng giá công khai phải khớp bảng này.';

alter table public.plans enable row level security;
-- Giá là thông tin công khai: ai cũng đọc được. Ghi: chỉ service role (không policy).
create policy plans_public_read on public.plans for select
  to anon, authenticated using (true);

insert into public.plans (code, name_vi, name_en, price_month, price_year, limits, sort) values
  ('free',     'Miễn phí',  'Free',     0,       0,
   '{"ai_calls": 20, "max_members": 3}'::jsonb, 0),
  ('basic',    'Cơ bản',    'Basic',    199000,  199000 * 12 * 85 / 100,
   '{"ai_calls": 200, "max_members": 10}'::jsonb, 1),
  ('pro',      'Chuyên nghiệp', 'Pro',  399000,  399000 * 12 * 85 / 100,
   '{"ai_calls": 1000, "max_members": 30}'::jsonb, 2),
  ('business', 'Doanh nghiệp', 'Business', 799000, 799000 * 12 * 85 / 100,
   '{"ai_calls": 5000}'::jsonb, 3);

-- =============================================================
-- PHẦN B — THUÊ BAO
-- =============================================================

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_code text not null default 'free'
    check (plan_code in ('free','basic','pro','business')),
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','suspended','canceled')),
  billing_cycle text not null default 'month'
    check (billing_cycle in ('month','year')),
  trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days'),
  -- Ân hạn 7 ngày sau khi quá hạn, hết ân hạn mới tạm ngưng
  grace_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Tiền dư khi hạ gói giữa kỳ — trừ vào lần trả kế tiếp (spec: không hoàn tiền)
  credit_balance bigint not null default 0 check (credit_balance >= 0),
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 1 tenant — 1 thuê bao đang sống
create unique index subscriptions_one_live_per_tenant
  on public.subscriptions (tenant_id) where status <> 'canceled';
create index subscriptions_due_idx
  on public.subscriptions (status, current_period_end);

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ---------- Hoá đơn ----------
create sequence public.subscription_invoice_seq;

create or replace function public.next_invoice_number() returns text
language sql volatile set search_path = public as $$
  select 'IF-' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY') || '-'
         || lpad(nextval('public.subscription_invoice_seq')::text, 6, '0')
$$;

create table public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  number text not null unique default public.next_invoice_number(),
  kind text not null default 'plan_change'
    check (kind in ('plan_change','renewal')),
  plan_code text not null default 'free'
    check (plan_code in ('free','basic','pro','business')),
  billing_cycle text not null default 'month'
    check (billing_cycle in ('month','year')),
  period_start timestamptz not null default now(),
  period_end timestamptz not null default now(),
  -- giá niêm yết của gói/kỳ mới
  amount_gross bigint not null default 0 check (amount_gross >= 0),
  -- phần chưa dùng của gói cũ + credit còn dư, đã trừ vào hoá đơn
  credit_applied bigint not null default 0 check (credit_applied >= 0),
  -- số phải trả THỰC TẾ (đã làm tròn nghìn, không âm)
  amount_due bigint not null default 0 check (amount_due >= 0),
  -- phần dư chuyển sang kỳ sau khi hạ gói
  credit_carried bigint not null default 0 check (credit_carried >= 0),
  status text not null default 'open' check (status in ('open','paid','void')),
  paid_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index subscription_invoices_tenant_idx
  on public.subscription_invoices (tenant_id, created_at desc);

-- ---------- Giao dịch thanh toán: RANH GIỚI IDEMPOTENT ----------
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.subscription_invoices(id) on delete cascade,
  -- 'manual' hôm nay; 'sepay'/'payos'/'momo'/'vnpay' khi nối cổng
  provider text not null default 'manual' check (provider ~ '^[a-z_]{2,20}$'),
  provider_ref text not null default gen_random_uuid()::text,
  amount bigint not null default 0 check (amount >= 0),
  created_at timestamptz not null default now()
);
-- CƠ CHẾ IDEMPOTENT: 1 giao dịch của 1 cổng = 1 dòng, bắn lại bao nhiêu lần cũng vậy
create unique index subscription_payments_idem
  on public.subscription_payments (provider, provider_ref);

-- ---------- Sổ chống bắn trùng của cron (mẫu #17) ----------
create table public.subscription_lifecycle_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  kind text not null check (kind in (
    'trial_ending_3d','trial_ending_1d','trial_ended',
    'past_due','suspended','activated','plan_changed','canceled')),
  -- mã chu kỳ: mốc thời gian neo của lần chuyển này → chạy lại không bắn lại
  cycle_key text not null,
  created_at timestamptz not null default now()
);
create unique index subscription_lifecycle_once
  on public.subscription_lifecycle_log (subscription_id, kind, cycle_key);

-- ---------- RLS ----------
alter table public.subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.subscription_lifecycle_log enable row level security;

-- Đọc: trong phạm vi tenant. GHI: KHÔNG có policy nào — mọi thay đổi đi qua
-- hàm security definer có kiểm quyền, hoặc service role.
create policy subscriptions_select on public.subscriptions for select
  using (tenant_id = (select public.current_tenant_id()));

create policy subscription_invoices_select on public.subscription_invoices for select
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin'));

create policy subscription_payments_select on public.subscription_payments for select
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin'));

create policy subscription_lifecycle_log_select on public.subscription_lifecycle_log for select
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin'));

-- =============================================================
-- PHẦN C — TOÁN TIỀN
-- =============================================================

-- Làm tròn nghìn (nửa lên): 299.500 → 300.000 (tiêu chí A9 của spec)
create or replace function public.billing_round_thousand(p_amount bigint)
returns bigint language sql immutable as $$
  select (round(p_amount::numeric / 1000) * 1000)::bigint
$$;

-- Giá gói theo kỳ
create or replace function public.plan_price(p_code text, p_cycle text)
returns bigint language sql stable set search_path = public as $$
  select case when p_cycle = 'year' then price_year else price_month end
  from public.plans where code = p_code
$$;

-- Thuê bao đang sống của 1 tenant
create or replace function public.live_subscription(p_tenant uuid)
returns public.subscriptions language sql stable set search_path = public as $$
  select * from public.subscriptions
  where tenant_id = p_tenant and status <> 'canceled'
  limit 1
$$;

/**
 * Báo giá đổi gói — TOÁN PRO-RATA.
 *
 * Công thức (spec §6):
 *   phần_chưa_dùng = giá_cũ × thời_gian_còn_lại / độ_dài_kỳ
 *   phải_trả       = giá_mới_kỳ_mới − (phần_chưa_dùng + credit_đang_có)
 *   → làm tròn nghìn, không âm; phần dư cộng vào credit kỳ sau.
 *
 * Không đổi trạng thái gì — chỉ tính để hiện số trước khi khách bấm.
 */
create or replace function public.billing_quote(
  p_tenant uuid, p_plan_code text, p_cycle text
) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  s public.subscriptions;
  v_old_price bigint;
  v_total numeric;
  v_left numeric;
  v_unused bigint := 0;
  v_credit bigint := 0;
  v_new_price bigint;
  v_raw bigint;
  v_due bigint;
  v_carry bigint;
begin
  if p_cycle not in ('month','year') then raise exception 'invalid_cycle'; end if;
  v_new_price := public.plan_price(p_plan_code, p_cycle);
  if v_new_price is null then raise exception 'unknown_plan'; end if;

  s := public.live_subscription(p_tenant);
  if s.id is not null then
    -- Trial chưa trả đồng nào → không có phần chưa dùng để bù trừ
    if s.status = 'active' then
      v_old_price := public.plan_price(s.plan_code, s.billing_cycle);
      v_total := extract(epoch from (s.current_period_end - s.current_period_start));
      v_left  := greatest(extract(epoch from (s.current_period_end - now())), 0);
      if v_total > 0 and v_old_price > 0 then
        v_unused := round(v_old_price::numeric * v_left / v_total)::bigint;
      end if;
    end if;
    v_credit := s.credit_balance;
  end if;

  v_raw   := v_new_price - v_unused - v_credit;
  v_due   := public.billing_round_thousand(greatest(v_raw, 0));
  v_carry := greatest(-v_raw, 0);

  return jsonb_build_object(
    'plan_code', p_plan_code,
    'billing_cycle', p_cycle,
    'list_price', v_new_price,
    'unused_credit', v_unused,      -- phần chưa dùng của gói cũ
    'existing_credit', v_credit,    -- tiền dư sẵn có
    'amount_due', v_due,            -- PHẢI TRẢ (đã làm tròn nghìn)
    'credit_carried', v_carry,      -- dư chuyển kỳ sau
    'current_plan_code', coalesce(s.plan_code, 'free'),
    'current_cycle', coalesce(s.billing_cycle, 'month'),
    'current_status', coalesce(s.status, 'none')
  );
end $$;

-- =============================================================
-- PHẦN E — HẠN MỨC THEO GÓI (nối vào increment_usage sẵn có)
-- =============================================================

/**
 * Hạn mức hiệu lực của 1 tenant cho 1 chỉ số.
 *   không có thuê bao          → hạn mức gói Miễn phí (an toàn)
 *   trialing / active / past_due → hạn mức của gói đang giữ
 *      (past_due còn trong ân hạn 7 ngày — vẫn dùng được như spec §4.13)
 *   suspended / canceled       → 0: KHÔNG tiêu thêm tài nguyên.
 *      Dữ liệu vẫn còn, policy đọc không đổi → khách vẫn xem được mọi thứ.
 * null = không giới hạn.
 */
create or replace function public.plan_limit(p_tenant uuid, p_metric text)
returns bigint
language plpgsql stable set search_path = public as $$
declare
  s public.subscriptions;
  v_code text;
begin
  s := public.live_subscription(p_tenant);
  if s.id is null then
    v_code := 'free';
  elsif s.status in ('suspended','canceled') then
    return 0;
  else
    v_code := s.plan_code;
  end if;
  return (select (limits ->> p_metric)::bigint from public.plans where code = v_code);
end $$;

/**
 * increment_usage — GIỮ NGUYÊN mọi guard của #7 (invalid_amount, invalid_metric,
 * no_tenant_context, quota_exceeded rollback, grants). Thay đổi DUY NHẤT:
 * limit_value lấy từ gói đang giữ thay vì để null (null = vô hạn = thủng trần),
 * và làm mới mỗi lần gọi để ĐỔI GÓI THÌ HẠN MỨC ĐỔI THEO NGAY.
 *
 * Chống vượt trần khi gọi song song: `on conflict do update` khoá dòng
 * usage_counters, các lời gọi đồng thời xếp hàng trên chính dòng đó; mỗi lời
 * gọi đọc `used` SAU khi đã cộng của mình → lời gọi vượt trần raise và tự
 * hoàn tác phần cộng của nó.
 */
create or replace function public.increment_usage(p_metric text, p_amount bigint default 1)
returns bigint
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_period text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM');
  v_used bigint;
  v_limit bigint;
begin
  if p_amount is null or p_amount < 1 or p_amount > 100 then
    raise exception 'invalid_amount';
  end if;
  if p_metric is null or p_metric !~ '^[a-z_]{1,50}$' then
    raise exception 'invalid_metric';
  end if;
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  insert into public.usage_counters as uc (tenant_id, metric, period, used, limit_value)
    values (v_tenant, p_metric, v_period, p_amount, public.plan_limit(v_tenant, p_metric))
  on conflict (tenant_id, metric, period) do update
    set used = uc.used + excluded.used,
        limit_value = excluded.limit_value,
        updated_at = now()
  returning used, limit_value into v_used, v_limit;
  if v_limit is not null and v_used > v_limit then
    raise exception 'quota_exceeded'; -- rollback cả transaction, increment tự hoàn tác
  end if;
  return v_used;
end $$;

grant execute on function public.increment_usage to authenticated;
revoke execute on function public.increment_usage from anon, public;

-- =============================================================
-- PHẦN D — ÁP DỤNG THAY ĐỔI GÓI + RANH GIỚI THANH TOÁN
-- =============================================================

-- Ghi 1 mốc vòng đời; trả true nếu ĐÂY LÀ LẦN ĐẦU (dùng để chặn thông báo trùng)
create or replace function public.billing_log_once(
  p_tenant uuid, p_sub uuid, p_kind text, p_cycle_key text
) returns boolean
language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  insert into public.subscription_lifecycle_log (tenant_id, subscription_id, kind, cycle_key)
  values (p_tenant, p_sub, p_kind, p_cycle_key)
  on conflict do nothing
  returning id into v_id;
  return v_id is not null;
end $$;

-- Chủ tiệm (owner) của tenant — người nhận thông báo về tiền
create or replace function public.billing_owner_user(p_tenant uuid)
returns uuid language sql stable set search_path = public as $$
  select user_id from public.tenant_members
  where tenant_id = p_tenant and role = 'owner'
  order by created_at limit 1
$$;

-- Thông báo + event, chỉ gọi khi billing_log_once trả true
create or replace function public.billing_notify(
  p_tenant uuid, p_event text, p_type text, p_title text, p_body text, p_payload jsonb
) returns void
language plpgsql set search_path = public as $$
declare v_user uuid := public.billing_owner_user(p_tenant);
begin
  insert into public.domain_events
    (tenant_id, event_type, aggregate_type, aggregate_id, payload,
     actor_user_id, source_module, causation_chain)
  values (p_tenant, p_event, 'subscription', p_tenant::text, p_payload,
          null, 'billing', 0);
  if v_user is not null then
    insert into public.notifications (tenant_id, user_id, type, title, body, link)
    values (p_tenant, v_user, p_type, left(p_title, 200), p_body, '/app/settings/billing');
  end if;
end $$;

/**
 * Áp dụng hoá đơn đã trả: đổi gói, mở kỳ mới, cộng credit dư.
 * Chỉ gọi từ record_subscription_payment / change_plan (khi phải trả = 0).
 */
create or replace function public.billing_apply_invoice(p_invoice uuid) returns void
language plpgsql set search_path = public as $$
declare
  inv public.subscription_invoices;
  s public.subscriptions;
  v_first boolean;
begin
  select * into inv from public.subscription_invoices where id = p_invoice for update;
  if inv.id is null then raise exception 'invoice_not_found'; end if;
  select * into s from public.subscriptions where id = inv.subscription_id for update;

  update public.subscriptions set
    plan_code = inv.plan_code,
    billing_cycle = inv.billing_cycle,
    status = 'active',
    current_period_start = now(),
    current_period_end = now() + case when inv.billing_cycle = 'year'
                                      then interval '1 year' else interval '1 month' end,
    grace_ends_at = null,
    trial_ends_at = null,
    credit_balance = inv.credit_carried,
    cancel_at_period_end = false
  where id = s.id;

  -- tenants.plan là cột hiển thị cũ — giữ đồng bộ để không có 2 nơi 2 giá trị
  update public.tenants set plan = inv.plan_code where id = inv.tenant_id;

  v_first := public.billing_log_once(inv.tenant_id, s.id, 'plan_changed', inv.number);
  if v_first then
    perform public.billing_notify(
      inv.tenant_id, 'subscription.plan_changed', 'billing',
      'Gói đã được kích hoạt',
      'Gói của bạn đã chuyển sang ' || inv.plan_code || '. Hoá đơn ' || inv.number || '.',
      jsonb_build_object('plan_code', inv.plan_code, 'billing_cycle', inv.billing_cycle,
                         'invoice', inv.number, 'amount_due', inv.amount_due));
  end if;
end $$;

/**
 * Đổi gói (owner tự bấm trong app).
 * - Tính pro-rata, tạo hoá đơn.
 * - Phải trả = 0 (hạ gói / đủ credit / về Miễn phí) → áp dụng NGAY.
 * - Phải trả > 0 → hoá đơn ở trạng thái "chờ thanh toán"; gói CHƯA đổi.
 *   (chưa nối cổng thanh toán — xem record_subscription_payment)
 */
create or replace function public.change_plan(p_plan_code text, p_cycle text)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  s public.subscriptions;
  q jsonb;
  v_inv public.subscription_invoices;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- Chỉ CHỦ tiệm đổi gói. Admin quản lý người dùng nhưng không đụng tiền (spec §3).
  if public.app_role() is distinct from 'owner' then raise exception 'forbidden'; end if;

  s := public.live_subscription(v_tenant);
  if s.id is null then raise exception 'no_subscription'; end if;
  if s.status = 'suspended' and p_plan_code = 'free' then
    raise exception 'suspended_needs_payment';
  end if;
  if s.status = 'active' and s.plan_code = p_plan_code and s.billing_cycle = p_cycle then
    raise exception 'no_change';
  end if;

  q := public.billing_quote(v_tenant, p_plan_code, p_cycle);

  insert into public.subscription_invoices
    (tenant_id, subscription_id, kind, plan_code, billing_cycle,
     period_start, period_end, amount_gross, credit_applied, amount_due,
     credit_carried, status, meta)
  values
    (v_tenant, s.id, 'plan_change', p_plan_code, p_cycle,
     now(),
     now() + case when p_cycle = 'year' then interval '1 year' else interval '1 month' end,
     (q ->> 'list_price')::bigint,
     (q ->> 'unused_credit')::bigint + (q ->> 'existing_credit')::bigint,
     (q ->> 'amount_due')::bigint,
     (q ->> 'credit_carried')::bigint,
     'open', q)
  returning * into v_inv;

  if v_inv.amount_due = 0 then
    update public.subscription_invoices
      set status = 'paid', paid_at = now() where id = v_inv.id;
    perform public.billing_apply_invoice(v_inv.id);
    return jsonb_build_object('invoice', v_inv.number, 'amount_due', 0, 'applied', true);
  end if;

  return jsonb_build_object('invoice', v_inv.number,
                            'amount_due', v_inv.amount_due, 'applied', false);
end $$;

grant execute on function public.change_plan to authenticated;
revoke execute on function public.change_plan from anon, public;

/**
 * Hủy gói — hết kỳ mới ngừng, không hoàn tiền giữa kỳ (spec §6).
 */
create or replace function public.cancel_subscription(p_cancel boolean default true)
returns void
language plpgsql
security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if public.app_role() is distinct from 'owner' then raise exception 'forbidden'; end if;
  update public.subscriptions set cancel_at_period_end = p_cancel
    where tenant_id = v_tenant and status <> 'canceled';
end $$;

grant execute on function public.cancel_subscription to authenticated;
revoke execute on function public.cancel_subscription from anon, public;

/**
 * ============ RANH GIỚI THANH TOÁN ============
 * Đây là ĐIỂM DUY NHẤT tiền vào hệ thống. Khi chốt SePay hay PayOS, lớp
 * webhook chỉ cần: xác thực chữ ký của cổng → gọi hàm này với
 * (provider, provider_ref) của cổng. Không có logic nghiệp vụ nào ở lớp đó.
 *
 * IDEMPOTENT: unique(provider, provider_ref). Bắn lại 10 lần = 1 giao dịch,
 * 1 lần kích hoạt. Lần lặp trả {applied:false, duplicate:true}.
 *
 * QUYỀN: security definer nhưng REVOKE khỏi anon/authenticated → chỉ service
 * role (backend) gọi được. Khách không thể tự "ghi nhận đã thanh toán".
 */
create or replace function public.record_subscription_payment(
  p_invoice_number text,
  p_provider text,
  p_provider_ref text,
  p_amount bigint
) returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  inv public.subscription_invoices;
  v_pay uuid;
begin
  if p_provider is null or p_provider !~ '^[a-z_]{2,20}$' then
    raise exception 'invalid_provider';
  end if;
  if p_provider_ref is null or length(trim(p_provider_ref)) = 0 then
    raise exception 'invalid_provider_ref';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'invalid_amount'; end if;

  select * into inv from public.subscription_invoices
    where number = p_invoice_number for update;
  if inv.id is null then raise exception 'invoice_not_found'; end if;

  insert into public.subscription_payments
    (tenant_id, invoice_id, provider, provider_ref, amount)
  values (inv.tenant_id, inv.id, p_provider, p_provider_ref, p_amount)
  on conflict (provider, provider_ref) do nothing
  returning id into v_pay;

  if v_pay is null then
    -- Cổng bắn lại — không đổi trạng thái gì
    return jsonb_build_object('applied', false, 'duplicate', true, 'invoice', inv.number);
  end if;

  if p_amount < inv.amount_due then
    return jsonb_build_object('applied', false, 'underpaid', true,
                              'invoice', inv.number, 'amount_due', inv.amount_due);
  end if;

  if inv.status = 'paid' then
    return jsonb_build_object('applied', false, 'already_paid', true, 'invoice', inv.number);
  end if;

  update public.subscription_invoices set status = 'paid', paid_at = now() where id = inv.id;
  perform public.billing_apply_invoice(inv.id);
  perform public.billing_notify(
    inv.tenant_id, 'payment.succeeded', 'billing',
    'Đã nhận thanh toán',
    'Hoá đơn ' || inv.number || ' đã được thanh toán.',
    jsonb_build_object('invoice', inv.number, 'amount', p_amount, 'provider', p_provider));

  return jsonb_build_object('applied', true, 'invoice', inv.number,
                            'plan_code', inv.plan_code);
end $$;

revoke execute on function public.record_subscription_payment from anon, authenticated, public;

-- Hàm nội bộ: khoá khỏi client
revoke execute on function public.billing_apply_invoice from anon, authenticated, public;
revoke execute on function public.billing_log_once from anon, authenticated, public;
revoke execute on function public.billing_notify from anon, authenticated, public;
revoke execute on function public.billing_owner_user from anon, authenticated, public;
revoke execute on function public.plan_limit from anon, authenticated, public;
revoke execute on function public.live_subscription from anon, authenticated, public;
revoke execute on function public.plan_price from anon, authenticated, public;
revoke execute on function public.billing_round_thousand from anon, authenticated, public;
revoke execute on function public.next_invoice_number from anon, authenticated, public;

-- =============================================================
-- PHẦN B2 — MÀN "GÓI CỦA TÔI": dữ liệu 1 lượt gọi
-- =============================================================

/**
 * Tất cả những gì màn Gói của tôi cần: gói đang dùng, còn bao nhiêu ngày,
 * đã dùng bao nhiêu hạn mức. Đọc được với mọi thành viên (nhân viên xem
 * được tình trạng gói nhưng không đổi được — chặn ở change_plan).
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
  select count(*) into v_members from public.tenant_members where tenant_id = v_tenant;

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
                         'limit', public.plan_limit(v_tenant, 'max_members'))
    )
  );
end $$;

grant execute on function public.billing_overview to authenticated;
revoke execute on function public.billing_overview from anon, public;

-- Báo giá cho UI: tự lấy tenant từ JWT (không cho truyền tenant tuỳ ý)
create or replace function public.quote_plan_change(p_plan_code text, p_cycle text)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  return public.billing_quote(v_tenant, p_plan_code, p_cycle);
end $$;

grant execute on function public.quote_plan_change to authenticated;
revoke execute on function public.quote_plan_change from anon, public;
revoke execute on function public.billing_quote from anon, authenticated, public;

-- =============================================================
-- PHẦN F — CRON VÒNG ĐỜI (IDEMPOTENT)
-- =============================================================

/**
 * Quét thuê bao và chuyển trạng thái theo hạn.
 *   trialing, sắp hết (D-3 / D-1)  → nhắc 1 lần duy nhất
 *   trialing, hết hạn              → rơi về gói Miễn phí (dữ liệu giữ nguyên)
 *   active có phí, quá kỳ          → past_due + ân hạn 7 ngày
 *   past_due, hết ân hạn           → suspended
 *
 * IDEMPOTENT hai lớp:
 *   1) mỗi UPDATE có điều kiện trạng thái hiện tại → chạy lại không tìm thấy gì
 *   2) thông báo chỉ bắn khi billing_log_once() chèn được dòng mới
 *      (unique subscription_id + kind + cycle_key)
 * Trả về số lần chuyển trạng thái THẬT SỰ xảy ra.
 */
create or replace function public.run_subscription_lifecycle() returns int
language plpgsql
security definer set search_path = public as $$
declare
  r record;
  v_moved int := 0;
  v_key text;
begin
  -- (1) Nhắc trial sắp hết
  for r in
    select * from public.subscriptions
    where status = 'trialing' and trial_ends_at is not null and trial_ends_at > now()
      and trial_ends_at <= now() + interval '3 days'
  loop
    v_key := to_char(r.trial_ends_at, 'YYYYMMDDHH24MI');
    if r.trial_ends_at <= now() + interval '1 day' then
      if public.billing_log_once(r.tenant_id, r.id, 'trial_ending_1d', v_key) then
        perform public.billing_notify(r.tenant_id, 'subscription.trial_ending', 'billing',
          'Dùng thử còn 1 ngày',
          'Chọn gói để giữ nguyên tính năng đang dùng. Dữ liệu của bạn không mất đi.',
          jsonb_build_object('days_left', 1, 'trial_ends_at', r.trial_ends_at));
      end if;
    elsif public.billing_log_once(r.tenant_id, r.id, 'trial_ending_3d', v_key) then
      perform public.billing_notify(r.tenant_id, 'subscription.trial_ending', 'billing',
        'Dùng thử còn 3 ngày',
        'Chọn gói để giữ nguyên tính năng đang dùng. Dữ liệu của bạn không mất đi.',
        jsonb_build_object('days_left', 3, 'trial_ends_at', r.trial_ends_at));
    end if;
  end loop;

  -- (2) Hết dùng thử → rơi về Miễn phí, KHÔNG khoá dữ liệu
  for r in
    select * from public.subscriptions
    where status = 'trialing' and trial_ends_at is not null and trial_ends_at <= now()
  loop
    v_key := to_char(r.trial_ends_at, 'YYYYMMDDHH24MI');
    update public.subscriptions set
      plan_code = 'free', status = 'active', billing_cycle = 'month',
      trial_ends_at = null, current_period_start = now(),
      current_period_end = now() + interval '1 month'
    where id = r.id and status = 'trialing';
    if found then
      update public.tenants set plan = 'free' where id = r.tenant_id;
      v_moved := v_moved + 1;
      if public.billing_log_once(r.tenant_id, r.id, 'trial_ended', v_key) then
        perform public.billing_notify(r.tenant_id, 'subscription.trial_ended', 'billing',
          'Hết thời gian dùng thử',
          'Bạn đang ở gói Miễn phí. Toàn bộ dữ liệu vẫn còn nguyên — nâng gói bất cứ lúc nào.',
          jsonb_build_object('plan_code', 'free'));
      end if;
    end if;
  end loop;

  -- (3) Gói có phí quá kỳ → quá hạn + ân hạn 7 ngày
  for r in
    select * from public.subscriptions
    where status = 'active' and plan_code <> 'free' and current_period_end <= now()
  loop
    v_key := to_char(r.current_period_end, 'YYYYMMDDHH24MI');
    update public.subscriptions set status = 'past_due',
      grace_ends_at = r.current_period_end + interval '7 days'
    where id = r.id and status = 'active';
    if found then
      v_moved := v_moved + 1;
      if public.billing_log_once(r.tenant_id, r.id, 'past_due', v_key) then
        perform public.billing_notify(r.tenant_id, 'subscription.past_due', 'billing',
          'Gói đã quá hạn',
          'Bạn còn 7 ngày để gia hạn. Sau đó tài khoản chuyển sang chỉ xem, dữ liệu vẫn giữ nguyên.',
          jsonb_build_object('grace_ends_at', r.current_period_end + interval '7 days'));
      end if;
    end if;
  end loop;

  -- (4) Hết ân hạn → tạm ngưng (chỉ xem, KHÔNG mất dữ liệu)
  for r in
    select * from public.subscriptions
    where status = 'past_due' and grace_ends_at is not null and grace_ends_at <= now()
  loop
    v_key := to_char(r.grace_ends_at, 'YYYYMMDDHH24MI');
    update public.subscriptions set status = 'suspended'
      where id = r.id and status = 'past_due';
    if found then
      v_moved := v_moved + 1;
      if public.billing_log_once(r.tenant_id, r.id, 'suspended', v_key) then
        perform public.billing_notify(r.tenant_id, 'subscription.suspended', 'billing',
          'Tài khoản tạm ngưng',
          'Thanh toán để mở lại. Dữ liệu của bạn vẫn được giữ nguyên và xem được.',
          jsonb_build_object('suspended_at', r.grace_ends_at));
      end if;
    end if;
  end loop;

  return v_moved;
end $$;

revoke execute on function public.run_subscription_lifecycle from anon, authenticated, public;

-- Hằng ngày 02:00 giờ VN = 19:00 UTC (cùng khung giờ với các job đêm sẵn có)
select cron.schedule('subscription-lifecycle', '0 19 * * *',
                     'select public.run_subscription_lifecycle()');

-- =============================================================
-- PHẦN G — TENANT MỚI + BACKFILL
-- =============================================================

/**
 * Tenant mới nhận ngay 1 thuê bao dùng thử.
 * Trial = trải nghiệm đầy đủ → hạn mức của gói Chuyên nghiệp (pro).
 * Dùng TRIGGER thay vì sửa create_tenant: hàm đó đang bị nhiều migration
 * song song thay toàn thân, chèn thêm dòng vào đó sẽ bị migration khác đè.
 */
create or replace function public.tenant_bootstrap_subscription() returns trigger
language plpgsql
security definer set search_path = public as $$
declare v_trial timestamptz := coalesce(new.trial_ends_at, now() + interval '30 days');
begin
  insert into public.subscriptions
    (tenant_id, plan_code, status, billing_cycle, trial_ends_at,
     current_period_start, current_period_end)
  values (new.id, 'pro', 'trialing', 'month', v_trial, now(), v_trial)
  on conflict do nothing;
  return new;
end $$;

create trigger tenants_bootstrap_subscription after insert on public.tenants
  for each row execute function public.tenant_bootstrap_subscription();

-- Backfill tenant đã tồn tại
insert into public.subscriptions
  (tenant_id, plan_code, status, billing_cycle, trial_ends_at,
   current_period_start, current_period_end)
select t.id, 'pro', 'trialing', 'month',
       coalesce(t.trial_ends_at, now() + interval '30 days'),
       t.created_at,
       coalesce(t.trial_ends_at, now() + interval '30 days')
from public.tenants t
where not exists (
  select 1 from public.subscriptions s
  where s.tenant_id = t.id and s.status <> 'canceled');
