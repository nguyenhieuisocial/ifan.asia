-- ============================================================
-- iFan.asia — Migration #24: Bàn giao khách 1 nút + QR theo kênh có tracking
--                            (GĐ2 — Omnichannel đợt 2)
--
-- Nguồn: "Quy hoạch tổng thể" GIAI ĐOẠN 2 → Omnichannel đợt 2:
--        "QR theo kênh có tracking (channel live code); bàn giao khách 1 nút".
--        Spec "02 Omnichannel Inbox" §5 đã dự trù `conversation_events` làm sổ
--        audit hội thoại NHƯNG bảng đó chưa được dựng ở bất kỳ migration nào.
--        Bàn giao cần một sổ CHUYÊN DỤNG (ai → ai, lúc nào, vì sao) chứ không
--        phải một cột `data jsonb` tự do, nên file này dựng bảng riêng
--        `conversation_handoffs`; khi `conversation_events` ra đời nó vẫn là
--        sổ audit chung, hai thứ không đá nhau.
--
-- ============================================================
-- PHẦN A — BÀN GIAO KHÁCH
-- ============================================================
--
-- A1) VÌ SAO BÀN GIAO KHÔNG ĐẶT LẠI ĐỒNG HỒ SLA (quyết định có chủ đích):
--
--     Đồng hồ SLA hội thoại (migration #17) neo vào `conversations
--     .last_user_message_at` — MỐC KHÁCH NHẮN, không phải mốc nhân viên nhận
--     việc. `started_at` của `sla_events` chính là mốc đó và đóng vai mã chu kỳ
--     chống bắn trùng.
--
--     Ba lý do cứng để KHÔNG reset khi bàn giao:
--     (1) SLA là LỜI HỨA VỚI KHÁCH, không phải bấm giờ thi đua nội bộ. Khách đã
--         chờ 90 phút thì vẫn là 90 phút dù tiệm chuyền tay ai. Reset = báo cáo
--         "đúng hẹn" trong khi khách vẫn đang chờ — số liệu nói dối chủ tiệm.
--     (2) Reset mở đường lách luật: sắp vỡ SLA thì bàn giao vòng quanh là đồng
--         hồ về 0. Chính cái engine dựng ra để chống "lead nóng nguội đi" sẽ bị
--         vô hiệu bằng đúng một nút bấm.
--     (3) Về kỹ thuật, reset chỉ có thể thực hiện bằng cách ghi đè
--         `last_user_message_at` — mà cột đó ĐỒNG THỜI là mốc tính CỬA SỔ TRẢ
--         LỜI 48H CỦA ZALO (sự thật phía nền tảng, Zalo đếm từ tin của khách và
--         KHÔNG reset khi ta đổi người). Ghi đè = app tưởng còn nhiều giờ miễn
--         phí trong khi thực tế đã hết → mất tiền thật vì phải chuyển ZNS.
--
--     Đổi lại, TRÁCH NHIỆM chuyển đúng người: `sla_fire` gửi cảnh báo cho
--     `conversations.assignee_user_id` tại thời điểm quét, nên mọi mốc SAU khi
--     bàn giao tự về người nhận — không cần thêm code.
--
--     Bù cho lỗ hổng còn lại: chỉ mục duy nhất của `sla_events` khiến mốc ĐÃ bắn
--     cho người cũ không bắn lại cho người mới. Vì vậy thông báo bàn giao mang
--     luôn con số "khách đã chờ bao lâu" — người nhận biết mức khẩn ngay, không
--     phải đọc lại hội thoại từ đầu.
--
-- A2) VÌ SAO GHI QUA RPC `handoff_conversation` CHỨ KHÔNG PHẢI 3 LỆNH Ở TẦNG WEB:
--     đổi người phụ trách + ghi sổ bàn giao + tạo thông báo phải CÙNG MỘT
--     TRANSACTION, nếu không sẽ có cảnh "đã đổi người mà người nhận không hay"
--     hoặc "có thông báo mà sổ trống". Thêm nữa `notifications` cố ý KHÔNG có
--     policy insert cho client (migration #2) nên chỉ definer ghi được.
--
-- A3) AI ĐƯỢC BÀN GIAO: mọi thành viên HOẠT ĐỘNG của tenant. Spec Inbox không
--     đặt giới hạn "chỉ người đang phụ trách mới được chuyển đi" — ngược lại
--     §3 có user story "manager gán tay cho nhân viên đang rảnh", §4.2 để
--     dropdown gán ngay trên header cho mọi người, và RLS `conversations_update`
--     (migration #4) vốn đã cho mọi thành viên tenant đổi người phụ trách vì
--     "hộp thư dùng chung cả tiệm" (ghi chú trong migration #16). Siết ở đây sẽ
--     mâu thuẫn với nút gán đang chạy. Ràng buộc DUY NHẤT thêm vào: NGƯỜI NHẬN
--     phải là thành viên hoạt động CÙNG TENANT.
--
-- ============================================================
-- PHẦN B — QR THEO KÊNH
-- ============================================================
--
-- B1) KHÔNG ĐẺ HỆ ĐO NGUỒN THỨ HAI: mỗi mã QR BẮT BUỘC trỏ về một
--     `lead_sources` có sẵn. Khách vào qua mã nào thì `contacts.source_id` nhận
--     đúng nguồn đó, và `source_revenue_report()` (migration #16) tự thấy —
--     nhánh dự phòng của nó đọc `contacts.source_id` khi hồ sơ chưa có sự kiện
--     mang nguồn. QR chỉ đếm THÊM lượt quét (`qr_scans`), không tự cộng doanh
--     thu, không có bảng "doanh thu theo QR" nào cả.
--
-- B2) ĐIỂM CHẠM INTERNET: `/q/<code>` mở công khai (khách quét không đăng nhập).
--     Nên `qr_resolve()` là definer, trả về ĐÚNG một URL đích hoặc "không tìm
--     thấy" — không tên tiệm, không id tenant, không số liệu. Chặn spam bằng
--     bảng riêng `qr_scan_throttle` (không có tenant_id, không policy nào → chỉ
--     definer/service role chạm được), cửa sổ 1 phút / 20 lượt / mã / thiết bị.
--     KHÔNG lưu IP: khóa chặn là băm SHA-256 của IP, và `qr_scans` không có cột
--     nào nhận diện khách.
--
-- B3) VÌ SAO KHÔNG ĐẶT CHECK ĐỊNH DẠNG TRÊN `target_url`:
--     `scripts/rls-smoke.mjs` quét generic mọi bảng tenant-scoped bằng cách
--     chèn giá trị NGẪU NHIÊN vào các cột NOT NULL không default. Một check
--     regex trên cột text bắt buộc sẽ làm bước seed của chính script đó nổ →
--     hỏng cổng RLS. Định dạng URL vì thế kiểm ở tầng web (zod) và ở route
--     `/q/<code>` (chỉ redirect khi là http/https). `code` thì né được vì có
--     DEFAULT nên script bỏ qua.
--
-- Chuẩn: theo migration #4/#15/#16/#17 — text + check, timestamptz, definer
--        `set search_path`, revoke public/anon trước khi grant đích danh, RLS
--        bật trên mọi bảng có tenant_id. KHÔNG sửa policy nào đang có.
-- ============================================================

-- ============================================================
-- PHẦN A — BÀN GIAO KHÁCH
-- ============================================================

-- ---------- Sổ bàn giao ----------
-- Append-only: một dòng = một lần chuyển tay. Không sửa, không xóa (không có
-- policy update/delete) — sổ truy vết phải bất biến.
create table public.conversation_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_user_id uuid references auth.users(id) on delete set null,  -- null = trước đó chưa ai nhận
  to_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,          -- "Vì sao bàn giao" — bắt buộc, đây là giá trị của sổ
  created_by uuid not null references auth.users(id) on delete cascade,
  -- clock_timestamp() chứ KHÔNG phải now(): sổ này đọc theo THỨ TỰ ("ai chuyển
  -- cho ai trước"). now() trả mốc bắt đầu transaction nên hai lần bàn giao trong
  -- cùng một transaction sẽ trùng mốc và mất thứ tự.
  created_at timestamptz not null default clock_timestamp()
);
-- Truy vấn chính: lịch sử của MỘT hội thoại, mới nhất trước.
create index conversation_handoffs_conv_idx
  on public.conversation_handoffs (conversation_id, created_at desc);
-- Truy vấn phụ: "những khách vừa được bàn giao cho tôi".
create index conversation_handoffs_to_idx
  on public.conversation_handoffs (tenant_id, to_user_id, created_at desc);

alter table public.conversation_handoffs enable row level security;
-- Đọc: mọi thành viên tenant (hộp thư dùng chung — xem A3).
create policy conversation_handoffs_select on public.conversation_handoffs for select
  using (tenant_id = (select public.current_tenant_id()));
-- Ghi: KHÔNG policy insert/update/delete — chỉ `handoff_conversation()` (definer)
-- được ghi, để đổi-người + ghi-sổ + báo-người-nhận luôn đi cùng nhau (xem A2).

-- ---------- RPC bàn giao ----------
-- Trả về jsonb {handoff_id, from_user_id, waited_minutes} cho tầng web.
-- Lỗi ném ra dưới dạng exception có mã ngắn (tầng web map sang chuỗi tiếng Việt).
create or replace function public.handoff_conversation(
  p_conversation uuid,
  p_to_user      uuid,
  p_reason       text
) returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant   uuid := public.current_tenant_id();
  v_actor    uuid := auth.uid();
  v_conv     public.conversations%rowtype;
  v_from     uuid;
  v_reason   text := left(btrim(coalesce(p_reason, '')), 500);
  v_actor_nm text;
  v_customer text;
  v_waited   int;
  v_id       uuid;
  v_body     text;
begin
  if v_tenant is null or v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_reason = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- Người bấm phải là thành viên hoạt động của tenant hiện tại
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_tenant and m.user_id = v_actor and m.status = 'active')
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_conv
  from public.conversations
  where id = p_conversation and tenant_id = v_tenant;
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  -- CHẶN BÀN GIAO RA NGOÀI TIỆM: người nhận phải là thành viên hoạt động CÙNG tenant
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_tenant and m.user_id = p_to_user and m.status = 'active')
  then
    raise exception 'receiver_not_member' using errcode = '42501';
  end if;

  if v_conv.assignee_user_id is not distinct from p_to_user then
    raise exception 'already_assigned' using errcode = '22023';
  end if;

  v_from := v_conv.assignee_user_id;

  -- Đổi người phụ trách. CỐ Ý KHÔNG chạm `last_user_message_at` → đồng hồ SLA và
  -- cửa sổ 48h Zalo giữ nguyên chu kỳ (xem A1).
  update public.conversations
     set assignee_user_id = p_to_user
   where id = p_conversation;

  insert into public.conversation_handoffs
    (tenant_id, conversation_id, from_user_id, to_user_id, reason, created_by)
  values (v_tenant, p_conversation, v_from, p_to_user, v_reason, v_actor)
  returning id into v_id;

  -- ---- thông báo cho NGƯỜI NHẬN: đúng MỘT dòng cho một lần bàn giao ----
  select p.display_name into v_actor_nm from public.profiles p where p.user_id = v_actor;
  select c.full_name into v_customer
    from public.contacts c where c.id = v_conv.contact_id and c.deleted_at is null;

  -- "Khách đã chờ bao lâu" = mốc khách nhắn cuối mà chưa có tin gửi đi nào sau đó
  -- (định nghĩa GIỐNG HỆT process_sla_timers để hai chỗ không bao giờ lệch số).
  if v_conv.last_user_message_at is not null
     and not exists (
       select 1 from public.messages m
       where m.conversation_id = v_conv.id
         and m.direction = 'out'
         and m.sent_at > v_conv.last_user_message_at)
  then
    v_waited := (floor(extract(epoch from (now() - v_conv.last_user_message_at)) / 60))::int;
  end if;

  v_body := coalesce(nullif(v_actor_nm, ''), 'Đồng nghiệp')
         || ' bàn giao khách ' || coalesce(nullif(v_customer, ''), 'chưa có tên')
         || ' cho bạn. Lý do: ' || v_reason;
  if v_waited is not null then
    v_body := v_body || ' — khách đã chờ ' || public.sla_minutes_vn(greatest(v_waited, 0))
                     || ' chưa ai trả lời.';
  end if;

  insert into public.notifications (tenant_id, user_id, type, title, body, link)
  values (v_tenant, p_to_user, 'handoff',
          left('Bàn giao khách: ' || coalesce(nullif(v_customer, ''), 'chưa có tên'), 200),
          v_body,
          '/app/inbox?c=' || p_conversation::text);

  return jsonb_build_object(
    'handoff_id', v_id, 'from_user_id', v_from, 'waited_minutes', v_waited);
end $$;

revoke execute on function public.handoff_conversation(uuid, uuid, text) from public, anon;
grant  execute on function public.handoff_conversation(uuid, uuid, text) to authenticated;

-- ============================================================
-- PHẦN B — QR THEO KÊNH CÓ TRACKING
-- ============================================================

-- ---------- Sinh mã ngắn cho URL công khai ----------
-- 12 ký tự hex (48 bit) — đủ để không đoán được, đủ ngắn để in dưới mã QR.
-- DEFINER vì phải nhìn TOÀN BỘ bảng để tránh trùng mã giữa các tenant (URL công
-- khai không mang tenant nên `code` là khóa toàn cục).
-- `md5(gen_random_uuid())` thay cho pgcrypto: cả hai đều là hàm lõi
-- (pg_catalog) nên chạy được với `search_path = public` bị ghim — pgcrypto ở
-- Supabase nằm trong schema `extensions`, gọi nó ở đây sẽ phải mở search_path.
create or replace function public.qr_gen_code() returns text
language plpgsql volatile
security definer set search_path = public as $$
declare v text;
begin
  loop
    v := substr(md5(gen_random_uuid()::text), 1, 12);
    exit when not exists (select 1 from public.qr_codes where code = v);
  end loop;
  return v;
end $$;

-- ---------- Mã QR ----------
create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- mã trên URL công khai /q/<code>; DEFAULT nên tầng web không cần tự sinh
  code text not null default public.qr_gen_code()
    check (code ~ '^[a-z0-9]{8,16}$'),
  name text not null,              -- "Mã QR ở quầy", "Tờ rơi tháng 8"…
  -- BẮT BUỘC gắn nguồn: đây là chỗ QR nối vào báo cáo quy kết đang có (xem B1).
  -- on delete restrict: không cho xóa nguồn khi còn mã QR đang trỏ vào.
  source_id uuid not null references public.lead_sources(id) on delete restrict,
  target_url text not null,        -- khách quét xong đi đâu (Zalo OA / chat / web)
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)         -- tên là thứ chủ tiệm gọi, không cho trùng
);
-- Khóa toàn cục: /q/<code> phải resolve được mà không cần biết tenant.
create unique index qr_codes_code_uidx on public.qr_codes (code);
create index qr_codes_tenant_idx on public.qr_codes (tenant_id, created_at desc);
create index qr_codes_source_idx on public.qr_codes (source_id);
create trigger qr_codes_touch before update on public.qr_codes
  for each row execute function public.touch_updated_at();

alter table public.qr_codes enable row level security;
-- Đọc: mọi thành viên. Ghi: owner/admin/manager — cùng mức với `lead_sources`
-- (migration #4), vì tạo mã QR chính là mở một nguồn khách mới.
create policy qr_codes_select on public.qr_codes for select
  using (tenant_id = (select public.current_tenant_id()));
create policy qr_codes_manage on public.qr_codes for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));

-- ---------- Lượt quét ----------
-- KHÔNG lưu gì nhận diện khách (không IP, không user-agent) — chỉ đếm.
create table public.qr_scans (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  qr_code_id uuid not null references public.qr_codes(id) on delete cascade,
  scanned_at timestamptz not null default now()
);
create index qr_scans_code_time_idx on public.qr_scans (qr_code_id, scanned_at desc);
create index qr_scans_tenant_time_idx on public.qr_scans (tenant_id, scanned_at desc);

alter table public.qr_scans enable row level security;
create policy qr_scans_select on public.qr_scans for select
  using (tenant_id = (select public.current_tenant_id()));
-- Ghi: chỉ `qr_resolve()` (definer) — khách quét không có phiên đăng nhập.

-- ---------- Chặn spam trang công khai ----------
-- Không có tenant_id (không thuộc dữ liệu tenant nào), RLS bật và KHÔNG policy
-- nào → chỉ definer/service role chạm được. Khóa là BĂM của IP, không phải IP.
create table public.qr_scan_throttle (
  bucket text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table public.qr_scan_throttle enable row level security;

-- ---------- Resolve mã QR cho trang công khai ----------
-- Trả về {ok:true, target_url} | {ok:false, reason:'not_found'|'rate_limited'}.
-- Không bao giờ trả tên tiệm / tenant_id / số liệu (xem B2).
create or replace function public.qr_resolve(p_code text, p_client_key text)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  c_limit  constant int      := 20;                 -- 20 lượt / phút / mã / thiết bị
  c_window constant interval := interval '1 minute';
  v_qr     public.qr_codes%rowtype;
  v_bucket text;
  v_hits   int;
begin
  select * into v_qr
  from public.qr_codes
  where code = lower(btrim(coalesce(p_code, ''))) and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Khóa chặn = băm của (mã QR + IP). KHÔNG lưu IP thô ở bất kỳ đâu.
  v_bucket := md5(v_qr.id::text || ':' || coalesce(p_client_key, ''));

  insert into public.qr_scan_throttle as th (bucket, window_start, hits)
  values (v_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case when th.window_start > now() - c_window then th.hits + 1 else 1 end,
    window_start = case when th.window_start > now() - c_window
                        then th.window_start else now() end
  returning th.hits into v_hits;

  if v_hits > c_limit then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.qr_scans (tenant_id, qr_code_id) values (v_qr.tenant_id, v_qr.id);
  return jsonb_build_object('ok', true, 'target_url', v_qr.target_url);
end $$;

revoke execute on function public.qr_resolve(text, text) from public;
-- anon: khách quét mã KHÔNG đăng nhập — đây là điểm chạm internet có chủ đích.
grant execute on function public.qr_resolve(text, text) to anon, authenticated;

-- Dọn bộ đếm chặn spam mỗi giờ (dòng quá 1 giờ không còn ý nghĩa).
select cron.schedule('qr-throttle-cleanup', '7 * * * *',
  $$delete from public.qr_scan_throttle where window_start < now() - interval '1 hour'$$);

-- ---------- Gắn nguồn cho khách đến qua mã QR ----------
-- INVOKER: cách ly tenant có sẵn nhờ RLS (mã của tiệm A không nhìn thấy ở tiệm
-- B, hồ sơ khách của tiệm A không sửa được từ tiệm B) — không cần đặc quyền.
-- CHỈ gắn khi hồ sơ CHƯA có nguồn: không ghi đè nguồn người dùng đã chọn tay.
-- Đây là đầu nối cho worker kênh gọi khi khách vào kèm ref của mã QR.
create or replace function public.qr_attribute_contact(p_code text, p_contact uuid)
returns boolean
language plpgsql volatile
security invoker set search_path = public as $$
declare v_rows int;
begin
  update public.contacts c
     set source_id = q.source_id
    from public.qr_codes q
   where q.code = lower(btrim(coalesce(p_code, '')))
     and c.id = p_contact
     and c.tenant_id = q.tenant_id
     and c.source_id is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

revoke execute on function public.qr_attribute_contact(text, uuid) from public, anon;
grant  execute on function public.qr_attribute_contact(text, uuid) to authenticated;

-- ---------- Danh sách mã QR + số lượt quét (1 round-trip cho màn quản lý) ----------
create or replace function public.qr_code_list()
returns table (
  id           uuid,
  code         text,
  name         text,
  source_id    uuid,
  source_name  text,
  target_url   text,
  is_active    boolean,
  scans_total  bigint,
  scans_7d     bigint,
  last_scan_at timestamptz,
  created_at   timestamptz
)
language sql
stable
security invoker set search_path = public as $$
  select q.id, q.code, q.name, q.source_id, ls.name, q.target_url, q.is_active,
         coalesce(s.total, 0), coalesce(s.d7, 0), s.last_at, q.created_at
  from public.qr_codes q
  join public.lead_sources ls on ls.id = q.source_id
  left join lateral (
    select count(*) as total,
           count(*) filter (where sc.scanned_at >= now() - interval '7 days') as d7,
           max(sc.scanned_at) as last_at
    from public.qr_scans sc
    where sc.qr_code_id = q.id
  ) s on true
  order by q.created_at desc
$$;

revoke execute on function public.qr_code_list() from public, anon;
grant  execute on function public.qr_code_list() to authenticated;
