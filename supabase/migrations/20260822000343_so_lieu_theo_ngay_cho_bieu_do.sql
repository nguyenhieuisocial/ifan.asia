-- ════════════════════════════════════════════════════════════════════
-- #343 — SỐ LIỆU THEO NGÀY (thẻ `man-so-lieu-va-bieu-do`)
-- ════════════════════════════════════════════════════════════════════
-- Hôm nay iFan KHÔNG có màn nào cho thấy xu hướng theo thời gian. Câu hỏi cơ
-- bản nhất của chủ tiệm — "tháng này so với tháng trước, đang lên hay xuống?" —
-- chưa trả lời được.
--
-- ⚠️ NGÀY CỦA MỘT ĐƠN LÀ `created_at`, KHÔNG PHẢI `updated_at`.
--   `orders` không có cột "ngày chốt" riêng. Dùng `updated_at` thì SỬA MỘT ĐƠN
--   CŨ LÀ DOANH THU NHẢY SANG HÔM NAY — biểu đồ tự bịa ra một ngày bùng nổ.
--   Đo được điều đó trên dữ liệu mẫu: gộp theo `updated_at` ra 2 ngày (một
--   ngày 2.819 đơn); gộp theo `created_at` ra 30 ngày đều đặn 26–40 đơn.
--
-- ⚠️ GIỜ VIỆT NAM, không phải giờ quốc tế — nếu không thì mọi đơn từ 0h tới 7h
--   sáng rơi nhầm sang hôm trước, và đó đúng là khung giờ tiệm chốt sổ ca đêm.
--
-- ⚠️ KHÔNG dùng `metric_daily.revenue_won` cho biểu đồ này. Chỉ số đó tính từ
--   bảng `deals` (cơ hội bán hàng CRM). Đo 22/08: mỗi tiệm có 1.700–7.500 đơn
--   đã hoàn tất nhưng chỉ 3–4 deal thắng — với một tiệm spa thì tiền nằm ở ĐƠN,
--   không nằm ở deal. Vẽ biểu đồ từ đó sẽ ra một đường gần như phẳng ở 0 trong
--   khi tiệm bán hàng trăm triệu.

/**
 * Doanh thu và lượt khách theo TỪNG NGÀY, có bù ngày trống.
 *
 * ⚠️ BÙ NGÀY KHÔNG CÓ ĐƠN BẰNG 0. Không bù thì biểu đồ nối thẳng từ ngày 5 sang
 *   ngày 9 và trông như tiệm bán đều — che mất đúng bốn ngày ế, thứ đáng nhìn
 *   nhất. `generate_series` sinh đủ dải ngày rồi nối trái.
 */
create or replace function public.so_lieu_theo_ngay(p_so_ngay integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with tiem as (select public.current_tenant_id() id),
  n as (select greatest(least(coalesce(p_so_ngay, 30), 365), 1) v),
  dai as (
    select generate_series(public.ngay_vn() - (select v - 1 from n), public.ngay_vn(), interval '1 day')::date ngay
  ),
  don as (
    select (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date ngay,
           count(*) so_don,
           coalesce(sum((
             select coalesce(sum(l.qty * l.unit_price_vnd - coalesce(l.discount_vnd, 0)), 0)
             from public.order_lines l where l.order_id = o.id
           )), 0)::bigint tien
    from public.orders o, tiem, n
    where o.tenant_id = tiem.id
      and o.kind = 'order'
      and o.status = 'completed'
      and o.deleted_at is null
      and (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date
          >= public.ngay_vn() - (n.v - 1)
    group by 1
  )
  select case when (select id from tiem) is null then '{}'::jsonb else
    jsonb_build_object(
      'so_ngay', (select v from n),
      'tong_tien', coalesce((select sum(tien) from don), 0),
      'tong_don', coalesce((select sum(so_don) from don), 0),
      'ngay', coalesce((
        select jsonb_agg(jsonb_build_object(
          'ngay', dai.ngay,
          'tien', coalesce(don.tien, 0),
          'so_don', coalesce(don.so_don, 0)
        ) order by dai.ngay)
        from dai left join don on don.ngay = dai.ngay
      ), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.so_lieu_theo_ngay(integer) from public, anon;
grant execute on function public.so_lieu_theo_ngay(integer) to authenticated;

comment on function public.so_lieu_theo_ngay(integer) is
  'Doanh thu + lượt khách theo từng ngày (giờ VN), có bù ngày trống bằng 0. Ngày của đơn lấy từ created_at — updated_at sẽ làm doanh thu nhảy khi sửa đơn cũ (#343).';

/**
 * BỐN CON SỐ CỦA HÔM NAY, mỗi số kèm MỐC SO SÁNH.
 *
 * ⚠️ MỖI SỐ PHẢI CÓ MỐC ĐỐI CHIẾU. "12,4 triệu" tự nó không nói lên gì; "12,4
 *   triệu, hơn hôm qua 18%" thì mới ra được quyết định. Con số trần trụi là
 *   thứ người ta nhìn rồi bỏ qua.
 *
 * ⚠️ MỨC THƯỜNG NGÀY của huỷ hẹn lấy TRUNG VỊ 14 ngày, không lấy trung bình:
 *   một ngày lễ huỷ 20 lượt sẽ kéo trung bình lên và che mất mọi bất thường
 *   sau đó. Trung vị không bị một ngày lạ kéo đi.
 */
create or replace function public.so_lieu_hom_nay()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with tiem as (select public.current_tenant_id() id),
  d as (
    select (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date ngay,
           count(*) so_don,
           coalesce(sum((
             select coalesce(sum(l.qty * l.unit_price_vnd - coalesce(l.discount_vnd, 0)), 0)
             from public.order_lines l where l.order_id = o.id
           )), 0)::bigint tien
    from public.orders o, tiem
    where o.tenant_id = tiem.id and o.kind = 'order' and o.status = 'completed'
      and o.deleted_at is null
      and (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= public.ngay_vn() - 1
    group by 1
  ),
  huy as (
    select (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date ngay, count(*) n
    from public.appointments a, tiem
    where a.tenant_id = tiem.id and a.status = 'cancelled'
      and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date
          between public.ngay_vn() - 14 and public.ngay_vn()
    group by 1
  ),
  mai as (
    select count(*) n
    from public.appointments a, tiem
    where a.tenant_id = tiem.id
      and a.status not in ('cancelled', 'no_show')
      and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date = public.ngay_vn() + 1
  )
  select case when (select id from tiem) is null then '{}'::jsonb else
    jsonb_build_object(
      'tien_hom_nay', coalesce((select tien from d where ngay = public.ngay_vn()), 0),
      'tien_hom_qua', coalesce((select tien from d where ngay = public.ngay_vn() - 1), 0),
      'don_hom_nay', coalesce((select so_don from d where ngay = public.ngay_vn()), 0),
      'don_hom_qua', coalesce((select so_don from d where ngay = public.ngay_vn() - 1), 0),
      'huy_hom_nay', coalesce((select n from huy where ngay = public.ngay_vn()), 0),
      -- Trung vị 14 ngày TRƯỚC hôm nay (không tính chính hôm nay, nếu không thì
      -- một ngày bất thường tự làm mức nền của chính nó).
      'huy_thuong_ngay', coalesce((
        select percentile_cont(0.5) within group (order by n)
        from huy where ngay < public.ngay_vn()
      ), 0),
      'hen_ngay_mai', (select n from mai)
    )
  end;
$$;

revoke all on function public.so_lieu_hom_nay() from public, anon;
grant execute on function public.so_lieu_hom_nay() to authenticated;

comment on function public.so_lieu_hom_nay() is
  'Bốn con số của hôm nay, mỗi số kèm mốc so sánh. Mức huỷ "thường ngày" dùng TRUNG VỊ 14 ngày — trung bình bị một ngày lễ kéo lệch (#343).';
