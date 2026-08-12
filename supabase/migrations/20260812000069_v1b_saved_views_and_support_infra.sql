-- ============================================================
-- iFan.asia — Migration #69: V1b bước 3-4 (Quy hoạch mục 36.3, hợp đồng dữ
-- liệu mục 36.9, task #78). Bốn bảng mới:
--   A. saved_views     — bộ lọc lưu sẵn (24p, QĐ-1: CHỈ lưu ĐIỀU KIỆN)
--   B. bulk_operations — biên nhận thao tác hàng loạt (QĐ-3, dùng ở task #79)
--   C. help_requests   — "Cần giúp?" (dùng ở task #81)
--   D. support_sessions — phiên hỗ trợ chỉ-đọc (ADR-0006, dùng ở task #81)
-- + 2 cột is_support/expires_at trên tenant_members (schema-only ở đây).
--
-- CHỦ ĐÍCH KHÔNG LÀM ở migration này (đúng phạm vi ADR-0006 xếp vào V1b
-- việc #5/task #81, làm CUỐI — không phải quên):
--   - 3 hàm ghế (tenant_seats_used/tenant_seats/enforce_seat_limit) CHƯA
--     thêm "and is_support = false".
--   - custom_access_token_hook() + getCurrentMembership() CHƯA siết hạn
--     theo expires_at.
--   - Đường GHI vào support_sessions/help_requests CHƯA có (chỉ SELECT).
-- Cột/bảng vẫn AN TOÀN để dựng trước: mặc định is_support=false,
-- expires_at=NULL, không ai ghi được is_support=true cho tới task #81 nên
-- KHÔNG có hàng nào lệch hành vi hiện tại (luật D2 — hồ sơ 36.3 bước 3 gộp
-- bốn bảng "một đợt" là quyết định của Opus, không phải Sonnet tự chế).
-- ============================================================

-- ---------- A. saved_views (24p) ----------
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade, -- NULL = view mặc định của tiệm (pack seed)
  screen text not null check (screen in ('contacts', 'deals')), -- danh mục ĐÓNG (36.9F)
  name text not null check (char_length(name) between 1 and 40),
  query text not null, -- "tier=vip&inactive_days=60" — CẤM lưu danh sách id (QĐ-1)
  vocab_version int not null default 1, -- QĐ-4
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz -- xoá mềm (bất biến 11)
);

-- Không trùng tên chip trong cùng màn — coalesce user_id để view mặc định
-- (NULL) cũng tính là "một chủ" trong ràng buộc duy nhất.
create unique index saved_views_unique_name
  on public.saved_views (
    tenant_id,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    screen,
    name
  )
  where deleted_at is null;

create index saved_views_tenant_screen_idx
  on public.saved_views (tenant_id, screen, position) where deleted_at is null;

alter table public.saved_views enable row level security;

-- Đọc: view mặc định (user_id null) tiệm nào cũng thấy; view riêng chỉ chủ.
create policy saved_views_select on public.saved_views for select
  using (
    tenant_id = (select public.current_tenant_id())
    and (user_id is null or user_id = auth.uid())
  );

-- Ghi: view riêng thì chính chủ tự tạo; view mặc định của tiệm chỉ owner/admin.
create policy saved_views_insert on public.saved_views for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and (
      user_id = auth.uid()
      or (user_id is null and (select public.app_role()) in ('owner', 'admin'))
    )
  );

create policy saved_views_update on public.saved_views for update
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      user_id = auth.uid()
      or (user_id is null and (select public.app_role()) in ('owner', 'admin'))
    )
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (
      user_id = auth.uid()
      or (user_id is null and (select public.app_role()) in ('owner', 'admin'))
    )
  );

create policy saved_views_delete on public.saved_views for delete
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      user_id = auth.uid()
      or (user_id is null and (select public.app_role()) in ('owner', 'admin'))
    )
  );

create trigger saved_views_touch before update on public.saved_views
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.saved_views to authenticated;
revoke all on public.saved_views from anon;

comment on table public.saved_views is
  'Hợp đồng 36.9A — bộ lọc lưu sẵn (24p). CHỈ lưu điều kiện (query-string), KHÔNG BAO GIỜ lưu danh sách id (QĐ-1). vocab_version khoá theo mục 36.9F — đọc view có tham số app không hiểu PHẢI báo hỏng (QĐ-4), xem resolve_saved_view().';
comment on column public.saved_views.query is
  'Chuỗi điều kiện kiểu query-string, VD "tier=vip&inactive_days=60". Kiểm nghiệm thu QĐ-1: soi schema bảng này KHÔNG được có cột nào chứa mảng/danh sách id.';

-- ---------- B. bulk_operations (QĐ-3 — biên nhận thao tác hàng loạt, dùng ở task #79) ----------
create table public.bulk_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('assign_owner', 'set_source', 'add_tag', 'remove_tag', 'create_task')),
  entity_type text not null check (entity_type in ('contact')), -- V1b chỉ contact
  target_ids uuid[] not null, -- ẢNH CHỤP lúc bấm — "biên nhận" của QĐ-1
  params jsonb,
  total int not null check (total <= 500), -- trần cứng ở CSDL (QĐ-3), không phải quy ước UI
  done_count int not null default 0,
  failed_count int not null default 0,
  failures jsonb, -- [{id, reason}, ...]
  operation_id text not null, -- khoá chống-bấm-2-lần do web sinh
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Mục 36.12A (máy trạng thái) + giải trình 24d: done_count/failed_count/
  -- failures ghi MỘT LẦN lúc đóng lượt, không cộng dồn từng dòng khi đang
  -- 'running'. Bốn ràng buộc dưới BẮT ĐÚNG điều đó ở CSDL, không tin code.
  check (total = coalesce(array_length(target_ids, 1), 0)),
  check (status <> 'running' or (done_count = 0 and failed_count = 0)),
  check (status = 'running' or done_count + failed_count = total),
  check (status = 'running' or failed_count = coalesce(jsonb_array_length(failures), 0))
);

-- Đây LÀ cơ chế idempotent (QĐ-3) — không phải kiểm ở tầng web.
create unique index bulk_operations_idempotent
  on public.bulk_operations (tenant_id, operation_id);

create index bulk_operations_tenant_created_idx
  on public.bulk_operations (tenant_id, created_at desc);

alter table public.bulk_operations enable row level security;

create policy bulk_operations_select on public.bulk_operations for select
  using (tenant_id = (select public.current_tenant_id()));

create policy bulk_operations_insert on public.bulk_operations for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and actor_id = auth.uid()
  );

-- Chưa cấp UPDATE cho ai ở migration này: hàm xử lý hàng loạt (task #79,
-- security definer riêng) sẽ là đường DUY NHẤT cập nhật done_count/
-- failed_count/status — "biên nhận" mất ý nghĩa nếu ai cũng sửa được thẳng.
grant select, insert on public.bulk_operations to authenticated;
revoke update, delete on public.bulk_operations from authenticated;
revoke all on public.bulk_operations from anon;

comment on table public.bulk_operations is
  'Hợp đồng 36.9B (QĐ-3) — biên nhận thao tác hàng loạt. target_ids là ẢNH CHỤP lúc bấm. Bảng này LÀ biên nhận, KHÔNG phát domain_events (mục 36.11) — hàm xử lý (task #79) gọi lại đúng hàm thao tác đơn lẻ, hàm đó tự phát event của nó; phát thêm bulk.* sẽ khiến người nghe đếm hai lần.';

-- ---------- C. help_requests ("Cần giúp?", dùng ở task #81) ----------
create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) >= 1),
  allow_screen_view boolean not null default false, -- MẶC ĐỊNH KHÔNG CHO XEM — im lặng ≠ đồng ý
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index help_requests_tenant_status_idx on public.help_requests (tenant_id, status);

alter table public.help_requests enable row level security;

create policy help_requests_select on public.help_requests for select
  using (tenant_id = (select public.current_tenant_id()));

create policy help_requests_insert on public.help_requests for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and created_by = auth.uid()
  );

-- Đóng yêu cầu: chính người tạo, hoặc owner/admin/manager của tiệm.
create policy help_requests_update on public.help_requests for update
  using (
    tenant_id = (select public.current_tenant_id())
    and (created_by = auth.uid() or (select public.app_role()) in ('owner', 'admin', 'manager'))
  )
  with check (tenant_id = (select public.current_tenant_id()));

grant select, insert, update on public.help_requests to authenticated;
revoke delete on public.help_requests from authenticated;
revoke all on public.help_requests from anon;

comment on table public.help_requests is
  'Hợp đồng 36.9C — "Cần giúp?" (UI + luồng thông báo dựng ở task #81). allow_screen_view mặc định false: KHÔNG cho xem màn cho tới khi tiệm bấm đồng ý rõ ràng.';

-- ---------- D. support_sessions (ADR-0006 — phiên hỗ trợ chỉ-đọc, dùng ở task #81) ----------
create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade, -- tiệm được hỗ trợ
  admin_user_id uuid not null references auth.users(id) on delete cascade, -- quản trị nền tảng
  reason text not null check (char_length(reason) >= 10), -- ràng buộc ở CSDL, không phải ở ô nhập
  help_request_id uuid references public.help_requests(id) on delete set null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_by text check (ended_by in ('admin', 'tenant', 'expiry')),
  check (expires_at <= started_at + interval '60 minutes') -- hạn cứng ≤ 60 phút (ADR-0006)
);

create index support_sessions_tenant_idx on public.support_sessions (tenant_id, started_at desc);
create index support_sessions_admin_idx on public.support_sessions (admin_user_id, started_at desc);

alter table public.support_sessions enable row level security;

-- Đọc: chính quản trị nền tảng đã mở phiên, HOẶC owner/admin của tiệm bị hỗ
-- trợ (để họ tự thấy ai đã vào xem tiệm mình — đúng "không có phiên lén",
-- QĐ-2). Quản trị nền tảng xem CHÉO TIỆM (dashboard /admin) đi qua đường
-- khác (service role hoặc cơ chế riêng) ở task #81, KHÔNG thêm policy mới
-- ở đây — đúng QĐ-2: "không thêm một chính sách RLS đọc chéo tiệm nào".
create policy support_sessions_select on public.support_sessions for select
  using (
    admin_user_id = auth.uid()
    or (
      tenant_id = (select public.current_tenant_id())
      and (select public.app_role()) in ('owner', 'admin')
    )
  );

-- Chưa cấp INSERT/UPDATE cho ai ở migration này: task #81 dựng RPC riêng
-- (security definer, tự kiểm "là quản trị nền tảng" bên trong hàm) để mở/
-- đóng phiên — không cho ghi thẳng qua PostgREST. Đúng luật D2: có schema +
-- RLS đọc, CHƯA có đường ghi nào cho tới khi có code dùng thật.
grant select on public.support_sessions to authenticated;
revoke insert, update, delete on public.support_sessions from authenticated;
revoke all on public.support_sessions from anon;

comment on table public.support_sessions is
  'Hợp đồng 36.9D (ADR-0006) — phiên hỗ trợ chỉ-đọc. Bảng dựng trước ở migration nền một đợt (mục 36.3 bước 3); đường GHI (mở/đóng phiên) + 3 hàm ghế + siết hạn hook/getCurrentMembership dựng ở task #81 (V1b việc #5, làm CUỐI — đúng ADR-0006, KHÔNG làm ở migration này).';

-- ---------- E. tenant_members: 2 cột cho phiên hỗ trợ (ADR-0006, schema-only) ----------
alter table public.tenant_members
  add column is_support boolean not null default false,
  add column expires_at timestamptz;

comment on column public.tenant_members.is_support is
  'ADR-0006 — true = hàng thành viên TẠM cấp cho phiên hỗ trợ (viewer có hạn giờ). PHẢI bị loại khỏi đếm ghế — 3 hàm ghế (tenant_seats_used/tenant_seats/enforce_seat_limit) sửa kèm ở task #81, CHƯA sửa ở migration này. An toàn để dựng trước: mặc định false, chưa có đường ghi nào set true.';
comment on column public.tenant_members.expires_at is
  'ADR-0006 — NULL = thành viên thường, không hạn. Có giá trị = hết quyền sau mốc này (phiên hỗ trợ). Siết ở custom_access_token_hook()/getCurrentMembership() dựng ở task #81, CHƯA siết ở migration này — hàng cũ đều NULL nên KHÔNG đổi hành vi ai ở bước này.';

-- ---------- F. resolve_saved_view() — QĐ-1 + QĐ-4 ----------
-- Ảnh chụp id NGAY LÚC BẤM cho consumer nào cần tác động ra ngoài (task #79
-- trở đi) — "Nhóm là công thức. Ai thực sự bị tác động là biên nhận." (QĐ-1)
--
-- SECURITY INVOKER (không phải DEFINER): để RLS của chính saved_views/
-- contacts/deals tự áp theo quyền người GỌI — cùng nguyên tắc "global_search
-- dùng SECURITY INVOKER" (mục 36.3 bước 7), tránh mở khoá thêm cho hàm tra
-- cứu đa thực thể. Tác dụng phụ ĐÚNG Ý: nhân viên chỉ được thấy MỘT PHẦN
-- khách thì kết quả resolve cũng tự động chỉ còn phần đó, không rò thêm.
--
-- Vốn từ ĐÓNG vocab_version=1 (mục 36.9F) hard-code ngay trong hàm — đổi
-- nghĩa một tham số cũ PHẢI tăng version này VÀ sửa lại đúng chỗ dưới đây,
-- KHÔNG sửa tại chỗ rồi giữ nguyên version (QĐ-4).
create or replace function public.resolve_saved_view(p_view_id uuid)
returns uuid[]
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_view public.saved_views%rowtype;
  v_known text[];
  v_params jsonb;
  v_bad_key text;
  v_result uuid[];
begin
  select * into v_view from public.saved_views where id = p_view_id and deleted_at is null;
  if not found then
    raise exception 'saved_view_not_found' using detail = p_view_id::text;
  end if;

  -- QĐ-4: version khác 1 ⇒ hỏng, không đoán, không chạy truy vấn.
  if v_view.vocab_version <> 1 then
    raise exception 'saved_view_vocab_stale'
      using detail = format('view=%s vocab_version=%s', v_view.id, v_view.vocab_version),
            hint = 'Bộ lọc này dùng điều kiện bản cũ — mở ra chỉnh lại rồi lưu.';
  end if;

  v_known := case v_view.screen
    when 'contacts' then array['q', 'source', 'tier', 'sort', 'tag', 'inactive_days']
    when 'deals' then array['q', 'needs_action', 'stage', 'owner', 'sort']
  end;

  -- "tier=vip&inactive_days=60" -> {"tier": "vip", "inactive_days": "60"}
  select coalesce(jsonb_object_agg(kv[1], kv[2]), '{}'::jsonb)
    into v_params
    from (
      select regexp_split_to_array(pair, '=') as kv
      from unnest(string_to_array(v_view.query, '&')) as pair
      where pair <> ''
    ) s
    where array_length(kv, 1) = 2;

  -- Gặp khoá NGOÀI vốn từ đóng ⇒ chặn ngay, cấm nhánh "bỏ qua rồi chạy tiếp"
  -- (QĐ-4) — bỏ qua = điều kiện thu hẹp biến mất = nhóm âm thầm nở ra thành
  -- TẤT CẢ KHÁCH, đúng lỗ hổng mục 36.7 cảnh báo.
  select k into v_bad_key from jsonb_object_keys(v_params) k
    where not (k = any(v_known)) limit 1;
  if v_bad_key is not null then
    raise exception 'saved_view_unknown_param'
      using detail = format('view=%s param=%s', v_view.id, v_bad_key),
            hint = 'Bộ lọc này dùng điều kiện bản cũ — mở ra chỉnh lại rồi lưu.';
  end if;

  if v_view.screen = 'contacts' then
    select coalesce(array_agg(c.id), array[]::uuid[]) into v_result
      from public.contacts c
      where c.tenant_id = v_view.tenant_id
        and c.deleted_at is null
        and (not (v_params ? 'tier') or c.tier = (v_params ->> 'tier'))
        and (not (v_params ? 'source') or c.source_id = (v_params ->> 'source')::uuid)
        and (
          not (v_params ? 'tag')
          or exists (
            select 1 from public.contact_tags ct
            where ct.contact_id = c.id and ct.tag_id = (v_params ->> 'tag')::uuid
          )
        )
        and (
          not (v_params ? 'inactive_days')
          or c.last_interaction_at is null
          or c.last_interaction_at < now() - make_interval(days => (v_params ->> 'inactive_days')::int)
        )
        and (
          not (v_params ? 'q')
          or c.search_text ilike '%' || public.immutable_unaccent(lower(replace(v_params ->> 'q', '+', ' '))) || '%'
        );
  elsif v_view.screen = 'deals' then
    select coalesce(array_agg(d.id), array[]::uuid[]) into v_result
      from public.deals d
      where d.tenant_id = v_view.tenant_id
        and d.deleted_at is null
        and (not (v_params ? 'stage') or d.stage_id = (v_params ->> 'stage')::uuid)
        and (
          not (v_params ? 'owner')
          or d.owner_id = (case when v_params ->> 'owner' = 'me' then auth.uid() else (v_params ->> 'owner')::uuid end)
        )
        and (
          not (v_params ? 'needs_action')
          or (d.status = 'open' and (d.next_action_at is null or d.next_action_at <= now()))
        )
        and (
          not (v_params ? 'q')
          or d.title ilike '%' || replace(v_params ->> 'q', '+', ' ') || '%'
          or exists (
            select 1 from public.contacts c
            where c.id = d.contact_id
              and c.search_text ilike '%' || public.immutable_unaccent(lower(replace(v_params ->> 'q', '+', ' '))) || '%'
          )
        );
  end if;

  return coalesce(v_result, array[]::uuid[]);
end;
$$;

revoke execute on function public.resolve_saved_view(uuid) from public, anon;
grant execute on function public.resolve_saved_view(uuid) to authenticated;

comment on function public.resolve_saved_view(uuid) is
  'QĐ-1 + QĐ-4 — ảnh chụp id NGAY LÚC BẤM cho hành động tác động ra ngoài. security invoker: RLS contacts/deals/saved_views tự áp theo quyền người gọi. Gặp vocab_version khác 1 hoặc tham số ngoài vốn từ đóng mục 36.9F ⇒ raise exception, TUYỆT ĐỐI KHÔNG trả về danh sách rộng hơn.';

-- ---------- G. Seed 2 view mặc định mỗi pack (mục 36.10A) ----------
-- Gắn vào apply_industry_pack() — CÙNG chỗ tags/quick_replies đã seed, cùng
-- thời điểm (tiệm chọn/áp pack), cùng kiểu idempotent (bấm lại không nhân
-- đôi). "Cần kéo về" = VIP + chưa quay lại N ngày (N theo nhịp quay lại tự
-- nhiên của từng nghề, mục 36.10A — không phải luật, tiệm sửa lại được).
create or replace function public.apply_industry_pack(p_pack_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_sample jsonb;
  v_tag text;
  v_qr jsonb;
  v_inactive_days int;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if (select public.app_role()) not in ('owner','admin') then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.industry_packs where key = p_pack_key) then
    raise exception 'invalid_pack_key';
  end if;

  update public.tenants set industry = p_pack_key where id = v_tenant;

  select content -> 'sample_data' into v_sample from public.industry_packs where key = p_pack_key;

  -- Tags mẫu
  for v_tag in select jsonb_array_elements_text(coalesce(v_sample -> 'tags', '[]'::jsonb))
  loop
    insert into public.tags (tenant_id, name) values (v_tenant, v_tag)
      on conflict (tenant_id, name) do nothing;
  end loop;

  -- Câu trả lời nhanh mẫu
  for v_qr in select jsonb_array_elements(coalesce(v_sample -> 'quick_replies', '[]'::jsonb))
  loop
    insert into public.quick_replies (tenant_id, title, content, sort_order)
      values (v_tenant, v_qr ->> 'title', v_qr ->> 'content', coalesce((v_qr ->> 'sort_order')::int, 0))
      on conflict (tenant_id, title) do nothing;
  end loop;

  -- 2 view mặc định (24p, mục 36.10A) — số ngày khác nhau vì nhịp quay lại
  -- tự nhiên của từng nghề khác nhau (quán cà phê 1 tuần/lần vs nha khoa
  -- khám định kỳ 6 tháng). Đây là con số KHỞI ĐIỂM, tiệm sửa lại được.
  v_inactive_days := case p_pack_key
    when 'spa' then 60
    when 'kham' then 180
    when 'pet' then 75
    when 'fnb' then 30
    when 'shop' then 45
    when 'retail' then 60
    when 'education' then 90
    else 60 -- 'other' và mọi key ngoài danh sách trên
  end;

  insert into public.saved_views (tenant_id, user_id, screen, name, query, vocab_version, position)
    values
      (v_tenant, null, 'contacts', 'Cần kéo về', 'tier=vip&inactive_days=' || v_inactive_days, 1, 0),
      (v_tenant, null, 'contacts', 'Khách mới', 'tier=new', 1, 1)
    on conflict do nothing;

  perform public.record_audit_log('tenant', v_tenant, 'pack_applied', jsonb_build_object('pack_key', p_pack_key));
end;
$$;
revoke execute on function public.apply_industry_pack(text) from public, anon;
grant execute on function public.apply_industry_pack(text) to authenticated;

-- ---------- H. Bù seed cho tenant ĐÃ áp pack TRƯỚC migration này ----------
-- apply_industry_pack() sửa xong chỉ seed cho lượt áp MỚI — tiệm đã chọn
-- ngành từ trước (kể cả 5 tiệm mẫu demo) không tự nhiên có 2 chip. Chạy bù
-- một lần, cùng nội dung/cùng số ngày với hàm trên, cùng kiểu idempotent.
do $$
declare
  v_tenant record;
  v_inactive_days int;
begin
  for v_tenant in select id, industry from public.tenants where industry is not null loop
    v_inactive_days := case v_tenant.industry
      when 'spa' then 60
      when 'kham' then 180
      when 'pet' then 75
      when 'fnb' then 30
      when 'shop' then 45
      when 'retail' then 60
      when 'education' then 90
      else 60
    end;
    insert into public.saved_views (tenant_id, user_id, screen, name, query, vocab_version, position)
      values
        (v_tenant.id, null, 'contacts', 'Cần kéo về', 'tier=vip&inactive_days=' || v_inactive_days, 1, 0),
        (v_tenant.id, null, 'contacts', 'Khách mới', 'tier=new', 1, 1)
      on conflict do nothing;
  end loop;
end $$;
