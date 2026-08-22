-- ════════════════════════════════════════════════════════════════════
-- ẢNH CHẤM CÔNG: CHỈ CHÍNH NGƯỜI ĐÓ VÀ QUẢN LÝ TRỞ LÊN ĐƯỢC XEM
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠️ LỖ CÓ THẬT, tìm được 22/08 khi chuẩn bị dựng bảng xem ảnh cho cả tiệm.
--
--   Quyền đọc DÒNG chấm công chặn theo NGƯỜI (nhân viên chỉ thấy lần chấm của
--   mình). Nhưng quyền đọc KHO ẢNH chỉ chặn theo TIỆM: chính sách
--   `tenant_files_select` chỉ hỏi "tệp này có nằm trong thư mục của tiệm mình
--   không". Hai tầng lệch nhau.
--
--   Đường dẫn có mã ngẫu nhiên nên KHÔNG đoán được — nhưng đoán không phải là
--   cách tấn công. Kho ảnh cho phép **LIỆT KÊ THƯ MỤC**: bất kỳ ai đã đăng nhập
--   vào tiệm đều liệt kê được `<tiệm>/attendance/...`, lấy đủ tên tệp, rồi tự ký
--   link tạm. Tức mọi nhân viên xem được ảnh selfie của mọi đồng nghiệp.
--
--   Hôm nay chưa lộ vì màn hình chỉ trả link ảnh của chính người xem. Nhưng
--   "chưa có màn nào hiển thị" KHÔNG phải là một lớp bảo vệ — nó là một sự
--   tình cờ, và bảng xem cả tiệm sắp làm sẽ xoá mất sự tình cờ đó.
--
-- ⚠️ VÁ LÚC NÀY LÀ MIỄN PHÍ: đo 22/08 có **0 ảnh chấm công** trong kho (tính
--   năng chụp ảnh đang tắt ở cả 6 tiệm). Đổi cách đặt đường dẫn bây giờ không
--   phải di chuyển tệp nào. Chậm một tuần là phải viết thêm bộ di trú.
--
-- ┌─ CÁCH VÁ ──────────────────────────────────────────────────────────
-- Đường dẫn mới nhét THÊM mã nhân viên:
--     <tiệm>/attendance/<mã nhân viên>/<ngày>/<mã ngẫu nhiên>.jpg
-- rồi chính sách đọc soi đúng đoạn thứ ba đó.
--
-- ⚠️ PHẢI SỬA chính sách rộng sẵn có, KHÔNG được chỉ thêm một chính sách hẹp.
--   Nhiều chính sách trên cùng một bảng được cộng bằng HOẶC — thêm cái hẹp mà
--   để nguyên cái rộng thì cái rộng vẫn cho qua, và ta có cảm giác an toàn giả.

-- ── ĐỌC ──────────────────────────────────────────────────────────────
drop policy if exists tenant_files_select on storage.objects;
create policy tenant_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tenant-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (
      -- Mọi tệp KHÔNG phải ảnh chấm công: giữ nguyên như cũ, cả tiệm đọc được.
      (storage.foldername(name))[2] is distinct from 'attendance'
      -- Ảnh chấm công: chính người đó, hoặc quản lý trở lên.
      or public.app_role() in ('owner', 'admin', 'manager')
      or exists (
        select 1 from public.employees e
         where e.id::text = (storage.foldername(name))[3]
           and e.user_id = auth.uid()
      )
    )
  );

-- ── XOÁ ──────────────────────────────────────────────────────────────
-- Cùng luật với đọc. Không chốt chỗ này thì một người xoá được bằng chứng chấm
-- công của người khác — mà ảnh chấm công là thứ dùng để đối chất khi có tranh
-- cãi về giờ giấc và tiền lương.
drop policy if exists tenant_files_delete on storage.objects;
create policy tenant_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tenant-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (
      (storage.foldername(name))[2] is distinct from 'attendance'
      or public.app_role() in ('owner', 'admin', 'manager')
      or exists (
        select 1 from public.employees e
         where e.id::text = (storage.foldername(name))[3]
           and e.user_id = auth.uid()
      )
    )
  );

-- ── SỬA ĐÈ ───────────────────────────────────────────────────────────
-- ⚠️ Ảnh chấm công là BẰNG CHỨNG. Không ai được sửa đè, kể cả chủ tiệm — sửa
--   đè được thì tấm ảnh hết giá trị đối chất. Muốn bỏ thì xoá (có luật ở trên),
--   không phải thay ruột mà giữ nguyên tên.
drop policy if exists tenant_files_update on storage.objects;
create policy tenant_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tenant-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] is distinct from 'attendance'
  );

comment on policy tenant_files_select on storage.objects is
  'Tệp của tiệm nào thì tiệm đó đọc. RIÊNG ảnh chấm công (attendance/<mã nhân viên>/…) chỉ chính người đó và quản lý trở lên — vì kho ảnh cho LIỆT KÊ thư mục, nên chặn theo tiệm là không đủ (#363).';
