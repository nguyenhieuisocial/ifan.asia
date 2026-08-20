-- #225 lát 2 (NỀN) — nhận mặt tự động, MIỄN PHÍ, chạy trên điện thoại.
--
-- Kiến trúc giữ RIÊNG TƯ: điện thoại tính "dấu mặt" (embedding 128 số, bằng
-- face-api.js chạy ngay trên máy — không tốn phí) rồi CHỈ gửi dãy số lên. Bản
-- gốc của người được chấm KHÔNG BAO GIỜ rời máy chủ; việc SO KHỚP làm trong CSDL
-- bằng hàm SECURITY DEFINER, không phơi embedding ra client.
--
-- Lát này chỉ dựng NỀN: bảng embedding gốc + hàm nạp mặt + kiểm đã-nạp-chưa +
-- nâng cham_cong_giup để nhận & chấm điểm khớp. Phần điện thoại tính embedding
-- (face-api.js) làm ở lát UI sau.

-- ── Embedding mặt gốc mỗi nhân viên ─────────────────────────────────────────
create table if not exists public.employee_face (
  -- Không FK sang employees/tenants: cả hai đều NÓNG, tạo FK dính lock 55P03
  -- (đo thật, thử 90s×3 vẫn timeout). An toàn dữ liệu vẫn đủ: nap_mat + so khớp
  -- đều tự kiểm employee CÓ THẬT và ĐÚNG tiệm đang mở trước khi đọc/ghi, nên
  -- không có đường ghi bậy. Rủi ro DUY NHẤT: xoá cứng tiệm để lại dòng mồ côi —
  -- nhưng dòng đó không bao giờ đọc được (không còn employee active khớp) và
  -- không lộ ra ngoài. Dọn mồ côi để ở task #225 (vệ sinh dữ liệu sinh trắc).
  employee_id uuid primary key,
  tenant_id uuid not null,
  -- 128 số thực (chuẩn face-api.js). Đây là DỮ LIỆU SINH TRẮC HỌC.
  descriptor double precision[] not null check (array_length(descriptor, 1) = 128),
  enrolled_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.employee_face enable row level security;
-- CỐ Ý KHÔNG có policy nào: client KHÔNG đọc/ghi thẳng embedding (sinh trắc học).
-- Mọi thao tác đi qua hàm definer dưới đây — đọc để so khớp, ghi để nạp mặt,
-- kiểm tồn tại; không đường nào trả embedding gốc về trình duyệt.

-- ── Đã nạp mặt chưa? (cho UI, KHÔNG trả embedding) ──────────────────────────
create or replace function public.face_da_nap(p_employee_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists(
    select 1 from public.employee_face f
    join public.employees e on e.id = f.employee_id
    where f.employee_id = p_employee_id
      and e.tenant_id = public.current_tenant_id()
  );
$$;
revoke all on function public.face_da_nap(uuid) from public;
grant execute on function public.face_da_nap(uuid) to authenticated;

-- ── Nạp mặt gốc ─────────────────────────────────────────────────────────────
-- Được nạp cho CHÍNH MÌNH (employee gắn tài khoản mình), HOẶC owner/admin nạp
-- cho người trong tiệm. Không ai nạp mặt người tiệm khác.
create or replace function public.nap_mat(p_employee_id uuid, p_descriptor double precision[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_uid uuid := auth.uid();
  v_ok boolean;
begin
  if v_tenant is null or v_uid is null then raise exception 'forbidden'; end if;
  if p_descriptor is null or array_length(p_descriptor, 1) <> 128 then
    raise exception 'invalid_input';
  end if;
  -- employee phải thuộc tiệm đang mở; và (là mình) hoặc (mình là owner/admin).
  select (
    e.tenant_id = v_tenant
    and (e.user_id = v_uid or public.app_role() in ('owner', 'admin'))
  ) into v_ok
  from public.employees e where e.id = p_employee_id;
  if not coalesce(v_ok, false) then raise exception 'forbidden'; end if;

  insert into public.employee_face (employee_id, tenant_id, descriptor, enrolled_by, updated_at)
  values (p_employee_id, v_tenant, p_descriptor, v_uid, now())
  on conflict (employee_id) do update
    set descriptor = excluded.descriptor, enrolled_by = excluded.enrolled_by, updated_at = now();
end;
$$;
revoke all on function public.nap_mat(uuid, double precision[]) from public;
grant execute on function public.nap_mat(uuid, double precision[]) to authenticated;

-- ── Nâng cham_cong_giup: nhận thêm dấu mặt + chấm điểm khớp ──────────────────
-- Thêm tham số nên phải bỏ bản 6-tham-số rồi tạo bản 7-tham-số. Logic bốn lớp
-- chống gian lận GIỮ NGUYÊN; chỉ thêm: nếu có dấu mặt và người được chấm đã nạp
-- mặt gốc → tính khoảng cách Euclid → quy về điểm 0..1 (1 = trùng khít) → ghi
-- vào face_match_score. Không khớp KHÔNG chặn (đã luôn gắn cờ) — chỉ ghi điểm
-- cho quản lý soát. So khớp ở đây, embedding gốc không rời máy chủ.
drop function if exists public.cham_cong_giup(uuid, text, text, text, numeric, numeric);
create or replace function public.cham_cong_giup(
  p_employee_id uuid,
  p_kind text,
  p_selfie_path text,
  p_selfie_content_type text,
  p_lat numeric,
  p_lng numeric,
  p_face_descriptor double precision[] default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_uid uuid := auth.uid();
  v_helper_ten text;
  v_ok boolean;
  v_punch_id uuid;
  v_ref double precision[];
  v_dist double precision;
  v_score numeric := null;
begin
  if v_tenant is null or v_uid is null then raise exception 'forbidden'; end if;
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = v_tenant and user_id = v_uid and status = 'active'
  ) then raise exception 'forbidden'; end if;
  if p_kind not in ('in', 'out') then raise exception 'invalid_input'; end if;
  if p_selfie_path is null or length(trim(p_selfie_path)) = 0 then
    raise exception 'selfie_required';
  end if;
  if p_selfie_path not like (v_tenant::text || '/%') then raise exception 'invalid_input'; end if;
  select true into v_ok from public.employees
    where id = p_employee_id and tenant_id = v_tenant and ended_on is null;
  if not coalesce(v_ok, false) then raise exception 'invalid_input'; end if;

  select coalesce(nullif(trim(display_name), ''), 'người khác') into v_helper_ten
    from public.profiles where user_id = v_uid;

  -- So khớp mặt (nếu có dấu mặt gửi lên VÀ người được chấm đã nạp mặt gốc).
  if p_face_descriptor is not null and array_length(p_face_descriptor, 1) = 128 then
    select descriptor into v_ref from public.employee_face where employee_id = p_employee_id;
    if v_ref is not null then
      select sqrt(sum((a - b) * (a - b))) into v_dist
        from unnest(p_face_descriptor, v_ref) as u(a, b);
      -- face-api.js: khoảng cách < 0.6 coi là cùng người. Quy về điểm tin cậy
      -- 0..1: trùng khít → 1, càng xa càng thấp, ≥1 → 0.
      v_score := greatest(0, least(1, round((1 - v_dist)::numeric, 3)));
    end if;
  end if;

  insert into public.attendance_punches
    (tenant_id, employee_id, kind, lat, lng, distance_m, reason,
     selfie_path, selfie_content_type, selfie_captured_at)
  values
    (v_tenant, p_employee_id, p_kind, p_lat, p_lng, null,
     'Chấm giúp bởi ' || v_helper_ten,
     p_selfie_path, p_selfie_content_type, now())
  returning id into v_punch_id;

  insert into public.attendance_proxy_punches (punch_id, tenant_id, helper_user_id, face_match_score)
  values (v_punch_id, v_tenant, v_uid, v_score);

  return v_punch_id;
end;
$$;
revoke all on function public.cham_cong_giup(uuid, text, text, text, numeric, numeric, double precision[]) from public;
grant execute on function public.cham_cong_giup(uuid, text, text, text, numeric, numeric, double precision[]) to authenticated;

comment on function public.cham_cong_giup(uuid, text, text, text, numeric, numeric, double precision[]) is
  '#225 — chấm công giúp + [lát 2] chấm điểm khớp mặt server-side (embedding gốc không rời máy chủ). Bốn lớp chống gian lận giữ nguyên.';
