-- =============================================================
-- 20260803000007_usage_quota_hardening
-- Vá lỗ hổng: increment_usage là SECURITY DEFINER + grant cho authenticated
-- nhưng KHÔNG kiểm tra p_amount → user đăng nhập có thể gọi
-- rpc('increment_usage', {p_amount: -999999}) từ devtools để reset quota
-- hoặc thổi phồng counter. Thêm 2 guard đầu hàm:
--   1) p_amount phải trong khoảng [1, 100]  → 'invalid_amount'
--   2) p_metric phải khớp ^[a-z_]{1,50}$    → 'invalid_metric' (chặn spam metric rác)
-- Phần còn lại giữ NGUYÊN hành vi gốc (20260801000002): upsert usage_counters,
-- quota_exceeded rollback, search_path, grants.
-- =============================================================

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

-- Grants giữ nguyên như gốc (create or replace bảo toàn ACL, nhưng khẳng định lại cho rõ)
grant execute on function public.increment_usage to authenticated;
revoke execute on function public.increment_usage from anon, public;
