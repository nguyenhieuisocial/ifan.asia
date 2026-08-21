-- ════════════════════════════════════════════════════════════════════
-- QUẢN TRỊ — DANH SÁCH NGƯỜI DÙNG TOÀN NỀN TẢNG
-- ════════════════════════════════════════════════════════════════════
--
-- ┌─ CHỖ HỞ ──────────────────────────────────────────────────────────
-- Bảng điều hành đã thấy được TIỆM (gói, doanh thu, còn hoạt động không) nhưng
-- chưa thấy NGƯỜI: 99 tài khoản mà không có màn nào tra được ai là ai, thuộc
-- tiệm nào, đăng nhập lần cuối bao giờ. Khi một người nhắn "tôi không vào
-- được", hiện không có chỗ nào để tra — mà đó là câu hỏi hỗ trợ hay gặp nhất.
--
-- ┌─ VÌ SAO PHẢI LÀ HÀM, KHÔNG PHẢI TRUY VẤN THẲNG ───────────────────
-- Dữ liệu nằm ở `auth.users` — bảng của hệ xác thực, KHÔNG mở cho ứng dụng đọc
-- và đúng ra là không nên mở. Một hàm `security definer` cho phép đọc đúng
-- những cột cần, dưới một phép kiểm quyền duy nhất, thay vì nới quyền cả bảng.
--
-- ⚠️ CHỐT QUYỀN NẰM NGAY TRONG HÀM (`is_platform_admin()`), không chỉ ở màn
--   hình. Màn `/admin` đã chặn, nhưng hàm gọi được thẳng qua API — chốt ở màn
--   là chốt ở phía người gọi, tức là không phải chốt.
--
-- ⚠️ TUYỆT ĐỐI KHÔNG trả ra mật khẩu băm, mã xác nhận, mã đặt lại, hay bất kỳ
--   cột `*_token` nào của `auth.users`. Không có lý do chính đáng nào để một
--   màn quản trị đụng tới chúng, và một cột lỡ thêm vào đây là một cột đi thẳng
--   ra trình duyệt.
--
-- ⚠️ MỘT DÒNG MỘT NGƯỜI, không phải một dòng một tư cách thành viên. Người làm
--   ở hai tiệm mà tách hai dòng thì mọi phép đếm số người đều sai. Các tiệm gom
--   vào một mảng JSON bên trong.

create or replace function public.admin_users(
  p_tu_khoa text default null,
  p_loc text default 'tat-ca',
  p_limit integer default 100,
  p_offset integer default 0
) returns table (
  user_id uuid,
  ten text,
  email text,
  phone text,
  tao_luc timestamptz,
  dang_nhap_cuoi timestamptz,
  da_xac_minh boolean,
  tiem jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with loc as (
    select
      u.id,
      coalesce(p.display_name, '') as ten,
      u.email::text as email,
      coalesce(p.phone, u.phone::text, '') as phone,
      u.created_at,
      u.last_sign_in_at,
      (u.email_confirmed_at is not null) as da_xac_minh
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    where u.deleted_at is null
  )
  select
    l.id,
    l.ten,
    l.email,
    l.phone,
    l.created_at,
    l.last_sign_in_at,
    l.da_xac_minh,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('ten', t.name, 'vai', m.role) order by t.name)
        from public.tenant_members m
        join public.tenants t on t.id = m.tenant_id
        where m.user_id = l.id and coalesce(m.status, 'active') = 'active'
      ),
      '[]'::jsonb
    ) as tiem
  from loc l
  -- Chốt quyền: không phải chủ SaaS thì hàm trả RỖNG, không ném lỗi. Ném lỗi là
  -- nói cho người dò biết hàm này tồn tại và họ vừa chạm đúng chỗ.
  where public.is_platform_admin()
    and (
      p_tu_khoa is null or btrim(p_tu_khoa) = ''
      or l.ten ilike '%' || btrim(p_tu_khoa) || '%'
      or l.email ilike '%' || btrim(p_tu_khoa) || '%'
      -- Tìm theo số điện thoại: bỏ mọi ký tự không phải chữ số ở CẢ HAI phía,
      -- vì người ta gõ "0912 345 678" còn kho lưu "0912345678".
      or (
        regexp_replace(btrim(p_tu_khoa), '[^0-9]', '', 'g') <> ''
        and regexp_replace(l.phone, '[^0-9]', '', 'g')
            like '%' || regexp_replace(btrim(p_tu_khoa), '[^0-9]', '', 'g') || '%'
      )
    )
    and (
      p_loc = 'tat-ca'
      or (p_loc = 'chua-xac-minh' and not l.da_xac_minh)
      or (p_loc = 'chua-dang-nhap' and l.last_sign_in_at is null)
      or (p_loc = 'nguoi-nguoi' and l.last_sign_in_at < now() - interval '30 days')
      or (
        p_loc = 'chua-co-tiem'
        and not exists (
          select 1 from public.tenant_members m
          where m.user_id = l.id and coalesce(m.status, 'active') = 'active'
        )
      )
    )
  -- Mặc định người MỚI NHẤT lên đầu: founder mở màn này hay vì "ai vừa đăng ký"
  -- và "ai vừa nhắn là không vào được" — cả hai đều là người mới.
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.admin_users(text, text, integer, integer) from public, anon;
grant execute on function public.admin_users(text, text, integer, integer) to authenticated;

/** Đếm theo từng nhóm lọc — để các chip lọc hiện đúng con số. */
create or replace function public.admin_users_dem()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.is_platform_admin() then '{}'::jsonb else
    (
      select jsonb_build_object(
        'tat_ca', count(*),
        'chua_xac_minh', count(*) filter (where u.email_confirmed_at is null),
        'chua_dang_nhap', count(*) filter (where u.last_sign_in_at is null),
        'nguoi_nguoi', count(*) filter (where u.last_sign_in_at < now() - interval '30 days'),
        'chua_co_tiem', count(*) filter (
          where not exists (
            select 1 from public.tenant_members m
            where m.user_id = u.id and coalesce(m.status, 'active') = 'active'
          )
        )
      )
      from auth.users u
      where u.deleted_at is null
    )
  end;
$$;

revoke all on function public.admin_users_dem() from public, anon;
grant execute on function public.admin_users_dem() to authenticated;

comment on function public.admin_users(text, text, integer, integer) is
  'Danh sách người dùng toàn nền tảng cho chủ SaaS. MỘT DÒNG MỘT NGƯỜI (tiệm gom vào mảng JSON) — tách theo tư cách thành viên thì mọi phép đếm số người đều sai. Không phải chủ SaaS thì trả RỖNG chứ không ném lỗi. Không bao giờ trả mật khẩu băm hay mã đăng nhập — #330.';
