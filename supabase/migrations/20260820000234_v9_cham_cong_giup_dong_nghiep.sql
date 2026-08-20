-- #225 lát 1 — NỀN cho "chấm công giúp đồng nghiệp khi điện thoại hỏng".
--
-- Founder chốt (20/08): BẤT KỲ đồng nghiệp nào chấm giúp nhau được. Chống gian
-- lận "chấm hộ" bằng bốn lớp: (1) bắt buộc ảnh mặt người được chấm, (2) máy so
-- mặt [lát 2], (3) ghi rõ ai bấm cho ai, (4) LUÔN gắn cờ cho quản lý xem lại.
--
-- Nguyên tắc thiết kế QUYỀN:
--  · KHÔNG nới `attendance_self_insert` (chèn thẳng vẫn chỉ cho chính mình) —
--    giữ hàng rào chặt nhất ở chỗ dễ lạm dụng nhất.
--  · Mở proxy qua MỘT hàm SECURITY DEFINER `cham_cong_giup()` tự enforce đủ chốt
--    bên trong (cùng khuôn discount_request/bookable_staff). Definer bỏ qua RLS
--    của bảng chấm, nhưng hàm tự kiểm — phòng thủ nhiều lớp, không mở toang.
--  · KHÔNG ALTER `attendance_punches` (bảng NÓNG, ALTER dính lock 55P03). Ghi
--    "ai giúp ai" vào bảng PHỤ mới — bảng mới không có traffic nên áp sạch.

-- ── Bảng phụ: mỗi dòng = một lần chấm giúp ──────────────────────────────────
create table if not exists public.attendance_proxy_punches (
  punch_id uuid primary key references public.attendance_punches(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Người BẤM (đồng nghiệp giúp). Không FK sang auth.users để tránh phụ thuộc
  -- schema auth; đối chiếu qua profiles khi cần tên.
  helper_user_id uuid not null,
  -- Lát 2: điểm khớp mặt (0..1). Null ở lát 1 (chưa có nhận mặt tự động).
  face_match_score numeric(4,3) check (face_match_score is null or (face_match_score >= 0 and face_match_score <= 1)),
  created_at timestamptz not null default now()
);
create index if not exists attendance_proxy_helper_idx
  on public.attendance_proxy_punches (tenant_id, helper_user_id);

alter table public.attendance_proxy_punches enable row level security;

-- Đọc: chủ/quản trị/quản lý xem hết; nhân viên xem lần chấm giúp LIÊN QUAN mình
-- (mình giúp người khác, hoặc mình được người khác giúp). KHÔNG có policy
-- insert/update/delete ⇒ chỉ hàm definer dưới đây ghi được.
create policy attendance_proxy_select on public.attendance_proxy_punches
  for select using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.app_role()) in ('owner', 'admin', 'manager')
         or helper_user_id = (select auth.uid())
         or punch_id in (
           select id from public.attendance_punches
           where employee_id in (select id from public.employees where user_id = (select auth.uid()))
         ))
  );

-- ── Hàm chấm giúp ───────────────────────────────────────────────────────────
create or replace function public.cham_cong_giup(
  p_employee_id uuid,
  p_kind text,
  p_selfie_path text,
  p_selfie_content_type text,
  p_lat numeric,
  p_lng numeric
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
begin
  if v_tenant is null or v_uid is null then
    raise exception 'forbidden';
  end if;
  -- Người bấm phải là thành viên ĐANG hoạt động của tiệm đang mở.
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = v_tenant and user_id = v_uid and status = 'active'
  ) then
    raise exception 'forbidden';
  end if;
  if p_kind not in ('in', 'out') then
    raise exception 'invalid_input';
  end if;
  -- (1) BẮT BUỘC ảnh mặt — bằng chứng người được chấm có mặt. Không có ảnh thì
  -- chấm giúp thành cửa gian lận trống trơn.
  if p_selfie_path is null or length(trim(p_selfie_path)) = 0 then
    raise exception 'selfie_required';
  end if;
  -- Ảnh phải nằm trong thư mục của ĐÚNG tiệm (chống mượn đường dẫn tiệm khác).
  if p_selfie_path not like (v_tenant::text || '/%') then
    raise exception 'invalid_input';
  end if;
  -- Người được chấm phải là nhân viên CÒN LÀM của CHÍNH tiệm này (chống gán
  -- sang người/tiệm khác — FK employees bỏ qua RLS nên phải tự kiểm ở đây).
  select true into v_ok from public.employees
    where id = p_employee_id and tenant_id = v_tenant and ended_on is null;
  if not coalesce(v_ok, false) then
    raise exception 'invalid_input';
  end if;

  -- Tên người bấm để ghi vào lý do — đồng nghiệp cùng tiệm đọc được profiles (#9).
  select coalesce(nullif(trim(display_name), ''), 'người khác') into v_helper_ten
    from public.profiles where user_id = v_uid;

  -- (4) LUÔN gắn cờ: distance_m = null ⇒ trigger attendance_set_flag đặt
  -- out_of_range = true. Ràng buộc "ngoài vùng phải có lý do" được thoả bằng
  -- dòng "Chấm giúp bởi …" — dòng này cũng chính là thứ quản lý thấy trong lịch
  -- sử. Vẫn ghi lat/lng của máy người bấm để đối chiếu, chỉ KHÔNG dùng để bỏ cờ.
  insert into public.attendance_punches
    (tenant_id, employee_id, kind, lat, lng, distance_m, reason,
     selfie_path, selfie_content_type, selfie_captured_at)
  values
    (v_tenant, p_employee_id, p_kind, p_lat, p_lng, null,
     'Chấm giúp bởi ' || v_helper_ten,
     p_selfie_path, p_selfie_content_type, now())
  returning id into v_punch_id;

  -- (3) Ghi rõ ai bấm cho ai.
  insert into public.attendance_proxy_punches (punch_id, tenant_id, helper_user_id)
  values (v_punch_id, v_tenant, v_uid);

  return v_punch_id;
end;
$$;

revoke all on function public.cham_cong_giup(uuid, text, text, text, numeric, numeric) from public;
grant execute on function public.cham_cong_giup(uuid, text, text, text, numeric, numeric) to authenticated;

comment on function public.cham_cong_giup(uuid, text, text, text, numeric, numeric) is
  '#225 — chấm công giúp đồng nghiệp. Bốn lớp chống gian lận: bắt buộc ảnh mặt, luôn gắn cờ, ghi người bấm, [lát 2] so mặt. Người bấm phải là thành viên tiệm; người được chấm phải là nhân viên còn làm cùng tiệm.';
