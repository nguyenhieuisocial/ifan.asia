-- ============================================================
-- iFan.asia — Migration #25: Chốt chặn chống spam KHÔNG còn tự mở toang
--
-- VẤN ĐỀ: lib/rate-limit.ts chỉ biết đếm bằng Upstash Redis; chưa cấu hình env
-- Upstash thì nó FAIL-OPEN (cho qua mọi request). Dự án đang chạy hạ tầng
-- 0đ/tháng nên env đó CHƯA BAO GIỜ có → mọi chốt dựng trên hàm đó (đăng nhập,
-- đăng ký, webhook Zalo, nút AI, kết nối kênh) thực tế BẰNG KHÔNG.
--
-- CÁCH SỬA: đưa bộ đếm xuống DB — đúng mẫu Live Chat (#23) và mã QR (#24) đã
-- dùng. DB luôn có mặt (app không chạy nổi nếu thiếu), nên bộ đếm không thể
-- "tự tắt" vì thiếu cấu hình.
--
--   public.app_rate_limits   -- bảng đếm cửa sổ trượt; RLS bật, KHÔNG policy
--   public.app_rate_limit()  -- RPC definer: đếm 1 nhịp, trả allowed/remaining
--   private.app_config['rate_limit_pepper']  -- muối băm khóa đếm
--
-- KHÔNG sửa/nới bất kỳ policy nào đang có.
-- ============================================================

-- ---------- Bảng đếm ----------
-- Không có tenant_id (không thuộc dữ liệu tenant nào), RLS bật và KHÔNG policy
-- nào → chỉ definer/service role chạm được. Giống hệt public.qr_scan_throttle.
-- Chỉ lưu BẢN BĂM CÓ MUỐI của khóa đếm: khóa gốc chứa IP hoặc user id, không
-- có lý do gì để nằm lại trong DB.
create table public.app_rate_limits (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 0
);
alter table public.app_rate_limits enable row level security;

-- Muối riêng từng môi trường, sinh NGAY TRONG DB — repo không chứa, và người
-- ngoài không tự tính được bucket của người khác để "đốt" quota giùm họ
-- (nếu bucket chỉ là băm trần của "signin:ip:1.2.3.4" thì bất kỳ ai cũng gọi
-- RPC đủ 10 lần để khóa cửa đăng nhập của một IP bất kỳ).
insert into private.app_config (key, value)
  values ('rate_limit_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (key) do nothing;

-- ---------- Bộ đếm cửa sổ trượt ----------
-- Trả {allowed, remaining}. Một lần gọi = một nhịp đếm (giống INCR của Redis).
-- Ngưỡng do phía gọi quyết định — hàm này chỉ đếm, không biết nghiệp vụ nào.
create or replace function public.app_rate_limit(
  p_key            text,
  p_limit          int,
  p_window_seconds int
) returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  -- Kẹp biên: người gọi qua PostgREST là anon, không cho tự đặt ngưỡng vô hạn
  -- hay cửa sổ dài vô tận để giữ bảng phình mãi.
  v_limit  constant int      := least(greatest(coalesce(p_limit, 1), 1), 100000);
  v_window constant interval := make_interval(
    secs => least(greatest(coalesce(p_window_seconds, 60), 1), 3600));
  v_bucket text;
  v_hits   int;
begin
  -- Khóa rác → CHẶN. Ở đây fail-closed là đúng: không có khóa hợp lệ thì không
  -- có gì để đếm, mà đã không đếm được thì không được cho qua.
  if p_key is null or length(p_key) between 1 and 200 is not true then
    return jsonb_build_object('allowed', false, 'remaining', 0);
  end if;

  v_bucket := encode(
    extensions.digest(
      coalesce((select value from private.app_config where key = 'rate_limit_pepper'), '')
        || ':' || p_key,
      'sha256'),
    'hex');

  insert into public.app_rate_limits as rl (bucket, window_start, hits)
  values (v_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case when rl.window_start > now() - v_window then rl.hits + 1 else 1 end,
    window_start = case when rl.window_start > now() - v_window
                        then rl.window_start else now() end
  returning rl.hits into v_hits;

  return jsonb_build_object(
    'allowed',   v_hits <= v_limit,
    'remaining', greatest(0, v_limit - v_hits));
end $$;

revoke execute on function public.app_rate_limit(text, int, int) from public;
-- anon BẮT BUỘC: chốt đăng nhập/đăng ký và webhook chạy TRƯỚC khi có phiên.
grant execute on function public.app_rate_limit(text, int, int) to anon, authenticated;

-- Dọn bộ đếm mỗi giờ (dòng quá 1 giờ không còn ý nghĩa với cửa sổ tối đa 1 giờ).
select cron.unschedule('app-rate-limit-cleanup')
  where exists (select 1 from cron.job where jobname = 'app-rate-limit-cleanup');
select cron.schedule('app-rate-limit-cleanup', '11 * * * *',
  $$delete from public.app_rate_limits where window_start < now() - interval '1 hour'$$);
