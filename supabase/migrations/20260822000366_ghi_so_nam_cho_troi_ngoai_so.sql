-- ════════════════════════════════════════════════════════════════════
-- GHI SỔ 5 CHỖ ĐÃ TRÔI RA NGOÀI SỔ — TRÔI THEO HAI CHIỀU NGƯỢC NHAU
-- ════════════════════════════════════════════════════════════════════
--
-- Ngày 22/08 dựng kho kiểm riêng (áp lại toàn bộ bản vá lên dự án trống) rồi so
-- với kho thật bằng `scripts/soat-lech-cau-truc.mjs`. Còn 7 chỗ lệch. Soi từng
-- chỗ thì thấy chúng KHÔNG cùng một loại, và quan trọng hơn: KHÔNG cùng một
-- chiều. Bản vá này ghi sổ 5 chỗ; 2 chỗ còn lại là lỗi của chính phép đo, đã
-- chữa trong `scripts/soat-lech-cau-truc.mjs` (không đụng tới CSDL).
--
-- ⚠️ ĐIỀU BẤT NGỜ NHẤT — KHÔNG PHẢI LÚC NÀO KHO THẬT CŨNG LÀ BẢN ĐÚNG.
--   Sổ bản vá của hai kho GIỐNG HỆT NHAU: cùng 319 bản, không kho nào thiếu hay
--   thừa bản nào. Vậy mà ruột vẫn khác. Lý do tìm ra được:
--
--   · Bản #295 (`chia_se_bao_cao_co_han`): văn bản CHẠY THẬT lên kho thật —
--     đọc từ cột `statements` trong sổ `supabase_migrations.schema_migrations`
--     — KHÁC với nội dung file #295 đang nằm trong kho mã (23.206 ký tự so với
--     24.686). File #295 chỉ có ĐÚNG MỘT commit (83ae852), tức nó chưa từng bị
--     sửa sau khi commit. Nghĩa là: người ta áp một BẢN NHÁP lên kho thật, sau
--     đó sửa lại bản nháp rồi mới commit, và KHÔNG áp lại. Kho thật đang chạy
--     bản nháp; kho mã giữ bản hoàn chỉnh.
--     ⇒ Với ba chỗ thuộc #295, bản ĐÚNG là bản trong KHO MÃ, không phải kho thật.
--
--   · Bản #182 và #365: văn bản trong sổ KHỚP từng ký tự với file. Hai bản này
--     đã áp đúng như đã commit — chỗ lệch sinh ra SAU đó, do có người sửa thẳng
--     lên kho thật.
--     ⇒ Với hai chỗ này, bản ĐÚNG là KHO THẬT.
--
--   Nói gọn: "kho thật luôn đúng hơn" là một luật SAI. Phải tra sổ xem văn bản
--   nào thực sự đã chạy, rồi mới biết bên nào là bên trôi.

-- ════════════════════════════════════════════════════════════════════
-- ① RÀNG BUỘC `report_shares_tran_90_ngay` — lấy theo KHO MÃ (#295)
-- ════════════════════════════════════════════════════════════════════
-- Kho thật:  check (expires_at <= created_at + interval '90 days')
-- Kho mã:    check (expires_at - created_at <= interval '90 days')
--
-- Hai vế cho cùng một kết quả đúng/sai, nên ĐỔI CÁI NÀY KHÔNG ĐỔI HÀNH VI: không
-- hàng nào đang hợp lệ mà thành vi phạm, và ngược lại. Lý do vẫn nên đổi đã được
-- viết sẵn trong file #295: phép cộng `timestamptz + interval` phụ thuộc múi giờ
-- máy chủ, còn phép trừ hai `timestamptz` thì không. Ràng buộc `check` là chỗ
-- không nên có thứ phụ thuộc ngữ cảnh.
--
-- AN TOÀN KHI DROP: đã tra `pg_depend` trên kho thật theo oid của ràng buộc này
-- — KHÔNG có đối tượng nào phụ thuộc vào nó (0 dòng). Đây là chỗ hôm nay đã một
-- lần suýt kéo gãy chốt khác (mã lỗi 2BP01), nên lần này tra trước rồi mới bỏ.
alter table public.report_shares
  drop constraint if exists report_shares_tran_90_ngay;
alter table public.report_shares
  add constraint report_shares_tran_90_ngay
  check (expires_at - created_at <= interval '90 days');

-- ════════════════════════════════════════════════════════════════════
-- ② `report_share_create` — lấy theo KHO MÃ (#295)
-- ════════════════════════════════════════════════════════════════════
-- Chỗ khác duy nhất là cách đo kích thước `payload`:
--   kho thật:  pg_column_size(p_payload)        > 65536
--   kho mã:    octet_length(p_payload::text)    > 65536
--
-- ⚠️ KHÔNG MẤT LỚP BẢO VỆ NÀO KHI ĐỔI. Đã kiểm trên CẢ HAI kho: ràng buộc bảng
--   `report_shares_payload_gon check (pg_column_size(payload) <= 65536)` vẫn
--   còn nguyên ở cả hai (bản #364 đã ghi sổ nó). Trần 64KB nằm ở ràng buộc bảng
--   mới là trần THẬT; chốt trong hàm chỉ là lớp chặn sớm để báo lỗi cho đẹp.
--   Đã đo thử trên kho thật với một khối 60KB: pg_column_size = 60.017 còn
--   octet_length(::text) = 60.009 — chênh 8 byte trên 60KB, không đủ để một
--   khối lọt được lớp này rồi bị lớp kia chặn ở mức có ý nghĩa.
CREATE OR REPLACE FUNCTION public.report_share_create(p_report_key text, p_period_key text, p_payload jsonb, p_days integer DEFAULT 7, p_password text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_pw     text := nullif(btrim(coalesce(p_password, '')), '');
  v_token  text;
  v_id     uuid;
  v_expires timestamptz;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- CỐ Ý HẸP HƠN quy ước "owner/admin/manager" của các màn quản lý: đây là
  -- đường mang số của tiệm RA NGOÀI cho người không có tài khoản. Cùng mức với
  -- màn xoá dữ liệu cá nhân (#287) và khoá API (#160) — không phải vì quản lý
  -- kém tin cậy hơn, mà vì hậu quả nằm ngoài tầm thu hồi của tiệm.
  if v_role not in ('owner', 'admin') then raise exception 'forbidden'; end if;

  if p_report_key not in ('lost_reasons', 'kpi') then raise exception 'bad_report'; end if;
  -- KHÔNG kẹp biên im lặng: người gọi đưa số ngoài khoảng là lời gọi bịa (màn
  -- hình chỉ cho chọn 7/14/30/90). Kẹp im lặng thì một lỗi lập trình biến thành
  -- một đường dẫn sống lâu hơn ý định mà không ai biết.
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'bad_days'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'bad_payload'; end if;
  if octet_length(p_payload::text) > 65536 then raise exception 'payload_too_big'; end if;
  -- bcrypt chỉ dùng 72 byte đầu — quá số đó là mật khẩu bị cắt ngầm, và người
  -- đặt sẽ không hiểu vì sao "đúng mật khẩu" mà vẫn vào được bằng chuỗi khác.
  if v_pw is not null and (length(v_pw) < 4 or octet_length(v_pw) > 72) then
    raise exception 'bad_password';
  end if;

  -- 24 byte = 192 bit entropy. KHÔNG số thứ tự, KHÔNG mã tiệm, KHÔNG mốc thời
  -- gian — không suy được gì từ mã, và không dò nổi bằng vét cạn.
  -- `extensions.` bắt buộc: pgcrypto nằm ở schema đó trên Supabase mà hàm này
  -- ghim `search_path = public, pg_temp` (bài học #97).
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires := now() + make_interval(days => p_days);

  insert into public.report_shares
      (tenant_id, token_hash, report_key, period_key, payload, expires_at, password_hash, created_by)
  values (
    v_tenant,
    -- `sha256()` là hàm LÕI (pg_catalog) nên không dính chuyện schema như
    -- pgcrypto. Mã là chuỗi hex nên `convert_to` chỉ là ép kiểu, không đổi chữ.
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    p_report_key, p_period_key, p_payload, v_expires,
    case when v_pw is null then null
         else extensions.crypt(v_pw, extensions.gen_salt('bf', 10)) end,
    auth.uid())
  returning id into v_id;

  -- Đường ghi sổ CHÍNH THỨC — ở đây có phiên đăng nhập nên gọi được RPC chuẩn.
  -- KHÔNG ghi `period_key`/`payload` vào sổ: sổ nói AI LÀM GÌ, không phải chép
  -- lại nội dung; và tuyệt đối không ghi mã hay mật khẩu.
  perform public.record_audit_log('report_share', v_id, 'created',
    jsonb_build_object(
      'bao_cao', p_report_key,
      'ky', p_period_key,
      'so_ngay', p_days,
      'co_mat_khau', v_pw is not null));

  -- Mã thô đi ra ĐÚNG MỘT LẦN, tại đây. Sau câu này hệ thống không còn giữ nó.
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end $function$

;

-- ════════════════════════════════════════════════════════════════════
-- ③ `report_share_open` — lấy theo KHO MÃ (#295). CHỖ NÀY SỬA LỖI THẬT.
-- ════════════════════════════════════════════════════════════════════
-- Đây là chỗ duy nhất trong bản vá này mà bên trôi (kho thật) đang chạy một
-- BẢN CÓ LỖI, chứ không chỉ là viết khác đi. Hai điểm, đều đã tự kiểm:
--
-- 1) MẬT KHẨU CẮT KHOẢNG TRẮNG LỆCH NHAU — lỗi người dùng gặp được.
--    Đọc thẳng hai hàm trên KHO THẬT:
--      `report_share_create` : v_pw := nullif(btrim(coalesce(p_password,'')),'')
--      `report_share_open`   : v_pw := nullif(      coalesce(p_password,'') ,'')
--    Tức lúc ĐẶT thì cắt khoảng trắng rồi mới băm, lúc MỞ thì không cắt. Ai đặt
--    mật khẩu lỡ dính một dấu cách ở đầu/cuối — chuyện rất dễ xảy ra vì mật khẩu
--    này được đọc qua điện thoại và dán qua tin nhắn — sẽ đặt được mà KHÔNG BAO
--    GIỜ mở được, và không đời nào đoán ra thủ phạm là một dấu cách. Bản trong
--    kho mã cắt ở cả hai đầu nên khớp nhau.
--
-- 2) DẤU VẾT NGƯỜI XEM (`ip_dau`) — kho mã kín hơn.
--    kho thật:  left(v_ip, 8)                          ← 8 ký tự đầu của băm IP
--    kho mã:    left(sha256(v_ip || ':' || id), 6)     ← băm lại kèm mã đường dẫn
--    Băm IP do tầng web tạo bằng muối CỐ ĐỊNH (bắt buộc phải vậy, nếu không thì
--    bộ đếm theo IP vô dụng). Muối cố định + 8 ký tự hex ≈ 2^32, đúng bằng cả
--    không gian IPv4 — tức vét cạn là lần ngược ra IP thật. Bản kho mã băm lại
--    kèm mã đường dẫn nên dấu vết chỉ có nghĩa trong một đường dẫn, không ghép
--    được giữa hai tiệm, và cắt còn 6 ký tự.
--
-- ⚠️ Nói rõ để khỏi hiểu nhầm: bản vá này KHÔNG "sửa kho thật cho khớp bản vá".
--   Nó đưa kho thật lên bản đã được viết ra và commit từ đầu (83ae852) nhưng
--   chưa từng chạy tới nơi vì người ta áp bản nháp rồi mới sửa.
CREATE OR REPLACE FUNCTION public.report_share_open(p_token text, p_password text DEFAULT NULL::text, p_ip_hash text DEFAULT NULL::text, p_region text DEFAULT NULL::text, p_device text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_now   timestamptz := now();
  v_ip    text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_tok   text := btrim(coalesce(p_token, ''));
  -- ⚠️ `btrim` PHẢI khớp ĐÚNG với `report_share_create` (nó cũng btrim trước khi
  -- băm). Lệch một chỗ là mật khẩu đặt được mà không mở được — và người dùng sẽ
  -- không đời nào đoán ra thủ phạm là một dấu cách. Cắt khoảng trắng là quyết
  -- định CÓ CHỦ Ý: mật khẩu này được đọc qua điện thoại và dán qua tin nhắn.
  v_pw    text := nullif(btrim(coalesce(p_password, '')), '');
  v_rl    jsonb;
  v_row   public.report_shares%rowtype;
  v_tz    text;
  v_ten   text;
begin
  -- ① KHÔNG có băm IP ⇒ CHẶN. Đây là chỗ dễ mọc nhánh "chưa có thì cho qua"
  --    nhất, và nó sẽ vô hiệu hoá luôn lớp đếm. Tầng web luôn gửi (ipHashFor
  --    trả chuỗi kể cả khi không đọc được IP), nên null ở đây = lời gọi bịa.
  if v_ip is null then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- ② Lớp PHỤ: đếm theo băm IP bằng bộ đếm sẵn có của #25 (có muối, tự dọn
  --    theo giờ). 30 lượt/giờ. Gọi TRƯỚC khi tra mã — đặt sau thì kẻ dò vẫn
  --    được tra thoải mái. Nhắc lại: giá trị này người gọi tự khai nên đây KHÔNG
  --    phải chốt thật; chốt thật là ④ và độ dài 192 bit của mã.
  v_rl := public.app_rate_limit('bcshare:ip:' || v_ip, 30, 3600);
  if not coalesce((v_rl ->> 'allowed')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- Mã đúng luôn dài 48 ký tự hex. Kẹp khuôn TRƯỚC khi băm: không để một chuỗi
  -- vài megabyte của người lạ đi vào hàm băm, và mã trượt khuôn thì khỏi tra.
  if v_tok !~ '^[0-9a-f]{48}$' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- ③ Tra theo BĂM. Mã sai và ĐÃ THU HỒI rơi vào cùng một nhánh 'not_found'
  --    (ADR-0008 mục 5) — không dò được mã nào từng tồn tại.
  --    Cùng lúc lăn cửa sổ đếm và tăng bộ đếm trong MỘT câu: đọc-rồi-ghi tách
  --    làm hai câu là chừa một khe cho hai lượt gọi song song cùng đọc ra số cũ.
  update public.report_shares s
     set window_start = case when s.window_start is null
                               or s.window_start < v_now - interval '1 hour'
                             then v_now else s.window_start end,
         hit_count    = case when s.window_start is null
                               or s.window_start < v_now - interval '1 hour'
                             then 1 else s.hit_count + 1 end,
         fail_count   = case when s.window_start is null
                               or s.window_start < v_now - interval '1 hour'
                             then 0 else s.fail_count end
   where s.token_hash = encode(sha256(convert_to(v_tok, 'UTF8')), 'hex')
     and s.revoked_at is null
   returning s.* into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- ④ CHỐT THẬT — bộ đếm gắn trên chính hàng này, CSDL tự tăng, không bịa được.
  --    120 lượt/giờ chặn việc bơm phồng quyển sổ; 10 lần sai mật khẩu/giờ chặn
  --    dò mật khẩu. Người xem thật không chạm tới hai ngưỡng này.
  if v_row.hit_count > 120 or v_row.fail_count >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select t.timezone, t.name into v_tz, v_ten
    from public.tenants t where t.id = v_row.tenant_id;

  -- ⑤ HẾT HẠN CHẶN Ở ĐÂY, trước khi lấy bất cứ con số nào ra. Cố ý nói THẬT là
  --    hết hạn (khác 'not_found'): người này vốn cầm mã đúng nên không lộ thêm
  --    gì, còn giấu đi chỉ làm họ tưởng phần mềm hỏng rồi gọi điện cho tiệm.
  if v_row.expires_at <= v_now then
    return jsonb_build_object('ok', false, 'reason', 'expired', 'tz', v_tz,
                              'expires_at', v_row.expires_at);
  end if;

  -- ⑥ Mật khẩu. Chưa mở khoá thì KHÔNG lộ gì — không tên tiệm, không tên báo
  --    cáo, không ngày chốt. Màn hình chỉ được biết đúng một điều: có mật khẩu.
  if v_row.password_hash is not null then
    if v_pw is null then
      return jsonb_build_object('ok', false, 'reason', 'need_password');
    end if;
    if extensions.crypt(v_pw, v_row.password_hash) <> v_row.password_hash then
      update public.report_shares set fail_count = fail_count + 1 where id = v_row.id;
      return jsonb_build_object('ok', false, 'reason', 'wrong_password');
    end if;
  end if;

  update public.report_shares
     set open_count = open_count + 1,
         last_opened_at = v_now,
         -- Mở đúng = xoá vết dò trước đó, để một lần gõ nhầm không treo người
         -- xem thật suốt cả giờ.
         fail_count = 0
   where id = v_row.id;

  -- ⑦ GHI SỔ vào ĐÚNG quyển sổ chung `record_audit` (hợp đồng 24q). KHÔNG gọi
  --    `record_audit_log()` được: hàm đó lấy tiệm từ `current_tenant_id()` (thẻ
  --    đăng nhập) mà người xem KHÔNG đăng nhập ⇒ nó ném 'no_tenant_context'.
  --    Chèn thẳng với `tenant_id` tường minh và `actor_id = NULL` — ĐÚNG khuôn
  --    đã dùng ở #280, #281 và #290 cho các đường ghi không có người đăng nhập.
  --
  --    `ip_dau` KHÔNG phải IP, và cũng KHÔNG phải mấy ký tự đầu của băm IP —
  --    hai lý do, cả hai đều đã cân nhắc:
  --      · Băm IP dùng muối CỐ ĐỊNH (tầng web phải vậy, nếu không mỗi mã lại ra
  --        một khoá đếm khác và bộ đếm theo IP thành vô dụng). Muối cố định +
  --        8 ký tự hex ≈ 2^32 — đúng bằng cả không gian IPv4, tức LẦN NGƯỢC RA
  --        ĐƯỢC bằng vét cạn. Nên băm lại kèm mã đường dẫn: dấu vết chỉ có
  --        nghĩa TRONG một đường dẫn, không ghép được giữa hai tiệm.
  --      · Cắt còn 6 ký tự: đủ để chủ tiệm phân biệt "vẫn máy cũ" với "máy
  --        khác" (trùng nhầm 1/16 triệu), không đủ để lần ra ai.
  insert into public.record_audit
      (tenant_id, entity_type, entity_id, actor_id, action, diff)
  values (v_row.tenant_id, 'report_share', v_row.id, null, 'viewed',
          jsonb_build_object(
            'bao_cao', v_row.report_key,
            'ky', v_row.period_key,
            'ip_dau', left(encode(sha256(convert_to(v_ip || ':' || v_row.id::text, 'UTF8')), 'hex'), 6),
            'khu_vuc', nullif(left(btrim(coalesce(p_region, '')), 60), ''),
            'thiet_bi', case when p_device in ('mobile', 'desktop') then p_device end));

  return jsonb_build_object(
    'ok', true,
    'report_key', v_row.report_key,
    'period_key', v_row.period_key,
    'payload',    v_row.payload,
    'shop_name',  v_ten,
    'tz',         v_tz,
    'generated_at', v_row.created_at,
    'expires_at',   v_row.expires_at);
end $function$
;

-- ════════════════════════════════════════════════════════════════════
-- ④ `tg_release_mark` — lấy theo KHO THẬT. Chiều ngược lại.
-- ════════════════════════════════════════════════════════════════════
-- Đây đúng là loại mà cổng soát sinh ra để bắt: kho thật có thứ KHÔNG nằm trong
-- bản vá nào, dựng lại kho là mất trong im lặng.
--
-- Bản #182 là bản cuối cùng định nghĩa hàm này, và văn bản của nó trong sổ KHỚP
-- từng ký tự với file — nên chỗ lệch sinh ra SAU #182, do sửa thẳng lên kho thật.
--
-- Kho thật có thêm HÀNG CHỜ phát tin (#134): thay vì bắn tin ngay mỗi lần lên
-- bản, nó ghi vào `private.release_pending`, chỉ dồn phát khi có bản vá bảo mật
-- hoặc có mảng tính năng đổi trạng thái (`release_digest()`). Bản trong kho mã
-- vẫn là bản phát tin NGAY từng bản một. Mất phần này thì mỗi lần lên bản lại
-- một tin — đúng cái #137 và #134 sinh ra để dẹp.
--
-- ⚠️ ĐÃ KIỂM TRƯỚC KHI CHÉP: `private.release_pending` và `public.release_digest`
--   có ở CẢ HAI kho (bản #137 tạo ra chúng, và cổng soát cho thấy hai kho khớp
--   nhau ở phần này). Nên bản hàng chờ chạy được trên cả hai, không kéo theo
--   đối tượng thiếu.
CREATE OR REPLACE FUNCTION public.tg_release_mark(p_key text, p_sha text, p_features jsonb, p_msg text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old_sha text;
  v_old jsonb;
  v_new_release boolean := false;
  v_doi_dinh_dang boolean := false;
  v_lines text := '';
  v_so_dong int := 0;
  v_tieu_de text;
  v_cho_founder text;
  v_cau_bi_loai boolean := false;
  v_noi_bo boolean := false;
  v_uu_tien boolean := false;
  v_da_phat boolean := false;
  v_loai text;
  v_than text;
  r record;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;
  if p_sha is null or p_sha = '' then return jsonb_build_object('skipped', true); end if;

  select value into v_old_sha from private.app_config where key = 'release_sha' for update;
  select value::jsonb into v_old from private.app_config where key = 'feature_map';

  if v_old_sha is distinct from p_sha then
    v_new_release := true;
    insert into private.app_config (key, value) values ('release_sha', p_sha)
      on conflict (key) do update set value = excluded.value;
  end if;

  if v_old is not null then
    if jsonb_typeof(v_old) <> 'object' then
      v_doi_dinh_dang := true;
    else
      select coalesce(bool_or(jsonb_typeof(e.value) <> 'object'), true)
        into v_doi_dinh_dang
        from jsonb_each(v_old) e;
    end if;
  end if;

  if v_old is null or v_doi_dinh_dang then
    insert into private.app_config (key, value) values ('feature_map', p_features::text)
      on conflict (key) do update set value = excluded.value;
  elsif v_old is distinct from p_features then
    for r in
      select t.k, v_old -> t.k as cu, p_features -> t.k as moi
        from (select jsonb_object_keys(p_features) as k
              union select jsonb_object_keys(v_old)) t
       where v_old -> t.k is distinct from p_features -> t.k
       order by t.k
    loop
      if r.cu is null then
        v_lines := v_lines || E'\n· ➕ ' || coalesce(r.moi ->> 'ten', r.k) ||
                   ' — mảng mới, đang ở: ' || coalesce(r.moi ->> 'trang', '?');
      elsif r.moi is null then
        v_lines := v_lines || E'\n· ➖ ' || coalesce(r.cu ->> 'ten', r.k) ||
                   ' — đã gỡ khỏi danh sách';
      else
        if (r.cu ->> 'ten') is distinct from (r.moi ->> 'ten') then
          v_lines := v_lines || E'\n· ✏️ «' || coalesce(r.cu ->> 'ten', r.k) ||
                     '» đổi tên thành «' || coalesce(r.moi ->> 'ten', r.k) || '»';
        end if;
        if (r.cu ->> 'trang') is distinct from (r.moi ->> 'trang') then
          v_lines := v_lines || E'\n· ' || coalesce(r.moi ->> 'ten', r.k) || ': ' ||
                     coalesce(r.cu ->> 'trang', '?') || ' → ' || coalesce(r.moi ->> 'trang', '?');
        end if;
        if (r.cu ->> 'nhom') is distinct from (r.moi ->> 'nhom') then
          v_lines := v_lines || E'\n· ' || coalesce(r.moi ->> 'ten', r.k) ||
                     ': chuyển nhóm ' || coalesce(r.cu ->> 'nhom', '?') || ' → ' ||
                     coalesce(r.moi ->> 'nhom', '?');
        end if;
      end if;
    end loop;
    insert into private.app_config (key, value) values ('feature_map', p_features::text)
      on conflict (key) do update set value = excluded.value;
  end if;

  if v_new_release and v_old_sha is not null then
    v_than := coalesce(p_msg, '');

    v_cho_founder := nullif(btrim((
      regexp_match(v_than, '(?ni)^\s*(?:Founder|Người dùng thấy gì)\s*:\s*(.+)$')
    )[1]), '');

    -- Lưới đỡ #129: câu sai khuôn coi như không có, và phải nói ra.
    if v_cho_founder is not null
       and not public.tg_cau_founder_dung_khuon(v_cho_founder) then
      v_cau_bi_loai := true;
      v_cho_founder := null;
    end if;

    -- #133: bản tự khai nội bộ ⇒ không vào hàng chờ, không tin nào.
    v_noi_bo := v_cho_founder is null
                and not v_cau_bi_loai
                and v_than ~* '(?n)^\s*Nội bộ\s*:\s*\S';

    v_tieu_de := btrim(split_part(v_than, E'\n', 1));
    v_loai := lower(coalesce((regexp_match(v_tieu_de, '^([a-zA-Z]+)\s*(?:\([^)]*\))?\s*:'))[1], ''));
    v_tieu_de := btrim(regexp_replace(v_tieu_de, '^[a-zA-Z]+\s*(\([^)]*\))?\s*:\s*', ''));
  end if;

  -- #134: ghi HÀNG CHỜ thay vì phát tin ngay.
  if v_new_release and v_old_sha is not null and not v_noi_bo then
    insert into private.release_pending (sha, cau_founder, tieu_de, loai, cau_bi_loai)
      values (p_sha, v_cho_founder, nullif(v_tieu_de, ''), nullif(v_loai, ''), v_cau_bi_loai)
      on conflict (sha) do nothing;

    -- Ưu tiên: vá bảo mật, hoặc có mảng đổi trạng thái. Flush CẢ hàng chờ vào
    -- cùng một tin — xem lý do ở đầu file.
    v_uu_tien := v_loai = 'security' or v_lines <> '';
    if v_uu_tien then
      v_da_phat := public.release_digest();
    end if;
  end if;

  if v_lines <> '' then
    v_so_dong := length(v_lines) - length(replace(v_lines, E'\n', ''));
    if length(v_lines) > 3000 then
      v_lines := left(v_lines, 3000) || E'\n… và nữa — tổng ' || v_so_dong ||
                 ' thay đổi, xem đủ ở trang Lộ trình.';
    end if;
    perform public.platform_notify('feature_change', 'feat:' || p_sha,
      '✨ Danh sách mảng vừa đổi:' || v_lines);
  end if;

  return jsonb_build_object(
    'release', v_new_release and v_old_sha is not null and not v_noi_bo,
    'features_changed', v_lines <> '',
    'format_upgrade', v_doi_dinh_dang,
    'founder_line_rejected', v_cau_bi_loai,
    'internal_only', v_noi_bo,
    'queued', v_new_release and v_old_sha is not null and not v_noi_bo,
    'flushed_now', v_da_phat);
end $function$
;

-- ════════════════════════════════════════════════════════════════════
-- ⑤ `attendance_settings.require_selfie` — GHI SỔ MỘT LẦN TẮT KHẨN CẤP
-- ════════════════════════════════════════════════════════════════════
-- Chỗ lệch: mặc định cột này là `false` ở kho thật, `true` ở kho kiểm.
--
-- Bản #365 (`bat_anh_cham_cong_cho_moi_tiem`) đặt mặc định `true` và bật cho mọi
-- tiệm đang có. Văn bản #365 trong sổ KHỚP từng ký tự với file ở CẢ HAI kho —
-- nên #365 đã chạy đúng như đã commit. Nhưng trên kho thật, đo được lúc viết bản
-- vá này: mặc định = `false`, và cả 6/6 hàng đều `false`. Tức có người TẮT LẠI
-- sau khi #365 chạy, và không ghi sổ.
--
-- VÌ SAO TẮT — không phải đổi ý, mà là chặn một sự cố. Commit b6dadbd chép lại:
-- tính năng chụp ảnh chấm công ra bản 20/08 với đủ màn hình, nút bấm, chỗ lưu,
-- chốt quyền xem — nhưng `next.config.ts` gửi kèm mọi trang
-- `Permissions-Policy: camera=()`, chặn camera hoàn toàn kể cả với chính iFan.
-- **Tính năng chưa từng chạy được lần nào.** Không ai biết suốt hai ngày vì công
-- tắc mặc định TẮT. Bật cho mọi tiệm theo #365 ⇒ nhân viên bắt buộc phải có ảnh
-- mới chấm công được, mà camera thì bị chặn ⇒ KHÔNG AI CHẤM CÔNG ĐƯỢC. Phát hiện
-- trong vòng vài phút và tắt lại ngay trước khi ai dính.
--
-- ⚠️ ĐÂY LÀ TRẠNG THÁI TẠM, KHÔNG PHẢI QUYẾT ĐỊNH CUỐI. Chỉ đạo founder ở #365
--   ("toàn bộ ảnh khuôn mặt user đều phải được lưu lại") VẪN CÒN HIỆU LỰC. Sở dĩ
--   ghi `false` vào sổ là vì sổ đang NÓI SAI: dựng lại kho theo sổ hiện tại sẽ ra
--   mặc định `true` và khoá toàn bộ nhân viên ngoài cửa chấm công ngay khi kho
--   mới lên. Ghi đúng cái đang chạy thì lần dựng lại nào cũng ra đúng cái đang
--   chạy — đó mới là việc của quyển sổ.
--
-- 👉 ĐIỀU KIỆN ĐỂ BẬT LẠI (một dòng `set default true` + một câu `update`):
--   phải có người chụp thử THÀNH CÔNG trên một ĐIỆN THOẠI THẬT. Commit b6dadbd
--   nói thẳng là chưa nghiệm thu được trọn luồng: camera giả của máy kiểm không
--   phát được khung hình (`videoWidth = 0`), mới chỉ xác nhận được header không
--   còn chặn và `<video>` dựng lên. Đây là việc của người, không phải của bản vá.
alter table public.attendance_settings
  alter column require_selfie set default false;

update public.attendance_settings set require_selfie = false where require_selfie;

comment on column public.attendance_settings.require_selfie is
  'Bắt chụp ảnh khi chấm công. Chỉ đạo founder #365 là BẬT cho mọi tiệm, nhưng đang TẮT TẠM từ 22/08 vì camera từng bị chính app chặn (Permissions-Policy) — xem #366. Bật lại khi có người chụp thử được trên điện thoại thật.';
