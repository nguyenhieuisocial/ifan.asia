-- ════════════════════════════════════════════════════════════════════
-- KHÔNG DỘI 1.786 THÔNG BÁO CŨ LÊN ĐIỆN THOẠI MỌI NGƯỜI
-- ════════════════════════════════════════════════════════════════════
--
-- #315 thêm cột `notifications.pushed_at` để nhịp đẩy biết dòng nào đã đẩy.
-- Nhưng **1.786 dòng đã có từ trước đều mang giá trị NULL** — tức là "chưa
-- đẩy". Nhịp đẩy chạy lần đầu sẽ coi cả 1.786 dòng đó là mới và dội hết lên
-- điện thoại của mọi người trong tiệm, gồm cả những lời nhắc từ nhiều tuần
-- trước.
--
-- Hậu quả nếu để lọt: mỗi người nhận hàng trăm thông báo trong vài phút, và
-- việc đầu tiên họ làm là TẮT THÔNG BÁO CỦA ỨNG DỤNG — vĩnh viễn. Một tính
-- năng tự giết mình ngay trong lần chạy đầu tiên.
--
-- Đây là cái bẫy kinh điển của mọi cột "đã xử lý" thêm sau: **giá trị NULL
-- của dữ liệu cũ mang nghĩa "chưa làm", trong khi sự thật là "không cần
-- làm"**. Phải phân biệt hai thứ đó NGAY, trước khi có bất kỳ nhịp nào chạy.
--
-- Đánh dấu MỌI dòng đang có là "đã đẩy". Chúng vẫn hiện đủ trong chuông của
-- ứng dụng — chỉ là không đẩy ngược về quá khứ.

update public.notifications
   set pushed_at = created_at
 where pushed_at is null;

-- Từ nay dòng mới sinh ra vẫn NULL và sẽ được nhịp đẩy nhặt đúng.
--
-- ⚠️ Nhịp đẩy CÒN PHẢI tự giới hạn theo thời gian nữa (chỉ nhặt dòng trong
--   vòng một giờ), không được chỉ dựa vào cột này. Lý do: nếu nhịp chết vài
--   ngày rồi sống lại, cột `pushed_at` vẫn NULL cho cả đống dòng cũ và đúng
--   cái bẫy trên lặp lại. Hai lớp chặn cho một lỗi không được phép xảy ra
--   lần hai.

do $$
declare v_con int;
begin
  select count(*) into v_con from public.notifications where pushed_at is null;
  if v_con > 0 then
    raise exception 'Vẫn còn % thông báo cũ chưa được đánh dấu — nhịp đẩy sẽ dội chúng lên điện thoại', v_con;
  end if;
end $$;
