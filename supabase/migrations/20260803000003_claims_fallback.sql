-- ============================================================
-- iFan.asia — Migration #3: Claims fallback
-- Hệ thống chạy đầy đủ KHI CHƯA bật Custom Access Token Hook:
-- helper ưu tiên claim trong JWT (nhanh), thiếu thì tra cứu membership.
-- security definer để bẻ vòng lặp RLS (hàm được policy của chính
-- tenant_members gọi). Khi hook được bật, nhánh claim tự thắng — không đổi code.
-- ============================================================

create or replace function public.current_tenant_id() returns uuid
language sql stable
security definer set search_path = public as $$
  select coalesce(
    nullif(((auth.jwt() -> 'app_metadata') ->> 'tenant_id'), '')::uuid,
    (select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.status = 'active'
      order by tm.created_at asc limit 1)
  )
$$;

create or replace function public.app_role() returns text
language sql stable
security definer set search_path = public as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata') ->> 'role',
    (select tm.role::text from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.status = 'active'
      order by tm.created_at asc limit 1)
  )
$$;
