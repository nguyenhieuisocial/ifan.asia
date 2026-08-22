-- ════════════════════════════════════════════════════════════════════
-- MƯỜI TÁM CẠNH CHÉO TIỆM — CHẶN BẰNG KHOÁ NGOẠI GHÉP
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠️ ĐÂY LÀ LỖ THẬT, ĐÃ ĐO ĐƯỢC BẰNG LỆNH GHI THẬT — không phải phòng xa.
--   `scripts/do-canh-cheo-tiem.mjs` ngày 22/08: **17 LỌT · 11 CHẶN · 8 CHƯA ĐO**.
--   Người của tiệm A ghi được dòng mang `tenant_id = A` nhưng cột khoá ngoại
--   trỏ sang bản ghi của tiệm B. RLS chỉ so `tenant_id` của CHÍNH DÒNG ĐÓ nên
--   thấy khớp và cho qua.
--
-- ⚠️ VÌ SAO KHÔNG AI BIẾT: cổng `soat-canh-cheo-tiem.mjs` báo "126 cạnh · 0 đỏ"
--   suốt thời gian đó. 68 trong 126 cạnh đi qua danh sách MIỄN TRỪ, mà cổng
--   **chỉ kiểm cái tên có trong danh sách hay không — không hề đọc lý do miễn
--   trừ**. Hai trường `viSao` và `bangChung` được viết ra nhưng không dòng mã
--   nào đọc chúng. 26 cạnh trong đó khai chung một lý do gộp từ đợt rà 17/08,
--   mà chính đợt ấy ghi 12/63 cạnh KHÔNG an toàn.
--
--   ⇒ Bài học, cùng họ với "công cụ canh gác tự nói dối" đã ghi trong sổ sự
--     thật: **một cổng chỉ canh được phần nó thật sự ĐO. Phần nó tha thì nó
--     không biết gì cả** — và con số 0 đỏ khiến không ai nghi ngờ.
--
-- ┌─ VÌ SAO KHOÁ NGOẠI GHÉP CHỨ KHÔNG PHẢI TRIGGER ───────────────────
-- Đổi khoá ngoại một cột thành khoá ngoại HAI cột `(cột, tenant_id)`. Cơ sở dữ
-- liệu tự bảo đảm bản ghi cha cùng tiệm — không tốn trigger, không có đường
-- lách kể cả khi ai đó viết câu lệnh mới sau này. Cùng cách đã dùng ở #320.
--
-- ⚠️ Khoá ghép mặc định (MATCH SIMPLE) BỎ QUA dòng có bất kỳ cột nào null —
--   nên cột khoá ngoại để trống vẫn ghi bình thường.
--
-- ⚠️ BẢY CẠNH CÒN LẠI KHÔNG dùng được cách này vì chúng `on delete set null`:
--   khoá ghép sẽ gán null cho CẢ `tenant_id`, mà cột đó `not null`. Bảy cạnh
--   đó chặn bằng trigger ở bản vá #360 ngay sau đây.
--
-- Điều kiện: bảng cha phải có khoá duy nhất trên đúng cặp `(id, tenant_id)`.
-- `id` vốn đã duy nhất nên cặp này duy nhất sẵn — thêm ràng buộc không đổi dữ
-- liệu, chỉ dựng thêm một chỉ mục.


alter table public.appointments
  drop constraint if exists appointments_id_tenant_uniq;
alter table public.appointments
  add constraint appointments_id_tenant_uniq unique (id, tenant_id);

alter table public.channels
  drop constraint if exists channels_id_tenant_uniq;
alter table public.channels
  add constraint channels_id_tenant_uniq unique (id, tenant_id);

alter table public.companies
  drop constraint if exists companies_id_tenant_uniq;
alter table public.companies
  add constraint companies_id_tenant_uniq unique (id, tenant_id);

alter table public.contacts
  drop constraint if exists contacts_id_tenant_uniq;
alter table public.contacts
  add constraint contacts_id_tenant_uniq unique (id, tenant_id);

alter table public.conversations
  drop constraint if exists conversations_id_tenant_uniq;
alter table public.conversations
  add constraint conversations_id_tenant_uniq unique (id, tenant_id);

alter table public.deals
  drop constraint if exists deals_id_tenant_uniq;
alter table public.deals
  add constraint deals_id_tenant_uniq unique (id, tenant_id);

alter table public.items
  drop constraint if exists items_id_tenant_uniq;
alter table public.items
  add constraint items_id_tenant_uniq unique (id, tenant_id);

alter table public.lead_sources
  drop constraint if exists lead_sources_id_tenant_uniq;
alter table public.lead_sources
  add constraint lead_sources_id_tenant_uniq unique (id, tenant_id);

alter table public.orders
  drop constraint if exists orders_id_tenant_uniq;
alter table public.orders
  add constraint orders_id_tenant_uniq unique (id, tenant_id);

alter table public.pipeline_stages
  drop constraint if exists pipeline_stages_id_tenant_uniq;
alter table public.pipeline_stages
  add constraint pipeline_stages_id_tenant_uniq unique (id, tenant_id);

alter table public.pipelines
  drop constraint if exists pipelines_id_tenant_uniq;
alter table public.pipelines
  add constraint pipelines_id_tenant_uniq unique (id, tenant_id);

alter table public.projects
  drop constraint if exists projects_id_tenant_uniq;
alter table public.projects
  add constraint projects_id_tenant_uniq unique (id, tenant_id);

alter table public.quick_replies
  drop constraint if exists quick_replies_id_tenant_uniq;
alter table public.quick_replies
  add constraint quick_replies_id_tenant_uniq unique (id, tenant_id);

alter table public.tags
  drop constraint if exists tags_id_tenant_uniq;
alter table public.tags
  add constraint tags_id_tenant_uniq unique (id, tenant_id);


-- ── MƯỜI TÁM CẠNH ────────────────────────────────────────────────────

alter table public.activities drop constraint if exists activities_contact_id_fkey;
alter table public.activities drop constraint if exists activities_contact_id_cung_tiem;
alter table public.activities
  add constraint activities_contact_id_cung_tiem
  foreign key (contact_id, tenant_id)
  references public.contacts (id, tenant_id)
  on delete cascade;
comment on constraint activities_contact_id_cung_tiem on public.activities is
  'activities.contact_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.activities drop constraint if exists activities_deal_id_fkey;
alter table public.activities drop constraint if exists activities_deal_id_cung_tiem;
alter table public.activities
  add constraint activities_deal_id_cung_tiem
  foreign key (deal_id, tenant_id)
  references public.deals (id, tenant_id)
  on delete cascade;
comment on constraint activities_deal_id_cung_tiem on public.activities is
  'activities.deal_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.activities drop constraint if exists activities_project_id_fkey;
alter table public.activities drop constraint if exists activities_project_id_cung_tiem;
alter table public.activities
  add constraint activities_project_id_cung_tiem
  foreign key (project_id, tenant_id)
  references public.projects (id, tenant_id)
  on delete cascade;
comment on constraint activities_project_id_cung_tiem on public.activities is
  'activities.project_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.contact_identities drop constraint if exists contact_identities_contact_id_fkey;
alter table public.contact_identities drop constraint if exists contact_identities_contact_id_cung_tiem;
alter table public.contact_identities
  add constraint contact_identities_contact_id_cung_tiem
  foreign key (contact_id, tenant_id)
  references public.contacts (id, tenant_id)
  on delete cascade;
comment on constraint contact_identities_contact_id_cung_tiem on public.contact_identities is
  'contact_identities.contact_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.contact_merge_dismissals drop constraint if exists contact_merge_dismissals_contact_a_id_fkey;
alter table public.contact_merge_dismissals drop constraint if exists contact_merge_dismissals_contact_a_id_cung_tiem;
alter table public.contact_merge_dismissals
  add constraint contact_merge_dismissals_contact_a_id_cung_tiem
  foreign key (contact_a_id, tenant_id)
  references public.contacts (id, tenant_id)
  on delete cascade;
comment on constraint contact_merge_dismissals_contact_a_id_cung_tiem on public.contact_merge_dismissals is
  'contact_merge_dismissals.contact_a_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.contact_merge_dismissals drop constraint if exists contact_merge_dismissals_contact_b_id_fkey;
alter table public.contact_merge_dismissals drop constraint if exists contact_merge_dismissals_contact_b_id_cung_tiem;
alter table public.contact_merge_dismissals
  add constraint contact_merge_dismissals_contact_b_id_cung_tiem
  foreign key (contact_b_id, tenant_id)
  references public.contacts (id, tenant_id)
  on delete cascade;
comment on constraint contact_merge_dismissals_contact_b_id_cung_tiem on public.contact_merge_dismissals is
  'contact_merge_dismissals.contact_b_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.contact_tags drop constraint if exists contact_tags_contact_id_fkey;
alter table public.contact_tags drop constraint if exists contact_tags_contact_id_cung_tiem;
alter table public.contact_tags
  add constraint contact_tags_contact_id_cung_tiem
  foreign key (contact_id, tenant_id)
  references public.contacts (id, tenant_id)
  on delete cascade;
comment on constraint contact_tags_contact_id_cung_tiem on public.contact_tags is
  'contact_tags.contact_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.contact_tags drop constraint if exists contact_tags_tag_id_fkey;
alter table public.contact_tags drop constraint if exists contact_tags_tag_id_cung_tiem;
alter table public.contact_tags
  add constraint contact_tags_tag_id_cung_tiem
  foreign key (tag_id, tenant_id)
  references public.tags (id, tenant_id)
  on delete cascade;
comment on constraint contact_tags_tag_id_cung_tiem on public.contact_tags is
  'contact_tags.tag_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.conversations drop constraint if exists conversations_channel_id_fkey;
alter table public.conversations drop constraint if exists conversations_channel_id_cung_tiem;
alter table public.conversations
  add constraint conversations_channel_id_cung_tiem
  foreign key (channel_id, tenant_id)
  references public.channels (id, tenant_id)
  on delete cascade;
comment on constraint conversations_channel_id_cung_tiem on public.conversations is
  'conversations.channel_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.deals drop constraint if exists deals_pipeline_id_fkey;
alter table public.deals drop constraint if exists deals_pipeline_id_cung_tiem;
alter table public.deals
  add constraint deals_pipeline_id_cung_tiem
  foreign key (pipeline_id, tenant_id)
  references public.pipelines (id, tenant_id);
comment on constraint deals_pipeline_id_cung_tiem on public.deals is
  'deals.pipeline_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.deals drop constraint if exists deals_stage_id_fkey;
alter table public.deals drop constraint if exists deals_stage_id_cung_tiem;
alter table public.deals
  add constraint deals_stage_id_cung_tiem
  foreign key (stage_id, tenant_id)
  references public.pipeline_stages (id, tenant_id);
comment on constraint deals_stage_id_cung_tiem on public.deals is
  'deals.stage_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.item_costs drop constraint if exists item_costs_item_id_fkey;
alter table public.item_costs drop constraint if exists item_costs_item_id_cung_tiem;
alter table public.item_costs
  add constraint item_costs_item_id_cung_tiem
  foreign key (item_id, tenant_id)
  references public.items (id, tenant_id)
  on delete cascade;
comment on constraint item_costs_item_id_cung_tiem on public.item_costs is
  'item_costs.item_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.messages drop constraint if exists messages_conversation_id_fkey;
alter table public.messages drop constraint if exists messages_conversation_id_cung_tiem;
alter table public.messages
  add constraint messages_conversation_id_cung_tiem
  foreign key (conversation_id, tenant_id)
  references public.conversations (id, tenant_id)
  on delete cascade;
comment on constraint messages_conversation_id_cung_tiem on public.messages is
  'messages.conversation_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.orders drop constraint if exists orders_parent_order_id_fkey;
alter table public.orders drop constraint if exists orders_parent_order_id_cung_tiem;
alter table public.orders
  add constraint orders_parent_order_id_cung_tiem
  foreign key (parent_order_id, tenant_id)
  references public.orders (id, tenant_id)
  on delete restrict;
comment on constraint orders_parent_order_id_cung_tiem on public.orders is
  'orders.parent_order_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.pipeline_stages drop constraint if exists pipeline_stages_pipeline_id_fkey;
alter table public.pipeline_stages drop constraint if exists pipeline_stages_pipeline_id_cung_tiem;
alter table public.pipeline_stages
  add constraint pipeline_stages_pipeline_id_cung_tiem
  foreign key (pipeline_id, tenant_id)
  references public.pipelines (id, tenant_id)
  on delete cascade;
comment on constraint pipeline_stages_pipeline_id_cung_tiem on public.pipeline_stages is
  'pipeline_stages.pipeline_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.qr_codes drop constraint if exists qr_codes_source_id_fkey;
alter table public.qr_codes drop constraint if exists qr_codes_source_id_cung_tiem;
alter table public.qr_codes
  add constraint qr_codes_source_id_cung_tiem
  foreign key (source_id, tenant_id)
  references public.lead_sources (id, tenant_id)
  on delete restrict;
comment on constraint qr_codes_source_id_cung_tiem on public.qr_codes is
  'qr_codes.source_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.quick_reply_usages drop constraint if exists quick_reply_usages_reply_id_fkey;
alter table public.quick_reply_usages drop constraint if exists quick_reply_usages_reply_id_cung_tiem;
alter table public.quick_reply_usages
  add constraint quick_reply_usages_reply_id_cung_tiem
  foreign key (reply_id, tenant_id)
  references public.quick_replies (id, tenant_id)
  on delete cascade;
comment on constraint quick_reply_usages_reply_id_cung_tiem on public.quick_reply_usages is
  'quick_reply_usages.reply_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';

alter table public.source_costs drop constraint if exists source_costs_source_id_fkey;
alter table public.source_costs drop constraint if exists source_costs_source_id_cung_tiem;
alter table public.source_costs
  add constraint source_costs_source_id_cung_tiem
  foreign key (source_id, tenant_id)
  references public.lead_sources (id, tenant_id)
  on delete cascade;
comment on constraint source_costs_source_id_cung_tiem on public.source_costs is
  'source_costs.source_id PHẢI cùng tiệm. Đo 22/08 bằng lệnh ghi thật: cạnh này LỌT — RLS chỉ so tenant_id của chính dòng đó (#359).';
