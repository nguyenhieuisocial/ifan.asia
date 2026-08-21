-- ════════════════════════════════════════════════════════════════════
-- #340 — CÔNG NỢ KHÁCH & TIỀN GIỮ HỘ (thẻ `man-cong-no-va-tien-giu-ho`)
-- ════════════════════════════════════════════════════════════════════
-- Hai câu hỏi mà chủ tiệm hôm nay KHÔNG có chỗ nào để hỏi:
--
--   ① "Ai còn nợ tôi bao nhiêu?" — phải mở TỪNG đơn ra xem. Đo trên dữ liệu
--      thật 22/08: 346 đơn đã chốt chưa thu đủ, 324 khách, tổng 166 triệu.
--
--   ② "Trong két có bao nhiêu thật sự là của tôi?" — nguy hơn hẳn. Tiền bán
--      gói buổi trả trước đang được đọc như LÃI. Đo thật: các tiệm thu về
--      681 triệu tiền gói, nhưng 588 triệu là buổi CHƯA LÀM (490 buổi còn nợ
--      khách). Tiêu vào chỗ đó là tiêu tiền của người ta.
--
-- ⚠️ HAI CON SỐ NÀY KHÔNG ĐƯỢC CỘNG HAY TRỪ VỚI NHAU. "Khách nợ mình" là tiền
--   SẼ VỀ; "giữ hộ khách" là tiền PHẢI TRẢ LẠI BẰNG DỊCH VỤ. Gộp lại ra một
--   con số vô nghĩa. Hàm trả về hai khối riêng, và màn để cạnh nhau chứ không
--   cộng.
--
-- ⚠️ CHỈ TÍNH ĐƠN ĐÃ CHỐT (`confirmed`/`completed`). Đơn còn nháp thì chưa ai
--   nợ ai — gộp vào là thổi phồng con số và chủ tiệm sẽ gọi đòi một khoản chưa
--   tồn tại.
--
-- ⚠️ TUỔI NỢ TÍNH TỪ NGÀY CHỐT, KHÔNG TỪ NGÀY TẠO. Đơn nháp nằm đó ba tháng
--   rồi mới chốt thì nó không phải nợ ba tháng. `orders` không có cột "ngày
--   chốt" riêng nên dùng `updated_at` — lần đổi cuối của một đơn đã chốt gần
--   như luôn là chính lúc chốt. Không hoàn hảo, và đã ghi ra đây thay vì để
--   người sau tưởng là chính xác.
--
-- ⚠️ TIỀN GIỮ HỘ CHIA ĐỀU THEO BUỔI, không theo thời gian. Gói 10 buổi 20
--   triệu, làm 3 buổi ⇒ đã thực hiện 6 triệu. Chia theo ngày sẽ sai khi khách
--   đi thưa hoặc đi dồn.

/**
 * CÔNG NỢ KHÁCH — ai còn nợ tiệm bao nhiêu, và nợ bao lâu rồi.
 *
 * Trả về: tổng, chia theo tuổi nợ, và danh sách khách xếp theo SỐ TIỀN giảm
 * dần (không xếp theo tên — chủ tiệm mở màn này để biết gọi ai trước).
 */
create or replace function public.cong_no_khach(p_gioi_han integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with tiem as (select public.current_tenant_id() id),
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

revoke all on function public.cong_no_khach(integer) from public, anon;
grant execute on function public.cong_no_khach(integer) to authenticated;

comment on function public.cong_no_khach(integer) is
  'Ai còn nợ tiệm bao nhiêu. CHỈ đơn đã chốt; tuổi nợ tính từ ngày chốt. Xếp theo SỐ TIỀN giảm dần (#340).';

/**
 * TIỀN GIỮ HỘ KHÁCH — gói buổi đã thu tiền nhưng chưa làm xong.
 *
 * ⚠️ ĐÂY KHÔNG PHẢI LÃI. Khách đòi lại là phải trả. Chỉ phần buổi ĐÃ LÀM mới
 *   là doanh thu của tiệm. Tên trường cố ý là `dang_giu` chứ không phải
 *   `doanh_thu` — để không ai lỡ tay cộng nó vào doanh thu ở một màn khác.
 */
create or replace function public.tien_giu_ho(p_gioi_han integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with tiem as (select public.current_tenant_id() id),
  g as (
    select c.id, c.contact_id, c.price_paid_vnd, c.sessions_total, c.sessions_used,
           c.expires_at, c.package_id,
           (c.sessions_total - c.sessions_used) con_buoi,
           -- Chia đều theo BUỔI. `nullif` chặn chia cho 0 khi gói khai 0 buổi.
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
      -- Sắp hết hạn trong 30 ngày: vừa là lúc nên nhắc khách đi làm, vừa là lúc
      -- khoản giữ hộ sắp thành doanh thu thật.
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
            'goi', coalesce(pk.name, ''),
            'dang_giu', g.dang_giu,
            'con_buoi', g.con_buoi,
            'tong_buoi', g.sessions_total,
            'het_han', g.expires_at
          ) x
          from g
          left join public.contacts ct on ct.id = g.contact_id
          left join public.items pk on pk.id = g.package_id
          order by g.dang_giu desc
          limit greatest(least(coalesce(p_gioi_han, 100), 500), 1)
        ) s
      ), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.tien_giu_ho(integer) from public, anon;
grant execute on function public.tien_giu_ho(integer) to authenticated;

comment on function public.tien_giu_ho(integer) is
  'Tiền gói buổi đã thu nhưng CHƯA LÀM — tiệm đang giữ hộ khách, KHÔNG phải lãi. Chia đều theo buổi (#340).';
