-- ════════════════════════════════════════════════════════════════════
-- #337 — VÁ BA LỖI DO CHÍNH BỘ KIỂM RLS BẮT ĐƯỢC Ở #334/#336
-- ════════════════════════════════════════════════════════════════════
-- ① `thuong_hieu_cong_khai(slug)` mở cho người lạ mà KHÔNG có lớp chặn nào.
--    Nó nhận một slug và trả lời "có tiệm này không" — tức là một đường DÒ
--    DANH SÁCH KHÁCH HÀNG của iFan, và nó đi vòng qua trần theo địa chỉ mạng
--    mà `loadStorefront` đặt cho trang mặt tiền. Cùng một rủi ro với
--    `storefront_view`, nhưng KHÔNG cùng lớp bảo vệ.
--    ⇒ Gộp hai trường thương hiệu VÀO `storefront_view` và XOÁ hàm kia. Một
--    cửa, một cái trần, không có cửa thứ hai để quên khoá.
--
-- ② `thu_nghiem_ab.bat_dau` mặc định `current_date` — tức GIỜ QUỐC TẾ. Tạo
--    thử nghiệm lúc 2 giờ sáng giờ Việt Nam thì nó ghi ngày HÔM QUA, và phép
--    "đã chạy đủ 14 ngày chưa" lệch một ngày.
--
-- ③ Cùng lỗi giờ quốc tế ở các hàm đếm và đọc kết quả: ngày của Việt Nam bị
--    cắt làm đôi lúc 7 giờ sáng. Founder xem "hôm nay" sẽ thấy một con số
--    không khớp với ngày của chính mình.
--
-- ⚠️ BÀI HỌC: cả ba lỗi đều do bộ kiểm bắt, không do người viết tự thấy. Hàm
--   mới mở cho `anon` thì PHẢI có lớp chặn hoặc phải khai vào danh sách công
--   khai có chủ ý — và ngày tháng ở kho này luôn là giờ Việt Nam.

CREATE OR REPLACE FUNCTION public.storefront_view(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tenant public.tenants%rowtype := private.storefront_resolve(p_slug);
  v_sf public.tenant_storefront%rowtype;
  v_catalog jsonb;
  v_fields jsonb;
  v_hours jsonb;
  v_closures jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  if v_tenant.id is null then
    raise exception 'not_found';
  end if;

  select * into v_sf from public.tenant_storefront where tenant_id = v_tenant.id;
  -- ĐỔI so với #80: trước đây `return jsonb_build_object('enabled', false)`.
  -- Tiệm chưa bật mặt tiền thì với người ngoài nó KHÔNG TỒN TẠI — cùng một
  -- ngoại lệ, cùng một mã HTTP, không có khe nào để dò.
  if v_sf.tenant_id is null or not v_sf.storefront_enabled then
    raise exception 'not_found';
  end if;

  select content -> 'lead_form_fields' into v_catalog
    from public.industry_packs where key = v_tenant.industry;

  -- Chỉ trả field ĐÃ BẬT (tenant_storefront.lead_form_fields), không trả cả danh mục.
  select coalesce(jsonb_agg(f), '[]'::jsonb) into v_fields
    from jsonb_array_elements(coalesce(v_catalog, '[]'::jsonb)) f
    where coalesce(v_sf.lead_form_fields, '[]'::jsonb) ? (f ->> 'key');

  select coalesce(jsonb_agg(jsonb_build_object(
           'weekday', h.weekday, 'is_closed', h.is_closed,
           'open_time', to_char(h.open_time, 'HH24:MI'),
           'close_time', to_char(h.close_time, 'HH24:MI'))
           order by h.weekday, h.open_time nulls first), '[]'::jsonb)
    into v_hours
    from public.business_hours h where h.tenant_id = v_tenant.id;

  -- Chỉ ngày nghỉ CÒN HIỆU LỰC/SẮP TỚI — ngày nghỉ đã qua không có ích cho
  -- khách xem và không cần lộ lịch sử vận hành của tiệm.
  select coalesce(jsonb_agg(jsonb_build_object(
           'date_from', c.date_from, 'date_to', c.date_to, 'reason', c.reason,
           'is_full_day', c.is_full_day,
           'open_time', to_char(c.open_time, 'HH24:MI'),
           'close_time', to_char(c.close_time, 'HH24:MI'))
           order by c.date_from), '[]'::jsonb)
    into v_closures
    from public.business_closures c
    where c.tenant_id = v_tenant.id
      and c.date_to >= (now() at time zone v_tenant.timezone)::date;

  -- THÊM #290: danh sách dịch vụ khách đặt được. Chỉ khi tiệm ĐÃ BẬT đặt lịch,
  -- và chỉ dịch vụ ĐANG BÁN có thời lượng — không trả cả bảng giá của tiệm.
  if v_sf.booking_enabled then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', i.id, 'name', i.name,
             'duration_minutes', i.duration_minutes,
             'price_vnd', i.price_vnd)
             order by i.sort_order, i.name), '[]'::jsonb)
      into v_items
      from public.items i
     where i.tenant_id = v_tenant.id
       and i.kind = 'service'
       and i.status = 'active'
       and i.duration_minutes is not null;
  end if;

  return jsonb_build_object(
    'enabled', true,
    'name', v_tenant.name,
    -- Thương hiệu tiệm (#337). GỘP VÀO ĐÂY thay vì một hàm riêng: hàm riêng là
    -- một cửa THỨ HAI cho người lạ hỏi "slug này có thật không", tức là một
    -- đường dò danh sách khách hàng của iFan mà KHÔNG đi qua trần theo địa chỉ
    -- mạng của `loadStorefront`. Cổng `rls-smoke` bắt đúng chuyện đó.
    'co_logo', nullif(btrim(coalesce(v_tenant.logo_url, '')), '') is not null,
    'mau', v_tenant.mau_thuong_hieu,
    'intro', v_sf.intro,
    'address', v_sf.address,
    'zalo_contact_url', v_sf.zalo_contact_url,
    'lead_form_enabled', v_sf.lead_form_enabled,
    'lead_form_fields', v_fields,
    'booking_enabled', v_sf.booking_enabled,
    'booking_items', v_items,
    'timezone', v_tenant.timezone,
    -- Giờ hiện tại + thứ TẠI TIỆM, kiểu wall-clock không offset — so sánh
    -- trực tiếp với 'hours' ở trên (cũng wall-clock), #88 không cần đụng múi
    -- giờ ở tầng JS.
    'now', (now() at time zone v_tenant.timezone),
    'today_weekday', extract(dow from (now() at time zone v_tenant.timezone))::int,
    'hours', v_hours,
    'closures', v_closures);
end $function$;

-- ── ① Xoá cửa thứ hai ───────────────────────────────────────────────
drop function if exists public.thuong_hieu_cong_khai(text);

-- ── ② Ngày bắt đầu thử nghiệm theo GIỜ VIỆT NAM ─────────────────────
alter table public.thu_nghiem_ab
  alter column bat_dau set default ((now() at time zone 'Asia/Ho_Chi_Minh')::date);

-- ── ③ Mọi phép "ngày" đều theo GIỜ VIỆT NAM ─────────────────────────
--
-- ⚠️ MỘT HÀM NHỎ, DÙNG CHUNG. Trước bản này mỗi chỗ tự gõ `current_date`, và
--   một chỗ sót là số liệu lệch một ngày mà không ai thấy — vì con số vẫn có,
--   chỉ là rơi nhầm ô.
create or replace function public.ngay_vn()
returns date
language sql
stable
as $$ select ((now() at time zone 'Asia/Ho_Chi_Minh')::date) $$;

comment on function public.ngay_vn() is
  'Hôm nay theo giờ Việt Nam. Dùng THAY current_date ở mọi phép đếm theo ngày — current_date là giờ quốc tế nên cắt ngày Việt Nam làm đôi lúc 7 giờ sáng (#337).';

grant execute on function public.ngay_vn() to anon, authenticated, service_role;

create or replace function public.ghi_luot_cong_khai(
  p_duong_dan text,
  p_loai text,
  p_bien_the text default ''
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_duong_dan is null or p_loai not in ('xem', 'bam-dang-ky') then
    return;
  end if;
  if not (
    p_duong_dan in ('/', '/bang-gia', '/tinh-nang', '/lo-trinh', '/login',
                    '/signup', '/forgot-password', '/privacy', '/terms')
    or p_duong_dan ~ '^/nganh/[a-z]{2,12}$'
  ) then
    return;
  end if;

  insert into public.luot_cong_khai (ngay, duong_dan, loai, bien_the, so)
  values (public.ngay_vn(), p_duong_dan, p_loai, coalesce(left(p_bien_the, 20), ''), 1)
  on conflict (ngay, duong_dan, loai, bien_the)
  do update set so = public.luot_cong_khai.so + 1;
end;
$$;

revoke all on function public.ghi_luot_cong_khai(text, text, text) from public, anon, authenticated;
grant execute on function public.ghi_luot_cong_khai(text, text, text) to service_role;

create or replace function public.thu_nghiem_hom_nay(p_trang text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'khoa', x.khoa,
        'bien_the', case when (public.ngay_vn() - date '1970-01-01') % 2 = 0 then 'a' else 'b' end,
        'cau', case when (public.ngay_vn() - date '1970-01-01') % 2 = 0 then x.cau_a else x.cau_b end
      )
      from public.thu_nghiem_ab x
      where x.trang = p_trang and x.dang_chay
      limit 1
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.thu_nghiem_hom_nay(text) from public;
grant execute on function public.thu_nghiem_hom_nay(text) to anon, authenticated;

create or replace function public.admin_phieu_khach_vao(p_so_ngay integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.is_platform_admin() then '{}'::jsonb else
    (
      with khoang as (
        select (public.ngay_vn() - (greatest(least(coalesce(p_so_ngay, 7), 365), 1) - 1))::date as tu
      ),
      dem as (
        select
          coalesce(sum(so) filter (where loai = 'xem'), 0) b1,
          coalesce(sum(so) filter (where loai = 'xem' and duong_dan = '/bang-gia'), 0) b2,
          coalesce(sum(so) filter (where loai = 'bam-dang-ky'), 0) b3,
          coalesce(sum(so) filter (where loai = 'xem' and duong_dan = '/signup'), 0) b4
        from public.luot_cong_khai, khoang
        where ngay >= khoang.tu
      ),
      taiKhoan as (
        select count(*)::int n from auth.users, khoang
        where created_at >= khoang.tu and deleted_at is null
      ),
      tiem as (
        select count(*)::int n from public.tenants, khoang
        where created_at >= khoang.tu and coalesce(is_sample, false) = false
      ),
      theoTrang as (
        select coalesce(jsonb_agg(x order by (x->>'xem')::int desc), '[]'::jsonb) j
        from (
          select jsonb_build_object(
            'duong_dan', duong_dan,
            'xem', coalesce(sum(so) filter (where loai = 'xem'), 0),
            'bam', coalesce(sum(so) filter (where loai = 'bam-dang-ky'), 0)
          ) x
          from public.luot_cong_khai, khoang
          where ngay >= khoang.tu
          group by duong_dan
        ) s
      )
      select jsonb_build_object(
        'so_ngay', greatest(least(coalesce(p_so_ngay, 7), 365), 1),
        'b1_ghe', dem.b1, 'b2_bang_gia', dem.b2, 'b3_bam_dang_ky', dem.b3,
        'b4_mo_dang_ky', dem.b4, 'b5_tao_tai_khoan', taiKhoan.n, 'b6_lap_tiem', tiem.n,
        'theo_trang', theoTrang.j
      )
      from dem, taiKhoan, tiem, theoTrang
    )
  end;
$$;

revoke all on function public.admin_phieu_khach_vao(integer) from public, anon;
grant execute on function public.admin_phieu_khach_vao(integer) to authenticated;

create or replace function public.admin_ket_qua_thu_nghiem(p_khoa text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.is_platform_admin() then '{}'::jsonb else
    (
      with x as (
        select * from public.thu_nghiem_ab where khoa = p_khoa
      ),
      d as (
        select
          coalesce(sum(l.so) filter (where l.bien_the = 'a' and l.loai = 'xem'), 0)::numeric xem_a,
          coalesce(sum(l.so) filter (where l.bien_the = 'a' and l.loai = 'bam-dang-ky'), 0)::numeric bam_a,
          coalesce(sum(l.so) filter (where l.bien_the = 'b' and l.loai = 'xem'), 0)::numeric xem_b,
          coalesce(sum(l.so) filter (where l.bien_the = 'b' and l.loai = 'bam-dang-ky'), 0)::numeric bam_b
        from public.luot_cong_khai l, x
        where l.duong_dan = x.trang and l.ngay >= x.bat_dau
      ),
      t as (
        select d.*, x.*,
          (public.ngay_vn() - x.bat_dau) so_ngay,
          case when d.xem_a > 0 then d.bam_a / d.xem_a else 0 end ti_a,
          case when d.xem_b > 0 then d.bam_b / d.xem_b else 0 end ti_b
        from d, x
      ),
      z as (
        select t.*,
          -- Phép kiểm hai tỉ lệ. Mẫu gộp `p` là tỉ lệ chung của cả hai bên.
          case
            when t.xem_a < 30 or t.xem_b < 30 then 0
            else
              abs(t.ti_a - t.ti_b) / nullif(
                sqrt(
                  ((t.bam_a + t.bam_b) / (t.xem_a + t.xem_b))
                  * (1 - (t.bam_a + t.bam_b) / (t.xem_a + t.xem_b))
                  * (1 / t.xem_a + 1 / t.xem_b)
                ), 0)
          end diem_z
        from t
      )
      select jsonb_build_object(
        'khoa', z.khoa, 'trang', z.trang, 'cau_a', z.cau_a, 'cau_b', z.cau_b,
        'dang_chay', z.dang_chay, 'so_ngay', z.so_ngay,
        'xem_a', z.xem_a, 'bam_a', z.bam_a, 'ti_a', round(z.ti_a * 100, 1),
        'xem_b', z.xem_b, 'bam_b', z.bam_b, 'ti_b', round(z.ti_b * 100, 1),
        'du_ngay', z.so_ngay >= 14,
        'du_luot', z.xem_a >= 300 and z.xem_b >= 300,
        'con_thieu', greatest(0, 300 - least(z.xem_a, z.xem_b)),
        'ket_luan_duoc', z.so_ngay >= 14 and z.xem_a >= 300 and z.xem_b >= 300
                          and coalesce(z.diem_z, 0) >= 1.96,
        'ben_hon', case when z.ti_b > z.ti_a then 'b' else 'a' end
      )
      from z
    )
  end;
$$;

revoke all on function public.admin_ket_qua_thu_nghiem(text) from public, anon;
grant execute on function public.admin_ket_qua_thu_nghiem(text) to authenticated;
