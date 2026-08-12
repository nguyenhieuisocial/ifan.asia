-- ============================================================
-- iFan.asia — Migration #70: vá hiệu năng RLS cho 4 bảng mới ở #69.
-- Advisors (supabase db advisors) bắt đúng: policy viết `auth.uid()` trần
-- bị đánh giá lại MỖI DÒNG khi quét bảng lớn; khuôn cả kho đang dùng là bọc
-- `(select auth.uid())` để Postgres tính MỘT LẦN (InitPlan) — đúng khuôn
-- current_tenant_id()/app_role() đã dùng khắp nơi, migration #69 viết thiếu
-- nhất quán chỗ auth.uid(). Không phải lỗi bảo mật (RLS vẫn đúng), chỉ là
-- hiệu năng — sửa ngay vì rẻ, không đợi task sau.
-- ============================================================

drop policy saved_views_select on public.saved_views;
create policy saved_views_select on public.saved_views for select
  using (
    tenant_id = (select public.current_tenant_id())
    and (user_id is null or user_id = (select auth.uid()))
  );

drop policy saved_views_insert on public.saved_views;
create policy saved_views_insert on public.saved_views for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and (
      user_id = (select auth.uid())
      or (user_id is null and (select public.app_role()) in ('owner', 'admin'))
    )
  );

drop policy saved_views_update on public.saved_views;
create policy saved_views_update on public.saved_views for update
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      user_id = (select auth.uid())
      or (user_id is null and (select public.app_role()) in ('owner', 'admin'))
    )
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (
      user_id = (select auth.uid())
      or (user_id is null and (select public.app_role()) in ('owner', 'admin'))
    )
  );

drop policy saved_views_delete on public.saved_views;
create policy saved_views_delete on public.saved_views for delete
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      user_id = (select auth.uid())
      or (user_id is null and (select public.app_role()) in ('owner', 'admin'))
    )
  );

drop policy bulk_operations_insert on public.bulk_operations;
create policy bulk_operations_insert on public.bulk_operations for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and actor_id = (select auth.uid())
  );

drop policy help_requests_insert on public.help_requests;
create policy help_requests_insert on public.help_requests for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and created_by = (select auth.uid())
  );

drop policy help_requests_update on public.help_requests;
create policy help_requests_update on public.help_requests for update
  using (
    tenant_id = (select public.current_tenant_id())
    and (created_by = (select auth.uid()) or (select public.app_role()) in ('owner', 'admin', 'manager'))
  )
  with check (tenant_id = (select public.current_tenant_id()));

drop policy support_sessions_select on public.support_sessions;
create policy support_sessions_select on public.support_sessions for select
  using (
    admin_user_id = (select auth.uid())
    or (
      tenant_id = (select public.current_tenant_id())
      and (select public.app_role()) in ('owner', 'admin')
    )
  );
