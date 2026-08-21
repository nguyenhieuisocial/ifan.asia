-- ════════════════════════════════════════════════════════════════════
-- GỬI THÔNG BÁO QUA EMAIL
-- ════════════════════════════════════════════════════════════════════
--
-- Hôm nay iFan báo được ba đường: chuông trong ứng dụng, đẩy lên điện thoại
-- (#315), và bắn về nhóm Telegram. Thiếu đúng đường mà người ở xa hay dùng
-- nhất — email.
--
-- ┌─ CỘT `emailed_at`, SONG SONG VỚI `pushed_at` ─────────────────────
-- Hai đường gửi độc lập nhau: đẩy hỏng thì email vẫn phải đi, và ngược lại.
-- Dùng chung một cột "đã gửi" nghĩa là hỏng một đường thì mất luôn đường kia.
--
-- ⚠️ ĐÁNH DẤU SẴN toàn bộ dòng đang có, y như đã làm với `pushed_at` ở #316.
--   Không đánh dấu thì lượt chạy đầu tiên gửi 1.786 email cho mỗi người —
--   và hộp thư của họ sẽ đánh dấu iFan là thư rác, vĩnh viễn. Đây là lỗi
--   không sửa lại được: một tên miền đã bị xếp vào thư rác thì mọi email sau
--   đó, kể cả email đặt lại mật khẩu, đều rơi vào đó.
--
-- ┌─ TUỲ CHỌN NẰM TRONG BẢNG CŨ ──────────────────────────────────────
-- `notification_prefs.pref` đã là một khối JSON cho tuỳ chọn thông báo (bot
-- Telegram dùng `enabled`, `kinds`, `digest_hour`). Email thêm khoá `email`
-- vào đúng khối đó — KHÔNG dựng bảng thứ hai. Hai bảng tuỳ chọn thông báo là
-- hai chỗ để về sau lệch nhau và không ai biết chỗ nào đang có hiệu lực.
--
-- ⚠️ MẶC ĐỊNH TẮT. Ngược với thông báo đẩy (mặc định "nhận đủ" vì người dùng
--   phải tự bật ở trình duyệt trước). Email thì không có bước xin phép nào —
--   bật sẵn nghĩa là tự tiện gửi thư cho người ta.

alter table public.notifications
  add column if not exists emailed_at timestamptz;

update public.notifications
   set emailed_at = created_at
 where emailed_at is null;

create index if not exists notifications_chua_email_idx
  on public.notifications (created_at)
  where emailed_at is null;

do $$
declare v_con int;
begin
  select count(*) into v_con from public.notifications where emailed_at is null;
  if v_con > 0 then
    raise exception 'Vẫn còn % thông báo cũ chưa đánh dấu — lượt gửi đầu sẽ dội email và làm iFan bị xếp vào thư rác', v_con;
  end if;
end $$;

comment on column public.notifications.emailed_at is
  'Đã gửi email lúc nào. Tách khỏi pushed_at vì hai đường gửi độc lập: đẩy hỏng thì email vẫn phải đi — #322.';
