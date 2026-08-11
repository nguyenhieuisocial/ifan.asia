-- ============================================================
-- iFan.asia — Migration #65: Sửa vai "viewer" cho ĐÚNG như đã hứa với người
-- dùng ("Chỉ xem, không sửa được gì. Hợp cho kế toán hoặc người ngoài cần
-- đối chiếu số" — messages/vi.json team.roleHints.viewer). Phát hiện khi
-- dựng chế độ Tham quan tiệm mẫu (15b, migration #64) và tự kiểm bằng
-- phép thử thật (không chỉ đọc SQL bằng mắt) — 3 lỗi thật, ảnh hưởng MỌI
-- tiệm thật đang chạy, không riêng gì tiệm mẫu:
--
-- 1. ĐỌC bị THIẾU: contacts/deals/activities/metric_daily/kpi_targets chỉ
--    cho owner/admin/manager hoặc chính chủ bản ghi đọc — viewer đọc RỖNG
--    dù màn hình nói "chỉ xem". Nới ĐÚNG đọc-toàn-tiệm cho viewer.
--
-- 2. GHI bị THỪA qua companies_all (`for all`, không lọc vai) — MỌI thành
--    viên kể cả viewer sửa/xoá được công ty. Tách đọc (giữ nguyên) khỏi ghi
--    (xiết về owner/admin/manager + tự phụ trách).
--
-- 3. GHI bị THỪA qua lối "tự phụ trách" (`or owner_id = auth.uid()`) trên
--    contacts/deals/activities — lối này đúng cho STAFF (được tự tạo/sửa
--    bản ghi CỦA MÌNH) nhưng bắt được y hệt bởi viewer nếu họ gán chính
--    mình làm owner_id — phép thử thật bắt được: viewer insert activities
--    với owner_id=chính-mình vẫn LỌT. Vá bằng cách chặn thẳng vai viewer
--    trước khi xét tới nhánh "tự phụ trách", không đổi gì cho các vai khác.
-- ============================================================

-- ---------- 1. Mở ĐỌC cho viewer (5 bảng) ----------

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager','viewer')
              or owner_id = (select auth.uid())));

drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager','viewer')
              or owner_id = (select auth.uid())));

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager','viewer')
              or owner_id = (select auth.uid())));

drop policy if exists metric_daily_select on public.metric_daily;
create policy metric_daily_select on public.metric_daily for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager','viewer')
              or dim_user_id = (select auth.uid())));

drop policy if exists kpi_targets_select on public.kpi_targets;
create policy kpi_targets_select on public.kpi_targets for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager','viewer')
              or user_id is null
              or user_id = (select auth.uid())));

-- ---------- 2. Chặn hẳn GHI cho viewer — contacts/deals/activities ----------
-- Thêm ĐÚNG một điều kiện `app_role() <> 'viewer'` lên trước nhánh cũ,
-- KHÔNG đổi gì hành vi của owner/admin/manager/staff.

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts for insert
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));
drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts for update
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) <> 'viewer'
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));
-- contacts_delete đã chỉ cho owner/admin/manager (không có nhánh tự-phụ-trách) — không đụng.

drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals for insert
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));
drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals for update
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) <> 'viewer'
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));
-- deals_delete đã chỉ cho owner/admin/manager — không đụng.

drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));
drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities for update
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) <> 'viewer'
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));
drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities for delete
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) <> 'viewer'
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())));

-- ---------- 3. Xiết GHI cho companies (tách khỏi companies_all, chặn viewer) ----------

drop policy if exists companies_all on public.companies;
drop policy if exists companies_select on public.companies;
drop policy if exists companies_insert on public.companies;
drop policy if exists companies_update on public.companies;
drop policy if exists companies_delete on public.companies;

create policy companies_select on public.companies for select
  using (tenant_id = (select public.current_tenant_id()));

create policy companies_insert on public.companies for insert
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));

create policy companies_update on public.companies for update
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) <> 'viewer'
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));

create policy companies_delete on public.companies for delete
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'));
