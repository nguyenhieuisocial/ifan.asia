-- ============================================================
-- iFan.asia — Migration #88: gộp 4 gói cũ về đúng 2 gói (ADR-0011 mục 4c)
--
-- Founder xác nhận (13/08): CHƯA có khách trả tiền thật, sẽ chưa mở bán ngay
-- — an toàn để đổi thẳng cấu trúc giá, không cần bước chuyển tiếp/song song.
--
-- Giữ nguyên 2 code đã có sẵn trong CHECK constraint ('free' và 'pro') thay
-- vì thêm code mới — khỏi phải sửa CHECK constraint trên 3 bảng (plans,
-- subscriptions, subscription_invoices) lẫn trigger tenant_bootstrap_subscription
-- (đang gán trial = 'pro'). Đổi Ý NGHĨA của 'pro' thành gói trả phí DUY NHẤT
-- "iFan" — tác dụng phụ có lợi: tenant mới dùng thử NGAY LẬP TỨC nhận đúng
-- hạn mức mới (300 lượt AI, không giới hạn người) thay vì số cũ 1000/30.
-- ============================================================

-- Công thức "năm = 85% của (tháng×12)" của bảng giá cũ không khớp số ADR-0011
-- đã chốt (99.000đ/tháng, 79.000đ/tháng quy năm = 948.000đ/năm — chênh ~20%,
-- không phải 15%) — bỏ công thức cứng, giữ chốt sự thật tối thiểu: năm không
-- được đắt hơn tháng×12.
alter table public.plans drop constraint if exists plans_year_is_85_percent;
alter table public.plans add constraint plans_year_not_more_than_monthly
  check (price_year <= price_month * 12);

-- Tenant nào lỡ đang gán 'basic'/'business' (không có trong dữ liệu mẫu hiện
-- tại, nhưng đề phòng) — chuyển về 'pro' trước khi xoá 2 gói đó, không để
-- tham chiếu treo.
update public.subscriptions set plan_code = 'pro' where plan_code in ('basic', 'business');

-- Gói Miễn phí — số thật đã công bố trên /bang-gia (bangGia.free.f4 = 30 lượt).
update public.plans
  set limits = '{"ai_calls": 30, "max_members": 3}'::jsonb,
      is_public = true,
      sort = 0
  where code = 'free';

-- 'pro' trở thành gói trả phí DUY NHẤT "iFan" (ADR-0011 mục 4c.1):
-- 99.000đ/tháng · 79.000đ/tháng quy năm (948.000đ/năm) · không giới hạn
-- người dùng (bỏ hẳn khoá "max_members" khỏi limits, không phải để null)
-- · 300 lượt AI/tháng.
update public.plans
  set name_vi = 'iFan',
      name_en = 'iFan',
      price_month = 99000,
      price_year = 948000,
      limits = '{"ai_calls": 300}'::jsonb,
      is_public = true,
      sort = 1
  where code = 'pro';

-- Đúng 2 gói công khai — không có gói ba (ADR-0011 mục 4c.2).
delete from public.plans where code in ('basic', 'business');

comment on table public.plans is
  'Danh mục gói cước — NGUỒN SỰ THẬT của giá. Đúng 2 gói (free, pro="iFan") '
  'theo ADR-0011 mục 4c — trang bảng giá công khai đọc số thật, giá gói trả '
  'phí chưa hiện công khai cho tới ngày mở bán (mục 4c.6) dù CSDL đã có sẵn.';
