-- VÁ LỖ trong chính đồng hồ canh im lặng (#178) — phát hiện khi soát lại bài
-- mình vừa làm, cùng ngày.
--
-- ═══════════════════════════════════════════════════════════════════
-- LỖ
-- ═══════════════════════════════════════════════════════════════════
-- `heartbeat_touch(p_key)` được cấp cho vai `anon`. Nhưng khoá `anon` nằm CÔNG
-- KHAI trong mã chạy ở trình duyệt — ai mở web cũng đọc được. Nghĩa là bất kỳ
-- ai cũng gọi được:
--     POST /rest/v1/rpc/heartbeat_touch  {"p_key":"web.bot_outbox"}
-- và giữ cho một nhịp ĐÃ CHẾT trông như còn sống. Đồng hồ vẫn im, chuông không
-- bao giờ reo — đúng thứ nó sinh ra để chống.
--
-- Không cần ác ý mới hỏng: chỉ cần một công cụ dò quét gọi bừa các hàm công
-- khai là đủ. Và hỏng theo kiểu KHÔNG AI BIẾT, vì bảng nhịp trông vẫn xanh.
--
-- Tôi đã tự chạy đúng lời gọi đó qua cửa công khai lúc kiểm #178 và thấy nó trả
-- `true`, nhưng lúc ấy chỉ đọc ra "hàm chạy được" chứ chưa đọc ra "ai cũng chạy
-- được". Ghi lại vì đó là bài học: kiểm ĐÚNG CỬA chưa đủ, còn phải hỏi thêm
-- **ai khác cũng đi được cửa này**.
--
-- ═══════════════════════════════════════════════════════════════════
-- SỬA
-- ═══════════════════════════════════════════════════════════════════
-- Đòi khoá nhịp — đúng khuôn `tg_release_mark` (#137) đã dùng cho cùng loại cửa.
-- Khoá đó chỉ có ở biến môi trường của máy chủ, không có trong mã trình duyệt.
drop function if exists public.heartbeat_touch(text);

create or replace function public.heartbeat_touch(p_key text, p_nhip text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_n int;
begin
  -- Sai khoá thì DỪNG HẲN, không trả false im lặng: gọi sai khoá là dấu hiệu
  -- cấu hình hỏng hoặc có người dò cửa, cả hai đều đáng biết.
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  update public.heartbeats set last_seen_at = now() where key = p_nhip;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$fn$;

revoke all on function public.heartbeat_touch(text, text) from public, anon;
grant execute on function public.heartbeat_touch(text, text) to anon;

comment on function public.heartbeat_touch is
  'Nhịp chạy nền đóng dấu "còn sống". ĐÒI khoá nhịp — bản #178 không đòi, nên ai cũng gọi được và giữ cho nhịp đã chết trông như còn sống. Tên nhịp gõ sai ⇒ trả false, KHÔNG tự tạo nhịp mới.';

-- Cửa ĐỌC cũng vậy: nó tiết lộ hạ tầng đang sống hay chết — không phải bí mật
-- lớn, nhưng cũng không có lý do gì để người lạ đọc được.
drop function if exists public.heartbeat_im_bao_lau(text);

create or replace function public.heartbeat_im_bao_lau(p_key text, p_nhip text)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v_phut integer;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  select case
           when h.last_seen_at is null then null
           else greatest(0, round(extract(epoch from (now() - h.last_seen_at)) / 60))::int
         end
    into v_phut
    from public.heartbeats h
   where h.key = p_nhip;
  return v_phut;
end;
$fn$;

revoke all on function public.heartbeat_im_bao_lau(text, text) from public, anon;
grant execute on function public.heartbeat_im_bao_lau(text, text) to anon;

comment on function public.heartbeat_im_bao_lau is
  'Một nhịp đã im bao nhiêu phút. NULL = chưa bao giờ chạy, hoặc tên nhịp không có thật. ĐÒI khoá nhịp.';
