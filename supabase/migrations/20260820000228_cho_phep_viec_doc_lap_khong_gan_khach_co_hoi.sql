-- Cho phép VIỆC ĐỘC LẬP (không gắn khách/cơ hội/dự án) — để tạo việc thẳng
-- trên bảng Công việc.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO NỚI — VÀ VÌ SAO CHỈ NỚI CHO 'task'
-- ═══════════════════════════════════════════════════════════════════
-- Ràng buộc `activities_need_link` (crm-core #4, dựng lại ở v8 #168) đòi MỌI
-- activity phải gắn ít nhất một trong contact/deal/project. Hệ quả: màn Công
-- việc (Kanban) cố ý KHÔNG có nút tạo việc — việc chỉ tạo được từ hồ sơ khách/
-- cơ hội/dự án. Founder phản hồi: "vào màn Công việc mà không tạo được việc" —
-- khó hiểu, ai cũng tưởng tạo được ở đó.
--
-- Nới CÓ CHỌN LỌC: chỉ loại 'task' được đứng độc lập. Còn 'note'/'call'/
-- 'meeting' là NHẬT KÝ VỀ một khách/cơ hội — để chúng đứng không gắn gì thì
-- thành bản ghi mồ côi vô nghĩa. Giữ nguyên yêu-cầu-gắn cho các loại đó, đúng
-- ý thiết kế cũ; chỉ mở đúng cái founder cần.
--
-- Bảng Kanban đã render tốt việc không có link sẵn (việc dự án có contact_id=
-- deal_id=null vẫn hiện; recordHref xử lý null) — nên không màn nào vỡ.

alter table public.activities drop constraint activities_need_link;

alter table public.activities add constraint activities_need_link
  check (
    type = 'task'
    or contact_id is not null
    or deal_id is not null
    or project_id is not null
  );

comment on constraint activities_need_link on public.activities is
  'note/call/meeting phai gan it nhat mot trong contact/deal/project (nhat ky ve mot doi tuong). Rieng task duoc dung DOC LAP (viec chung nhu "goi ngan hang") — de tao viec thang tren man Cong viec. Noi tu #228 (founder phan hoi 20/08).';
