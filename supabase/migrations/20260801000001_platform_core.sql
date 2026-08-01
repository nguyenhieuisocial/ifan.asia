-- ============================================================
-- iFan.asia — Migration #1: Platform core (GĐ0)
-- tenants + tenant_members + domain_events (outbox) + RLS + JWT hook
-- Nguyên tắc khóa cứng: RLS trên MỌI bảng, tenant_id mọi bảng nghiệp vụ,
-- claim lấy từ app_metadata (KHÔNG BAO GIỜ user_metadata).
-- ============================================================

create extension if not exists "unaccent";
create extension if not exists "pg_trgm";
create extension if not exists "pgcrypto";
create extension if not exists "pgmq";
create extension if not exists "pg_cron";
create extension if not exists "pg_net";

-- ---------- Bảng lõi ----------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  plan text not null default 'trial',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.tenant_role as enum ('owner','admin','manager','staff','viewer');

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tenant_role not null default 'staff',
  manager_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members (user_id);

-- Outbox sự kiện liên module — mọi module PHÁT event vào đây cùng transaction nghiệp vụ
create table public.domain_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,          -- theo docs/EVENT_CATALOG.md, vd 'tenant.created'
  aggregate_type text not null,      -- 'tenant' | 'contact' | 'deal' | ...
  aggregate_id text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index domain_events_tenant_time_idx on public.domain_events (tenant_id, created_at);
create index domain_events_unprocessed_idx on public.domain_events (event_type) where processed_at is null;

-- ---------- Hàm helper JWT ----------

create or replace function public.current_tenant_id() returns uuid
language sql stable as $$
  select nullif(((auth.jwt() -> 'app_metadata') ->> 'tenant_id'), '')::uuid
$$;

create or replace function public.app_role() returns text
language sql stable as $$
  select (auth.jwt() -> 'app_metadata') ->> 'role'
$$;

-- ---------- RLS ----------

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.domain_events enable row level security;

create policy tenants_select on public.tenants for select
  using (id = public.current_tenant_id());
create policy tenants_update on public.tenants for update
  using (id = public.current_tenant_id() and public.app_role() in ('owner','admin'))
  with check (id = public.current_tenant_id());
-- insert/delete tenants: chỉ qua RPC security definer / service role

create policy members_select on public.tenant_members for select
  using (tenant_id = public.current_tenant_id());
create policy members_manage on public.tenant_members for all
  using (tenant_id = public.current_tenant_id() and public.app_role() in ('owner','admin'))
  with check (tenant_id = public.current_tenant_id() and public.app_role() in ('owner','admin'));

create policy events_select on public.domain_events for select
  using (tenant_id = public.current_tenant_id());
-- ghi event: qua hàm emit_event (definer) hoặc service role, không cho client ghi thẳng

-- ---------- updated_at ----------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger tenants_touch before update on public.tenants
  for each row execute function public.touch_updated_at();

-- ---------- JWT hook: nhét tenant_id + role vào app_metadata khi phát token ----------
-- (Bật trong Dashboard: Auth > Hooks > Custom Access Token -> chọn hàm này)

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
    where user_id = (event ->> 'user_id')::uuid
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

-- ---------- RPC: đăng ký tenant tự phục vụ ----------

create or replace function public.create_tenant(p_name text, p_slug text) returns uuid
language plpgsql
security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.tenants (name, slug) values (p_name, lower(p_slug))
    returning id into v_tenant;
  insert into public.tenant_members (tenant_id, user_id, role)
    values (v_tenant, auth.uid(), 'owner');
  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid());
  return v_tenant;
end $$;

grant execute on function public.create_tenant to authenticated;
revoke execute on function public.create_tenant from anon, public;

-- ---------- Hàm phát event dùng chung cho mọi module ----------

create or replace function public.emit_event(
  p_event_type text, p_aggregate_type text, p_aggregate_id text, p_payload jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer set search_path = public as $$
declare v_id bigint;
begin
  if public.current_tenant_id() is null then
    raise exception 'no_tenant_context';
  end if;
  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (public.current_tenant_id(), p_event_type, p_aggregate_type, p_aggregate_id, p_payload, auth.uid())
    returning id into v_id;
  return v_id;
end $$;

grant execute on function public.emit_event to authenticated;
revoke execute on function public.emit_event from anon, public;
