-- #225 — NGƯỠNG % KHỚP MẶT chỉnh được (founder chốt 20/08: cho nhập số, không
-- cố định). Khi chấm giúp, mặt vừa chụp được chấm điểm khớp (#235); dưới ngưỡng
-- này thì màn tô ĐỎ để quản lý soi kỹ. Mặc định 80.
--
-- attendance_settings là bảng CẤU HÌNH (một dòng/tiệm, ghi thưa) nên ALTER ADD
-- COLUMN (metadata-only ở PG hiện đại) áp nhanh, không như bảng nóng.
alter table public.attendance_settings
  add column if not exists face_match_min integer not null default 80
    check (face_match_min between 0 and 100);

comment on column public.attendance_settings.face_match_min is
  '#225 — % khớp mặt tối thiểu khi chấm giúp; dưới ngưỡng thì đánh dấu đỏ cho quản lý soi. Mặc định 80.';
