-- ═══════════════════════════════════════════════════════════════════════════
-- #295 — CHIA SẺ BÁO CÁO BẰNG ĐƯỜNG DẪN CÓ HẠN, cho người NGOÀI tiệm
-- Thẻ design: design-system/man-chia-se-bao-cao.html
-- Nối tiếp: ADR-0006 (cho người ngoài xem có hạn) · ADR-0008 mục 5 (luật cửa
--           công khai theo mã) · #25 (bộ đếm chống lụt trong CSDL) · #290
--           (khuôn ghi sổ cho đường không có phiên đăng nhập).
-- ───────────────────────────────────────────────────────────────────────────
-- BÀI TOÁN (bảng đối chiếu CNV Work 13/08 mục 5, ô "nhỏ mà đắt"): kế toán dịch
-- vụ, chủ đầu tư, người nhà góp vốn cần XEM SỐ. Hôm nay chủ tiệm chỉ có hai
-- đường, và cả hai đều sai: chụp màn hình (không kiểm chứng được, không thu hồi
-- được), hoặc cấp tài khoản (mở toang dữ liệu khách cho người ngoài).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- VÌ SAO KHÔNG DÙNG LẠI ĐƯỢC HẠ TẦNG ADR-0006 — đã cân nhắc, không phải bỏ qua
-- ═══════════════════════════════════════════════════════════════════════════
-- ADR-0006 giải đúng bài "cho người ngoài xem có hạn", nhưng bằng cách cấp một
-- hàng `tenant_members` vai `viewer` có `expires_at` cho MỘT TÀI KHOẢN ĐĂNG
-- NHẬP THẬT. Kế toán dịch vụ KHÔNG có tài khoản — và tạo tài khoản cho họ chính
-- là thứ tính năng này sinh ra để tránh. Nới ADR-0006 để nó nhận người không có
-- `auth.users` là đập lại nền của nó.
--
-- Cái DÙNG LẠI được là TINH THẦN, và cả bốn điều đều có mặt ở đây:
--   ① hạn CỨNG, chặn ở CSDL, không phải ẩn nút   ② đặc quyền tối thiểu — người
--   cầm mã chỉ thấy ĐÚNG bản chụp đã chọn        ③ mọi lần vào đều để lại vết
--   ④ thu hồi được bất cứ lúc nào, không phải đi xin
--
-- Và DÙNG LẠI THẬT ba mảnh hạ tầng đã chạy, không dựng bản thứ hai:
--   · `public.record_audit`   — quyển sổ DUY NHẤT (hợp đồng 24q). KHÔNG bảng log mới.
--   · `public.app_rate_limit` — bộ đếm cửa sổ trượt của #25. KHÔNG bảng đếm mới.
--   · luật cửa công khai của ADR-0008 mục 5 (xem khối dưới).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LUẬT ADR-0008 MỤC 5 ÁP NGUYÊN — đây là cửa mở ra internet
-- ═══════════════════════════════════════════════════════════════════════════
--   · KHÔNG BAO GIỜ lưu mã thô, chỉ `token_hash`.
--   · Mọi đọc đi qua RPC SECURITY DEFINER nhận mã. KHÔNG cấp `select` bảng nào
--     cho `anon` — bảng này thậm chí không cấp cho `authenticated`.
--   · RPC trả ĐÚNG phần việc của mã, không trả kèm "cho tiện".
--   · Mã sai / đã thu hồi → CÙNG một câu trả lời, không dò được mã nào từng có.
--   · `expires_at` bắt buộc; `revoked_at` để cắt ngang.
--
-- ⚠️ ĐÂY LÀ HỌ ĐỊA CHỈ THỨ BA. ADR-0008 mục 4 chốt hai họ, cấm gộp:
--   `/t/[slug]` mặt tiền (Google đọc được) · `/k/[token]` cửa riêng MỘT KHÁCH
--   (buộc vào `contact_id`). Bản chụp báo cáo mang SỐ TỔNG CỦA TIỆM, không mang
--   dữ liệu của bất kỳ khách nào — nó không buộc được vào `contact_id`, nên nó
--   không nhét vừa họ thứ hai. `/bc/[token]` theo ĐÚNG kỷ luật của `/k/`
--   (noindex, mã băm, hạn, thu hồi) nhưng là một họ riêng, khai ở đây.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUYẾT ĐỊNH LỚN NHẤT: ĐÓNG BĂNG SỐ, KHÔNG MỞ CỬA SỔ NHÌN VÀO CSDL
-- ═══════════════════════════════════════════════════════════════════════════
-- Số được tính LÚC TẠO, bằng chính phiên đăng nhập của chủ tiệm, đi qua đúng
-- hàng rào RLS mà màn báo cáo trong app đang đi (một đường code đếm — luật D1).
-- Kết quả đã gạn sạch được đóng băng vào `payload`.
--
-- ⇒ Trang công khai đọc ĐÚNG MỘT HÀNG rồi in ra. **Không tồn tại đường truy vấn
--    nào** từ cửa ngoài internet vào bảng nghiệp vụ. Bán kính thiệt hại xấu
--    nhất = đúng số byte chủ tiệm đã chọn đóng băng, không hơn một byte.
--
-- Phương án bị LOẠI — hàm definer đọc thẳng bảng nghiệp vụ theo mã: an toàn
-- ĐƯỢC, nhưng mỗi báo cáo thêm vào là thêm một câu truy vấn chạy dưới quyền
-- definer với đầu vào của người lạ. Đó đúng là lý do ADR-0006 mục 3(C) đã loại
-- `service_role`: *"đổi một rủi ro nhìn thấy được lấy một rủi ro vô hình"*.
--
-- Cái MẤT, nói thẳng: số KHÔNG tự cập nhật. Cố ý — kế toán cần "tháng 7 đã
-- chốt", không cần dòng chảy thời gian thực. Trang công khai in rõ "số chốt lúc…".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ KHÔNG CÓ NHÁNH "CHƯA CẤU HÌNH THÌ CHO QUA" — bài học cổng Zalo (#10/#31)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mọi điều kiện ở đây bám vào SỰ CÓ MẶT CỦA DỮ LIỆU trên chính hàng chia sẻ
-- (`expires_at`, `revoked_at`, `password_hash`), KHÔNG bám vào biến môi trường,
-- KHÔNG bám vào "tiệm đã bật tính năng chưa". Thiếu `p_ip_hash` thì CHẶN, không
-- phải bỏ qua bộ đếm (xem `report_share_open`).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════ A. BẢNG ═══════════════════

create table if not exists public.report_shares (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,

  -- ⚠️ BẢN BĂM, KHÔNG BAO GIỜ LÀ MÃ THÔ (ADR-0008 mục 5). Mã thật chỉ tồn tại
  -- trong đúng một câu trả lời của `report_share_create`, rồi biến mất khỏi hệ
  -- thống. Rò CSDL ⇒ KHÔNG mở được đường dẫn nào.
  token_hash   text not null unique,

  -- Danh sách ĐÓNG. Thêm báo cáo = sửa ràng buộc này + viết hàm gạn số ở tầng
  -- web. Cố ý không có nhánh "báo cáo nào cũng chia sẻ được": mỗi báo cáo phải
  -- có người viết tay phần "gạn lấy số nào, bỏ lại cột nào".
  report_key   text not null,
  -- Nhãn kỳ ('month' · '3m' · 'all' · '2026-08-01'). Chỉ dùng để TRA NHÃN hiển
  -- thị, không dùng để truy vấn lại — nhưng vẫn kẹp khuôn để chuỗi tuỳ ý của
  -- người gọi không đi thẳng xuống đây.
  period_key   text not null,

  -- SỐ ĐÃ ĐÓNG BĂNG. Đây là thứ DUY NHẤT trang công khai đọc được.
  payload      jsonb not null,

  expires_at   timestamptz not null,
  revoked_at   timestamptz,

  -- bcrypt (pgcrypto). NULL = không đặt mật khẩu. Băm sinh trong CSDL, so trong
  -- CSDL — bản băm KHÔNG BAO GIỜ đi ra tầng web.
  password_hash text,

  -- ── Bộ đếm chống dò, GẮN TRÊN CHÍNH HÀNG NÀY ────────────────────────────
  -- Vì sao ở đây chứ không chỉ dựa vào `app_rate_limit` theo IP: `p_ip_hash` do
  -- NGƯỜI GỌI tự khai. Khoá `anon` là khoá CÔNG KHAI, ai cũng gọi thẳng
  -- PostgREST và tự bịa một băm IP mới mỗi lượt ⇒ bộ đếm theo IP là lớp PHỤ.
  -- Bộ đếm dưới đây do CSDL tự tăng, không ai bịa được.
  window_start timestamptz,
  hit_count    int not null default 0,   -- MỌI lượt gọi trong cửa sổ
  fail_count   int not null default 0,   -- riêng lượt SAI MẬT KHẨU

  open_count     int not null default 0,
  last_opened_at timestamptz,

  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint report_shares_bao_cao_hop_le check (report_key in ('lost_reasons', 'kpi')),
  constraint report_shares_ky_hop_le      check (period_key ~ '^[a-z0-9-]{1,32}$'),
  constraint report_shares_han_ve_sau     check (expires_at > created_at),
  -- Trần CỨNG 90 ngày, ép ở CSDL chứ không chỉ ở ô chọn trên màn hình. Tinh
  -- thần ADR-0006: quyền không được sống lâu hơn lý do của nó.
  -- Viết dạng HIỆU hai mốc (`a - b <= interval`) chứ không dạng TỔNG
  -- (`a <= b + interval`): phép cộng timestamptz + interval là STABLE (nó phải
  -- xét lịch/DST), còn phép trừ hai timestamptz là IMMUTABLE. Ràng buộc `check`
  -- là chỗ không nên có hàm phụ thuộc ngữ cảnh — cùng một hàng có thể hợp lệ
  -- hôm nay và vi phạm sau khi đổi múi giờ máy chủ.
  constraint report_shares_tran_90_ngay   check (expires_at - created_at <= interval '90 days'),
  constraint report_shares_payload_la_doi_tuong check (jsonb_typeof(payload) = 'object')
  -- ⚠️ TRẦN KÍCH THƯỚC `payload` CỐ Ý KHÔNG nằm ở đây mà nằm trong
  -- `report_share_create` (64KB). Lý do: mọi cách đo kích thước jsonb đều đi qua
  -- hàm STABLE (`pg_column_size`) hoặc ép kiểu qua text — thứ không nên đặt vào
  -- một ràng buộc `check`. Và ở đây KHÔNG mất lớp bảo vệ nào: bảng này không cấp
  -- quyền cho vai nào và không có chính sách RLS nào, nên hàm tạo là ĐƯỜNG GHI
  -- DUY NHẤT. Chốt nằm trong đường ghi duy nhất vẫn là chốt ở CSDL.
);

create index if not exists report_shares_theo_tiem
  on public.report_shares (tenant_id, created_at desc);

-- RLS BẬT và CỐ Ý KHÔNG CÓ CHÍNH SÁCH NÀO, quyền bảng thu hồi sạch cả hai vai.
-- ⇒ Chỉ hàm SECURITY DEFINER dưới đây chạm được. Đây là lý do `token_hash` và
-- `password_hash` không thể lọt ra client bằng bất kỳ câu `select` nào — RLS là
-- luật theo HÀNG, không chặn được theo CỘT, nên chặn thẳng cả bảng rồi trả về
-- đúng cột cần qua hàm là cách duy nhất chắc chắn.
alter table public.report_shares enable row level security;
revoke all on public.report_shares from anon, authenticated;

comment on table public.report_shares is
  'Đường dẫn chia sẻ báo cáo ra NGOÀI tiệm, có hạn (#295). Chỉ lưu BĂM của mã '
  '(ADR-0008 mục 5). `payload` là số ĐÃ ĐÓNG BĂNG lúc tạo — trang công khai '
  '/bc/[token] không truy vấn bảng nghiệp vụ nào. Không cấp quyền bảng cho vai '
  'nào; mọi đường vào qua 4 hàm definer của #295.';

-- ═══════════════════ B. CỬA TẠO (chủ tiệm, đã đăng nhập) ═══════════════════

create or replace function public.report_share_create(
  p_report_key text,
  p_period_key text,
  p_payload    jsonb,
  p_days       int default 7,
  p_password   text default null
) returns jsonb
language plpgsql
security definer set search_path = public, pg_temp
as $$
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
end $$;

revoke execute on function public.report_share_create(text, text, jsonb, int, text) from public, anon;
grant  execute on function public.report_share_create(text, text, jsonb, int, text) to authenticated;

comment on function public.report_share_create(text, text, jsonb, int, text) is
  'Phát một đường dẫn chia sẻ báo cáo (#295). owner/admin. Trả mã thô ĐÚNG MỘT '
  'LẦN — CSDL chỉ giữ băm. Hạn 1..90 ngày, mặc định 7 do tầng web.';

-- ═══════════════════ C. THU HỒI ═══════════════════

create or replace function public.report_share_revoke(p_id uuid)
returns void
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'forbidden'; end if;

  update public.report_shares
     set revoked_at = now()
   where id = p_id and tenant_id = v_tenant and revoked_at is null;

  -- KHÔNG im lặng khi không đụng dòng nào: "đã thu hồi" mà thật ra chưa thu hồi
  -- là câu nói dối nguy hiểm nhất của cả tính năng này.
  if not found then raise exception 'not_revocable'; end if;

  perform public.record_audit_log('report_share', p_id, 'revoked', null);
end $$;

revoke execute on function public.report_share_revoke(uuid) from public, anon;
grant  execute on function public.report_share_revoke(uuid) to authenticated;

comment on function public.report_share_revoke(uuid) is
  'Cắt một đường dẫn chia sẻ ngay lập tức (#295). owner/admin. Đã thu hồi thì '
  'cửa công khai trả CÙNG câu với mã sai — không dò được mã nào từng tồn tại.';

-- ═══════════════════ D. DANH SÁCH (màn Cài đặt) ═══════════════════
-- Trả về MỌI CỘT TRỪ `token_hash` và `password_hash`. Đây là lý do bảng không
-- được cấp `select`: RLS lọc theo HÀNG, không lọc được theo CỘT.

create or replace function public.report_share_list()
returns table (
  id           uuid,
  report_key   text,
  period_key   text,
  has_password boolean,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  is_active    boolean,
  open_count   int,
  last_opened_at timestamptz,
  created_at   timestamptz,
  created_by   uuid,
  tz           text
)
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'forbidden'; end if;

  return query
    select s.id, s.report_key, s.period_key,
           s.password_hash is not null,
           s.expires_at, s.revoked_at,
           (s.revoked_at is null and s.expires_at > now()),
           s.open_count, s.last_opened_at, s.created_at, s.created_by,
           -- Múi giờ THEO TIỆM đi kèm để tầng web định dạng đúng giờ, không
           -- lấy đồng hồ máy chủ cũng không đóng cứng giờ VN (bài học #99/#192).
           t.timezone
      from public.report_shares s
      join public.tenants t on t.id = s.tenant_id
     where s.tenant_id = v_tenant
     order by s.created_at desc
     limit 200;
end $$;

revoke execute on function public.report_share_list() from public, anon;
grant  execute on function public.report_share_list() to authenticated;

comment on function public.report_share_list() is
  'Danh sách đường dẫn chia sẻ của tiệm (#295). owner/admin. CỐ Ý không trả '
  '`token_hash`/`password_hash` — bảng không cấp select được vì RLS không lọc theo cột.';

-- ═══════════════════ E. CỬA CÔNG KHAI — người ngoài mở đường dẫn ═══════════
--
-- ⚠️⚠️ HÀM NÀY *KHÔNG* NÉM LỖI CHO CÁC KẾT CỤC NGHIỆP VỤ. Đọc kỹ vì sao — đây
-- là chỗ dễ tự vô hiệu hoá cả bộ đếm mà không ai thấy:
--
--   `raise exception` cuộn ngược TOÀN BỘ giao dịch, kể cả câu tăng bộ đếm vừa
--   chạy ngay trước đó. Nếu hàm này ném lỗi khi sai mật khẩu thì `fail_count`
--   KHÔNG BAO GIỜ tăng được, và bộ chống dò mật khẩu trở thành đồ trang trí —
--   xanh vĩnh viễn, không phân biệt được với một bộ đếm chạy đúng.
--
--   Nên nó TRẢ VỀ TRẠNG THÁI: {ok:false, reason:'...'}. Giao dịch commit ⇒ bộ
--   đếm sống. Đây KHÔNG phải nuốt lỗi: tầng web bắt buộc phải đọc `reason`, và
--   `reason` lạ phải bị coi là HỎNG (chặn), không phải cho qua. Lỗi ngoài dự
--   kiến (mất kết nối, sai kiểu…) vẫn ném lên như thường.
--
create or replace function public.report_share_open(
  p_token   text,
  p_password text default null,
  p_ip_hash text default null,
  -- "Từ đâu" cho quyển sổ: vùng thô (thành phố/quốc gia do Vercel gắn sẵn vào
  -- mọi request, miễn phí — cùng nguồn với nhật ký đăng nhập #63) và loại máy.
  -- KHÔNG lưu IP thô của người ngoài: họ không phải người của tiệm.
  p_region  text default null,
  p_device  text default null
) returns jsonb
language plpgsql
security definer set search_path = public, pg_temp
as $$
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
end $$;

revoke execute on function public.report_share_open(text, text, text, text, text) from public;
grant  execute on function public.report_share_open(text, text, text, text, text) to anon, authenticated;

comment on function public.report_share_open(text, text, text, text, text) is
  'Cửa CÔNG KHAI mở một đường dẫn chia sẻ báo cáo (#295). Trả TRẠNG THÁI thay vì '
  'ném lỗi — ném lỗi sẽ cuộn ngược luôn bộ đếm chống dò (xem chú thích trong hàm). '
  'Chỉ đọc bảng report_shares + tenants; KHÔNG chạm bảng nghiệp vụ nào.';
