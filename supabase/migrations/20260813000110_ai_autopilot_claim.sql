-- Migration #110 — VÁ 3 LỖI của AI trực việc, bắt được khi Opus soát lại code
-- Sonnet vừa viết (ADR-0014). Cả ba đều CHỨNG MINH ĐƯỢC trên CSDL thật, không
-- phải suy đoán từ đọc code.
--
-- ── LỖI 1 (NGHIÊM TRỌNG NHẤT): KHÁCH NHẬN TIN TRÙNG ────────────────────────
-- `ai_autopilot_decide()` chỉ GHI nhật ký khi TỪ CHỐI. Khi cho phép gửi thì nó
-- không ghi gì cả — nên chỉ mục DUY NHẤT trên `trigger_message_id` KHÔNG chặn
-- được lượt quét thứ hai; nó chỉ bắt lúc GHI NHẬT KÝ, tức SAU KHI khách đã
-- nhận tin.
--
-- Chứng minh (chạy thật rồi hoàn tác): gọi decide() HAI LẦN với ĐÚNG một tin
-- khách → cả hai trả {allowed:true}, nhật ký 0 dòng.
--
-- Máy quét chạy trên MỌI webhook tin đến CỘNG nhịp cron 15 phút, nên hai lượt
-- chồng nhau là chuyện thường (khách nhắn 2 tin liền tay là đủ). Hậu quả:
-- khách nhận 2 tin AI giống hệt, và nhật ký chỉ hiện 1 — tức chính cái sổ dựng
-- ra để "không hỏng im lặng" lại CHE MẤT lỗi này.
--
-- SỬA: decide() ĐẶT CHỖ (ghi dòng 'claimed') ngay trong cùng transaction thay
-- vì chỉ "hỏi ý kiến". Giành được chỗ mới cho gửi. Đây là cách duy nhất chặn
-- được ở tầng CSDL (bất biến 1) — khoá trong Node không chặn nổi hai tiến
-- trình serverless khác nhau.
--
-- ── LỖI 2: THỬ LẠI VÔ HẠN, ĐỐT LƯỢT AI ─────────────────────────────────────
-- Hai trần (ngày / hội thoại) đều chỉ đếm `outcome='sent'`. Dòng 'error' không
-- được đếm ở đâu cả, mà hội thoại lỗi thì vẫn `is_unanswered` nên lượt quét
-- sau lại nhặt đúng nó.
--
-- Chứng minh: ghi 3 dòng 'error' liên tiếp cho cùng một tin → lượt thứ 4 vẫn
-- trả {allowed:true}. Tức cổng AI hỏng kéo dài = mỗi lượt quét đốt thêm một
-- lượt quota, mãi mãi, không ai thấy.
--
-- SỬA: đếm số lần thử ngay trên dòng nhật ký; quá 3 lần thì chốt 'error' và
-- dừng, không thử nữa.
--
-- ── LỖI 3 (REGRESSION): migration #108 XOÁ MẤT câu giải thích của #106 ──────
-- #106 sinh ra để thêm câu tiếng Việt "scope=outside_hours nhưng chưa khai giờ
-- mở cửa…" cho đúng ca dễ hiểu nhầm nhất. #108 viết lại decide() và bỏ hẳn
-- cột `reason` khỏi câu INSERT — nên màn Nhật ký chỉ còn "Chưa đủ dữ liệu để
-- trả lời", đúng thứ mơ hồ mà #106 dựng ra để sửa. Nay trả lại.

-- ---------- 1. Thêm trạng thái 'claimed' + bộ đếm số lần thử ----------

alter table public.ai_reply_log
  add column if not exists attempts int not null default 0;

alter table public.ai_reply_log drop constraint if exists ai_reply_log_outcome_check;
alter table public.ai_reply_log add constraint ai_reply_log_outcome_check
  check (outcome in (
    'claimed',               -- MỚI: một lượt quét đã giành chỗ, đang gọi AI
    'sent',
    'skipped_off',
    'skipped_no_source',
    'skipped_daily_cap',
    'skipped_turn_cap',
    'skipped_within_hours',
    'skipped_out_of_scope',
    'error'
  ));

comment on column public.ai_reply_log.attempts is
  'Số lần đã thử trả lời tin này. Quá 3 lần hỏng thì dừng — chống vòng lặp thử lại đốt lượt AI (migration #110).';

-- ---------- 2. decide() — ĐẶT CHỖ, không chỉ hỏi ý kiến ----------

create or replace function public.ai_autopilot_decide(
  p_conversation_id uuid, p_trigger_message_id uuid
)
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
  v_chi_tiet text;
  v_attempts int;
begin
  if p_conversation_id is null or p_trigger_message_id is null then
    raise exception 'invalid_conversation';
  end if;

  select c.tenant_id into v_tenant
    from public.conversations c where c.id = p_conversation_id;
  if v_tenant is null then raise exception 'conversation_not_found'; end if;

  select * into v_cfg from public.ai_autopilot where tenant_id = v_tenant;

  if v_cfg.tenant_id is null or not v_cfg.enabled then
    v_reason := 'off';
  else
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
          if (v_open ->> 'reason') = 'no_hours' then
            v_reason := 'no_source';
            -- LỖI 3 vá lại: nói RÕ vì sao, đừng để founder đoán.
            v_chi_tiet := 'scope=outside_hours nhưng chưa khai giờ mở cửa — không xác định được lúc nào là "ngoài giờ"';
          elsif (v_open ->> 'open')::boolean then
            v_reason := 'within_hours';
          else
            v_reason := 'ok';
          end if;
        else
          v_reason := 'ok';
        end if;
      end if;
    end if;
  end if;

  -- ── Nhánh TỪ CHỐI: ghi nhật ký như cũ, không giành chỗ ──
  if v_reason <> 'ok' then
    insert into public.ai_reply_log
      (tenant_id, conversation_id, trigger_message_id, outcome, reason)
      values (v_tenant, p_conversation_id, p_trigger_message_id, 'skipped_' || v_reason, v_chi_tiet)
      on conflict (trigger_message_id) do nothing;
    return jsonb_build_object('allowed', false, 'reason', v_reason, 'tenant_id', v_tenant);
  end if;

  -- ── Nhánh CHO PHÉP: phải GIÀNH ĐƯỢC CHỖ mới được gửi (LỖI 1) ──
  --
  -- Cho giành lại đúng HAI trường hợp:
  --   * dòng cũ là 'error' — lỗi tạm thời, đáng thử lại;
  --   * dòng cũ là 'claimed' nhưng đã quá 5 phút — chỗ MỒ CÔI (tiến trình
  --     serverless chết giữa chừng). Không có nhánh này thì một lần chết máy
  --     làm tin khách đó KẸT VĨNH VIỄN, không ai trả lời — đổi một lỗi lấy
  --     một lỗi khác.
  insert into public.ai_reply_log
    (tenant_id, conversation_id, trigger_message_id, outcome, attempts)
    values (v_tenant, p_conversation_id, p_trigger_message_id, 'claimed', 1)
    on conflict (trigger_message_id) do update
      set outcome = 'claimed',
          attempts = public.ai_reply_log.attempts + 1,
          reason = null,
          created_at = now()
      where public.ai_reply_log.outcome = 'error'
         or (public.ai_reply_log.outcome = 'claimed'
             and public.ai_reply_log.created_at < now() - interval '5 minutes')
    returning attempts into v_attempts;

  -- Không có dòng trả về = KHÔNG giành được (lượt quét khác đang giữ, hoặc tin
  -- này đã xử xong rồi). Im lặng nhường — KHÔNG gửi.
  if v_attempts is null then
    return jsonb_build_object('allowed', false, 'reason', 'already_claimed', 'tenant_id', v_tenant);
  end if;

  -- LỖI 2: quá 3 lần thử đều hỏng thì chốt lại, đừng đốt lượt AI mãi.
  if v_attempts > 3 then
    update public.ai_reply_log
       set outcome = 'error',
           reason = 'đã thử ' || (v_attempts - 1) || ' lần đều hỏng — dừng thử lại, hội thoại chờ người'
     where trigger_message_id = p_trigger_message_id;
    return jsonb_build_object('allowed', false, 'reason', 'error_cap', 'tenant_id', v_tenant);
  end if;

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'tenant_id', v_tenant,
                            'attempt', v_attempts);
end $$;
revoke execute on function public.ai_autopilot_decide(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_autopilot_decide(uuid, uuid) to service_role;

comment on function public.ai_autopilot_decide(uuid, uuid) is
  'ADR-0014 mục 8+10. GIÀNH CHỖ rồi mới cho gửi (migration #110) — hai lượt quét song song thì chỉ một lượt được gửi, chặn ở CSDL chứ không tin vào code Node. allowed=false đã tự ghi nhật ký.';

-- ---------- 3. record() — ghi đè được cả 'claimed' ----------

create or replace function public.ai_reply_log_record(
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_outcome text,
  p_reason text default null,
  p_sent_message_id uuid default null
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
  v_da_ghi boolean;
begin
  if p_outcome not in ('sent','skipped_out_of_scope','error') then
    raise exception 'invalid_outcome';
  end if;
  if p_trigger_message_id is null then raise exception 'invalid_trigger_message'; end if;
  select c.tenant_id into v_tenant
    from public.conversations c where c.id = p_conversation_id;
  if v_tenant is null then raise exception 'conversation_not_found'; end if;

  insert into public.ai_reply_log
    (tenant_id, conversation_id, trigger_message_id, outcome, reason, message_id, attempts)
    values (v_tenant, p_conversation_id, p_trigger_message_id, p_outcome, p_reason,
            case when p_outcome = 'sent' then p_sent_message_id else null end, 1)
    on conflict (trigger_message_id) do update
      set outcome = excluded.outcome, reason = excluded.reason,
          message_id = excluded.message_id, created_at = now()
      -- 'claimed' = chỗ CHÍNH LƯỢT NÀY vừa giành, đang chờ kết cục → ghi đè.
      -- 'error'   = lỗi tạm thời, biết kết cục thật thì sửa lại.
      -- 'sent' / 'skipped_out_of_scope' = SỰ THẬT ĐÃ XẢY RA, không ghi đè.
      where public.ai_reply_log.outcome in ('claimed', 'error')
    returning true into v_da_ghi;

  if p_outcome = 'sent' and v_da_ghi is not null then
    perform public.wf_emit(v_tenant, 'ai.replied', 'conversation', p_conversation_id::text,
                           jsonb_build_object('message_id', p_sent_message_id));
  end if;
end $$;
revoke execute on function public.ai_reply_log_record(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.ai_reply_log_record(uuid, uuid, text, text, uuid) to service_role;

-- ---------- 4. Tìm ứng viên bằng SQL (vá 2 lỗi nữa của tầng Node) ----------
--
-- LỖI 4: câu đọc `messages` bên Node KHÔNG có LIMIT — dựa vào trần mặc định
-- của PostgREST. Một hội thoại nhiều tin có thể đẩy hội thoại khác ra khỏi
-- kết quả ⇒ hội thoại đó bị bỏ qua ÂM THẦM.
--
-- LỖI 5: Node lấy 90 hội thoại (cũ nhất trước) rồi mới LỌC KÊNH bằng JS. Tiệm
-- mẫu đang có 4 hội thoại Zalo `pending_platform` không ai trả lời bao giờ —
-- loại này tích tụ dần. Đủ 90 hội thoại Zalo cũ là AI KHÔNG BAO GIỜ nhìn thấy
-- hội thoại Live Chat mới. Lọc phải nằm TRONG câu truy vấn.
--
-- `p_channel_types` truyền từ Node (ADAPTERS) — giữ MỘT nguồn sự thật cho danh
-- sách kênh hỗ trợ (luật D1), không chép cứng vào SQL.

create or replace function public.ai_autopilot_candidates(
  p_channel_types text[], p_limit int default 30
)
returns table (
  conversation_id uuid,
  tenant_id uuid,
  channel_id uuid,
  channel_type text,
  external_user_id text,
  message_id uuid,
  content text
)
language sql
stable
security definer set search_path = public, pg_temp as $$
  select x.conversation_id, x.tenant_id, x.channel_id, x.channel_type,
         x.external_user_id, x.message_id, x.content
    from (
      select distinct on (c.id)
             c.id                  as conversation_id,
             c.tenant_id           as tenant_id,
             ch.id                 as channel_id,
             ch.type               as channel_type,
             c.external_user_id    as external_user_id,
             m.id                  as message_id,
             m.content             as content,
             c.last_user_message_at as cho_tu
        from public.conversations c
        join public.ai_autopilot a on a.tenant_id = c.tenant_id and a.enabled
        join public.channels ch on ch.id = c.channel_id
        join public.messages m on m.conversation_id = c.id and m.direction = 'in'
       where c.is_unanswered
         and ch.type = any (p_channel_types)
         and ch.status <> 'disconnected'
         and c.external_user_id is not null
         and coalesce(btrim(m.content), '') <> ''
       order by c.id, m.created_at desc   -- distinct on: giữ tin khách MỚI NHẤT
    ) x
   order by x.cho_tu asc nulls last       -- ai chờ lâu nhất được trả lời trước
   limit greatest(1, least(p_limit, 100));
$$;
revoke execute on function public.ai_autopilot_candidates(text[], int) from public, anon, authenticated;
grant execute on function public.ai_autopilot_candidates(text[], int) to service_role;

comment on function public.ai_autopilot_candidates(text[], int) is
  'Hội thoại chờ AI trả lời + tin khách mới nhất của nó. Lọc kênh NẰM TRONG truy vấn (migration #110) — lọc ở tầng Node làm hội thoại kênh không hỗ trợ chiếm hết cửa sổ quét.';
