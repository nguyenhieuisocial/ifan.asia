-- #298 — CHAT NỘI BỘ RIÊNG: một nơi để nhắn nhau, không neo vào việc nào.
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO CÓ FILE NÀY — quyết định 1 của thẻ đã BỊ LẬT
-- ════════════════════════════════════════════════════════════════════
--
-- Thẻ `man-chat-noi-bo.html` (19/08) chốt: "không có ô chat trống để tán gẫu",
-- và lý do rất cụ thể — "tiệm nào cũng đã có nhóm Zalo, dựng thêm một chỗ chat
-- nữa thì không ai chuyển sang". Lập luận đó KHÔNG sai, và nó vẫn được ghi lại
-- nguyên văn trong thẻ.
--
-- Ngày 21/08 founder nhìn sản phẩm thật và nói: *"sao tôi chưa thấy tính năng
-- chat nội bộ riêng, chỉ mới thấy note nội bộ thôi"*. Đó là dữ liệu mới mà lập
-- luận cũ không có: thứ đã dựng KHÔNG ĐỌC RA là "chat nội bộ" với người dùng —
-- nó đọc ra là "ghi chú gắn vào việc". Hai thứ khác nhau, và tiệm cần cả hai.
--
-- ⚠️ GHI CHÚ GẮN-VÀO-VIỆC (#169) KHÔNG BỊ ĐỤNG MỘT CHỮ. Đây là thứ THÊM VÀO.
--    Ba bảng `internal_*` giữ nguyên hành vi, giữ nguyên quyết định 2/3/4/5.
--
-- ════════════════════════════════════════════════════════════════════
-- QUYẾT ĐỊNH KIẾN TRÚC: BẢNG MỚI, KHÔNG NỚI BẢNG CŨ
-- ════════════════════════════════════════════════════════════════════
--
-- Đã cân nhắc nới `internal_threads.entity_type/entity_id` thành cho phép rỗng.
-- BÁC, bốn lý do — lý do (2) là lý do quyết định:
--
-- (1) "PHẢI NHỚ LỌC MÃI MÃI". Hai cột đó đang `not null`. Cho phép rỗng thì MỌI
--     câu truy vấn `internal_*` đang có và MỌI câu viết sau này phải nhớ loại
--     dòng rỗng ra. Đó ĐÚNG LÀ căn bệnh mà chính thẻ này đã dùng để từ chối
--     trộn chat nội bộ vào hộp thư khách — không thể viện nó để cấm chuyện kia
--     rồi tự làm chuyện đó ở đây.
--
-- (2) HAI BỘ QUYỀN KHÁC NHAU VỀ BẢN CHẤT, KHÔNG PHẢI KHÁC VỀ MỨC ĐỘ.
--     Chat gắn-vào-việc THỪA HƯỞNG quyền của việc (`internal_thread_doc_duoc`
--     hỏi lại policy của orders/appointments/…). Chat rời KHÔNG CÓ việc để hỏi
--     — quyền của nó là TƯ CÁCH THÀNH VIÊN. Gộp một bảng thì policy buộc phải
--     rẽ nhánh: "nếu neo rỗng thì hỏi tư cách, ngược lại hỏi việc". Một policy
--     hai nhánh chính là hai bộ quyền nằm chung một chỗ — tệ hơn hai bảng, vì
--     sửa nhánh này rất dễ làm gãy nhánh kia mà không có gì báo.
--
-- (3) RÀNG BUỘC "MỘT VIỆC MỘT CUỘC" (`unique (tenant_id, entity_type, entity_id)`)
--     mất nghĩa khi neo rỗng: Postgres coi mọi NULL là khác nhau, nên bảng sẽ
--     nhận vô số cuộc trống — đúng thứ ràng buộc đó sinh ra để chặn.
--
-- (4) ĐẾM CHƯA ĐỌC. Chat rời BẮT BUỘC có (không có thì màn chat riêng vô dụng);
--     chat gắn-vào-việc CỐ Ý KHÔNG có (thẻ, và đã xét lại 21/08 vẫn giữ). Gộp
--     một bảng là kéo luôn bên kia vào bộ nhớ đọc mà nó đã từ chối.
--
-- ⇒ Bốn bảng mới: `chat_channels` · `chat_messages` · `chat_mentions` ·
--   `chat_reads`. Dùng LẠI `notifications` cho việc báo gọi tên — không dựng
--   đường báo thứ hai (yêu cầu 4).

-- ════════════════════════════════════════════════════════════════════
-- 1. KÊNH
-- ════════════════════════════════════════════════════════════════════
-- Hai loại, tập ĐÓNG:
--   'team' — kênh cả tiệm. ĐÚNG MỘT kênh mỗi tiệm, mọi thành viên đang hoạt
--            động đều ở trong. KHÔNG có bảng thành viên: tư cách suy thẳng từ
--            `tenant_members` qua `current_tenant_id()`. Một bảng thành viên
--            riêng là bản sao của danh sách nhân sự, và bản sao thì sẽ lệch —
--            người nghỉ việc bị gỡ ở một chỗ mà vẫn còn ở chỗ kia.
--   'dm'   — nhắn riêng giữa ĐÚNG hai người.
--
-- KHÔNG CÓ CỘT `name`. Kênh cả tiệm chỉ có một nên tên là hằng số của giao
-- diện (dịch được sang tiếng Anh); tên kênh riêng là tên người còn lại, đọc từ
-- `profiles`. Ghi tên vào CSDL là chôn một chuỗi tiếng Việt vào dữ liệu rồi bản
-- tiếng Anh không dịch được — lỗi kho đã dính ở thanh nav (ghi chú `navLabelFor`).
create table if not exists public.chat_channels (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  kind       text not null check (kind in ('team', 'dm')),

  -- Cặp người của kênh riêng, LUÔN xếp theo thứ tự tăng dần. Chuẩn hoá ở tầng
  -- ràng buộc chứ không ở tầng web: nếu để (A,B) và (B,A) cùng hợp lệ thì hai
  -- người mở kênh cùng lúc sẽ ra HAI cuộc, mỗi người nhắn vào một cuộc và
  -- không ai thấy tin của ai — hỏng im lặng, rất khó lần ra.
  -- `on delete restrict` (khuôn `internal_messages.sender_user_id`): chat là
  -- bằng chứng ai bảo làm gì, không biến mất theo một lệnh xoá tài khoản.
  dm_a       uuid references auth.users(id) on delete restrict,
  dm_b       uuid references auth.users(id) on delete restrict,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint chat_channels_hinh_dang check (
    (kind = 'team' and dm_a is null and dm_b is null)
    or (kind = 'dm' and dm_a is not null and dm_b is not null and dm_a < dm_b)
  )
);

-- Đúng MỘT kênh cả tiệm mỗi tiệm.
create unique index if not exists chat_channels_mot_kenh_ca_tiem
  on public.chat_channels (tenant_id) where kind = 'team';

-- Một cặp một kênh. Đây là chốt chặn THẬT cho chuyện trùng kênh riêng — hai
-- người bấm cùng lúc thì một bên ăn 23505 và đọc lại kênh của bên kia.
create unique index if not exists chat_channels_mot_cap_mot_kenh
  on public.chat_channels (tenant_id, dm_a, dm_b) where kind = 'dm';

comment on table public.chat_channels is
  'Chat nội bộ RIÊNG (#298) — kênh cả tiệm + nhắn riêng 1-1. Tách hẳn internal_threads (#169) vì quyền của nó là TƯ CÁCH THÀNH VIÊN, còn bên kia THỪA HƯỞNG quyền của việc. Không có bảng thành viên: tư cách suy từ tenant_members.';

-- ════════════════════════════════════════════════════════════════════
-- 2. TIN
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.chat_messages (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  channel_id     uuid not null references public.chat_channels(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  body           text not null check (length(trim(body)) between 1 and 4000),
  -- Cả hai dấu do TRIGGER đóng, không nhận từ client: một dấu "đã sửa" mà người
  -- sửa tự viết thì không chứng minh được gì.
  edited_at      timestamptz,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists chat_messages_kenh_idx
  on public.chat_messages (channel_id, created_at desc);
create index if not exists chat_messages_tenant_idx
  on public.chat_messages (tenant_id, created_at desc);

-- Cùng ba luật của #169, CỐ Ý chép lại chứ không nới lỏng: chat rời cũng là chỗ
-- người ta dặn nhau đổi ca, giao việc. "Bằng chứng ai bảo làm gì" đúng ở đây y
-- như ở chat gắn-vào-việc.
create or replace function public.chat_messages_sua_15_phut()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.channel_id     is distinct from old.channel_id
  or new.sender_user_id is distinct from old.sender_user_id
  or new.created_at     is distinct from old.created_at
  or new.tenant_id      is distinct from old.tenant_id then
    raise exception 'chat_message_immutable';
  end if;

  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'chat_message_undelete_forbidden';
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_at := now();   -- giờ xoá do máy đóng
  end if;

  if new.body is distinct from old.body then
    if old.deleted_at is not null then
      raise exception 'chat_message_deleted';
    end if;
    if now() - old.created_at > interval '15 minutes' then
      raise exception 'chat_message_edit_window_closed';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$$;
drop trigger if exists chat_messages_sua_15_phut on public.chat_messages;
create trigger chat_messages_sua_15_phut before update on public.chat_messages
  for each row execute function public.chat_messages_sua_15_phut();

-- ════════════════════════════════════════════════════════════════════
-- 3. GỌI TÊN ⇒ THÔNG BÁO (dùng lại `notifications`, không dựng đường thứ hai)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.chat_mentions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  message_id        uuid not null references public.chat_messages(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  constraint chat_mentions_khong_trung unique (message_id, mentioned_user_id)
);
create index if not exists chat_mentions_nguoi_idx
  on public.chat_mentions (tenant_id, mentioned_user_id, created_at desc);

-- `security definer` vì `notifications` không có policy INSERT cho client
-- (migration #2: "ghi notification: chỉ service role / definer").
create or replace function public.chat_mentions_bao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_body  text;
  v_kenh  uuid;
begin
  select m.body, m.channel_id into v_body, v_kenh
    from public.chat_messages m where m.id = new.message_id;

  insert into public.notifications (tenant_id, user_id, type, title, body, link)
  values (new.tenant_id, new.mentioned_user_id, 'chat_mention',
          'Có người nhắc tên bạn trong tin nhắn nội bộ',
          left(coalesce(v_body, ''), 300),
          '/app/chat?c=' || v_kenh::text);

  return null;
end;
$$;
drop trigger if exists chat_mentions_bao on public.chat_mentions;
create trigger chat_mentions_bao after insert on public.chat_mentions
  for each row execute function public.chat_mentions_bao();

comment on table public.chat_mentions is
  'Chat riêng #298 — NGUỒN DUY NHẤT sinh thông báo, y hệt khuôn internal_mentions (#169): trigger gắn ở ĐÂY chứ không gắn trên insert chat_messages. Gắn nhầm chỗ thì mọi tin đều báo và ai cũng tắt thông báo.';

-- ════════════════════════════════════════════════════════════════════
-- 4. ĐÃ ĐỌC TỚI ĐÂU — chỗ khác hẳn #169
-- ════════════════════════════════════════════════════════════════════
-- Chat gắn-vào-việc CỐ Ý không có bộ nhớ này (và 21/08 đã xét lại, vẫn giữ):
-- ở đó người ta đang đứng SẴN trong việc, không phải đi dò.
-- Màn chat riêng thì ngược hẳn — không có số chưa đọc thì phải mở từng cuộc ra
-- dò xem có ai nhắn gì không, tức là màn chat vô dụng. Đây là LÝ DO CHÍNH ĐÁNG
-- để có bộ nhớ "ai đọc tới đâu", và nó chỉ áp cho các bảng `chat_*`.
--
-- Lưu MỐC THỜI GIAN chứ không lưu từng tin đã đọc: một dòng mỗi người mỗi kênh,
-- không phình theo số tin. Đổi lại thì không biết "đã đọc tin nào" — nhưng cái
-- cần trả lời chỉ là "còn bao nhiêu tin sau lần mình xem gần nhất".
create table if not exists public.chat_reads (
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  channel_id   uuid not null references public.chat_channels(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- ════════════════════════════════════════════════════════════════════
-- 5. QUYỀN
-- ════════════════════════════════════════════════════════════════════
alter table public.chat_channels enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_mentions enable row level security;
alter table public.chat_reads    enable row level security;

-- ---- Kênh ----
-- `current_tenant_id()` đã lọc theo `tenant_members.status = 'active'`, nên
-- NGƯỜI NGHỈ VIỆC MẤT QUYỀN NGAY ở đây mà không cần một dòng nào riêng: gỡ tư
-- cách (hoặc máy tự gỡ theo ngày nghỉ, migration #280) là mọi câu dưới đây trả
-- 0 dòng. KHÔNG tự viết lại phép kiểm tư cách — kho từng có 13 file chép lại
-- phép này và thiếu sót.
create policy chat_channels_select on public.chat_channels for select
  using (
    tenant_id = (select public.current_tenant_id())
    and (kind = 'team' or (select auth.uid()) in (dm_a, dm_b))
  );

-- Chỉ mở được kênh RIÊNG, và phải có mình trong đó. Kênh cả tiệm do máy dựng
-- (mục 6) — client không có đường tạo, nên không ai dựng được kênh "cả tiệm"
-- thứ hai hay kênh cả tiệm của tiệm khác.
-- `viewer` không mở được kênh: mở kênh là GHI. Họ vẫn đọc được kênh cả tiệm và
-- kênh riêng do người khác mở với họ — đúng luật "Chỉ xem đọc được, không ghi".
create policy chat_channels_insert on public.chat_channels for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
    and kind = 'dm'
    and (select auth.uid()) in (dm_a, dm_b)
    -- Người kia phải CÒN trong tiệm. Mở kênh với một uuid lạ chỉ đẻ ra một cuộc
    -- không ai đọc được — rác im lặng.
    and dm_a in (select tm.user_id from public.tenant_members tm
                  where tm.tenant_id = (select public.current_tenant_id()) and tm.status = 'active')
    and dm_b in (select tm.user_id from public.tenant_members tm
                  where tm.tenant_id = (select public.current_tenant_id()) and tm.status = 'active')
  );
-- KHÔNG có UPDATE/DELETE: đổi `dm_a`/`dm_b` là bê cả cuộc trò chuyện sang cho
-- người khác đọc. Không có nút xoá cả cuộc.

-- ---- Tin ----
-- `exists (… from chat_channels …)` chạy dưới quyền người gọi ⇒ policy của
-- `chat_channels` áp vào. Quyền đi một chuỗi từ KÊNH xuống TIN, không có bản sao.
create policy chat_messages_select on public.chat_messages for select
  using (
    tenant_id = (select public.current_tenant_id())
    and exists (select 1 from public.chat_channels c where c.id = channel_id)
  );

create policy chat_messages_insert on public.chat_messages for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
    and sender_user_id = (select auth.uid())
    and exists (select 1 from public.chat_channels c where c.id = channel_id)
  );

-- ⚠️ CỐ Ý KHÔNG có nhánh `or app_role() in ('owner','admin')` — y hệt #169.
-- Chủ tiệm KHÔNG sửa/xoá được tin của người khác: chat là bằng chứng ai bảo làm
-- gì, mà người có nhiều động cơ chối nhất chính là người ra lệnh. Gần hết policy
-- trong kho này đều mở cho owner/admin; ĐỪNG chép thói quen đó vào đây.
create policy chat_messages_update_own on public.chat_messages for update
  using (
    tenant_id = (select public.current_tenant_id())
    and sender_user_id = (select auth.uid())
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and sender_user_id = (select auth.uid())
  );
-- KHÔNG CÓ POLICY DELETE — đường xoá duy nhất là xoá MỀM, và xoá mềm để lại vệt.

-- ---- Gọi tên ----
create policy chat_mentions_select on public.chat_mentions for select
  using (
    tenant_id = (select public.current_tenant_id())
    and exists (select 1 from public.chat_messages m where m.id = message_id)
  );

create policy chat_mentions_insert on public.chat_mentions for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and exists (select 1 from public.chat_messages m
                 where m.id = message_id and m.sender_user_id = (select auth.uid()))
    and mentioned_user_id in (select tm.user_id from public.tenant_members tm
                               where tm.tenant_id = (select public.current_tenant_id())
                                 and tm.status = 'active')
  );

-- ---- Đã đọc tới đâu: CHỈ của chính mình ----
-- Không ai đọc được mốc của người khác — "ai đã xem tin của tôi chưa" là một
-- tính năng khác hẳn, có hệ quả riêng về riêng tư, và thẻ chưa chốt nó.
create policy chat_reads_select on public.chat_reads for select
  using (tenant_id = (select public.current_tenant_id()) and user_id = (select auth.uid()));
create policy chat_reads_insert on public.chat_reads for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
    and exists (select 1 from public.chat_channels c where c.id = channel_id)
  );
create policy chat_reads_update on public.chat_reads for update
  using (tenant_id = (select public.current_tenant_id()) and user_id = (select auth.uid()))
  with check (tenant_id = (select public.current_tenant_id()) and user_id = (select auth.uid()));

revoke all on public.chat_channels from anon;
revoke all on public.chat_messages from anon;
revoke all on public.chat_mentions from anon;
revoke all on public.chat_reads    from anon;

-- ════════════════════════════════════════════════════════════════════
-- 6. KÊNH CẢ TIỆM DO MÁY DỰNG
-- ════════════════════════════════════════════════════════════════════
-- Client không có đường tạo kênh 'team' (policy insert chỉ nhận 'dm'), nên máy
-- phải dựng. Hai vế, thiếu vế nào cũng hở:
--   · trigger  — tiệm mở từ nay về sau;
--   · backfill — tiệm đã có sẵn. Thiếu vế này thì mọi tiệm hiện tại mở màn chat
--                ra thấy trống trơn mà không hiểu vì sao.
create or replace function public.chat_dung_kenh_ca_tiem()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.chat_channels (tenant_id, kind)
  values (new.id, 'team')
  on conflict do nothing;
  return null;
end;
$$;
drop trigger if exists chat_dung_kenh_ca_tiem on public.tenants;
create trigger chat_dung_kenh_ca_tiem after insert on public.tenants
  for each row execute function public.chat_dung_kenh_ca_tiem();

insert into public.chat_channels (tenant_id, kind)
select t.id, 'team' from public.tenants t
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════
-- 7. HAI PHÉP DÙNG CHUNG
-- ════════════════════════════════════════════════════════════════════
-- CỐ Ý `security INVOKER` (mặc định) cho cả hai: chúng phải đi qua đúng policy ở
-- trên. Một hàm `definer` ở đây sẽ bỏ qua RLS và buộc phải chép lại luật đọc —
-- dựng bộ quyền thứ hai, đúng thứ mục 2 vừa bác. `set search_path` vẫn ghim vì
-- lý do của luật đó (chống chiếm quyền qua schema giả) độc lập với definer/invoker.

-- Số tin chưa đọc từng kênh. Chỉ trả kênh người gọi ĐỌC ĐƯỢC — RLS lo việc đó.
-- Trả LUÔN mốc tin gần nhất: danh sách kênh cần cả hai số, và PostgREST
-- không gom nhóm được nên nếu không trả ở đây thì tầng web phải kéo về một đống
-- tin rồi tự tính — vừa tốn vừa sai khi kênh đông tin.
create or replace function public.chat_dem_chua_doc()
returns table (channel_id uuid, so_chua_doc integer, tin_cuoi_luc timestamptz)
language sql
stable
set search_path = public, pg_temp
as $$
  select c.id,
         (select count(*)::int
            from public.chat_messages m
           where m.channel_id = c.id
             and m.deleted_at is null
             -- Tin của chính mình không bao giờ là "chưa đọc".
             and m.sender_user_id <> (select auth.uid())
             and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         (select max(m2.created_at) from public.chat_messages m2 where m2.channel_id = c.id)
    from public.chat_channels c
    left join public.chat_reads r
      on r.channel_id = c.id and r.user_id = (select auth.uid())
$$;
revoke execute on function public.chat_dem_chua_doc() from public, anon;
grant  execute on function public.chat_dem_chua_doc() to authenticated;

-- Đánh dấu đã đọc. Là RPC chứ không phải upsert từ client vì `chat_reads` có
-- `tenant_id` không default — để client tự điền là mở đường điền sai tiệm, và
-- RLS sẽ từ chối theo kiểu khó hiểu thay vì làm đúng.
create or replace function public.chat_danh_dau_da_doc(p_channel uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into public.chat_reads (tenant_id, channel_id, user_id, last_read_at)
  values ((select public.current_tenant_id()), p_channel, (select auth.uid()), now())
  on conflict (channel_id, user_id) do update set last_read_at = now();
end;
$$;
revoke execute on function public.chat_danh_dau_da_doc(uuid) from public, anon;
grant  execute on function public.chat_danh_dau_da_doc(uuid) to authenticated;

-- Mở (hoặc tìm lại) kênh riêng với một người. Chuẩn hoá thứ tự cặp ở ĐÂY để
-- tầng web không phải nhớ luật `dm_a < dm_b`.
create or replace function public.chat_mo_kenh_rieng(p_nguoi uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_toi uuid := (select auth.uid());
  v_a   uuid;
  v_b   uuid;
  v_id  uuid;
begin
  if p_nguoi is null or p_nguoi = v_toi then
    raise exception 'chat_dm_self';
  end if;
  v_a := least(v_toi, p_nguoi);
  v_b := greatest(v_toi, p_nguoi);

  select c.id into v_id from public.chat_channels c
   where c.kind = 'dm' and c.dm_a = v_a and c.dm_b = v_b;
  if v_id is not null then return v_id; end if;

  begin
    insert into public.chat_channels (tenant_id, kind, dm_a, dm_b, created_by)
    values ((select public.current_tenant_id()), 'dm', v_a, v_b, v_toi)
    returning id into v_id;
  exception when unique_violation then
    -- Hai người bấm cùng lúc: bên thua đọc lại kênh của bên thắng, KHÔNG tạo
    -- cuộc thứ hai. Đây là lý do ràng buộc duy nhất nằm ở CSDL chứ không ở web.
    select c.id into v_id from public.chat_channels c
     where c.kind = 'dm' and c.dm_a = v_a and c.dm_b = v_b;
  end;

  return v_id;
end;
$$;
revoke execute on function public.chat_mo_kenh_rieng(uuid) from public, anon;
grant  execute on function public.chat_mo_kenh_rieng(uuid) to authenticated;
