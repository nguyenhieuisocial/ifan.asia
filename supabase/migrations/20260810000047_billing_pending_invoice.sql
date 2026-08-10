-- =============================================================
-- iFan.asia — Migration #47: Màn "Gói của tôi" hiện HÓA ĐƠN CHỜ + hướng dẫn chuyển khoản
--
-- Bệnh: #27 đã tạo phiếu thanh toán (`subscription_invoices`, status='open')
--   khi đổi gói có phải trả tiền, nhưng màn "Gói của tôi" KHÔNG hiện phiếu nào
--   đang chờ và cũng không nói chuyển khoản đi đâu. Chủ tiệm bấm "Xác nhận đổi
--   gói" xong chỉ thấy một toast trôi qua — muốn trả tiền cũng không biết trả
--   vào tài khoản nào, ghi nội dung gì.
--
-- Sửa:
--   1) Bảng `platform_settings` (key/value) giữ cấu hình MỨC NỀN TẢNG — trước
--      mắt là thông tin chuyển khoản của iFan. RLS BẬT, KHÔNG CÓ POLICY NÀO
--      (đúng mẫu `platform_admins` #28 / `tenant_creation_limits` #41):
--      client không đọc/ghi thẳng, chỉ đọc qua RPC security definer.
--      Seed 'bank_transfer' để RỖNG — founder tự điền số tài khoản THẬT qua
--      SQL editor; tuyệt đối không seed số bịa để rồi ai đó chuyển tiền vào.
--   2) `billing_overview()` trả thêm:
--      · `open_invoices`: mảng phiếu status='open' của tiệm (number,
--        amount_due, created_at) — chủ tiệm thấy mình đang nợ phiếu nào;
--      · `bank_transfer`: object đọc từ `platform_settings` — hàm đã là
--        security definer (#27) nên đọc xuyên qua RLS của bảng cấu hình được,
--        và đã có chốt vai `can_read_billing` (#41) nên thông tin chỉ tới
--        owner/admin, không tới nhân viên.
--
-- Founder điền thông tin chuyển khoản (service role / SQL editor):
--   update public.platform_settings
--      set value = jsonb_build_object(
--            'account_name',   'CONG TY ...',
--            'account_number', '...',
--            'bank',           'Vietcombank')
--    where key = 'bank_transfer';
--
-- ⚠️ CẢNH BÁO REGRESSION (quy tắc #46): khi re-create `billing_overview` phải
--   chép từ BẢN MỚI NHẤT — tính đến #47 là file NÀY (trước đó #41). Thân hàm
--   dưới đây chép nguyên bản #41 (đã đối chiếu pg_get_functiondef từ DB thật),
--   chỉ THÊM khối open_invoices + bank_transfer, và ghim lại
--   `search_path = public, pg_temp` (chốt #40).
--
-- KHÔNG có trong migration này (cố ý):
--   · không làm màn quản trị platform_settings — founder ghi SQL editor,
--     giống `platform_admins` #28;
--   · không đụng luồng tạo/thanh toán phiếu (#27) — chỉ HIỆN phiếu đang chờ.
-- =============================================================

-- ---------- 1) Bảng cấu hình mức nền tảng ----------
create table if not exists public.platform_settings (
  key   text primary key,
  value jsonb not null default '{}'::jsonb
);
comment on table public.platform_settings is
  'Cấu hình mức nền tảng (không thuộc tenant nào). RLS bật, KHÔNG policy — client chỉ đọc qua RPC definer; chỉ service role ghi được.';
alter table public.platform_settings enable row level security;

-- Seed RỖNG — founder tự điền số tài khoản thật, không bịa số ở đây.
insert into public.platform_settings (key, value)
values ('bank_transfer',
        jsonb_build_object('account_name', '', 'account_number', '', 'bank', ''))
on conflict (key) do nothing;

-- ---------- 2) billing_overview(): thân #41 + open_invoices + bank_transfer ----------
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
  v_invoices jsonb;
  v_bank jsonb;
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

  -- #47: phiếu đang chờ thanh toán của tiệm — mới nhất lên đầu
  select coalesce(jsonb_agg(jsonb_build_object(
             'number', i.number,
             'amount_due', i.amount_due,
             'created_at', i.created_at)
           order by i.created_at desc), '[]'::jsonb)
    into v_invoices
    from public.subscription_invoices i
   where i.tenant_id = v_tenant and i.status = 'open';

  -- #47: thông tin chuyển khoản của iFan — bảng không có policy đọc,
  -- đi qua đây (definer + chốt vai ở trên) là cửa duy nhất tới client
  select ps.value into v_bank
    from public.platform_settings ps where ps.key = 'bank_transfer';

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
    ),
    -- #47: hai khóa mới — phiếu chờ + thông tin chuyển khoản
    'open_invoices', v_invoices,
    'bank_transfer', coalesce(v_bank, '{}'::jsonb)
  );
end $function$;
grant execute on function public.billing_overview to authenticated;
revoke execute on function public.billing_overview from anon, public;
