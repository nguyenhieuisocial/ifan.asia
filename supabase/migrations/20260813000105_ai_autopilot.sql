-- ============================================================
-- iFan.asia — Migration #105: V2.5 "AI trực việc" — nền tảng (ADR-0014,
-- docs/adr/0014-v25-ai-truc-viec.md). Đọc ADR trước khi sửa file này — phạm
-- vi 4 loại câu, 5 kiểu bàn giao, và cấm sáng tác đều đã CHỐT ở đó, không
-- phải tự chọn ở migration này.
--
-- Đúng phạm vi ADR mục 9 việc 1:
--   ai_autopilot        -- cài đặt 1 dòng/tiệm (QĐ 1: công tắc BỊ KHOÁ khi
--                          tiệm chưa có dịch vụ lẫn giờ mở cửa)
--   ai_reply_log        -- nhật ký MỌI lượt quyết định (QĐ 4), không chỉ lượt
--                          gửi — 4/5 dòng của một tiệm bình thường là lượt
--                          KHÔNG trả lời, và đó mới là phần đáng đọc
--   tenant_open_now()   -- "tiệm có đang mở cửa không" — closures ĐÈ lên giờ
--                          lặp theo thứ (khuôn appointment_hours_warning,
--                          migration #83), KHÔNG tự chế lại phép so giờ
--   ai_autopilot_decide -- chốt chặn TRƯỚC khi gọi AI: công tắc, nguồn dữ
--                          liệu, 2 trần (QĐ 8). Chạy bằng SERVICE ROLE (webhook
--                          Live Chat/Telegram không có JWT người dùng — khuôn
--                          get_telegram_channel_secrets, migration #97)
--   ai_reply_log_record -- ghi KẾT CỤC sau khi gọi AI (sent / ngoài phạm vi /
--                          lỗi) — decide() không tự biết được ba kết cục này,
--                          chỉ AI đã thử trả lời rồi mới biết
--
-- CỐ TÌNH CHƯA DỰNG (ADR mục 9 "CẮT"):
--   AI tự đặt lịch hẹn/tạo đơn/đọc tài liệu tải lên/gọi điện/đa ngôn ngữ/chủ
--   động nhắn trước — không phải thiếu sót, xem ADR mục 9.
--
-- CHƯA GIẢI QUYẾT, ĐỂ LẠI CHO TASK #125 (không phải quên):
--   Lượt AI trực việc gửi thật CÓ NÊN cộng vào `usage_counters` (trần tháng
--   theo gói, dùng chung với 3 hàm copilot trong lib/ai/gateway.ts) không?
--   `increment_usage()` đọc `current_tenant_id()` từ JWT — không có trong ngữ
--   cảnh webhook chạy bằng service role. Migration này KHÔNG tự quyết thay:
--   2 trần mới (ngày/hội thoại) đã đủ chặn chi phí lúc chưa có tiệm thật; nối
--   vào trần tháng chung là việc của #125 khi viết code gọi AI thật.
-- ============================================================

-- ---------- ai_autopilot: cài đặt TỐI THIỂU (ADR mục 3 + 8) ----------
-- MỘT dòng/tiệm — không phải bảng lịch sử, upsert khi tiệm bấm Lưu.

create table public.ai_autopilot (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  -- 'outside_hours': chỉ trả lời khi tenant_open_now() = false (mặc định —
  -- đúng giá trị AI trực việc lớn nhất: khách nhắn 11 giờ đêm vẫn có người
  -- trả lời giờ mở cửa). 'always': trả lời cả trong giờ làm việc.
  scope text not null default 'outside_hours' check (scope in ('outside_hours','always')),
  max_turns_per_conversation int not null default 3
    check (max_turns_per_conversation between 1 and 10),
  daily_cap int not null default 50 check (daily_cap between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_autopilot enable row level security;
-- Quyền owner/admin/manager — khớp khuôn màn Dịch vụ (ADR-0009 mục 7b,
-- đính chính 13/08). Staff KHÔNG cần thấy cấu hình này để làm việc, khác
-- `services` (thợ cần biết dịch vụ để đặt ca) — nên CHỈ một policy ALL, không
-- có SELECT riêng cho mọi thành viên.
create policy ai_autopilot_manage on public.ai_autopilot for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger ai_autopilot_touch before update on public.ai_autopilot
  for each row execute function public.touch_updated_at();
revoke all on public.ai_autopilot from anon;

comment on table public.ai_autopilot is
  'ADR-0014 mục 3. Công tắc BỊ KHOÁ ở tầng CSDL trong ai_autopilot_decide() khi tiệm chưa có dịch vụ lẫn giờ mở cửa — cột enabled=true không tự đủ để gửi (bất biến 1: chặn ở CSDL, không ở giao diện).';

-- ---------- ai_reply_log: nhật ký MỌI lượt quyết định (ADR mục 4) ----------
-- "AI không trả lời" là kiểu hỏng VÔ HÌNH — không log thì tiệm chỉ thấy nó
-- chẳng làm gì, không ai biết vì sao. Nên bảng này ghi cả 7 kiểu KHÔNG gửi,
-- không chỉ kiểu gửi.

create table public.ai_reply_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- 8 kết cục = đúng 8 ca nghiệm thu ADR mục 10 (7 ca máy + 'sent' bình thường).
  outcome text not null check (outcome in (
    'sent',                  -- đã gửi thật
    'skipped_off',           -- công tắc tắt
    'skipped_no_source',     -- chưa khai dịch vụ lẫn giờ mở cửa
    'skipped_daily_cap',     -- vượt trần lượt/ngày của tiệm
    'skipped_turn_cap',      -- đã đủ N lượt trong hội thoại này
    'skipped_within_hours',  -- scope=outside_hours nhưng đang trong giờ mở cửa
    'skipped_out_of_scope',  -- câu hỏi ngoài 4 loại được phép (ADR mục 4)
    'error'                  -- cổng AI lỗi (chưa cấu hình/hết lượt tháng/hỏng)
  )),
  -- Chi tiết đọc được, VD lý do lỗi cụ thể (not_configured/quota_exceeded) —
  -- KHÔNG bắt buộc, outcome đã đủ để lọc/đếm.
  reason text check (reason is null or char_length(reason) <= 300),
  -- Chỉ có giá trị khi outcome='sent' — trỏ đúng tin đã gửi cho khách.
  message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.ai_reply_log enable row level security;
-- CHỈ SELECT — ghi duy nhất qua RPC SECURITY DEFINER bên dưới. Cho phép ai đó
-- (kể cả owner) INSERT/UPDATE/DELETE tay là mở đường sửa nhật ký, phá tính
-- làm chứng của nó.
create policy ai_reply_log_select on public.ai_reply_log for select
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'));
revoke all on public.ai_reply_log from anon;

-- Đếm trần ngày (tenant, outcome='sent', hôm nay) và trần hội thoại (tenant,
-- conversation, outcome='sent') là hai truy vấn chạy MỖI lần quyết định.
create index ai_reply_log_tenant_sent_idx on public.ai_reply_log (tenant_id, created_at)
  where outcome = 'sent';
create index ai_reply_log_conv_sent_idx on public.ai_reply_log (conversation_id)
  where outcome = 'sent';
-- Màn Cài đặt đọc nhật ký mới nhất của tiệm (mọi outcome).
create index ai_reply_log_tenant_created_idx on public.ai_reply_log (tenant_id, created_at desc);

comment on table public.ai_reply_log is
  'ADR-0014 mục 4 + 10. Ghi CẢ lượt không trả lời — im lặng là kiểu hỏng vô hình. Ghi qua ai_autopilot_decide() (chặn trước) và ai_reply_log_record() (kết cục sau khi gọi AI), không ghi tay.';

-- ---------- tenant_open_now: tiệm có đang mở cửa không ----------
-- Bài học 12/08 (storefront-hours-smoke): so giờ phải quy về GIỜ ĐỊA PHƯƠNG
-- của tiệm rồi mới đối chiếu, và ngày nghỉ lễ (business_closures) ĐÈ lên giờ
-- lặp theo thứ (business_hours) — khuôn appointment_hours_warning (migration
-- #83). KHÔNG tự chế lại phép so giờ khác ở đây (luật D1).
--
-- Trả 'no_hours' khi tiệm chưa khai business_hours — decide() dùng cờ này để
-- phân biệt "đang trong giờ làm" với "chưa có gì để so", hai lý do khác hẳn
-- nhau dù cùng dẫn tới một quyết định.

create or replace function public.tenant_open_now(p_tenant uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public, pg_temp as $$
declare
  v_tz text;
  v_now timestamptz := now();
  v_local_date date;
  v_local_time time;
  v_dow int;
  v_closure public.business_closures%rowtype;
  v_has_hours boolean;
  v_open boolean;
begin
  select t.timezone into v_tz from public.tenants t where t.id = p_tenant;
  if v_tz is null then return jsonb_build_object('open', false, 'reason', 'no_tenant'); end if;

  v_local_date := (v_now at time zone v_tz)::date;
  v_local_time := (v_now at time zone v_tz)::time;
  v_dow := extract(dow from (v_now at time zone v_tz))::int;

  select exists (select 1 from public.business_hours h where h.tenant_id = p_tenant)
    into v_has_hours;
  if not v_has_hours then
    return jsonb_build_object('open', false, 'reason', 'no_hours');
  end if;

  select * into v_closure from public.business_closures c
    where c.tenant_id = p_tenant and v_local_date between c.date_from and c.date_to
    order by c.date_from limit 1;
  if v_closure.id is not null then
    if v_closure.is_full_day then
      return jsonb_build_object('open', false, 'reason', 'closure');
    end if;
    v_open := v_local_time >= v_closure.open_time and v_local_time <= v_closure.close_time;
    return jsonb_build_object('open', v_open, 'reason', 'closure_hours');
  end if;

  select exists (
    select 1 from public.business_hours h
      where h.tenant_id = p_tenant and h.weekday = v_dow and not h.is_closed
        and v_local_time >= h.open_time and v_local_time <= h.close_time
  ) into v_open;
  return jsonb_build_object('open', v_open, 'reason', 'regular_hours');
end $$;
revoke execute on function public.tenant_open_now(uuid) from public, anon;
grant execute on function public.tenant_open_now(uuid) to authenticated, service_role;

-- ---------- ai_autopilot_decide: chốt chặn TRƯỚC khi gọi AI ----------
-- Gọi bằng SERVICE ROLE từ webhook Live Chat/Telegram (không có JWT tenant —
-- khuôn get_telegram_channel_secrets, migration #97). Tenant suy ra từ
-- conversation, KHÔNG nhận p_tenant từ caller — tránh gọi nhầm/gọi giả tenant.
--
-- CHỈ log khi CHẶN (7 outcome 'skipped_*'/'error' đều KHÔNG qua đây — error
-- là do gọi AI hỏng, xảy ra SAU quyết định này). Khi allowed=true, KHÔNG ghi
-- gì — app gọi ai_reply_log_record() sau khi biết AI trả lời được hay không.

create or replace function public.ai_autopilot_decide(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
  v_cfg public.ai_autopilot%rowtype;
  v_has_source boolean;
  v_sent_today int;
  v_sent_in_conv int;
  v_open jsonb;
  v_reason text;
begin
  if p_conversation_id is null then raise exception 'invalid_conversation'; end if;

  select c.tenant_id into v_tenant
    from public.conversations c where c.id = p_conversation_id;
  if v_tenant is null then raise exception 'conversation_not_found'; end if;

  select * into v_cfg from public.ai_autopilot where tenant_id = v_tenant;

  if v_cfg.tenant_id is null or not v_cfg.enabled then
    v_reason := 'off';
  else
    -- QĐ 1 — kiểm LẠI dù cột enabled đã true: tiệm phải có dịch vụ HOẶC giờ
    -- mở cửa. Kể cả ai đó bật enabled=true bằng tay trong CSDL, chặn vẫn ở
    -- đây (ADR mục 10, ca 1: "kể cả khi cột enabled bị bật tay").
    select exists (select 1 from public.services s where s.tenant_id = v_tenant and s.is_active)
        or exists (select 1 from public.business_hours h where h.tenant_id = v_tenant)
      into v_has_source;

    if not v_has_source then
      v_reason := 'no_source';
    else
      select count(*) into v_sent_today from public.ai_reply_log
        where tenant_id = v_tenant and outcome = 'sent'
          and created_at >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                            at time zone 'Asia/Ho_Chi_Minh';
      if v_sent_today >= v_cfg.daily_cap then
        v_reason := 'daily_cap';
      else
        select count(*) into v_sent_in_conv from public.ai_reply_log
          where tenant_id = v_tenant and conversation_id = p_conversation_id and outcome = 'sent';
        if v_sent_in_conv >= v_cfg.max_turns_per_conversation then
          v_reason := 'turn_cap';
        elsif v_cfg.scope = 'outside_hours' then
          v_open := public.tenant_open_now(v_tenant);
          -- 'no_hours' đã bị chặn ở nhánh no_source phía trên (business_hours
          -- rỗng ⇒ has_source chỉ còn đúng khi CÓ dịch vụ) — ở đây tenant chắc
          -- chắn đã khai giờ, nên chỉ còn phân biệt đang mở hay đang đóng.
          v_reason := case when (v_open ->> 'open')::boolean then 'within_hours' else 'ok' end;
        else
          v_reason := 'ok';
        end if;
      end if;
    end if;
  end if;

  if v_reason <> 'ok' then
    insert into public.ai_reply_log (tenant_id, conversation_id, outcome)
      values (v_tenant, p_conversation_id, 'skipped_' || v_reason);
  end if;

  return jsonb_build_object('allowed', v_reason = 'ok', 'reason', v_reason, 'tenant_id', v_tenant);
end $$;
revoke execute on function public.ai_autopilot_decide(uuid) from public, anon, authenticated;
grant execute on function public.ai_autopilot_decide(uuid) to service_role;

comment on function public.ai_autopilot_decide(uuid) is
  'ADR-0014 mục 8 + 10. Gọi TRƯỚC khi hỏi AI. allowed=false đã tự ghi log; allowed=true thì caller gọi ai_reply_log_record() sau khi biết kết cục thật.';

-- ---------- ai_reply_log_record: ghi KẾT CỤC sau khi gọi AI ----------
-- decide() không tự biết 3 kết cục này — chỉ sau khi ĐÃ gọi AI mới biết câu
-- hỏi có nằm trong 4 phạm vi được phép hay không, và AI có lỗi hay không.

create or replace function public.ai_reply_log_record(
  p_conversation_id uuid,
  p_outcome text,
  p_reason text default null,
  p_message_id uuid default null
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if p_outcome not in ('sent','skipped_out_of_scope','error') then
    raise exception 'invalid_outcome'; -- 5 outcome còn lại chỉ được ghi bởi decide()
  end if;
  select c.tenant_id into v_tenant
    from public.conversations c where c.id = p_conversation_id;
  if v_tenant is null then raise exception 'conversation_not_found'; end if;

  insert into public.ai_reply_log (tenant_id, conversation_id, outcome, reason, message_id)
    values (v_tenant, p_conversation_id, p_outcome, p_reason,
            case when p_outcome = 'sent' then p_message_id else null end);

  -- ai.replied — khai ở docs/EVENT_CATALOG.md, cùng transaction (bất biến 12).
  -- Đúng khuôn contact.merged: phát TƯỜNG MINH từ RPC, không phải trigger đọc
  -- OLD/NEW, vì "AI đã trả lời" không phải một thay đổi trạng thái của hàng
  -- nào mà là một QUYẾT ĐỊNH của RPC này.
  if p_outcome = 'sent' then
    perform public.wf_emit(v_tenant, 'ai.replied', 'conversation', p_conversation_id::text,
                           jsonb_build_object('message_id', p_message_id));
  end if;
end $$;
revoke execute on function public.ai_reply_log_record(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.ai_reply_log_record(uuid, text, text, uuid) to service_role;

comment on function public.ai_reply_log_record(uuid, text, text, uuid) is
  'ADR-0014 mục 4. Chỉ nhận 3 outcome caller mới biết được sau khi gọi AI (sent/skipped_out_of_scope/error) — 5 outcome còn lại (off/no_source/daily_cap/turn_cap/within_hours) đã do ai_autopilot_decide() tự ghi, ghi lại ở đây là đếm trùng.';
