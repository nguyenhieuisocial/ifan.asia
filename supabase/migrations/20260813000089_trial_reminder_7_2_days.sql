-- ============================================================
-- iFan.asia — Migration #89: mốc nhắc dùng thử đúng "ngày 23 · 28" (ADR-0011 mục 5b)
--
-- run_subscription_lifecycle() (migration #27) đã có sẵn cơ chế nhắc trước
-- khi hết hạn, nhưng mốc là "còn 3 ngày / còn 1 ngày" — lệch với ADR-0011
-- mục 5b chốt "ngày 23 · 28 · 30" của gói dùng thử 30 ngày, tức còn 7 ngày /
-- còn 2 ngày (ngày 30 = ngày hết hạn thật, đã có thông báo riêng "trial_ended"
-- ở khối (2) bên dưới khi hạ gói — không cần thêm mốc "còn 0 ngày").
--
-- CHÉP LẠI TOÀN THÂN vì Postgres không "vá" được 1 khối trong hàm — 3 khối
-- còn lại (hết hạn → hạ gói, quá kỳ → past_due, hết ân hạn → suspended)
-- GIỮ NGUYÊN Y HỆT bản #27, chỉ đổi khối (1).
-- ============================================================

create or replace function public.run_subscription_lifecycle() returns int
language plpgsql
security definer set search_path = public as $$
declare
  r record;
  v_moved int := 0;
  v_key text;
begin
  -- (1) Nhắc trial sắp hết — đúng mốc ADR-0011 mục 5b: còn 7 ngày (ngày 23),
  -- còn 2 ngày (ngày 28). Ngày 30 (hết hạn thật) đã có thông báo riêng ở (2).
  for r in
    select * from public.subscriptions
    where status = 'trialing' and trial_ends_at is not null and trial_ends_at > now()
      and trial_ends_at <= now() + interval '7 days'
  loop
    v_key := to_char(r.trial_ends_at, 'YYYYMMDDHH24MI');
    if r.trial_ends_at <= now() + interval '2 days' then
      if public.billing_log_once(r.tenant_id, r.id, 'trial_ending_2d', v_key) then
        perform public.billing_notify(r.tenant_id, 'subscription.trial_ending', 'billing',
          'Dùng thử còn 2 ngày',
          'Chọn gói để giữ nguyên tính năng đang dùng. Dữ liệu của bạn không mất đi.',
          jsonb_build_object('days_left', 2, 'trial_ends_at', r.trial_ends_at));
      end if;
    elsif public.billing_log_once(r.tenant_id, r.id, 'trial_ending_7d', v_key) then
      perform public.billing_notify(r.tenant_id, 'subscription.trial_ending', 'billing',
        'Dùng thử còn 7 ngày',
        'Chọn gói để giữ nguyên tính năng đang dùng. Dữ liệu của bạn không mất đi.',
        jsonb_build_object('days_left', 7, 'trial_ends_at', r.trial_ends_at));
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
