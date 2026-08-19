-- Mở lại đúng MỘT bước chuyển mà #207 siết quá tay: `completed → cancelled`.
--
-- ═══════════════════════════════════════════════════════════════════
-- HAI BẢN VÁ CÙNG ĐÊM MÂU THUẪN NHAU — ghi ra để không ai lặp lại
-- ═══════════════════════════════════════════════════════════════════
-- #206 dựng nhánh **trừ ngược hoa hồng khi đơn RỜI `completed`** (lỗ "huỷ đơn
-- đã xong mà hoa hồng vẫn còn"). #207 dựng máy trạng thái và chốt `completed`
-- là **điểm cuối** — tức bước chuyển mà #206 vừa xây xong đường xử lý cho nó
-- **không bao giờ xảy ra được nữa**.
--
-- Cả hai nhánh đều đo kỹ phần của mình. Không nhánh nào sai trong phạm vi của
-- nó. Cái sai nằm ở chỗ **tôi áp cả hai mà không đối chiếu chúng với nhau**.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO CHỌN #207 SAI, KHÔNG PHẢI #206
-- ═══════════════════════════════════════════════════════════════════
-- #207 dựng bảng chuyển bằng cách **đọc màn hình**: nút Huỷ trên màn Đơn hàng
-- chỉ hiện với đơn Nháp / Đã xác nhận ⇒ nó kết luận `completed` là điểm cuối.
-- Suy luận hợp lý, nhưng **màn hình không phải nguồn sự thật duy nhất**:
--
--   · Trigger kho `orders_sinh_dong_kho` (#150) **có sẵn nhánh
--     `completed → cancelled`** để TRẢ HÀNG VỀ KHO.
--   · `rls-smoke` có phép khẳng định **cố ý**, đặt tên rõ ràng:
--     *"V4 ca4 — huỷ đơn đã chốt → hàng về kho, tồn = 11"*.
--   · #206 vừa thêm nhánh trừ ngược hoa hồng cho đúng bước đó.
--
-- Ba nơi độc lập cùng nói: **huỷ một đơn đã chốt LÀ hành vi sản phẩm có thật**,
-- chỉ là chưa có nút trên màn. Một cổng chặn đứng chặn mất hành vi đã có, đã
-- được kiểm, và đang có mã xử lý — đó là **bước lùi**, không phải bản vá.
--
-- ⇒ Mở lại đúng một bước `completed → cancelled`. GIỮ NGUYÊN mọi phần còn lại
-- của #207, vì phần đó chặn đúng chỗ đau đã đo được:
--     `cancelled → confirmed → completed`  (hồi sinh đơn đã huỷ ⇒ sinh hoa
--     hồng lần hai + trừ kho lần hai — đo được 20.000đ và 6 đơn vị tồn)
--     `completed → draft`                  (hạ đơn đã xong để xoá dòng hàng,
--     mở đúng khoá `order_lines_lock_guard`)
--     `draft → completed`                  (nhảy cóc, bỏ qua bước xác nhận)
--
-- ═══════════════════════════════════════════════════════════════════
-- LUẬT RÚT RA
-- ═══════════════════════════════════════════════════════════════════
-- Dựng máy trạng thái thì **đọc màn hình là chưa đủ**. Phải hỏi thêm hai chỗ:
-- trigger nào đang xử bước đó, và bộ kiểm nào đang khẳng định bước đó chạy
-- được. Hành vi có mã xử lý và có bộ kiểm canh thì nó **đã là sự thật của sản
-- phẩm**, dù chưa có nút bấm.
--
-- Và: hai bản vá viết song song thì người ÁP phải đối chiếu chúng với nhau
-- trước khi áp — mỗi nhánh chỉ nhìn thấy phần việc của mình.

create or replace function public.orders_status_transition_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Ghi lại đúng trạng thái cũ (câu UPDATE có nhắc tên cột status nhưng không
  -- đổi giá trị) ⇒ không phải phép chuyển, cho qua.
  if new.status is not distinct from old.status then return new; end if;

  if old.status = 'draft'     and new.status in ('confirmed', 'cancelled') then return new; end if;
  if old.status = 'confirmed' and new.status in ('completed', 'cancelled') then return new; end if;
  -- Huỷ một đơn ĐÃ CHỐT: trả hàng về kho (trigger #150) và trừ ngược hoa hồng
  -- (#206). Chưa có nút trên màn, nhưng là hành vi sản phẩm có thật — xem khối
  -- chú thích đầu file.
  if old.status = 'completed' and new.status = 'cancelled' then return new; end if;

  raise exception
    'order_status_transition: đơn % đang "%" thì không chuyển sang "%" được. Đường hợp lệ: draft→confirmed→completed; huỷ được từ draft/confirmed/completed. KHÔNG lùi đơn đã huỷ hay đã xong về trạng thái trước — sửa sai thì lập phiếu mới.',
    new.id, old.status, new.status
    using errcode = '23514';
end
$$;

comment on function public.orders_status_transition_guard() is
  'Máy trạng thái đơn hàng. draft→confirmed→completed; huỷ được từ cả ba. CẤM mọi bước lùi (đo 20/08: hồi sinh đơn đã huỷ sinh hoa hồng lần hai + trừ kho 6 đơn vị; hạ đơn đã xong về nháp mở khoá xoá dòng hàng). #207 ban đầu chốt `completed` là điểm cuối — SAI, vì trigger kho #150 và phép kiểm rls-smoke V4 ca4 đều đã xử bước completed→cancelled; #211 mở lại đúng bước đó.';
