-- Kèm theo #178: cửa ĐỌC cho phía web canh ngược lại kho dữ liệu.
--
-- `silence_scan()` chạy TRONG kho dữ liệu, nên nó có một điểm mù ngay tại chính
-- nó: bộ hẹn giờ chết thì đồng hồ canh cũng chết theo và im lặng — đúng cái nó
-- sinh ra để chống. Nhịp chạy trên Vercel canh ngược lại chỗ đó.
--
-- Hàm này chỉ ĐỌC và chỉ trả về MỘT con số (số phút im). Không trả cả hàng, để
-- cửa gọi từ ngoài không đọc được gì thêm ngoài đúng thứ nó cần.
create or replace function public.heartbeat_im_bao_lau(p_key text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case
           when h.last_seen_at is null then null
           else greatest(0, round(extract(epoch from (now() - h.last_seen_at)) / 60))::int
         end
    from public.heartbeats h
   where h.key = p_key;
$fn$;

revoke all on function public.heartbeat_im_bao_lau(text) from public;
grant execute on function public.heartbeat_im_bao_lau(text) to authenticated, anon;

comment on function public.heartbeat_im_bao_lau is
  'Một nhịp đã im bao nhiêu phút. NULL = chưa bao giờ chạy, hoặc tên nhịp không có thật. Chỉ đọc, chỉ trả một số — dùng cho phía web canh ngược lại bộ hẹn giờ trong CSDL.';
