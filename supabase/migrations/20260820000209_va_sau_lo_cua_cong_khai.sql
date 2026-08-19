-- ============================================================
-- iFan.asia — Migration #209: vá phần CSDL của sáu lỗ ở CỬA CÔNG KHAI
-- (cửa cả internet gọi được, không cần tài khoản)
--
-- Bốn trong sáu lỗ có phần chốt nằm trong CSDL; hai lỗ còn lại (chốt số lần
-- cho /t/[slug] và so bí mật hằng-thời-gian ở hai webhook) thuần tầng web,
-- không có gì để vá ở đây.
--
--   LỖ 1 — `ai_autopilot_decide` chỉ đếm `outcome='sent'` cho trần ngày, trong
--          khi tin LẠC ĐỀ (`skipped_out_of_scope`) vẫn tiêu một lượt gọi model
--          thật (đã trừ quota ở `increment_usage_for` trước khi hỏi). Người lạ
--          nhắn toàn chuyện lạc đề ⇒ đốt sạch hạn mức AI tháng của tiệm mà
--          KHÔNG BAO GIỜ chạm trần ngày. Đo được trên dữ liệu thật.
--   LỖ 2 — `storefront_view` phân biệt "slug không có" (raise not_found) với
--          "slug CÓ THẬT nhưng chưa bật mặt tiền" (trả `{enabled:false}`).
--          Quét từ điển slug ⇒ ra danh sách khách hàng của iFan.
--   LỖ 4 — `private.livechat_resolve` nhận origin ảo 'ifan:demo' KÈM khóa
--          nhúng CÔNG KHAI ⇒ hàng rào tên miền chỉ là trang trí.
--   LỖ 5 — `storefront_submit_lead` chỉ chặn theo IP (5 lượt/giờ). IP xoay
--          vòng ⇒ hồ sơ khách + hộp việc của tiệm ngập rác.
--
-- KỶ LUẬT CHÉP: cả bốn hàm đều CHÉP NGUYÊN VĂN từ bản MỚI NHẤT rồi mới sửa
-- đúng phần cần sửa — không viết lại theo trí nhớ (bài học #125/#128).
--   · ai_autopilot_decide      ← #128 (20260817000128_ai_autopilot_items_fix)
--   · storefront_view          ← #80  (20260812000080_v15_storefront_foundation)
--   · storefront_submit_lead   ← #201 (20260819000201_qr_gan_nguon_form_mat_tien)
--   · private.livechat_resolve ← #55  (20260810000055_livechat_demo)
-- `create or replace` ghi đè proconfig → ghim lại `set search_path` ngay trong
-- từng định nghĩa (bài học #40).
-- ============================================================

-- ============================================================
-- LỖ 1 — tin LẠC ĐỀ phải cộng vào TRẦN NGÀY
-- ============================================================
--
-- SỰ THẬT ĐO ĐƯỢC (dữ liệu thật, 20/08): `usage_counters.used = 5` cho
-- `ai_calls` trong khi `ai_reply_log` chỉ có 2 dòng `sent` + 1 dòng
-- `skipped_out_of_scope`. Dòng lạc đề đó ĐÃ tiêu một lượt gọi model thật —
-- `answerAutopilotQuestion()` gọi `increment_usage_for` TRƯỚC khi hỏi model —
-- nhưng `ai_autopilot_decide` đếm trần ngày chỉ bằng `outcome='sent'`, nên với
-- trần ngày nó VÔ HÌNH. Trần ngày đếm được 2, thực chi là 3.
--
-- Vì sao đây là lỗ TIỀN chứ không phải lỗ số liệu: trần ngày là thứ DUY NHẤT
-- đứng giữa một người lạ và hạn mức AI tháng của tiệm (30 lượt gói free / 300
-- lượt gói trả phí). Tin lạc đề là loại tin RẺ NHẤT để sinh ra — gõ gì cũng
-- được, không cần biết tiệm bán gì. Cửa vào thì mở sẵn: hộp chat trên website
-- tiệm, và (trước migration này) cả trang thử của iFan — xem LỖ 4 bên dưới.
-- Hết hạn mức thì AI câm CẢ THÁNG cho khách thật, kèm hoá đơn Anthropic.
--
-- ⭐ VÌ SAO CHỈ SỬA `daily_cap`, KHÔNG SỬA `max_turns_per_conversation`:
-- hai trần này canh hai thứ khác nhau và trộn chúng là làm hỏng cái thứ hai.
--   · `daily_cap` canh TIỀN — mỗi lượt gọi model là một lượt trả phí, bất kể
--     model trả lời được hay không. Nó phải đếm THEO CHI, tức cả tin lạc đề.
--   · `max_turns_per_conversation` canh TRẢI NGHIỆM — "đừng để AI nói quá n
--     lượt với cùng một khách rồi mới tới người thật". Tin lạc đề KHÔNG sinh
--     ra lượt nói nào cho khách thấy; đếm nó vào đây nghĩa là một khách hỏi 3
--     câu ngoài phạm vi sẽ bị khoá luôn phần trả lời cho câu thứ 4 HỢP LỆ.
--     Đó là chặn nhầm đúng người mình muốn phục vụ.
-- Trần tiền đã kín thì con đường "đốt sạch hạn mức" đã bị cắt ở gốc; không cần
-- mượn thêm trần trải nghiệm làm việc của trần tiền.
--
-- ⭐ VÌ SAO GIỮ `increment_usage_for` Ở TRƯỚC LỜI GỌI MODEL (đã cân nhắc
--    chuyển xuống sau, và QUYẾT ĐỊNH KHÔNG):
--   1. `usage_counters` là sổ đo TIỀN ĐÃ TIÊU, không phải sổ đếm câu trả lời
--      thành công. Anthropic tính phí cho MỌI lượt gọi — kể cả lượt model trả
--      về `in_scope=false`. Trừ quota sau khi biết kết quả sẽ làm sổ này báo
--      thấp hơn thực chi, tức là nói dối đúng con số mà nó sinh ra để canh.
--   2. Trừ trước là KIỂM SOÁT ĐẦU VÀO: hết quota thì dừng NGAY, không tốn lượt
--      gọi nào nữa. Trừ sau thì nhiều lượt quét chạy song song đều thấy "còn
--      quota" rồi cùng gọi model, và trần tháng bị vượt qua trong im lặng —
--      đúng kiểu lỗi mà một trần chi phí không được phép có.
--   3. Cái giá của việc giữ nguyên: lượt gọi HỎNG (mạng/API lỗi) vẫn bị tính
--      một lượt. Chấp nhận được — lỗi API hiếm, và nhiều lỗi trong số đó vẫn
--      đã tiêu token thật ở phía nhà cung cấp.
-- Đây cũng đúng thứ tự `guard()` của `lib/ai/gateway.ts` đang dùng cho 3 hàm
-- copilot — giữ MỘT luật cho cả 4 đường gọi AI (luật D1).
--
-- Sửa ĐÚNG MỘT câu lệnh so với #128. Toàn bộ phần còn lại chép nguyên văn.

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
  -- Giữ NGUYÊN tên biến của #128 dù nay nó đếm cả tin lạc đề: đổi tên biến
  -- trong một bản vá an ninh chỉ làm khó việc đối chiếu từng dòng với bản gốc.
  v_sent_today int;
  v_sent_in_conv int;
  v_open jsonb;
  v_reason text;
  v_chi_tiet text;
  v_attempts int;
  v_cur_outcome text;
  v_cur_attempts int;
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
    select exists (select 1 from public.items s where s.tenant_id = v_tenant and s.kind = 'service' and s.status = 'active')
        or exists (select 1 from public.business_hours h where h.tenant_id = v_tenant)
      into v_has_source;

    if not v_has_source then
      v_reason := 'no_source';
    else
      -- DÒNG DUY NHẤT đổi so với #128: trần NGÀY đếm theo LƯỢT GỌI MODEL ĐÃ
      -- TIÊU, không theo lượt trả lời thành công. `skipped_out_of_scope` là
      -- kết cục CHỈ CÓ THỂ biết sau khi model đã trả lời (và đã tính tiền), nên
      -- nó thuộc về vế chi. 'error' KHÔNG đếm vào đây: nó đã có trần riêng
      -- (3 attempts, xem khối claim bên dưới) và phần lớn là lỗi chưa kịp gọi
      -- tới model (chưa cấu hình / hết quota / kênh không nối được).
      select count(*) into v_sent_today from public.ai_reply_log
        where tenant_id = v_tenant
          and outcome in ('sent', 'skipped_out_of_scope')
          and created_at >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                            at time zone 'Asia/Ho_Chi_Minh';
      if v_sent_today >= v_cfg.daily_cap then
        v_reason := 'daily_cap';
      else
        -- KHÔNG đổi: trần lượt/hội thoại vẫn chỉ đếm tin ĐÃ GỬI (xem lý do ở
        -- đầu file — đây là trần trải nghiệm, không phải trần tiền).
        select count(*) into v_sent_in_conv from public.ai_reply_log
          where tenant_id = v_tenant and conversation_id = p_conversation_id and outcome = 'sent';
        if v_sent_in_conv >= v_cfg.max_turns_per_conversation then
          v_reason := 'turn_cap';
        elsif v_cfg.scope = 'outside_hours' then
          v_open := public.tenant_open_now(v_tenant);
          if (v_open ->> 'reason') = 'no_hours' then
            v_reason := 'no_source';
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

  if v_reason <> 'ok' then
    insert into public.ai_reply_log
      (tenant_id, conversation_id, trigger_message_id, outcome, reason)
      values (v_tenant, p_conversation_id, p_trigger_message_id, 'skipped_' || v_reason, v_chi_tiet)
      on conflict (trigger_message_id) do nothing;
    return jsonb_build_object('allowed', false, 'reason', v_reason, 'tenant_id', v_tenant);
  end if;

  insert into public.ai_reply_log
    (tenant_id, conversation_id, trigger_message_id, outcome, attempts)
    values (v_tenant, p_conversation_id, p_trigger_message_id, 'claimed', 1)
    on conflict (trigger_message_id) do update
      set outcome = 'claimed',
          attempts = public.ai_reply_log.attempts + 1,
          reason = null,
          created_at = now()
      where (public.ai_reply_log.outcome = 'error'
             and public.ai_reply_log.attempts < 3)
         or (public.ai_reply_log.outcome = 'claimed'
             and public.ai_reply_log.created_at < now() - interval '5 minutes')
    returning attempts into v_attempts;

  if v_attempts is null then
    select outcome, attempts into v_cur_outcome, v_cur_attempts
      from public.ai_reply_log where trigger_message_id = p_trigger_message_id;
    return jsonb_build_object(
      'allowed', false,
      'reason', case
        when v_cur_outcome = 'error' and v_cur_attempts >= 3 then 'error_cap'
        when v_cur_outcome in ('sent','skipped_out_of_scope') then 'already_done'
        else 'already_claimed'
      end,
      'attempts', v_cur_attempts,
      'tenant_id', v_tenant);
  end if;

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'tenant_id', v_tenant,
                            'attempt', v_attempts, 'custom_instruction', v_cfg.custom_instruction);
end $$;
revoke execute on function public.ai_autopilot_decide(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_autopilot_decide(uuid, uuid) to service_role;

comment on function public.ai_autopilot_decide(uuid, uuid) is
  'ADR-0014 mục 8 + 10. Gọi TRƯỚC khi hỏi AI, MỘT LẦN cho mỗi tin khách. Trần NGÀY đếm theo LƯỢT GỌI MODEL đã tiêu (sent + skipped_out_of_scope, #209) — tin lạc đề vẫn tốn tiền nên vẫn phải chạm trần. Trần lượt/hội thoại chỉ đếm sent (trần trải nghiệm, không phải trần tiền).';

-- ============================================================
-- LỖ 2 — slug CÓ THẬT mà chưa bật mặt tiền phải trả lời Y HỆT slug không có
-- ============================================================
--
-- SỰ THẬT ĐO ĐƯỢC (dữ liệu thật, 20/08): 9 tiệm / 7 dòng `tenant_storefront`.
-- Hai tiệm (`abc`, `qa-ifan-store`) chưa từng có dòng mặt tiền nào ⇒ trước bản
-- vá này, `storefront_view('abc')` TRẢ VỀ `{"enabled": false}` (thành công),
-- còn `storefront_view('slug-bia-ra')` NÉM `not_found`. Hai kết cục phân biệt
-- được ⇒ quét từ điển slug là ra DANH SÁCH KHÁCH HÀNG của iFan.
--
-- ⭐ VÌ SAO PHẢI VÁ Ở ĐÂY CHỨ KHÔNG CHỈ Ở TRANG WEB: hàm này `grant execute to
-- anon`, tức gọi thẳng được qua PostgREST bằng khóa anon — mà khóa anon nằm
-- công khai trong mã nguồn trang web. Vá `notFound()` ở `app/t/[slug]/page.tsx`
-- mà để hàm nguyên trạng thì chỉ bịt cái cửa có người canh, còn cửa sau vẫn mở
-- toang. Vá ở hàm thì CẢ HAI cửa cùng kín, và tầng web chỉ còn một nhánh để lo.
--
-- Chú thích cũ ngay trên hàm này nói "dùng CHUNG một câu trả lời trung tính ở
-- tầng ứng dụng (not_found vs enabled=false)" — câu đó MÔ TẢ SAI thứ đang chạy
-- (hai nhánh trả hai mã HTTP khác nhau: 404 và 200). Nay hàm chỉ còn MỘT kết
-- cục nên câu chú thích mới nói đúng thứ mã đang làm.

create or replace function public.storefront_view(p_slug text)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant public.tenants%rowtype := private.storefront_resolve(p_slug);
  v_sf public.tenant_storefront%rowtype;
  v_catalog jsonb;
  v_fields jsonb;
  v_hours jsonb;
  v_closures jsonb;
begin
  if v_tenant.id is null then
    raise exception 'not_found';
  end if;

  select * into v_sf from public.tenant_storefront where tenant_id = v_tenant.id;
  -- ĐỔI so với #80: trước đây `return jsonb_build_object('enabled', false)`.
  -- Tiệm chưa bật mặt tiền thì với người ngoài nó KHÔNG TỒN TẠI — cùng một
  -- ngoại lệ, cùng một mã HTTP, không có khe nào để dò.
  if v_sf.tenant_id is null or not v_sf.storefront_enabled then
    raise exception 'not_found';
  end if;

  select content -> 'lead_form_fields' into v_catalog
    from public.industry_packs where key = v_tenant.industry;

  -- Chỉ trả field ĐÃ BẬT (tenant_storefront.lead_form_fields), không trả cả danh mục.
  select coalesce(jsonb_agg(f), '[]'::jsonb) into v_fields
    from jsonb_array_elements(coalesce(v_catalog, '[]'::jsonb)) f
    where coalesce(v_sf.lead_form_fields, '[]'::jsonb) ? (f ->> 'key');

  select coalesce(jsonb_agg(jsonb_build_object(
           'weekday', h.weekday, 'is_closed', h.is_closed,
           'open_time', to_char(h.open_time, 'HH24:MI'),
           'close_time', to_char(h.close_time, 'HH24:MI'))
           order by h.weekday, h.open_time nulls first), '[]'::jsonb)
    into v_hours
    from public.business_hours h where h.tenant_id = v_tenant.id;

  -- Chỉ ngày nghỉ CÒN HIỆU LỰC/SẮP TỚI — ngày nghỉ đã qua không có ích cho
  -- khách xem và không cần lộ lịch sử vận hành của tiệm.
  select coalesce(jsonb_agg(jsonb_build_object(
           'date_from', c.date_from, 'date_to', c.date_to, 'reason', c.reason,
           'is_full_day', c.is_full_day,
           'open_time', to_char(c.open_time, 'HH24:MI'),
           'close_time', to_char(c.close_time, 'HH24:MI'))
           order by c.date_from), '[]'::jsonb)
    into v_closures
    from public.business_closures c
    where c.tenant_id = v_tenant.id
      and c.date_to >= (now() at time zone v_tenant.timezone)::date;

  return jsonb_build_object(
    'enabled', true,
    'name', v_tenant.name,
    'intro', v_sf.intro,
    'address', v_sf.address,
    'zalo_contact_url', v_sf.zalo_contact_url,
    'lead_form_enabled', v_sf.lead_form_enabled,
    'lead_form_fields', v_fields,
    'timezone', v_tenant.timezone,
    -- Giờ hiện tại + thứ TẠI TIỆM, kiểu wall-clock không offset — so sánh
    -- trực tiếp với 'hours' ở trên (cũng wall-clock), #88 không cần đụng múi
    -- giờ ở tầng JS.
    'now', (now() at time zone v_tenant.timezone),
    'today_weekday', extract(dow from (now() at time zone v_tenant.timezone))::int,
    'hours', v_hours,
    'closures', v_closures);
end $$;
revoke execute on function public.storefront_view(text) from public;
grant execute on function public.storefront_view(text) to anon, authenticated;

comment on function public.storefront_view(text) is
  'Mặt tiền công khai /t/[slug]. Slug không có VÀ tiệm chưa bật mặt tiền đều ném CÙNG ngoại lệ not_found (#209) — trước đây nhánh thứ hai trả {enabled:false}, đủ để quét từ điển slug ra danh sách khách hàng. Trường ''enabled'' giữ lại trong kết quả cho tầng web cũ, nay luôn là true.';

-- ============================================================
-- LỖ 4 — trang thử /livechat-demo phải kèm CHỨNG CỨ QUYỀN SỞ HỮU
-- ============================================================
--
-- CƠ CHẾ CŨ (migration #55) và vì sao nó hỏng:
--   Tầng web đổi origin của CHÍNH tên miền iFan thành sentinel 'ifan:demo',
--   và hàm này chấp nhận sentinel đó THAY CHO whitelist tên miền, chỉ cần khóa
--   nhúng đúng. Mà khóa nhúng là khóa CÔNG KHAI — nó nằm nguyên văn trong mã
--   HTML trang web của tiệm, ai xem nguồn trang cũng chép được.
--   ⇒ Chép khóa → mở `https://<tên miền iFan>/livechat-demo?key=<khóa>` → chat
--     thẳng vào hộp thư của tiệm TỪ BẤT KỲ MẠNG NÀO. Hàng rào tên miền chỉ là
--     trang trí, và đây là đường vào RẺ NHẤT để đốt hạn mức AI ở LỖ 1.
--
--   Chú thích ở #55 tự trấn an rằng "kẻ gõ curl vốn đã giả được header Origin
--   thành website thật của tiệm, nên sentinel không mở thêm đường tấn công
--   nào". Lập luận đó ĐÚNG với người biết dùng curl và SAI với mọi người còn
--   lại: sentinel biến một cuộc tấn công cần công cụ thành một cái LINK bấm là
--   chạy trên trình duyệt bất kỳ. Hạ rào cản từ "biết giả header" xuống "biết
--   copy-paste" là mở thêm đường tấn công, dù tập kết quả không đổi.
--
-- CƠ CHẾ MỚI: sentinel 'ifan:demo' KHÔNG còn nhận khóa nhúng công khai. Nó chỉ
-- nhận KHÓA THỬ ngắn hạn, do `livechat_demo_start()` phát cho người ĐÃ ĐĂNG
-- NHẬP với vai owner/admin của chính tiệm đó. Khóa thử:
--   · 32 byte ngẫu nhiên (64 hex) — không đoán được, không lộ ở đâu công khai;
--   · sống 30 phút — đủ cho một lượt nhắn thử, không đủ để làm cửa sau;
--   · MỖI TIỆM chỉ giữ MỘT khóa thử đang mở (bấm lại là thay khóa cũ);
--   · nằm trong `channels.config->'demo'`, mà `channels` đã có RLS theo tiệm ⇒
--     người ngoài không đọc được, và KHÔNG sinh thêm bảng/cạnh khoá ngoại nào.
--
-- Khóa nhúng thật + Origin giả 'ifan:demo' ⇒ 'forbidden'.
-- Khóa thử + origin website thật của tiệm ⇒ 'forbidden' (không tra theo
-- embed_key được). Hai loại khóa không dùng chéo nhau được.

create or replace function private.livechat_resolve(
  p_embed_key text,
  p_origin text
) returns public.channels
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_channel public.channels%rowtype;
begin
  if p_embed_key is null or length(p_embed_key) not between 16 and 128 then
    raise exception 'forbidden';
  end if;

  -- NHÁNH TRANG THỬ. Tách hẳn khỏi nhánh thường: tra theo KHÓA THỬ còn hạn,
  -- KHÔNG tra theo embed_key. Đây là chỗ #55 sai — nó dùng chung một phép tra
  -- khóa cho cả hai nhánh rồi chỉ nới điều kiện origin.
  if p_origin = 'ifan:demo' then
    select * into v_channel
      from public.channels
      where type = 'livechat' and status = 'active'
        and config -> 'demo' ->> 'key' = p_embed_key
        and (config -> 'demo' ->> 'expires_at')::timestamptz > now();
    if not found then
      raise exception 'forbidden';
    end if;
    return v_channel;
  end if;

  select * into v_channel
    from public.channels
    where embed_key = p_embed_key and type = 'livechat' and status = 'active';
  if not found then
    raise exception 'forbidden';
  end if;
  -- So khớp TUYỆT ĐỐI (scheme + host + port), không wildcard, không so tiền tố.
  if p_origin is null
     or not (v_channel.config -> 'allowed_origins' ? lower(p_origin)) then
    raise exception 'forbidden';
  end if;
  return v_channel;
end $$;
revoke execute on function private.livechat_resolve(text, text) from public, anon, authenticated;

-- ---------- livechat_demo_start: màn Cài đặt phát khóa thử ngắn hạn ----------
--
-- Chứng cứ quyền sở hữu = PHIÊN ĐĂNG NHẬP tại thời điểm bấm, đối chiếu vai
-- owner/admin đúng bằng phép kiểm của `livechat_setup` (cùng mức quyền: cả hai
-- đều mở một cửa ra internet). Không dùng token tự ký ở tầng Node vì như thế
-- phải đẻ thêm một bí mật môi trường mới và một đường tin cậy thứ hai; hàng
-- trong CSDL thì THU HỒI ĐƯỢC (đổi/hết hạn thấy ngay) còn chữ ký thì không.
--
-- pgcrypto nằm ở schema `extensions` trên Supabase mà hàm này khóa
-- search_path = public → `gen_random_bytes` phải gọi đủ tên schema (bài học #23).
create or replace function public.livechat_demo_start()
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.app_role();
  v_channel public.channels%rowtype;
  v_key text;
  v_expires timestamptz := now() + interval '30 minutes';
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'forbidden';
  end if;

  select * into v_channel
    from public.channels
    where tenant_id = v_tenant and type = 'livechat' and status = 'active';
  if not found then raise exception 'not_found'; end if;

  v_key := encode(extensions.gen_random_bytes(32), 'hex');

  -- Ghi ĐÈ khóa thử cũ: mỗi tiệm chỉ có MỘT cửa thử đang mở tại một thời điểm.
  update public.channels
    set config = coalesce(config, '{}'::jsonb)
                 || jsonb_build_object('demo',
                      jsonb_build_object('key', v_key, 'expires_at', v_expires))
    where id = v_channel.id;

  return jsonb_build_object('demo_key', v_key, 'expires_at', v_expires);
end $$;
revoke execute on function public.livechat_demo_start() from public, anon;
grant execute on function public.livechat_demo_start() to authenticated;

comment on function public.livechat_demo_start() is
  'Phát khóa thử 30 phút cho trang /livechat-demo (#209). Chỉ owner/admin của chính tiệm. Trước đây trang thử chạy bằng KHÓA NHÚNG CÔNG KHAI + origin tên miền iFan, tức ai chép được khóa trong mã trang web của tiệm cũng chat thẳng vào hộp thư tiệm từ bất kỳ mạng nào.';

-- ---------- livechat_demo_check: trang thử tự biết link còn hạn không ----------
--
-- Không có hàm này thì link hết hạn = widget im lặng không lý do, và chủ tiệm
-- ngồi chờ một tin không bao giờ tới (đúng cái bệnh mà `last_event_at` sinh ra
-- để chống). CHỈ trả boolean — không tên tiệm, không cấu hình, không gì khác.
-- Khóa thử là chuỗi 64 hex ngẫu nhiên nên không dò được bằng cách gọi hàm này.
-- service_role thôi: trang thử là server component, gọi bằng service client.
create or replace function public.livechat_demo_check(p_demo_key text)
returns boolean
language sql stable
security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.channels
     where type = 'livechat' and status = 'active'
       and config -> 'demo' ->> 'key' = p_demo_key
       and (config -> 'demo' ->> 'expires_at')::timestamptz > now())
$$;
revoke execute on function public.livechat_demo_check(text) from public, anon, authenticated;
grant execute on function public.livechat_demo_check(text) to service_role;

-- ============================================================
-- LỖ 5 — chống bơm hồ sơ khách: thêm chốt THEO TIỆM, không chỉ theo IP
-- ============================================================
--
-- HAI CHỐT CŨ và vì sao cả hai đều thủng:
--   · Chốt trùng 10 phút theo `token_hash` — token do cookie `ifan_sf_tok` mang
--     lại, mà cookie chỉ TRÌNH DUYỆT THẬT mới tự gửi. Một con bot gọi thẳng
--     server action không gửi cookie nào ⇒ mỗi lượt là "thiết bị mới" ⇒ chốt
--     này bằng không với đúng loại lưu lượng nó sinh ra để chặn.
--   · Chốt 5 lượt/giờ theo `(tiệm, ip_hash)` — 4G Việt Nam đổi IP gần như miễn
--     phí. Xoay IP là nhân số lượt lên tuỳ ý.
-- Mỗi lượt lọt = 1 hàng `contacts` + 1 hàng `activities` GIAO CHO CHỦ TIỆM.
-- Tức không chỉ bẩn danh sách khách mà còn ngập HỘP VIỆC của người thật.
--
-- ⭐ NGƯỠNG 60 LƯỢT/GIỜ MỖI TIỆM — vì sao con số này:
--   · Cận trên của việc thật: form mặt tiền là "để lại số, tiệm gọi lại". Một
--     tiệm nhỏ Việt Nam nhận 60 khách để lại số TRONG MỘT GIỜ là ngày hội,
--     không phải ngày thường. Đặt ngưỡng ở mức đó thì tiệm thật gần như không
--     bao giờ chạm tới.
--   · Cận dưới của việc phá: kịch bản tấn công là hàng nghìn lượt, không phải
--     hàng chục. Chặn ở 60 cắt được ba bậc độ lớn.
--   · Sau khi có chốt này, thiệt hại tối đa còn 60 hàng/giờ thay vì KHÔNG GIỚI
--     HẠN — đó là khác biệt giữa "dọn tay được" và "phải xoá cả bảng".
--
-- ⚠️ CÁI GIÁ ĐÃ BIẾT, ghi ra để người sau không tưởng đây là chốt hoàn hảo:
--   kẻ tấn công có thể giữ tiệm ở trên ngưỡng để form từ chối cả khách THẬT.
--   Đã cân nhắc phương án "quá ngưỡng thì vào hàng chờ duyệt thay vì ghi thẳng"
--   như đề bài gợi ý, và KHÔNG chọn trong đợt này:
--     · Lead nằm trong hàng chờ mà KHÔNG có màn duyệt thì với chủ tiệm nó bằng
--       mất luôn — im lặng nuốt khách thật còn tệ hơn nói thẳng "thử lại sau",
--       vì khách bị từ chối còn biết mà gọi điện, khách bị nuốt thì không.
--     · Màn duyệt là MÀN MỚI ⇒ luật dự án bắt vẽ thẻ design + đẩy Claude Design
--       TRƯỚC khi code (ADR-0024 QĐ-4). Không thể lén thêm trong một bản vá.
--   ⇒ Việc theo dõi: dựng màn "Lead chờ duyệt" rồi đổi nhánh quá-ngưỡng từ
--     'rate_limited' sang xếp hàng. Đến lúc đó ngưỡng có thể hạ xuống thấp hơn
--     nhiều vì hậu quả chặn nhầm không còn là mất khách.
--
-- Chép NGUYÊN VĂN thân hàm từ bản MỚI NHẤT (#201), chỉ THÊM một khối chốt.

-- Chỉ mục cũ `storefront_lead_submissions_flood_idx` là (tenant_id, ip_hash,
-- created_at) VỚI ĐIỀU KIỆN ip_hash is not null — đếm theo tiệm không dùng
-- được nó cho các hàng ip_hash rỗng. Thêm chỉ mục đúng hình dạng câu đếm mới.
create index if not exists storefront_lead_submissions_tenant_flood_idx
  on public.storefront_lead_submissions (tenant_id, created_at desc);

drop function if exists public.storefront_submit_lead(text, text, text, text, text, jsonb, text);

create function public.storefront_submit_lead(
  p_slug text,
  p_token_hash text,
  p_ip_hash text,
  p_full_name text,
  p_phone text,
  p_fields jsonb default '{}'::jsonb,
  p_qr_code text default null
) returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant public.tenants%rowtype := private.storefront_resolve(p_slug);
  v_sf public.tenant_storefront%rowtype;
  v_name text := left(btrim(coalesce(p_full_name, '')), 120);
  v_phone text := btrim(coalesce(p_phone, ''));
  v_e164 text;
  v_now timestamptz := now();
  v_recent int;
  v_dup uuid;
  v_contact public.contacts%rowtype;
  v_source uuid;
  v_catalog jsonb;
  v_custom jsonb := '{}'::jsonb;
  v_key text;
  v_val text;
  v_field jsonb;
  v_owner uuid;
  v_matched boolean := false;
  v_qr text := lower(btrim(coalesce(p_qr_code, '')));
begin
  if v_tenant.id is null then raise exception 'not_found'; end if;

  select * into v_sf from public.tenant_storefront where tenant_id = v_tenant.id;
  if v_sf.tenant_id is null or not v_sf.storefront_enabled or not v_sf.lead_form_enabled then
    raise exception 'form_disabled';
  end if;

  -- Gửi lại trong 10 phút CÙNG THIẾT BỊ (token trình duyệt) → "vừa gửi rồi",
  -- không ghi thêm, không tính vào rate-limit IP (thẻ design man-form-nhan-
  -- khach.html, kết cục #4).
  if p_token_hash is not null then
    select id into v_dup from public.storefront_lead_submissions
      where tenant_id = v_tenant.id and token_hash = p_token_hash
        and created_at > v_now - interval '10 minutes'
      limit 1;
    if v_dup is not null then
      return jsonb_build_object('duplicate', true);
    end if;
  end if;

  if v_name = '' then raise exception 'invalid_request'; end if;
  -- Cùng luật chuẩn hoá SĐT VN đang dùng ở app/app/contacts/actions.ts (toE164).
  if v_phone !~ '^0\d{9,10}$' then raise exception 'invalid_phone'; end if;
  v_e164 := '+84' || substring(v_phone from 2);

  -- Chống lụt theo IP — 5 lượt/giờ mỗi (tiệm, IP), độc lập với chốt token ở trên.
  if p_ip_hash is not null then
    select count(*) into v_recent
      from public.storefront_lead_submissions
      where tenant_id = v_tenant.id and ip_hash = p_ip_hash
        and created_at > v_now - interval '1 hour';
    if v_recent >= 5 then raise exception 'rate_limited'; end if;
  end if;

  -- THÊM Ở #209 — chốt theo TIỆM, không phụ thuộc IP hay cookie.
  -- Đây là chốt DUY NHẤT mà kẻ xoay IP và không gửi cookie vẫn phải đi qua:
  -- hai chốt trên đều lấy khoá đếm từ thứ CHÍNH KẺ GỌI cung cấp (cookie, IP),
  -- còn khoá đếm ở đây lấy từ slug — thứ bắt buộc phải đúng thì mới ghi được
  -- vào tiệm này. Không có tham số nào cho phép lách. Xem lý do chọn ngưỡng và
  -- cái giá phải trả ở đầu khối LỖ 5.
  select count(*) into v_recent
    from public.storefront_lead_submissions
    where tenant_id = v_tenant.id
      and created_at > v_now - interval '1 hour';
  if v_recent >= 60 then raise exception 'rate_limited'; end if;

  -- Lọc câu trả lời "Hỏi thêm": chỉ nhận field ĐÃ BẬT + đúng key catalog của
  -- pack + (nếu là select) đúng một trong các lựa chọn — không tin dữ liệu
  -- thô từ client vãng lai.
  select content -> 'lead_form_fields' into v_catalog
    from public.industry_packs where key = v_tenant.industry;
  for v_field in select * from jsonb_array_elements(coalesce(v_catalog, '[]'::jsonb))
  loop
    v_key := v_field ->> 'key';
    continue when not (coalesce(v_sf.lead_form_fields, '[]'::jsonb) ? v_key);
    v_val := p_fields ->> v_key;
    continue when v_val is null or btrim(v_val) = '';
    v_val := left(btrim(v_val), 200);
    if v_field ->> 'type' = 'select'
       and not (coalesce(v_field -> 'options', '[]'::jsonb) ? v_val) then
      continue;
    end if;
    v_custom := v_custom || jsonb_build_object(v_key, v_val);
  end loop;

  select * into v_contact from public.contacts
    where tenant_id = v_tenant.id and phone_e164 = v_e164
    order by created_at limit 1;

  if v_contact.id is not null then
    -- Trùng SĐT khách cũ → GỘP, không tạo bản ghi trùng. Vô hình với khách
    -- (ADR mục 7): trả về y hệt kết cục "thành công" của khách mới.
    v_matched := true;
    update public.contacts
      set custom = coalesce(custom, '{}'::jsonb) || v_custom,
          last_interaction_at = v_now
      where id = v_contact.id
      returning * into v_contact;

    v_owner := v_contact.owner_id;
    if v_owner is null then
      select m.user_id into v_owner from public.tenant_members m
        where m.tenant_id = v_tenant.id and m.role = 'owner' and m.status = 'active'
        order by m.created_at limit 1;
    end if;
    if v_owner is not null then
      insert into public.activities
          (tenant_id, type, subject, contact_id, owner_id, due_at)
        values (v_tenant.id, 'task', 'Khách cũ quay lại qua form mặt tiền',
                v_contact.id, v_owner, v_now);
    end if;
  else
    -- B06 — dặm cuối của mã QR ở CỬA THỨ HAI (#201). Luật xử lý mã CỐ Ý "MỀM":
    -- ?ifan_qr nằm trên URL, ai cũng sửa được, KHÔNG phải dữ liệu tin cậy. Mã
    -- lạ / sai tiệm / đã tắt / sai định dạng đều rơi xuống nhánh 'Form/Landing'
    -- bên dưới — TUYỆT ĐỐI không trả lỗi. Khối này CHỈ nằm ở nhánh khách MỚI:
    -- khách CŨ không bị đụng source_id, kể cả khi source_id đang trống (điền mã
    -- quét HÔM NAY vào dấu "khách đến từ đâu LẦN ĐẦU" là ghi một phỏng đoán
    -- dưới dạng sự thật, và nó chảy thẳng vào báo cáo quy kết nguồn).
    if v_qr ~ '^[a-z0-9]{8,16}$' then
      select q.source_id into v_source
        from public.qr_codes q
        where q.code = v_qr
          and q.tenant_id = v_tenant.id  -- mã tiệm khác KHÔNG gắn chéo
          and q.is_active;
      -- không thấy → v_source vẫn null: đi tiếp, không lỗi
    end if;

    if v_source is null then
      select id into v_source from public.lead_sources
        where tenant_id = v_tenant.id and name = 'Form/Landing';
    end if;

    insert into public.contacts (tenant_id, full_name, phone, phone_e164, source_id, custom)
      values (v_tenant.id, v_name, v_phone, v_e164, v_source, v_custom)
      returning * into v_contact;

    -- Khách MỚI cũng phải có người nhận việc — khách mới chính là lúc ra tiền,
    -- để nguội là mất thật (#201).
    select m.user_id into v_owner from public.tenant_members m
      where m.tenant_id = v_tenant.id and m.role = 'owner' and m.status = 'active'
      order by m.created_at limit 1;
    if v_owner is not null then
      insert into public.activities
          (tenant_id, type, subject, contact_id, owner_id, due_at)
        values (v_tenant.id, 'task', 'Khách mới để lại thông tin qua form mặt tiền',
                v_contact.id, v_owner, v_now);
    end if;
  end if;

  insert into public.storefront_lead_submissions
      (tenant_id, token_hash, ip_hash, contact_id, matched_existing)
    values (v_tenant.id, p_token_hash, p_ip_hash, v_contact.id, v_matched);

  return jsonb_build_object('duplicate', false, 'matched_existing', v_matched);
end $$;
revoke execute on function public.storefront_submit_lead(text, text, text, text, text, jsonb, text)
  from public;
grant execute on function public.storefront_submit_lead(text, text, text, text, text, jsonb, text)
  to anon, authenticated;

comment on function public.storefront_submit_lead(text, text, text, text, text, jsonb, text) is
  'Form nhận khách ở mặt tiền công khai. BA chốt: trùng 10 phút theo cookie thiết bị · 5 lượt/giờ mỗi (tiệm, IP) · 60 lượt/giờ mỗi TIỆM (#209). Chốt thứ ba là chốt duy nhất kẻ xoay IP và không gửi cookie vẫn phải đi qua.';
