-- `qr_resolve` trả thêm MỘT bit: địa chỉ đích có thuộc tiệm đã khai không.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO CÂU HỎI NÀY PHẢI DO CSDL TRẢ LỜI, KHÔNG PHẢI TẦNG WEB
-- ═══════════════════════════════════════════════════════════════════
-- Đường `/q/<mã>` là điểm chạm internet: khách quét mã KHÔNG đăng nhập. Nó
-- **cố ý không biết mã thuộc tiệm nào** — `qr_resolve` chỉ trả về đúng một URL
-- đích, không tên tiệm, không `tenant_id`, không số liệu. Đó là chốt chống dò:
-- người lạ quét thử hàng loạt mã cũng không moi ra được danh sách tiệm.
--
-- Trang cảnh báo chuyển hướng (thẻ `trang-canh-bao-chuyen-huong`) cần biết
-- *"địa chỉ này có phải nơi tiệm đã khai không"* để quyết định đi thẳng hay
-- hiện cảnh báo. Nếu tầng web tự tra, nó phải đọc được cấu hình của tiệm —
-- tức phải biết tiệm nào — và **phá đúng chốt chống dò ở trên**.
--
-- Nên CSDL trả lời hộ, và chỉ trả về MỘT BIT: `trust = 'tenant' | 'unknown'`.
-- Tầng web học được "tin được hay không", KHÔNG học được "của tiệm nào".
--
-- Bit này lộ thêm gì? Người dò mã vốn đã cầm `target_url` trong tay; biết thêm
-- "địa chỉ đó có được khai không" gần như không thêm thông tin gì về tiệm. Đổi
-- lại, không có bit này thì trang cảnh báo hoặc phải hiện với MỌI lượt quét
-- (làm phiền hàng nghìn người thật để chặn một kẻ giả), hoặc phải để tầng web
-- biết tiệm (phá chốt chống dò). Đây là đánh đổi rẻ nhất trong ba đường.
--
-- ═══════════════════════════════════════════════════════════════════
-- "TIỆM ĐÃ KHAI" LẤY TỪ ĐÂU
-- ═══════════════════════════════════════════════════════════════════
-- Danh sách tên miền tiệm tự khai nằm ở cấu hình kênh Live Chat:
--     channels.config -> 'allowed_origins'   (type = 'livechat')
-- Đây chính là danh sách chủ tiệm khai "hộp chat của tôi được nhúng ở những
-- website này" — tức đúng nghĩa "website của tiệm", do chính họ khai, và đã
-- được dùng làm hàng rào thật ở đường hộp chat.
--
-- KHÔNG tự thêm nguồn thứ hai (ví dụ suy ra từ email tiệm hay từ tên miền
-- trong hồ sơ công ty): mỗi nguồn thêm vào là một đường để kẻ tấn công làm cho
-- địa chỉ của mình trở thành "tin được".
--
-- Trang mặt tiền iFan của chính tiệm (`/t/<slug>`) và bản thân iFan.asia thì
-- **tầng web tự nhận ra** bằng cách so với chính tên miền của nó — không cần
-- hỏi CSDL, và cũng không nên hỏi (CSDL không biết web đang chạy ở tên miền nào).
--
-- So sánh theo ORIGIN (scheme + host + port), không so cả đường dẫn: chủ tiệm
-- khai `https://spahuongsen.vn` thì mọi trang trong site đó đều là nhà họ.
-- Chuẩn hoá: bỏ dấu `/` cuối, hạ chữ thường. KHÔNG bỏ `www.` — nếu tiệm chỉ
-- khai `spahuongsen.vn` mà mã trỏ tới `www.spahuongsen.vn` thì đó vẫn là một
-- lần hiện cảnh báo, và cảnh báo thừa thì vô hại; đoán hộ mới là chỗ nguy.

create or replace function public.qr_resolve(p_code text, p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  c_limit  constant int      := 20;                 -- 20 lượt / phút / mã / thiết bị
  c_window constant interval := interval '1 minute';
  v_qr     public.qr_codes%rowtype;
  v_bucket text;
  v_hits   int;
  v_origin text;
  v_trust  text := 'unknown';
begin
  select * into v_qr
  from public.qr_codes
  where code = lower(btrim(coalesce(p_code, ''))) and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Khóa chặn = băm của (mã QR + IP). KHÔNG lưu IP thô ở bất kỳ đâu.
  v_bucket := md5(v_qr.id::text || ':' || coalesce(p_client_key, ''));

  insert into public.qr_scan_throttle as th (bucket, window_start, hits)
  values (v_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case when th.window_start > now() - c_window then th.hits + 1 else 1 end,
    window_start = case when th.window_start > now() - c_window
                        then th.window_start else now() end
  returning th.hits into v_hits;

  if v_hits > c_limit then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.qr_scans (tenant_id, qr_code_id) values (v_qr.tenant_id, v_qr.id);

  -- Origin của địa chỉ đích. Cắt bằng chuỗi chứ không dùng thư viện: chỉ cần
  -- "scheme://host[:port]", và mọi URL tới đây đều đã qua kiểm định dạng ở tầng
  -- web lúc tạo mã. Không khớp khuôn thì để `unknown` — hướng hỏng AN TOÀN
  -- (hiện cảnh báo) chứ không phải hướng hỏng im lặng (đi thẳng).
  v_origin := lower(btrim(coalesce(v_qr.target_url, '')));
  v_origin := substring(v_origin from '^https?://[^/?#]+');

  if v_origin is not null and exists (
    select 1
    from public.channels ch
    cross join lateral jsonb_array_elements_text(
      coalesce(ch.config -> 'allowed_origins', '[]'::jsonb)
    ) as o(origin)
    where ch.tenant_id = v_qr.tenant_id
      and ch.type = 'livechat'
      and lower(rtrim(o.origin, '/')) = v_origin
  ) then
    v_trust := 'tenant';
  end if;

  return jsonb_build_object('ok', true, 'target_url', v_qr.target_url, 'trust', v_trust);
end $function$;

comment on function public.qr_resolve(text, text) is
  'Tra mã QR cho khách CHƯA đăng nhập. Trả về đúng một URL đích + một bit `trust` (tenant | unknown) — KHÔNG trả tên tiệm, mã tiệm hay số liệu, để người dò mã không moi được danh sách tiệm. Bit `trust` sinh ra cho trang cảnh báo chuyển hướng (#215): tầng web cần biết "địa chỉ này có phải nơi tiệm đã khai không" mà KHÔNG được biết "của tiệm nào". Nguồn của `trust` là `channels.config->allowed_origins` của kênh livechat — danh sách website do chính chủ tiệm khai. Không khớp khuôn URL thì trả `unknown`: hỏng về phía HIỆN CẢNH BÁO, không hỏng về phía đi thẳng.';
