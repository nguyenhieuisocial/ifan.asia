-- ════════════════════════════════════════════════════════════════════
-- #347 — BA HÀM TÀI CHÍNH ĐANG CHO NHÂN VIÊN THƯỜNG XEM SỐ CẢ TIỆM
-- ════════════════════════════════════════════════════════════════════
-- LỖ NÀY DO CHÍNH #340/#342/#343 TẠO RA, và đã THỬ THẬT ngày 22/08 chứ không
-- phải suy đoán: đăng nhập bằng một tài khoản vai `staff` của tiệm demo rồi
-- gọi thẳng ba hàm, kết quả trả về **giống hệt** tài khoản chủ tiệm —
-- `cong_no_khach` đưa ra toàn bộ danh sách khách còn nợ KÈM TÊN VÀ SỐ ĐIỆN
-- THOẠI, `tien_giu_ho` đưa ra mọi gói khách đã trả trước, `so_lieu_hom_nay`
-- đưa ra số của cả tiệm.
--
-- NGUYÊN NHÂN GỐC: cả ba khai `security definer` nên chạy bằng quyền chủ sở
-- hữu và **đi vòng qua RLS**. Mà chính sách RLS của `orders`, `order_lines`,
-- `appointments`, `contacts` đều có nhánh hẹp: vai `staff` chỉ thấy dòng của
-- riêng mình. Đi vòng qua nó là xoá luôn nhánh hẹp đó.
--
-- ⚠️ MÀN CÓ KHOÁ VAI KHÔNG PHẢI LÀ KHOÁ. Trang Công nợ đã chặn đúng
--   owner/admin/manager. Nhưng hàm thì gọi được THẲNG qua API bằng khoá công
--   khai của bất kỳ ai đã đăng nhập — không cần mở trang. Khoá phải nằm ở HÀM.
--
-- HAI CÁCH CHỮA, DÙNG CẢ HAI VÌ HAI HÀM KHÁC BẢN CHẤT:
--   · `so_lieu_hom_nay` → đổi sang `security invoker`. Số liệu hôm nay là thứ
--     nhân viên NÊN xem, chỉ là phải xem phần của mình. Để RLS tự lo, đúng như
--     `dashboard_sales` mà hàng ô số trên màn Tổng quan vẫn dùng.
--   · `cong_no_khach` + `tien_giu_ho` → chốt vai thẳng. Đây là sổ tiền của
--     tiệm, không có khái niệm "phần của tôi"; trang đã chốt owner/admin/manager
--     thì hàm phải chốt y hệt.

/**
 * Trả về mã tiệm CHỈ KHI người gọi được phép xem sổ tiền, còn lại trả null.
 *
 * ⚠️ TRẢ null CHỨ KHÔNG BÁO LỖI. Ba hàm gọi nó đều đã có sẵn nhánh "tiệm là
 *   null thì trả về rỗng" (dành cho người chưa vào tiệm nào). Dùng lại đúng
 *   nhánh đó nghĩa là không phải sửa gì thêm bên trong — càng ít chỗ sửa thì
 *   càng ít chỗ sai.
 */
create or replace function public.tiem_neu_xem_duoc_tien()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.app_role() in ('owner', 'admin', 'manager')
    then public.current_tenant_id()
    else null
  end;
$$;

revoke all on function public.tiem_neu_xem_duoc_tien() from public, anon;
grant execute on function public.tiem_neu_xem_duoc_tien() to authenticated;

comment on function public.tiem_neu_xem_duoc_tien() is
  'Mã tiệm nếu người gọi là chủ/quản trị/quản lý, ngược lại null. Dùng cho các hàm sổ tiền chạy quyền chủ sở hữu (#347).';

create or replace function public.cong_no_khach(p_gioi_han integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with tiem as (select public.tiem_neu_xem_duoc_tien() id),
  don as (
    select o.id, o.contact_id, o.updated_at as chot_luc,
      coalesce((
        select sum(l.qty * l.unit_price_vnd - coalesce(l.discount_vnd, 0))
        from public.order_lines l where l.order_id = o.id
      ), 0) tong,
      coalesce((
        select sum(p.amount_vnd) from public.order_payments p where p.order_id = o.id
      ), 0) da_thu
    from public.orders o, tiem
    where o.tenant_id = tiem.id
      and o.kind = 'order'
      and o.status in ('confirmed', 'completed')
  ),
  no as (
    select d.*, (d.tong - d.da_thu) con,
      greatest(0, (public.ngay_vn() - d.chot_luc::date)) so_ngay
    from don d
    where d.tong - d.da_thu > 0
  )
  select case when (select id from tiem) is null then '{}'::jsonb else
    jsonb_build_object(
      'tong', coalesce((select sum(con) from no), 0),
      'so_khach', (select count(distinct contact_id) from no),
      'so_don', (select count(*) from no),
      'tuoi', jsonb_build_object(
        'd30',  coalesce((select sum(con) from no where so_ngay <= 30), 0),
        'd60',  coalesce((select sum(con) from no where so_ngay between 31 and 60), 0),
        'd90',  coalesce((select sum(con) from no where so_ngay between 61 and 90), 0),
        'tren90', coalesce((select sum(con) from no where so_ngay > 90), 0)
      ),
      'khach', coalesce((
        select jsonb_agg(x order by (x->>'con')::bigint desc)
        from (
          select jsonb_build_object(
            'contact_id', n.contact_id,
            'ten', coalesce(ct.full_name, ''),
            'dien_thoai', coalesce(ct.phone, ''),
            'con', sum(n.con),
            'so_don', count(*),
            'ngay_cu_nhat', max(n.so_ngay)
          ) x
          from no n
          left join public.contacts ct on ct.id = n.contact_id
          group by n.contact_id, ct.full_name, ct.phone
          order by sum(n.con) desc
          limit greatest(least(coalesce(p_gioi_han, 100), 500), 1)
        ) s
      ), '[]'::jsonb)
    )
  end;
$$;

create or replace function public.tien_giu_ho(p_gioi_han integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with tiem as (select public.tiem_neu_xem_duoc_tien() id),
  g as (
    select c.id, c.contact_id, c.price_paid_vnd, c.sessions_total, c.sessions_used,
           c.expires_at, c.package_id,
           (c.sessions_total - c.sessions_used) con_buoi,
           round(c.price_paid_vnd::numeric
                 * (c.sessions_total - c.sessions_used)
                 / nullif(c.sessions_total, 0))::bigint dang_giu
    from public.contracts c, tiem
    where c.tenant_id = tiem.id
      and c.status = 'active'
      and c.sessions_total > 0
      and c.sessions_used < c.sessions_total
  )
  select case when (select id from tiem) is null then '{}'::jsonb else
    jsonb_build_object(
      'dang_giu', coalesce((select sum(dang_giu) from g), 0),
      'da_thu', coalesce((select sum(price_paid_vnd) from g), 0),
      'so_goi', (select count(*) from g),
      'so_buoi_con', coalesce((select sum(con_buoi) from g), 0),
      'sap_het_han', coalesce((
        select sum(dang_giu) from g
        where expires_at is not null and expires_at::date <= public.ngay_vn() + 30
      ), 0),
      'goi', coalesce((
        select jsonb_agg(x order by (x->>'dang_giu')::bigint desc)
        from (
          select jsonb_build_object(
            'contract_id', g.id,
            'contact_id', g.contact_id,
            'ten', coalesce(ct.full_name, ''),
            -- ĐÚNG BẢNG: `service_packages`, không phải `items` (#341).
            'goi', coalesce(pk.name, ''),
            'dang_giu', g.dang_giu,
            'con_buoi', g.con_buoi,
            'tong_buoi', g.sessions_total,
            'het_han', g.expires_at,
            -- Số ngày còn lại TÍNH Ở CƠ SỞ DỮ LIỆU, không tính ở trình duyệt.
            -- Hai lý do: (1) trình duyệt dùng đồng hồ của máy khách, lệch múi
            -- giờ là lệch ngày; (2) gọi `Date.now()` lúc dựng giao diện là
            -- phép tính không thuần khiết — React báo lỗi `react-hooks/purity`,
            -- và lời báo đó đúng: cùng một dữ liệu phải cho ra cùng một màn.
            'con_ngay', case when g.expires_at is null then null
                             else (g.expires_at::date - public.ngay_vn()) end
          ) x
          from g
          left join public.contacts ct on ct.id = g.contact_id
          left join public.service_packages pk on pk.id = g.package_id
          order by g.dang_giu desc
          limit greatest(least(coalesce(p_gioi_han, 100), 500), 1)
        ) s
      ), '[]'::jsonb)
    )
  end;
$$;

create or replace function public.so_lieu_hom_nay()
returns jsonb
language sql
stable
security invoker
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

revoke all on function public.cong_no_khach(integer) from public, anon;
grant execute on function public.cong_no_khach(integer) to authenticated;
revoke all on function public.tien_giu_ho(integer) from public, anon;
grant execute on function public.tien_giu_ho(integer) to authenticated;
revoke all on function public.so_lieu_hom_nay() from public, anon;
grant execute on function public.so_lieu_hom_nay() to authenticated;

comment on function public.cong_no_khach(integer) is
  'Ai còn nợ tiệm bao nhiêu. CHỈ chủ/quản trị/quản lý gọi được — nhân viên thường nhận về rỗng (#340, #347).';
comment on function public.tien_giu_ho(integer) is
  'Tiền khách trả trước mà tiệm chưa làm xong. CHỈ chủ/quản trị/quản lý gọi được (#340, #342, #347).';
comment on function public.so_lieu_hom_nay() is
  'Bốn con số của hôm nay kèm mốc so sánh. Chạy quyền NGƯỜI GỌI: nhân viên thường thấy phần của mình, quản lý thấy cả tiệm (#343, #345, #346, #347).';
