-- ════════════════════════════════════════════════════════════════════
-- ĐẾM CA THEO THỢ PHẢI GIỮ TỪNG NGÀY
-- ════════════════════════════════════════════════════════════════════
--
-- Hàm `lich_dem_ca_theo_tho` ở #312 gộp theo THỢ và trả về một con số cho cả
-- khoảng. Nhưng chỗ dùng nó (`app/app/team/queries.ts`) cắt theo KỲ RIÊNG của
-- từng người: mỗi bản ghi cần đếm mang `fromDate`/`toDate` của chính nó, vì
-- người vào làm giữa tháng có kỳ ngắn hơn người làm cả tháng.
--
-- Gộp mất ngày ⇒ mọi người trong kỳ đều nhận cùng một con số, và người vào
-- làm ngày 20 được tính công như người làm từ ngày 1. Đây là TIỀN LƯƠNG.
--
-- Bắt được ngay lúc nối hàm vào chỗ dùng: trình biên dịch báo kiểu không
-- khớp, và đọc lại chỗ dùng thì thấy nó cần từng ngày. Nếu hai bên tình cờ
-- khớp kiểu thì lỗi này đã đi thẳng vào bảng lương.
--
-- Đổi: trả thêm cột `ngay` (theo GIỜ TIỆM). Tầng web tự cộng lại theo đúng
-- kỳ của từng người — vài trăm dòng, không bao giờ chạm trần 1000.

drop function if exists public.lich_dem_ca_theo_tho(timestamptz, timestamptz);

create or replace function public.lich_dem_ca_theo_tho(p_tu timestamptz, p_den timestamptz)
returns table (staff_user_id uuid, ngay date, so_ca int)
language sql
stable
set search_path = public, pg_temp
as $$
  select a.staff_user_id,
         (a.start_at at time zone coalesce(t.timezone, 'Asia/Ho_Chi_Minh'))::date as ngay,
         count(*)::int
    from public.appointments a
    join public.tenants t on t.id = a.tenant_id
   where a.staff_user_id is not null
     and a.start_at >= p_tu
     and a.start_at < p_den
     and a.status in ('booked', 'arrived')
   group by 1, 2
$$;

revoke all on function public.lich_dem_ca_theo_tho(timestamptz, timestamptz) from public, anon;
grant execute on function public.lich_dem_ca_theo_tho(timestamptz, timestamptz) to authenticated;

comment on function public.lich_dem_ca_theo_tho(timestamptz, timestamptz) is
  'Đếm ca theo thợ VÀ THEO NGÀY (giờ tiệm). Giữ từng ngày vì bảng lương cắt theo kỳ riêng của từng người — gộp mất ngày thì người vào làm giữa tháng được tính như người làm cả tháng — #313.';
