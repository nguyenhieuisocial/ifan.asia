-- ════════════════════════════════════════════════════════════════════
-- CHẶN MỌI CẠNH CHÉO TIỆM CỦA MÀN NHẮN NỘI BỘ VÀ MÀN LỊCH
-- ════════════════════════════════════════════════════════════════════
--
-- Cổng `soat-canh-cheo-tiem` liệt kê tám cạnh khoá ngoại trong hai màn này
-- mà cơ sở dữ liệu KHÔNG chặn được việc trỏ chéo tiệm:
--
--     chat_attachments.message_id      → chat_messages     (#318, của lượt này)
--     chat_saved.message_id            → chat_messages     (#309, của lượt này)
--     chat_channel_members.channel_id  → chat_channels     (#307, của lượt này)
--     chat_channel_prefs.channel_id    → chat_channels     (#309, của lượt này)
--     chat_mentions.message_id         → chat_messages     (có từ trước)
--     chat_messages.channel_id         → chat_channels     (có từ trước)
--     chat_reads.channel_id            → chat_channels     (có từ trước)
--     appointments.staff_employee_id   → employees         (có từ trước)
--
-- Vì sao RLS KHÔNG cứu được: chính sách chỉ so `tenant_id` của CHÍNH DÒNG
-- ĐANG GHI. Người tiệm A ghi một dòng mang `tenant_id = A` nhưng cột khoá
-- ngoại trỏ sang bản ghi của tiệm B — `tenant_id` khớp nên chính sách cho
-- qua, còn cạnh trỏ chéo thì không ai soi.
--
-- Hậu quả cụ thể, không phải lý thuyết:
--   · gắn tệp của tiệm A vào tin nhắn của tiệm B, rồi màn hình của B đi xin
--     đường dẫn có chữ ký cho tệp đó;
--   · thêm người của tiệm A vào kênh hạn chế của tiệm B;
--   · giao một buổi hẹn của tiệm A cho nhân viên của tiệm B, và con số đó
--     chảy vào bảng lương.
--
-- ┌─ CHỮA BẰNG KHOÁ NGOẠI GHÉP ───────────────────────────────────────
-- Khoá ngoại hai cột `(khoá, tenant_id)` → `(id, tenant_id)`. Cơ sở dữ liệu
-- tự bảo đảm hai đầu cùng tiệm, không cần trigger, và không có đường lách kể
-- cả khi ai đó viết một câu lệnh mới sau này.
--
-- ⚠️ Giữ NGUYÊN hành vi xoá của từng cạnh (`cascade` hay `restrict`) — đổi
--   chúng ở đây là lén đổi một luật nghiệp vụ trong một migration về bảo mật.

-- ── Khoá duy nhất trên (id, tenant_id) của các bảng được trỏ tới ────
alter table public.chat_messages
  drop constraint if exists chat_messages_id_tenant_uniq;
alter table public.chat_messages
  add constraint chat_messages_id_tenant_uniq unique (id, tenant_id);

alter table public.chat_channels
  drop constraint if exists chat_channels_id_tenant_uniq;
alter table public.chat_channels
  add constraint chat_channels_id_tenant_uniq unique (id, tenant_id);

alter table public.employees
  drop constraint if exists employees_id_tenant_uniq;
alter table public.employees
  add constraint employees_id_tenant_uniq unique (id, tenant_id);

-- ── chat_attachments.message_id ────────────────────────────────────
alter table public.chat_attachments
  drop constraint if exists chat_attachments_message_id_fkey;
alter table public.chat_attachments
  drop constraint if exists chat_attachments_tin_cung_tiem;
alter table public.chat_attachments
  add constraint chat_attachments_tin_cung_tiem
  foreign key (message_id, tenant_id)
  references public.chat_messages (id, tenant_id) on delete cascade;

-- ── chat_saved.message_id ──────────────────────────────────────────
alter table public.chat_saved
  drop constraint if exists chat_saved_message_id_fkey;
alter table public.chat_saved
  drop constraint if exists chat_saved_tin_cung_tiem;
alter table public.chat_saved
  add constraint chat_saved_tin_cung_tiem
  foreign key (message_id, tenant_id)
  references public.chat_messages (id, tenant_id) on delete cascade;

-- ── chat_mentions.message_id ───────────────────────────────────────
alter table public.chat_mentions
  drop constraint if exists chat_mentions_message_id_fkey;
alter table public.chat_mentions
  drop constraint if exists chat_mentions_tin_cung_tiem;
alter table public.chat_mentions
  add constraint chat_mentions_tin_cung_tiem
  foreign key (message_id, tenant_id)
  references public.chat_messages (id, tenant_id) on delete cascade;

-- ── chat_messages.channel_id ───────────────────────────────────────
alter table public.chat_messages
  drop constraint if exists chat_messages_channel_id_fkey;
alter table public.chat_messages
  drop constraint if exists chat_messages_kenh_cung_tiem;
alter table public.chat_messages
  add constraint chat_messages_kenh_cung_tiem
  foreign key (channel_id, tenant_id)
  references public.chat_channels (id, tenant_id) on delete cascade;

-- ── chat_channel_members.channel_id ────────────────────────────────
alter table public.chat_channel_members
  drop constraint if exists chat_channel_members_channel_id_fkey;
alter table public.chat_channel_members
  drop constraint if exists chat_channel_members_kenh_cung_tiem;
alter table public.chat_channel_members
  add constraint chat_channel_members_kenh_cung_tiem
  foreign key (channel_id, tenant_id)
  references public.chat_channels (id, tenant_id) on delete cascade;

-- ── chat_channel_prefs.channel_id ──────────────────────────────────
alter table public.chat_channel_prefs
  drop constraint if exists chat_channel_prefs_channel_id_fkey;
alter table public.chat_channel_prefs
  drop constraint if exists chat_channel_prefs_kenh_cung_tiem;
alter table public.chat_channel_prefs
  add constraint chat_channel_prefs_kenh_cung_tiem
  foreign key (channel_id, tenant_id)
  references public.chat_channels (id, tenant_id) on delete cascade;

-- ── chat_reads.channel_id ──────────────────────────────────────────
alter table public.chat_reads
  drop constraint if exists chat_reads_channel_id_fkey;
alter table public.chat_reads
  drop constraint if exists chat_reads_kenh_cung_tiem;
alter table public.chat_reads
  add constraint chat_reads_kenh_cung_tiem
  foreign key (channel_id, tenant_id)
  references public.chat_channels (id, tenant_id) on delete cascade;

-- ── appointments.staff_employee_id ─────────────────────────────────
-- ⚠️ Giữ `on delete restrict`: xoá một nhân viên còn ca đang giữ chỗ phải bị
--   chặn, không được lặng lẽ bỏ trống người làm của những ca đó.
alter table public.appointments
  drop constraint if exists appointments_staff_employee_id_fkey;
alter table public.appointments
  drop constraint if exists appointments_tho_cung_tiem;
alter table public.appointments
  add constraint appointments_tho_cung_tiem
  foreign key (staff_employee_id, tenant_id)
  references public.employees (id, tenant_id) on delete restrict;
