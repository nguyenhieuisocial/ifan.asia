-- ════════════════════════════════════════════════════════════════════
-- #338 — PHỄU KHÁCH VÀO: BẬC ⑤ ĐANG ĐẾM NHẦM NGƯỜI
-- ════════════════════════════════════════════════════════════════════
-- Đo trên bản thật 22/08, bậc ⑤ "Tạo xong tài khoản" trả về **89** trong khi
-- bậc ④ "Mở màn Đăng ký" là **1** — màn in ra "8900% của bậc trên", một con số
-- vô nghĩa và làm hỏng lòng tin vào cả cái phễu.
--
-- Soi ra: 89 tài khoản đó gần như toàn bộ là TÀI KHOẢN NHÂN VIÊN do chính chủ
-- tiệm tạo (`…@staff.ifan.local`) và tài khoản dựng sẵn cho tiệm mẫu. Không ai
-- trong số đó đi qua trang giới thiệu rồi bấm Đăng ký — họ được cấp từ bên
-- trong. Gộp họ vào phễu là trộn hai luồng khác hẳn nhau.
--
-- ⚠️ ĐÂY LÀ LỖI ĐỊNH NGHĨA, KHÔNG PHẢI LỖI SỐ HỌC. Con số 89 vẫn đúng với câu
--   hỏi "có bao nhiêu tài khoản mới" — nó chỉ SAI với câu hỏi "có bao nhiêu
--   người tự đăng ký". Phễu hỏi câu thứ hai.
--
-- ⚠️ Bậc ⑤ và ⑥ VẪN có thể lớn hơn bậc ④, và đó là bình thường: bộ đếm trang
--   mới bật từ 22/08, còn hai sổ kia đã có từ lâu. Màn phải nói ra điều đó thay
--   vì in một tỉ lệ vô nghĩa — phần đó sửa ở tầng web.

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
        -- ⚠️ CHỈ NGƯỜI TỰ ĐĂNG KÝ. Loại hai nhóm KHÔNG đi qua phễu:
        --   · `…@staff.ifan.local` — tài khoản nhân viên do chủ tiệm cấp từ
        --     bên trong màn Nhân sự;
        --   · `…@t.local`          — tài khoản do các bộ kiểm dựng ra.
        select count(*)::int n from auth.users u, khoang
        where u.created_at >= khoang.tu
          and u.deleted_at is null
          and coalesce(u.email, '') not like '%@staff.ifan.local'
          and coalesce(u.email, '') not like '%@t.local'
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
