-- ════════════════════════════════════════════════════════════════════
-- KHÔNG AI ĐƯỢC NẠP KHUÔN MẶT NGƯỜI KHÁC KHI HỌ CHƯA TỰ ĐỒNG Ý
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠️ ĐÂY LÀ VIỆC TRẢ LẠI ĐÚNG MỘT QUYẾT ĐỊNH ĐÃ CHỐT, KHÔNG PHẢI QUYẾT ĐỊNH MỚI.
--   ADR-0028 (20/08) ghi rõ về phần nhận diện khuôn mặt:
--     · "cần founder quyết TRƯỚC DÒNG CODE ĐẦU"
--     · "tách ADR riêng, không gộp đợt này"
--     · "đồng ý sinh trắc RIÊNG, tách bạch, có quyền rút"
--   Soát 22/08: phần này ĐÃ ĐƯỢC CODE (migration #235–#237) mà KHÔNG có ADR
--   riêng, KHÔNG có dấu vết founder duyệt, và KHÔNG có bất kỳ phiếu đồng ý nào.
--
-- ⚠️ LỖ CỤ THỂ, đo được: hàm `nap_mat` là `security definer` nên bỏ qua mọi lớp
--   bảo vệ hàng, và nó cho phép `owner`/`admin` nạp khuôn mặt của BẤT KỲ nhân
--   viên nào — người bị lấy dữ liệu không cần làm gì, không biết gì.
--
--   Đây CÙNG MỘT HỌ với lỗi đã chặn sáng nay ở sổ bàn giao tài sản: "quản lý tự
--   tick hộ thì cả cơ chế xác nhận mất nghĩa". Khác ở chỗ: bàn giao tài sản sai
--   thì mất một cái máy; sinh trắc sai thì là dữ liệu nhạy cảm theo luật, và
--   người bị lấy KHÔNG lấy lại được khuôn mặt của mình.
--
-- ⚠️ HIỆN CHƯA AI BỊ ẢNH HƯỞNG: đo 22/08 có 0 bản ghi khuôn mặt, và yêu cầu chụp
--   ảnh đang TẮT ở cả 6 tiệm. Vá lúc này là vá trước khi có nạn nhân — đúng lúc
--   duy nhất vá được mà không phải đi xin lỗi ai.
--
-- ⚠️ BẢN VÁ NÀY KHÔNG QUYẾT THAY FOUNDER chuyện CÓ LÀM nhận diện khuôn mặt hay
--   không. Nó chỉ làm cho câu trả lời nào cũng an toàn: chưa đồng ý thì không
--   thu được gì. Founder vẫn phải chốt, và nếu chốt BỎ thì gỡ cả cụm.

-- ── 1. PHIẾU ĐỒNG Ý — người lao động TỰ ký, không ai ký hộ ───────────
create table if not exists public.employee_biometric_consent (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  dong_y_luc  timestamptz,
  rut_luc     timestamptz,
  -- Lưu BẢN SAO đoạn chữ người đó đã đọc lúc ký. Đổi lời văn sau này KHÔNG được
  -- làm đổi ý nghĩa của chữ ký cũ — đó là lý do lưu bản sao chứ không lưu con trỏ.
  van_ban_da_doc text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Chốt chéo tiệm bằng khoá ngoại GHÉP — cùng khuôn #359 sáng nay. Bảng con có
-- tenant_id trỏ sang bảng cha có tenant_id là phải có chốt, không có ngoại lệ.
-- ⚠️ CHỈ THÊM KHI CHƯA CÓ — tuyệt đối không `drop ... then add`.
--   Ràng buộc này đã tồn tại từ #321, và `appointments_tho_cung_tiem` đang dựa
--   vào chỉ mục của nó. Xoá đi là kéo theo cả chốt chéo tiệm của bảng lịch hẹn.
--   Đã dính thật lúc áp bản này lần đầu (mã lỗi 2BP01) — may là cơ sở dữ liệu
--   chặn, chứ khuôn `drop-rồi-add` ở #359 sáng nay chạy lọt chỉ vì các bảng cha
--   hôm đó chưa có ai phụ thuộc.
do $chot$
begin
  if not exists (
    select 1 from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and cl.relname = 'employees'
      and con.conname = 'employees_id_tenant_uniq'
  ) then
    alter table public.employees
      add constraint employees_id_tenant_uniq unique (id, tenant_id);
  end if;
end
$chot$;

alter table public.employee_biometric_consent
  drop constraint if exists employee_biometric_consent_employee_id_fkey;
alter table public.employee_biometric_consent
  drop constraint if exists employee_biometric_consent_employee_cung_tiem;
alter table public.employee_biometric_consent
  add constraint employee_biometric_consent_employee_cung_tiem
  foreign key (employee_id, tenant_id)
  references public.employees (id, tenant_id) on delete cascade;

alter table public.employee_biometric_consent enable row level security;

-- ĐỌC: chính người đó, và quản lý trở lên (để biết ai đã ký, phục vụ vận hành).
drop policy if exists ebc_doc on public.employee_biometric_consent;
create policy ebc_doc on public.employee_biometric_consent
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      exists (select 1 from public.employees e
               where e.id = employee_id and e.user_id = auth.uid())
      or public.app_role() in ('owner', 'admin', 'manager')
    )
  );

-- GHI: CHỈ chính người đó. Cố ý KHÔNG có ngoại lệ cho chủ tiệm — chữ ký ký hộ
-- được thì không còn là chữ ký. Cùng luật với `asset_assignments_tu_xac_nhan`.
drop policy if exists ebc_tu_ky on public.employee_biometric_consent;
create policy ebc_tu_ky on public.employee_biometric_consent
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.employees e
                 where e.id = employee_id and e.user_id = auth.uid())
  );

drop policy if exists ebc_tu_sua on public.employee_biometric_consent;
create policy ebc_tu_sua on public.employee_biometric_consent
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.employees e
                 where e.id = employee_id and e.user_id = auth.uid())
  );

comment on table public.employee_biometric_consent is
  'Phiếu đồng ý cho phép lưu dữ liệu khuôn mặt. CHỈ chính người lao động ký được — không ai ký hộ. Rút lại thì dữ liệu khuôn mặt bị xoá ngay (trigger). ADR-0028 + NĐ 13: dữ liệu sinh trắc là dữ liệu nhạy cảm.';

-- ── 2. RÚT LẠI LÀ XOÁ THẬT, ngay lập tức ─────────────────────────────
-- "Có quyền rút" mà dữ liệu vẫn nằm đó thì quyền rút chỉ là chữ trên giấy.
create or replace function public.rut_dong_y_sinh_trac_thi_xoa_mat()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $ham$
begin
  if new.rut_luc is not null and old.rut_luc is null then
    delete from public.employee_face where employee_id = new.employee_id;
  end if;
  new.updated_at := now();
  return new;
end;
$ham$;

drop trigger if exists ebc_rut_thi_xoa on public.employee_biometric_consent;
create trigger ebc_rut_thi_xoa
  before update on public.employee_biometric_consent
  for each row execute function public.rut_dong_y_sinh_trac_thi_xoa_mat();

-- ── 3. CHỐT Ở ĐÚNG CỬA DUY NHẤT NẠP ĐƯỢC KHUÔN MẶT ───────────────────
-- `nap_mat` là `security definer` nên nó là cửa DUY NHẤT — chốt ở đây là chốt hết.
create or replace function public.nap_mat(
  p_employee_id uuid,
  p_descriptor real[],
  p_photo_path text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $ham$
declare
  v_tenant uuid := public.current_tenant_id();
  v_uid uuid := auth.uid();
  v_ok boolean;
begin
  if v_tenant is null or v_uid is null then raise exception 'forbidden'; end if;

  -- ⚠️ CHỐT SINH TRẮC — đặt TRƯỚC mọi phép kiểm khác, cố ý.
  --   Không có phiếu đồng ý CÒN HIỆU LỰC của chính người đó thì dừng ngay, kể
  --   cả khi người bấm là chủ tiệm. Xem đầu migration #362 để biết vì sao.
  if not exists (
    select 1 from public.employee_biometric_consent
     where employee_id = p_employee_id
       and tenant_id = v_tenant
       and dong_y_luc is not null
       and rut_luc is null
  ) then
    raise exception 'chua_dong_y_sinh_trac' using errcode = '42501';
  end if;

  if p_descriptor is null or array_length(p_descriptor, 1) <> 128 then
    raise exception 'invalid_input';
  end if;
  -- Ảnh (nếu có) phải nằm trong thư mục của ĐÚNG tiệm — chống mượn đường dẫn.
  if p_photo_path is not null and p_photo_path not like (v_tenant::text || '/%') then
    raise exception 'invalid_input';
  end if;
  select (
    e.tenant_id = v_tenant
    and (e.user_id = v_uid or public.app_role() in ('owner', 'admin'))
  ) into v_ok
  from public.employees e where e.id = p_employee_id;
  if not coalesce(v_ok, false) then raise exception 'forbidden'; end if;

  insert into public.employee_face (employee_id, tenant_id, descriptor, photo_path, enrolled_by, updated_at)
  values (p_employee_id, v_tenant, p_descriptor, p_photo_path, v_uid, now())
  on conflict (employee_id) do update
    set descriptor = excluded.descriptor,
        photo_path = excluded.photo_path,
        enrolled_by = excluded.enrolled_by,
        updated_at = now();
end;
$ham$;

comment on function public.nap_mat(uuid, real[], text) is
  'Nạp dữ liệu khuôn mặt. CHẶN nếu người đó chưa tự ký phiếu đồng ý sinh trắc còn hiệu lực — kể cả khi người bấm là chủ tiệm (#362, ADR-0028).';
