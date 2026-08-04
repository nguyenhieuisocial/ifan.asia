-- ============================================================
-- iFan.asia — Migration #13: Bảng Cơ hội (Kanban deals) — đợt 1
-- Schema deals / pipelines / pipeline_stages / lost_reasons / deal_stage_history
-- ĐÃ CÓ từ migration #4 (kèm RLS + trigger ghi lịch sử stage). Migration này chỉ:
--
--   1) deals.next_action_note      -- nội dung "việc kế tiếp" (mốc thời gian đã có
--                                     ở deals.next_action_at từ #4).
--      Luật "mọi deal MỞ phải có việc kế tiếp" do check constraint
--      deals_open_needs_next_action (#4) giữ — KHÔNG nới lỏng ở đây.
--   2) ensure_deal_defaults()      -- definer, idempotent, gọi khi mở màn Cơ hội:
--        (a) tenant chưa có pipeline → seed pipeline mặc định + stage;
--        (b) pipeline mặc định thiếu cột THUA (kind='lost') → bù (create_tenant
--            bản #4 mới seed 'won', chưa seed 'lost' — spec CRM §5 yêu cầu mỗi
--            pipeline đúng 1 'won' + ≥1 'lost');
--        (c) tenant chưa có lý do thua → seed 5 lý do.
--      Vì sao là hàm gọi-theo-nhu-cầu chứ không nhét vào seed_industry_template:
--      template ngành chỉ chạy khi owner/admin CHỌN NGÀNH lúc onboarding, còn
--      bảng Cơ hội phải mở được cho MỌI vai (kể cả staff) và cho tenant chưa
--      chọn ngành. Definer để staff — vốn không có quyền ghi pipelines theo
--      policy pipelines_manage — vẫn mở được bảng mà không phải chờ owner.
--   3) create_tenant()             -- tenant mới nhận luôn cột Thua + 5 lý do thua
--                                     (ensure_deal_defaults khi đó chỉ là no-op).
--
-- LƯU Ý i18n (giống migration #12): tên stage và lý do thua là DỮ LIỆU của
-- tenant — cố ý viết tiếng Việt vì khách iFan là shop Việt, và tenant sửa được.
-- Đây KHÔNG phải chuỗi giao diện; luật i18n vi+en parity chỉ áp cho UI strings.
-- Chuẩn theo migration #4/#11/#12: definer set search_path, revoke public
-- trước khi grant đích danh.
-- ============================================================

-- ---------- deals.next_action_note ----------

alter table public.deals add column next_action_note text;
comment on column public.deals.next_action_note is
  'Nội dung việc kế tiếp (mốc thời gian ở next_action_at). Deal mở BẮT BUỘC có next_action_at — check deals_open_needs_next_action (migration #4).';

-- ---------- ensure_deal_defaults() ----------

create or replace function public.ensure_deal_defaults() returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_pipeline uuid;
begin
  if v_tenant is null then
    raise exception 'no_tenant_context';
  end if;

  -- Hai tab mở màn Cơ hội cùng lúc không được tạo 2 pipeline mặc định.
  perform pg_advisory_xact_lock(hashtext('ensure_deal_defaults:' || v_tenant::text));

  select id into v_pipeline
  from public.pipelines
  where tenant_id = v_tenant
  order by is_default desc, position, created_at
  limit 1;

  if v_pipeline is null then
    insert into public.pipelines (tenant_id, name, is_default, position)
      values (v_tenant, 'Bán hàng', true, 0)
      returning id into v_pipeline;
    insert into public.pipeline_stages (tenant_id, pipeline_id, name, position, kind, win_probability) values
      (v_tenant, v_pipeline, 'Mới',         0, 'open', 10),
      (v_tenant, v_pipeline, 'Đang tư vấn', 1, 'open', 30),
      (v_tenant, v_pipeline, 'Hẹn lịch',    2, 'open', 60),
      (v_tenant, v_pipeline, 'Đã chốt',     3, 'won',  100),
      (v_tenant, v_pipeline, 'Quay lại',    4, 'open', 20),
      (v_tenant, v_pipeline, 'Thua',        5, 'lost', 0);
  elsif not exists (
    select 1 from public.pipeline_stages where pipeline_id = v_pipeline and kind = 'lost'
  ) then
    -- Bù cột THUA cho pipeline do create_tenant bản cũ seed (chưa có kind='lost')
    insert into public.pipeline_stages (tenant_id, pipeline_id, name, position, kind, win_probability)
    select v_tenant, v_pipeline, 'Thua', coalesce(max(position), -1) + 1, 'lost', 0
    from public.pipeline_stages where pipeline_id = v_pipeline;
  end if;

  if not exists (select 1 from public.lost_reasons where tenant_id = v_tenant) then
    insert into public.lost_reasons (tenant_id, name, position) values
      (v_tenant, 'Giá cao',              0),
      (v_tenant, 'Chọn đối thủ',         1),
      (v_tenant, 'Không còn nhu cầu',    2),
      (v_tenant, 'Không liên lạc được',  3),
      (v_tenant, 'Khác',                 4)
    on conflict (tenant_id, name) do nothing;
  end if;
end $$;

revoke execute on function public.ensure_deal_defaults() from public, anon;
grant execute on function public.ensure_deal_defaults() to authenticated;

-- ---------- create_tenant(): seed thêm cột Thua + lý do thua ----------
-- Giữ nguyên hành vi migration #4 (trial 30 ngày, membership owner, pipeline
-- mặc định 5 stage, 4 nguồn khách, event tenant.created) — chỉ THÊM stage
-- 'Thua' (kind='lost') và 5 lý do thua để tenant mới đủ bộ ngay từ đầu.

create or replace function public.create_tenant(p_name text, p_slug text) returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_pipeline uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.tenants (name, slug, trial_ends_at)
    values (p_name, lower(p_slug), now() + interval '30 days')
    returning id into v_tenant;
  insert into public.tenant_members (tenant_id, user_id, role, joined_at)
    values (v_tenant, auth.uid(), 'owner', now());

  -- Seed pipeline mặc định "Bán hàng" + 6 stage (win_probability mặc định, chỉnh được)
  insert into public.pipelines (tenant_id, name, is_default, position)
    values (v_tenant, 'Bán hàng', true, 0)
    returning id into v_pipeline;
  insert into public.pipeline_stages (tenant_id, pipeline_id, name, position, kind, win_probability) values
    (v_tenant, v_pipeline, 'Mới',         0, 'open', 10),
    (v_tenant, v_pipeline, 'Đang tư vấn', 1, 'open', 30),
    (v_tenant, v_pipeline, 'Hẹn lịch',    2, 'open', 60),
    (v_tenant, v_pipeline, 'Đã chốt',     3, 'won', 100),
    (v_tenant, v_pipeline, 'Quay lại',    4, 'open', 20),
    (v_tenant, v_pipeline, 'Thua',        5, 'lost', 0);

  -- Seed 5 lý do thua mặc định (dữ liệu tenant — tiếng Việt theo thiết kế, xem đầu file)
  insert into public.lost_reasons (tenant_id, name, position) values
    (v_tenant, 'Giá cao',             0),
    (v_tenant, 'Chọn đối thủ',        1),
    (v_tenant, 'Không còn nhu cầu',   2),
    (v_tenant, 'Không liên lạc được', 3),
    (v_tenant, 'Khác',                4);

  -- Seed 4 nguồn khách mặc định
  insert into public.lead_sources (tenant_id, name, channel_type, is_system) values
    (v_tenant, 'Zalo',       'zalo',     true),
    (v_tenant, 'Facebook',   'facebook', true),
    (v_tenant, 'Giới thiệu', 'referral', true),
    (v_tenant, 'Khác',       'other',    true);

  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid(), 'platform');
  return v_tenant;
end $$;
-- grant execute cho authenticated giữ nguyên từ migration #1 (create or replace không mất grant)
