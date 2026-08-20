-- #250 — NGHỈ PHÉP: quỹ phép TRỪ THẬT, và ngày phép đã duyệt VÀO bảng công.
-- Thẻ design: design-system/man-nhan-su-cham-cong.html (mục "Nghỉ phép — quỹ
-- trừ thật, và ngày phép vào bảng công").
--
-- ════════════════════════════════════════════════════════════════════
-- HAI LỖI ĐANG CHẠY, KHÔNG PHẢI HAI TÍNH NĂNG CÒN THIẾU
-- ════════════════════════════════════════════════════════════════════
--
-- (A) NHÃN NÓI SAI. `leave-panel.tsx` in "Bạn còn {n} ngày phép trong năm"
--     với n = `employees.annual_leave_days` — tức HẠN MỨC ĐƯỢC CẤP, không trừ
--     ngày nào. `people-panel.tsx` dùng đúng khoá `people.leaveLeft` ("còn
--     lại") cho cùng con số đó. Không có bảng nào, hàm nào, dòng mã nào trừ
--     đi ngày đã nghỉ — đã soát toàn kho. Chính thẻ design đã tự khai nợ này:
--     "chữ nói 'còn' mà số là 'được cấp'". Quản lý duyệt đơn dựa vào con số ấy
--     ⇒ duyệt mù, và cuối năm là một cuộc cãi nhau không có sổ để mở ra.
--
-- (B) PHÉP CÓ LƯƠNG ĐANG BỊ TÍNH THÀNH KHÔNG LƯƠNG — lỗi ở ĐƯỜNG TIỀN.
--     `tinhLaiBangCong()` đặt `work_days = số ngày CÓ CHẤM VÀO`. Nó không đọc
--     `leave_requests` một dòng nào. Nên một ngày nghỉ phép năm ĐÃ ĐƯỢC DUYỆT
--     đếm ra 0 công. Hệ quả đi thẳng vào lương, hai chỗ:
--       · `app/app/payroll/actions.ts` — dòng lương cứng ghi nhãn theo
--         `sheet.work_days`;
--       · `app/app/payroll/page.tsx`  — cảnh báo "công dưới chuẩn" khi
--         `work_days < CONG_CHUAN`, nên người nghỉ phép đúng chế độ bị màn
--         lương gắn cờ như người bỏ ca.
--     Duyệt cho nghỉ CÓ LƯƠNG rồi trả lương như nghỉ KHÔNG LƯƠNG là thất hứa
--     bằng máy, tệ hơn hẳn việc chưa có tính năng.
--
-- ════════════════════════════════════════════════════════════════════
-- BA ĐIỂM CHỐT, ghi lại để người sau không mở lại
-- ════════════════════════════════════════════════════════════════════
--
-- (1) KHÔNG DỰNG BẢNG `leave_balances`. Số dư phép SUY RA được từ
--     `leave_requests` đã duyệt — dựng thêm một bảng tổng là dựng CÁCH THỨ HAI
--     để nói cùng một chuyện, và hai cách thì sẽ lệch (đúng luật đã ghi ở
--     migration #166 mục 2: một loại dữ liệu, một nơi ghi). Cái phải đóng băng
--     chỉ là SỐ NGÀY của từng đơn, và nó thuộc về chính đơn đó.
--
-- (2) SỐ NGÀY ĐÓNG BĂNG TRÊN ĐƠN, KHÔNG TÍNH LẠI LÚC ĐỌC. Nếu mỗi lần mở màn
--     lại đếm `to_date - from_date` thì đổi lịch ca của tháng trước làm số phép
--     đã duyệt từ năm ngoái tự nhảy. Quỹ phép là một cuốn sổ, sổ thì không
--     được tự sửa số cũ.
--
-- (3) ỐM KHÔNG TRỪ VÀO PHÉP NĂM. Đây là quyết định NGHIỆP VỤ, nói rõ để không
--     ai tưởng là bỏ sót: phép năm (Bộ luật Lao động 2019 điều 113) và ốm đau
--     (chế độ BHXH) là hai quỹ khác nhau, lấy ngày ốm trừ vào 12 ngày phép năm
--     là tính sai cho người lao động. ⇒ `paid` trừ quỹ; `sick` KHÔNG trừ quỹ
--     nhưng VẪN tính công; `unpaid` không trừ quỹ và không tính công.
--     Tiệm không đóng BHXH mà muốn trừ ngày ốm thì sửa tay được ở bảng công
--     TRƯỚC KHI CHỐT — nên bảng công hiện số ngày phép thành CỘT RIÊNG, không
--     trộn im lặng vào tổng công.

-- ── A. Số ngày của một đơn nghỉ, đóng băng trên chính đơn ────────────
alter table public.leave_requests
  add column if not exists days_count numeric(4,1) not null default 0
    check (days_count >= 0);

comment on column public.leave_requests.days_count is
  '#250 — so ngay cong ma don nghi nay chiem, DONG BANG luc ghi/luc quyet. Da tru ngay duoc xep ca "off". Khong tinh lai luc doc: doi lich ca thang truoc khong duoc lam so phep da duyet tu nhay.';

-- Đếm ngày của một đoạn nghỉ, TRỪ những ngày người đó đã được xếp ca "Nghỉ".
--
-- VÌ SAO TRỪ NGÀY "off": tiệm làm cả tuần, nhưng mỗi người vẫn có ngày nghỉ
-- tuần riêng. Xin nghỉ T2→CN mà ngày nghỉ tuần của mình rơi vào trong đó thì
-- tính đủ 7 ngày phép là ăn gian của nhân viên đúng một ngày, mỗi lần.
--
-- ⚠️ QUYỀN CHẠY HÀM — ADR-0025, đọc trước khi sửa dòng `revoke` bên dưới.
-- Postgres cấp `EXECUTE` cho PUBLIC trên MỌI hàm mới, và Supabase xếp
-- `authenticated` vào PUBLIC. Khuôn quen tay `from public, anon` KHÔNG đủ:
-- `authenticated` được cấp riêng nên vẫn giữ quyền — ADR-0025 đo ra 51 hàm viết
-- đúng lối đó, và 4 lỗ chéo tiệm THẬT rơi vào bằng đúng cơ chế này.
--
-- Hàm này nếu để mở là một lỗ cùng họ: người tiệm A truyền `p_tenant_id` của
-- tiệm B (nhân viên cũ vẫn nhớ mã tiệm) sẽ đo được lịch nghỉ của người tiệm B —
-- hàm không kiểm tư cách thành viên, y hệt 4 hàm ADR-0025 nêu tên.
--
-- ⇒ THU SẠCH quyền của cả ba vai client. Hàm chỉ còn chủ sở hữu gọi được, mà
-- chỗ gọi duy nhất là trigger `leave_dat_so_ngay()` — hàm đó là SECURITY
-- DEFINER nên chạy dưới quyền chủ sở hữu và vẫn gọi được hàm này.
create or replace function public.leave_dem_ngay(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_from date,
  p_to date
) returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::numeric
  from generate_series(p_from, p_to, interval '1 day') as g(d)
  where not exists (
    select 1 from public.shifts s
    where s.tenant_id = p_tenant_id
      and s.employee_id = p_employee_id
      and s.work_date = g.d::date
      and s.kind = 'off'
  );
$$;

revoke execute on function public.leave_dem_ngay(uuid, uuid, date, date)
  from public, anon, authenticated;

comment on function public.leave_dem_ngay(uuid, uuid, date, date) is
  '#250 — dem ngay cong cua mot doan nghi, tru ngay da xep ca "off" (ngay nghi tuan rieng cua tung nguoi). HAM NOI BO: da revoke execute khoi public/anon/authenticated (ADR-0025 — authenticated duoc cap RIENG nen phai goi ten). Chi trigger leave_dat_so_ngay() (security definer) goi.';

-- Đặt `days_count` lúc ghi VÀ lúc quyết. Quyết là lúc con số thành nợ thật, mà
-- lịch ca thường mới được xếp giữa hai mốc đó ⇒ tính lại ở mốc thứ hai cho
-- đúng thực tế. Sau khi đã quyết thì không ai đụng dòng này nữa, nên nó đứng im.
--
-- SECURITY DEFINER vì hai lẽ, cả hai đều cần: (a) đọc `shifts` không bị RLS che
-- — RLS che mất bảng ca thì `not exists` thành đúng và ngày nghỉ tuần bị tính
-- thành ngày phép, sai LẶNG LẼ; (b) gọi được `leave_dem_ngay` vừa bị thu quyền
-- ở trên. Đầu vào lấy từ chính dòng vừa qua cửa RLS của `leave_requests`, nên
-- không có tham số nào do client tự bịa ra.
create or replace function public.leave_dat_so_ngay()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.days_count := public.leave_dem_ngay(
    new.tenant_id, new.employee_id, new.from_date, new.to_date
  );
  return new;
end;
$$;

drop trigger if exists leave_dat_so_ngay on public.leave_requests;
create trigger leave_dat_so_ngay
  before insert or update of from_date, to_date, status on public.leave_requests
  for each row execute function public.leave_dat_so_ngay();

-- Vá dòng cũ: mọi đơn đã có từ trước đều đang mang days_count = 0.
--
-- ⚠️ TỰ ĐO LẠI, KHÔNG CHÉP THEO HỒ SƠ (21/08, chỉ `select`):
--   leave_requests        74 dòng   ← migration #204 ghi "0 dòng" hôm 20/08
--   shifts             9.388 dòng
--   timesheets           335 dòng
--   attendance_settings    6 dòng
-- Con số "0 dòng" của #204 ĐÚNG vào hôm nó được viết và SAI vào hôm nay — dữ
-- liệu mẫu đã sinh thêm từ đó. Nếu tin theo hồ sơ mà bỏ câu vá này thì 74 đơn
-- nghỉ nằm lại với days_count = 0, và cột đó là thứ quỹ phép trừ theo.
update public.leave_requests
   set days_count = public.leave_dem_ngay(tenant_id, employee_id, from_date, to_date)
 where days_count = 0;

-- ── B. Đã dùng bao nhiêu ngày phép năm ───────────────────────────────
--
-- SECURITY INVOKER (mặc định) là CHỦ ĐÍCH: RLS của `leave_requests` tự lọc —
-- nhân viên ra đúng số của mình, quản lý trở lên ra cả tiệm. Không phải viết
-- lại luật quyền ở đây, nên cũng không có chỗ để nó lệch với luật gốc.
--
-- Chỉ đếm `paid`: `sick` không trừ quỹ (điểm chốt 3), `unpaid` cũng không.
create or replace function public.phep_da_dung(p_year integer)
returns table (employee_id uuid, days numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  select l.employee_id, sum(l.days_count)::numeric
  from public.leave_requests l
  where l.tenant_id = (select public.current_tenant_id())
    and l.status = 'approved'
    and l.kind = 'paid'
    and extract(year from l.from_date) = p_year
  group by l.employee_id;
$$;

-- Khuôn ADR-0025: THU của public+anon TRƯỚC, rồi CẤP đích danh cho vai cần.
-- Hàm này KHÔNG phải definer nên `anon` gọi cũng không lấy được gì (RLS chặn,
-- và `current_tenant_id()` của anon là null) — nhưng để mở một cửa không ai cần
-- thì lần sau có người đổi nó thành definer là cửa ấy thành lỗ ngay.
revoke execute on function public.phep_da_dung(integer) from public, anon;
grant execute on function public.phep_da_dung(integer) to authenticated;

comment on function public.phep_da_dung(integer) is
  '#250 — so ngay phep NAM da dung trong nam, theo tung nguoi. INVOKER co chu dich: RLS leave_requests tu loc (nhan vien thay cua minh, quan ly+ thay ca tiem). Chi dem kind=paid — om (sick) khong tru quy phep nam.';

-- ── C. Ngày phép hiện thành CỘT RIÊNG trên bảng công ─────────────────
--
-- Tách hai cột thay vì cộng thẳng vào `work_days` rồi im lặng: quản lý phải
-- NHÌN THẤY vì sao tổng công tháng này khác số ngày có mặt, nếu không thì lần
-- đầu thấy số lệch họ sẽ sửa tay đè lên — và số sửa tay thì không tính lại được.
alter table public.timesheets
  add column if not exists paid_leave_days numeric(5,2) not null default 0
    check (paid_leave_days >= 0),
  add column if not exists unpaid_leave_days numeric(5,2) not null default 0
    check (unpaid_leave_days >= 0);

comment on column public.timesheets.paid_leave_days is
  '#250 — so ngay nghi CO LUONG da duyet trong ky (phep nam + om). DA CONG vao work_days: nghi co luong van la ngay duoc tra tien, khong cong vao la tra thieu.';
comment on column public.timesheets.unpaid_leave_days is
  '#250 — so ngay nghi KHONG LUONG da duyet trong ky. KHONG cong vao work_days; de rieng de quan ly biet vi sao cong thang nay thap, khong phai doan.';
