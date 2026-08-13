-- Migration #102 — mỗi chủ đề có luồng tin tự động PHÙ HỢP với chính nó.
--
-- Founder 13/08: *"Tin tự động về đây — làm phù hợp tự động với từng chủ đề"*.
-- Bản ghim đang ghi "Không có" ở 5/8 chủ đề, nhìn là biết làm chưa tới.
--
-- SOÁT NGUỒN THẬT trước khi thiết kế (không dựng đường ống cho dòng nước chưa
-- tồn tại — nguyên tắc đã tự đặt ở đợt trước):
--   · "Lỗi"       ← có nguồn: 4 bảng đều có trạng thái hỏng (biên nhận webhook,
--                   3 hàng đợi gửi tin). Hiện 0 lỗi — đó là tin tốt, KHÔNG
--                   phải "không có nguồn".
--   · "Thông báo" ← có nguồn: mã bản triển khai + số liệu nền tảng hằng ngày.
--   · "Tính Năng" ← có nguồn: sổ đăng ký tính năng, so trạng thái với lần trước.
--   · General · Ý tưởng · Hỏi đáp ← KHÔNG có, và KHÔNG NÊN có. Đây là ba chỗ
--     người nói chuyện với nhau; nhét tin máy vào là chìm hết chuyện người.
--     Ghi rõ điều này thay vì để trống cho có.

-- ── 0. VÁ LỖ TIỀM ẨN bắt được khi soát trước khi viết ──────────────────────
--
-- `platform_notify` đang ĐỨNG YÊN nếu chưa ghép bot Zalo — luật viết từ hồi
-- Zalo là kênh duy nhất. Nay founder trực trên Telegram: ngắt Zalo một cái là
-- MỌI cảnh báo ngừng được tạo ra, và không ai biết vì nó im lặng đúng theo
-- thiết kế cũ. Chưa nổ vì Zalo vẫn đang ghép, nhưng đó là mìn chờ.
--
-- Sửa: còn BẤT KỲ đường nào nhận được thì vẫn ghi — Zalo đã ghép, HOẶC có
-- người đã nối tài khoản Telegram. Không đường nào thì vẫn đứng yên (giữ
-- nguyên ý định cũ: không đẻ dòng cho nơi không ai nhận).
create or replace function public.platform_notify(
  p_kind text, p_dedupe_key text, p_body text
)
returns void
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
begin
  if (select value from private.app_config where key = 'platform_bot_chat_id') is null
     and not exists (
       select 1 from public.user_telegram_links l
        join public.tenant_members m
          on m.user_id = l.user_id and m.status = 'active' and m.role in ('owner','admin')
     ) then
    return;
  end if;

  insert into public.platform_outbox (kind, dedupe_key, body)
    values (p_kind, p_dedupe_key, p_body)
  on conflict (dedupe_key) do nothing;
end $$;

alter table public.platform_outbox drop constraint if exists platform_outbox_kind_check;
alter table public.platform_outbox add constraint platform_outbox_kind_check
  check (kind in ('help_request','system_alert','tenant_signup',
                  'user_failure','release','feature_change','daily_pulse'));

update public.tg_topics set feeds = '{user_failure}', updated_at = now()
 where chat_id = '-1004299451961' and thread_id = 5;    -- Lỗi
update public.tg_topics set feeds = '{release,daily_pulse}', updated_at = now()
 where chat_id = '-1004299451961' and thread_id = 8;    -- Thông báo
update public.tg_topics set feeds = '{feature_change}', updated_at = now()
 where chat_id = '-1004299451961' and thread_id = 2;    -- Tính Năng

-- ── 1. "Lỗi" ← thất bại ẢNH HƯỞNG NGƯỜI DÙNG ────────────────────────────────

/**
 * Quét các thất bại mà NGƯỜI DÙNG chịu hậu quả, rồi báo một lần cho mỗi đợt.
 *
 * Khác `system_alerts` (việc chạy nền hỏng → chủ đề Kỹ thuật): ở đây là tin
 * của người thật không tới nơi — biên nhận webhook xử hỏng (tin khách mất),
 * hàng đợi gửi thất bại (thông báo không tới tay ai).
 *
 * Trước đó KHÔNG AI ĐỌC mấy cột trạng thái này. Một tin khách xử hỏng nằm im
 * trong bảng, không ai biết — đúng loại thất bại im lặng dự án cấm.
 *
 * Chống báo lặp bằng MỰC NƯỚC: chỉ đếm dòng mới hơn lần quét trước. Không có
 * mực nước thì mỗi 15 phút lại báo y hệt, và cảnh báo lặp là cảnh báo bị bỏ qua.
 */
create or replace function public.scan_user_failures()
returns int
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_since timestamptz;
  v_now timestamptz := now();
  v_webhook int;
  v_bot int;
  v_platform int;
  v_bridge int;
  v_total int;
  v_body text;
begin
  -- Ép kiểu an toàn: giá trị rác trong bảng cấu hình mà ném lỗi thì cả hàm
  -- chết, và việc soát lỗi lại thành thứ im lặng không chạy.
  begin
    select value::timestamptz into v_since
      from private.app_config where key = 'user_failure_mark';
  exception when others then
    v_since := null;
  end;
  if v_since is null then v_since := v_now - interval '1 hour'; end if;

  select count(*) into v_webhook from public.webhook_events
   where error is not null and processed_at > v_since;
  select count(*) into v_bot from public.bot_outbox
   where status = 'failed' and coalesce(sent_at, claimed_at, created_at) > v_since;
  select count(*) into v_platform from public.platform_outbox
   where status = 'failed' and coalesce(sent_at, claimed_at, created_at) > v_since;
  select count(*) into v_bridge from public.tg_bridge_queue
   where status = 'failed' and coalesce(done_at, created_at) > v_since;

  v_total := v_webhook + v_bot + v_platform + v_bridge;

  -- Dời mực nước DÙ CÓ HAY KHÔNG có lỗi: không dời thì lần sau đếm lại đúng
  -- đợt cũ và báo trùng mãi.
  insert into private.app_config (key, value) values ('user_failure_mark', v_now::text)
  on conflict (key) do update set value = excluded.value;

  if v_total = 0 then return 0; end if;

  v_body := '⚠️ ' || v_total || ' việc hỏng ảnh hưởng người dùng (kể từ lần soát trước)';
  if v_webhook > 0 then v_body := v_body || E'\n· ' || v_webhook || ' tin khách xử lý hỏng'; end if;
  if v_bot > 0 then v_body := v_body || E'\n· ' || v_bot || ' thông báo nhân viên không gửi được'; end if;
  if v_platform > 0 then v_body := v_body || E'\n· ' || v_platform || ' chuông báo không gửi được'; end if;
  if v_bridge > 0 then v_body := v_body || E'\n· ' || v_bridge || ' câu hỏi bot trả lời hỏng'; end if;

  perform public.platform_notify('user_failure', 'fail:' || v_now::text, v_body);
  return v_total;
end $$;

revoke all on function public.scan_user_failures() from public;

select cron.schedule('scan-user-failures', '*/15 * * * *',
  'select public.scan_user_failures()');

-- ── 2. "Thông báo" ← bản tin hằng ngày ──────────────────────────────────────

/**
 * Một dòng mỗi ngày: hôm nay có gì đáng biết.
 *
 * Chỉ gửi khi CÓ chuyện. Ngày im ắng mà vẫn "hôm nay 0 tiệm mới, 0 câu hỏi" là
 * dạy người ta bỏ qua chủ đề Thông báo — đúng nguyên tắc đã dùng cho /trangthai.
 */
create or replace function public.daily_pulse()
returns boolean
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                             at time zone 'Asia/Ho_Chi_Minh';
  v_tenants int;
  v_contacts int;
  v_asks int;
  v_help int;
  v_body text;
begin
  select count(*) into v_tenants from public.tenants
   where deleted_at is null and coalesce(is_sample,false) = false and created_at >= v_day_start;
  select count(*) into v_contacts from public.contacts
   where deleted_at is null and created_at >= v_day_start;
  select count(*) into v_asks from public.tg_bridge_queue where created_at >= v_day_start;
  select count(*) into v_help from public.help_requests where created_at >= v_day_start;

  if v_tenants = 0 and v_contacts = 0 and v_help = 0 then return false; end if;

  v_body := '📅 Hôm nay ở iFan';
  if v_tenants > 0 then v_body := v_body || E'\n· ' || v_tenants || ' tiệm mới đăng ký'; end if;
  if v_contacts > 0 then v_body := v_body || E'\n· ' || v_contacts || ' khách hàng mới'; end if;
  if v_help > 0 then v_body := v_body || E'\n· ' || v_help || ' yêu cầu Cần giúp'; end if;
  if v_asks > 0 then v_body := v_body || E'\n· ' || v_asks || ' câu hỏi gửi bot'; end if;

  perform public.platform_notify('daily_pulse',
    'pulse:' || to_char(v_day_start, 'YYYY-MM-DD'), v_body);
  return true;
end $$;

revoke all on function public.daily_pulse() from public;

-- 20:00 giờ Việt Nam = 13:00 UTC — cuối ngày làm việc, không phải giữa đêm.
select cron.schedule('daily-pulse', '0 13 * * *', 'select public.daily_pulse()');

-- ── 3. "Thông báo" + "Tính Năng" ← bản mới lên & mảng đổi trạng thái ────────

/**
 * Máy chủ khai mã bản vừa triển khai + bảng trạng thái các mảng; hàm này so
 * với lần trước và báo NHỮNG GÌ ĐỔI.
 *
 * Đặt ở CSDL chứ không ở tầng ứng dụng vì phải so-và-ghi trong MỘT bước: hai
 * lượt chạy song song (cron 15 phút + lượt gọi tay) mà đọc rồi mới ghi thì cả
 * hai cùng thấy "có bản mới" và báo hai lần.
 */
create or replace function public.tg_release_mark(
  p_key text, p_sha text, p_features jsonb
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_old_sha text;
  v_old_features jsonb;
  v_changed jsonb;
  v_new_release boolean := false;
  v_lines text := '';
  r record;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;
  if p_sha is null or p_sha = '' then return jsonb_build_object('skipped', true); end if;

  select value into v_old_sha from private.app_config where key = 'release_sha' for update;
  select value::jsonb into v_old_features from private.app_config where key = 'feature_map';

  if v_old_sha is distinct from p_sha then
    v_new_release := true;
    insert into private.app_config (key, value) values ('release_sha', p_sha)
      on conflict (key) do update set value = excluded.value;
  end if;

  -- Lần đầu chưa có bảng cũ: CHỈ ghi lại, không báo. Báo thì hoá ra "28 mảng
  -- vừa đổi trạng thái" trong khi chẳng có gì đổi cả.
  if v_old_features is null then
    insert into private.app_config (key, value) values ('feature_map', p_features::text)
      on conflict (key) do update set value = excluded.value;
  elsif v_old_features is distinct from p_features then
    -- Duyệt HỢP của hai bên, không chỉ bên mới: chỉ duyệt bên mới thì một mảng
    -- bị GỠ khỏi sổ đăng ký sẽ biến mất không ai hay.
    for r in
      select t.k,
             v_old_features ->> t.k as cu,
             p_features ->> t.k as moi
        from (
          select jsonb_object_keys(p_features) as k
          union
          select jsonb_object_keys(v_old_features)
        ) t
       where v_old_features ->> t.k is distinct from p_features ->> t.k
       order by t.k
    loop
      v_lines := v_lines || E'\n· ' || r.k || ': ' ||
                 coalesce(r.cu, 'mới') || ' → ' || coalesce(r.moi, 'đã gỡ');
    end loop;
    insert into private.app_config (key, value) values ('feature_map', p_features::text)
      on conflict (key) do update set value = excluded.value;
  end if;

  if v_new_release and v_old_sha is not null then
    perform public.platform_notify('release', 'rel:' || p_sha,
      '🚀 Bản mới đã lên — ' || left(p_sha, 7));
  end if;

  if v_lines <> '' then
    perform public.platform_notify('feature_change', 'feat:' || p_sha,
      '✨ Trạng thái mảng vừa đổi:' || v_lines);
  end if;

  return jsonb_build_object('release', v_new_release and v_old_sha is not null,
                            'features_changed', v_lines <> '');
end $$;

revoke all on function public.tg_release_mark(text, text, jsonb) from public;
grant execute on function public.tg_release_mark(text, text, jsonb) to anon, authenticated;
