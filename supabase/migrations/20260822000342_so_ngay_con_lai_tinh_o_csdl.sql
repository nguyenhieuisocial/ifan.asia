-- ════════════════════════════════════════════════════════════════════
-- #342 — SỐ NGÀY CÒN LẠI CỦA GÓI: TÍNH Ở CSDL, KHÔNG TÍNH Ở TRÌNH DUYỆT
-- ════════════════════════════════════════════════════════════════════
-- Bản đầu để màn tự tính "còn bao nhiêu ngày" bằng `Date.now()`. Hai chỗ sai:
--
--   ① Đồng hồ của MÁY KHÁCH. Máy đặt sai múi giờ là hạn gói lệch một ngày, và
--      đúng cái ngày cuối cùng ấy mới là ngày quan trọng nhất với khách.
--   ② Gọi `Date.now()` lúc dựng giao diện là phép tính KHÔNG THUẦN KHIẾT —
--      cùng một dữ liệu cho ra hai màn khác nhau ở hai thời điểm. React chặn
--      đúng chỗ này (`react-hooks/purity`), và lời chặn đó có lý.
--
-- ⇒ Cơ sở dữ liệu đã biết hôm nay là ngày nào theo giờ Việt Nam (`ngay_vn()`,
--   #337). Để nó tính một lần, màn chỉ việc hiện.

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

revoke all on function public.tien_giu_ho(integer) from public, anon;
grant execute on function public.tien_giu_ho(integer) to authenticated;
