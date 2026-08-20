-- Tệp đính kèm rò sang người KHÔNG được xem hồ sơ gốc.
--
-- ═══════════════════════════════════════════════════════════════════
-- ĐO ĐƯỢC 20/08 TRÊN DỮ LIỆU THẬT — mạo danh từng vai, không suy từ lược đồ
-- ═══════════════════════════════════════════════════════════════════
-- Một nhân viên của tiệm mẫu, chọn đúng người KHÔNG được giao phụ trách gì:
--
--     khách thấy được          : 0 / 776
--     luồng chat nội bộ        : 0 / 6
--     tin nhắn nội bộ          : 0 / 128
--     TỆP ĐÍNH KÈM thấy được   : 5 / 5      ← rò
--
-- Người này không mở nổi MỘT hồ sơ khách nào, nhưng liệt kê và tải được **toàn
-- bộ** tệp của tiệm, gồm cả ảnh gắn trong hồ sơ khách mà họ không có quyền xem.
--
-- Đối chứng: người của TIỆM KHÁC đọc 0 tệp — nên đây không phải lỗ xuyên tiệm,
-- mà là lỗ **giữa các vai trong cùng một tiệm**. Cùng lớp bệnh với việc #173.
--
-- ═══════════════════════════════════════════════════════════════════
-- GỐC: HAI BẢNG CHẶN THEO HAI NẾP KHÁC NHAU
-- ═══════════════════════════════════════════════════════════════════
-- `contacts_select` chặn tới TỪNG khách:
--     vai owner/admin/manager/viewer thấy hết, còn lại chỉ thấy khách mình phụ trách.
-- `appointments_select`, `orders_select`, `deals_select` cùng nếp đó.
--
-- Còn `attachments_select` cũ CHỈ có `tenant_id = current_tenant_id()`.
--
-- Tức là cửa trước khoá theo từng phòng, cửa sau khoá theo cả toà nhà. Ai vào
-- được toà nhà là lấy được đồ trong mọi phòng. Không ai cố tình mở — chỉ là khi
-- dựng bảng đính kèm, người viết chặn theo tiệm cho giống đa số bảng khác, mà
-- không nhận ra bảng này khác: nó KHÔNG có dữ liệu của riêng nó, nó chỉ là cái
-- túi treo vào hồ sơ người khác. **Quyền của cái túi phải bằng quyền của hồ sơ
-- nó treo vào**, không thể rộng hơn.
--
-- Chưa ai gặp vì tới hôm nay cả CSDL mới có đúng 5 tệp đính kèm, tất cả trên
-- tiệm mẫu. Có khách thật thì đây là chuyện rò dữ liệu cá nhân.
--
-- ═══════════════════════════════════════════════════════════════════
-- CÁCH CHỮA: HỎI LẠI CHÍNH BẢNG CHA, KHÔNG CHÉP LẠI LUẬT CỦA NÓ
-- ═══════════════════════════════════════════════════════════════════
-- `exists (select 1 from public.contacts x where x.id = attachments.entity_id)`
-- chạy DƯỚI luật quyền của chính `contacts` — đã đo bằng phép thử mạo danh, không
-- phải đọc tài liệu rồi tin. Nghĩa là không chép lại điều kiện "owner_id = tôi"
-- vào đây; mai kia luật của `contacts` đổi thì chỗ này tự đổi theo.
--
-- Chép lại luật là cách chắc chắn để hai bên lệch nhau sau vài tháng — đúng thứ
-- việc #184 (`resolve_saved_view` viết hai lần) đã trả giá.
--
-- HAI LOẠI CỐ Ý ĐỂ RỘNG THEO TIỆM:
--   • `tenant`  — ảnh nhận diện của chính tiệm (logo, ảnh bìa mặt tiền). Của
--     chung, ai trong tiệm cũng phải thấy; siết lại là gãy màn Cài đặt.
--   • `message` — `messages_select` vốn đã là chặn-theo-tiệm (đã đo). Siết đính
--     kèm chặt hơn tin nhắn chứa nó thì vô nghĩa: người ta vẫn đọc được tin.
--     Muốn siết thì phải siết `messages` trước — việc khác, không gộp vào đây.
--
-- Loại nào KHÔNG nằm trong danh sách thì nhân viên thường KHÔNG thấy. Chọn đóng
-- thay vì mở: thêm loại đính kèm mới mà quên khai ở đây thì hậu quả là "nhân
-- viên không thấy tệp" — phiền, nhưng nhìn ra ngay. Ngược lại là rò âm thầm.
--
-- CHỈ ĐỘNG ĐƯỜNG ĐỌC. Các chính sách thêm/sửa/xoá giữ nguyên: chúng đã chặn vai
-- `viewer` và chặn theo tiệm, và nới rộng phạm vi bản vá là cách tự tạo lỗi mới.

drop policy if exists attachments_select on public.attachments;

create policy attachments_select on public.attachments
  for select
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      -- Vai quản lý trở lên (và vai Chỉ xem, vốn đã đọc được cả tiệm) — giữ nguyên
      (select public.app_role()) in ('owner', 'admin', 'manager', 'viewer')
      -- Của chung cả tiệm — xem khối lý do ở trên
      or attachments.entity_type in ('tenant', 'message')
      -- Còn lại: hỏi lại chính bảng cha, để luật của nó tự áp
      or (attachments.entity_type = 'contact'
          and exists (select 1 from public.contacts x where x.id = attachments.entity_id))
      or (attachments.entity_type = 'appointment'
          and exists (select 1 from public.appointments x where x.id = attachments.entity_id))
      or (attachments.entity_type = 'order'
          and exists (select 1 from public.orders x where x.id = attachments.entity_id))
      or (attachments.entity_type = 'deal'
          and exists (select 1 from public.deals x where x.id = attachments.entity_id))
    )
  );

comment on table public.attachments is
  'Tep dinh kem treo vao ho so khac (khach/lich hen/don/co hoi/tin nhan/tiem). Duong DOC bam theo quyen cua BANG CHA bang `exists(...)` — co y KHONG chep lai dieu kien cua bang cha vao day, chep lai la hai ben lech nhau sau vai thang (#184). Truoc #217 chinh sach doc chi kiem `tenant_id`, do duoc: mot nhan vien thay 0/776 khach nhung van doc duoc 5/5 tep ca tiem. Loai `tenant` va `message` co y de rong theo tiem — xem chu thich migration #217.';
