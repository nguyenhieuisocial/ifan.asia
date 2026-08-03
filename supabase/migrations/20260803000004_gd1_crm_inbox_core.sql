-- ============================================================
-- iFan.asia — Migration #4: GĐ1 đợt 1 — CRM core + Inbox core
-- CRM:   lead_sources, companies, contacts, tags(+contact_tags),
--        pipelines(+pipeline_stages), lost_reasons, deals,
--        deal_stage_history, activities
-- Inbox: channels, conversations, messages, contact_identities,
--        webhook_events, canned_responses
-- Kèm:   queue pgmq 'zalo_events' + seed pipeline/lead_sources mặc định
--        trong create_tenant().
-- Chuẩn: text+check cho enum, tiền bigint, timestamptz, citext email,
--        RLS bật ngay khi tạo bảng, policy bọc (select ...) cache initplan,
--        index dẫn đầu tenant_id, mọi FK có index.
-- Ghi chú thiết kế: các cột trỏ user (owner_id, assignee_user_id, changed_by,
--        created_by, sender_user_id) KHÔNG FK sang auth.users — theo tiền lệ
--        domain_events.actor_user_id, tránh chặn xóa user; membership kiểm ở app.
-- ============================================================

-- ==================== CRM CORE ====================

-- ---------- lead_sources: nguồn khách ----------

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  channel_type text check (channel_type in ('zalo','facebook','tiktok','website','referral','direct','other')),
  quality_score int not null default 50 check (quality_score between 0 and 100), -- input cho lead scoring
  is_system boolean not null default false, -- seed sẵn khi tạo tenant, app không cho xóa
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
alter table public.lead_sources enable row level security;
-- Bảng cấu hình: mọi thành viên đọc, owner/admin/manager ghi
create policy lead_sources_select on public.lead_sources for select
  using (tenant_id = (select public.current_tenant_id()));
create policy lead_sources_manage on public.lead_sources for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger lead_sources_touch before update on public.lead_sources
  for each row execute function public.touch_updated_at();

-- ---------- companies ----------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  name_normalized text generated always as (public.immutable_unaccent(lower(name))) stored, -- match auto-link
  tax_code text,        -- MST
  email_domain text,    -- 'spaxinh.vn' — auto-link contact theo domain email
  phone text,
  email citext,
  address text,
  industry text,
  size_range text,
  owner_id uuid,
  custom jsonb not null default '{}'::jsonb,
  created_by uuid,
  deleted_at timestamptz, -- soft-delete
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_tenant_name_idx on public.companies (tenant_id, name_normalized);
create index companies_tax_code_idx on public.companies (tenant_id, tax_code) where tax_code is not null;
create index companies_email_domain_idx on public.companies (tenant_id, email_domain) where email_domain is not null;
alter table public.companies enable row level security;
create policy companies_all on public.companies for all
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();

-- ---------- contacts ----------

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  phone text,      -- như người dùng nhập
  phone_e164 text, -- chuẩn hóa +84… (dedupe)
  email citext,
  gender text,
  dob date,
  address text,
  province text,
  company_id uuid references public.companies(id) on delete set null,
  owner_id uuid,   -- nhân viên phụ trách
  source_id uuid references public.lead_sources(id) on delete set null,
  tier text not null default 'new' check (tier in ('new','regular','vip','dormant')),
  lifecycle text not null default 'lead' check (lifecycle in ('lead','customer')),
  total_revenue bigint not null default 0, -- VNĐ tích lũy, cập nhật khi deal won
  last_interaction_at timestamptz,
  custom jsonb not null default '{}'::jsonb,
  -- tìm kiếm không dấu
  search_text text generated always as (
    public.immutable_unaccent(lower(
      coalesce(full_name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(email::text,'')
    ))
  ) stored,
  created_by uuid,
  deleted_at timestamptz, -- soft-delete
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_owner_idx on public.contacts (tenant_id, owner_id);
create index contacts_phone_idx on public.contacts (tenant_id, phone_e164) where phone_e164 is not null;
create index contacts_email_idx on public.contacts (tenant_id, email) where email is not null;
create index contacts_company_idx on public.contacts (company_id) where company_id is not null;
create index contacts_source_idx on public.contacts (source_id) where source_id is not null;
create index contacts_search_idx on public.contacts using gin (search_text gin_trgm_ops);
alter table public.contacts enable row level security;
-- Pattern B: staff chỉ thấy contact mình phụ trách; owner/admin/manager thấy cả tenant
create policy contacts_select on public.contacts for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())));
create policy contacts_insert on public.contacts for insert
  with check (tenant_id = (select public.current_tenant_id())
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid()))); -- staff tạo phải tự phụ trách
create policy contacts_update on public.contacts for update
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())))
  with check (tenant_id = (select public.current_tenant_id())
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));
create policy contacts_delete on public.contacts for delete
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'));
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- ---------- tags + contact_tags ----------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
alter table public.tags enable row level security;
create policy tags_select on public.tags for select
  using (tenant_id = (select public.current_tenant_id()));
create policy tags_manage on public.tags for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger tags_touch before update on public.tags
  for each row execute function public.touch_updated_at();

create table public.contact_tags (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);
create index contact_tags_tenant_idx on public.contact_tags (tenant_id);
create index contact_tags_tag_idx on public.contact_tags (tag_id);
alter table public.contact_tags enable row level security;
create policy contact_tags_all on public.contact_tags for all
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- ---------- pipelines + pipeline_stages ----------

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pipelines_tenant_idx on public.pipelines (tenant_id, position);
alter table public.pipelines enable row level security;
create policy pipelines_select on public.pipelines for select
  using (tenant_id = (select public.current_tenant_id()));
create policy pipelines_manage on public.pipelines for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger pipelines_touch before update on public.pipelines
  for each row execute function public.touch_updated_at();

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  position int not null default 0,
  win_probability int check (win_probability between 0 and 100),
  kind text not null default 'open' check (kind in ('open','won','lost')),
  rotting_days int, -- quá n ngày không đổi stage → deal "thối"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pipeline_stages_tenant_idx on public.pipeline_stages (tenant_id);
create index pipeline_stages_pipeline_idx on public.pipeline_stages (pipeline_id, position);
alter table public.pipeline_stages enable row level security;
create policy pipeline_stages_select on public.pipeline_stages for select
  using (tenant_id = (select public.current_tenant_id()));
create policy pipeline_stages_manage on public.pipeline_stages for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger pipeline_stages_touch before update on public.pipeline_stages
  for each row execute function public.touch_updated_at();

-- ---------- lost_reasons ----------

create table public.lost_reasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
alter table public.lost_reasons enable row level security;
-- Bảng cấu hình (như pipelines): đọc mọi member, ghi owner/admin/manager
create policy lost_reasons_select on public.lost_reasons for select
  using (tenant_id = (select public.current_tenant_id()));
create policy lost_reasons_manage on public.lost_reasons for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger lost_reasons_touch before update on public.lost_reasons
  for each row execute function public.touch_updated_at();

-- ---------- deals ----------

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id),
  stage_id uuid not null references public.pipeline_stages(id),
  contact_id uuid not null references public.contacts(id),
  company_id uuid references public.companies(id) on delete set null,
  owner_id uuid not null,
  title text not null,
  value_vnd bigint not null default 0 check (value_vnd >= 0),
  expected_close_date date,
  status text not null default 'open' check (status in ('open','won','lost')),
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason_id uuid references public.lost_reasons(id) on delete set null,
  source_id uuid references public.lead_sources(id) on delete set null, -- default = contact.source_id lúc tạo (app gán)
  stage_entered_at timestamptz not null default now(), -- phục vụ SLA/rotting
  next_action_at timestamptz, -- việc kế tiếp
  created_by uuid,
  deleted_at timestamptz, -- soft-delete
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- luật: deal mở PHẢI có việc kế tiếp
  constraint deals_open_needs_next_action check (status <> 'open' or next_action_at is not null),
  constraint deals_lost_reason_only_when_lost check (lost_reason_id is null or status = 'lost')
);
create index deals_tenant_stage_idx on public.deals (tenant_id, pipeline_id, stage_id);
create index deals_tenant_owner_idx on public.deals (tenant_id, owner_id);
create index deals_tenant_status_idx on public.deals (tenant_id, status, won_at);
create index deals_next_action_idx on public.deals (tenant_id, next_action_at)
  where status = 'open' and deleted_at is null; -- danh sách việc kế tiếp
create index deals_pipeline_idx on public.deals (pipeline_id);
create index deals_stage_idx on public.deals (stage_id);
create index deals_contact_idx on public.deals (contact_id);
create index deals_company_idx on public.deals (company_id) where company_id is not null;
create index deals_lost_reason_idx on public.deals (lost_reason_id) where lost_reason_id is not null;
create index deals_source_idx on public.deals (source_id) where source_id is not null;
alter table public.deals enable row level security;
-- Pattern B như contacts
create policy deals_select on public.deals for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())));
create policy deals_insert on public.deals for insert
  with check (tenant_id = (select public.current_tenant_id())
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));
create policy deals_update on public.deals for update
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())))
  with check (tenant_id = (select public.current_tenant_id())
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));
create policy deals_delete on public.deals for delete
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'));
create trigger deals_touch before update on public.deals
  for each row execute function public.touch_updated_at();

-- ---------- deal_stage_history (append-only, ghi bằng trigger) ----------

create table public.deal_stage_history (
  id bigint generated always as identity primary key, -- append-only, cần thứ tự
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages(id),
  to_stage_id uuid not null references public.pipeline_stages(id),
  changed_by uuid,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  duration_seconds bigint
);
create index deal_stage_history_tenant_idx on public.deal_stage_history (tenant_id, entered_at);
create index deal_stage_history_deal_idx on public.deal_stage_history (deal_id, entered_at);
create index deal_stage_history_from_stage_idx on public.deal_stage_history (from_stage_id) where from_stage_id is not null;
create index deal_stage_history_to_stage_idx on public.deal_stage_history (to_stage_id);
alter table public.deal_stage_history enable row level security;
-- Append-only: chỉ select + insert; KHÔNG policy update/delete cho client
create policy deal_stage_history_select on public.deal_stage_history for select
  using (tenant_id = (select public.current_tenant_id()));
create policy deal_stage_history_insert on public.deal_stage_history for insert
  with check (tenant_id = (select public.current_tenant_id()));

-- Trigger 1 (before): đổi stage → cập nhật stage_entered_at
create or replace function public.deals_stage_changed() returns trigger
language plpgsql as $$
begin
  if new.stage_id is distinct from old.stage_id then
    new.stage_entered_at := now();
  end if;
  return new;
end $$;
create trigger deals_stage_changed before update of stage_id on public.deals
  for each row execute function public.deals_stage_changed();

-- Trigger 2 (after): ghi deal_stage_history tự động.
-- security definer để đóng dòng cũ (exited_at) — client không có policy update (append-only).
create or replace function public.log_deal_stage_change() returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.stage_id is distinct from old.stage_id then
      update public.deal_stage_history
        set exited_at = now(),
            duration_seconds = greatest(0, extract(epoch from (now() - entered_at)))::bigint
        where deal_id = new.id and exited_at is null;
      insert into public.deal_stage_history (tenant_id, deal_id, from_stage_id, to_stage_id, changed_by)
        values (new.tenant_id, new.id, old.stage_id, new.stage_id, auth.uid());
    end if;
  else
    insert into public.deal_stage_history (tenant_id, deal_id, from_stage_id, to_stage_id, changed_by)
      values (new.tenant_id, new.id, null, new.stage_id, auth.uid());
  end if;
  return null;
end $$;
create trigger deals_log_stage_history after insert or update of stage_id on public.deals
  for each row execute function public.log_deal_stage_change();

-- ---------- activities (timeline: note/call/meeting/task) ----------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null check (type in ('note','call','meeting','task')),
  subject text,
  body text,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  owner_id uuid not null,
  due_at timestamptz,   -- task/meeting
  done_at timestamptz,
  outcome text,         -- call: connected|no_answer|…
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_need_link check (contact_id is not null or deal_id is not null)
);
create index activities_tenant_owner_idx on public.activities (tenant_id, owner_id);
create index activities_due_idx on public.activities (tenant_id, due_at) where done_at is null;
create index activities_contact_idx on public.activities (contact_id) where contact_id is not null;
create index activities_deal_idx on public.activities (deal_id) where deal_id is not null;
alter table public.activities enable row level security;
-- Pattern B như contacts/deals
create policy activities_select on public.activities for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())));
create policy activities_insert on public.activities for insert
  with check (tenant_id = (select public.current_tenant_id())
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));
create policy activities_update on public.activities for update
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())))
  with check (tenant_id = (select public.current_tenant_id())
              and ((select public.app_role()) in ('owner','admin','manager')
                   or owner_id = (select auth.uid())));
create policy activities_delete on public.activities for delete
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager')
              or owner_id = (select auth.uid())));
create trigger activities_touch before update on public.activities
  for each row execute function public.touch_updated_at();

-- Sau khi ghi activity → bump contacts.last_interaction_at
-- (security definer: hoạt động cả khi người ghi không phải owner của contact)
create or replace function public.activities_touch_contact() returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  if new.contact_id is not null then
    update public.contacts set last_interaction_at = now() where id = new.contact_id;
  end if;
  return null;
end $$;
create trigger activities_touch_contact after insert on public.activities
  for each row execute function public.activities_touch_contact();

-- ==================== INBOX CORE ====================

-- ---------- channels: kênh đã kết nối ----------

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null check (type in ('zalo_oa','facebook','instagram','tiktok_shop','livechat','gmail')),
  external_id text, -- oa_id/page_id/email/shop_id
  display_name text,
  avatar_url text,
  status text not null default 'active' check (status in ('active','token_expired','disconnected','pending_platform')),
  config jsonb not null default '{}'::jsonb, -- KHÔNG chứa secret
  secret_ref text, -- tham chiếu Supabase Vault (access/refresh token — không lưu plaintext)
  token_expires_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, type, external_id)
);
alter table public.channels enable row level security;
-- Đọc: mọi member. Ghi: chỉ owner/admin (kết nối kênh là thao tác settings, dính secret_ref)
create policy channels_select on public.channels for select
  using (tenant_id = (select public.current_tenant_id()));
create policy channels_manage on public.channels for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin'));
create trigger channels_touch before update on public.channels
  for each row execute function public.touch_updated_at();

-- ---------- conversations ----------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null, -- null tới khi định danh
  external_user_id text, -- id người dùng phía nền tảng (zalo user id, psid…)
  status text not null default 'open' check (status in ('open','pending','closed')),
  assignee_user_id uuid,
  last_message_at timestamptz,
  last_user_message_at timestamptz, -- mốc tính cửa sổ trả lời 48h (Zalo/Meta)
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index conversations_channel_user_uidx
  on public.conversations (tenant_id, channel_id, external_user_id)
  where external_user_id is not null; -- resolve hội thoại idempotent theo kênh + user
create index conversations_inbox_idx on public.conversations (tenant_id, status, last_message_at desc);
create index conversations_assignee_idx on public.conversations (tenant_id, assignee_user_id)
  where assignee_user_id is not null;
create index conversations_channel_idx on public.conversations (channel_id);
create index conversations_contact_idx on public.conversations (contact_id) where contact_id is not null;
alter table public.conversations enable row level security;
create policy conversations_select on public.conversations for select
  using (tenant_id = (select public.current_tenant_id()));
create policy conversations_insert on public.conversations for insert
  with check (tenant_id = (select public.current_tenant_id()));
create policy conversations_update on public.conversations for update
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
-- KHÔNG policy delete: hội thoại đóng bằng status='closed', không xóa
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

-- ---------- messages (append-only phía client) ----------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  external_message_id text, -- id phía nền tảng (null với tin out đang chờ gửi)
  sender_type text not null check (sender_type in ('user','agent','system','ai')),
  sender_user_id uuid, -- agent gửi tin
  content text,
  attachments jsonb not null default '[]'::jsonb,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
-- idempotency: webhook retry không tạo tin trùng
create unique index messages_external_uidx
  on public.messages (tenant_id, conversation_id, external_message_id)
  where external_message_id is not null;
create index messages_tenant_time_idx on public.messages (tenant_id, sent_at);
create index messages_conversation_idx on public.messages (conversation_id, sent_at);
alter table public.messages enable row level security;
-- Append-only: chỉ select + insert; KHÔNG policy update/delete cho client
create policy messages_select on public.messages for select
  using (tenant_id = (select public.current_tenant_id()));
create policy messages_insert on public.messages for insert
  with check (tenant_id = (select public.current_tenant_id()));

-- ---------- contact_identities: map định danh kênh → contact CRM ----------

create table public.contact_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel_type text not null check (channel_type in ('zalo_oa','facebook','instagram','tiktok_shop','livechat','gmail')),
  external_id text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_type, external_id)
);
create index contact_identities_contact_idx on public.contact_identities (contact_id);
alter table public.contact_identities enable row level security;
create policy contact_identities_all on public.contact_identities for all
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
create trigger contact_identities_touch before update on public.contact_identities
  for each row execute function public.touch_updated_at();

-- ---------- webhook_events: landing zone (CHỈ service role) ----------

create table public.webhook_events (
  id bigint generated always as identity primary key, -- volume lớn, append-only
  -- Ngoại lệ quy ước: tenant_id NULLABLE — webhook đến trước, resolve tenant sau khi parse.
  -- on delete set null: giữ bản ghi idempotency kể cả khi tenant bị xóa.
  tenant_id uuid references public.tenants(id) on delete set null,
  provider text not null check (provider in ('zalo','meta','google','tiktok','livechat')),
  external_event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, external_event_id) -- chống retry trùng
);
create index webhook_events_pending_idx on public.webhook_events (received_at) where processed_at is null;
create index webhook_events_tenant_idx on public.webhook_events (tenant_id, received_at) where tenant_id is not null;
alter table public.webhook_events enable row level security;
-- KHÔNG policy nào cho client: chỉ service role (bypass RLS) đọc/ghi

-- ---------- canned_responses: câu trả lời mẫu ----------

create table public.canned_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shortcut text not null, -- gõ '/cam-on' trong ô soạn tin
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, shortcut)
);
alter table public.canned_responses enable row level security;
create policy canned_responses_select on public.canned_responses for select
  using (tenant_id = (select public.current_tenant_id()));
create policy canned_responses_manage on public.canned_responses for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger canned_responses_touch before update on public.canned_responses
  for each row execute function public.touch_updated_at();

-- ==================== HẠ TẦNG KÈM THEO ====================

-- Hàng đợi xử lý webhook Zalo (route handler ACK nhanh → đẩy vào queue → worker xử lý)
select pgmq.create('zalo_events');

-- create_tenant(): thêm seed mặc định cho tenant mới
-- (giữ nguyên hành vi migration #2: trial 30 ngày + membership owner + event tenant.created)
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

  -- Seed pipeline mặc định "Bán hàng" + 5 stage (win_probability mặc định, chỉnh được)
  insert into public.pipelines (tenant_id, name, is_default, position)
    values (v_tenant, 'Bán hàng', true, 0)
    returning id into v_pipeline;
  insert into public.pipeline_stages (tenant_id, pipeline_id, name, position, kind, win_probability) values
    (v_tenant, v_pipeline, 'Mới',         0, 'open', 10),
    (v_tenant, v_pipeline, 'Đang tư vấn', 1, 'open', 30),
    (v_tenant, v_pipeline, 'Hẹn lịch',    2, 'open', 60),
    (v_tenant, v_pipeline, 'Đã chốt',     3, 'won', 100),
    (v_tenant, v_pipeline, 'Quay lại',    4, 'open', 20);

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

-- ============================================================
-- THUỘC ĐỢT 2 (GĐ1/GĐ2) — CỐ TÌNH CHƯA LÀM, không phải thiếu sót:
-- CRM:  tier_rules, tier_changes, crm_sla_policies, sla_timers,
--       attribution_touches, deal_attributions, lead_score_settings,
--       custom_field_defs, merge_logs, saved_views, import_jobs, crm_daily_stats;
--       cột contacts.lead_score(+breakdown) — denormalize từ AI lead_scores (X7);
--       đồng bộ deals.status theo pipeline_stages.kind (server action đảm nhiệm,
--       DB đợt 1 chưa tự sync); stage 'lost' trong pipeline seed (đợt 1 xử lý
--       thua bằng deals.status + lost_reason_id).
-- Inbox: inbox_sla_policies, business_hours, assignment_rules(+rotation),
--       zns_templates, campaigns, campaign_recipients, broadcast_quota,
--       conversation_tags(+map), conversation_events, livechat_visitors,
--       gmail_sync_state; cột messages.delivery_status/billed_amount/content_type,
--       conversations.window_quota_used + các cột SLA, contact_identities.follower,
--       webhook_events.status/attempts; các queue pgmq còn lại
--       (meta/google/tiktok/outbound_messages/ai_jobs/campaign_send).
-- AI đợt 1 (ai_settings, ai_jobs, ai_actions…) đi ở migration riêng.
-- ============================================================
