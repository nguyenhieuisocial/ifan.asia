-- ============================================================
-- iFan.asia — Migration #63: Nhật ký đăng nhập (chỉ đạo founder 11/08).
-- Lưu ai đăng nhập, lúc nào, từ đâu (IP + vị trí đọc từ header
-- x-vercel-ip-* của Vercel — MIỄN PHÍ, không gọi dịch vụ định vị trả phí
-- nào, đúng luật hạ tầng 0đ/tháng). Chỉ owner/admin xem — RLS SELECT.
-- ============================================================

create table public.login_events (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('email', 'staff_phone', 'confirm_link')),
  ip text,
  city text,
  region text,
  country text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index login_events_tenant_created_idx
  on public.login_events (tenant_id, created_at desc);

alter table public.login_events enable row level security;

-- Ghi: chính người vừa đăng nhập tự ghi dòng của mình (server action, phiên
-- vừa mở) — không ai ghi hộ người khác được.
create policy login_events_insert on public.login_events for insert
  with check (user_id = auth.uid());

-- Đọc: chỉ owner/admin của ĐÚNG tenant đó (đúng RLS #41 dùng cho billing/seats).
create policy login_events_select on public.login_events for select
  using (
    tenant_id is not null
    and exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = login_events.tenant_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner', 'admin')
    )
  );

grant select, insert on public.login_events to authenticated;
revoke all on public.login_events from anon;
