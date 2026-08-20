-- Chốt chặn chấm công gom tháng theo GIỜ QUỐC TẾ, trong khi cả sản phẩm lẫn
-- bảng công đều tính theo GIỜ VIỆT NAM.
--
-- ═══════════════════════════════════════════════════════════════════
-- ĐO ĐƯỢC 20/08 TRÊN DỮ LIỆU THẬT
-- ═══════════════════════════════════════════════════════════════════
--     Múi giờ phiên CSDL          : UTC
--     Lần chấm bị gom NHẦM THÁNG  : 39 / 15.673
--
-- Ví dụ thật: một lần chấm lúc **06:22 ngày 01/05 giờ Việt Nam** = 23:22 ngày
-- 30/04 giờ quốc tế. `date_trunc('month', punched_at)` trên một cột `timestamptz`
-- quy theo múi giờ PHIÊN (UTC) ⇒ hệ thống hiểu lần chấm đó thuộc **tháng 4**.
--
-- ═══════════════════════════════════════════════════════════════════
-- HỎNG HAI CHIỀU, KHÔNG PHẢI MỘT
-- ═══════════════════════════════════════════════════════════════════
-- 1) CHẶN NHẦM — tiệm mở trước 7h sáng (quán cà phê, tiệm ăn sáng, chợ) chấm
--    công ngày mùng 1 sẽ bị soi vào bảng công THÁNG TRƯỚC. Tháng trước đã chốt
--    thì hệ thống từ chối, và người dùng chỉ thấy "kỳ đã khoá" — một câu vô
--    nghĩa với họ, vì họ đang chấm cho tháng NÀY. Bắt được đúng theo cách này:
--    bộ nạp dữ liệu quán cà phê hỏng thật ở lần chạy thứ hai.
-- 2) CHO LỌT NHẦM — chiều ngược lại tệ hơn nhưng khó thấy hơn: lần chấm sáng
--    sớm mùng 1 thuộc tháng ĐÃ CHỐT theo giờ Việt Nam vẫn ghi được, vì hệ thống
--    đi soi tháng trước đó (chưa chốt). Bảng công đã chốt vẫn đổi được — đúng
--    thứ mà chính chú thích của chốt chặn này tuyên bố là ngăn.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO GHIM 'Asia/Ho_Chi_Minh' CHỨ KHÔNG DÙNG `tenants.timezone`
-- ═══════════════════════════════════════════════════════════════════
-- Dùng múi giờ riêng của từng tiệm nghe đúng hơn, nhưng ở đây nó SAI: cột
-- `timesheets.period` do phần mềm ghi, và phần mềm đang quy về giờ Việt Nam
-- (`app/app/team/*` cộng trừ 7 tiếng thẳng trong mã). Chốt chặn phải gom CÙNG
-- MỘT KIỂU với bên ghi ra kỳ, nếu không hai bên lại lệch nhau theo một kiểu
-- mới — chỉ là lần này khó tìm hơn.
--
-- Ghim VN cũng đúng khuôn migration #213 đã chọn cho cả lớp cột ngày mặc định.
-- Ngày nào iFan bán ra ngoài Việt Nam thì phải đổi CẢ HAI bên cùng lúc, và đó
-- là một việc riêng — không giải quyết bằng một dòng trong bản vá này.

create or replace function public.punch_locked_period_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- `at time zone 'Asia/Ho_Chi_Minh'` đổi `timestamptz` sang giờ TƯỜNG của Việt
  -- Nam trước khi cắt tháng. Thiếu vế này là cắt theo múi giờ phiên (UTC trên
  -- Supabase) và lệch đúng 7 tiếng mỗi ngày — xem khối lý do ở trên.
  v_ky date := date_trunc(
    'month',
    coalesce(new.punched_at, old.punched_at) at time zone 'Asia/Ho_Chi_Minh'
  )::date;
begin
  if exists (
    select 1 from public.timesheets t
     where t.employee_id = coalesce(new.employee_id, old.employee_id)
       and t.period = v_ky and t.status = 'closed'
  ) then
    raise exception 'period_closed';
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.punch_locked_period_guard() is
  'Chan sua/them/xoa lan cham cong thuoc mot ky BANG CONG DA CHOT. Gom thang theo GIO VIET NAM (#218) — ban truoc gom theo mui gio phien (UTC) nen lech 7 tieng: do duoc 39/15.673 lan cham bi quy nham thang. Hong hai chieu: chan nham lan cham 6h sang mung 1 cua tiem mo som, VA cho lot lan cham thuoc thang da chot. Phai gom CUNG KIEU voi ben ghi timesheets.period (app quy ve gio VN).';
