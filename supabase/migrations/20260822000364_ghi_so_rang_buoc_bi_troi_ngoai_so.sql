-- ════════════════════════════════════════════════════════════════════
-- GHI SỔ MỘT RÀNG BUỘC ĐANG SỐNG NGOÀI SỔ
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠️ TÌM ĐƯỢC BẰNG CÁCH DỰNG LẠI, KHÔNG PHẢI BẰNG CÁCH ĐỌC.
--   Ngày 22/08 dựng kho kiểm riêng bằng cách áp lại toàn bộ 317 bản vá lên một
--   dự án trống, rồi SO TỪNG ĐỐI TƯỢNG với kho thật:
--     180 bảng · 1.659 cột · 494 chỉ mục · 681 hàm · 279 chính sách · 206 chốt
--     → giống hệt nhau.
--     985 vs 984 ràng buộc → **lệch đúng một cái**: `report_shares_payload_gon`.
--
--   Nó có trên kho thật, `grep` toàn bộ thư mục migration KHÔNG thấy dòng nào
--   tạo ra nó. Tức nó được áp thẳng vào kho thật, không qua sổ.
--
-- ⚠️ VÌ SAO PHẢI VÁ, dù nó "đang chạy tốt": ngày nào phải dựng lại kho từ đầu —
--   đổi vùng, khôi phục sau sự cố, tách kho kiểm như hôm nay — thì nó **biến
--   mất trong im lặng**. Không có lỗi, không có cảnh báo; chỉ là một lớp bảo vệ
--   không còn ở đó nữa. Đây đúng bệnh sổ sự thật đã ghi: kho từng có 44 bản áp
--   thẳng không ghi sổ.
--
-- ⚠️ NÓ BẢO VỆ CÁI GÌ: chặn payload của một báo cáo chia sẻ vượt 64KB. Không có
--   nó thì một bản ghi có thể phình tuỳ ý — và bảng này phục vụ LINK CÔNG KHAI,
--   tức thứ người ngoài tải về.
--
-- Viết theo kiểu THÊM-NẾU-CHƯA-CÓ để chạy được ở cả hai nơi: kho thật (đã có,
-- bỏ qua) và kho dựng mới (chưa có, tạo ra). Cố ý KHÔNG dùng `drop … then add`
-- — khuôn đó đã suýt làm gãy một chốt chéo tiệm hôm nay (#362).

do $chot$
begin
  if not exists (
    select 1 from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public'
      and cl.relname = 'report_shares'
      and con.conname = 'report_shares_payload_gon'
  ) then
    alter table public.report_shares
      add constraint report_shares_payload_gon
      check (pg_column_size(payload) <= 65536);
  end if;
end
$chot$;

comment on constraint report_shares_payload_gon on public.report_shares is
  'Payload của báo cáo chia sẻ tối đa 64KB. Bảng này phục vụ LINK CÔNG KHAI nên không được để phình tuỳ ý. Ràng buộc có từ trước nhưng SỐNG NGOÀI SỔ tới 22/08 — dựng lại kho từ migration là nó biến mất im lặng (#364).';
