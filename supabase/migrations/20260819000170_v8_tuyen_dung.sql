-- V8 recruitment (19/08/2026) — Tuyển dụng: tin tuyển · ứng viên · phỏng vấn ·
-- ghi chú phỏng vấn · nhận việc.
-- Thẻ design: design-system/man-tuyen-dung.html (5 quyết định đã chốt).
--
-- ════════════════════════════════════════════════════════════════════
-- BỐN ĐIỂM PHẢI CHỐT TRƯỚC, ghi lại để người sau không mở lại
-- ════════════════════════════════════════════════════════════════════
--
-- (1) CỜ ĐỎ "QUÁ 3 NGÀY CHƯA GHI KẾT QUẢ" LÀ DẪN XUẤT, KHÔNG PHẢI CỘT.
--     Lưu thành cột trạng thái nghĩa là phải có ai đó cập nhật nó — cron, trigger,
--     hay một job. Cái gì cập nhật được thì cũng quên cập nhật được, và lúc đó cờ
--     nói dối: hồ sơ đã quá hạn 9 ngày mà bảng vẫn xanh. Mốc `scheduled_at` +
--     `result_at` đã đủ để tính lúc đọc, nên cột kia chỉ là một sự thật thứ hai
--     chờ lệch. View `interviews_qua_han_ghi_ket_qua` bên dưới là chỗ tính.
--
-- (2) GHI CHÚ PHỎNG VẤN KHÔNG THEO QUY ƯỚC `owner/admin` CỦA CẢ KHO.
--     Gần hết bảng trong kho này cho `owner` và `admin` đi cặp. Ở đây KHÔNG.
--     Thẻ design viết đích danh: "chỉ người phỏng vấn và chủ tiệm xem được".
--     Đây là nhận xét về MỘT CON NGƯỜI, không phải dữ liệu vận hành — quản trị
--     viên là vai kỹ thuật (cấu hình, phân quyền), không có lý do nghiệp vụ nào
--     để đọc đánh giá cá nhân về ứng viên. Copy-paste thói quen `in ('owner',
--     'admin')` vào đây là làm rò một loại dữ liệu khác hẳn về bản chất.
--
-- (3) `candidate_hire` KHÔNG NHẬN THAM SỐ VAI. Xem chú thích tại chỗ khai hàm.
--
-- (4) HẠN GIỮ HỒ SƠ 12 THÁNG KHÔNG CÓ CRON, KHÔNG CÓ TRIGGER TỰ XOÁ — và
--     SỰ VẮNG MẶT ĐÓ CHÍNH LÀ RÀNG BUỘC. Xem mục 6 ở cuối file.

-- ════════════════════════════════════════════════════════════════════
-- 1. TIN TUYỂN
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.job_openings (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  title      text not null check (length(trim(title)) between 1 and 160),
  headcount  smallint not null default 1 check (headcount > 0),
  opened_on  date not null default current_date,
  status     text not null default 'open' check (status in ('open', 'closed')),
  note       text check (note is null or length(note) <= 500),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_openings_tenant_idx
  on public.job_openings (tenant_id, status, opened_on desc);

drop trigger if exists job_openings_touch on public.job_openings;
create trigger job_openings_touch before update on public.job_openings
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 2. ỨNG VIÊN — bảng 4 cột, đúng một dòng chảy
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.candidates (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  -- Gỡ một tin tuyển KHÔNG được kéo theo hồ sơ ứng viên (quyết định 4: hồ sơ
  -- không mất đi). `set null` chứ không `cascade`.
  job_opening_id uuid references public.job_openings(id) on delete set null,

  full_name  text not null check (length(trim(full_name)) between 1 and 120),
  phone      text,
  -- Thẻ không vẽ ô email, nhưng `invitations.email` là `not null` ⇒ không có
  -- email thì bước "Nhận việc" không gửi được lời mời vào phần mềm. Để nullable
  -- (ứng viên nộp qua điện thoại vẫn phải vào được bảng), và `candidate_hire`
  -- từ chối rõ ràng khi thiếu, thay vì hỏng ở giữa transaction.
  email      citext,
  dob        date,
  experience_years numeric(4,1) check (experience_years >= 0),
  -- Thẻ hiện "Mong muốn 9–11 triệu" — đó là một KHOẢNG, không phải một số.
  -- Ép về một số thì hoặc mất đầu trên, hoặc mỗi người quy ước một kiểu.
  expected_salary_min_vnd bigint check (expected_salary_min_vnd >= 0),
  expected_salary_max_vnd bigint check (expected_salary_max_vnd >= 0),
  available_from date,
  source     text check (source is null or length(source) <= 120),
  applied_on date not null default current_date,

  -- ĐÚNG BỐN GIÁ TRỊ, khớp 4 cột của bảng (quyết định 1: một dòng chảy, không
  -- nhánh phụ). `not null` + `check` để không tồn tại hồ sơ nằm ngoài bảng —
  -- hồ sơ không thuộc cột nào là hồ sơ không ai nhìn thấy.
  stage      text not null default 'applied'
             check (stage in ('applied', 'interview_scheduled', 'probation', 'hired')),
  -- Mốc để đo hạn giữ 12 tháng (mục 6). null = chưa bị loại.
  rejected_at timestamptz,
  reject_reason text check (reject_reason is null or length(reject_reason) <= 300),

  note       text check (note is null or length(note) <= 1000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint candidates_khoang_luong_hop_le check (
    expected_salary_min_vnd is null or expected_salary_max_vnd is null
    or expected_salary_max_vnd >= expected_salary_min_vnd
  )
);
create index if not exists candidates_bang_idx
  on public.candidates (tenant_id, job_opening_id, stage, applied_on desc);
-- Hồ sơ bị loại quá hạn giữ — đọc bằng chỉ mục này, không quét cả bảng (mục 6).
create index if not exists candidates_da_loai_idx
  on public.candidates (tenant_id, rejected_at) where rejected_at is not null;

drop trigger if exists candidates_touch on public.candidates;
create trigger candidates_touch before update on public.candidates
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 3. PHỎNG VẤN — cột chết chìm nhiều hồ sơ nhất
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.interviews (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  scheduled_at timestamptz not null,
  interviewer_user_id uuid references auth.users(id) on delete set null,

  -- Kết quả NULLABLE là chủ đích: khoảng trống giữa "đã hẹn" và "đã ghi kết quả"
  -- chính là thứ quyết định 2 muốn đo. Điền sẵn một giá trị mặc định là xoá mất
  -- khoảng trống đó, và cờ đỏ vĩnh viễn không bao giờ bật.
  result       text check (result in ('pass', 'fail', 'hold')),
  result_at    timestamptz,
  created_at   timestamptz not null default now(),

  -- Có kết quả thì phải có mốc ghi, và ngược lại — nếu không thì "đã ghi kết quả
  -- lúc nào" thành không trả lời được, mà đó là một nửa của phép tính cờ đỏ.
  constraint interviews_ket_qua_di_kem_moc check (
    (result is null and result_at is null) or (result is not null and result_at is not null)
  )
);
create index if not exists interviews_candidate_idx
  on public.interviews (tenant_id, candidate_id, scheduled_at desc);
-- Chỉ mục phục vụ đúng câu hỏi cờ đỏ: buổi nào chưa có kết quả, hẹn từ bao giờ.
create index if not exists interviews_cho_ket_qua_idx
  on public.interviews (tenant_id, scheduled_at) where result is null;

-- Điểm (1) ở đầu file: cờ đỏ TÍNH LÚC ĐỌC, không lưu.
-- `security_invoker = on` để RLS của `interviews` vẫn áp theo người gọi — view
-- không được là đường vòng qua chính policy mình vừa viết.
create or replace view public.interviews_qua_han_ghi_ket_qua
  with (security_invoker = on) as
select i.id,
       i.tenant_id,
       i.candidate_id,
       i.scheduled_at,
       i.interviewer_user_id,
       (now() - i.scheduled_at) as tre
from public.interviews i
where i.result is null
  and i.scheduled_at < now() - interval '3 days';

comment on view public.interviews_qua_han_ghi_ket_qua is
  'Quyet dinh 2 the man-tuyen-dung: buoi hen qua 3 ngay chua ai ghi ket qua. TINH LUC DOC - co y khong co cot co tren bang, vi cot co can nguoi cap nhat va cai gi can cap nhat thi cung quen duoc.';

-- ════════════════════════════════════════════════════════════════════
-- 4. GHI CHÚ PHỎNG VẤN — dữ liệu nhạy cảm, quyền HẸP HƠN cả kho
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.interview_notes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  interview_id uuid not null references public.interviews(id) on delete cascade,
  -- Cột này là KHOÁ của policy bên dưới, nên `not null`: để null thì dòng ghi chú
  -- không thuộc về ai, và người viết ra nó cũng mất quyền đọc lại.
  -- `cascade` theo tài khoản: đây là ý kiến riêng của một người về một người
  -- khác — tài khoản không còn thì ý kiến đó cũng không nên nằm lại.
  interviewer_user_id uuid not null default auth.uid()
                      references auth.users(id) on delete cascade,
  body         text not null check (length(trim(body)) between 1 and 2000),
  created_at   timestamptz not null default now()
);
create index if not exists interview_notes_interview_idx
  on public.interview_notes (tenant_id, interview_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════
-- 5. NỐI ỨNG VIÊN → NHÂN SỰ
-- ════════════════════════════════════════════════════════════════════
-- `on delete restrict` chứ KHÔNG cascade, và đây là chỗ dễ chọn sai nhất file.
-- Mục 6 cho phép dọn hồ sơ ứng viên quá 12 tháng. Nếu khoá này là `cascade`, một
-- lệnh dọn định kỳ sẽ cắt luôn hồ sơ NHÂN SỰ của người đang đi làm — mà thẻ
-- design nói ngược lại: hồ sơ ứng viên "không mất đi, nó thành phần lịch sử của
-- hồ sơ nhân sự". `restrict` biến việc đó thành một lỗi rõ ràng ngay lúc xoá.
alter table public.employees
  add column if not exists candidate_id uuid references public.candidates(id) on delete restrict;
-- Một hồ sơ ứng viên chỉ hoá thành MỘT nhân sự (gọi `candidate_hire` hai lần
-- không được đẻ ra hai người).
create unique index if not exists employees_candidate_unique
  on public.employees (candidate_id) where candidate_id is not null;

-- ── RPC "Nhận việc" ──────────────────────────────────────────────────
--
-- ⚠️ HÀM NÀY KHÔNG NHẬN THAM SỐ VAI, VÀ ĐÓ LÀ ĐIỀU QUAN TRỌNG NHẤT Ở ĐÂY.
-- Vai `'staff'` được ĐÓNG CỨNG trong thân hàm. Nếu để tầng web truyền vai vào
-- thì bất kỳ ai gọi được endpoint này đều gọi thẳng với vai `'owner'` — leo
-- thang quyền trọn vẹn chỉ bằng một tham số, không cần lỗ hổng nào khác. Màn
-- hình có ghi "Chọn vai trò: Nhân viên" không ngăn được một request gõ tay.
-- Muốn nâng vai thì đi đường nâng vai, có chủ ý, sau khi người ta đã vào.
--
-- Cả ba việc (tạo hồ sơ nhân sự · gắn lịch sử ứng viên · gửi lời mời) nằm TRONG
-- MỘT hàm ⇒ một transaction. Lỗi ở bước lời mời thì hồ sơ nhân sự cũng cuốn
-- theo: không để lại một nhân viên "đã có hồ sơ mà không ai mời được".
--
-- `p_token_hash`: tầng web sinh token, gửi vào link mời, và chỉ đưa SHA-256 vào
-- đây — cùng khuôn với `accept_invitation` (#28) và app/app/settings/team.
-- CSDL không bao giờ giữ token gốc.
create or replace function public.candidate_hire(
  p_candidate_id uuid,
  p_token_hash   text,
  p_started_on   date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_ung    public.candidates;
  v_emp    uuid;
  v_inv    uuid;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- Tạo nhân sự + gửi lời mời = hai việc mà `employees_manage` và
  -- `invitations_manage` đều giới hạn ở owner/admin. Hàm definer bỏ qua RLS nên
  -- phải kiểm lại bằng tay, nếu không nó chính là đường vòng quanh hai policy đó.
  if v_role not in ('owner', 'admin') then raise exception 'forbidden'; end if;

  select * into v_ung from public.candidates
   where id = p_candidate_id and tenant_id = v_tenant
   for update;
  if not found then raise exception 'candidate_not_found'; end if;
  if v_ung.email is null then raise exception 'candidate_email_required'; end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_token_hash';
  end if;

  insert into public.employees (tenant_id, candidate_id, full_name, phone, dob, started_on)
  values (v_tenant, v_ung.id, v_ung.full_name, v_ung.phone, v_ung.dob, p_started_on)
  returning id into v_emp;

  -- 'staff' viết thẳng ở đây, KHÔNG lấy từ tham số. Xem khối chú thích trên.
  insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
  values (v_tenant, v_ung.email, 'staff', p_token_hash, auth.uid())
  returning id into v_inv;

  update public.candidates set stage = 'hired' where id = v_ung.id;

  return jsonb_build_object('employee_id', v_emp, 'invitation_id', v_inv, 'role', 'staff');
end;
$$;
revoke execute on function public.candidate_hire(uuid, text, date) from public, anon;
grant  execute on function public.candidate_hire(uuid, text, date) to authenticated;

comment on function public.candidate_hire(uuid, text, date) is
  'Nhan viec: ho so ung vien -> ho so nhan su + loi moi, trong MOT transaction. Vai dong cung staff - co y KHONG co tham so vai, vi tham so vai o day la mot duong leo thang quyen tron ven.';

-- ════════════════════════════════════════════════════════════════════
-- 6. HẠN GIỮ 12 THÁNG — máy hỏi, người quyết
-- ════════════════════════════════════════════════════════════════════
-- ⛔ KHÔNG CÓ cron. KHÔNG CÓ trigger tự xoá. KHÔNG CÓ job dọn nền.
--    SỰ VẮNG MẶT ĐÓ LÀ RÀNG BUỘC CHÍNH CỦA MỤC NÀY, không phải thứ còn thiếu.
--
-- Quyết định 5 của thẻ design: Nghị định 13 chỉ cho giữ dữ liệu cá nhân khi còn
-- mục đích, nên hồ sơ bị loại có hạn 12 tháng — NHƯNG xoá hồ sơ của một con
-- người vẫn là quyết định của chủ tiệm. Máy tự xoá là quyết thay chủ tiệm, và
-- cái đã xoá thì không đòi lại được.
--
-- View dưới đây là toàn bộ phần "máy" được phép làm: CHỈ RA. Ai đọc file này về
-- sau và thấy "thiếu cron dọn dẹp" thì đây là câu trả lời — đừng thêm vào.
create or replace view public.candidates_het_han_giu
  with (security_invoker = on) as
select c.id,
       c.tenant_id,
       c.full_name,
       c.rejected_at,
       (now() - c.rejected_at) as qua_han
from public.candidates c
where c.rejected_at is not null
  and c.rejected_at < now() - interval '12 months';

comment on view public.candidates_het_han_giu is
  'Ho so ung vien bi loai da qua han giu 12 thang. CO Y khong kem cron/trigger tu xoa: quyet dinh 5 the man-tuyen-dung - may hoi, nguoi quyet.';

-- ════════════════════════════════════════════════════════════════════
-- 7. QUYỀN
-- ════════════════════════════════════════════════════════════════════
alter table public.job_openings    enable row level security;
alter table public.candidates      enable row level security;
alter table public.interviews      enable row level security;
alter table public.interview_notes enable row level security;

-- ⚠️ THẺ KHÔNG NÓI về vai cho ba bảng đầu (chỉ nói riêng ghi chú phỏng vấn).
-- Mặc định chọn ở đây: quản lý trở lên. Hồ sơ ứng viên là dữ liệu cá nhân của
-- người NGOÀI tiệm (ngày sinh, SĐT, mức lương mong muốn) — mở cho cả tiệm đọc là
-- phát tán một tệp dữ liệu cá nhân mà chủ nhân của nó chưa đồng ý.
create policy job_openings_select on public.job_openings
  for select using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );
create policy job_openings_manage on public.job_openings
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

-- Ngoại lệ có chủ đích: người được xếp phỏng vấn phải đọc được hồ sơ mình sắp
-- phỏng vấn, kể cả khi vai của họ là `staff`. Không có nhánh này thì luồng
-- phỏng vấn gãy đúng ở chỗ nó bắt đầu.
create policy candidates_select on public.candidates
  for select using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.app_role()) in ('owner', 'admin', 'manager')
         or exists (select 1 from public.interviews i
                     where i.candidate_id = candidates.id
                       and i.interviewer_user_id = (select auth.uid())))
  );
create policy candidates_manage on public.candidates
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

create policy interviews_select on public.interviews
  for select using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.app_role()) in ('owner', 'admin', 'manager')
         or interviewer_user_id = (select auth.uid()))
  );
create policy interviews_manage on public.interviews
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

-- ⚠️⚠️ ĐỌC ĐIỂM (2) Ở ĐẦU FILE TRƯỚC KHI SỬA DÒNG NÀY.
-- `'owner'` ĐỨNG MỘT MÌNH. Không `'admin'`. Không `'manager'`.
-- Thẻ design: "chỉ người phỏng vấn và chủ tiệm xem được". Thêm `'admin'` vào cho
-- "nhất quán với các bảng khác" là làm hỏng đúng quyết định 3 của thẻ.
create policy interview_notes_nguoi_pv_va_chu_tiem on public.interview_notes
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (interviewer_user_id = (select auth.uid()) or (select public.app_role()) = 'owner')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (interviewer_user_id = (select auth.uid()) or (select public.app_role()) = 'owner')
  );
