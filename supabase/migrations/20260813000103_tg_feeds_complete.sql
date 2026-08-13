-- Migration #103 — phủ nốt: mọi sự kiện ĐÁNG BIẾT đều tự về đúng chủ đề.
--
-- Founder: *"tôi cần tự động full và đầy đủ mọi thứ"*.
--
-- NÓI THẲNG NGUYÊN TẮC TRƯỚC: kẻ giết một hệ thống cảnh báo là TIẾNG ỒN. Báo
-- mọi thứ ngay lập tức thì founder ngừng đọc sau hai ngày, và tin quan trọng
-- chìm cùng đống tin vặt. Nên chia HAI MỨC:
--
--   MỨC 1 — báo ngay: chuyện đáng dừng việc đang làm để xử.
--   MỨC 2 — gom vào bản tin ngày/tuần: chuyện cần biết nhưng không cần biết
--            trong 30 giây tới.
--
-- Đầy đủ nghĩa là KHÔNG SỰ KIỆN NÀO RƠI RA NGOÀI hai mức đó, chứ không phải
-- mọi sự kiện đều bắn một tin.

alter table public.platform_outbox drop constraint if exists platform_outbox_kind_check;
alter table public.platform_outbox add constraint platform_outbox_kind_check
  check (kind in ('help_request','system_alert','tenant_signup','user_failure',
                  'release','feature_change','daily_pulse',
                  'billing','churn','channel_down','weekly_pulse'));

update public.tg_topics set feeds = '{help_request,tenant_signup,billing,churn}', updated_at = now()
 where chat_id = '-1004299451961' and thread_id = 25;   -- Khách hàng
update public.tg_topics set feeds = '{system_alert,channel_down}', updated_at = now()
 where chat_id = '-1004299451961' and thread_id = 27;   -- Kỹ thuật
update public.tg_topics set feeds = '{release,daily_pulse,weekly_pulse}', updated_at = now()
 where chat_id = '-1004299451961' and thread_id = 8;    -- Thông báo

-- ── 1. TIỀN — cửa chốt duy nhất, nối một chỗ là bắt hết ─────────────────────
--
-- `billing_notify` là nơi MỌI sự kiện gói cước đi qua (sắp hết dùng thử, hết
-- dùng thử, quá hạn, tạm ngưng, đổi gói, thanh toán thành công). Trước đó nó
-- chỉ báo cho CHỦ TIỆM; founder — người bán hàng — không biết gì.
--
-- "Tiệm X sắp hết dùng thử" chính là thời điểm bán được hàng. Bỏ lỡ nó là bỏ
-- lỡ doanh thu, không phải bỏ lỡ một thông báo.
--
-- XEM LẠI KHI CÓ ~50 TIỆM: lúc đó mỗi ngày vài chục mốc vòng đời, phải chuyển
-- các mốc nhẹ (sắp hết dùng thử) xuống bản tin ngày và chỉ giữ mốc nặng (quá
-- hạn, tạm ngưng, thanh toán) ở mức báo ngay. Nay vài tiệm thì báo hết là đúng.
create or replace function public.billing_notify(
  p_tenant uuid, p_event text, p_type text, p_title text, p_body text, p_payload jsonb
)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_user uuid := public.billing_owner_user(p_tenant);
  v_key text;
  v_days text;
  v_tenant_name text;
begin
  insert into public.domain_events
    (tenant_id, event_type, aggregate_type, aggregate_id, payload,
     actor_user_id, source_module, causation_chain)
  values (p_tenant, p_event, 'subscription', p_tenant::text, p_payload,
          null, 'billing', 0);
  if v_user is not null then
    v_key := case p_event
      when 'subscription.plan_changed' then 'billing.planChanged'
      when 'payment.succeeded'         then 'billing.paymentSucceeded'
      when 'subscription.trial_ending' then 'billing.trialEnding'
      when 'subscription.trial_ended'  then 'billing.trialEnded'
      when 'subscription.past_due'     then 'billing.pastDue'
      when 'subscription.suspended'    then 'billing.suspended'
      else null                        -- mốc vòng đời mới → dùng chuỗi đã lưu
    end;
    v_days := coalesce(p_payload ->> 'days_left', '');
    insert into public.notifications
      (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
    values (p_tenant, v_user, p_type, left(p_title, 200), p_body, '/app/settings/billing',
            case when v_key is null then null else v_key || '.title' end,
            case when v_key is null then null else v_key || '.body' end,
            case when v_key is null then '{}'::jsonb else jsonb_build_object(
              'plan',    coalesce(p_payload ->> 'plan_code', ''),
              'invoice', coalesce(p_payload ->> 'invoice', ''),
              'days',    case when v_days ~ '^[0-9]+$' then v_days::int else 0 end)
            end);
  end if;

  -- MỚI: báo founder. Bọc riêng và nuốt lỗi — chuông báo hỏng KHÔNG được làm
  -- hỏng việc tính tiền.
  begin
    select name into v_tenant_name from public.tenants
     where id = p_tenant and coalesce(is_sample, false) = false;
    if v_tenant_name is not null then
      perform public.platform_notify(
        'billing',
        'bill:' || p_event || ':' || p_tenant || ':' || to_char(now(), 'YYYY-MM-DD'),
        '💳 ' || v_tenant_name || ' — ' || left(coalesce(p_title, p_event), 120) ||
        case when coalesce(p_body, '') <> '' then E'\n' || left(p_body, 200) else '' end
      );
    end if;
  exception when others then
    raise warning 'billing_notify: bỏ qua lỗi chuông báo: %', sqlerrm;
  end;
end $function$;

-- ── 2. TIỆM NGỪNG DÙNG ──────────────────────────────────────────────────────
--
-- Đối xứng với "tiệm mới đăng ký". Có người bỏ đi mà không ai biết thì không
-- bao giờ hỏi được vì sao họ bỏ — và đó là câu hỏi đáng tiền nhất của một sản
-- phẩm đang bán.
create or replace function public.tenants_notify_churn()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  if coalesce(new.is_sample, false) then return new; end if;
  if old.deleted_at is not null or new.deleted_at is null then return new; end if;

  begin
    perform public.platform_notify(
      'churn', 'churn:' || new.id,
      '👋 Tiệm ngừng dùng: ' || coalesce(new.name, '(chưa đặt tên)') ||
      E'\nMở từ ' || to_char(new.created_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') ||
      ' — dùng được ' || greatest(0, (now()::date - new.created_at::date)) || ' ngày.'
    );
  exception when others then
    raise warning 'tenants_notify_churn bỏ qua lỗi: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists tenants_notify_churn on public.tenants;
create trigger tenants_notify_churn
  after update of deleted_at on public.tenants
  for each row execute function public.tenants_notify_churn();

-- ── 3. KÊNH KẾT NỐI HỎNG ────────────────────────────────────────────────────
--
-- Kênh chết = tin khách KHÔNG VỀ NỮA, mà hộp thư vẫn im như thường. Đây đúng
-- là loại hỏng âm thầm tệ nhất: không có gì báo lỗi, chỉ là hết khách nhắn.
create or replace function public.channels_notify_down()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare v_tenant_name text;
begin
  if new.status = old.status then return new; end if;
  if new.status not in ('token_expired', 'disconnected') then return new; end if;

  begin
    select name into v_tenant_name from public.tenants
     where id = new.tenant_id and coalesce(is_sample, false) = false;
    if v_tenant_name is null then return new; end if;

    perform public.platform_notify(
      'channel_down',
      'chan:' || new.id || ':' || new.status || ':' || to_char(now(), 'YYYY-MM-DD"T"HH24'),
      '🔌 Kênh ' || new.type || ' của ' || v_tenant_name || ' đã ' ||
      case new.status when 'token_expired' then 'HẾT HẠN KẾT NỐI' else 'bị ngắt' end ||
      E'\nTin khách qua kênh này không về nữa.'
    );
  exception when others then
    raise warning 'channels_notify_down bỏ qua lỗi: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists channels_notify_down on public.channels;
create trigger channels_notify_down
  after update of status on public.channels
  for each row execute function public.channels_notify_down();

-- ── 4. BẢN TIN TUẦN ─────────────────────────────────────────────────────────
--
-- Bản tin ngày trả lời "hôm nay có gì"; bản tin tuần trả lời "tuần này ĐI LÊN
-- hay ĐI XUỐNG" — so với tuần trước. Một con số trơ trọi không nói được điều đó.
create or replace function public.weekly_pulse()
returns boolean
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_end timestamptz := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                       at time zone 'Asia/Ho_Chi_Minh';
  v_start timestamptz := v_end - interval '7 days';
  v_prev timestamptz := v_end - interval '14 days';
  v_t int; v_t_prev int; v_c int; v_c_prev int; v_ask int; v_fail int;
  v_body text;
  mui text;
begin
  select count(*) into v_t from public.tenants
   where deleted_at is null and coalesce(is_sample,false)=false
     and created_at >= v_start and created_at < v_end;
  select count(*) into v_t_prev from public.tenants
   where coalesce(is_sample,false)=false and created_at >= v_prev and created_at < v_start;
  select count(*) into v_c from public.contacts
   where deleted_at is null and created_at >= v_start and created_at < v_end;
  select count(*) into v_c_prev from public.contacts
   where created_at >= v_prev and created_at < v_start;
  select count(*) into v_ask from public.tg_bridge_queue
   where created_at >= v_start and created_at < v_end;
  select count(*) into v_fail from public.platform_outbox
   where kind in ('user_failure','system_alert') and created_at >= v_start and created_at < v_end;

  if v_t = 0 and v_c = 0 and v_ask = 0 then return false; end if;

  mui := case when v_t > v_t_prev then ' ↑' when v_t < v_t_prev then ' ↓' else '' end;
  v_body := '📈 Tuần qua ở iFan' ||
            E'\n· Tiệm mới: ' || v_t || ' (tuần trước ' || v_t_prev || ')' || mui;
  mui := case when v_c > v_c_prev then ' ↑' when v_c < v_c_prev then ' ↓' else '' end;
  v_body := v_body || E'\n· Khách hàng mới: ' || v_c || ' (tuần trước ' || v_c_prev || ')' || mui;
  if v_ask > 0 then v_body := v_body || E'\n· Câu hỏi gửi bot: ' || v_ask; end if;
  if v_fail > 0 then v_body := v_body || E'\n· ⚠️ Cảnh báo hỏng trong tuần: ' || v_fail; end if;

  perform public.platform_notify('weekly_pulse',
    'week:' || to_char(v_start, 'IYYY-IW'), v_body);
  return true;
end $$;

revoke all on function public.weekly_pulse() from public;

-- Sáng thứ Hai 8:00 giờ Việt Nam = 1:00 UTC — đọc lúc bắt đầu tuần làm việc.
select cron.schedule('weekly-pulse', '0 1 * * 1', 'select public.weekly_pulse()');
