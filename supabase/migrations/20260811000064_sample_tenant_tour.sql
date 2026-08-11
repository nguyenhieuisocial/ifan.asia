-- ============================================================
-- iFan.asia — Migration #64: Tham quan tiệm mẫu (Quy hoạch mục 15b, V1a
-- việc 9 phần 2). Người chưa khai tiệm được xem một tiệm ĐANG CHẠY đúng
-- ngành mình trước khi quyết định — vai viewer sẵn có (bất biến 1: RLS
-- lo phần cấm ghi, không cần cơ chế mới).
--
-- PHẠM VI V1a (phương án RẺ + AN TOÀN theo đúng mục 15b): chỉ người CHƯA
-- có tenant nào được vào tour — tránh mở đường đa-tenant-per-user (nhiều
-- chỗ trong code đang giả định `tenant_members` của một user chỉ có 1
-- dòng, ví dụ signIn() dùng .limit(1).maybeSingle()). Chủ tiệm thật muốn
-- xem tiệm mẫu ngành khác trong lúc đang có tiệm là việc của V1b.
-- ============================================================

alter table public.tenants add column if not exists is_sample boolean not null default false;

-- Mỗi ngành tối đa MỘT tiệm mẫu — nhiều tenant industry=null không tính (partial index).
create unique index if not exists tenants_one_sample_per_industry
  on public.tenants (industry) where is_sample = true;

-- Đánh dấu tiệm demo có sẵn (script seed-demo.mjs, 16 khách/9 cơ hội/17 việc
-- thật) làm tiệm mẫu chính thức cho ngành spa — dùng lại, không tạo trùng.
update public.tenants set is_sample = true where slug = 'demo-spa-huong-sen';

-- ---------- Vào tiệm mẫu ----------
create or replace function public.enter_sample_tenant(p_industry text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_real_tenants int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Chỉ chặn khi đã có TENANT THẬT (không tính các tour tiệm mẫu trước đó
  -- — cho phép đổi qua lại giữa các ngành mẫu thoải mái).
  select count(*) into v_real_tenants
    from public.tenant_members tm
    join public.tenants t on t.id = tm.tenant_id
    where tm.user_id = v_uid and t.is_sample = false;
  if v_real_tenants > 0 then raise exception 'already_has_tenant'; end if;

  select id into v_tenant from public.tenants where industry = p_industry and is_sample = true;
  if v_tenant is null then raise exception 'no_sample_tenant'; end if;

  -- Đổi tour: rời tiệm mẫu cũ (nếu có) trước khi vào tiệm mẫu mới — luôn
  -- đúng 1 tour đang mở, không lẫn dữ liệu 2 tiệm mẫu trong lúc điều
  -- hướng (signIn()/layout.tsx đọc tenant_members bằng .limit(1)).
  delete from public.tenant_members tm
    using public.tenants t
    where tm.tenant_id = t.id and tm.user_id = v_uid and t.is_sample = true;

  insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
    values (v_tenant, v_uid, 'viewer', 'active', now());

  return v_tenant;
end;
$$;
grant execute on function public.enter_sample_tenant(text) to authenticated;
revoke execute on function public.enter_sample_tenant(text) from anon, public;

-- ---------- Thoát tiệm mẫu ----------
create or replace function public.exit_sample_tenant()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from public.tenant_members tm
    using public.tenants t
    where tm.tenant_id = t.id and tm.user_id = v_uid
      and tm.role = 'viewer' and t.is_sample = true;
end;
$$;
grant execute on function public.exit_sample_tenant() to authenticated;
revoke execute on function public.exit_sample_tenant() from anon, public;

-- ---------- Job đêm: làm tươi hạn việc trong tiệm mẫu cho sống động ----------
-- Idempotent: lệch giờ suy từ hash CỐ ĐỊNH của từng dòng (0-71h) — chạy lại
-- nhiều lần trong đêm không đẩy hạn trôi xa dần; chỉ đụng việc ĐÃ quá hạn.
create or replace function public.refresh_sample_tenant_dates()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.activities a
  set due_at = now() + make_interval(hours =>
        ('x' || substr(md5(a.id::text), 1, 6))::bit(24)::int % 72)
  from public.tenants t
  where a.tenant_id = t.id and t.is_sample = true
    and a.done_at is null and a.due_at is not null and a.due_at < now();
end;
$$;
revoke all on function public.refresh_sample_tenant_dates() from public, anon, authenticated;

select cron.schedule('sample-tenant-refresh-nightly', '11 3 * * *',
  $$select public.refresh_sample_tenant_dates()$$);
