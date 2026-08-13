-- Migration #92 — vá 2 lỗ ÂM THẦM của hàng đợi cầu nối Telegram (#91).
--
-- LỖ 1 — việc kẹt vĩnh viễn: cầu nối lấy việc ra (status='taken') rồi máy tắt
-- đột ngột / tiến trình bị giết giữa chừng ⇒ dòng đó nằm 'taken' MÃI MÃI.
-- Người hỏi không bao giờ nhận được trả lời, và KHÔNG AI BIẾT — đúng loại thất
-- bại im lặng dự án cấm (bài học bug #85). Nay việc 'taken' quá 10 phút được
-- coi là bỏ rơi và tự nhận lại.
--
-- Vì sao 10 phút: trần một câu hỏi phía cầu nối là 3 phút (chủ dự án 10 phút),
-- cộng dư cho máy chậm. Ngắn hơn thì cướp việc của cầu nối đang chạy bình
-- thường, dài hơn thì người hỏi chờ quá lâu.
--
-- LỖ 2 — bảng phình vô hạn: mỗi câu hỏi để lại một dòng, không ai dọn. Dọn
-- ngay trong lúc lấy việc (rẻ, không cần thêm cron phải canh chừng).

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

  -- Dọn rác: giữ 7 ngày cho việc đã xong/hỏng, đủ để soi lại khi cần.
  delete from public.tg_bridge_queue
   where status in ('done', 'failed') and done_at < now() - interval '7 days';

  return query
  with picked as (
    select q.id from public.tg_bridge_queue q
    -- 'pending' = chưa ai làm · 'taken' quá hạn = cầu nối cũ đã chết giữa chừng
    where q.status = 'pending'
       or (q.status = 'taken' and q.taken_at < now() - interval '10 minutes')
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

revoke all on function public.tg_bridge_claim(text, int) from public;
grant execute on function public.tg_bridge_claim(text, int) to anon, authenticated;

comment on function public.tg_bridge_claim(text, int) is
  'Lấy việc cho cầu nối Telegram. Tự nhận lại việc bị bỏ rơi quá 10 phút và dọn việc cũ quá 7 ngày.';
