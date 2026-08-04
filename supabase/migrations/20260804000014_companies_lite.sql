-- ============================================================
-- iFan.asia — Migration #14: Công ty (companies) + tự động nối — đợt 1
-- Bảng public.companies ĐÃ CÓ từ migration #4 (name, name_normalized generated,
-- tax_code, email_domain, phone, email, address, industry, size_range, owner_id,
-- deleted_at + RLS companies_all + trigger touch_updated_at). KHÔNG tạo lại bảng.
-- Migration này chỉ bổ sung đúng 3 thứ đợt 1 cần:
--
--   1) companies_tax_code_format   -- MST Việt Nam: 10 chữ số (đơn vị chính) hoặc
--      (check constraint)             13 chữ số (10 + 3 số chi nhánh). App chuẩn hóa
--                                     bỏ mọi ký tự không phải số TRƯỚC khi ghi, nên
--                                     DB chỉ cần giữ dạng số thuần — chặn rác từ
--                                     mọi đường ghi (app, script, SQL tay).
--   2) companies_tenant_tax_code_uniq -- MST là DUY NHẤT trong mỗi tenant khi có.
--      (unique index)                    Partial: bỏ qua NULL (đa số công ty đợt 1
--                                        chưa nhập MST) và bỏ qua bản ghi đã xóa mềm
--                                        (xóa rồi tạo lại cùng MST phải chạy được).
--   3) public.company_stats        -- view gom 3 số của màn danh sách Công ty:
--      (view, security_invoker)       số khách · số cơ hội đang mở · tổng giá trị
--                                     deal THẮNG. Tính trong Postgres thay vì kéo
--                                     toàn bộ contacts/deals về app.
--
-- LƯU Ý RLS: view đặt security_invoker = true → policy của companies/contacts/deals
-- áp theo NGƯỜI GỌI y như query thẳng bảng (staff chỉ thấy khách mình phụ trách).
-- KHÔNG dùng security definer ở đây: sẽ là lỗ hổng vượt tenant. RLS hiện có của
-- companies/contacts/deals giữ NGUYÊN, migration này không đụng tới policy nào.
--
-- Quan hệ deal ↔ công ty: deals.company_id tồn tại từ #4 nhưng luồng sản phẩm đợt 1
-- chưa ghi cột đó (form Cơ hội chỉ chọn KHÁCH). Vì vậy view quy chiếu qua
-- deals.contact_id → contacts.company_id — đúng với dữ liệu thật đang có.
-- ============================================================

-- ---------- 1) MST: định dạng ----------

alter table public.companies
  add constraint companies_tax_code_format
  check (tax_code is null or tax_code ~ '^[0-9]{10}([0-9]{3})?$');

-- ---------- 2) MST: duy nhất theo tenant ----------

create unique index companies_tenant_tax_code_uniq
  on public.companies (tenant_id, tax_code)
  where tax_code is not null and deleted_at is null;

-- ---------- 3) View số liệu công ty ----------

create view public.company_stats
  with (security_invoker = true) as
select
  co.id        as company_id,
  co.tenant_id as tenant_id,
  (
    select count(*)
    from public.contacts ct
    where ct.company_id = co.id and ct.deleted_at is null
  ) as contact_count,
  (
    select count(*)
    from public.deals d
    join public.contacts ct on ct.id = d.contact_id
    where ct.company_id = co.id and d.deleted_at is null and d.status = 'open'
  ) as open_deal_count,
  (
    select coalesce(sum(d.value_vnd), 0)
    from public.deals d
    join public.contacts ct on ct.id = d.contact_id
    where ct.company_id = co.id and d.deleted_at is null and d.status = 'won'
  ) as won_value_vnd
from public.companies co
where co.deleted_at is null;

comment on view public.company_stats is
  'Số khách / cơ hội đang mở / tổng giá trị deal thắng theo công ty. security_invoker: RLS của companies + contacts + deals áp theo người gọi.';

grant select on public.company_stats to authenticated;
