-- Migration #96 — nối tài khoản Telegram với tài khoản iFan.
--
-- Founder chốt 13/08: *"Liên kết và đồng bộ user telegram và user iFan."*
--
-- VÌ SAO CẦN: hiện quyền trong bot xác định bằng **một danh sách mã số gõ tay
-- trong biến môi trường** (`TELEGRAM_OWNER_IDS`). Cách đó không lớn lên được:
-- thêm một người là phải sửa cấu hình rồi triển khai lại, và không ai biết mã
-- số 667364227 là ai khi đọc nhật ký ba tháng sau. Nối vào tài khoản thật thì
-- quyền đi theo VAI TRÒ đã có trong iFan, và nhật ký đọc ra tên người.
--
-- CÁCH NỐI — MÃ MỘT LẦN, HẠN 10 PHÚT, do người đã đăng nhập tự bấm:
--   1. Trong iFan (đã đăng nhập) bấm "Liên kết Telegram" → hiện mã 6 chữ.
--   2. Nhắn `/lienket <mã>` cho bot.
--   3. Bot khớp mã → nối.
--
-- Vì sao đi chiều này chứ không phải nhập mã số Telegram vào ô cài đặt: bước 2
-- **chứng minh người đó thật sự cầm tài khoản Telegram kia**. Gõ tay mã số thì
-- ai cũng gõ được mã số của người khác — tự nhận mình là chủ dự án.
--
-- Mã sinh phía CSDL chứ không phía trình duyệt: mã do trình duyệt sinh là thứ
-- người dùng tự đặt được, tức là tự cấp quyền cho mình.

create table if not exists public.user_telegram_links (
  user_id           uuid        primary key references auth.users (id) on delete cascade,
  telegram_user_id  text        not null unique,
  telegram_username text,
  linked_at         timestamptz not null default now()
);

alter table public.user_telegram_links enable row level security;

-- Chỉ đọc được liên kết CỦA CHÍNH MÌNH. Không có policy ghi: mọi thay đổi đi
-- qua RPC bên dưới, để bước xác thực mã không bị đi vòng.
drop policy if exists user_telegram_links_self_select on public.user_telegram_links;
create policy user_telegram_links_self_select on public.user_telegram_links
  for select using (user_id = auth.uid());

comment on table public.user_telegram_links is
  'Nối tài khoản Telegram với tài khoản iFan. Quyền của bot đọc từ vai trò thật thay vì danh sách mã số gõ tay.';

create table if not exists private.telegram_link_codes (
  code       text        primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table private.telegram_link_codes is
  'Mã nối tài khoản dùng một lần. Nằm ở schema private: đây là vật chứng danh tính, lộ ra là người khác nối nhầm vào tài khoản mình.';

/**
 * Sinh mã nối cho NGƯỜI ĐANG ĐĂNG NHẬP. Không nhận tham số user_id — nhận thì
 * ai cũng xin được mã của người khác.
 */
create or replace function public.tg_link_code()
returns text
language plpgsql
volatile
security definer set search_path = pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;

  -- Dọn mã cũ của chính người này: mỗi người chỉ có MỘT mã còn hiệu lực, bấm
  -- lại là mã cũ chết. Tránh cảnh vài mã cùng sống rồi không biết mã nào thật.
  delete from private.telegram_link_codes where user_id = v_uid;

  -- 6 chữ số, đọc qua điện thoại được. Ngắn nhưng an toàn nhờ hạn 10 phút +
  -- một mã một người + chặn đoán mò ở tầng cổng vào.
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  insert into private.telegram_link_codes (code, user_id, expires_at)
    values (v_code, v_uid, now() + interval '10 minutes')
  on conflict (code) do update
    set user_id = excluded.user_id, expires_at = excluded.expires_at, created_at = now();

  return v_code;
end $$;

/** Bot gọi khi ai đó nhắn `/lienket <mã>`. Trả tên người để bot xưng hô đúng. */
create or replace function public.tg_link_confirm(
  p_key text,
  p_code text,
  p_tg_user text,
  p_tg_username text
)
returns jsonb
language plpgsql
volatile
security definer set search_path = pg_temp as $$
declare
  v_uid uuid;
  v_name text;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  delete from private.telegram_link_codes
   where code = btrim(p_code) and expires_at > now()
   returning user_id into v_uid;

  -- Mã sai/hết hạn: trả về kết quả BÌNH THƯỜNG chứ không ném lỗi — người gõ
  -- nhầm cần một câu tử tế, không phải lỗi kỹ thuật.
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  insert into public.user_telegram_links (user_id, telegram_user_id, telegram_username)
    values (v_uid, p_tg_user, left(p_tg_username, 100))
  -- Nối lại tài khoản Telegram khác cho cùng một người iFan, hoặc cùng một
  -- Telegram nối sang người iFan khác — cả hai đều ghi đè, KHÔNG báo lỗi:
  -- người ta đổi máy, đổi tài khoản là chuyện thường.
  on conflict (user_id) do update
    set telegram_user_id = excluded.telegram_user_id,
        telegram_username = excluded.telegram_username,
        linked_at = now();

  select coalesce(p.display_name, u.email) into v_name
    from auth.users u
    left join public.profiles p on p.user_id = u.id
   where u.id = v_uid;

  return jsonb_build_object('ok', true, 'name', coalesce(v_name, 'bạn'));
end $$;

/**
 * Bot hỏi: mã số Telegram này là ai, và có phải người của đội ngũ không.
 *
 * `is_staff` = có chân trong ÍT NHẤT MỘT tiệm với vai chủ/quản trị. Đây là chỗ
 * thay thế dần danh sách mã số gõ tay: quyền đi theo vai trò thật trong iFan.
 */
create or replace function public.tg_who_is(p_key text, p_tg_user text)
returns jsonb
language plpgsql
stable
security definer set search_path = pg_temp as $$
declare
  v_uid uuid;
  v_name text;
  v_staff boolean := false;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  select l.user_id into v_uid
    from public.user_telegram_links l where l.telegram_user_id = p_tg_user;

  if v_uid is null then
    return jsonb_build_object('linked', false);
  end if;

  select coalesce(p.display_name, u.email) into v_name
    from auth.users u
    left join public.profiles p on p.user_id = u.id
   where u.id = v_uid;

  select exists (
    select 1 from public.tenant_members m
     where m.user_id = v_uid and m.status = 'active'
       and m.role in ('owner', 'admin')
  ) into v_staff;

  return jsonb_build_object(
    'linked', true, 'user_id', v_uid,
    'name', coalesce(v_name, 'bạn'), 'is_staff', v_staff
  );
end $$;

revoke all on function public.tg_link_code() from public;
revoke all on function public.tg_link_confirm(text, text, text, text) from public;
revoke all on function public.tg_who_is(text, text) from public;
grant execute on function public.tg_link_code() to authenticated;
grant execute on function public.tg_link_confirm(text, text, text, text) to anon, authenticated;
grant execute on function public.tg_who_is(text, text) to anon, authenticated;
