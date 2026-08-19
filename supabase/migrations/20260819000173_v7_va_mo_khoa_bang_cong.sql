-- V7 team — VÁ: mở khoá bảng công bị chính ràng buộc của nó chặn.
--
-- LỖI: `timesheets_da_chot` ở #166 viết
--     (status = 'draft' and closed_by is null and closed_at is null) or ...
-- Nhưng mở khoá là chuyển `closed` → `draft` mà VẪN GIỮ `closed_by`/`closed_at`
-- (đó là dấu vết ai từng chốt — thứ phải giữ, không phải xoá). Nên đường mở khoá
-- hợp lệ duy nhất lại bị chính ràng buộc từ chối:
--     new row violates check constraint "timesheets_da_chot"
--
-- Hậu quả nếu không bắt được: chốt nhầm một bảng công là KHOÁ VĨNH VIỄN — không
-- ai sửa được nữa, kể cả chủ tiệm. Bộ kiểm bắt ở ca 10, trước khi có tiệm nào chạm.
--
-- Sửa theo hướng GIỮ DẤU VẾT: ràng buộc chỉ còn nói một chiều — đã `closed` thì
-- BẮT BUỘC có người chốt và mốc chốt. Bản `draft` được phép mang dấu vết của lần
-- chốt trước, vì đó chính là thứ cần cho việc truy lại "ai chốt, rồi ai mở".
alter table public.timesheets drop constraint if exists timesheets_da_chot;
alter table public.timesheets
  add constraint timesheets_da_chot
  check (status <> 'closed' or (closed_by is not null and closed_at is not null));

-- Cùng một lỗi ở kỳ lương — chưa ai chạm tới nhưng cùng khuôn, vá luôn cho khỏi
-- vấp đúng chỗ đó vào lúc đang chốt lương thật.
alter table public.payroll_periods drop constraint if exists payroll_da_chot;
alter table public.payroll_periods
  add constraint payroll_da_chot
  check (status <> 'closed' or (closed_by is not null and closed_at is not null));
