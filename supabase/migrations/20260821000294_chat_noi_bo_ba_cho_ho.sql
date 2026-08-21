-- #294 — CHAT NỘI BỘ: BẤM VÀO THÔNG BÁO PHẢI MỞ THẲNG ĐÚNG VIỆC.
--
-- ════════════════════════════════════════════════════════════════════
-- LỖ ĐANG MỞ — chính thẻ design tự khai, không phải phát hiện mới
-- ════════════════════════════════════════════════════════════════════
--
-- `design-system/man-chat-noi-bo.html` hứa nguyên văn: "Bấm vào là mở thẳng
-- lịch hẹn đó, không phải đi tìm." Rồi ngay dưới, chính thẻ ghi mục "Đang
-- lệch": với ĐƠN HÀNG và HỒ SƠ KHÁCH thì đúng, với LỊCH HẸN và PHIẾU KHO thì
-- mới về tới danh sách.
--
-- Đo lại 21/08 trên hàm `internal_mentions_bao()` (migration #169):
--
--   lịch hẹn   → '/app/calendar?a=' || id     ⇒ `?a=` KHÔNG ai đọc. Màn Lịch chỉ
--                nhận `?date=`. Người bấm rơi về lịch CỦA HÔM NAY — mà buổi hẹn
--                được nhắc thường KHÔNG phải hôm nay. Sai ngày thì không những
--                "phải đi tìm", mà còn tìm ở đúng chỗ không có gì.
--
--   phiếu kho  → '/app/stock?d=' || id        ⇒ SAI CẢ TRANG. `/app/stock` là màn
--                tồn kho, KHÔNG hề nhúng khung trao đổi. Khung nằm ở
--                `/app/stock/purchases` (phiếu nhập) và `/app/stock/stocktake`
--                (phiếu kiểm kê, nhúng từ migration này trở đi). Người bấm vào
--                thông báo rơi xuống một trang không có lấy một chữ nào của
--                cuộc trao đổi vừa nhắc họ.
--
-- ════════════════════════════════════════════════════════════════════
-- BA ĐIỂM CHỐT
-- ════════════════════════════════════════════════════════════════════
--
-- (1) NGÀY CỦA BUỔI HẸN TÍNH THEO GIỜ TIỆM, không phải giờ máy chủ.
--     `start_at` là `timestamptz`; máy chủ Vercel chạy UTC. Suốt 7 tiếng mỗi
--     đêm (0h–7h giờ Việt Nam) `::date` trần sẽ ra NGÀY HÔM TRƯỚC — thông báo
--     dẫn sang đúng một ngày trống rồi người ta kết luận "chat hỏng". Đây là
--     đúng lớp lỗi đã cắn mặt tiền ngày 12/08 và cắn lại ở mục #192, nên dùng
--     lại y nguyên khuôn của migration #280:
--       (<mốc> at time zone coalesce(t.timezone, 'Asia/Ho_Chi_Minh'))::date
--
-- (2) "PHIẾU KHO" LÀ HAI CHỨNG TỪ, PHẢI HỎI MỚI BIẾT LÀ CÁI NÀO.
--     `internal_thread_doc_duoc()` đã coi `stock_doc` = `purchases` HOẶC
--     `stocktakes`. Link vì thế cũng phải rẽ hai nhánh. Hỏi `purchases` trước
--     rồi `stocktakes` — cùng thứ tự với hàm quyền, để hai chỗ không bao giờ
--     đọc ra hai kết luận khác nhau về cùng một mã.
--
-- (3) TRA KHÔNG RA THÌ VỀ DANH SÁCH, VÀ ĐÓ LÀ LỰA CHỌN CÓ Ý THỨC.
--     Việc bị xoá cứng / mã trỏ vào hư không thì không có trang chi tiết nào để
--     mở. Hai đường đi: bỏ trống `link` (thông báo không bấm được), hoặc về
--     danh sách. Chọn danh sách vì thông báo vẫn còn CHỮ của tin nhắn — người
--     đọc còn hiểu chuyện gì; một link chết thì họ mất luôn cả đường lần ra.
--     ⚠️ Đây KHÔNG phải nuốt lỗi: không có lỗi nào xảy ra, chỉ là việc đã biến
--     mất. Không có gì để báo ngoài chính sự vắng mặt đó.
--
-- ⚠️ KHÔNG ĐỔI GÌ KHÁC. Hàm này vẫn `security definer` (bảng `notifications`
--    không có policy INSERT cho client — migration #2), vẫn chỉ bắn thông báo
--    khi CÓ GỌI TÊN, vẫn treo trên `internal_mentions` chứ không treo trên
--    `internal_messages`. Quyết định 3 của thẻ không bị đụng tới một chữ.

create or replace function public.internal_mentions_bao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_body text;
  v_kieu text;
  v_viec uuid;
  v_link text;
  v_tz   text;
  v_ngay date;
begin
  select m.body, t.entity_type, t.entity_id
    into v_body, v_kieu, v_viec
    from public.internal_messages m
    join public.internal_threads  t on t.id = m.thread_id
   where m.id = new.message_id;

  -- Múi giờ của TIỆM — lấy một lần, dùng cho nhánh lịch hẹn.
  select coalesce(t.timezone, 'Asia/Ho_Chi_Minh') into v_tz
    from public.tenants t where t.id = new.tenant_id;
  v_tz := coalesce(v_tz, 'Asia/Ho_Chi_Minh');

  if v_kieu = 'order' then
    -- Đã đúng từ #169: đơn hàng có trang chi tiết riêng.
    v_link := '/app/orders/' || v_viec::text;

  elsif v_kieu = 'contact' then
    -- Đã đúng từ #169: hồ sơ khách có trang chi tiết riêng.
    v_link := '/app/contacts/' || v_viec::text;

  elsif v_kieu = 'appointment' then
    -- Màn Lịch KHÔNG có trang chi tiết cho từng buổi hẹn — nó là dòng thời gian
    -- theo NGÀY. Nên "mở thẳng" ở đây nghĩa là: mở đúng NGÀY có buổi hẹn đó
    -- (`?date=`), rồi trong ngày ấy nhảy tới đúng thẻ hẹn và bung khung trao đổi
    -- (`?a=` — màn đọc tham số này từ migration này trở đi).
    select (a.start_at at time zone v_tz)::date into v_ngay
      from public.appointments a
     where a.id = v_viec and a.deleted_at is null;

    if v_ngay is null then
      -- Buổi hẹn đã xoá mềm hoặc không còn: về lịch, không kèm ngày giả.
      v_link := '/app/calendar';
    else
      v_link := '/app/calendar?date=' || to_char(v_ngay, 'YYYY-MM-DD')
                || '&a=' || v_viec::text;
    end if;

  elsif v_kieu = 'stock_doc' then
    -- Hỏi `purchases` trước, `stocktakes` sau — CÙNG THỨ TỰ với
    -- `internal_thread_doc_duoc()`, để quyền đọc và đường dẫn không bao giờ
    -- kết luận khác nhau về cùng một mã.
    if exists (select 1 from public.purchases p where p.id = v_viec) then
      v_link := '/app/stock/purchases?d=' || v_viec::text;
    elsif exists (select 1 from public.stocktakes s where s.id = v_viec) then
      v_link := '/app/stock/stocktake?d=' || v_viec::text;
    else
      -- Chứng từ không còn: về màn Kho (cửa chung của cả hai loại phiếu).
      v_link := '/app/stock';
    end if;
  end if;

  insert into public.notifications (tenant_id, user_id, type, title, body, link)
  values (new.tenant_id, new.mentioned_user_id, 'internal_mention',
          'Có người nhắc tên bạn trong trao đổi nội bộ',
          left(coalesce(v_body, ''), 300), v_link);

  return null;
end;
$$;

comment on function public.internal_mentions_bao() is
  'Thẻ man-chat-noi-bo quyết định 3 + lời hứa "bấm vào là mở thẳng việc đó". #294 vá hai nhánh sai của #169: lịch hẹn nay kèm NGÀY tính theo giờ TIỆM (?date=&a=), phiếu kho nay rẽ đúng /app/stock/purchases hoặc /app/stock/stocktake thay vì /app/stock (trang không hề nhúng khung trao đổi).';
