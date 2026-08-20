-- #282 — Đơn phải BẮT ĐẦU TỪ NHÁP. Không ai được tạo thẳng một đơn đã hoàn tất.
--
-- ════════════════════════════════════════════════════════════════════
-- LỖ ĐANG MỞ, và nó rộng hơn cái đã được nêu
-- ════════════════════════════════════════════════════════════════════
--
-- Ba việc quan trọng nhất của một đơn hàng đều gắn vào lệnh ĐỔI TRẠNG THÁI,
-- không gắn vào lệnh tạo:
--   · sinh hoa hồng cho người làm     (orders_sinh_hoa_hong)
--   · trừ kho theo dòng hàng          (orders_sinh_dong_kho)
--   · quyết toán điểm tích luỹ        (orders_quyet_toan_diem_hoan)
--
-- Nghĩa là một đơn được tạo THẲNG ở trạng thái hoàn tất sẽ: không ai được hoa
-- hồng, kho không trừ một món nào, điểm của khách không cộng — mà đơn vẫn nằm
-- đó như một đơn bình thường, vẫn vào doanh thu. Không có một tiếng báo nào.
--
-- Báo cáo ban đầu chỉ nêu phần hoa hồng. Đo lại thì thấy cả ba, nên chữa theo
-- cái rộng hơn: hoa hồng là tiền của nhân viên, kho là hàng thật trong tiệm,
-- điểm là lời hứa với khách — hỏng cái nào cũng phải đi xin lỗi.
--
-- ĐO 21/08 trên cơ sở dữ liệu thật: chèn thẳng một đơn `status='completed'`
-- KHÔNG bị chặn, và đếm được 0 dòng hoa hồng. Lỗ có thật, không phải giả định.
-- Chưa ai dính vì hiện chưa có màn nào tạo đơn kiểu đó — nhưng "chưa có màn
-- nào" là thứ thay đổi sau đúng một lần ai đó viết tính năng mới.
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO CHẶN, chứ không cho ba cái kia chạy luôn lúc tạo
-- ════════════════════════════════════════════════════════════════════
--
-- Cách kia nghe gọn hơn nhưng SAI ở đúng ca sẽ cần tới nó nhất: nhập đơn CŨ từ
-- phần mềm khác sang. Lúc đó người ta muốn giữ nguyên lịch sử, KHÔNG muốn trừ
-- kho lại (hàng đã bán từ năm ngoái) và KHÔNG muốn sinh hoa hồng lại (đã trả
-- lương rồi). Cho trigger chạy khi tạo là biến một lượt nhập dữ liệu thành một
-- lượt trừ kho khống.
--
-- Nên: chặn hẳn, và chặn có tiếng. Ngày nào làm tính năng nhập đơn lịch sử thì
-- mở một đường riêng có chủ đích, và LÚC ĐÓ mới phải quyết rõ đơn nhập vào có
-- sinh hoa hồng / trừ kho hay không — một câu hỏi nghiệp vụ, đáng được hỏi
-- thẳng chứ không nên trả lời ngầm bằng một dòng mã viết vội.
--
-- ĐÃ SOÁT TOÀN KHO trước khi chặn — không đường nào đang bị cắt oan:
--   · `app/app/orders/actions.ts` — cả hai chỗ tạo đơn (đơn thường và phiếu
--     hoàn) đều KHÔNG đặt trạng thái, tức là nhận mặc định `draft`;
--   · các bộ dữ liệu mẫu và các bộ kiểm đều ghi thẳng `'draft'` rồi mới đổi.
-- Nếu sau này có chỗ bị chặn, đó chính là chỗ đang mắc lỗi này.

create or replace function public.orders_bat_dau_tu_nhap()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.status is distinct from 'draft' then
    raise exception 'don_phai_bat_dau_tu_nhap'
      using hint = 'Tạo đơn ở trạng thái nháp rồi mới chuyển sang trạng thái mong muốn — '
                   'hoa hồng, trừ kho và điểm tích luỹ đều sinh ra ở bước CHUYỂN, '
                   'nên tạo thẳng là bỏ qua cả ba (xem migration #282).';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_bat_dau_tu_nhap on public.orders;
create trigger orders_bat_dau_tu_nhap
before insert on public.orders
for each row execute function public.orders_bat_dau_tu_nhap();

comment on function public.orders_bat_dau_tu_nhap() is
  'Đơn chỉ được tạo ở trạng thái nháp. Hoa hồng / trừ kho / điểm đều gắn vào '
  'lệnh ĐỔI trạng thái, nên tạo thẳng ở trạng thái khác là bỏ qua cả ba — #282.';
