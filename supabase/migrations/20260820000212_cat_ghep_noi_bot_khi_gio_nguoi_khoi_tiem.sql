-- NGƯỜI NGHỈ VIỆC VẪN NHẬN BẢN TIN KINH DOANH QUA BOT — CẮT GHÉP NỐI KHI GỠ NGƯỜI KHỎI TIỆM.
--
-- ═══════════════════════════════════════════════════════════════════
-- LỖ LÀ GÌ
-- ═══════════════════════════════════════════════════════════════════
-- Nhân viên ghép chat Zalo cá nhân vào tiệm bằng mã 6 số; kết quả là một dòng
-- trong `staff_channel_links` (tenant_id, user_id, external_chat_id). Từ đó bot
-- đẩy BẢN TIN KINH DOANH của tiệm về thẳng chat cá nhân đó: số thông báo chưa
-- đọc, số việc quá hạn, tên và giờ của ba việc sát hạn nhất.
--
-- Dòng ghép nối đó được tạo MỘT LẦN rồi thôi. Nó không biết gì về việc người
-- kia còn làm ở tiệm hay không, và **không có đường nào cắt nó** khi người ta
-- bị gỡ khỏi tiệm:
--
--   · Gỡ người khỏi tiệm = `delete from tenant_members` đi thẳng qua policy
--     `members_manage`. KHÔNG có RPC trung gian nào ⇒ không có chỗ nào để nhét
--     lệnh dọn ghép nối vào, ngoài một TRIGGER.
--   · Màn "Cài đặt → Thông báo" chỉ cho CHÍNH CHỦ tự gỡ ghép nối của mình
--     (policy `staff_channel_links_delete` buộc `user_id = auth.uid()`). Người
--     đã nghỉ thì không ai bắt họ bấm nút đó, và chủ tiệm KHÔNG bấm hộ được.
--   · `disconnect_zalo_bot()` cố ý GIỮ `staff_channel_links` lại (chú thích
--     #53: "dán token mới là chạy lại ngay, nhân viên không phải ghép nối
--     lại") — nên cả việc gỡ bot khỏi tiệm cũng không dọn.
--
-- Điều này KHÁC hẳn lỗ "thẻ đăng nhập cũ còn hiệu lực 1 tiếng" (#69). Đường bot
-- KHÔNG đi qua thẻ đăng nhập một chút nào: bản tin do pg_cron soạn, worker phát
-- bằng khoá máy chủ. **Không có gì tự hết hạn.** Không vá thì nó là VĨNH VIỄN.
--
-- ═══════════════════════════════════════════════════════════════════
-- ĐO THẬT TRƯỚC KHI VÁ — CON SỐ, KHÔNG PHẢI SUY LUẬN (20/08)
-- ═══════════════════════════════════════════════════════════════════
-- Đợt soát trước bảo "phần cần vá ở tầng CSDL nằm ở 3 chỗ". Đo lại thì KHÔNG
-- PHẢI 3. Đếm trên chính CSDL đang chạy, hỏi `pg_proc` chứ không đọc file
-- migration (nhiều hàm đã bị `create or replace` đè bởi migration sau, đọc file
-- cũ là đọc nhầm bản không ai chạy):
--
--   Hàm CÒN SỐNG có đọc `staff_channel_links`                    6
--     ├─ bot_answer                    CÓ kiểm tư cách thành viên  ← đã vá ở #121
--     ├─ bot_digest_run                KHÔNG kiểm                  ← LỖ (bản tin)
--     ├─ process_appointment_reminders KHÔNG kiểm                  ← LỖ (nhắc lịch)
--     ├─ bot_link_via_code             KHÔNG kiểm                  ← LỖ (ghép mới)
--     ├─ bot_enqueue_test              đi qua phiên đăng nhập      ← thuộc #69
--     └─ bot_notify_status             đi qua phiên đăng nhập      ← thuộc #69
--   Thêm `bot_claim_outbox` (cửa PHÁT tin, không đọc bảng ghép nối
--     nhưng phát tin đã xếp sẵn)                                   ← LỖ (phát tin)
--
--   Dữ liệu đang có, TỰ ĐẾM chứ không chép theo hồ sơ:
--     staff_channel_links                       0 dòng
--     dòng ghép nối MỒ CÔI (không còn tenant_members)   0 dòng
--     tenant_members                           11 dòng, TẤT CẢ 'active'
--     notification_prefs / bot_outbox            0 / 0 dòng
--
-- ⇒ NÓI THẲNG: lỗ có thật và nằm ở tầng cấu trúc, nhưng **hiện chưa có nạn nhân
--   nào** — tính năng ghép nối bot chưa từng được ai dùng trên CSDL này, và
--   chưa có ai bị gỡ khỏi tiệm. Vá bây giờ là CHẶN TRƯỚC, không phải dọn hậu
--   quả. Câu dọn dòng mồ côi bên dưới vì thế đụng 0 dòng hôm nay — nó nằm đó để
--   bất biến đúng ngay từ đầu, và để bản vá này còn đúng nếu được áp lên một
--   CSDL đã có người dùng thật.
--
-- Dựng lại lỗ trên dữ liệu thật (một giao dịch rồi rollback, mỗi khẳng định một
-- SAVEPOINT riêng): gỡ B khỏi tiệm ⇒ dòng ghép nối của B **vẫn còn**; chạy
-- `bot_digest_run()` ⇒ B **vẫn được xếp bản tin**; `bot_claim_outbox()` ⇒
-- worker **vẫn nhận tin của B để gửi đi**. Bộ kiểm:
-- `node scripts/ghep-noi-bot-smoke.mjs` (kèm 4 phép THÁO CHỐT để chứng minh
-- ca kiểm không rỗng).
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO VÁ KIỂU NÀY CHỨ KHÔNG KIỂU KHÁC
-- ═══════════════════════════════════════════════════════════════════
-- Hai tầng, cố ý làm CẢ HAI:
--
--   ① CẮT TẠI NGUỒN (trigger) — gỡ/đình chỉ người là dòng ghép nối biến mất.
--      Đây là chốt ĐÚNG NGỮ NGHĨA: chat id cá nhân là một thứ giống thẻ ra vào,
--      hết việc thì thu lại, chứ không phải để đó rồi canh cửa mãi mãi.
--   ② CỔNG ĐỌC ở từng đường dùng (bản tin · phát tin · nhắc lịch · ghép mới).
--
-- Chỉ ① thì chưa đủ: trigger chỉ bắt được các lần gỡ TỪ NAY VỀ SAU, còn dòng
-- mồ côi sinh ra trước đó vẫn nằm lại (hôm nay là 0, nhưng bản vá không được
-- phụ thuộc vào con số của riêng hôm nay). Trigger cũng có thể bị vô hiệu bởi
-- `alter table ... disable trigger` trong một migration tương lai, hoặc bị đi
-- vòng bởi một đường ghi mới chưa ai nghĩ tới.
--
-- Chỉ ② cũng chưa đủ: dòng ghép nối còn nằm đó nghĩa là chat id — thứ đóng vai
-- trò như một chiếc chìa — vẫn được giữ vô thời hạn cho một người không còn
-- quan hệ gì với tiệm. Và mỗi đường dùng MỚI viết sau này lại phải nhớ tự
-- gắn cổng; lịch sử của chính lỗ này cho thấy điều đó KHÔNG xảy ra: #121 nhớ
-- gắn cổng cho `bot_answer`, còn `bot_digest_run` và
-- `process_appointment_reminders` thì không ai gắn.
--
-- Đã cân nhắc và BỎ: đặt `expires_at` cho dòng ghép nối rồi bắt ghép lại định
-- kỳ. Bỏ vì nó phiền người đang làm việc (định kỳ bắt nhắn lại mã) mà vẫn để
-- người đã nghỉ nhận bản tin tới hết hạn — sai cả hai đầu.
--
-- GIỮ LẠI `notification_prefs`: bảng đó chỉ chứa sở thích (bật/tắt, giờ nhận),
-- không chứa dữ liệu kinh doanh và không phải chiếc chìa nào cả. Người quay lại
-- làm thì cài đặt cũ còn nguyên — đúng tinh thần chú thích của #53.
--
-- CHÉP NGUYÊN VẸN THÂN HÀM: bốn hàm dưới đây được chép ĐÚNG BẢN ĐANG CHẠY lấy
-- từ `pg_get_functiondef()`, chỉ chèn thêm đúng phần chốt (mỗi chỗ có chú thích
-- "CHỐT #212"). Không viết lại logic — bịa lại thân hàm là loại bug âm thầm
-- nguy hiểm nhất của kiểu migration này, và mấy hàm này đã bị #85/#121/#125 đè
-- nhiều lần nên bản trong file migration gốc KHÔNG còn là bản đang chạy.
--
-- Chuẩn theo #4/#5/#10/#44: definer + `set search_path` ghim `pg_temp` (chốt
-- #40), revoke trước grant.

-- ═══════════════════════════════════════════════════════════════════
-- ① CẮT TẠI NGUỒN — trigger trên tenant_members
-- ═══════════════════════════════════════════════════════════════════

-- VÌ SAO PHẢI `security definer`: trigger chạy với quyền của NGƯỜI GÂY RA lệnh.
-- Chủ tiệm gỡ một nhân viên thì người gây ra lệnh là chủ tiệm, mà policy
-- `staff_channel_links_delete` chỉ cho xoá dòng của CHÍNH MÌNH
-- (`user_id = auth.uid()`). Không có `security definer` thì lệnh xoá bên dưới
-- chạy xong mà **xoá đúng 0 dòng, không báo lỗi gì** — tức là một chốt chặn
-- trông như đang hoạt động nhưng thực ra không làm gì cả, còn tệ hơn không có.
create or replace function public.cat_ghep_noi_bot()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $fn$
begin
  -- Bắt CẢ HAI lối gỡ người: xoá hẳn dòng (DELETE) và gỡ MỀM
  -- (UPDATE status 'active' → 'removed'). Chỉ canh DELETE là hụt đúng một nửa.
  -- Đổi vai owner→staff thì vẫn là người của tiệm ⇒ không đụng.
  if tg_op = 'UPDATE' and new.status = 'active' then
    return new;
  end if;

  delete from public.staff_channel_links
    where tenant_id = old.tenant_id and user_id = old.user_id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $fn$;

comment on function public.cat_ghep_noi_bot is
  'Gỡ/đình chỉ người khỏi tiệm ⇒ cắt ngay ghép nối bot của họ (việc #199). Giữ notification_prefs.';

revoke all on function public.cat_ghep_noi_bot() from public, anon, authenticated;

-- LÚC ÁP: hai lệnh dưới cần ACCESS EXCLUSIVE trên `tenant_members`, tức là phải
-- chờ MỌI giao dịch đang đụng bảng đó xong. Gặp thật khi viết bản vá này: một
-- nhánh khác đang chạy `rls-smoke` giữ RowExclusiveLock ⇒ lệnh nằm chờ tới hết
-- `lock_timeout`. Không phải lỗi của migration — chỉ cần áp lúc không có bộ
-- kiểm nào đang chạy, hoặc áp lại. Bảng nhỏ (11 dòng) nên khoá xong là xong
-- ngay, không có chuyện khoá lâu vì phải quét bảng.
drop trigger if exists tenant_members_cat_ghep_noi_bot on public.tenant_members;
create trigger tenant_members_cat_ghep_noi_bot
  after delete or update of status on public.tenant_members
  for each row execute function public.cat_ghep_noi_bot();

-- Dọn dòng mồ côi đang có (đo được hôm nay: 0 dòng — xem phần ĐO ở đầu file).
-- Không gộp vào trigger được: trigger chỉ bắt các lần gỡ TỪ NAY VỀ SAU.
delete from public.staff_channel_links l
  where not exists (
    select 1 from public.tenant_members tm
     where tm.tenant_id = l.tenant_id and tm.user_id = l.user_id
       and tm.status = 'active'
  );

-- ═══════════════════════════════════════════════════════════════════
-- ② CỔNG ĐỌC — bốn đường dùng ghép nối bot
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.bot_digest_run()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_cap constant int := 3000; -- trần miễn phí của nền tảng bot (3.000 tin/tháng)
  v_now_vn timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  v_today date := v_now_vn::date;
  v_hour int := extract(hour from v_now_vn)::int;
  v_month date := date_trunc('month', v_now_vn)::date;
  -- hết ngày hôm nay theo giờ VN, đổi về timestamptz (cùng cách tính today_queue #45)
  v_day_end timestamptz := ((v_today + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_jobid bigint;
  r record;
  v_n int := 0;
  v_show_unread boolean;
  v_show_today boolean;
  v_show_sla boolean;
  v_unread int;
  v_unread_sla int;
  v_overdue int;
  v_due_today int;
  v_items text;
  v_body text;
  v_has boolean;
begin
  -- Dọn rác mỗi lượt chạy (nhẹ, có index/bảng nhỏ):
  delete from link_codes where expires_at < now() - interval '1 hour';
  delete from bot_outbox
    where status in ('sent', 'failed') and created_at < now() - interval '30 days';
  -- Bản tin chờ quá 2 ngày (tiệm chưa dán token / worker chưa được kích) → bỏ.
  delete from bot_outbox
    where status = 'pending' and created_at < now() - interval '2 days';

  for r in
    select l.tenant_id, l.user_id, l.external_chat_id,
           coalesce(p.pref, '{}'::jsonb) as pref
    from staff_channel_links l
    join notification_channels nc
      on nc.tenant_id = l.tenant_id and nc.kind = 'zalo_bot'
     and nc.token_secret_id is not null
    -- CHỐT #212 — cổng TƯ CÁCH THÀNH VIÊN. Dòng ghép nối là thứ NGƯỜI DÙNG tạo
    -- ra một lần rồi thôi; nó không biết gì về việc người đó còn làm ở đây hay
    -- không. Không có ba dòng này thì bảng ghép nối chính là danh sách nhận,
    -- và danh sách đó không bao giờ tự ngắn lại.
    join public.tenant_members tm
      on tm.tenant_id = l.tenant_id and tm.user_id = l.user_id
     and tm.status = 'active'
    left join notification_prefs p
      on p.tenant_id = l.tenant_id and p.user_id = l.user_id
  loop
    -- Đọc pref PHÒNG THỦ (client chỉ sửa được pref của mình nhưng jsonb tự do):
    -- thiếu/hỏng khóa nào thì dùng mặc định bật + 8 giờ sáng.
    if coalesce(r.pref ->> 'enabled', 'true') <> 'true' then continue; end if;
    if (case when (r.pref ->> 'digest_hour') ~ '^\d{1,2}$'
             then least((r.pref ->> 'digest_hour')::int, 23)
             else 8 end) <> v_hour then
      continue;
    end if;

    -- Vé chống trùng: hôm nay đã có bản tin (kể cả đang chờ gửi) thì thôi —
    -- cron 15 phút chạy 4 lần trong khung giờ nhưng chỉ lần đầu xếp tin.
    if exists (
      select 1 from bot_outbox o
        where o.tenant_id = r.tenant_id and o.user_id = r.user_id
          and o.dedupe_key = 'digest:' || v_today
    ) then
      continue;
    end if;

    -- Quota: chạm trần là DỪNG + rung chuông #44, không chết ngầm.
    if coalesce((
      select q.sent_count from channel_quota q
        where q.tenant_id = r.tenant_id and q.month = v_month
    ), 0) >= c_cap then
      select jobid into v_jobid from cron.job where jobname = 'zalo-bot-digest';
      if v_jobid is not null then
        insert into system_alerts
            (job_id, job_name, first_failed_at, last_failed_at, fail_count, detail)
          values
            (v_jobid, 'zalo-bot-digest', now(), now(), 1,
             'Tiệm ' || r.tenant_id || ' chạm trần ' || c_cap
               || ' tin Zalo Bot trong tháng — bản tin tạm dừng tới đầu tháng sau.')
          on conflict (job_id) where acknowledged_at is null
          do update set
            last_failed_at = excluded.last_failed_at,
            fail_count     = system_alerts.fail_count + 1,
            detail         = excluded.detail;
      end if;
      continue;
    end if;

    v_show_unread := coalesce(r.pref #>> '{kinds,unread}', 'true') = 'true';
    v_show_today  := coalesce(r.pref #>> '{kinds,today}',  'true') = 'true';
    v_show_sla    := coalesce(r.pref #>> '{kinds,sla}',    'true') = 'true';

    -- Thông báo chưa đọc (7 ngày gần nhất — không kéo cả núi thông báo cũ).
    select count(*), count(*) filter (where n.type = 'sla')
      into v_unread, v_unread_sla
      from notifications n
      where n.tenant_id = r.tenant_id and n.user_id = r.user_id
        and n.read_at is null and n.created_at > now() - interval '7 days';

    -- Việc CÓ HẠN của tôi — cùng định nghĩa với today_queue (#45): activity chưa
    -- xong có due_at + deal mở có next_action_at.
    select
      count(*) filter (where x.at < now()),
      count(*) filter (where x.at >= now() and x.at < v_day_end)
      into v_overdue, v_due_today
      from (
        select a.due_at as at from activities a
          where a.tenant_id = r.tenant_id and a.owner_id = r.user_id
            and a.done_at is null and a.due_at is not null and a.due_at < v_day_end
        union all
        select d.next_action_at from deals d
          where d.tenant_id = r.tenant_id and d.owner_id = r.user_id
            and d.deleted_at is null and d.status = 'open'
            and d.next_action_at is not null and d.next_action_at < v_day_end
      ) x;

    -- 3 việc sát hạn nhất, kèm giờ VN — đủ để biết cầm máy gọi ai trước.
    select string_agg(y.line, E'\n' order by y.at) into v_items from (
      select z.at,
             '  · ' || z.title || ' (' ||
             to_char(z.at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ')' as line
      from (
        select coalesce(nullif(a.subject, ''), a.type) as title, a.due_at as at
          from activities a
          where a.tenant_id = r.tenant_id and a.owner_id = r.user_id
            and a.done_at is null and a.due_at is not null and a.due_at < v_day_end
        union all
        select d.title, d.next_action_at from deals d
          where d.tenant_id = r.tenant_id and d.owner_id = r.user_id
            and d.deleted_at is null and d.status = 'open'
            and d.next_action_at is not null and d.next_action_at < v_day_end
        order by at asc
        limit 3
      ) z
    ) y;

    -- Ghép bản tin — tiếng Việt (thị trường chính; nội dung notification trong
    -- DB cũng là tiếng Việt). Route sẽ nối thêm link mở app khi gửi.
    v_body := 'iFan — nhắc việc ngày ' || to_char(v_now_vn, 'DD/MM');
    v_has := false;

    if v_show_unread and v_unread > 0 then
      v_body := v_body || E'\n' || '• Thông báo chưa đọc: ' || v_unread;
      if v_show_sla and v_unread_sla > 0 then
        v_body := v_body || ' (có ' || v_unread_sla || ' cảnh báo trễ hẹn)';
      end if;
      v_has := true;
    elsif v_show_sla and v_unread_sla > 0 then
      -- Tắt mục "chưa đọc" nhưng vẫn muốn nghe cảnh báo SLA.
      v_body := v_body || E'\n' || '• Cảnh báo trễ hẹn chưa đọc: ' || v_unread_sla;
      v_has := true;
    end if;

    if v_show_today and (v_overdue > 0 or v_due_today > 0) then
      v_body := v_body || E'\n' || '• Việc quá hạn: ' || v_overdue
                || ' — đến hạn hôm nay: ' || v_due_today;
      if v_items is not null then
        v_body := v_body || E'\n' || v_items;
      end if;
      v_has := true;
    end if;

    -- Không có gì đáng báo → không gửi (tiết kiệm quota, không làm phiền).
    if not v_has then continue; end if;

    insert into bot_outbox
        (tenant_id, user_id, external_chat_id, kind, dedupe_key, body)
      values
        (r.tenant_id, r.user_id, r.external_chat_id, 'digest',
         'digest:' || v_today, left(v_body, 1900))
      on conflict (tenant_id, user_id, dedupe_key) do nothing;
    v_n := v_n + 1;
  end loop;

  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.bot_claim_outbox(p_key text, p_batch integer DEFAULT 20)
 RETURNS TABLE(o_id bigint, o_chat text, o_kind text, o_body text, o_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_temp'
AS $function$
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;
  if p_batch is null or p_batch < 1 or p_batch > 100 then
    raise exception 'invalid_input';
  end if;

  -- Vé đã cháy hết lượt thử mà vẫn kẹt 'sending' → chốt failed (không claim lại).
  update public.bot_outbox o
    set status = 'failed', last_error = coalesce(o.last_error, 'max_attempts')
    where o.status = 'sending'
      and o.claimed_at < now() - interval '10 minutes'
      and o.attempts >= 5;

  -- CHỐT #212 — chặn ở CỬA PHÁT. Tin được xếp lúc người ta còn là thành viên
  -- vẫn nằm trong hàng đợi tới 2 ngày; không có đoạn này thì bản tin cuối cùng
  -- vẫn bay đi SAU khi người ta đã nghỉ. Chốt hẳn 'failed' chứ không để
  -- 'pending' nằm lại — bỏ lửng thì hàng đợi phình ra vĩnh viễn và không ai
  -- đọc được vì sao tin không đi.
  update public.bot_outbox o
    set status = 'failed', last_error = 'not_member'
    where o.status in ('pending', 'sending')
      and not exists (
        select 1 from public.tenant_members tm
         where tm.tenant_id = o.tenant_id and tm.user_id = o.user_id
           and tm.status = 'active'
      );

  return query
  with pick as (
    select o.id
    from public.bot_outbox o
    join public.notification_channels nc
      on nc.tenant_id = o.tenant_id and nc.kind = 'zalo_bot'
     and nc.token_secret_id is not null
    where (o.status = 'pending'
           or (o.status = 'sending' and o.claimed_at < now() - interval '10 minutes'))
      and o.attempts < 5
    order by o.id
    limit p_batch
    for update of o skip locked
  ),
  claimed as (
    update public.bot_outbox o
      set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
      where o.id in (select p.id from pick p)
      returning o.id, o.tenant_id, o.external_chat_id, o.kind, o.body
  )
  select c.id, c.external_chat_id, c.kind, c.body,
         (select ds.decrypted_secret from vault.decrypted_secrets ds
            where ds.name = 'bot:' || nc.id || ':token')
  from claimed c
  join public.notification_channels nc
    on nc.tenant_id = c.tenant_id and nc.kind = 'zalo_bot';
end $function$;

CREATE OR REPLACE FUNCTION public.bot_link_via_code(p_key text, p_channel uuid, p_chat_id text, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_temp'
AS $function$
declare
  v_ch record;
  v_token text;
  v_row record;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  select id, tenant_id into v_ch from public.notification_channels
    where id = p_channel and kind = 'zalo_bot';
  if v_ch.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select ds.decrypted_secret into v_token from vault.decrypted_secrets ds
    where ds.name = 'bot:' || v_ch.id || ':token';

  if p_chat_id is null or length(p_chat_id) < 1 or length(p_chat_id) > 128
     or p_code is null or btrim(p_code) !~ '^\d{6}$' then
    return jsonb_build_object('status', 'invalid', 'bot_token', v_token);
  end if;

  delete from public.link_codes where expires_at < now();

  -- Mã phải thuộc ĐÚNG tenant của bot nhận tin — mã tiệm khác không ghép được
  -- (chặn nhầm lẫn cross-tenant khi một người làm ở hai tiệm).
  select code, tenant_id, user_id into v_row from public.link_codes
    where code = btrim(p_code) and tenant_id = v_ch.tenant_id and expires_at >= now();
  if v_row.code is null then
    return jsonb_build_object('status', 'invalid', 'bot_token', v_token);
  end if;

  -- CHỐT #212 — mã ghép nối sống 10 phút. Người bị gỡ khỏi tiệm trong 10 phút
  -- đó vẫn đang cầm một mã HỢP LỆ, nên không có cửa này thì họ ghép lại được
  -- ngay sau khi vừa bị gỡ, và mọi chốt phía sau lại phải chặn từ đầu.
  if not exists (
    select 1 from public.tenant_members tm
     where tm.tenant_id = v_row.tenant_id and tm.user_id = v_row.user_id
       and tm.status = 'active'
  ) then
    return jsonb_build_object('status', 'not_member', 'bot_token', v_token);
  end if;

  insert into public.staff_channel_links (tenant_id, user_id, external_chat_id)
    values (v_row.tenant_id, v_row.user_id, p_chat_id)
    on conflict (tenant_id, user_id)
    do update set external_chat_id = excluded.external_chat_id, linked_at = now();

  delete from public.link_codes where code = v_row.code;

  return jsonb_build_object('status', 'linked', 'bot_token', v_token);
end $function$;

CREATE OR REPLACE FUNCTION public.process_appointment_reminders(p_batch integer DEFAULT 200)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_lead_minutes constant int := 60; -- khớp cadence cron 15 phút: nhắc trước 45–60 phút
  c_cap constant int := 3000;        -- trần Zalo Bot miễn phí/tháng, CHUNG bảng đếm với digest (#54)
  v_month date := date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date;
  r record;
  v_time text;
  v_service text;
  v_draft text;
  v_conv_id uuid;
  v_link text;
  v_chat_id text;
  v_quota_left boolean;
  v_jobid bigint;
  v_n int := 0;
begin
  for r in
    select a.id, a.tenant_id, a.contact_id, a.staff_user_id, a.start_at,
           ct.full_name as contact_name,
           coalesce(s.name, 'dịch vụ đã đặt') as service_name,
           t.timezone
    from public.appointments a
    join public.contacts ct on ct.id = a.contact_id
    join public.tenants t on t.id = a.tenant_id
    left join public.items s on s.id = a.item_id
    where a.status = 'booked'
      and a.deleted_at is null
      and a.reminded_at is null
      and a.start_at > now()
      and a.start_at <= now() + make_interval(mins => c_lead_minutes)
    order by a.start_at
    limit p_batch
  loop
    v_time := to_char(r.start_at at time zone r.timezone, 'HH24:MI');
    v_service := r.service_name;
    -- Soạn sẵn — xưng "tiệm", gọi thẳng tên khách (không chêm anh/chị: máy
    -- không đoán giới), cùng tông với success.draftMessage của việc 5.
    v_draft := 'Dạ tiệm nhắc ' || r.contact_name || ' có lịch hẹn ' || v_service
      || ' lúc ' || v_time || ' hôm nay nha. Hẹn gặp ' || r.contact_name || '!';

    -- Hội thoại gần nhất của khách (nếu có) — link mở THẲNG đúng khung chat,
    -- đúng ADR mục 3 "qua đúng khung chat đang mở". Ca đặt từ màn Lịch
    -- (source='calendar') có thể chưa từng có hội thoại nào → về /app/calendar.
    select cv.id into v_conv_id
      from public.conversations cv
      where cv.tenant_id = r.tenant_id and cv.contact_id = r.contact_id
      order by cv.last_message_at desc nulls last
      limit 1;
    v_link := case when v_conv_id is not null
                   then '/app/inbox?c=' || v_conv_id::text
                   else '/app/calendar' end;

    -- 1) Chuông trong app — bắn ngay, chứa sẵn tin gợi ý gửi khách.
    insert into public.notifications (tenant_id, user_id, type, title, body, link)
    values (
      r.tenant_id, r.staff_user_id, 'appointment_reminder',
      'Sắp tới: ' || v_service || ' lúc ' || v_time,
      r.contact_name || ' — ' || v_service || ' lúc ' || v_time || E'\n\n'
        || '— Tin gợi ý gửi khách —' || E'\n' || v_draft,
      v_link);

    -- 2) Zalo Bot — chỉ khi nhân viên đã ghép nối bot VÀ tiệm chưa chạm trần
    -- quota tháng. dedupe_key theo appointment_id: job chạy lại/kẹt lưới
    -- không dội bom hai tin cho cùng một ca.
    select l.external_chat_id into v_chat_id
      from public.staff_channel_links l
      join public.notification_channels nc
        on nc.tenant_id = l.tenant_id and nc.kind = 'zalo_bot'
       and nc.token_secret_id is not null
      join public.tenant_members tm
        on tm.tenant_id = l.tenant_id and tm.user_id = l.user_id
       and tm.status = 'active'
      where l.tenant_id = r.tenant_id and l.user_id = r.staff_user_id;

    if v_chat_id is not null then
      v_quota_left := coalesce((
        select q.sent_count from public.channel_quota q
          where q.tenant_id = r.tenant_id and q.month = v_month
      ), 0) < c_cap;

      if v_quota_left then
        insert into public.bot_outbox
            (tenant_id, user_id, external_chat_id, kind, dedupe_key, body)
          values (
            r.tenant_id, r.staff_user_id, v_chat_id, 'appointment_reminder',
            'appt_reminder:' || r.id::text,
            'iFan nhắc: ' || r.contact_name || ' — ' || v_service || ' lúc ' || v_time
              || ' hôm nay. Mở app xem tin soạn sẵn gửi khách.')
          on conflict (tenant_id, user_id, dedupe_key) do nothing;
      else
        -- Chạm trần: dừng nhắc qua Zalo + rung chuông cho platform admin
        -- (#44), KHÔNG chết ngầm. Chuông trong app cho nhân viên (bước 1)
        -- vẫn chạy bình thường — chỉ kênh Zalo bị dừng.
        select jobid into v_jobid from cron.job where jobname = 'process-appointment-reminders';
        if v_jobid is not null then
          insert into public.system_alerts
              (job_id, job_name, first_failed_at, last_failed_at, fail_count, detail)
            values
              (v_jobid, 'process-appointment-reminders', now(), now(), 1,
               'Tiệm ' || r.tenant_id || ' chạm trần ' || c_cap
                 || ' tin Zalo Bot trong tháng — nhắc lịch qua Zalo tạm dừng tới đầu tháng sau (chuông trong app vẫn chạy).')
            on conflict (job_id) where acknowledged_at is null
            do update set
              last_failed_at = excluded.last_failed_at,
              fail_count     = system_alerts.fail_count + 1,
              detail         = excluded.detail;
        end if;
      end if;
    end if;

    update public.appointments set reminded_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;

  return v_n;
end $function$;

-- `create or replace function` GIỮ NGUYÊN quyền cũ, nên khối revoke/grant dưới
-- đây không đổi gì trên CSDL đang chạy. Viết lại cho đủ để migration còn đúng
-- khi được replay lên một CSDL dựng mới, và để đọc file là thấy ngay ai gọi
-- được hàm nào (quy ước revoke-trước-grant của kho).
revoke all on function public.bot_digest_run() from public, anon, authenticated;

revoke all on function public.bot_claim_outbox(text, int) from public;
grant execute on function public.bot_claim_outbox(text, int) to anon, authenticated;

revoke all on function public.bot_link_via_code(text, uuid, text, text) from public;
grant execute on function public.bot_link_via_code(text, uuid, text, text) to anon, authenticated;

revoke all on function public.process_appointment_reminders(int) from public, anon, authenticated;

comment on table public.staff_channel_links is
  'Ghép nối nhân viên với chat Zalo cá nhân (qua mã /link). Mỗi người một chat mỗi tiệm. Bị CẮT NGAY khi người đó bị gỡ/đình chỉ khỏi tiệm (trigger tenant_members_cat_ghep_noi_bot, việc #199).';
