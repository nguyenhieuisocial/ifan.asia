-- ============================================================
-- iFan.asia — Migration #19: Phân hạng khách TỰ ĐỘNG (Mới / Quen / VIP / Nguội)
-- Spec: "03 Sản phẩm/Specs/01 CRM và Bán hàng.md" mục V2 + data model `tier_rules`;
--       Quy hoạch tổng thể GĐ2 "phân hạng Mới/Quen/VIP/Nguội tự động phát event".
--
-- QUY TẮC (ngưỡng chỉnh được theo tenant, mặc định hợp lý cho shop Việt):
--   Nguội   — im lặng quá `dormant_after_days` ngày (mặc định 90)
--   VIP     — doanh thu tích lũy ≥ `vip_min_revenue` (mặc định 20 triệu)
--             HOẶC số deal thắng ≥ `vip_min_won_deals` (mặc định 5)
--   Quen    — số deal thắng ≥ `regular_min_won_deals` (mặc định 2)
--   Mới     — còn lại (chưa mua lần nào, hoặc mới mua 1 lần)
--
-- THỨ TỰ XÉT: Nguội xét TRƯỚC. Khách VIP im lặng 3 tháng chính là người cần kéo lại
-- nhất — đó là toàn bộ lý do tồn tại của tính năng này (spec V2: "khách rớt xuống
-- Nguội → tạo task nhắn lại"). Mốc im lặng = `last_interaction_at`, chưa từng tương
-- tác thì lấy `created_at` (khách nhập vào 3 tháng trước chưa ai đụng = đúng nghĩa nguội).
--
-- PHÁT EVENT: KHÔNG gọi wf_emit ở đây. Trigger `contacts_emit_events` (migration #15)
-- đã phát `contact.tier_changed` (old_tier, new_tier) khi và CHỈ KHI cột tier thực sự
-- đổi giá trị — cùng transaction với việc ghi hạng. Hàm dưới đây chỉ cần ghi tier bằng
-- một UPDATE có điều kiện `is distinct from`: tính lại ra cùng hạng ⇒ 0 dòng bị ghi
-- ⇒ 0 event. Thêm một lần wf_emit nữa sẽ thành phát TRÙNG.
--
-- total_revenue: cột đã có từ migration #4 với chú thích "cập nhật khi deal won",
-- nhưng CHƯA có chỗ nào ghi (luôn = 0) → ngưỡng VIP theo tiền sẽ vô nghĩa. Hàm tính
-- hạng cộng lại từ `deals` (status='won', chưa xóa mềm) và ghi vào cột đó, nên vừa
-- có hạng đúng vừa vá luôn số "Doanh thu tích lũy" đang hiện trong UI gộp trùng.
-- Tính lại toàn bộ (không cộng dồn) ⇒ chạy bao nhiêu lần cũng ra một kết quả.
--
-- KHÔNG có bảng `tier_changes` riêng: `domain_events` đã lưu đúng dữ liệu đó
-- (`contact.tier_changed` + old_tier/new_tier + thời điểm + người gây ra), có RLS theo
-- tenant sẵn. Thêm bảng thứ hai chỉ là chép lại — xem báo cáo bàn giao.
--
-- Chạy lại khi nào:
--   · deal thắng / đổi giá trị / đổi khách / xóa mềm  → trigger trên `deals`
--   · khách có tương tác mới (activity, tin nhắn)     → trigger trên `contacts`
--   · phần phụ thuộc THỜI GIAN (rơi vào Nguội)        → cron 02:00 giờ VN
-- ============================================================

-- ============================================================
-- PHẦN A — Ngưỡng phân hạng theo tenant
-- ============================================================

create table public.tier_rules (
  id uuid primary key default gen_random_uuid(),
  -- 1 dòng/tenant (spec data model). unique ⇒ upsert theo tenant_id.
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  vip_min_revenue bigint not null default 20000000 check (vip_min_revenue >= 0),
  vip_min_won_deals int not null default 5 check (vip_min_won_deals >= 1),
  regular_min_won_deals int not null default 2 check (regular_min_won_deals >= 1),
  dormant_after_days int not null default 90 check (dormant_after_days between 7 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ngưỡng VIP phải khó hơn ngưỡng Quen, nếu không hạng Quen không bao giờ đạt tới
  constraint tier_rules_won_order check (vip_min_won_deals >= regular_min_won_deals)
);

alter table public.tier_rules enable row level security;
-- Bảng cấu hình (spec mục 8): đọc mọi thành viên, ghi CHỈ owner/admin — như sla_policies
create policy tier_rules_select on public.tier_rules for select
  using (tenant_id = (select public.current_tenant_id()));
create policy tier_rules_manage on public.tier_rules for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin'));

create trigger tier_rules_touch before update on public.tier_rules
  for each row execute function public.touch_updated_at();

-- Lọc danh sách khách theo hạng (bộ lọc màn Khách hàng)
create index contacts_tier_idx
  on public.contacts (tenant_id, tier, created_at desc)
  where deleted_at is null;

-- ============================================================
-- PHẦN B — Hàm tính hạng
-- ============================================================

-- SECURITY DEFINER: trigger phải chạy được cả khi người ghi (staff, service role)
-- không có quyền UPDATE contact đó qua RLS — tiền lệ recompute_contact_score().
-- KHÔNG cho client gọi trực tiếp (revoke bên dưới): chỉ trigger + cron + RPC + postgres.
create or replace function public.recompute_contact_tier(p_contact_id uuid)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_since timestamptz;   -- mốc im lặng: tương tác cuối, chưa có thì ngày tạo
  v_revenue bigint;
  v_won int;
  v_vip_revenue bigint;
  v_vip_won int;
  v_regular_won int;
  v_dormant_days int;
  v_tier text;
begin
  select c.tenant_id, coalesce(c.last_interaction_at, c.created_at)
    into v_tenant, v_since
    from public.contacts c
   where c.id = p_contact_id and c.deleted_at is null;
  if not found then return; end if;

  -- Doanh thu tích lũy + số lần mua: một query, đúng nguồn sự thật là bảng deals
  select coalesce(sum(d.value_vnd), 0)::bigint, count(*)::int
    into v_revenue, v_won
    from public.deals d
   where d.contact_id = p_contact_id
     and d.status = 'won'
     and d.deleted_at is null;

  -- left join (select 1): tenant chưa có dòng cấu hình vẫn được phân hạng theo mặc định
  select coalesce(tr.vip_min_revenue, 20000000),
         coalesce(tr.vip_min_won_deals, 5),
         coalesce(tr.regular_min_won_deals, 2),
         coalesce(tr.dormant_after_days, 90)
    into v_vip_revenue, v_vip_won, v_regular_won, v_dormant_days
    from (select 1) as one
    left join public.tier_rules tr on tr.tenant_id = v_tenant;

  if v_since < now() - make_interval(days => v_dormant_days) then
    v_tier := 'dormant';
  elsif v_revenue >= v_vip_revenue or v_won >= v_vip_won then
    v_tier := 'vip';
  elsif v_won >= v_regular_won then
    v_tier := 'regular';
  else
    v_tier := 'new';
  end if;

  -- Điều kiện `is distinct from` là thứ bảo đảm "không đổi ⇒ không phát event":
  -- không có dòng nào bị ghi thì contacts_emit_events cũng không chạy.
  update public.contacts
     set total_revenue = v_revenue,
         tier = v_tier
   where id = p_contact_id
     and (total_revenue is distinct from v_revenue or tier is distinct from v_tier);
end $$;

revoke execute on function public.recompute_contact_tier(uuid) from public, anon, authenticated;

-- ============================================================
-- PHẦN C — Tính lại NGAY khi dữ liệu đổi
-- ============================================================

-- Deal thắng (hoặc bỏ thắng / đổi giá trị / đổi khách / xóa mềm) → hạng của khách đổi theo.
-- Danh sách cột OF = đúng các input của công thức, không thừa.
create or replace function public.deals_tier_recompute() returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  if new.contact_id is not null then
    perform public.recompute_contact_tier(new.contact_id);
  end if;
  -- Chuyển deal sang khách khác: khách CŨ mất doanh thu đó, phải tính lại luôn
  if tg_op = 'UPDATE'
     and old.contact_id is distinct from new.contact_id
     and old.contact_id is not null then
    perform public.recompute_contact_tier(old.contact_id);
  end if;
  return null;
end $$;

create trigger deals_tier_recompute
  after insert or update of status, value_vnd, contact_id, deleted_at on public.deals
  for each row execute function public.deals_tier_recompute();

-- Khách vừa tương tác (tin nhắn đến / activity — cả hai đều bump last_interaction_at,
-- migration #8) → thoát Nguội ngay, không phải chờ cron.
-- UPDATE bên trong recompute chỉ SET total_revenue + tier, KHÔNG nằm trong danh sách
-- OF này ⇒ không đệ quy.
create or replace function public.contacts_tier_recompute() returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  perform public.recompute_contact_tier(new.id);
  return null;
end $$;

create trigger contacts_tier_recompute
  after insert or update of last_interaction_at on public.contacts
  for each row execute function public.contacts_tier_recompute();

-- ---------- cron đêm: phần phụ thuộc THỜI GIAN ----------
-- Không có sự kiện nào xảy ra thì không trigger nào chạy — mà "Nguội" lại đến từ việc
-- KHÔNG có gì xảy ra. 19:00 UTC = 02:00 giờ VN (spec mục 6: tier-recompute cron 02:00 VN),
-- chạy trước lead-score-nightly (03:00 VN) để hai máy không giẫm chân nhau.
select cron.schedule(
  'contact-tier-nightly',
  '0 19 * * *',
  $$ select public.recompute_contact_tier(id)
       from public.contacts where deleted_at is null $$
);

-- ============================================================
-- PHẦN D — Cấu hình ngưỡng từ màn Cài đặt
-- ============================================================

-- Đổi ngưỡng mà không xếp lại hạng thì chủ tiệm bấm Lưu xong không thấy gì đổi —
-- nên RPC này ghi ngưỡng VÀ xếp lại toàn bộ khách của tenant trong CÙNG transaction.
-- Trả về số khách đã xét (để UI báo "đã xếp lại N khách").
create or replace function public.apply_tier_rules(
  p_vip_min_revenue bigint,
  p_vip_min_won_deals int,
  p_regular_min_won_deals int,
  p_dormant_after_days int
) returns int
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_count int;
begin
  if v_tenant is null then
    raise exception 'no_tenant_context';
  end if;
  -- Ngưỡng là thiết lập cả tiệm: nhân viên thường không được đụng (lưới 2 lớp cùng RLS)
  if public.app_role() not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;

  insert into public.tier_rules (
    tenant_id, vip_min_revenue, vip_min_won_deals,
    regular_min_won_deals, dormant_after_days)
  values (
    v_tenant, p_vip_min_revenue, p_vip_min_won_deals,
    p_regular_min_won_deals, p_dormant_after_days)
  on conflict (tenant_id) do update set
    vip_min_revenue       = excluded.vip_min_revenue,
    vip_min_won_deals     = excluded.vip_min_won_deals,
    regular_min_won_deals = excluded.regular_min_won_deals,
    dormant_after_days    = excluded.dormant_after_days;

  select count(*)::int into v_count
    from public.contacts
   where tenant_id = v_tenant and deleted_at is null;

  perform public.recompute_contact_tier(id)
     from public.contacts
    where tenant_id = v_tenant and deleted_at is null;

  return v_count;
end $$;

revoke execute on function public.apply_tier_rules(bigint, int, int, int) from public, anon;
grant execute on function public.apply_tier_rules(bigint, int, int, int) to authenticated;

-- ============================================================
-- PHẦN E — Tenant mới có ngưỡng ngay + backfill tenant cũ
-- ============================================================

-- Giữ nguyên phần thân đang chạy (migration #17), chỉ thêm 1 dòng seed tier_rules.
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

  -- Seed 2 playbook cài sẵn (migration #15)
  perform public.wf_seed_playbooks(v_tenant);
  -- Seed 2 chính sách SLA cài sẵn (migration #17)
  perform public.sla_seed_policies(v_tenant);
  -- Seed ngưỡng phân hạng mặc định (migration #19)
  insert into public.tier_rules (tenant_id) values (v_tenant);

  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid(), 'platform');
  return v_tenant;
end $$;

grant execute on function public.create_tenant to authenticated;
revoke execute on function public.create_tenant from anon, public;

-- Tenant tạo TRƯỚC migration này cũng phải có ngưỡng (màn Cài đặt đọc thẳng bảng)
insert into public.tier_rules (tenant_id)
  select id from public.tenants
  on conflict (tenant_id) do nothing;

-- Backfill 1 lần: xếp hạng + vá total_revenue cho toàn bộ khách hiện có.
-- Khách nào thực sự đổi hạng sẽ phát contact.tier_changed như mọi lần đổi hạng khác.
select public.recompute_contact_tier(id) from public.contacts where deleted_at is null;
