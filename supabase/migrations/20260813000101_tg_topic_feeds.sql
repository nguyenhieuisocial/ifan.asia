-- Migration #101 — tin tự động về ĐÚNG chủ đề trong nhóm Telegram.
--
-- Founder: *"cần những thông tin tự động về ở chủ đề phù hợp nếu có update"*.
--
-- HIỆN TRẠNG trước migration này:
--   · Mọi chuông báo đổ vào CHAT RIÊNG của founder — một dòng duy nhất, trộn
--     lẫn "khách cần giúp" với "việc chạy nền hỏng". Nhóm có 7 chủ đề chia sẵn
--     nhưng KHÔNG tin tự động nào chảy vào đó.
--   · TIỆM MỚI ĐĂNG KÝ thì KHÔNG AI BÁO. Sự kiện đáng giá nhất của một sản
--     phẩm đang bán — có người vừa mở tiệm — lại là sự kiện im lặng nhất.
--     `domain_events` có ghi 'tenant.created' nhưng không ai đọc để báo.
--
-- NGUYÊN TẮC ĐỊNH TUYẾN: mỗi loại tin thuộc về ĐÚNG MỘT chủ đề. Không phát
-- một tin ra nhiều chỗ — trùng lặp là thứ khiến người ta bắt đầu bỏ qua cảnh
-- báo, hỏng đúng cái mình đang muốn bảo vệ.

-- ── 1. Chủ đề khai mình nhận loại tin nào ───────────────────────────────────

alter table public.tg_topics
  add column if not exists feeds text[] not null default '{}';

comment on column public.tg_topics.feeds is
  'Các loại tin tự động chảy vào chủ đề này. Rỗng = chủ đề chỉ để người nói chuyện.';

-- ── 2. Thêm loại tin "tiệm mới" ─────────────────────────────────────────────

alter table public.platform_outbox drop constraint if exists platform_outbox_kind_check;
alter table public.platform_outbox add constraint platform_outbox_kind_check
  check (kind in ('help_request', 'system_alert', 'tenant_signup'));

/**
 * Tiệm mới đăng ký → báo ngay.
 *
 * Bỏ qua tiệm mẫu (`is_sample`): dữ liệu dựng sẵn không phải khách thật, báo
 * lên là tự lừa mình có người dùng.
 *
 * Nuốt lỗi có chủ đích: chuông báo hỏng KHÔNG được làm hỏng việc tạo tiệm.
 * Người ta đang đăng ký mà thất bại vì cái chuông thì mất khách thật.
 */
create or replace function public.tenants_notify_signup()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  if coalesce(new.is_sample, false) then return new; end if;

  begin
    perform public.platform_notify(
      'tenant_signup',
      'tenant:' || new.id,
      '🎉 Tiệm mới đăng ký: ' || coalesce(new.name, '(chưa đặt tên)') ||
      case when new.slug is not null then E'\nĐịa chỉ: /t/' || new.slug else '' end ||
      case when new.industry is not null then E'\nNgành: ' || new.industry else '' end
    );
  exception when others then
    raise warning 'tenants_notify_signup bỏ qua lỗi: %', sqlerrm;
  end;

  return new;
end $$;

drop trigger if exists tenants_notify_signup on public.tenants;
create trigger tenants_notify_signup
  after insert on public.tenants
  for each row execute function public.tenants_notify_signup();

-- ── 3. Gán loại tin cho chủ đề ──────────────────────────────────────────────
-- Vì sao chia thế này:
--   · "Khách hàng" — mọi thứ liên quan tới NGƯỜI DÙNG THẬT: ai vừa mở tiệm, ai
--     đang cần giúp. Đây là chủ đề founder phải mở mỗi ngày.
--   · "Kỹ thuật" — hệ thống tự khai mình đang hỏng. Để chung với "Lỗi" là sai:
--     "Lỗi" là chỗ NGƯỜI báo cái họ thấy sai, còn đây là MÁY báo.
--   · Năm chủ đề còn lại KHÔNG nhận tin tự động — cố ý. Chủ đề để bàn bạc mà
--     bị máy bơm tin vào là chìm hết chuyện người đang nói.

update public.tg_topics set feeds = '{help_request,tenant_signup}', updated_at = now()
 where chat_id = '-1004299451961' and thread_id = 25;   -- Khách hàng

update public.tg_topics set feeds = '{system_alert}', updated_at = now()
 where chat_id = '-1004299451961' and thread_id = 27;   -- Kỹ thuật

-- ── 4. Cửa cho worker hỏi: loại tin này gửi đi đâu ──────────────────────────

/**
 * Trả về nơi nhận của một loại tin: nhóm + chủ đề.
 *
 * Không tìm thấy → trả rỗng, worker tự rơi về chat riêng của founder. Chủ đề
 * bị xoá mà tin biến mất luôn thì tệ hơn nhiều so với tin về nhầm chỗ.
 */
create or replace function public.tg_feed_target(p_key text, p_kind text)
returns jsonb
language plpgsql
stable
security definer set search_path = pg_temp as $$
declare v_row record;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  select chat_id, thread_id, name into v_row
    from public.tg_topics
   where p_kind = any(feeds)
   order by thread_id
   limit 1;

  if v_row.chat_id is null then return jsonb_build_object('found', false); end if;
  return jsonb_build_object(
    'found', true, 'chat_id', v_row.chat_id,
    'thread_id', v_row.thread_id, 'topic', v_row.name
  );
end $$;

revoke all on function public.tg_feed_target(text, text) from public;
grant execute on function public.tg_feed_target(text, text) to anon, authenticated;

-- Worker cần biết loại tin để định tuyến — trước đây claim không trả `kind`
-- ra ngoài dùng được (có cột nhưng worker chỉ dùng để ghi log).
comment on function public.platform_claim_outbox(text, integer, boolean) is
  'Lấy tin chuông báo founder. Cột o_kind dùng để định tuyến về đúng chủ đề (migration #101).';


-- tg_topics_list phải trả thêm cột feeds, nếu không /chude hiện phạm vi mà
-- giấu mất phần "chủ đề này tự nhận tin gì" — đúng thứ founder vừa yêu cầu.
drop function if exists public.tg_topics_list(text, text);
create or replace function public.tg_topics_list(p_key text, p_chat text)
returns table (thread_id int, name text, scope text, feeds text[])
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
    select t.thread_id, t.name, t.scope, t.feeds
      from public.tg_topics t
     where t.chat_id = p_chat
     order by t.thread_id;
end $$;

revoke all on function public.tg_topics_list(text, text) from public;
grant execute on function public.tg_topics_list(text, text) to anon, authenticated;


-- Phạm vi 7 chủ đề — viết lại cho chính xác (founder yêu cầu 13/08).
-- Mỗi câu vừa là MÔ TẢ cho người đọc /chude, vừa là LUẬT bot dùng để chặn câu
-- lạc đề. Nên phải nói rõ cả "hỏi gì được" lẫn "gì thì sang chỗ khác".
update public.tg_topics set scope = v.scope, updated_at = now()
from (values
  (2,  'tính năng sản phẩm iFan: màn nào có gì, dùng ra sao, đã chạy hay còn sắp tới, lộ trình. KHÔNG phải chỗ báo hỏng — cái gì đang lỗi thì sang chủ đề Lỗi'),
  (5,  'báo hỏng: màn nào hiện sai, bấm không chạy, số liệu lệch, chỗ nào khó hiểu tới mức dùng sai. Kèm được ảnh chụp màn hình thì tốt. KHÔNG phải chỗ đề xuất tính năng mới'),
  (6,  'đề xuất và góp ý: nên làm thêm gì, đối thủ có gì mình chưa có, cách làm nào gọn hơn. Ý tưởng chưa chín cũng cứ ném vào đây'),
  (7,  'hỏi đáp chung cho người mới và người ngoài đội: giá, gói, cách bắt đầu, iFan làm được gì. Đây là chủ đề mặc định khi không biết hỏi ở đâu'),
  (8,  'thông báo một chiều từ đội ngũ: bản mới có gì, lịch bảo trì, thay đổi ảnh hưởng người dùng. KHÔNG thảo luận ở đây — bàn thì sang chủ đề đúng nội dung'),
  (25, 'khách hàng và bán hàng: tiệm nào vừa đăng ký, ai đang cần giúp, phản hồi của khách, hợp đồng, chăm sóc. Máy tự đổ vào đây tin tiệm mới và yêu cầu Cần giúp'),
  (27, 'kỹ thuật và vận hành hệ thống: mã nguồn, cơ sở dữ liệu, hạ tầng, triển khai. Máy tự đổ vào đây cảnh báo việc chạy nền hỏng. Khác chủ đề Lỗi ở chỗ: Lỗi là NGƯỜI thấy sai, đây là MÁY tự khai')
) as v(thread_id, scope)
where public.tg_topics.chat_id = '-1004299451961'
  and public.tg_topics.thread_id = v.thread_id;
