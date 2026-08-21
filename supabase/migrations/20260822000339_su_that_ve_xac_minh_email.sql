-- ════════════════════════════════════════════════════════════════════
-- #339 — MÀN QUẢN TRỊ ĐANG NÓI MỘT ĐIỀU KHÔNG ĐÚNG VỀ "ĐÃ XÁC MINH"
-- ════════════════════════════════════════════════════════════════════
-- Đo trên bản thật 22/08:
--
--     tổng tài khoản                    100
--     "đã xác minh"                      99
--     trong đó xác minh TRONG < 2 GIÂY   97   ← máy tự xác minh
--     trong đó có người thật bấm thư      2
--     số thư xác minh từng gửi            1
--
-- Nguyên nhân: cấu hình xác thực của dự án đang đặt `mailer_autoconfirm = true`
-- — nghĩa là TẮT bước xác minh email. Ai đăng ký bằng địa chỉ nào cũng được
-- đánh dấu "đã xác minh" ngay lập tức, kể cả địa chỉ họ không sở hữu.
--
-- ⚠️ ĐÂY CÓ THỂ LÀ CHỦ ĐÍCH. Nhiều sản phẩm Việt Nam tắt xác minh để bớt rào
--   cản lúc đăng ký — người bán hàng ít khi mở hộp thư. Bản vá này KHÔNG bật
--   lại xác minh: đó là đánh đổi giữa "dễ đăng ký" và "tin được địa chỉ", và
--   là quyết định sản phẩm của chủ SaaS, không phải của người viết mã.
--
-- ⚠️ NHƯNG MÀN QUẢN TRỊ THÌ PHẢI NÓI THẬT. Nó đang hiện huy hiệu "chưa xác
--   minh" và nút "gửi lại thư xác minh" — cả hai ngụ ý rằng xác minh là có
--   thật. Người đọc màn sẽ tin rằng 99 địa chỉ kia đã được chủ nhân xác nhận.
--   Không phải.
--
-- ⇒ Bản vá này CHỈ thêm số liệu để màn tự nói ra sự thật. Không đổi hành vi
--   đăng nhập, không đổi cấu hình, không đụng tới tài khoản nào.
--
-- ⚠️ ĐO THỰC TẾ, KHÔNG ĐỌC CẤU HÌNH. Ứng dụng không có chìa khoá quản trị để
--   hỏi Supabase "xác minh đang bật hay tắt". Nhưng dữ liệu tự khai: khoảng
--   cách giữa lúc tạo tài khoản và lúc "xác minh" mà dưới 2 giây thì không có
--   con người nào kịp mở hộp thư. Đo cái xảy ra, không đọc cái được khai.

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
        ),
        -- Máy tự xác minh: chênh lệch dưới 2 giây thì không con người nào kịp
        -- mở hộp thư và bấm vào liên kết.
        'xac_minh_tuc_thi', count(*) filter (
          where u.email_confirmed_at is not null
            and u.email_confirmed_at - u.created_at < interval '2 seconds'
        ),
        'xac_minh_co_nguoi', count(*) filter (
          where u.email_confirmed_at is not null
            and u.email_confirmed_at - u.created_at >= interval '2 seconds'
        )
      )
      from auth.users u
      where u.deleted_at is null
    )
  end;
$$;

revoke all on function public.admin_users_dem() from public, anon;
grant execute on function public.admin_users_dem() to authenticated;

comment on function public.admin_users_dem() is
  'Đếm người dùng theo từng nhóm lọc cho màn quản trị. Kèm hai số ĐO SỰ THẬT về xác minh email: bao nhiêu tài khoản do MÁY tự xác minh (dưới 2 giây) và bao nhiêu do NGƯỜI thật bấm thư — vì huy hiệu "đã xác minh" hiện không có nghĩa như tên nó (#339).';
