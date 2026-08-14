-- Migration #124 — chủ đề "im lặng" tự khai còn sống, không để ai đoán (ADR-0007 mục 12c).
--
-- Founder (14/08): "Các Chủ Đề còn lại không thấy có thông báo tự động gì!"
--
-- ĐO THẬT (không đoán): help_request · billing · churn · system_alert ·
-- channel_down · weekly_pulse CHƯA BAO GIỜ có tin. Phần lớn là ĐÚNG SỰ THẬT
-- (chưa khách trả tiền ⇒ không có tin gói cước; chưa tiệm nào bỏ; chưa kênh
-- nào chết) — không phải hỏng. Nhưng người đọc KHÔNG PHÂN BIỆT ĐƯỢC "chưa có
-- gì xảy ra" với "hỏng, không ai báo" — hai trạng thái trông y hệt nhau khi
-- cùng là im lặng. Đúng con bệnh cả ngày 14/08 đi vá ở chỗ khác (sổ sự thật,
-- ADR, máy đo) — nay lặp lại đúng hình đó ở chuông báo.
--
-- CÁCH CHỮA: KHÔNG tự phán "hỏng hay chưa xảy ra" (máy không đủ dữ kiện để
-- phán đúng, phán bừa thì tệ hơn không phán) — chỉ TỰ KHAI trạng thái quan
-- sát được: "lần cuối có tin lúc nào". Người đọc tự phán tiếp bằng bối cảnh
-- họ có mà máy không có (VD: "billing chưa từng có tin" + "biết mình chưa
-- có khách trả tiền" → founder tự kết luận đó là chuyện bình thường).
--
-- ⚠️ Đặt ở BẢN TIN TUẦN, không phải bản tin ngày: mục 12a đã cảnh báo tiếng
-- ồn giết cảnh báo — báo trạng thái "vẫn im" mỗi NGÀY sẽ khiến người ta lướt
-- qua đúng dòng đáng đọc nhất khi nó thật sự đổi. Tuần một lần đủ để phát
-- hiện sớm, không đủ dày để thành phông nền bị lờ đi.

create or replace function public.weekly_pulse()
returns boolean
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_end timestamptz := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                       at time zone 'Asia/Ho_Chi_Minh';
  v_start timestamptz := v_end - interval '7 days';
  v_prev timestamptz := v_end - interval '14 days';
  v_t int; v_t_prev int; v_c int; v_c_prev int; v_ask int; v_fail int;
  v_body text;
  mui text;
  v_kind text;
  v_last timestamptz;
  v_bao_cao text := '';
begin
  select count(*) into v_t from public.tenants
   where deleted_at is null and coalesce(is_sample,false)=false
     and created_at >= v_start and created_at < v_end;
  select count(*) into v_t_prev from public.tenants
   where coalesce(is_sample,false)=false and created_at >= v_prev and created_at < v_start;
  select count(*) into v_c from public.contacts
   where deleted_at is null and created_at >= v_start and created_at < v_end;
  select count(*) into v_c_prev from public.contacts
   where created_at >= v_prev and created_at < v_start;
  select count(*) into v_ask from public.tg_bridge_queue
   where created_at >= v_start and created_at < v_end;
  select count(*) into v_fail from public.platform_outbox
   where kind in ('user_failure','system_alert') and created_at >= v_start and created_at < v_end;

  v_body := '📈 Tuần qua ở iFan';
  if v_t = 0 and v_c = 0 and v_ask = 0 then
    v_body := v_body || E'\n· Tuần này chưa có tiệm mới, khách mới, hay câu hỏi gửi bot.';
  else
    mui := case when v_t > v_t_prev then ' ↑' when v_t < v_t_prev then ' ↓' else '' end;
    v_body := v_body || E'\n· Tiệm mới: ' || v_t || ' (tuần trước ' || v_t_prev || ')' || mui;
    mui := case when v_c > v_c_prev then ' ↑' when v_c < v_c_prev then ' ↓' else '' end;
    v_body := v_body || E'\n· Khách hàng mới: ' || v_c || ' (tuần trước ' || v_c_prev || ')' || mui;
    if v_ask > 0 then v_body := v_body || E'\n· Câu hỏi gửi bot: ' || v_ask; end if;
  end if;
  if v_fail > 0 then v_body := v_body || E'\n· ⚠️ Cảnh báo hỏng trong tuần: ' || v_fail; end if;

  -- Tự khai từng loại tin CHƯA từng phát trong 30 ngày qua — không phán,
  -- chỉ nói lần cuối là khi nào (hoặc "chưa từng"), người đọc tự phán tiếp.
  for v_kind in select unnest(array['help_request','billing','churn','system_alert','channel_down'])
  loop
    select max(created_at) into v_last from public.platform_outbox
     where kind = v_kind and created_at > v_end - interval '30 days';
    if v_last is null then
      v_bao_cao := v_bao_cao || E'\n· ' || v_kind || ': chưa từng có tin (30 ngày qua)';
    end if;
  end loop;
  if v_bao_cao <> '' then
    v_body := v_body || E'\n\n🔎 Các luồng vẫn im lặng — không rõ là "chưa có gì xảy ra" hay bị nghẽn, tự kiểm khi rảnh:' || v_bao_cao;
  end if;

  perform public.platform_notify('weekly_pulse',
    'week:' || to_char(v_start, 'IYYY-IW'), v_body);
  return true;
end $$;

revoke all on function public.weekly_pulse() from public;

comment on function public.weekly_pulse() is
  'Migration #124: LUÔN gửi (bỏ điều kiện "có hoạt động mới gửi" của bản #103) — im lặng tuần này CŨNG là tín hiệu đáng biết, không phải lý do để chính bản tin im theo. Phần tự khai 5 loại tin chưa từng phát — xem ADR-0007 mục 12c.';
