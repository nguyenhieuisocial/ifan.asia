-- ============================================================
-- iFan.asia — Migration #80: V1.5 "Cửa vào khách" — nền tảng cổng khách công
-- khai (ADR-0008, docs/adr/0008-cong-khach-cong-khai.md). Đọc ADR trước khi
-- sửa file này — mọi quyết định số/cấu trúc dưới đây đã CHỐT ở đó, không phải
-- tự chọn ở migration này.
--
-- Đúng phạm vi ADR mục 9 "Thêm" — CHỈ dựng phần V1.5 đã có người dùng thật:
--   tenants.timezone         -- giờ lưu THEO GIỜ ĐỊA PHƯƠNG tiệm (mục 6)
--   business_hours           -- giờ lặp theo thứ, NHIỀU dòng/thứ (nghỉ trưa)
--   business_closures        -- ngày nghỉ/đổi giờ đột xuất, ĐÈ lên business_hours
--   tenant_storefront         -- 1 dòng/tiệm: bật mặt tiền, bật form, giới thiệu/
--                                địa chỉ/link Zalo công khai, field "Hỏi thêm" đã bật
--   storefront_lead_submissions -- chống lụt ẩn danh, NOI KHUÔN livechat_visitors
--                                (#23): token_hash + ip_hash, KHÔNG lưu token thô
--   private.storefront_resolve / public.storefront_view / storefront_submit_lead
--                             -- cửa DUY NHẤT khách vãng lai chạm dữ liệu; KHÔNG
--                                cấp select bảng nào ở trên cho anon (đúng #67
--                                nguyên tắc livechat: định danh KHÔNG xác thực
--                                → mọi đọc/ghi qua RPC security definer)
--   lead_sources: +1 nguồn hệ thống "Form/Landing" (channel_type='website') —
--                             lead từ form đổ đúng vào báo cáo nguồn có sẵn,
--                             không dựng đường đếm mới (ADR mục 7)
--
-- CỐ TÌNH CHƯA DỰNG (ADR mục 3/9 — có hợp đồng sẵn, KHÔNG phải thiếu sót):
--   customer_links + /k/[token] toàn bộ — dựng ở V2.5 khi có người dùng đầu
--   tiên thật (tự đặt lịch). Dựng bây giờ là tạo bảng/cột chưa có code ghi —
--   phạm luật D2.
--
-- Hai điều dễ sai đã tránh (xem thẻ design man-cai-dat-mat-tien.html):
--   1. Giờ lưu KIỂU time (không timestamptz) + tenants.timezone riêng — mốc
--      tuyệt đối sẽ khoá cứng tiệm vào VN, sửa sau đụng mọi lịch hẹn (go-global).
--   2. is_open/giờ mở-đóng-tiếp KHÔNG tính ở đây — RPC chỉ trả dữ liệu thô đã
--      lọc an toàn (giờ hôm nay tính theo now() AT TIME ZONE tenant.timezone,
--      không có offset, so sánh trực tiếp với business_hours cũng lưu kiểu
--      time không offset); #88 tính "đang mở/đóng lúc mấy giờ/mở lại khi nào"
--      ở tầng web — vừa dễ chỉnh câu chữ hiển thị, vừa tránh toán múi giờ
--      trong SQL cho một phép tính thuần trình bày.
-- ============================================================

-- ---------- tenants.timezone ----------

alter table public.tenants
  add column if not exists timezone text not null default 'Asia/Ho_Chi_Minh'
  check (timezone <> '');

-- ---------- business_hours: giờ lặp theo thứ (0=CN…6=T7, theo extract(dow)) ----------

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_closed boolean not null default false,
  open_time time,
  close_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Nghỉ cả ngày thì KHÔNG có giờ; có giờ thì phải đủ cặp và đóng sau mở.
  constraint business_hours_time_check check (
    (is_closed and open_time is null and close_time is null)
    or (not is_closed and open_time is not null and close_time is not null
        and close_time > open_time)
  )
);
create index business_hours_tenant_weekday_idx on public.business_hours (tenant_id, weekday);
alter table public.business_hours enable row level security;
create policy business_hours_select on public.business_hours for select
  using (tenant_id = (select public.current_tenant_id()));
create policy business_hours_manage on public.business_hours for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger business_hours_touch before update on public.business_hours
  for each row execute function public.touch_updated_at();
revoke all on public.business_hours from anon;

-- ---------- business_closures: ngoại lệ ĐÈ lên business_hours ----------

create table public.business_closures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  -- Hiện CHO KHÁCH XEM trên mặt tiền (thẻ design man-cai-dat-mat-tien.html) —
  -- viết dễ hiểu, không phải ghi chú nội bộ.
  reason text not null check (char_length(reason) between 1 and 200),
  is_full_day boolean not null default true,
  open_time time,
  close_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_closures_date_check check (date_to >= date_from),
  constraint business_closures_time_check check (
    (is_full_day and open_time is null and close_time is null)
    or (not is_full_day and open_time is not null and close_time is not null
        and close_time > open_time)
  )
);
create index business_closures_tenant_range_idx
  on public.business_closures (tenant_id, date_from, date_to);
alter table public.business_closures enable row level security;
create policy business_closures_select on public.business_closures for select
  using (tenant_id = (select public.current_tenant_id()));
create policy business_closures_manage on public.business_closures for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger business_closures_touch before update on public.business_closures
  for each row execute function public.touch_updated_at();
revoke all on public.business_closures from anon;

-- ---------- tenant_storefront: 1 dòng/tiệm, cấu hình mặt tiền + form ----------

create table public.tenant_storefront (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  storefront_enabled boolean not null default false,
  lead_form_enabled boolean not null default false,
  intro text check (intro is null or char_length(intro) <= 160),
  address text check (address is null or char_length(address) <= 200),
  zalo_contact_url text check (zalo_contact_url is null or char_length(zalo_contact_url) <= 300),
  -- Mảng key ĐÃ BẬT trong danh mục field "Hỏi thêm" của pack ngành (tenants.industry
  -- → industry_packs.content->'lead_form_fields'). Bật/tắt thôi — KHÔNG builder
  -- kéo-thả, KHÔNG tự tạo trường (ADR mục 7 + luật D2 mục 18).
  lead_form_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tenant_storefront enable row level security;
create policy tenant_storefront_select on public.tenant_storefront for select
  using (tenant_id = (select public.current_tenant_id()));
-- Cấu hình mặt tiền là quyết định cấp tiệm — chỉ chủ tiệm/quản trị (không có
-- 'manager'), khác business_hours vì đây là bật/tắt CỔNG CÔNG KHAI của cả tiệm.
create policy tenant_storefront_manage on public.tenant_storefront for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin'));
create trigger tenant_storefront_touch before update on public.tenant_storefront
  for each row execute function public.touch_updated_at();
revoke all on public.tenant_storefront from anon;

comment on table public.tenant_storefront is
  'ADR-0008 mục 9. Không có dòng = mặt tiền chưa từng bật (storefront_view() coi như enabled=false), không cần seed khi tạo tenant.';

-- ---------- storefront_lead_submissions: chống lụt ẩn danh (noi khuôn #23) ----------

create table public.storefront_lead_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- sha256(token trình duyệt) — KHÔNG BAO GIỜ lưu token gốc, y hệt livechat_visitors.
  token_hash text,
  -- sha256(ip || ':' || slug) — chống lụt theo IP mà không lưu IP thô.
  ip_hash text,
  contact_id uuid references public.contacts(id) on delete set null,
  matched_existing boolean not null default false,
  created_at timestamptz not null default now()
);
create index storefront_lead_submissions_flood_idx
  on public.storefront_lead_submissions (tenant_id, ip_hash, created_at desc)
  where ip_hash is not null;
create index storefront_lead_submissions_token_idx
  on public.storefront_lead_submissions (tenant_id, token_hash, created_at desc)
  where token_hash is not null;
create index storefront_lead_submissions_contact_idx
  on public.storefront_lead_submissions (contact_id) where contact_id is not null;
alter table public.storefront_lead_submissions enable row level security;
-- ĐỌC: thành viên tenant. GHI: KHÔNG có policy nào — chỉ RPC definer bên dưới.
create policy storefront_lead_submissions_select on public.storefront_lead_submissions for select
  using (tenant_id = (select public.current_tenant_id()));
revoke all on public.storefront_lead_submissions from anon;

-- ---------- lead_sources: +1 nguồn hệ thống "Form/Landing" ----------

insert into public.lead_sources (tenant_id, name, channel_type, is_system, i18n_key)
  select t.id, 'Form/Landing', 'website', true, 'source.form'
  from public.tenants t
  where not exists (
    select 1 from public.lead_sources ls
      where ls.tenant_id = t.id and ls.name = 'Form/Landing'
  );

create or replace function public.create_tenant(p_name text, p_slug text)
returns uuid
language plpgsql
security definer set search_path = public, pg_temp as $function$
declare
  v_tenant uuid;
  v_pipeline uuid;
  v_max int;
  v_joined int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext('create_tenant:' || auth.uid()::text));
  v_max := coalesce(
    (select l.max_tenants from public.tenant_creation_limits l where l.user_id = auth.uid()),
    1);
  select count(*) into v_joined from public.tenant_members tm
    join public.tenants t on t.id = tm.tenant_id
    where tm.user_id = auth.uid() and tm.status = 'active'
      and tm.role = 'owner' and t.is_sample = false;
  if v_joined >= v_max then
    raise exception 'tenant_limit_reached';
  end if;

  insert into public.tenants (name, slug, trial_ends_at)
    values (p_name, lower(p_slug), now() + interval '30 days')
    returning id into v_tenant;
  insert into public.tenant_members (tenant_id, user_id, role, joined_at)
    values (v_tenant, auth.uid(), 'owner', now());

  update public.profiles set active_tenant_id = v_tenant, updated_at = now()
    where user_id = auth.uid();

  insert into public.pipelines (tenant_id, name, is_default, position)
    values (v_tenant, 'Bán hàng', true, 0)
    returning id into v_pipeline;
  insert into public.pipeline_stages
    (tenant_id, pipeline_id, name, position, kind, win_probability, i18n_key) values
    (v_tenant, v_pipeline, 'Mới',         0, 'open', 10,  'stage.new'),
    (v_tenant, v_pipeline, 'Đang tư vấn', 1, 'open', 30,  'stage.consulting'),
    (v_tenant, v_pipeline, 'Hẹn lịch',    2, 'open', 60,  'stage.scheduled'),
    (v_tenant, v_pipeline, 'Đã chốt',     3, 'won', 100,  'stage.won'),
    (v_tenant, v_pipeline, 'Quay lại',    4, 'open', 20,  'stage.returning'),
    (v_tenant, v_pipeline, 'Thua',        5, 'lost', 0,   'stage.lost');

  insert into public.lost_reasons (tenant_id, name, position, i18n_key) values
    (v_tenant, 'Giá cao',             0, 'lostReason.price'),
    (v_tenant, 'Chọn đối thủ',        1, 'lostReason.competitor'),
    (v_tenant, 'Không còn nhu cầu',   2, 'lostReason.noNeed'),
    (v_tenant, 'Không liên lạc được', 3, 'lostReason.unreachable'),
    (v_tenant, 'Khác',                4, 'lostReason.other');

  -- Migration #80 (V1.5): thêm "Form/Landing" — nguồn hệ thống thứ 5.
  insert into public.lead_sources (tenant_id, name, channel_type, is_system, i18n_key) values
    (v_tenant, 'Zalo',        'zalo',     true, 'source.zalo'),
    (v_tenant, 'Facebook',    'facebook', true, 'source.facebook'),
    (v_tenant, 'Giới thiệu',  'referral', true, 'source.referral'),
    (v_tenant, 'Form/Landing','website',  true, 'source.form'),
    (v_tenant, 'Khác',        'other',    true, 'source.other');

  perform public.wf_seed_playbooks(v_tenant);
  perform public.sla_seed_policies(v_tenant);
  insert into public.tier_rules (tenant_id) values (v_tenant);

  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid(), 'platform');
  return v_tenant;
end $function$;
-- grant execute cho authenticated giữ nguyên từ migration #1 (create or replace không mất grant)

-- ---------- industry_packs: catalog field "Hỏi thêm" — CHỈ pack 'spa' (thẻ design) ----------
-- Các pack khác giữ '[]' như custom_fields đa số pack đang có — không tự bịa
-- catalog cho ngành chưa có thẻ design khoá (luật D2 + mô hình phân quyền: nội
-- dung hiển thị/UX do Opus khoá, Sonnet chỉ chuyển đúng thẻ đã duyệt thành dữ
-- liệu). Khớp đúng 3 field trong man-form-nhan-khach.html.

update public.industry_packs
  set content = content || jsonb_build_object('lead_form_fields', '[
    {"key": "service_interest", "label": "Dịch vụ quan tâm", "type": "select",
     "options": ["Chăm sóc da", "Massage trị liệu", "Triệt lông", "Gói liệu trình", "Khác"]},
    {"key": "preferred_time", "label": "Khung giờ tiện", "type": "select",
     "options": ["Sáng (8:00–12:00)", "Trưa (12:00–14:00)", "Chiều (14:00–18:00)", "Tối (18:00–21:00)"]},
    {"key": "referral_source", "label": "Biết tiệm qua đâu", "type": "select",
     "options": ["Google", "Facebook", "TikTok", "Bạn bè giới thiệu", "Đi ngang qua", "Khác"]}
  ]'::jsonb)
  where key = 'spa';

-- ---------- private.storefront_resolve: tìm tiệm theo slug (nội bộ) ----------
-- Chưa có deleted_at trên tenants (chưa có tính năng xoá mềm tiệm) — khi tính
-- năng đó ra đời PHẢI thêm điều kiện lọc ở đây, không phải ở từng RPC gọi nó.

create or replace function private.storefront_resolve(p_slug text)
returns public.tenants
language sql stable
security definer set search_path = public, pg_temp as $$
  select t.* from public.tenants t where t.slug = lower(btrim(p_slug)) limit 1
$$;
revoke execute on function private.storefront_resolve(text) from public, anon, authenticated;

-- ---------- storefront_view: khách vãng lai xem mặt tiền /t/[slug] ----------
-- CHỈ trả field tiệm tự công bố + giờ mở cửa/ngày nghỉ TƯƠNG LAI — TUYỆT ĐỐI
-- không có dữ liệu khách (bất biến ADR mục 7). Slug sai / tiệm chưa từng bật
-- mặt tiền dùng CHUNG một câu trả lời trung tính ở tầng ứng dụng (not_found
-- vs enabled=false) — không dò được tiệm nào tồn tại qua thông báo lỗi.

create or replace function public.storefront_view(p_slug text)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant public.tenants%rowtype := private.storefront_resolve(p_slug);
  v_sf public.tenant_storefront%rowtype;
  v_catalog jsonb;
  v_fields jsonb;
  v_hours jsonb;
  v_closures jsonb;
begin
  if v_tenant.id is null then
    raise exception 'not_found';
  end if;

  select * into v_sf from public.tenant_storefront where tenant_id = v_tenant.id;
  if v_sf.tenant_id is null or not v_sf.storefront_enabled then
    return jsonb_build_object('enabled', false);
  end if;

  select content -> 'lead_form_fields' into v_catalog
    from public.industry_packs where key = v_tenant.industry;

  -- Chỉ trả field ĐÃ BẬT (tenant_storefront.lead_form_fields), không trả cả danh mục.
  select coalesce(jsonb_agg(f), '[]'::jsonb) into v_fields
    from jsonb_array_elements(coalesce(v_catalog, '[]'::jsonb)) f
    where coalesce(v_sf.lead_form_fields, '[]'::jsonb) ? (f ->> 'key');

  select coalesce(jsonb_agg(jsonb_build_object(
           'weekday', h.weekday, 'is_closed', h.is_closed,
           'open_time', to_char(h.open_time, 'HH24:MI'),
           'close_time', to_char(h.close_time, 'HH24:MI'))
           order by h.weekday, h.open_time nulls first), '[]'::jsonb)
    into v_hours
    from public.business_hours h where h.tenant_id = v_tenant.id;

  -- Chỉ ngày nghỉ CÒN HIỆU LỰC/SẮP TỚI — ngày nghỉ đã qua không có ích cho
  -- khách xem và không cần lộ lịch sử vận hành của tiệm.
  select coalesce(jsonb_agg(jsonb_build_object(
           'date_from', c.date_from, 'date_to', c.date_to, 'reason', c.reason,
           'is_full_day', c.is_full_day,
           'open_time', to_char(c.open_time, 'HH24:MI'),
           'close_time', to_char(c.close_time, 'HH24:MI'))
           order by c.date_from), '[]'::jsonb)
    into v_closures
    from public.business_closures c
    where c.tenant_id = v_tenant.id
      and c.date_to >= (now() at time zone v_tenant.timezone)::date;

  return jsonb_build_object(
    'enabled', true,
    'name', v_tenant.name,
    'intro', v_sf.intro,
    'address', v_sf.address,
    'zalo_contact_url', v_sf.zalo_contact_url,
    'lead_form_enabled', v_sf.lead_form_enabled,
    'lead_form_fields', v_fields,
    'timezone', v_tenant.timezone,
    -- Giờ hiện tại + thứ TẠI TIỆM, kiểu wall-clock không offset — so sánh
    -- trực tiếp với 'hours' ở trên (cũng wall-clock), #88 không cần đụng múi
    -- giờ ở tầng JS.
    'now', (now() at time zone v_tenant.timezone),
    'today_weekday', extract(dow from (now() at time zone v_tenant.timezone))::int,
    'hours', v_hours,
    'closures', v_closures);
end $$;
revoke execute on function public.storefront_view(text) from public;
grant execute on function public.storefront_view(text) to anon, authenticated;

-- ---------- storefront_submit_lead: khách để lại tên + số ----------

create or replace function public.storefront_submit_lead(
  p_slug text,
  p_token_hash text,
  p_ip_hash text,
  p_full_name text,
  p_phone text,
  p_fields jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant public.tenants%rowtype := private.storefront_resolve(p_slug);
  v_sf public.tenant_storefront%rowtype;
  v_name text := left(btrim(coalesce(p_full_name, '')), 120);
  v_phone text := btrim(coalesce(p_phone, ''));
  v_e164 text;
  v_now timestamptz := now();
  v_recent int;
  v_dup uuid;
  v_contact public.contacts%rowtype;
  v_source uuid;
  v_catalog jsonb;
  v_custom jsonb := '{}'::jsonb;
  v_key text;
  v_val text;
  v_field jsonb;
  v_owner uuid;
  v_matched boolean := false;
begin
  if v_tenant.id is null then raise exception 'not_found'; end if;

  select * into v_sf from public.tenant_storefront where tenant_id = v_tenant.id;
  if v_sf.tenant_id is null or not v_sf.storefront_enabled or not v_sf.lead_form_enabled then
    -- "Từ chối lịch sự" (ADR mục 8) là việc của tầng ứng dụng: mã lỗi riêng
    -- biệt với 'not_found' để #88 hiện đúng câu, không lộ là tiệm có tồn tại
    -- hay không khác với việc form đang tắt.
    raise exception 'form_disabled';
  end if;

  -- Gửi lại trong 10 phút CÙNG THIẾT BỊ (token trình duyệt) → "vừa gửi rồi",
  -- không ghi thêm, không tính vào rate-limit IP (thẻ design man-form-nhan-
  -- khach.html, kết cục #4).
  if p_token_hash is not null then
    select id into v_dup from public.storefront_lead_submissions
      where tenant_id = v_tenant.id and token_hash = p_token_hash
        and created_at > v_now - interval '10 minutes'
      limit 1;
    if v_dup is not null then
      return jsonb_build_object('duplicate', true);
    end if;
  end if;

  if v_name = '' then raise exception 'invalid_request'; end if;
  -- Cùng luật chuẩn hoá SĐT VN đang dùng ở app/app/contacts/actions.ts (toE164).
  if v_phone !~ '^0\d{9,10}$' then raise exception 'invalid_phone'; end if;
  v_e164 := '+84' || substring(v_phone from 2);

  -- Chống lụt theo IP — 5 lượt/giờ mỗi (tiệm, IP), độc lập với chốt token ở trên.
  if p_ip_hash is not null then
    select count(*) into v_recent
      from public.storefront_lead_submissions
      where tenant_id = v_tenant.id and ip_hash = p_ip_hash
        and created_at > v_now - interval '1 hour';
    if v_recent >= 5 then raise exception 'rate_limited'; end if;
  end if;

  -- Lọc câu trả lời "Hỏi thêm": chỉ nhận field ĐÃ BẬT + đúng key catalog của
  -- pack + (nếu là select) đúng một trong các lựa chọn — không tin dữ liệu
  -- thô từ client vãng lai.
  select content -> 'lead_form_fields' into v_catalog
    from public.industry_packs where key = v_tenant.industry;
  for v_field in select * from jsonb_array_elements(coalesce(v_catalog, '[]'::jsonb))
  loop
    v_key := v_field ->> 'key';
    continue when not (coalesce(v_sf.lead_form_fields, '[]'::jsonb) ? v_key);
    v_val := p_fields ->> v_key;
    continue when v_val is null or btrim(v_val) = '';
    v_val := left(btrim(v_val), 200);
    if v_field ->> 'type' = 'select'
       and not (coalesce(v_field -> 'options', '[]'::jsonb) ? v_val) then
      continue;
    end if;
    v_custom := v_custom || jsonb_build_object(v_key, v_val);
  end loop;

  select * into v_contact from public.contacts
    where tenant_id = v_tenant.id and phone_e164 = v_e164
    order by created_at limit 1;

  if v_contact.id is not null then
    -- Trùng SĐT khách cũ → GỘP, không tạo bản ghi trùng. Vô hình với khách
    -- (ADR mục 7): trả về y hệt kết cục "thành công" của khách mới.
    v_matched := true;
    update public.contacts
      set custom = coalesce(custom, '{}'::jsonb) || v_custom,
          last_interaction_at = v_now
      where id = v_contact.id
      returning * into v_contact;

    v_owner := v_contact.owner_id;
    if v_owner is null then
      select m.user_id into v_owner from public.tenant_members m
        where m.tenant_id = v_tenant.id and m.role = 'owner' and m.status = 'active'
        order by m.created_at limit 1;
    end if;
    if v_owner is not null then
      insert into public.activities
          (tenant_id, type, subject, contact_id, owner_id, due_at)
        values (v_tenant.id, 'task', 'Khách cũ quay lại qua form mặt tiền',
                v_contact.id, v_owner, v_now);
    end if;
  else
    select id into v_source from public.lead_sources
      where tenant_id = v_tenant.id and name = 'Form/Landing';

    insert into public.contacts (tenant_id, full_name, phone, phone_e164, source_id, custom)
      values (v_tenant.id, v_name, v_phone, v_e164, v_source, v_custom)
      returning * into v_contact;
  end if;

  insert into public.storefront_lead_submissions
      (tenant_id, token_hash, ip_hash, contact_id, matched_existing)
    values (v_tenant.id, p_token_hash, p_ip_hash, v_contact.id, v_matched);

  return jsonb_build_object('duplicate', false, 'matched_existing', v_matched);
end $$;
revoke execute on function public.storefront_submit_lead(text, text, text, text, text, jsonb) from public;
grant execute on function public.storefront_submit_lead(text, text, text, text, text, jsonb) to anon, authenticated;
