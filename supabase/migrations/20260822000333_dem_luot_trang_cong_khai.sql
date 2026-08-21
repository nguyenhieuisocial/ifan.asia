-- ════════════════════════════════════════════════════════════════════
-- #333 — ĐẾM LƯỢT Ở TRANG CÔNG KHAI (thẻ `man-quan-tri-phieu-khach-vao`)
-- ════════════════════════════════════════════════════════════════════
-- Trước bản vá này iFan KHÔNG đếm gì cả ở các trang giới thiệu: không biết một
-- ngày có bao nhiêu người ghé, bao nhiêu người bấm Đăng ký, họ bỏ đi ở bước
-- nào. Câu "trang giới thiệu có hiệu quả không" vì thế không trả lời được, và
-- mọi thay đổi trên trang đó đều là đoán.
--
-- ═══════════════════════════════════════════════════════════════════
-- CHỈ ĐẾM SỐ, KHÔNG LƯU NGƯỜI — VÀ ĐÓ LÀ CẢ THIẾT KẾ
-- ═══════════════════════════════════════════════════════════════════
-- Trong kho chỉ có đúng một dạng dòng: NGÀY · TRANG · LOẠI VIỆC · CON SỐ.
-- Không địa chỉ mạng, không dấu vết máy, không bánh quy theo dõi, không gửi gì
-- sang bên thứ ba. KHÔNG có dòng nào thuộc về một người.
--
-- ⚠️ ĐÂY KHÔNG PHẢI "ĐÃ ẨN DANH", MÀ LÀ "KHÔNG CÓ GÌ ĐỂ ẨN". Hai chuyện khác
--   hẳn nhau: dữ liệu ẩn danh vẫn ghép ngược lại được nếu có đủ mảnh, còn một ô
--   đếm thì không. Nghị định 13 vì thế không phải chuyện phải quản ở đây — nó
--   không có chỗ để phát sinh.
--
-- ⚠️ ĐỔI LẠI TA MẤT MỘT THỨ, và người đọc số liệu phải biết: KHÔNG trả lời được
--   "một người cụ thể đã đi qua những trang nào", cũng không đếm được "bao
--   nhiêu NGƯỜI" (chỉ đếm được LƯỢT). Muốn biết số người thì phải nhận ra cùng
--   một người quay lại — tức là phải lưu một dấu vết, đúng cái vừa quyết không
--   làm. Với câu hỏi iFan đang cần trả lời thì lượt là đủ.
--
-- ⚠️ `bien_the` để dành cho thử nghiệm A/B sau này (mục 45). Để sẵn từ đầu vì
--   thêm cột vào khoá chính của một bảng đã có số liệu thì phải đổ đi làm lại.
--   Chưa dùng thì nó là chuỗi rỗng, không ảnh hưởng gì.

create table if not exists public.luot_cong_khai (
  ngay date not null,
  duong_dan text not null check (length(duong_dan) between 1 and 80),
  loai text not null check (loai in ('xem', 'bam-dang-ky')),
  bien_the text not null default '' check (length(bien_the) <= 20),
  so integer not null default 0 check (so >= 0),
  primary key (ngay, duong_dan, loai, bien_the)
);

comment on table public.luot_cong_khai is
  'Bộ đếm lượt ở trang công khai. CHỈ có ngày·trang·loại·số — không dòng nào thuộc về một người (#333).';

-- ⚠️ RLS bật, KHÔNG policy ⇒ không người dùng thường nào đọc hay ghi thẳng
--   được. Ghi đi qua hàm bên dưới (máy chủ gọi bằng khoá dịch vụ), đọc đi qua
--   hàm quản trị. Số liệu kinh doanh của iFan không phải thứ để khách lạ xem.
alter table public.luot_cong_khai enable row level security;

/**
 * Cộng 1 vào một ô đếm.
 *
 * ⚠️ DANH SÁCH TRANG ĐÓNG, không lọc theo ký tự. Mở thì bảng đầy đường dẫn rác
 *   do người ta gọi bừa, và lúc đó không đọc ra được gì. Tầng web cũng đã lọc
 *   một lần — chốt ở đây là lớp thứ hai, vì hàm này gọi được thẳng.
 */
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
  -- Trang giới thiệu + hai màn cửa vào + trang ngành. KHÔNG có `/t/<tiệm>`:
  -- đó là mặt tiền của TIỆM, không phải trang bán hàng của iFan.
  if not (
    p_duong_dan in ('/', '/bang-gia', '/tinh-nang', '/lo-trinh', '/login',
                    '/signup', '/forgot-password', '/privacy', '/terms')
    or p_duong_dan ~ '^/nganh/[a-z]{2,12}$'
  ) then
    return;
  end if;

  insert into public.luot_cong_khai (ngay, duong_dan, loai, bien_the, so)
  values (current_date, p_duong_dan, p_loai, coalesce(left(p_bien_the, 20), ''), 1)
  on conflict (ngay, duong_dan, loai, bien_the)
  do update set so = public.luot_cong_khai.so + 1;
end;
$$;

revoke all on function public.ghi_luot_cong_khai(text, text, text) from public, anon, authenticated;
grant execute on function public.ghi_luot_cong_khai(text, text, text) to service_role;

/**
 * PHỄU KHÁCH VÀO — sáu bậc, từ lúc ghé tới lúc lập xong tiệm.
 *
 * ⚠️ HAI BẬC CUỐI ĐỌC TỪ SỔ ĐÃ CÓ (tài khoản, tiệm), không cần đếm gì thêm.
 *   Đặt bộ đếm cho chúng là đếm lại một thứ đã biết chắc, và hai con số sẽ có
 *   ngày lệch nhau — lúc đó không biết tin cái nào.
 *
 * ⚠️ Bậc ① đếm LƯỢT XEM, không phải số người. Xem khối đầu file.
 */
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
        select (current_date - (greatest(least(coalesce(p_so_ngay, 7), 365), 1) - 1))::date as tu
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
