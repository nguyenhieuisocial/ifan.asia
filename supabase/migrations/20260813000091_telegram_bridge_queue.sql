-- Migration #91 — hàng đợi cầu nối Telegram ↔ Claude Code (task #115, phần 2).
--
-- BÀI TOÁN: một bot Telegram chỉ được chọn MỘT trong hai cách nhận tin —
-- webhook (server, 24/7) HOẶC getUpdates (máy cá nhân). Không thể cùng lúc.
-- Nếu để script trên máy founder tự hỏi Telegram thì phải tắt webhook, và lúc
-- script chết là lệnh /trangthai chết ÂM THẦM theo (đúng loại bẫy bug #85 đã
-- ghi trong sổ: cron chết không ai biết).
--
-- CÁCH GIẢI: webhook LUÔN giữ bot (không bao giờ đổi chế độ). Tin nào webhook
-- không tự trả lời được thì đẩy vào hàng đợi này; script trên máy founder lấy
-- từ hàng đợi ra, hỏi Claude Code, rồi tự gửi câu trả lời về Telegram.
-- Cầu nối là phần CỘNG THÊM — tắt nó đi thì bot vẫn chạy đúng như trước.
--
-- Nhịp tim (bridge_seen_at): webhook cần biết máy founder có đang bật không
-- để trả lời cho đúng sự thật ("đang xử lý" vs "máy chưa bật") thay vì để
-- người hỏi chờ vô vọng.

create table if not exists public.tg_bridge_queue (
  id bigint generated always as identity primary key,
  chat_id text not null,
  -- Chủ đề trong nhóm dạng diễn đàn — phải trả lời ĐÚNG chủ đề người hỏi.
  thread_id int,
  user_id text not null,
  question text not null,
  status text not null default 'pending'
    check (status in ('pending', 'taken', 'done', 'failed')),
  answer text,
  error text,
  created_at timestamptz not null default now(),
  taken_at timestamptz,
  done_at timestamptz
);

-- Hàng đợi luôn nhỏ (vài chục dòng): chỉ cần index cho đúng câu lấy việc.
create index if not exists tg_bridge_queue_pending_idx
  on public.tg_bridge_queue (created_at)
  where status = 'pending';

alter table public.tg_bridge_queue enable row level security;
-- KHÔNG policy nào: chỉ đi qua 3 hàm security definer bên dưới, mọi truy cập
-- trực tiếp (kể cả anon có khoá công khai) đều bị chặn sạch.

-- Nhịp tim của cầu nối, dùng chung bảng cấu hình private sẵn có.
create table if not exists private.bridge_heartbeat (
  name text primary key,
  seen_at timestamptz not null
);

/**
 * Đẩy câu hỏi vào hàng đợi. Trả về id + cầu nối có đang sống không, để
 * webhook chọn đúng câu báo lại cho người hỏi.
 */
create or replace function public.tg_bridge_enqueue(
  p_key text,
  p_chat text,
  p_thread int,
  p_user text,
  p_text text
)
returns jsonb
language plpgsql
volatile
security definer set search_path = pg_temp as $$
declare
  v_id bigint;
  v_alive boolean;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  insert into public.tg_bridge_queue (chat_id, thread_id, user_id, question)
  values (p_chat, p_thread, p_user, left(coalesce(p_text, ''), 4000))
  returning id into v_id;

  -- "Sống" = có lấy việc trong 2 phút gần đây. Script hỏi mỗi ~3 giây nên
  -- 2 phút là rộng rãi, không báo nhầm "chưa bật" lúc mạng chập chờn.
  select coalesce(max(seen_at) > now() - interval '2 minutes', false)
    into v_alive
  from private.bridge_heartbeat where name = 'telegram';

  return jsonb_build_object('id', v_id, 'bridge_alive', v_alive);
end $$;

/** Script trên máy founder gọi để lấy việc + đóng dấu nhịp tim. */
create or replace function public.tg_bridge_claim(p_key text, p_batch int default 3)
returns table (q_id bigint, q_chat text, q_thread int, q_user text, q_text text)
language plpgsql
volatile
security definer set search_path = pg_temp as $$
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  insert into private.bridge_heartbeat (name, seen_at) values ('telegram', now())
  on conflict (name) do update set seen_at = now();

  -- skip locked: chạy hai script cùng lúc cũng không ai lấy trùng việc của ai.
  return query
  with picked as (
    select q.id from public.tg_bridge_queue q
    where q.status = 'pending'
    order by q.created_at
    limit greatest(1, least(p_batch, 10))
    for update skip locked
  )
  update public.tg_bridge_queue t
     set status = 'taken', taken_at = now()
    from picked
   where t.id = picked.id
  returning t.id, t.chat_id, t.thread_id, t.user_id, t.question;
end $$;

/** Đóng việc. p_answer null + p_error có giá trị = thất bại. */
create or replace function public.tg_bridge_complete(
  p_key text,
  p_id bigint,
  p_answer text,
  p_error text default null
)
returns void
language plpgsql
volatile
security definer set search_path = pg_temp as $$
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  update public.tg_bridge_queue
     set status = case when p_error is null then 'done' else 'failed' end,
         answer = left(p_answer, 8000),
         error = left(p_error, 500),
         done_at = now()
   where id = p_id;
end $$;

revoke all on function public.tg_bridge_enqueue(text, text, int, text, text) from public;
revoke all on function public.tg_bridge_claim(text, int) from public;
revoke all on function public.tg_bridge_complete(text, bigint, text, text) from public;
grant execute on function public.tg_bridge_enqueue(text, text, int, text, text) to anon, authenticated;
grant execute on function public.tg_bridge_claim(text, int) to anon, authenticated;
grant execute on function public.tg_bridge_complete(text, bigint, text, text) to anon, authenticated;
