-- CHẶN Ở GỐC: giảm giá không được lớn hơn giá trị dòng hàng.
--
-- ═══════════════════════════════════════════════════════════════════
-- LỖ — nhân viên tự ăn hoa hồng bằng một phiếu hoàn khống
-- ═══════════════════════════════════════════════════════════════════
-- Một nhân viên vai THẤP NHẤT (`staff`) tạo phiếu hoàn, ghi khoản giảm giá
-- LỚN HƠN giá trị dòng hàng, gắn tên mình vào dòng, bấm Xong — và **được cộng
-- hoa hồng DƯƠNG từ một phiếu TRẢ TIỀN cho khách**. Không cần vào màn nào,
-- gọi thẳng API là đủ.
--
-- Đo thật trên CSDL (giao dịch rồi rollback), đóng vai `staff`:
--
--   ghi dòng hoàn giảm 1.500.000 trên dòng 1.000.000  => ĐƯỢC
--   line_total_vnd                                     => +500.000  ⚠️ DƯƠNG
--   hoa hồng sinh từ phiếu hoàn                        => base 500.000, +25.000
--   TỔNG hoa hồng cả tiệm sau phiếu hoàn khống         => +25.000
--   ĐỐI CHỨNG: cùng mức giảm ở ĐƠN BÁN                 => bị chặn (trần giảm giá)
--
-- ═══════════════════════════════════════════════════════════════════
-- HAI THAY ĐỔI CÙNG NGÀY, MỖI CÁI RIÊNG LẺ ĐỀU VÔ HẠI
-- ═══════════════════════════════════════════════════════════════════
--   · #183 — trần giảm giá CỐ Ý miễn cho `kind = 'return'`. Đúng lúc đó:
--     `createReturn` chép giảm giá theo tỷ lệ, bắt đi đường duyệt là gãy luồng.
--   · #198 — cột sinh đổi sang `sign(qty) × (|qty|·đơn_giá − giảm)`. Công thức
--     CŨ ở dòng phiếu hoàn LUÔN ra số âm dù giảm bao nhiêu; công thức MỚI
--     **lật dấu thành dương** ngay khi giảm > giá dòng.
--
-- Ghép lại: cửa ghi để mở (#183) + giá trị lật dấu (#198) = doanh số dương từ
-- phiếu hoàn. Không thay đổi nào SAI khi xét riêng — cái sai nằm ở CHỖ GHÉP,
-- và không cổng kiểm nào của kho canh chỗ ghép.
--
-- ═══════════════════════════════════════════════════════════════════
-- TÔI ĐÃ QUYẾT SAI Ở #198, GHI RA ĐỂ KHÔNG AI LẶP LẠI
-- ═══════════════════════════════════════════════════════════════════
-- Chú thích #198 viết: *"KHÔNG kẹp về 0 (không `greatest(…, 0)` như #195)…
-- ở đây `greatest` sẽ GIẤU MẤT dữ liệu hỏng thay vì để nó hiện ra."*
--
-- Nguyên tắc đó đúng. **Áp dụng thì sai** — vì dữ liệu hỏng chẳng "hiện ra" ở
-- đâu cả: nó chảy thẳng vào hoa hồng, lãi gộp, file Excel và tổng đơn dưới dạng
-- **một con số trông hoàn toàn bình thường**. Không ai nhìn thấy gì để mà nghi.
--
-- Bài học: "để dữ liệu hỏng hiện ra" chỉ có nghĩa khi CÓ CHỖ nó hiện ra. Không
-- có chỗ đó thì không-kẹp chỉ là để dữ liệu hỏng đi xa hơn.
--
-- ⇒ Cách vá GIỮ NGUYÊN nguyên tắc, đổi chỗ áp: **chặn ngay tại nơi dữ liệu hỏng
-- SINH RA**, thay vì làm tròn tại nơi nó bị ĐỌC. Ràng buộc dưới đây không giấu
-- gì — nó không cho dòng hỏng tồn tại.
--
-- Đã đo trước khi áp: **170 dòng hàng hiện có, 0 dòng vi phạm** ⇒ áp được ngay,
-- không phải dọn dữ liệu cũ.

alter table public.order_lines
  add constraint order_lines_giam_khong_vuot_gia_dong
  check (discount_vnd <= abs(qty) * unit_price_vnd);

comment on constraint order_lines_giam_khong_vuot_gia_dong on public.order_lines is
  'Giảm giá không được lớn hơn giá trị dòng. Chặn ở GỐC thay vì kẹp `greatest(…,0)` ở cột sinh: dòng hỏng không được phép tồn tại, thay vì bị làm tròn lúc đọc. Không có chốt này thì dòng PHIẾU HOÀN lật dấu thành DƯƠNG và sinh hoa hồng ảo (#202; xem #183 miễn trần cho phiếu hoàn và #198 đổi công thức cột sinh).';
