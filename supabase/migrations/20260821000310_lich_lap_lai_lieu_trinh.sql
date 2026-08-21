-- ════════════════════════════════════════════════════════════════════
-- LỊCH LẶP LẠI — liệu trình nhiều buổi
-- ════════════════════════════════════════════════════════════════════
--
-- Thẻ `man-lich-kieu-google.html`: "Liệu trình 8 buổi mỗi tuần một lần — đặt
-- một lần, máy sinh cả loạt." Đây là thứ dùng nhiều nhất của một tiệm spa mà
-- màn Lịch chưa có: hiện lễ tân phải đặt tay tám lần, và lần thứ tám thì quên.
--
-- ┌─ QUYẾT ĐỊNH LỚN: SINH SẴN, KHÔNG SINH LÚC ĐỌC ────────────────────
-- Google (và chuẩn iCalendar) lưu MỘT luật lặp rồi tính ra các buổi lúc hiển
-- thị. Ở đây làm ngược lại: **sinh sẵn từng buổi thành từng dòng thật** ngay
-- lúc tạo.
--
-- Vì sao: mỗi buổi hẹn ở đây phải đi qua chống trùng người và chống trùng
-- giường (hai ràng buộc EXCLUDE của #83). Một "luật lặp" không va vào ràng
-- buộc nào cả — nó chỉ là chữ. Nếu tính lúc đọc thì buổi thứ năm trùng giường
-- với khách khác sẽ KHÔNG bị phát hiện cho tới đúng hôm đó, và hôm đó thì hai
-- người cùng tới. Sinh sẵn thì trùng lộ ra NGAY LÚC ĐẶT, lúc còn xoay được.
--
-- Đánh đổi: sửa "tất cả các buổi" phải chạm nhiều dòng thay vì một. Chấp nhận
-- — một liệu trình vài chục buổi là số nhỏ, còn hai khách cùng một giường là
-- chuyện không sửa được bằng phần mềm.
--
-- ┌─ TRẦN SỐ BUỔI ────────────────────────────────────────────────────
-- Google chặn ở 730. Ở đây chặn 100: liệu trình dài nhất của một spa là vài
-- chục buổi, và một trần thấp làm cho lỗi gõ nhầm ("mỗi ngày, 500 buổi") dừng
-- lại ở chỗ vô hại. Chặn bằng RÀNG BUỘC chứ không bằng lời dặn ở tầng web.

create table if not exists public.appointment_series (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- Luật lặp, giữ lại để MÀN HÌNH NÓI ĐƯỢC "mỗi tuần một lần, 8 buổi" chứ
  -- không phải để tính ra các buổi (các buổi đã là dòng thật).
  freq text not null check (freq in ('day', 'week', 'month')),
  -- Lặp mỗi N đơn vị. 1 = mỗi tuần; 2 = cách một tuần.
  buoc int not null default 1 check (buoc between 1 and 52),
  -- Với freq='week': các thứ được chọn, 0=CN..6=T7. Rỗng = theo đúng thứ của
  -- buổi đầu tiên.
  cac_thu int[] not null default '{}',
  -- Với freq='month': lặp theo NGÀY trong tháng, hay theo THỨ thứ mấy của
  -- tháng. "Ngày 17" khác hẳn "thứ Ba thứ ba của tháng".
  theo_thu_cua_thang boolean not null default false,

  so_buoi int not null check (so_buoi between 1 and 100),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists appointment_series_tenant_idx
  on public.appointment_series (tenant_id, created_at desc);

alter table public.appointment_series enable row level security;

create policy appointment_series_select on public.appointment_series
  for select using (tenant_id = (select public.current_tenant_id()));

create policy appointment_series_write on public.appointment_series
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

-- ────────────────────────────────────────────────────────────────────
-- Nối buổi hẹn vào chuỗi
-- ────────────────────────────────────────────────────────────────────

alter table public.appointments
  add column if not exists series_id uuid references public.appointment_series(id) on delete set null,
  -- Buổi thứ mấy trong chuỗi, đếm từ 1. Cần cho phép "buổi này VÀ CÁC BUỔI
  -- SAU" — không có nó thì phải so theo giờ, mà giờ thì người ta dời được.
  add column if not exists series_index int;

alter table public.appointments drop constraint if exists appointments_chuoi_du_doi;
alter table public.appointments
  add constraint appointments_chuoi_du_doi
  check ((series_id is null) = (series_index is null));

create index if not exists appointments_series_idx
  on public.appointments (series_id, series_index)
  where series_id is not null;

-- ⚠️ `on delete set null` chứ KHÔNG `cascade`: xoá bản ghi luật lặp thì các
--   buổi đã đặt PHẢI ở nguyên đó. Khách đã hẹn rồi; một thao tác dọn dữ liệu
--   không được phép làm bay lịch của họ.

comment on table public.appointment_series is
  'Luật lặp của một liệu trình. Các buổi được SINH SẴN thành dòng thật trong appointments (không tính lúc đọc) để chống trùng người/giường bắt được ngay lúc đặt — #310.';
comment on column public.appointments.series_index is
  'Buổi thứ mấy trong chuỗi, đếm từ 1. Dùng cho "buổi này và các buổi sau" — không so theo giờ vì giờ dời được — #310.';
