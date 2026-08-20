-- Bản tin hằng ngày gửi founder đếm cả yêu cầu "Cần giúp" của TIỆM DEMO.
--
-- ═══════════════════════════════════════════════════════════════════
-- CÙNG MỘT LỖI, LẶP LẠI CÁCH ĐÓ HAI DÒNG
-- ═══════════════════════════════════════════════════════════════════
-- `daily_pulse()` có sẵn chú thích này ngay trong thân hàm:
--
--     -- #148: chỉ đếm khách của tiệm THẬT. Trước đây thiếu điều kiện này nên
--     -- khách của tiệm demo bị cộng vào, làm con số tự lừa mình về quy mô.
--     select count(*) into v_contacts from public.contacts c
--      where ... and exists (select 1 from public.tenants t
--                             where t.id = c.tenant_id and coalesce(t.is_sample,false) = false);
--
-- Nhưng **hai dòng ngay bên dưới** thì không có điều kiện ấy:
--
--     select count(*) into v_help from public.help_requests where created_at >= v_day_start;
--
-- ⇒ Founder mở tin buổi tối ra thấy "1 yêu cầu Cần giúp" và tưởng có khách
-- thật đang cầu cứu, trong khi đó là một tiệm mẫu. Đúng lớp bệnh việc #148:
-- **con số tự lừa mình**. Bài học đã học rồi, chỉ là áp thiếu một chỗ.
--
-- ═══════════════════════════════════════════════════════════════════
-- ĐO ĐƯỢC 20/08
-- ═══════════════════════════════════════════════════════════════════
--     help_requests: 2 dòng · CẢ HAI thuộc tiệm `is_sample = true` · 0 dòng của tiệm thật.
--
-- Cách phát hiện đáng nói: **cổng kiểm CI đỏ lên** khi tiệm mẫu được nạp dữ
-- liệu đầy đủ. Trước đó cả CSDL không có yêu cầu "Cần giúp" nào nên dòng thiếu
-- điều kiện này không bao giờ lộ. Dữ liệu mẫu giống đời thật chính là thứ làm
-- nó hiện ra — cùng cách mà bốn lỗi khác lộ ra trong ngày.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO KHÔNG ĐỘNG TỚI `tg_bridge_queue`
-- ═══════════════════════════════════════════════════════════════════
-- Đã đo: bảng đó **không có cột `tenant_id`** — nó là hàng chờ hỏi-đáp qua
-- Telegram ở tầng NỀN TẢNG, không thuộc tiệm nào. Không có gì để lọc, và thêm
-- điều kiện vào đó sẽ là bịa ra một mối quan hệ không tồn tại.

CREATE OR REPLACE FUNCTION public.daily_pulse()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                             at time zone 'Asia/Ho_Chi_Minh';
  v_tenants int;
  v_contacts int;
  v_asks int;
  v_help int;
  v_releases int;
  v_features int;
  v_loi_may int;
  v_body text;
begin
  -- Khách (giai đoạn này thường bằng 0 — vẫn phải nói ra)
  select count(*) into v_tenants from public.tenants
   where deleted_at is null and coalesce(is_sample,false) = false and created_at >= v_day_start;
  -- #148: chỉ đếm khách của tiệm THẬT. Trước đây thiếu điều kiện này nên khách
  -- của tiệm demo bị cộng vào, làm con số tự lừa mình về quy mô.
  select count(*) into v_contacts from public.contacts c
   where c.deleted_at is null and c.created_at >= v_day_start
     and exists (select 1 from public.tenants t
                  where t.id = c.tenant_id and coalesce(t.is_sample,false) = false);
  select count(*) into v_asks from public.tg_bridge_queue where created_at >= v_day_start;
  -- #219: y het dieu kien cua `v_contacts` o tren. Thieu no thi tiem MAU bam
  -- "Can giup" cung doi vao tin cua founder nhu khach that dang cau cuu.
  select count(*) into v_help from public.help_requests h
   where h.created_at >= v_day_start
     and exists (select 1 from public.tenants t
                  where t.id = h.tenant_id and coalesce(t.is_sample,false) = false);

  -- Sản phẩm — đếm từ chính hàng đợi tin, nguồn duy nhất đã có, không dựng
  -- bảng đếm mới (D2).
  select count(*) into v_releases from public.platform_outbox
   where kind = 'release' and created_at >= v_day_start;
  select count(*) into v_features from public.platform_outbox
   where kind = 'feature_change' and created_at >= v_day_start;

  -- Máy — việc chạy nền hỏng trong ngày.
  select count(*) into v_loi_may from public.platform_outbox
   where kind in ('system_alert', 'channel_down') and created_at >= v_day_start;

  -- Im CHỈ KHI cả ba phần rỗng.
  if v_tenants = 0 and v_contacts = 0 and v_help = 0 and v_asks = 0
     and v_releases = 0 and v_features = 0 and v_loi_may = 0 then
    return false;
  end if;

  v_body := '🌙 Tổng kết ' ||
            to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM');

  if v_releases > 0 or v_features > 0 then
    v_body := v_body || E'\n\nSản phẩm';
    if v_releases > 0 then
      v_body := v_body || E'\n· ' || v_releases ||
                case when v_releases = 1 then ' tin bản mới' else ' tin bản mới' end;
    end if;
    if v_features > 0 then
      v_body := v_body || E'\n· ' || v_features || ' lần danh sách mảng đổi trạng thái';
    end if;
  end if;

  v_body := v_body || E'\n\nKhách';
  if v_tenants = 0 and v_contacts = 0 and v_help = 0 and v_asks = 0 then
    -- Câu này là CHỦ ĐÍCH, không phải chỗ trống: im lặng phải có nghĩa.
    v_body := v_body || E'\n· chưa có tiệm mới, chưa có khách mới, chưa có yêu cầu Cần giúp';
  else
    if v_tenants > 0  then v_body := v_body || E'\n· ' || v_tenants  || ' tiệm mới đăng ký'; end if;
    if v_contacts > 0 then v_body := v_body || E'\n· ' || v_contacts || ' khách hàng mới'; end if;
    if v_help > 0     then v_body := v_body || E'\n· ' || v_help     || ' yêu cầu Cần giúp'; end if;
    if v_asks > 0     then v_body := v_body || E'\n· ' || v_asks     || ' câu hỏi gửi bot'; end if;
  end if;

  if v_loi_may > 0 then
    v_body := v_body || E'\n\nMáy\n· ' || v_loi_may ||
              ' việc chạy nền hỏng — xem chủ đề Kỹ thuật';
  end if;

  perform public.platform_notify('daily_pulse',
    'pulse:' || to_char(v_day_start, 'YYYY-MM-DD'), v_body);
  return true;
end $function$;

comment on function public.daily_pulse() is
  'Ban tin toi gui founder. #219: `help_requests` gio loc theo tiem THAT giong `contacts` — truoc do tiem mau bam "Can giup" cung doi vao tin founder nhu khach that cau cuu (do 20/08: 2/2 yeu cau deu cua tiem mau). Cung lop benh #148 "con so tu lua minh": bai hoc da ap cho contacts nhung sot dung dong ben duoi. `tg_bridge_queue` KHONG loc vi khong co cot tenant_id — no la hang cho tang nen tang. Than ham lay NGUYEN VAN ban dang chay, chi doi dung mot cau dem.';
