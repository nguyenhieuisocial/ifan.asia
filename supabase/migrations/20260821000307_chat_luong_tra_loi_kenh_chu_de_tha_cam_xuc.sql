-- ════════════════════════════════════════════════════════════════════
-- NHẮN NỘI BỘ ĐỢT 1 — LUỒNG TRẢ LỜI · KÊNH CHỦ ĐỀ · THẢ CẢM XÚC
-- ════════════════════════════════════════════════════════════════════
--
-- Founder yêu cầu 21/08: dựng màn Nhắn nội bộ theo lối Slack, "hết lõi và tính
-- năng". Bản thiết kế `man-nhan-noi-bo-kieu-slack.html` chia làm ba đợt; đây là
-- ĐỢT 1 — bốn thứ đổi cách dùng nhiều nhất, và ba trong bốn chỉ cần sửa nhỏ ở
-- tầng dữ liệu.
--
-- ┌─ 1. LUỒNG TRẢ LỜI ────────────────────────────────────────────────
-- Quan trọng nhất. Không có nó thì một câu hỏi và bốn câu trả lời trộn lẫn với
-- mọi thứ khác, và kênh chung thành đống hỗn độn ngay khi tiệm đông người.
-- Chỉ cần một cột `parent_id` trỏ về tin gốc.
--
-- ⚠️ CHỈ MỘT TẦNG: trả lời của trả lời KHÔNG được phép. Slack cũng vậy, và có
--   lý do — luồng lồng nhau nhiều tầng thì không ai theo nổi mạch nữa. Chặn
--   bằng ràng buộc, không bằng lời dặn.
--
-- ┌─ 2. KÊNH CHỦ ĐỀ ──────────────────────────────────────────────────
-- Hiện `kind` chỉ nhận 'team' (đúng MỘT kênh cả tiệm) và 'dm'. Tiệm cần
-- #le-tan, #ky-thuat-vien, #quan-ly. Thêm loại 'topic' có tên và mô tả.
--
-- ⚠️ QUYẾT ĐỊNH VỀ KÊNH HẠN CHẾ, và nói thẳng ra:
--   Câu hỏi đặt trên thẻ là *"chủ tiệm có đọc được kênh riêng của quản lý
--   không?"* — có thì "riêng tư" là lời nói dối, không thì có chỗ trong tiệm
--   chủ không nắm.
--   **Chọn: chủ tiệm LUÔN đọc được, và màn hình NÓI RÕ điều đó.** Vì vậy tên
--   gọi là "kênh HẠN CHẾ" chứ không phải "kênh riêng tư" — người dùng phải
--   biết đúng thứ họ đang dùng. Một cái nhãn hứa nhiều hơn sự thật là thứ tệ
--   hơn cả việc không có tính năng.
--
-- ┌─ 3. THẢ CẢM XÚC ──────────────────────────────────────────────────
-- Không phải cho vui: 👍 thay cho một câu "đã đọc", ✅ thay cho "em làm rồi".
-- Bớt hẳn tin nhắn rác trong kênh đông người.
--
-- ┌─ 4. SỐ TIN CHƯA ĐỌC ──────────────────────────────────────────────
-- Đã có sẵn `chat_reads.last_read_at` — không cần migration, chỉ cần tầng web
-- bày ra. Làm ở lượt sửa mã cùng ngày.

-- ────────────────────────────────────────────────────────────────────
-- 1. KÊNH CHỦ ĐỀ
-- ────────────────────────────────────────────────────────────────────

alter table public.chat_channels
  add column if not exists name text,
  add column if not exists description text,
  -- "hạn chế" chứ không phải "riêng tư" — xem ghi chú ở đầu file.
  add column if not exists is_restricted boolean not null default false;

-- Ràng buộc cũ khoá cứng hai loại. Thay bằng bản có 'topic'.
alter table public.chat_channels drop constraint if exists chat_channels_kind_check;
alter table public.chat_channels drop constraint if exists chat_channels_kind_shape_check;

alter table public.chat_channels
  add constraint chat_channels_kind_check
  check (kind in ('team', 'dm', 'topic'));

alter table public.chat_channels
  add constraint chat_channels_kind_shape_check check (
    (kind = 'team'  and dm_a is null and dm_b is null and name is null)
    or (kind = 'dm' and dm_a is not null and dm_b is not null and dm_a < dm_b and name is null)
    -- Kênh chủ đề PHẢI có tên: một kênh không tên thì không ai biết vào đó nói gì.
    or (kind = 'topic' and dm_a is null and dm_b is null
        and name is not null and length(trim(name)) between 1 and 40)
  );

-- Tên kênh không trùng trong cùng tiệm — hai kênh #le-tan là một chỗ để lạc.
create unique index if not exists chat_channels_topic_name_uniq
  on public.chat_channels (tenant_id, lower(name))
  where kind = 'topic';

-- Ai ở trong kênh HẠN CHẾ. Kênh chủ đề thường (không hạn chế) thì cả tiệm vào
-- được, không cần dòng nào ở đây.
create table if not exists public.chat_channel_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists chat_channel_members_user_idx
  on public.chat_channel_members (tenant_id, user_id);

alter table public.chat_channel_members enable row level security;

create policy chat_channel_members_select on public.chat_channel_members
  for select using (tenant_id = (select public.current_tenant_id()));

-- Chỉ chủ/quản trị/quản lý thêm bớt người vào kênh hạn chế.
create policy chat_channel_members_write on public.chat_channel_members
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

-- Ai THẤY kênh nào. Thay chính sách cũ (chỉ biết 'team' và 'dm').
drop policy if exists chat_channels_select on public.chat_channels;
create policy chat_channels_select on public.chat_channels
  for select using (
    tenant_id = (select public.current_tenant_id())
    and (
      kind = 'team'
      or ((select auth.uid()) = dm_a or (select auth.uid()) = dm_b)
      or (kind = 'topic' and not is_restricted)
      or (kind = 'topic' and is_restricted and (
            -- CHỦ TIỆM luôn thấy — quyết định đã ghi ở đầu file, và màn hình
            -- nói thẳng điều này cho mọi thành viên của kênh.
            (select public.app_role()) = 'owner'
            or exists (
              select 1 from public.chat_channel_members m
               where m.channel_id = chat_channels.id
                 and m.user_id = (select auth.uid()))))
    )
  );

-- Tạo kênh chủ đề: chỉ chủ/quản trị/quản lý. Kênh riêng (dm) thì ai cũng tạo
-- được như cũ.
drop policy if exists chat_channels_insert on public.chat_channels;
create policy chat_channels_insert on public.chat_channels
  for insert with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
    and (
      (kind = 'dm' and ((select auth.uid()) = dm_a or (select auth.uid()) = dm_b))
      or (kind = 'topic' and (select public.app_role()) in ('owner', 'admin', 'manager'))
    )
  );

-- Sửa tên/mô tả kênh chủ đề — cùng ba vai đó.
create policy chat_channels_update on public.chat_channels
  for update using (
    tenant_id = (select public.current_tenant_id())
    and kind = 'topic'
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and kind = 'topic'
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

-- ────────────────────────────────────────────────────────────────────
-- 2. LUỒNG TRẢ LỜI
-- ────────────────────────────────────────────────────────────────────

alter table public.chat_messages
  add column if not exists parent_id uuid references public.chat_messages(id) on delete cascade;

-- Đọc "4 câu trả lời" của một tin gốc mà không quét cả kênh.
create index if not exists chat_messages_parent_idx
  on public.chat_messages (parent_id, created_at)
  where parent_id is not null;

/**
 * CHỈ MỘT TẦNG: tin trả lời không được có tin trả lời.
 *
 * Chặn ở trigger chứ không ở ràng buộc `check` — `check` không đọc được bảng
 * khác (ở đây là chính bảng này, dòng khác). Cũng kiểm luôn: tin gốc phải nằm
 * CÙNG KÊNH, nếu không thì một luồng có thể vắt qua hai kênh và không màn nào
 * hiển thị đúng được.
 */
create or replace function private.chat_luong_mot_tang()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cha record;
begin
  if new.parent_id is null then return new; end if;

  select id, channel_id, parent_id, tenant_id
    into v_cha from public.chat_messages where id = new.parent_id;

  if v_cha.id is null then
    raise exception 'tin_goc_khong_ton_tai';
  end if;
  if v_cha.parent_id is not null then
    raise exception 'luong_chi_mot_tang';
  end if;
  if v_cha.channel_id <> new.channel_id or v_cha.tenant_id <> new.tenant_id then
    raise exception 'tin_goc_khac_kenh';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_messages_luong_mot_tang on public.chat_messages;
create trigger chat_messages_luong_mot_tang
  before insert or update of parent_id on public.chat_messages
  for each row execute function private.chat_luong_mot_tang();

-- ────────────────────────────────────────────────────────────────────
-- 3. THẢ CẢM XÚC
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.chat_reactions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Một chuỗi emoji ngắn. Giới hạn 16 ký tự: đủ cho emoji ghép (cờ, da màu,
  -- gia đình) mà không thành chỗ nhét chữ.
  emoji text not null check (length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  -- Một người thả MỘT loại cảm xúc MỘT lần trên mỗi tin.
  primary key (message_id, user_id, emoji)
);
create index if not exists chat_reactions_message_idx
  on public.chat_reactions (message_id);

alter table public.chat_reactions enable row level security;

-- Thấy cảm xúc trên tin nào mình đọc được — dựa thẳng vào chính sách của
-- `chat_messages`, không chép lại luật kênh lần thứ hai.
create policy chat_reactions_select on public.chat_reactions
  for select using (
    tenant_id = (select public.current_tenant_id())
    and exists (select 1 from public.chat_messages m where m.id = chat_reactions.message_id)
  );

create policy chat_reactions_insert on public.chat_reactions
  for insert with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
    and user_id = (select auth.uid())
    and exists (select 1 from public.chat_messages m where m.id = chat_reactions.message_id)
  );

-- Gỡ cảm xúc CỦA CHÍNH MÌNH. Không ai gỡ hộ người khác.
create policy chat_reactions_delete on public.chat_reactions
  for delete using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );

comment on column public.chat_channels.is_restricted is
  'Kênh HẠN CHẾ (không gọi là "riêng tư"): chỉ thành viên vào được, NHƯNG chủ tiệm luôn đọc được và màn hình nói rõ điều đó — #307.';
comment on column public.chat_messages.parent_id is
  'Tin gốc của luồng trả lời. CHỈ MỘT TẦNG, chặn bằng trigger chat_messages_luong_mot_tang — #307.';
