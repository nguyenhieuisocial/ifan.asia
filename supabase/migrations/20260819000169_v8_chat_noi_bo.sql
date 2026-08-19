-- V8 internalChat (19/08/2026) — Chat nội bộ gắn vào việc.
-- Thẻ design: design-system/man-chat-noi-bo.html (5 quyết định đã chốt).
--
-- ════════════════════════════════════════════════════════════════════
-- BA ĐIỂM MÔ HÌNH CHỐT TRƯỚC KHI GÕ — ghi lại để người sau không mở lại
-- ════════════════════════════════════════════════════════════════════
--
-- (1) CHAT NỘI BỘ LÀ BẢNG RIÊNG. TUYỆT ĐỐI KHÔNG thêm cột `is_internal` vào
--     `messages`. Quyết định 2 của thẻ đòi HAI ĐƯỜNG TÁCH HẲN, "không có nút
--     nào chuyển tin từ đường này sang đường kia", vì "lỡ gửi nhầm nhận xét nội
--     bộ cho khách là mất khách ngay" và "cách chắc chắn nhất để không nhầm là
--     làm cho nó KHÔNG THỂ NHẦM ĐƯỢC".
--     Một cột cờ trên `messages` thì gửi nhầm chỉ cách đúng một `update` — và
--     mọi đoạn code đang đọc `messages` (gửi ra Zalo, gộp hội thoại, đếm chưa
--     đọc, xuất báo cáo) phải NHỚ lọc cờ đó, mãi mãi, ở mọi chỗ viết thêm sau
--     này. Quên một chỗ là một lần lộ. Bảng riêng thì quên cũng không lộ được:
--     đường ra khách không có tay nào với tới bảng này.
--
-- (2) THREAD BẮT BUỘC GẮN VÀO MỘT VIỆC — `entity_type`/`entity_id` đều
--     `not null`. Quyết định 1: "không có ô chat trống để tán gẫu". Cho phép
--     null chính là dựng lại cái ô chat trống mà quyết định 1 cấm, chỉ khác là
--     nó lọt vào bằng cửa sau.
--
-- (3) QUYỀN ĐỌC THỪA HƯỞNG TỪ VIỆC — không bảng thành viên thread, không cột
--     cache quyền, không bộ quyền riêng. Quyết định 4: "một bộ quyền là một chỗ
--     để sai; hai bộ là hai chỗ, và chúng sẽ lệch nhau". Hệ quả thẻ nêu sẵn:
--     "nhân viên rời tiệm thì không đọc lại được gì, kể cả tin cũ mình từng
--     nhắn" — đúng vì quyền đọc luôn hỏi lại bản ghi việc TẠI THỜI ĐIỂM ĐỌC,
--     không có bản sao nào giữ lại quyền cũ.

-- ════════════════════════════════════════════════════════════════════
-- 1. THREAD — luôn treo vào một việc
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.internal_threads (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,

  -- Tập ĐÓNG, đúng bốn thứ thẻ liệt kê: "đơn hàng, lịch hẹn, hồ sơ khách, phiếu
  -- kho". Mở tập này ra là mở lại quyết định 1 — và mỗi giá trị mới còn phải
  -- kèm một nhánh quyền đọc ở `internal_thread_doc_duoc` bên dưới, nếu không
  -- thì thread kiểu mới không ai đọc được (hoặc tệ hơn: ai cũng đọc được).
  entity_type text not null
              check (entity_type in ('order', 'appointment', 'contact', 'stock_doc')),
  -- KHÔNG FK được: bốn kiểu trỏ vào bốn bảng khác nhau. Bù lại bằng
  -- `internal_thread_doc_duoc` — id trỏ vào hư không thì không ai đọc được
  -- thread, kể cả người tạo ra nó.
  entity_id   uuid not null,

  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),

  -- Một việc một chỗ bàn. Hai thread trên cùng một đơn nghĩa là nửa cuộc trao
  -- đổi nằm ở chỗ người ta không mở ra — đúng thứ "chỉ tạo thêm nơi bỏ sót" mà
  -- thẻ viện dẫn để không làm chat rời.
  constraint internal_threads_mot_viec_mot_thread unique (tenant_id, entity_type, entity_id)
);
create index if not exists internal_threads_viec_idx
  on public.internal_threads (tenant_id, entity_type, entity_id);

comment on table public.internal_threads is
  'Thẻ man-chat-noi-bo quyết định 1: chat nội bộ LUÔN gắn vào một việc — entity_type/entity_id not null, không có ô chat trống. Bảng RIÊNG, không phải cờ is_internal trên messages (quyết định 2).';

-- ════════════════════════════════════════════════════════════════════
-- 2. TIN NHẮN NỘI BỘ
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.internal_messages (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  thread_id  uuid not null references public.internal_threads(id) on delete cascade,

  -- `on delete restrict` (khuôn `appointments.staff_user_id`, migration #83):
  -- thẻ gọi chat là "bằng chứng ai bảo làm gì". Một câu chỉ đạo không còn biết
  -- ai nói thì không còn là bằng chứng. Đường cho người nghỉ việc là gỡ khỏi
  -- `tenant_members` — lúc đó họ hết đọc được, nhưng chữ họ viết vẫn còn tên.
  sender_user_id uuid not null references auth.users(id) on delete restrict,

  body       text not null check (length(trim(body)) between 1 and 4000),

  -- Dấu "đã sửa" và "vệt xoá". CẢ HAI do trigger đóng, không nhận từ client:
  -- một dấu sửa mà người sửa tự viết thì không chứng minh được gì.
  edited_at  timestamptz,
  deleted_at timestamptz,

  created_at timestamptz not null default now()
);
create index if not exists internal_messages_thread_idx
  on public.internal_messages (thread_id, created_at);
create index if not exists internal_messages_tenant_idx
  on public.internal_messages (tenant_id, created_at desc);

-- ⚠️ XOÁ MỀM GIỮ NGUYÊN `body`. Thẻ nói "tin biến mất nhưng để lại vệt" và cùng
-- lúc nói "chat là bằng chứng ai bảo làm gì; xoá sạch không vết là mở đường cho
-- việc chối". Thẻ KHÔNG nói chữ có bị huỷ thật hay chỉ ẩn khỏi màn hình. Chọn
-- GIỮ chữ, vì vế thứ hai (bằng chứng) là lý do tồn tại của cả điều luật, còn vế
-- "biến mất" là mô tả màn hình. Nếu founder muốn huỷ hẳn chữ, đó là một quyết
-- định riêng — một trigger ghi đè `body` — không phải thứ đoán hộ ở đây.

-- ════════════════════════════════════════════════════════════════════
-- 3. GỌI TÊN — nguồn DUY NHẤT sinh thông báo
-- ════════════════════════════════════════════════════════════════════
-- Quyết định 3: "Chỉ gọi tên (@) mới bắn thông báo; tin thường không báo — báo
-- hết là ai cũng tắt thông báo, rồi tin quan trọng cũng chìm luôn."
-- ⇒ Trigger thông báo gắn trên BẢNG NÀY, không gắn trên insert `internal_messages`.
--   Gắn nhầm chỗ thì mọi tin đều báo, và quyết định 3 chết ngay hôm đầu.
create table if not exists public.internal_mentions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  message_id        uuid not null references public.internal_messages(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),

  -- Gọi tên một người hai lần trong một tin là một lần báo.
  constraint internal_mentions_khong_trung unique (message_id, mentioned_user_id)
);
create index if not exists internal_mentions_nguoi_idx
  on public.internal_mentions (tenant_id, mentioned_user_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════
-- 4. QUYỀN ĐỌC THỪA HƯỞNG TỪ VIỆC (điểm 3)
-- ════════════════════════════════════════════════════════════════════
-- ⚠️ HÀM NÀY CỐ Ý **KHÔNG** `security definer` — ngược với luật chung của kho,
-- và đây là lý do:
--   `security definer` chạy dưới quyền chủ sở hữu hàm (postgres), mà chủ bảng
--   thì BỎ QUA RLS. Một hàm definer ở đây sẽ buộc phải TỰ VIẾT LẠI luật đọc của
--   orders / appointments / contacts / purchases / stocktakes — tức là dựng BỘ
--   QUYỀN THỨ HAI, đúng thứ quyết định 4 của thẻ cấm. Và bộ thứ hai đó sẽ lệch
--   ngay lần đầu ai đó sửa policy của `orders` mà không nhớ tới file này.
--   Để invoker thì `exists (select 1 from public.orders …)` đi qua đúng policy
--   của `orders`: quyền chat THỪA HƯỞNG, không sao chép, không cache.
-- `set search_path` vẫn ghim — lý do của luật đó là chống chiếm quyền qua schema
-- giả, hoàn toàn độc lập với chuyện definer hay invoker.
create or replace function public.internal_thread_doc_duoc(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case p_entity_type
    when 'order'       then exists (select 1 from public.orders       o  where o.id  = p_entity_id)
    when 'appointment' then exists (select 1 from public.appointments ap where ap.id = p_entity_id)
    when 'contact'     then exists (select 1 from public.contacts     c  where c.id  = p_entity_id)
    -- "Phiếu kho" trong kho này là HAI chứng từ: phiếu nhập (`purchases`) và
    -- phiếu kiểm kê (`stocktakes`). Cả hai đều chỉ owner/admin/manager đọc được
    -- (migration #151, #152) — không viết lại luật đó ở đây, chỉ hỏi lại nó.
    when 'stock_doc'   then exists (select 1 from public.purchases    p  where p.id  = p_entity_id)
                         or exists (select 1 from public.stocktakes   st where st.id = p_entity_id)
    else false
  end
$$;
revoke execute on function public.internal_thread_doc_duoc(text, uuid) from public, anon;
grant  execute on function public.internal_thread_doc_duoc(text, uuid) to authenticated;

comment on function public.internal_thread_doc_duoc(text, uuid) is
  'Thẻ man-chat-noi-bo quyết định 4. CỐ Ý security INVOKER: definer sẽ bỏ qua RLS của orders/appointments/contacts/purchases/stocktakes và buộc phải chép lại luật đọc — dựng bộ quyền thứ hai, đúng thứ quyết định 4 cấm.';

-- ════════════════════════════════════════════════════════════════════
-- 5. SỬA TRONG 15 PHÚT · XOÁ ĐỂ LẠI VỆT
-- ════════════════════════════════════════════════════════════════════
-- Quyết định 5. Cả ba luật dưới đây là RÀNG BUỘC CSDL, không phải nút bị khoá
-- trên màn hình: nút khoá chỉ ngăn người dùng bình thường, còn một request gõ
-- tay vẫn sửa được tin từ hôm qua — mà "chat là bằng chứng" thì sửa được tin cũ
-- là hỏng hết giá trị của nó.
create or replace function public.internal_messages_sua_15_phut()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Danh tính của bằng chứng không được đổi. Đổi `sender_user_id` là đổi luôn
  -- người chịu trách nhiệm cho câu đã nói; đổi `thread_id` là bê một câu sang
  -- việc khác cho hợp cảnh.
  if new.thread_id      is distinct from old.thread_id
  or new.sender_user_id is distinct from old.sender_user_id
  or new.created_at     is distinct from old.created_at
  or new.tenant_id      is distinct from old.tenant_id then
    raise exception 'internal_message_immutable';
  end if;

  -- Xoá rồi thì không hồi lại được: cái "vệt" chính là thứ thẻ đòi giữ, và một
  -- vệt gỡ được thì không còn là vệt.
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'internal_message_undelete_forbidden';
  end if;
  -- Giờ xoá do máy đóng — người xoá không tự chọn được mốc thời gian trên vệt.
  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_at := now();
  end if;

  if new.body is distinct from old.body then
    if old.deleted_at is not null then
      raise exception 'internal_message_deleted';
    end if;
    if now() - old.created_at > interval '15 minutes' then
      raise exception 'internal_message_edit_window_closed';
    end if;
    new.edited_at := now();      -- dấu "đã sửa" do máy đóng
  else
    new.edited_at := old.edited_at;   -- client không tự gỡ dấu đã sửa
  end if;

  return new;
end;
$$;
drop trigger if exists internal_messages_sua_15_phut on public.internal_messages;
create trigger internal_messages_sua_15_phut before update on public.internal_messages
  for each row execute function public.internal_messages_sua_15_phut();

comment on table public.internal_messages is
  'Thẻ man-chat-noi-bo quyết định 5: sửa trong 15 phút rồi khoá (trigger, không phải nút mờ), xoá là xoá MỀM để lại vệt. KHÔNG có policy DELETE cho client — xoá cứng không có đường đi.';

-- ════════════════════════════════════════════════════════════════════
-- 6. GỌI TÊN ⇒ THÔNG BÁO
-- ════════════════════════════════════════════════════════════════════
-- `security definer`: `notifications` không có policy INSERT cho client (migration
-- #2 ghi rõ "ghi notification: chỉ service role / definer"). Người gọi tên là
-- nhân viên bình thường, nên trigger phải ghi thay.
create or replace function public.internal_mentions_bao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_body   text;
  v_kieu   text;
  v_viec   uuid;
  v_link   text;
begin
  select m.body, t.entity_type, t.entity_id
    into v_body, v_kieu, v_viec
    from public.internal_messages m
    join public.internal_threads  t on t.id = m.thread_id
   where m.id = new.message_id;

  -- Thẻ: "Bấm vào là mở thẳng lịch hẹn đó, không phải đi tìm." Thông báo không
  -- kèm đường dẫn thì người nhận vẫn phải đi tìm — bằng không báo.
  v_link := case v_kieu
    when 'order'       then '/app/orders/'    || v_viec::text
    when 'appointment' then '/app/calendar?a=' || v_viec::text
    when 'contact'     then '/app/contacts/'  || v_viec::text
    when 'stock_doc'   then '/app/stock?d='   || v_viec::text
  end;

  insert into public.notifications (tenant_id, user_id, type, title, body, link)
  values (new.tenant_id, new.mentioned_user_id, 'internal_mention',
          'Có người nhắc tên bạn trong trao đổi nội bộ',
          left(coalesce(v_body, ''), 300), v_link);

  return null;
end;
$$;
drop trigger if exists internal_mentions_bao on public.internal_mentions;
create trigger internal_mentions_bao after insert on public.internal_mentions
  for each row execute function public.internal_mentions_bao();

comment on table public.internal_mentions is
  'Thẻ man-chat-noi-bo quyết định 3: NGUỒN DUY NHẤT sinh thông báo. Trigger báo gắn ở ĐÂY, cố ý KHÔNG gắn trên insert internal_messages — gắn nhầm chỗ thì mọi tin đều báo và quyết định 3 chết ngay hôm đầu.';

-- ════════════════════════════════════════════════════════════════════
-- 7. QUYỀN
-- ════════════════════════════════════════════════════════════════════
alter table public.internal_threads  enable row level security;
alter table public.internal_messages enable row level security;
alter table public.internal_mentions enable row level security;

-- ---- Thread: đọc được việc thì đọc được chỗ bàn về việc đó. Hết. ----
create policy internal_threads_select on public.internal_threads for select
  using (tenant_id = (select public.current_tenant_id())
         and public.internal_thread_doc_duoc(entity_type, entity_id));
-- viewer đọc được nhưng không ghi — khuôn có sẵn ở orders/appointments (#83, #127).
create policy internal_threads_insert on public.internal_threads for insert
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and public.internal_thread_doc_duoc(entity_type, entity_id));
-- KHÔNG có policy UPDATE: đổi `entity_id` là bê cả cuộc trao đổi sang việc khác.
-- KHÔNG có policy DELETE: thread chết theo việc (`on delete cascade` phía tenant),
--   không có nút xoá cả cuộc bàn bạc.

-- ---- Tin: đọc được thread thì đọc được tin. Một mắt xích, không có bộ quyền thứ hai. ----
-- `exists (select … from internal_threads …)` chạy dưới quyền người gọi ⇒ policy
-- của `internal_threads` áp vào, và policy đó lại hỏi tiếp bản ghi việc. Quyền
-- đi hết một chuỗi từ VIỆC xuống TIN, không có chỗ nào lưu bản sao.
create policy internal_messages_select on public.internal_messages for select
  using (tenant_id = (select public.current_tenant_id())
         and exists (select 1 from public.internal_threads t where t.id = thread_id));

create policy internal_messages_insert on public.internal_messages for insert
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and sender_user_id = (select auth.uid())
              and exists (select 1 from public.internal_threads t where t.id = thread_id));

-- ⚠️⚠️ CHỖ DỄ SAI NHẤT CỦA CẢ FILE — ĐỌC TRƯỚC KHI SỬA ⚠️⚠️
-- Policy này CỐ Ý **KHÔNG** có nhánh `or app_role() in ('owner','admin')`.
-- Thẻ ghi thẳng: "Chủ tiệm KHÔNG xoá được tin của người khác." Lý do thẻ nêu:
-- chat là bằng chứng ai bảo làm gì — mà người có nhiều động cơ chối nhất chính
-- là người ra lệnh. Cho chủ tiệm sửa/xoá tin của nhân viên là trao cây kéo cho
-- đúng người muốn cắt.
-- Gần hết policy trong kho này đều mở cho owner/admin. ĐỪNG chép thói quen đó
-- vào đây: một dòng `or` thêm vào là xoá sạch quyết định 5 của thẻ, và không có
-- lỗi nào báo lên.
create policy internal_messages_update_own on public.internal_messages for update
  using (tenant_id = (select public.current_tenant_id())
         and sender_user_id = (select auth.uid()))
  with check (tenant_id = (select public.current_tenant_id())
              and sender_user_id = (select auth.uid()));

-- KHÔNG CÓ POLICY DELETE. Cố ý, không phải quên: đường xoá duy nhất là xoá MỀM
-- (`deleted_at` qua policy trên), và xoá mềm để lại vệt. Có policy delete thì
-- "để lại vệt" chỉ còn là lời hứa của giao diện.

-- ---- Gọi tên: đọc được tin thì thấy được ai bị gọi. ----
create policy internal_mentions_select on public.internal_mentions for select
  using (tenant_id = (select public.current_tenant_id())
         and exists (select 1 from public.internal_messages m where m.id = message_id));

-- Chỉ người viết tin mới khai được người mình gọi tên trong chính tin đó —
-- nếu không, ai cũng bắn được thông báo nhân danh tin của người khác.
-- Người bị gọi phải là thành viên tiệm: gọi một uuid lạ chỉ đẻ ra một dòng
-- thông báo không ai đọc được, tức là rác im lặng.
create policy internal_mentions_insert on public.internal_mentions for insert
  with check (tenant_id = (select public.current_tenant_id())
              and exists (select 1 from public.internal_messages m
                           where m.id = message_id
                             and m.sender_user_id = (select auth.uid()))
              and mentioned_user_id in (select tm.user_id from public.tenant_members tm
                                         where tm.tenant_id = (select public.current_tenant_id())));
-- KHÔNG có UPDATE/DELETE: đã gọi tên rồi thì không rút lại được cái thông báo
-- đã bắn; gỡ dòng gọi tên chỉ làm lịch sử nói dối.

revoke all on public.internal_threads  from anon;
revoke all on public.internal_messages from anon;
revoke all on public.internal_mentions from anon;
