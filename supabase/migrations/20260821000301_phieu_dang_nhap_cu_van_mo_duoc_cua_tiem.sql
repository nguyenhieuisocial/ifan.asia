-- #301 — NGƯỜI VỪA BỊ GỠ KHỎI TIỆM VẪN ĐỌC ĐƯỢC, VÀ MIGRATION #280 ĐÃ NÓI SAI.
--
-- ════════════════════════════════════════════════════════════════════
-- LỜI KHẲNG ĐỊNH SAI, GHI NGUYÊN VĂN VÌ NÓ MỚI LÀ BÀI HỌC
-- ════════════════════════════════════════════════════════════════════
--
-- Migration #280 (sáng nay) viết nguyên văn:
--
--   "đã đo `current_tenant_id()` — hàm mà mọi luật đọc/ghi của mọi bảng đều
--    gọi — CÓ lọc theo trạng thái tư cách. Đặt `status='removed'` là người đó
--    không đọc được gì nữa."
--
-- **Câu đó đúng một nửa, và nửa sai là nửa quan trọng.** Hàm có HAI nhánh:
--
--   nhánh 1 (ưu tiên): đọc thẳng mã tiệm từ phiếu đăng nhập — KHÔNG hỏi lại
--                      tư cách thành viên còn hay mất
--   nhánh 2 (dự phòng): tra `tenant_members` … `status = 'active'` ✅
--
-- Phép đo hồi #280 rơi trúng nhánh 2 nên thấy đúng. Người thật đăng nhập bằng
-- giao diện thì phiếu LUÔN mang sẵn mã tiệm ⇒ luôn đi nhánh 1.
--
-- Đo lại hôm nay, dựng một nhân viên mới rồi gỡ ngay trong một giao dịch:
--   · còn làm  → đọc được 1 kênh chat
--   · vừa bị gỡ → **vẫn đọc được 1 kênh chat**
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO ĐÂY KHÔNG PHẢI "LỖ NHỎ, CÓ LỚP KHÁC BỊT RỒI"
-- ════════════════════════════════════════════════════════════════════
--
-- Tầng web CÓ bịt, bằng `getCurrentMembership()` (xem `lib/auth/membership.ts`,
-- ghi rõ khoảng hở ~1 giờ tới lúc phiếu hết hạn). Nhưng:
--
--   · lớp bịt ấy nằm ở **giao diện**. Phiếu đăng nhập vẫn còn hiệu lực, và ai
--     cầm nó gọi thẳng vào cửa dữ liệu thì không đi qua giao diện nào cả.
--   · kho này có bất biến: *"ẩn nút chỉ là phép lịch sự, chặn thật nằm ở CSDL"*.
--     Một lời hứa cỡ "nghỉ việc là mất quyền ngay" mà chỉ có ở tầng web thì
--     đúng bằng một cái nút bị ẩn.
--   · lỗ này áp cho **MỌI BẢNG** trong kho, không riêng chat — vì
--     `current_tenant_id()` là hàm mọi luật đều gọi.
--
-- Người vừa bị cho nghỉ trong một giờ đầu là đúng lúc họ có động cơ nhất.
--
-- ════════════════════════════════════════════════════════════════════
-- BẢN VÁ, VÀ VÌ SAO NÓ RẺ
-- ════════════════════════════════════════════════════════════════════
--
-- Nhánh 1 giữ nguyên tốc độ đọc claim, chỉ thêm một phép hỏi: mã tiệm trong
-- phiếu có ứng với một tư cách thành viên CÒN HIỆU LỰC không. Đó là một lần
-- tra khoá chính `(tenant_id, user_id)` — rẻ nhất mà Postgres có.
--
-- Hàm vẫn `stable`, nên trong một câu truy vấn nó chạy đúng một lần (quy ước
-- của kho là bọc `(select public.current_tenant_id())` trong policy để
-- Postgres cache initplan — đã áp ở toàn bộ policy hiện có).
--
-- ⚠️ ĐƯỜNG MÁY CHỦ KHÔNG BỊ ẢNH HƯỞNG: việc chạy nền và webhook dùng khoá
-- dịch vụ, không có phiếu đăng nhập ⇒ cả hai nhánh đều trả `null` như trước.
-- Chỉ những lượt gọi CÓ phiếu mới bị hỏi thêm — và đó đúng là chỗ cần hỏi.

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer set search_path = public, pg_temp
as $$
  select coalesce(
    -- Nhánh 1: mã tiệm trong phiếu đăng nhập, NHƯNG chỉ chấp nhận khi tư cách
    -- thành viên vẫn còn hiệu lực. Trước #301 nhánh này tin phiếu vô điều kiện.
    (select tm.tenant_id
       from public.tenant_members tm
      where tm.tenant_id = nullif(((auth.jwt() -> 'app_metadata') ->> 'tenant_id'), '')::uuid
        and tm.user_id = auth.uid()
        and tm.status = 'active'),
    -- Nhánh 2: không có phiếu mang mã tiệm ⇒ tra tiệm đang mở của người này.
    (select tm.tenant_id from public.tenant_members tm
      left join public.profiles p on p.user_id = tm.user_id
      where tm.user_id = auth.uid() and tm.status = 'active'
      order by (tm.tenant_id = p.active_tenant_id) desc nulls last, tm.created_at asc
      limit 1)
  )
$$;

comment on function public.current_tenant_id() is
  'Mã tiệm của người đang gọi. Từ #301: nhánh đọc phiếu đăng nhập PHẢI kiểm lại tư cách thành viên — trước đó người vừa bị gỡ vẫn đọc được cho tới khi phiếu hết hạn (~1 giờ), và #280 đã khẳng định nhầm là không.';
