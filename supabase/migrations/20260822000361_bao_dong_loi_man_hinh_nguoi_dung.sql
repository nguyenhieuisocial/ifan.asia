-- ════════════════════════════════════════════════════════════════════
-- LỖI TRÊN MÀN HÌNH NGƯỜI DÙNG PHẢI ĐƯỢC BÁO, KHÔNG CHỈ GHI SỔ
-- ════════════════════════════════════════════════════════════════════
--
-- Soát 22/08 khi dựng lại mẫu số kế hoạch: kho có ĐỦ hạ tầng báo động — nhịp
-- tim, việc chạy nền hỏng, bốn đường gửi tin hỏng — nhưng KHÔNG đường nào nhìn
-- vào sổ lỗi ứng dụng `app_errors` (#327). Lỗi người dùng gặp thật sự trên màn
-- hình được ghi lại đầy đủ rồi nằm im ở đó.
--
-- ⚠️ Đây là loại hổng canh gác NGUY HIỂM NHẤT: nó không giống chỗ chưa làm (ai
--   cũng thấy thiếu), mà giống chỗ ĐÃ LÀM RỒI — có bảng, có hàm ghi, có cả dấu
--   vân tay gom lỗi trùng. Nhìn vào thấy đủ. Thiếu đúng một mắt xích cuối:
--   KHÔNG AI ĐỌC.
--
-- ⚠️ Sửa TẠI CHỖ trong `scan_user_failures` thay vì dựng việc chạy nền mới:
--   cùng mực nước thời gian, cùng đường gửi, cùng cách chống báo trùng. Thêm
--   một việc nền là thêm một thứ có thể tự chết trong im lặng.

CREATE OR REPLACE FUNCTION public.scan_user_failures()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_since timestamptz;
  v_now timestamptz := now();
  v_webhook int;
  v_bot int;
  v_platform int;
  v_bridge int;
  v_loi_moi int;
  v_loi_lap int;
  v_loi_dau text;
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

  -- ── LỖI NGƯỜI DÙNG GẶP TRÊN MÀN HÌNH ────────────────────────────────
  -- ⚠️ Sổ `app_errors` (#327) đã ghi những lỗi này TỪ LÂU, nhưng KHÔNG ai được
  --   báo — hàm soát này chỉ đếm bốn đường GỬI TIN hỏng. Nghĩa là một màn trắng
  --   xoá trước mặt người dùng thì im lặng tuyệt đối. Ngày 19/08 hai thứ hỏng
  --   khoảng 12 tiếng và chính founder là người phát hiện, không phải hệ thống.
  --
  -- ⚠️ Đếm THEO DẤU VÂN TAY, không theo số lượt. Một lỗi lặp 500 lần vẫn là MỘT
  --   việc phải sửa; đếm theo lượt thì một vòng lặp hỏng ở trình duyệt của MỘT
  --   người sẽ nhấn chìm mọi lỗi khác trong tin báo.
  --
  -- ⚠️ Tách LỖI MỚI khỏi LỖI CŨ CÒN TÁI DIỄN. Lỗi mới là thứ vừa hỏng — cần biết
  --   ngay. Lỗi cũ tái diễn là thứ đã biết mà chưa sửa. Trộn chung thì tin báo
  --   nào cũng như tin báo nào, và người ta ngừng đọc.
  select count(*) into v_loi_moi from public.app_errors
   where lan_dau > v_since and da_xu_ly_luc is null;
  select count(*) into v_loi_lap from public.app_errors
   where lan_cuoi > v_since and lan_dau <= v_since and da_xu_ly_luc is null;

  -- Lời lỗi đến từ TRÌNH DUYỆT NGƯỜI LẠ. Cắt ngắn và bỏ ký tự xuống dòng trước
  -- khi ghép vào tin báo — không làm vậy thì một người có thể dựng chuỗi trông
  -- như nhiều dòng cảnh báo thật của hệ thống.
  select replace(replace(left(loi, 90), E'\n', ' '), E'\r', ' ')
    into v_loi_dau
    from public.app_errors
   where lan_dau > v_since and da_xu_ly_luc is null
   order by so_lan desc limit 1;

  v_total := v_webhook + v_bot + v_platform + v_bridge + v_loi_moi + v_loi_lap;

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
  if v_loi_moi > 0 then
    v_body := v_body || E'\n· ' || v_loi_moi || ' LỖI MỚI trên màn hình người dùng';
    if v_loi_dau is not null then v_body := v_body || E'\n  ↳ ' || v_loi_dau; end if;
  end if;
  if v_loi_lap > 0 then v_body := v_body || E'\n· ' || v_loi_lap || ' lỗi cũ chưa sửa vẫn đang tái diễn'; end if;

  perform public.platform_notify('user_failure', 'fail:' || v_now::text, v_body);
  return v_total;
end $function$

