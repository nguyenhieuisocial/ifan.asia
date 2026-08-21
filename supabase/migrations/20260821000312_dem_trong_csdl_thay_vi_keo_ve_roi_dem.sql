-- ════════════════════════════════════════════════════════════════════
-- ĐẾM/CỘNG TRONG CƠ SỞ DỮ LIỆU, KHÔNG KÉO VỀ RỒI ĐẾM
-- ════════════════════════════════════════════════════════════════════
--
-- ┌─ LỖI GỐC: `.limit(20000)` LÀ MỘT LỜI NÓI DỐI ─────────────────────
-- Cổng API của Supabase CẮT CỨNG ở 1000 dòng, bất kể xin bao nhiêu. Đã đo:
--
--     xin 1000  → nhận 1000
--     xin 5000  → nhận 1000
--     xin 20000 → nhận 1000
--
-- Không lỗi, không cảnh báo, không dấu hiệu gì. Câu lệnh chạy xong, mảng có
-- dữ liệu, và mọi phép cộng phía sau ra một con số SAI TRÔNG NHƯ ĐÚNG.
--
-- Bắt được khi chế độ xem Năm báo "874 buổi hẹn trong năm 2026" trong khi cơ
-- sở dữ liệu có 8.479 — sai gần mười lần. Quét cả kho thì thấy BỐN chỗ cùng
-- bệnh, và hai trong số đó là SỐ TIỀN:
--
--   1. `demCaTheoNgay`        — số ca cả năm (chế độ xem Năm)
--   2. `fetchSpentByProject`  — TỔNG ĐÃ TIÊU của mỗi dự án  ⚠️ tiền
--   3. `demCaTheoTho`         — số ca của mỗi thợ trong kỳ  ⚠️ tính lương
--   4. `attendance_punches`   — lượt chấm công một người một tháng (thực tế
--                               không bao giờ tới 1000, nhưng con số 2000 vẫn
--                               là lời nói dối; đã hạ xuống và thêm phép kiểm
--                               chạm trần ở tầng web)
--
-- ┌─ CHỮA ────────────────────────────────────────────────────────────
-- Ba hàm dưới đây gộp NGAY TRONG cơ sở dữ liệu và trả về đúng số dòng cần —
-- vài chục tới vài trăm, không bao giờ chạm trần.
--
-- ⚠️ CỐ Ý để `security invoker` (mặc định): RLS của người gọi vẫn áp nguyên.
--   Đặt `security definer` ở đây sẽ cho một tiệm cộng tiền của tiệm khác.

-- ────────────────────────────────────────────────────────────────────
-- 1. Số ca theo từng ngày (chế độ xem Năm)
-- ────────────────────────────────────────────────────────────────────
create or replace function public.lich_dem_theo_ngay(p_tu date, p_den date)
returns table (ngay date, so_ca int)
language sql
stable
set search_path = public, pg_temp
as $$
  select (a.start_at at time zone coalesce(t.timezone, 'Asia/Ho_Chi_Minh'))::date as ngay,
         count(*)::int as so_ca
    from public.appointments a
    join public.tenants t on t.id = a.tenant_id
   where a.deleted_at is null
     and a.status not in ('cancelled', 'no_show')
     and (a.start_at at time zone coalesce(t.timezone, 'Asia/Ho_Chi_Minh'))::date between p_tu and p_den
   group by 1
$$;

revoke all on function public.lich_dem_theo_ngay(date, date) from public, anon;
grant execute on function public.lich_dem_theo_ngay(date, date) to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 2. Tổng đã tiêu của mỗi dự án  ⚠️ SỐ TIỀN
-- ────────────────────────────────────────────────────────────────────
create or replace function public.du_an_tong_da_tieu()
returns table (project_id uuid, tong bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select c.project_id, coalesce(sum(c.amount_vnd), 0)::bigint
    from public.cash_entries c
   where c.project_id is not null
     and c.direction = 'out'
     and c.deleted_at is null
   group by c.project_id
$$;

revoke all on function public.du_an_tong_da_tieu() from public, anon;
grant execute on function public.du_an_tong_da_tieu() to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 3. Số ca của mỗi thợ trong một khoảng  ⚠️ DÙNG ĐỂ TÍNH LƯƠNG
-- ────────────────────────────────────────────────────────────────────
create or replace function public.lich_dem_ca_theo_tho(p_tu timestamptz, p_den timestamptz)
returns table (staff_user_id uuid, so_ca int)
language sql
stable
set search_path = public, pg_temp
as $$
  select a.staff_user_id, count(*)::int
    from public.appointments a
   where a.staff_user_id is not null
     and a.start_at >= p_tu
     and a.start_at < p_den
     and a.status in ('booked', 'arrived')
   group by a.staff_user_id
$$;

revoke all on function public.lich_dem_ca_theo_tho(timestamptz, timestamptz) from public, anon;
grant execute on function public.lich_dem_ca_theo_tho(timestamptz, timestamptz) to authenticated;

comment on function public.lich_dem_theo_ngay(date, date) is
  'Đếm ca theo ngày GIỜ TIỆM. Thay cho việc kéo hàng nghìn dòng về rồi đếm ở tầng web — cổng API cắt cứng ở 1000 dòng và cho ra số SAI TRÔNG NHƯ ĐÚNG — #312.';
comment on function public.du_an_tong_da_tieu() is
  'Tổng chi theo dự án. Trước #312 cộng ở tầng web sau khi kéo tối đa 1000 dòng ⇒ dự án nhiều hơn 1000 phiếu chi bị cộng thiếu, âm thầm.';
comment on function public.lich_dem_ca_theo_tho(timestamptz, timestamptz) is
  'Đếm ca theo thợ trong kỳ, dùng cho tính lương. Trước #312 bị cắt ở 1000 dòng ⇒ tiệm bận trả lương thiếu, âm thầm — #312.';
