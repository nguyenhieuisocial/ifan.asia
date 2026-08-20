-- V9 · #219 — Chấm công: nền cấu hình định vị (bán kính) + cột selfie
-- ════════════════════════════════════════════════════════════════════
-- Founder duyệt. Hiện trạng (#166): bán kính coi-là-tại-tiệm HARDCODE 300m
-- trong trigger attendance_set_flag() + lặp ở TS WORK_RADIUS_M; toạ độ tiệm
-- nằm trong tenants.settings.workLocation (jsonb); CHƯA có cột selfie nào.
-- Bản này: (A) bảng attendance_settings cho bán kính cấu hình được + công tắc
-- yêu cầu selfie; (B) cột selfie ngay trên lần chấm (ADR-0028 ngã D2 — thừa
-- hưởng RLS chặt của attendance_punches: nhân viên thấy của mình, quản lý+ thấy
-- cả tiệm, chỉ-xem KHÔNG thấy — không lộ như bảng attachments chung #217);
-- (C) trigger đọc bán kính động. Backward-compatible: chưa cấu hình → 300m như cũ.

-- ── A. Bảng cấu hình chấm công theo tiệm ────────────────────────────
create table if not exists public.attendance_settings (
  tenant_id      uuid primary key references public.tenants(id) on delete cascade,
  lat            numeric(9,6),
  lng            numeric(9,6),
  radius_m       integer not null default 300 check (radius_m between 20 and 5000),
  require_selfie boolean not null default false,
  updated_at     timestamptz not null default now()
);
alter table public.attendance_settings enable row level security;

-- Đọc: MỌI thành viên tiệm (màn chấm cần biết bán kính + có bắt selfie không;
-- các giá trị này không nhạy cảm như lương).
create policy attendance_settings_select on public.attendance_settings for select
  using (tenant_id = (select public.current_tenant_id()));

-- Ghi: chỉ owner/admin (cùng mức với đặt toạ độ tiệm cũ qua tenants_update).
create policy attendance_settings_manage on public.attendance_settings for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin'));

comment on table public.attendance_settings is
  'Cau hinh cham cong theo tiem (#219): toa do tiem + ban kinh coi-la-tai-tiem (cau hinh duoc, truoc hardcode 300) + cong tac bat buoc selfie. Di tru toa do cu tu tenants.settings.workLocation.';

-- Di trú toạ độ tiệm đã đặt (tenants.settings.workLocation) sang bảng mới.
insert into public.attendance_settings (tenant_id, lat, lng)
select t.id,
       (t.settings -> 'workLocation' ->> 'lat')::numeric,
       (t.settings -> 'workLocation' ->> 'lng')::numeric
from public.tenants t
where (t.settings -> 'workLocation' ->> 'lat') is not null
  and (t.settings -> 'workLocation' ->> 'lng') is not null
on conflict (tenant_id) do nothing;

-- ── B. Cột selfie trên chính lần chấm ───────────────────────────────
alter table public.attendance_punches
  add column selfie_path         text,
  add column selfie_content_type text,
  add column selfie_captured_at   timestamptz;

comment on column public.attendance_punches.selfie_path is
  'Duong dan anh selfie trong bucket tenant-files (#219). Quyen xem thua huong RLS cua lan cham (nhan vien thay cua minh, quan ly+ ca tiem, chi-xem khong). Anh da CHEN CHU vi tri+gio+ten tiem o client truoc khi upload (yeu cau founder).';

-- ── C. Trigger đọc bán kính động (thay hardcode 300) ────────────────
create or replace function public.attendance_set_flag()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_ban_kinh integer;
begin
  -- Bán kính từ cấu hình tiệm; chưa cấu hình → 300m như #166.
  select radius_m into v_ban_kinh
    from public.attendance_settings where tenant_id = new.tenant_id;
  if v_ban_kinh is null then v_ban_kinh := 300; end if;
  -- Cờ LUÔN do máy quyết, bất kể client gửi gì lên.
  new.out_of_range := (new.distance_m is null) or (new.distance_m > v_ban_kinh);
  return new;
end;
$$;
