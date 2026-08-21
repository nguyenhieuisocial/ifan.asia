-- ════════════════════════════════════════════════════════════════════
-- #344 — BỎ `so_lieu_theo_ngay`: NÓ TRÙNG VỚI THỨ ĐÃ CÓ
-- ════════════════════════════════════════════════════════════════════
-- Bản vá #343 thêm `so_lieu_theo_ngay` để vẽ biểu đồ doanh thu theo ngày.
-- Viết xong mới thấy `dashboard_sales` ĐÃ tính đúng con số đó từ lâu, cùng
-- nguồn (đơn hàng), cùng cách lấy ngày (`created_at`), và màn Tổng quan đã
-- dùng nó để vẽ biểu đồ.
--
-- ⚠️ HAI HÀM CÙNG TÍNH MỘT CON SỐ LÀ MỘT CÁI BẪY, KHÔNG PHẢI MỘT LỰA CHỌN.
--   Sớm muộn ai đó sửa điều kiện lọc ở một bên (thêm `deleted_at`, đổi trạng
--   thái đơn, đổi múi giờ) và quên bên kia. Lúc đó hai màn hiện hai con số
--   doanh thu khác nhau cho cùng một ngày, và không ai biết tin cái nào.
--
-- ⇒ Giữ `dashboard_sales`. Xoá cái vừa thêm.
--
-- `so_lieu_hom_nay` (#343) thì GIỮ — nó tính thứ chưa ai tính: bốn con số của
-- hôm nay kèm mốc so sánh, và mức huỷ hẹn "thường ngày" theo trung vị 14 ngày.

drop function if exists public.so_lieu_theo_ngay(integer);
