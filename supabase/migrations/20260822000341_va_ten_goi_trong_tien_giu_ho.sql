-- ════════════════════════════════════════════════════════════════════
-- #341 — TÊN GÓI BỊ TRỐNG TRONG BẢNG "TIỀN GIỮ HỘ"
-- ════════════════════════════════════════════════════════════════════
-- Hàm `tien_giu_ho` (#340) nối tên gói từ bảng `items`. Sai bảng:
-- `contracts.package_id` trỏ sang **`service_packages`**, không phải `items`.
--
-- Nối sai bảng KHÔNG ném lỗi — `left join` trả null, và màn hiện một cột tên
-- gói TRỐNG. Chủ tiệm nhìn thấy "Chị Lan · (trống) · 3,4 tr" và không biết đó
-- là gói gì để nhắc khách đi làm. Đúng lớp bệnh im lặng: có số, thiếu nghĩa.
--
-- ⚠️ Bắt được vì đã chạy hàm trên DỮ LIỆU THẬT rồi ĐỌC kết quả, không phải vì
--   đọc lại mã. `left join` sai bảng là thứ không lộ ra ở bất kỳ phép soát
--   tĩnh nào.

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
            'het_han', g.expires_at
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

revoke all on function public.tien_giu_ho(integer) from public, anon;
grant execute on function public.tien_giu_ho(integer) to authenticated;
