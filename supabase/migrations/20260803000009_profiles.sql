-- ============================================================
-- iFan.asia — Migration #9: Profiles (tên hiển thị thành viên)
-- auth.users không đọc được từ client → bảng public.profiles 1-1,
-- trigger tự tạo khi user mới, RLS: chỉ đồng nghiệp cùng tenant thấy nhau.
-- ============================================================

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- RLS ----------
-- profiles KHÔNG có tenant_id → không dùng current_tenant_id() được.
-- Helper security definer (bẻ vòng RLS tenant_members): hai user "cùng tenant"
-- khi cả hai là thành viên active của ít nhất một tenant chung.

create or replace function public.shares_tenant_with(p_user uuid) returns boolean
language sql stable
security definer set search_path = public as $$
  select p_user = auth.uid() or exists (
    select 1
    from public.tenant_members a
    join public.tenant_members b on b.tenant_id = a.tenant_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = p_user and b.status = 'active'
  )
$$;

grant execute on function public.shares_tenant_with to authenticated;
revoke execute on function public.shares_tenant_with from anon, public;

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles for select
  using (public.shares_tenant_with(user_id));
create policy profiles_insert on public.profiles for insert
  with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- ---------- Trigger: user mới → profile mặc định từ phần trước @ của email ----------

create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(left(split_part(new.email, '@', 1), 80), ''), 'user')
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Backfill user hiện có ----------

insert into public.profiles (user_id, display_name)
select u.id, coalesce(nullif(left(split_part(u.email, '@', 1), 80), ''), 'user')
from auth.users u
on conflict (user_id) do nothing;
