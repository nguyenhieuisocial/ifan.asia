-- ═══════════════════════════════════════════════════════════════════════════
-- LEAD CHỜ DUYỆT — đổi nhánh "quá ngưỡng thì TỪ CHỐI" thành "GIỮ LẠI chờ duyệt"
-- Thẻ design: man-lead-cho-duyet.html · ADR-0024 QĐ-4 · nối tiếp việc #209 LỖ 5.
-- ───────────────────────────────────────────────────────────────────────────
-- BÀI TOÁN (đã ghi thẳng trong mã #209): form mặt tiền chặn 5 lượt/giờ mỗi
-- (tiệm, IP). Ở VN rất nhiều thuê bao dùng CHUNG một IP nhà mạng (CGNAT), nên
-- 5 KHÁCH THẬT sau cùng một nhà mạng, trong một giờ, tới cùng một tiệm → người
-- thứ 6 bị TỪ CHỐI THẲNG. Khách bị đuổi là mất. Bản #209 đã cố ý CHƯA làm hàng
-- chờ vì "lead nằm im mà chủ tiệm không thấy thì bằng mất luôn" — điều kiện để
-- làm là phải có MÀN DUYỆT trước. Nay màn duyệt đã dựng (tab trong /app/approvals)
-- nên mở được nhánh xếp hàng.
--
-- LUẬT MỚI (v1, cố ý hẹp):
--   · Ngưỡng 5/(tiệm,IP) quá tay  → GIỮ CHỜ DUYỆT (không đuổi). Đây là nhánh
--     CGNAT: một IP đông người. Chủ tiệm soát rồi Nhận / Bỏ.
--   · Ngưỡng 60/giờ/tiệm          → vẫn TỪ CHỐI CỨNG. 60 lead/giờ vượt sức người
--     soát; đây là lũ thật, không phải ngày hội của tiệm nhỏ.
--   · Trần 100 lead ĐANG CHỜ mỗi tiệm → quá thì từ chối cứng, để hàng chờ không
--     bị bơm ngập thành vô dụng.
--   · KHÔNG đụng "trùng khách cũ" (vẫn tự gộp lặng như cũ) và KHÔNG thêm nhãn
--     "nghi rác" (chưa có luật nhận rác) — hai thứ đó cần founder chốt riêng.
--
-- QUYỀN RIÊNG TƯ: lead chờ duyệt chứa TÊN + SĐT của người CHƯA thành khách. Để
-- nó trong storefront_lead_submissions là sai — bảng đó cho MỌI thành viên tiệm
-- đọc (kể cả vai Chỉ xem), rộng hơn cả RLS của bảng contacts. Nên cất ở bảng
-- RIÊNG storefront_lead_holds: bật RLS, KHÔNG policy nào → chỉ RPC definer đọc/
-- ghi được, giống bảng employee_face (#225). Vẫn ghi MỘT dòng băm vào
-- storefront_lead_submissions để phép đếm chống-lũ tính đủ cả lead bị giữ.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Bảng lead đang giữ chờ duyệt (PII, chỉ RPC đọc được) ──
create table if not exists public.storefront_lead_holds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- {name, phone, e164, custom, qr} — đủ để "hoá thân" thành contact lúc duyệt.
  payload jsonb not null,
  hold_reason text not null,               -- 'ip_flood' (v1 chỉ có một lý do)
  status text not null default 'held' check (status in ('held', 'approved', 'rejected')),
  contact_id uuid references public.contacts(id) on delete set null,  -- gán khi duyệt
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz
);
alter table public.storefront_lead_holds enable row level security;
revoke all on public.storefront_lead_holds from anon, authenticated;
-- CỐ Ý không có policy: mọi đường vào đi qua RPC definer bên dưới.
create index if not exists storefront_lead_holds_pending_idx
  on public.storefront_lead_holds (tenant_id, created_at desc)
  where status = 'held';

-- ── Hàm dùng chung: biến một lead thành contact (gộp nếu trùng SĐT, tạo mới nếu
--    chưa có) + gán nguồn + đẻ việc chăm. Rút từ THÂN storefront_submit_lead để
--    nhánh "nhận thẳng" và nhánh "duyệt sau" DÙNG CHUNG một logic — không viết
--    hai bản rồi lệch (bài học #180). Trả {contact_id, matched}. ──
create or replace function private.storefront_materialize_lead(
  p_tenant uuid,
  p_name text,
  p_phone_raw text,
  p_e164 text,
  p_custom jsonb,
  p_qr text
) returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_now timestamptz := now();
  v_contact public.contacts%rowtype;
  v_source uuid;
  v_owner uuid;
  v_matched boolean := false;
begin
  select * into v_contact from public.contacts
    where tenant_id = p_tenant and phone_e164 = p_e164
    order by created_at limit 1;

  if v_contact.id is not null then
    -- Trùng SĐT khách cũ → GỘP, không tạo bản ghi trùng (ADR mục 7).
    v_matched := true;
    update public.contacts
      set custom = coalesce(custom, '{}'::jsonb) || p_custom,
          last_interaction_at = v_now
      where id = v_contact.id
      returning * into v_contact;

    v_owner := v_contact.owner_id;
    if v_owner is null then
      select m.user_id into v_owner from public.tenant_members m
        where m.tenant_id = p_tenant and m.role = 'owner' and m.status = 'active'
        order by m.created_at limit 1;
    end if;
    if v_owner is not null then
      insert into public.activities
          (tenant_id, type, subject, contact_id, owner_id, due_at)
        values (p_tenant, 'task', 'Khách cũ quay lại qua form mặt tiền',
                v_contact.id, v_owner, v_now);
    end if;
  else
    -- Mã QR (nếu có, đúng định dạng + đúng tiệm + đang bật) → gán nguồn của mã.
    if p_qr ~ '^[a-z0-9]{8,16}$' then
      select q.source_id into v_source
        from public.qr_codes q
        where q.code = p_qr and q.tenant_id = p_tenant and q.is_active;
    end if;
    if v_source is null then
      select id into v_source from public.lead_sources
        where tenant_id = p_tenant and name = 'Form/Landing';
    end if;

    insert into public.contacts (tenant_id, full_name, phone, phone_e164, source_id, custom)
      values (p_tenant, p_name, p_phone_raw, p_e164, v_source, p_custom)
      returning * into v_contact;

    select m.user_id into v_owner from public.tenant_members m
      where m.tenant_id = p_tenant and m.role = 'owner' and m.status = 'active'
      order by m.created_at limit 1;
    if v_owner is not null then
      insert into public.activities
          (tenant_id, type, subject, contact_id, owner_id, due_at)
        values (p_tenant, 'task', 'Khách mới để lại thông tin qua form mặt tiền',
                v_contact.id, v_owner, v_now);
    end if;
  end if;

  return jsonb_build_object('contact_id', v_contact.id, 'matched', v_matched);
end $$;

-- ── storefront_submit_lead: chép nguyên bản #209, thay hai chỗ:
--    ① nhánh 5/IP: 'raise rate_limited' → đặt cờ giữ chờ (v_hold)
--    ② thân "gộp/tạo contact" dài → gọi private.storefront_materialize_lead
--    và, khi v_hold, ghi vào storefront_lead_holds thay vì tạo contact. ──
drop function if exists public.storefront_submit_lead(text, text, text, text, text, jsonb, text);

create function public.storefront_submit_lead(
  p_slug text,
  p_token_hash text,
  p_ip_hash text,
  p_full_name text,
  p_phone text,
  p_fields jsonb default '{}'::jsonb,
  p_qr_code text default null
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
  v_held_pending int;
  v_dup uuid;
  v_catalog jsonb;
  v_custom jsonb := '{}'::jsonb;
  v_key text;
  v_val text;
  v_field jsonb;
  v_res jsonb;
  v_hold boolean := false;
  v_qr text := lower(btrim(coalesce(p_qr_code, '')));
begin
  if v_tenant.id is null then raise exception 'not_found'; end if;

  select * into v_sf from public.tenant_storefront where tenant_id = v_tenant.id;
  if v_sf.tenant_id is null or not v_sf.storefront_enabled or not v_sf.lead_form_enabled then
    raise exception 'form_disabled';
  end if;

  -- Gửi lại trong 10 phút CÙNG THIẾT BỊ → "vừa gửi rồi", không ghi thêm.
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
  if v_phone !~ '^0\d{9,10}$' then raise exception 'invalid_phone'; end if;
  v_e164 := '+84' || substring(v_phone from 2);

  -- ① Chống lụt theo IP — 5 lượt/giờ mỗi (tiệm, IP). QUÁ TAY → GIỮ CHỜ DUYỆT
  --    (không còn đuổi khách). Đây là nhánh CGNAT: một IP nhiều người thật.
  if p_ip_hash is not null then
    select count(*) into v_recent
      from public.storefront_lead_submissions
      where tenant_id = v_tenant.id and ip_hash = p_ip_hash
        and created_at > v_now - interval '1 hour';
    if v_recent >= 5 then v_hold := true; end if;
  end if;

  -- Chốt theo TIỆM — 60 lượt/giờ, KHÔNG phụ thuộc IP/cookie. Vượt là lũ thật,
  -- quá sức người soát → vẫn TỪ CHỐI CỨNG. Tính cả lead đã giữ (mỗi lead giữ có
  -- một dòng băm trong bảng này) nên hàng chờ không lách được trần tiệm.
  select count(*) into v_recent
    from public.storefront_lead_submissions
    where tenant_id = v_tenant.id
      and created_at > v_now - interval '1 hour';
  if v_recent >= 60 then raise exception 'rate_limited'; end if;

  -- Lọc câu trả lời "Hỏi thêm" — chỉ nhận field đã bật + đúng key/lựa chọn.
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

  -- ── Nhánh GIỮ CHỜ DUYỆT ──
  if v_hold then
    -- Trần hàng chờ: quá 100 lead đang chờ thì từ chối cứng (hàng chờ ngập thì
    -- vô dụng, và đó là dấu hiệu lũ chứ không phải khách thật).
    select count(*) into v_held_pending
      from public.storefront_lead_holds
      where tenant_id = v_tenant.id and status = 'held';
    if v_held_pending >= 100 then raise exception 'rate_limited'; end if;

    insert into public.storefront_lead_holds (tenant_id, payload, hold_reason)
      values (
        v_tenant.id,
        jsonb_build_object('name', v_name, 'phone', v_phone, 'e164', v_e164,
                           'custom', v_custom, 'qr', v_qr),
        'ip_flood'
      );
    -- Dòng băm để phép đếm chống-lũ (5/IP · 60/tiệm) tính đủ cả lead bị giữ.
    insert into public.storefront_lead_submissions
        (tenant_id, token_hash, ip_hash, contact_id, matched_existing)
      values (v_tenant.id, p_token_hash, p_ip_hash, null, false);
    -- Với khách: y hệt "đã nhận". Họ không cần biết đang chờ tiệm soát.
    return jsonb_build_object('duplicate', false, 'held', true);
  end if;

  -- ── Nhánh NHẬN THẲNG (dùng chung logic với lúc duyệt) ──
  v_res := private.storefront_materialize_lead(v_tenant.id, v_name, v_phone, v_e164, v_custom, v_qr);

  insert into public.storefront_lead_submissions
      (tenant_id, token_hash, ip_hash, contact_id, matched_existing)
    values (v_tenant.id, p_token_hash, p_ip_hash,
            (v_res ->> 'contact_id')::uuid, (v_res ->> 'matched')::boolean);

  return jsonb_build_object('duplicate', false, 'matched_existing', (v_res ->> 'matched')::boolean);
end $$;
revoke execute on function public.storefront_submit_lead(text, text, text, text, text, jsonb, text)
  from public;
grant execute on function public.storefront_submit_lead(text, text, text, text, text, jsonb, text)
  to anon, authenticated;

comment on function public.storefront_submit_lead(text, text, text, text, text, jsonb, text) is
  'Form nhận khách mặt tiền. Trùng 10 phút theo cookie · 5/giờ mỗi (tiệm,IP) QUÁ TAY thì GIỮ CHỜ DUYỆT (không đuổi) · 60/giờ mỗi TIỆM thì từ chối cứng · trần 100 lead đang chờ. Lead giữ vào storefront_lead_holds (#240).';

-- ── RPC màn duyệt: liệt kê lead đang chờ (chủ/quản trị/quản lý) ──
create or replace function public.held_leads_list()
returns table (
  id uuid,
  full_name text,
  phone text,
  custom jsonb,
  hold_reason text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role text := (select public.app_role());
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;
  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'forbidden';
  end if;
  return query
    select h.id,
           h.payload ->> 'name',
           h.payload ->> 'phone',
           coalesce(h.payload -> 'custom', '{}'::jsonb),
           h.hold_reason,
           h.created_at
      from public.storefront_lead_holds h
      where h.tenant_id = v_tenant and h.status = 'held'
      order by h.created_at desc
      limit 200;
end $$;
revoke execute on function public.held_leads_list() from public, anon;
grant execute on function public.held_leads_list() to authenticated;

-- ── Duyệt NHẬN: hoá thân lead thành contact, xoá PII trong payload ──
create or replace function public.held_lead_approve(p_id uuid)
returns uuid
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role text := (select public.app_role());
  v_h public.storefront_lead_holds%rowtype;
  v_res jsonb;
  v_contact uuid;
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;
  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'forbidden';
  end if;

  -- Khoá dòng để hai người duyệt cùng lúc không nhận đôi.
  select * into v_h from public.storefront_lead_holds
    where id = p_id and tenant_id = v_tenant
    for update;
  if v_h.id is null then raise exception 'not_found'; end if;
  if v_h.status <> 'held' then raise exception 'already_decided'; end if;

  v_res := private.storefront_materialize_lead(
    v_tenant,
    v_h.payload ->> 'name',
    v_h.payload ->> 'phone',
    v_h.payload ->> 'e164',
    coalesce(v_h.payload -> 'custom', '{}'::jsonb),
    coalesce(v_h.payload ->> 'qr', '')
  );
  v_contact := (v_res ->> 'contact_id')::uuid;

  update public.storefront_lead_holds
    set status = 'approved',
        contact_id = v_contact,
        decided_by = auth.uid(),
        decided_at = now(),
        payload = '{}'::jsonb          -- xoá PII sau khi đã hoá thân
    where id = p_id;

  return v_contact;
end $$;
revoke execute on function public.held_lead_approve(uuid) from public, anon;
grant execute on function public.held_lead_approve(uuid) to authenticated;

-- ── Duyệt BỎ: đánh dấu bỏ, xoá PII ──
create or replace function public.held_lead_reject(p_id uuid)
returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role text := (select public.app_role());
  v_h public.storefront_lead_holds%rowtype;
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;
  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'forbidden';
  end if;

  select * into v_h from public.storefront_lead_holds
    where id = p_id and tenant_id = v_tenant
    for update;
  if v_h.id is null then raise exception 'not_found'; end if;
  if v_h.status <> 'held' then raise exception 'already_decided'; end if;

  update public.storefront_lead_holds
    set status = 'rejected',
        decided_by = auth.uid(),
        decided_at = now(),
        payload = '{}'::jsonb
    where id = p_id;
end $$;
revoke execute on function public.held_lead_reject(uuid) from public, anon;
grant execute on function public.held_lead_reject(uuid) to authenticated;
