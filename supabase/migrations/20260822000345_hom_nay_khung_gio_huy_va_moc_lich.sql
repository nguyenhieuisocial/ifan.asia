-- ════════════════════════════════════════════════════════════════════
-- #345 — MÀN "HÔM NAY": KHUNG GIỜ HUỶ, VÀ MỐC ĐỐI CHIẾU CHO LỊCH NGÀY MAI
-- ════════════════════════════════════════════════════════════════════
-- Thẻ `man-so-lieu-va-bieu-do` vẽ đoạn TÓM TẮT là "8 lượt huỷ — gấp 4 lần mức
-- thường ngày. Phần lớn rơi vào khung 14–16 giờ." Vế đầu #343 đã trả lời được;
-- vế sau thì chưa — và vế sau mới là vế NÓI CHO CHỦ TIỆM BIẾT PHẢI NHÌN VÀO ĐÂU.
-- "Hôm nay huỷ nhiều" chỉ làm người ta lo; "huỷ dồn vào 14–16 giờ" thì mở được
-- lịch ra xem ca đó ai trực, phòng nào, thợ nào.
--
-- ⚠️ CHỈ NÓI KHI THẬT SỰ CÓ DỒN CỤC. Hai chốt: hôm nay phải huỷ từ 3 lượt trở
--   lên, VÀ khung giờ đó phải chiếm từ một nửa số huỷ. Không có hai chốt này
--   thì 2 lượt huỷ rải rác cũng sinh ra câu "phần lớn rơi vào khung 8–10 giờ" —
--   đúng về số học (1/2 lượt) mà sai về ý nghĩa, và chủ tiệm sẽ đi tìm một vấn
--   đề không có thật. Nói sai một lần là lần sau không ai đọc nữa.
--
-- ⚠️ MỐC CHO "LỊCH NGÀY MAI" — KHÔNG PHẢI "CÒN BAO NHIÊU CHỖ TRỐNG". Thẻ vẽ
--   "6 chỗ còn trống", nhưng iFan CHƯA có khái niệm sức chứa (giờ mở cửa × số
--   thợ × thời lượng dịch vụ). Bịa ra một con số chỗ trống là bịa. Thay bằng
--   thứ đo được thật và vẫn trả lời đúng câu hỏi "ngày mai đông hay vắng":
--   TRUNG VỊ số hẹn mỗi ngày của 14 ngày gần nhất.
--
-- ⚠️ TRUNG VỊ, KHÔNG PHẢI TRUNG BÌNH — cùng lý do #343: một ngày lễ dồn 40 hẹn
--   kéo trung bình lên và che mất mọi ngày bất thường sau đó.

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
  -- Huỷ của HÔM NAY gom theo khung 2 giờ (0-2, 2-4, … 22-24).
  khung as (
    select (extract(hour from a.start_at at time zone 'Asia/Ho_Chi_Minh')::int / 2) * 2 tu_gio,
           count(*)::int n
    from public.appointments a, tiem
    where a.tenant_id = tiem.id and a.status = 'cancelled'
      and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date = public.ngay_vn()
    group by 1
  ),
  dinh as (select tu_gio, n from khung order by n desc, tu_gio limit 1),
  -- Số hẹn mỗi ngày của 14 ngày gần nhất, dùng làm mốc cho "lịch ngày mai".
  -- Bù ngày trống bằng 0: bỏ ngày nghỉ ra khỏi phép tính thì mốc bị đẩy lên
  -- cao, và ngày mai vắng thật cũng trông như bình thường.
  dai as (
    select generate_series(public.ngay_vn() - 14, public.ngay_vn() - 1, interval '1 day')::date ngay
  ),
  hen_ngay as (
    select (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date ngay, count(*) n
    from public.appointments a, tiem
    where a.tenant_id = tiem.id
      and a.status not in ('cancelled', 'no_show')
      and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date
          between public.ngay_vn() - 14 and public.ngay_vn() - 1
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
      'huy_thuong_ngay', coalesce((
        select percentile_cont(0.5) within group (order by n)
        from huy where ngay < public.ngay_vn()
      ), 0),
      -- null khi không có dồn cục thật — xem hai chốt ở đầu file.
      'huy_khung_gio', (
        select case
          when dinh.n >= 3
           and dinh.n * 2 >= coalesce((select n from huy where ngay = public.ngay_vn()), 0)
          then jsonb_build_object('tu_gio', dinh.tu_gio, 'so', dinh.n)
          else null end
        from dinh
      ),
      'hen_ngay_mai', (select n from mai),
      'hen_thuong_ngay', coalesce((
        select percentile_cont(0.5) within group (order by coalesce(hen_ngay.n, 0))
        from dai left join hen_ngay on hen_ngay.ngay = dai.ngay
      ), 0)
    )
  end;
$$;

revoke all on function public.so_lieu_hom_nay() from public, anon;
grant execute on function public.so_lieu_hom_nay() to authenticated;

comment on function public.so_lieu_hom_nay() is
  'Bốn con số của hôm nay, mỗi số kèm mốc so sánh; thêm khung giờ huỷ dồn cục (chỉ khi có dồn thật) và mốc lịch thường ngày. Mọi mức nền dùng TRUNG VỊ (#343, #345).';
