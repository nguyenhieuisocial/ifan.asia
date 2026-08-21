-- ════════════════════════════════════════════════════════════════════
-- NHẮN NỘI BỘ ĐỢT 2 — GHIM TIN · ĐỂ ĐỌC SAU · TÌM TRONG TIN · MỨC BÁO
-- ════════════════════════════════════════════════════════════════════
--
-- Đợt 1 (#307) đã có luồng trả lời, kênh chủ đề, thả cảm xúc. Đợt này làm bốn
-- thứ còn lại mà thẻ `man-nhan-noi-bo-kieu-slack.html` xếp vào lõi.
--
-- ┌─ 1. GHIM TIN ─────────────────────────────────────────────────────
-- "Số điện thoại thợ trực cuối tuần" · "mã wifi" · "khách VIP cần lưu ý" —
-- những thứ hỏi lại mỗi tuần. Không ghim thì chúng trôi và người ta hỏi lại.
--
-- ⚠️ AI GHIM ĐƯỢC: mọi người ghi được (tức trừ vai Chỉ xem). Không hạn chế
--   riêng cho quản lý — Slack cũng vậy, và trong tiệm thì lễ tân là người biết
--   thứ gì cần ghim nhất. Gỡ ghim thì ai gỡ cũng được: một dải ghim mà chỉ chủ
--   tiệm dọn được sẽ đầy rác trong hai tuần.
--
-- ┌─ 2. ĐỂ ĐỌC SAU ───────────────────────────────────────────────────
-- Khác hẳn ghim: ghim là CHO CẢ KÊNH, để-đọc-sau là RIÊNG MỘT NGƯỜI. Nhân
-- viên đang bận với khách, đánh dấu để tối xem lại.
--
-- ┌─ 3. TÌM TRONG TIN NHẮN ───────────────────────────────────────────
-- "Chị dặn gì về khách dị ứng ấy nhỉ" — không tìm được thì kho tin nhắn thành
-- nơi chôn thông tin.
--
-- ⚠️ Dùng `pg_trgm` + ILIKE, KHÔNG dùng `to_tsvector`. Postgres không có bộ
--   từ điển tiếng Việt; `to_tsvector('simple', ...)` tách từ theo khoảng trắng
--   nên "dị ứng" thành hai từ rời và tìm "dị ứng" sẽ ra cả câu có mỗi chữ
--   "ứng". Trigram không cần từ điển và khớp đúng chuỗi con — đúng thứ người
--   ta mong khi gõ vào ô tìm.
--
-- ┌─ 4. MỨC THÔNG BÁO THEO KÊNH ──────────────────────────────────────
-- Tất cả tin · chỉ khi bị gọi tên · tắt. Không có nó thì người ta tắt thông
-- báo CẢ ứng dụng, và lúc đó lời nhắc lịch hẹn cũng chết theo.

-- ────────────────────────────────────────────────────────────────────
-- 1. GHIM TIN
-- ────────────────────────────────────────────────────────────────────

alter table public.chat_messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references auth.users(id) on delete set null;

-- Hai cột phải ĐI CÙNG NHAU: ghim mà không biết ai ghim thì không hỏi lại được.
alter table public.chat_messages drop constraint if exists chat_messages_ghim_du_doi;
alter table public.chat_messages
  add constraint chat_messages_ghim_du_doi
  check ((pinned_at is null) = (pinned_by is null));

-- Dải ghim của một kênh đọc bằng đúng chỉ mục này, không quét cả kênh.
create index if not exists chat_messages_pinned_idx
  on public.chat_messages (channel_id, pinned_at desc)
  where pinned_at is not null;

/**
 * Ghim/gỡ ghim.
 *
 * Làm bằng hàm chứ không bằng policy UPDATE trên `chat_messages`: policy sửa
 * tin hiện tại chỉ cho sửa TIN CỦA CHÍNH MÌNH trong 15 phút (`chat_messages_
 * update_own`). Ghim là việc khác hẳn — ghim tin của người khác là chuyện
 * bình thường, và ghim một tin ba tháng trước cũng vậy. Nới policy kia ra để
 * ghim đi lọt sẽ mở luôn đường sửa NỘI DUNG tin người khác.
 */
create or replace function public.chat_ghim_tin(p_message_id uuid, p_ghim boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tenant uuid; v_vai text;
begin
  v_tenant := public.current_tenant_id();
  v_vai := public.app_role();

  if v_tenant is null then raise exception 'khong_thuoc_tiem_nao'; end if;
  if v_vai = 'viewer' then raise exception 'vai_chi_xem_khong_ghim_duoc'; end if;

  -- Chỉ đụng tin CÙNG TIỆM. Không có dòng nào đổi thì im lặng là đúng: người
  -- ta bấm ghim hai lần thì lần hai không phải lỗi.
  update public.chat_messages
     set pinned_at = case when p_ghim then now() else null end,
         pinned_by = case when p_ghim then auth.uid() else null end
   where id = p_message_id
     and tenant_id = v_tenant
     and deleted_at is null;

  if not found then raise exception 'khong_tim_thay_tin'; end if;
end;
$$;

revoke all on function public.chat_ghim_tin(uuid, boolean) from public, anon;
grant execute on function public.chat_ghim_tin(uuid, boolean) to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 2. ĐỂ ĐỌC SAU (riêng từng người)
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.chat_saved (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists chat_saved_user_idx
  on public.chat_saved (tenant_id, user_id, created_at desc);

alter table public.chat_saved enable row level security;

-- CHỈ THẤY CỦA MÌNH. Đây không phải dữ liệu chung của tiệm: danh sách "để đọc
-- sau" của một người nói lên họ đang bận gì và quan tâm gì, chủ tiệm cũng
-- không có việc gì phải đọc nó.
create policy chat_saved_select on public.chat_saved
  for select using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );

create policy chat_saved_insert on public.chat_saved
  for insert with check (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
    and exists (select 1 from public.chat_messages m where m.id = chat_saved.message_id)
  );

create policy chat_saved_delete on public.chat_saved
  for delete using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );

-- ────────────────────────────────────────────────────────────────────
-- 3. TÌM TRONG TIN NHẮN
-- ────────────────────────────────────────────────────────────────────

create extension if not exists pg_trgm;

-- Chỉ mục cho ILIKE '%…%'. Không có nó thì mỗi lượt tìm quét cả bảng.
create index if not exists chat_messages_body_trgm_idx
  on public.chat_messages using gin (body gin_trgm_ops)
  where deleted_at is null;

-- ────────────────────────────────────────────────────────────────────
-- 4. MỨC THÔNG BÁO THEO KÊNH
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.chat_channel_prefs (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 'all' = mọi tin · 'mentions' = chỉ khi bị gọi tên · 'off' = tắt hẳn.
  -- KHÔNG có dòng nào = 'all'. Mặc định phải là "nhận đủ": người chưa từng
  -- chỉnh mà tự nhiên không nhận tin là lỗi im lặng tệ nhất của mảng thông báo.
  muc text not null check (muc in ('all', 'mentions', 'off')),
  updated_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

alter table public.chat_channel_prefs enable row level security;

create policy chat_channel_prefs_select on public.chat_channel_prefs
  for select using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );

create policy chat_channel_prefs_write on public.chat_channel_prefs
  for all using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
  );

comment on column public.chat_messages.pinned_at is
  'Ghim tin — CHO CẢ KÊNH. Đặt qua hàm chat_ghim_tin, không qua policy update (policy đó chỉ cho sửa tin của chính mình trong 15 phút) — #309.';
comment on table public.chat_saved is
  'Để đọc sau — RIÊNG từng người, chủ tiệm cũng không đọc được. Khác hẳn ghim (ghim là cho cả kênh) — #309.';
comment on table public.chat_channel_prefs is
  'Mức thông báo theo kênh. KHÔNG có dòng = "all": mặc định phải là nhận đủ — #309.';
