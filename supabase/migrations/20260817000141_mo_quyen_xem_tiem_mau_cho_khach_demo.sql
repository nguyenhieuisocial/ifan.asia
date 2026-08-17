-- Việc #163 — nút "Xem demo nhanh" ở màn đăng nhập đưa khách vào tiệm mẫu với
-- vai `viewer` qua enter_sample_tenant() (đã có từ trước, migration #64/#100).
-- Nhưng 3 màn Hàng hoá/Sổ quỹ/Lãi gộp đang chặn CẢ vai viewer đọc dữ liệu —
-- không phải lỗi bảo mật (đúng thiết kế: viewer thật của tiệm THẬT không nên
-- thấy giá vốn/sổ quỹ), chỉ là thiết kế đó vô tình chặn luôn khách xem thử.
--
-- Vá bằng cách THÊM 3 policy SELECT mới, KHÔNG đụng policy ghi/policy đọc cũ:
-- mở đọc đúng tổ hợp (vai viewer + đang ở tiệm is_sample=true). Viewer thật ở
-- tiệm thật (is_sample=false) không đổi gì — vẫn 0 dòng như trước.

create policy item_costs_select_sample_viewer on public.item_costs for select
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) = 'viewer'
         and exists (select 1 from public.tenants t where t.id = tenant_id and t.is_sample = true));

create policy cash_entries_select_sample_viewer on public.cash_entries for select
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) = 'viewer'
         and exists (select 1 from public.tenants t where t.id = tenant_id and t.is_sample = true));

create policy order_line_costs_select_sample_viewer on public.order_line_costs for select
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) = 'viewer'
         and exists (select 1 from public.tenants t where t.id = tenant_id and t.is_sample = true));
