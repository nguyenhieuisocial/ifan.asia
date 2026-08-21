-- ════════════════════════════════════════════════════════════════════
-- #346 — "HÔM NAY" PHẢI BỎ QUA LỊCH HẸN ĐÃ XOÁ
-- ════════════════════════════════════════════════════════════════════
-- #343 và #345 đếm `appointments` mà không loại dòng đã xoá mềm. Bảng đó CÓ
-- khái niệm xoá mềm thật: hai chỉ mục của nó đều khai `where deleted_at is null`
-- (#83), có đường khôi phục đặt `deleted_at = null`, và có việc dọn hẳn sau 30
-- ngày. Đếm cả dòng đã xoá thì "lịch ngày mai 15" có thể gồm những hẹn chủ tiệm
-- đã bỏ đi — con số đúng về mặt truy vấn, sai về mặt sự thật.
--
-- ⚠️ NÓI THẲNG PHẠM VI, ĐỪNG THỔI PHỒNG. Đây KHÔNG phải một lỗi đang gây hại
--   hôm nay, và cũng KHÔNG phải bản vá tốc độ:
--     · Đo 22/08: **0 / 9.667** lịch hẹn đang ở trạng thái xoá mềm, và tìm khắp
--       mã nguồn lẫn migration thì **chưa có đường nào đặt `deleted_at`** cho
--       bảng này — mới chỉ có đường khôi phục và đường dọn. Tức bệnh đang NGỦ.
--     · Đã thử giả thuyết "thiếu điều kiện nên không dùng được chỉ mục riêng
--       phần": ĐÚNG là kế hoạch truy vấn đổi từ quét bảng sang quét chỉ mục,
--       nhưng chạy 7 lượt mỗi bên thì TRUNG VỊ là 6,33 ms so 6,17 ms — chênh
--       nhau trong khoảng nhiễu. Lần đo ĐẦU TIÊN ra "8,9 ms so 21,5 ms" và suýt
--       thành một câu kết luận ngược; đó là nhiễu bộ nhớ đệm lượt đầu, không
--       phải kết quả. Ghi lại đây để lần sau không ai đo một lượt rồi kết luận.
--   Sửa vì nó ĐÚNG với ý nghĩa của cột, không vì đo được lợi ích. Giá phải trả
--   là bốn chữ trong mệnh đề lọc.
--
-- Ngoài phạm vi bản này, ĐỂ LẠI CHO NGƯỜI SAU: `lich_dem_ca_theo_tho` cũng đếm
-- `appointments` mà không loại dòng đã xoá. Không đụng ở đây vì nó thuộc mảng
-- chấm ca, cần người hiểu mảng đó xem lại.

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
    where a.tenant_id = tiem.id and a.status = 'cancelled' and a.deleted_at is null
      and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date
          between public.ngay_vn() - 14 and public.ngay_vn()
    group by 1
  ),
  khung as (
    select (extract(hour from a.start_at at time zone 'Asia/Ho_Chi_Minh')::int / 2) * 2 tu_gio,
           count(*)::int n
    from public.appointments a, tiem
    where a.tenant_id = tiem.id and a.status = 'cancelled' and a.deleted_at is null
      and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date = public.ngay_vn()
    group by 1
  ),
  dinh as (select tu_gio, n from khung order by n desc, tu_gio limit 1),
  dai as (
    select generate_series(public.ngay_vn() - 14, public.ngay_vn() - 1, interval '1 day')::date ngay
  ),
  hen_ngay as (
    select (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date ngay, count(*) n
    from public.appointments a, tiem
    where a.tenant_id = tiem.id and a.deleted_at is null
      and a.status not in ('cancelled', 'no_show')
      and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date
          between public.ngay_vn() - 14 and public.ngay_vn() - 1
    group by 1
  ),
  mai as (
    select count(*) n
    from public.appointments a, tiem
    where a.tenant_id = tiem.id and a.deleted_at is null
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
  'Bốn con số của hôm nay kèm mốc so sánh, khung giờ huỷ dồn cục, mốc lịch thường ngày. Bỏ qua lịch hẹn đã xoá mềm. Mọi mức nền dùng TRUNG VỊ (#343, #345, #346).';
