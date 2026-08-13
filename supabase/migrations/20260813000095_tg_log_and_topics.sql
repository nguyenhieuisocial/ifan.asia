-- Migration #95 — nhật ký MỌI tin nhắn Telegram + sổ đăng ký chủ đề.
--
-- Founder chốt 13/08:
--   1. "Toàn bộ user chat telegram đều cần lưu lại log hết."
--   2. "Bot chỉ trả lời đúng phạm vi thuộc Chủ Đề đó, không đúng thì gợi ý
--      qua Chủ Đề phù hợp."
--
-- VÌ SAO GHI Ở CỔNG VÀO CHỨ KHÔNG Ở CẦU NỐI: cầu nối chỉ thấy câu hỏi ĐÃ QUA
-- cửa. Tin bị chặn (chat lạ), tin hết lượt, tin chỉ là lệnh — cầu nối không
-- bao giờ thấy. Mà đúng những tin đó mới đáng soi khi có chuyện. Ghi ở webhook
-- thì thấy hết, kể cả tin của người lạ gõ vào bot.
--
-- VÌ SAO CHỦ ĐỀ NẰM Ở CSDL CHỨ KHÔNG GHIM TRONG MÃ: hai bên cùng cần đọc
-- (webhook trên server + cầu nối trên máy founder), và danh sách này ĐỔI ĐƯỢC
-- từ phía Telegram — ai đó thêm/đổi tên chủ đề là bản ghim cứng sai ngay mà
-- không ai biết. Để ở CSDL thì webhook tự học chủ đề mới khi gặp.

create table if not exists public.tg_message_log (
  id           bigserial primary key,
  chat_id      text        not null,
  thread_id    int,
  user_id      text        not null,
  username     text,
  message_id   bigint,
  text         text        not null,
  -- Kết cục của tin: queued (đã đẩy sang cầu nối) · command (lệnh /…) ·
  -- over_limit (hết lượt ngày) · not_allowed (chat ngoài danh sách) ·
  -- unknown_command. Ghi kết cục chứ không chỉ ghi nội dung: xem lại mới biết
  -- vì sao một tin không được trả lời.
  outcome      text        not null,
  created_at   timestamptz not null default now()
);

create index if not exists tg_message_log_created_idx
  on public.tg_message_log (created_at desc);
create index if not exists tg_message_log_user_idx
  on public.tg_message_log (user_id, created_at desc);

alter table public.tg_message_log enable row level security;
-- Không policy: chỉ vào ra qua RPC security definer có khoá. Nhật ký này chứa
-- nội dung chat của người thật — không mở cho vai anon/authenticated đọc.

comment on table public.tg_message_log is
  'Nhật ký mọi tin nhắn tới bot Telegram, kể cả tin bị chặn. Ghi ở webhook nên thấy cả tin cầu nối không bao giờ nhận được.';

create table if not exists public.tg_topics (
  chat_id     text        not null,
  thread_id   int         not null,
  name        text        not null,
  -- Phạm vi được phép trả lời trong chủ đề này. Null = chưa khai (chủ đề mới
  -- webhook tự học được tên nhưng chưa ai đặt phạm vi) ⇒ coi như không giới hạn,
  -- KHÔNG tự bịa ra phạm vi rồi chặn nhầm người dùng.
  scope       text,
  updated_at  timestamptz not null default now(),
  primary key (chat_id, thread_id)
);

alter table public.tg_topics enable row level security;

comment on table public.tg_topics is
  'Chủ đề trong nhóm Telegram + phạm vi bot được phép trả lời. Webhook tự thêm chủ đề mới khi gặp.';

-- Nạp 7 chủ đề đang có (dò bằng tay 13/08 — Bot API không có lệnh liệt kê chủ
-- đề, phải gửi thử vào từng luồng rồi đọc tên trong phần trả lời và xoá đi).
insert into public.tg_topics (chat_id, thread_id, name, scope) values
  ('-1004299451961', 2,  'Tính Năng', 'tính năng sản phẩm iFan: có gì, chưa có gì, dùng thế nào, lộ trình sắp tới'),
  ('-1004299451961', 5,  'Lỗi',       'báo lỗi và sự cố: cái gì đang hỏng, hiện sai, bấm không chạy'),
  ('-1004299451961', 6,  'Ý tưởng',   'đề xuất và góp ý: ý tưởng mới, nên làm thêm gì, tham khảo đối thủ'),
  ('-1004299451961', 7,  'Hỏi đáp',   'hỏi đáp chung về iFan: giá, gói, cách bắt đầu, câu hỏi của người mới'),
  ('-1004299451961', 8,  'Thông báo', 'thông báo chính thức từ đội ngũ — không phải chỗ hỏi đáp'),
  ('-1004299451961', 25, 'Khách hàng','khách hàng và bán hàng: tiệm nào đang dùng, chăm sóc, hợp đồng, phản hồi khách'),
  ('-1004299451961', 27, 'Kỹ thuật',  'kỹ thuật: mã nguồn, cơ sở dữ liệu, hạ tầng, triển khai, sự cố hệ thống')
on conflict (chat_id, thread_id) do update
  set name = excluded.name, scope = excluded.scope, updated_at = now();

/** Ghi một tin nhắn vào nhật ký. Gọi từ webhook, mọi tin, kể cả tin bị chặn. */
create or replace function public.tg_log_message(
  p_key text,
  p_chat text,
  p_thread int,
  p_user text,
  p_username text,
  p_message_id bigint,
  p_text text,
  p_outcome text
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

  insert into public.tg_message_log
      (chat_id, thread_id, user_id, username, message_id, text, outcome)
    values (p_chat, p_thread, p_user, left(p_username, 100), p_message_id,
            left(coalesce(p_text, ''), 4000), left(p_outcome, 30));
end $$;

/** Chủ đề mới xuất hiện → tự ghi nhận tên, để phạm vi trống cho người đặt sau. */
create or replace function public.tg_topic_seen(
  p_key text,
  p_chat text,
  p_thread int,
  p_name text
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
  if p_thread is null or p_name is null then return; end if;

  insert into public.tg_topics (chat_id, thread_id, name)
    values (p_chat, p_thread, left(p_name, 100))
  on conflict (chat_id, thread_id) do update
    -- Chỉ cập nhật TÊN (chủ đề đổi tên được). KHÔNG đụng vào phạm vi đã đặt.
    set name = excluded.name, updated_at = now();
end $$;

/** Danh sách chủ đề cho cầu nối — cần cả danh sách để gợi ý đúng chỗ. */
create or replace function public.tg_topics_list(p_key text, p_chat text)
returns table (thread_id int, name text, scope text)
language plpgsql
stable
security definer set search_path = pg_temp as $$
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  return query
    select t.thread_id, t.name, t.scope
      from public.tg_topics t
     where t.chat_id = p_chat
     order by t.thread_id;
end $$;

revoke all on function public.tg_log_message(text, text, int, text, text, bigint, text, text) from public;
revoke all on function public.tg_topic_seen(text, text, int, text) from public;
revoke all on function public.tg_topics_list(text, text) from public;
grant execute on function public.tg_log_message(text, text, int, text, text, bigint, text, text) to anon, authenticated;
grant execute on function public.tg_topic_seen(text, text, int, text) to anon, authenticated;
grant execute on function public.tg_topics_list(text, text) to anon, authenticated;
