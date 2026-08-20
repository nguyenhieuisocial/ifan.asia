-- #190 — VAT: cấu hình mức thuế theo tiệm (Model A — giá đã gồm VAT)
-- ════════════════════════════════════════════════════════════════════
-- order_lines.tax_rate ĐÃ CÓ sẵn (default 0) nhưng chưa màn nào ghi/hiện.
-- Bản này thêm BẢNG cấu hình mức thuế mặc định theo tiệm + bật/tắt.
--
-- ⚠️ Dùng BẢNG RIÊNG tax_settings (KHÔNG alter tenants): tenants là bảng NÓNG
-- (đọc mỗi request) — thử ALTER add column đã bị 55P03/57014 vì không chen được
-- ACCESS EXCLUSIVE. Tạo bảng MỚI không đụng traffic tenants nên áp tức thì.
-- KHÔNG đặt FK tới tenants (FK cần khoá tenants để gắn trigger tham chiếu, lại
-- đụng traffic) — tenant_id là PK, RLS scope theo current_tenant_id; xoá tiệm
-- rất hiếm và dòng mồ côi vô hại (RLS ẩn nó).
--
-- Model A (nghiên cứu POS + thông lệ B2C VN): GIÁ NIÊM YẾT ĐÃ GỒM VAT. Tổng
-- khách trả KHÔNG đổi; VAT bóc NGƯỢC để hiện "trong đó VAT: X%". Công thức bóc
-- ngược (tính ở tầng đọc): line_tax = round(line_total * rate/(100+rate)).
-- Mặc định TẮT/0% (nhiều tiệm là hộ khoán). VN 2025-2026: 8% mức giảm tạm
-- (spa/salon/nail/F&B/bán lẻ) tới hết 31/12/2026.
-- KHÔNG đụng đường tiền: doanh thu/hoa hồng/lãi gộp GIỮ NGUYÊN — VAT chỉ là
-- dòng hiển thị "trong đó", không cộng thêm, không tạo order_line thật.

create table if not exists public.tax_settings (
  tenant_id  uuid primary key,
  enabled    boolean not null default false,
  rate       numeric(5,2) not null default 0 check (rate >= 0 and rate <= 20),
  updated_at timestamptz not null default now()
);
alter table public.tax_settings enable row level security;

-- Đọc: MỌI thành viên tiệm (màn tạo đơn + chi tiết đơn cần biết mức thuế).
create policy tax_settings_select on public.tax_settings for select
  using (tenant_id = (select public.current_tenant_id()));

-- Ghi: owner/admin.
create policy tax_settings_manage on public.tax_settings for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin'));

comment on table public.tax_settings is
  'Cau hinh VAT theo tiem (#190, Model A gia da gom VAT): bat/tat + muc thue mac dinh (%). Tao dong don chep rate vao order_lines.tax_rate; chi tiet don boc nguoc hien "trong do VAT". Mac dinh tat/0%. Bang rieng vi tenants qua nong de ALTER.';
