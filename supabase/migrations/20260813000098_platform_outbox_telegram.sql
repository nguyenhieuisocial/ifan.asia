-- Migration #98 — cảnh báo "Cần giúp?" gửi được qua Telegram (nốt còn lại #115).
--
-- LỖ IM LẶNG ĐANG MỞ: `platform_claim_outbox` (#79) đứng yên hoàn toàn khi bot
-- Zalo chưa ghép nối. Ý định ban đầu đúng — không có nơi gửi thì đừng đốt lượt
-- thử. Nhưng nay founder trực trên **Telegram**, và bot Telegram thì KHÔNG nằm
-- trong CSDL (token ở biến môi trường của server). CSDL không có cách nào biết
-- Telegram đã sẵn sàng, nên nó vẫn đứng yên ⇒ **cảnh báo khách cần giúp nằm
-- chờ mãi mà không ai biết**. Đúng loại thất bại im lặng dự án cấm (bug #85).
--
-- Sửa bằng cách để NGƯỜI GỌI nói có kênh khác hay không, thay vì bắt CSDL đoán:
-- worker biết mình có Telegram thì truyền `p_allow_unpaired = true`.
--
-- Vì sao KHÔNG bỏ luôn chốt đứng yên: chốt đó vẫn đúng khi **không kênh nào**
-- sẵn sàng. Bỏ đi thì mỗi lượt cron lại +1 lần thử, 5 lượt là việc bị đóng dấu
-- 'failed' dù chưa từng gửi đi đâu — mất cảnh báo mà tưởng đã xử lý.
--
-- Tham số thêm ở CUỐI và có mặc định `false`: bản cũ gọi 2 tham số vẫn chạy
-- nguyên như trước, không phải sửa đồng loạt rồi triển khai nín thở.

create or replace function public.platform_claim_outbox(
  p_key text,
  p_batch integer default 20,
  p_allow_unpaired boolean default false
)
returns table (o_id bigint, o_chat text, o_kind text, o_body text, o_token text)
language plpgsql
security definer set search_path = pg_temp as $$
declare
  v_chat text;
  v_token text;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;
  if p_batch is null or p_batch < 1 or p_batch > 100 then
    raise exception 'invalid_input';
  end if;

  select value into v_chat from private.app_config where key = 'platform_bot_chat_id';
  select ds.decrypted_secret into v_token from vault.decrypted_secrets ds
    where ds.name = 'platform_bot:token';

  -- Chưa ghép Zalo VÀ người gọi cũng không có kênh nào khác → đứng yên.
  if (v_chat is null or v_token is null) and not coalesce(p_allow_unpaired, false) then
    return;
  end if;

  update public.platform_outbox o
    set status = 'failed', last_error = coalesce(o.last_error, 'max_attempts')
    where o.status = 'sending'
      and o.claimed_at < now() - interval '10 minutes'
      and o.attempts >= 5;

  return query
  with pick as (
    select o.id
    from public.platform_outbox o
    where (o.status = 'pending'
           or (o.status = 'sending' and o.claimed_at < now() - interval '10 minutes'))
      and o.attempts < 5
    order by o.id
    limit p_batch
    for update of o skip locked
  ),
  claimed as (
    update public.platform_outbox o
      set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
      from pick where o.id = pick.id
      returning o.id, o.kind, o.body
  )
  -- `o_chat`/`o_token` để null khi chưa ghép Zalo: worker thấy null thì biết
  -- phải đi đường Telegram. Không bịa giá trị giả để "cho đủ cột".
  select c.id, v_chat, c.kind, c.body, v_token from claimed c order by c.id;
end $$;

revoke all on function public.platform_claim_outbox(text, integer, boolean) from public;
grant execute on function public.platform_claim_outbox(text, integer, boolean) to anon, authenticated;

-- Bỏ bản 2 tham số: để hai cửa cùng tên là sớm muộn có chỗ gọi nhầm bản cũ
-- rồi lại đứng yên như trước mà không ai hiểu vì sao (đã làm đúng việc này ở
-- migration #93 cho tg_bridge_enqueue).
drop function if exists public.platform_claim_outbox(text, integer);
