-- VÁ: băng-rôn "Bản mới đã lên" chết câm ~12 tiếng vì MỘT câu xoá thiếu `where`.
--
-- ═══════════════════════════════════════════════════════════════════
-- CHUYỆN GÌ ĐÃ XẢY RA
-- ═══════════════════════════════════════════════════════════════════
-- `release_digest()` (migration #137) gom hàng chờ bằng
--     with lay as (delete from private.release_pending returning *)
-- Câu xoá KHÔNG có `where`. Supabase bật chốt chặn `safeupdate` cho vai mà cửa
-- công khai (PostgREST) dùng — nó TỪ CHỐI mọi UPDATE/DELETE không có `where`,
-- kể cả bên trong hàm `security definer`: chốt này đọc thiết lập của PHIÊN, chứ
-- không đọc quyền của hàm.
--
-- Hậu quả dây chuyền: `release_digest` vỡ ⇒ `tg_release_mark` gọi nó cũng vỡ ⇒
-- CẢ GIAO DỊCH bị huỷ, kéo theo cả dòng ghi "mã bản đang chạy". Lượt sau vào
-- lại vẫn thấy mã cũ, lại vỡ, lại huỷ — kẹt vĩnh viễn. Web vẫn lên bản đều suốt
-- 12 tiếng mà không một tiếng báo nào, và KHÔNG có gì kêu. Người phát hiện là
-- founder, bằng cách tự thấy Telegram im.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO SUÝT NỮA KHÔNG BẮT ĐƯỢC
-- ═══════════════════════════════════════════════════════════════════
-- Tôi đã chạy thử `tg_release_mark` bằng tay và nó CHẠY TỐT — vì tôi nối thẳng
-- vào CSDL bằng vai quản trị, nơi chốt `safeupdate` không áp. Một phép thử đi
-- bằng CỬA KHÁC với đường thật thì chứng minh sai chuyện, và suýt dẫn tôi đi
-- kết luận "hàm không sao".
-- Thứ chỉ đúng thủ phạm là bản vá "bắt nhịp phải NÓI RA mình vừa làm gì": ngay
-- lượt gọi đầu sau khi lên bản, nó trả về nguyên văn câu lỗi.
-- Hai bài học, đã ghi thành cổng kiểm `scripts/soat-xoa-khong-dieu-kien.mjs`:
--   1. Thử lại lỗi phải đi ĐÚNG CỬA mà sự cố đi qua.
--   2. Nuốt lỗi vào log máy chủ = không có lỗi nào cả, vì không ai đọc log đó.
--
-- ═══════════════════════════════════════════════════════════════════
-- SỬA
-- ═══════════════════════════════════════════════════════════════════
-- `where true` giữ nguyên nghĩa "lấy hết hàng chờ" và thoả chốt chặn. Không đổi
-- một ly hành vi: vẫn lấy-và-dọn trong CÙNG một câu lệnh nên hai lượt chạy song
-- song không thể gộp trùng một dòng.
-- Thân hàm dưới đây lấy nguyên văn từ bản ĐANG CHẠY trên CSDL (không chép lại
-- từ file migration cũ — file cũ có thể đã bị bản sau đè).

CREATE OR REPLACE FUNCTION public.release_digest()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_n int;
  v_dong text;
  v_sha_cuoi text;
  v_co_bi_loai boolean;
  v_tu timestamptz;
  v_den timestamptz;
  v_dau text;
begin
  with lay as (
    delete from private.release_pending where true returning *
  )
  select count(*),
         string_agg(
           '· ' || coalesce(
             nullif(btrim(l.cau_founder), ''),
             case l.loai
               when 'feat'     then '✨ Thêm mới: '
               when 'fix'      then '🐞 Sửa lỗi: '
               when 'security' then '🔒 Bảo mật: '
               when 'design'   then '🎨 Giao diện: '
               when 'perf'     then '⚡ Chạy nhanh hơn: '
               when 'docs'     then '📄 Tài liệu: '
               when 'test'     then '🧪 Kiểm thử: '
               when 'refactor' then '🧹 Dọn code: '
               when 'chore'    then '🔧 Lặt vặt: '
               else ''
             end || coalesce(nullif(btrim(l.tieu_de), ''), '(không có mô tả)')
           ),
           E'\n' order by l.created_at
         ),
         max(l.sha), bool_or(l.cau_bi_loai), min(l.created_at), max(l.created_at)
    into v_n, v_dong, v_sha_cuoi, v_co_bi_loai, v_tu, v_den
    from lay l;

  if coalesce(v_n, 0) = 0 then return false; end if;

  -- Một bản thì viết số ít; nhiều bản thì ghi rõ khoảng giờ để founder biết
  -- đây là tin gộp, không phải một bản duy nhất.
  v_dau := case
    when v_n = 1 then '🚀 iFan vừa lên bản mới — ' ||
      to_char(v_den at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI "ngày" DD/MM')
    else '🚀 iFan vừa lên ' || v_n || ' bản mới — ' ||
      to_char(v_tu  at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') || '–' ||
      to_char(v_den at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI "ngày" DD/MM')
  end;

  -- Khoá chống trùng theo MÃ BẢN CUỐI, không theo mốc giờ: trong cùng một giờ
  -- có thể phát hai lần (job giờ, rồi một bản ưu tiên flush) — khoá theo giờ sẽ
  -- làm tin thứ hai bị bỏ IM LẶNG.
  perform public.platform_notify('release', 'reldigest:' || left(v_sha_cuoi, 7),
    v_dau || E'\n\n' || v_dong ||
    case when v_co_bi_loai
      then E'\n\n⚠️ Có bản viết câu gửi anh sai khuôn (không dấu, hoặc chép lại ' ||
           'lời anh) nên tôi bỏ câu đó và lấy tạm từ tiêu đề.'
      else '' end ||
    E'\n\nmã bản cuối ' || left(v_sha_cuoi, 7));
  return true;
end $function$
;
