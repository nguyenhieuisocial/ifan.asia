-- ============================================================
-- iFan.asia — Migration #2: Vá nền tảng theo Bản thiết kế kỹ thuật chi tiết (01/08/2026)
-- Không sửa migration #1 — mọi thay đổi đi qua migration mới.
-- ============================================================

create extension if not exists "citext";
create extension if not exists "btree_gist";

-- Wrapper IMMUTABLE cho unaccent — nền cho generated search column từ GĐ1
create or replace function public.immutable_unaccent(p text) returns text
language sql immutable parallel safe strict as
$$ select public.unaccent('public.unaccent'::regdictionary, p) $$;

-- ---------- tenants: cột bổ sung + siết slug ----------

alter table public.tenants
  add column industry text,
  add column status text not null default 'active' check (status in ('active','suspended','deleted')),
  add column logo_url text,
  add column tax_code text,
  add column trial_ends_at timestamptz,
  add column onboarding jsonb not null default '{}'::jsonb,
  add column deleted_at timestamptz;

alter table public.tenants drop constraint tenants_slug_check;
alter table public.tenants add constraint tenants_slug_check
  check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'); -- 3–30 ký tự

create table public.reserved_slugs (slug text primary key);
insert into public.reserved_slugs (slug) values
  ('www'),('app'),('api'),('admin'),('mail'),('blog'),('docs'),('status'),
  ('billing'),('dashboard'),('help'),('support'),('cdn'),('assets'),('static'),
  ('auth'),('login'),('signup'),('vercel'),('supabase'),('ifan'),('root'),('demo');
alter table public.reserved_slugs enable row level security;
create policy reserved_slugs_read on public.reserved_slugs
  for select to authenticated, anon using (true);

create or replace function public.block_reserved_slug() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.reserved_slugs where slug = new.slug) then
    raise exception 'slug_reserved';
  end if;
  return new;
end $$;
create trigger tenants_block_reserved_slug
  before insert or update of slug on public.tenants
  for each row execute function public.block_reserved_slug();

-- ---------- tenant_members: trạng thái + bảo vệ owner cuối ----------

alter table public.tenant_members
  add column status text not null default 'active' check (status in ('active','removed')),
  add column invited_by uuid references auth.users(id),
  add column joined_at timestamptz;

create index tenant_members_manager_idx on public.tenant_members (manager_id);

create or replace function public.ensure_last_owner() returns trigger
language plpgsql as $$
begin
  -- Cho phép khi cả tenant đang bị xóa (cascade): tenant đã biến mất trong cùng lệnh
  if not exists (select 1 from public.tenants where id = old.tenant_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if (tg_op = 'DELETE' and old.role = 'owner' and old.status = 'active')
     or (tg_op = 'UPDATE' and old.role = 'owner' and old.status = 'active'
         and (new.role <> 'owner' or new.status <> 'active')) then
    if not exists (
      select 1 from public.tenant_members
      where tenant_id = old.tenant_id and role = 'owner' and status = 'active'
        and user_id <> old.user_id
    ) then
      raise exception 'last_owner_cannot_be_removed';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger tenant_members_owner_guard
  before update or delete on public.tenant_members
  for each row execute function public.ensure_last_owner();

-- ---------- domain_events: nguồn + chống trùng ----------

alter table public.domain_events
  add column source_module text,
  add column dedupe_key text,
  add column causation_chain int not null default 0,
  add column is_sandbox boolean not null default false;

create unique index domain_events_dedupe_idx
  on public.domain_events (tenant_id, dedupe_key) where dedupe_key is not null;

-- ---------- JWT hook: chỉ lấy membership đang active ----------

create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable
security definer set search_path = public as $$
declare
  claims jsonb;
  m record;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  select tenant_id, role into m
    from public.tenant_members
    where user_id = (event ->> 'user_id')::uuid and status = 'active'
    order by created_at asc
    limit 1;
  if found then
    claims := jsonb_set(
      claims, '{app_metadata}',
      coalesce(claims -> 'app_metadata', '{}'::jsonb)
        || jsonb_build_object('tenant_id', m.tenant_id, 'role', m.role),
      true
    );
  end if;
  return jsonb_set(event, '{claims}', claims, true);
end $$;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- ---------- emit_event: thêm source_module + dedupe (đổi chữ ký → drop overload cũ) ----------

drop function public.emit_event(text, text, text, jsonb);
create or replace function public.emit_event(
  p_event_type text, p_aggregate_type text, p_aggregate_id text,
  p_payload jsonb default '{}'::jsonb,
  p_source_module text default null, p_dedupe_key text default null
) returns bigint
language plpgsql
security definer set search_path = public as $$
declare v_id bigint;
begin
  if public.current_tenant_id() is null then
    raise exception 'no_tenant_context';
  end if;
  insert into public.domain_events
    (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module, dedupe_key)
  values
    (public.current_tenant_id(), p_event_type, p_aggregate_type, p_aggregate_id,
     p_payload, auth.uid(), p_source_module, p_dedupe_key)
  on conflict (tenant_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.emit_event to authenticated;
revoke execute on function public.emit_event from anon, public;

-- ---------- create_tenant: trial 30 ngày (slug reserved đã chặn bằng trigger) ----------

create or replace function public.create_tenant(p_name text, p_slug text) returns uuid
language plpgsql
security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.tenants (name, slug, trial_ends_at)
    values (p_name, lower(p_slug), now() + interval '30 days')
    returning id into v_tenant;
  insert into public.tenant_members (tenant_id, user_id, role, joined_at)
    values (v_tenant, auth.uid(), 'owner', now());
  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid(), 'platform');
  return v_tenant;
end $$;

-- ---------- Recreate 5 policy với (select ...) để cache initplan — CHUẨN MẪU cho mọi bảng sau ----------

drop policy tenants_select on public.tenants;
drop policy tenants_update on public.tenants;
drop policy members_select on public.tenant_members;
drop policy members_manage on public.tenant_members;
drop policy events_select on public.domain_events;

create policy tenants_select on public.tenants for select
  using (id = (select public.current_tenant_id()));
create policy tenants_update on public.tenants for update
  using (id = (select public.current_tenant_id()) and (select public.app_role()) in ('owner','admin'))
  with check (id = (select public.current_tenant_id()));

create policy members_select on public.tenant_members for select
  using (tenant_id = (select public.current_tenant_id()));
create policy members_manage on public.tenant_members for all
  using (tenant_id = (select public.current_tenant_id()) and (select public.app_role()) in ('owner','admin'))
  with check (tenant_id = (select public.current_tenant_id()) and (select public.app_role()) in ('owner','admin'));

create policy events_select on public.domain_events for select
  using (tenant_id = (select public.current_tenant_id()));

-- ---------- invitations ----------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email citext not null,
  role public.tenant_role not null default 'staff',
  token_hash text not null unique,
  invited_by uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
create index invitations_tenant_idx on public.invitations (tenant_id);
alter table public.invitations enable row level security;
create policy invitations_manage on public.invitations for all
  using (tenant_id = (select public.current_tenant_id()) and (select public.app_role()) in ('owner','admin'))
  with check (tenant_id = (select public.current_tenant_id()) and (select public.app_role()) in ('owner','admin'));

-- ---------- notifications ----------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (tenant_id, user_id, created_at desc);
create index notifications_unread_idx on public.notifications (tenant_id, user_id) where read_at is null;
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select
  using (tenant_id = (select public.current_tenant_id()) and user_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update
  using (tenant_id = (select public.current_tenant_id()) and user_id = (select auth.uid()))
  with check (tenant_id = (select public.current_tenant_id()) and user_id = (select auth.uid()));
-- ghi notification: chỉ service role / definer

-- ---------- audit_logs (append-only, chỉ owner/admin đọc) ----------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_idx on public.audit_logs (tenant_id, created_at desc);
alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select
  using (tenant_id = (select public.current_tenant_id()) and (select public.app_role()) in ('owner','admin'));
-- ghi: chỉ service role / definer; không policy insert/update/delete cho client

-- ---------- usage_counters + RPC quota ----------

create table public.usage_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric text not null,
  period text not null, -- 'YYYY-MM' theo giờ VN
  used bigint not null default 0,
  limit_value bigint,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, metric, period)
);
alter table public.usage_counters enable row level security;
create policy usage_counters_select on public.usage_counters for select
  using (tenant_id = (select public.current_tenant_id()));

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
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  insert into public.usage_counters as uc (tenant_id, metric, period, used)
    values (v_tenant, p_metric, v_period, p_amount)
  on conflict (tenant_id, metric, period) do update
    set used = uc.used + excluded.used, updated_at = now()
  returning used, limit_value into v_used, v_limit;
  if v_limit is not null and v_used > v_limit then
    raise exception 'quota_exceeded'; -- rollback cả transaction, increment tự hoàn tác
  end if;
  return v_used;
end $$;
grant execute on function public.increment_usage to authenticated;
revoke execute on function public.increment_usage from anon, public;

-- ---------- Storage: bucket private theo tenant ----------

insert into storage.buckets (id, name, public)
  values ('tenant-files', 'tenant-files', false)
  on conflict (id) do nothing;

create policy tenant_files_select on storage.objects for select to authenticated
  using (bucket_id = 'tenant-files'
         and (storage.foldername(name))[1] = (select public.current_tenant_id())::text);
create policy tenant_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tenant-files'
         and (storage.foldername(name))[1] = (select public.current_tenant_id())::text);
create policy tenant_files_update on storage.objects for update to authenticated
  using (bucket_id = 'tenant-files'
         and (storage.foldername(name))[1] = (select public.current_tenant_id())::text);
create policy tenant_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tenant-files'
         and (storage.foldername(name))[1] = (select public.current_tenant_id())::text);
