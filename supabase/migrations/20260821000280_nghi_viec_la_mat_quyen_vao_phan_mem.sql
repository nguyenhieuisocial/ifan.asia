-- #280 — NGHỈ VIỆC LÀ MẤT QUYỀN VÀO PHẦN MỀM.
--
-- ════════════════════════════════════════════════════════════════════
-- LỖ ĐANG MỞ
-- ════════════════════════════════════════════════════════════════════
--
-- Ghi ngày nghỉ việc lên hồ sơ nhân sự (`employees.ended_on`) KHÔNG đụng một
-- chữ nào tới tư cách thành viên (`tenant_members.status`). Đã soát `app/`:
-- `luuHoSoNhanSu()` ghi đúng tám cột của hồ sơ rồi thôi. Nghĩa là người đã
-- nghỉ vẫn đăng nhập bình thường và vẫn đọc được danh sách khách, đơn hàng,
-- hội thoại của tiệm cũ — cho tới khi chủ tiệm NHỚ vào Cài đặt gỡ tay.
--
-- ĐO TRÊN DỮ LIỆU THẬT 21/08: 0 người đang rơi vào diện này, nhưng 89 hồ sơ
-- nhân sự đã nối tài khoản đăng nhập. Con số 0 hôm nay không phải là chốt
-- chặn — nó chỉ có nghĩa là chưa ai nghỉ việc kể từ khi có tính năng nối tài
-- khoản. Người đầu tiên nghỉ mà chủ tiệm quên gỡ tay là lộ dữ liệu khách.
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO CHỮA Ở TẦNG CSDL CHỨ KHÔNG PHẢI Ở MÀN HÌNH
-- ════════════════════════════════════════════════════════════════════
--
-- Vá ở `luuHoSoNhanSu()` thì chỉ bịt được ĐÚNG MỘT CỬA. Ngày nghỉ còn vào
-- được bằng đường nhập Excel, bằng sửa tay trên bảng, bằng bất kỳ màn nào
-- viết sau này. Đặt cái tự động ngay trên bảng hồ sơ thì mọi cửa đều đi qua.
--
-- Chốt này CẮT QUYỀN THẬT, không phải ẩn nút: đã đo `current_tenant_id()` —
-- hàm mà mọi luật đọc/ghi của mọi bảng đều gọi — CÓ lọc theo trạng thái tư
-- cách. Đặt `status='removed'` là người đó không đọc được gì nữa, kể cả gọi
-- thẳng vào cơ sở dữ liệu chứ không qua giao diện.
--
-- ════════════════════════════════════════════════════════════════════
-- BỐN ĐIỂM CHỐT, ghi lại để người sau không mở lại
-- ════════════════════════════════════════════════════════════════════
--
-- (1) NGÀY NGHỈ SO THEO GIỜ CỦA TIỆM, không phải giờ quốc tế. `ended_on` là
--     ngày do người ở tiệm nhập theo lịch của họ. So với `current_date` của
--     máy chủ thì suốt 7 tiếng mỗi đêm (từ 0h đến 7h giờ Việt Nam) máy còn
--     đang ở "hôm qua" — người nghỉ hôm nay sẽ chưa bị khoá, và tệ hơn là
--     khoá muộn một cách không đoán được. Lỗi này kho đã dính một lần ở mục
--     #192, không lặp lại.
--
-- (2) KHÔNG KHOÁ CHỦ TIỆM. Chủ tiệm cũng có thể có hồ sơ nhân sự cho chính
--     mình (để chấm công, để tính hoa hồng). Nếu họ ghi nhầm ngày nghỉ thì
--     máy khoá luôn người duy nhất mở khoá được — tiệm mất chủ, không ai
--     cứu được từ trong phần mềm. Chỉ khoá vai nhân viên/quản lý/chỉ-xem.
--
-- (3) CHỈ ĐÓNG TỰ ĐỘNG, KHÔNG MỞ TỰ ĐỘNG. Xoá ngày nghỉ (nhận lại người) sẽ
--     KHÔNG tự trả quyền. Đóng nhầm thì hại là một người phải chờ mời lại;
--     mở nhầm thì hại là dữ liệu khách nằm trong tay người không còn quyền.
--     Hai cái đó không cân nhau, nên máy chỉ được phép làm chiều an toàn.
--     Nhận lại người thì chủ tiệm mời lại — một thao tác, có chủ đích.
--
-- (4) NGÀY NGHỈ TRONG TƯƠNG LAI PHẢI CÓ NGƯỜI CANH. Ghi "nghỉ từ mùng 1
--     tháng sau" là chuyện thường. Cái tự động trên bảng chỉ chạy lúc ghi,
--     nên riêng nó thì tới ngày đó không ai khoá. Vì vậy có thêm một lượt
--     quét hằng đêm — cùng một hàm, chạy lại mỗi 3h sáng giờ Việt Nam.
--
-- Ghi sổ: mỗi lần khoá đều ghi vào sổ chung `record_audit` (đúng luật "một
-- đường ghi sổ duy nhất"). Ghi THẲNG vào bảng chứ không qua `record_audit_log()`
-- vì hàm đó lấy mã tiệm từ phiên đăng nhập — lượt quét đêm chạy bằng máy,
-- không có phiên nào, gọi vào là nó ném lỗi `no_tenant_context`. Người bấm thì
-- `auth.uid()` có giá trị; máy quét đêm thì để trống, và trống ở đây nghĩa
-- đúng là "máy làm, không phải người".

-- ── Hàm khoá. Truyền mã tiệm để chạy cho một tiệm; để trống thì quét cả nhà ──
create or replace function private.khoa_tu_cach_nguoi_da_nghi(p_tenant uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_so integer := 0;
begin
  with ung_vien as (
    select m.tenant_id, m.user_id, e.full_name, e.ended_on
    from public.employees e
    join public.tenants t on t.id = e.tenant_id
    join public.tenant_members m
      on m.tenant_id = e.tenant_id and m.user_id = e.user_id
    where e.user_id is not null
      and e.ended_on is not null
      -- điểm chốt (1): ngày "hôm nay" tính theo múi giờ của chính tiệm đó
      and e.ended_on <= (now() at time zone coalesce(t.timezone, 'Asia/Ho_Chi_Minh'))::date
      and m.status = 'active'
      and m.role <> 'owner'          -- điểm chốt (2)
      and (p_tenant is null or e.tenant_id = p_tenant)
  ), da_khoa as (
    update public.tenant_members m
       set status = 'removed'
      from ung_vien u
     where m.tenant_id = u.tenant_id
       and m.user_id = u.user_id
    returning m.tenant_id, m.user_id, u.full_name, u.ended_on
  )
  insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
  select d.tenant_id, 'tenant_member', d.user_id, auth.uid(), 'ended',
         jsonb_build_object(
           'ly_do', 'nghi_viec',
           'ngay_nghi', d.ended_on,
           'ten', d.full_name,
           'boi', case when auth.uid() is null then 'luot_quet_dem' else 'nguoi_ghi_ho_so' end)
    from da_khoa d;

  get diagnostics v_so = row_count;
  return v_so;
end;
$$;

revoke all on function private.khoa_tu_cach_nguoi_da_nghi(uuid) from public, anon, authenticated;

comment on function private.khoa_tu_cach_nguoi_da_nghi(uuid) is
  'Khoá tư cách thành viên của người đã tới ngày nghỉ việc (theo giờ của tiệm). '
  'Không đụng chủ tiệm. Chỉ đóng, không bao giờ mở lại — xem migration #280.';

-- ── Chạy ngay lúc ghi ngày nghỉ, mọi cửa đều đi qua đây ──
create or replace function public.employees_khoa_khi_nghi_viec()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
begin
  -- Chỉ gọi khi hồ sơ này thực sự có tài khoản VÀ có ngày nghỉ — để một lượt
  -- sửa lương hay sửa tên không kéo theo cả một lượt quét vô ích.
  if new.user_id is not null and new.ended_on is not null then
    perform private.khoa_tu_cach_nguoi_da_nghi(new.tenant_id);
  end if;
  return null;
end;
$$;

drop trigger if exists employees_khoa_khi_nghi_viec on public.employees;
create trigger employees_khoa_khi_nghi_viec
after insert or update of ended_on, user_id on public.employees
for each row execute function public.employees_khoa_khi_nghi_viec();

-- ── Điểm chốt (4): lượt quét hằng đêm, cho ngày nghỉ đặt trước ──
-- 20:00 giờ quốc tế = 3:00 sáng giờ Việt Nam, đúng nếp các lượt quét đêm khác
-- của kho (xem #192 — bốn việc nền từng chạy nhầm 10h sáng).
do $$
begin
  perform cron.unschedule('lock-departed-staff-nightly');
exception when others then
  null;  -- chưa từng hẹn thì thôi
end;
$$;

select cron.schedule(
  'lock-departed-staff-nightly',
  '29 20 * * *',
  $cron$select private.khoa_tu_cach_nguoi_da_nghi()$cron$);
