-- ════════════════════════════════════════════════════════════════════
-- #336 — THỬ NGHIỆM A/B (thẻ `man-quan-tri-thu-nghiem-ab`)
-- ════════════════════════════════════════════════════════════════════
-- Viết hai phiên bản cho chữ trên nút của một trang giới thiệu, iFan luân
-- phiên và đếm xem bên nào có nhiều người bấm Đăng ký hơn.
--
-- ⚠️ NÓI THẲNG NGAY ĐẦU: với lưu lượng hiện tại của iFan, một thử nghiệm cần
--   VÀI TUẦN TỚI VÀI THÁNG mới đủ số để tin được. Mảng này vì thế đặt trọng tâm
--   vào chỗ khác — làm cho màn KHÔNG BAO GIỜ tuyên bố bên nào thắng khi chưa đủ
--   số. Một kết luận sai còn tệ hơn hẳn không có kết luận nào, vì nó dẫn tới
--   sửa cả trang theo một chênh lệch chỉ là may rủi.
--
-- ⚠️ LUÂN PHIÊN THEO NGÀY, KHÔNG CHIA THEO NGƯỜI. Chia theo người thì phải nhớ
--   được mỗi người thuộc nhóm nào — tức là đặt một dấu vết trong máy khách,
--   đúng cái iFan vừa quyết KHÔNG làm ở phần đếm lượt (#333). Đổi theo ngày thì
--   không cần nhớ gì về ai.
--
--   Nhược điểm CÓ THẬT và không giấu: ngày trong tuần có ảnh hưởng (thứ Bảy
--   khác thứ Ba). Chạy đủ nhiều tuần thì nó tự triệt tiêu — nên hàm đọc kết quả
--   BẮT BUỘC tối thiểu 14 ngày mới cho phép kết luận, kể cả khi số lượt đã đủ.

create table if not exists public.thu_nghiem_ab (
  khoa text primary key check (khoa ~ '^[a-z][a-z0-9-]{1,48}$'),
  -- Trang áp dụng. Danh sách ĐÓNG, khớp `luot_cong_khai` (#333).
  trang text not null check (trang in ('/', '/bang-gia', '/tinh-nang', '/lo-trinh')),
  cau_a text not null check (length(btrim(cau_a)) between 1 and 120),
  cau_b text not null check (length(btrim(cau_b)) between 1 and 120),
  dang_chay boolean not null default true,
  bat_dau date not null default current_date,
  ket_thuc date,
  created_by uuid references auth.users(id) on delete set null
);

-- ⚠️ MỘT TRANG CHỈ MỘT THỬ NGHIỆM ĐANG CHẠY. Hai thử nghiệm cùng lúc trên một
--   trang thì không biết con số đổi là do câu nào — và cái "không biết" đó
--   không phát hiện ra được về sau, vì số liệu đã trộn rồi.
create unique index if not exists thu_nghiem_ab_mot_trang_mot_cai
  on public.thu_nghiem_ab (trang) where dang_chay;

comment on table public.thu_nghiem_ab is
  'Thử nghiệm A/B chữ trên nút của trang giới thiệu. Luân phiên THEO NGÀY, không chia theo người (#336).';

alter table public.thu_nghiem_ab enable row level security;

/**
 * Thử nghiệm đang chạy cho một trang, kèm CÂU CỦA HÔM NAY.
 *
 * ⚠️ Trang giới thiệu mở cho người chưa đăng nhập nên hàm này cho `anon` gọi.
 *   Nó chỉ trả về chữ sẽ hiện trên nút — không có gì để giấu.
 *
 * Luân phiên: ngày chẵn (tính từ mốc 1970) dùng A, ngày lẻ dùng B. Dùng chính
 * số ngày chứ không dùng `random()` — cả trang phải thấy CÙNG một câu trong
 * cùng một ngày, và mỗi lượt gọi lại đổi thì số liệu vô nghĩa.
 */
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
        'bien_the', case when (current_date - date '1970-01-01') % 2 = 0 then 'a' else 'b' end,
        'cau', case when (current_date - date '1970-01-01') % 2 = 0 then x.cau_a else x.cau_b end
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

/** Tạo hoặc sửa một thử nghiệm — chỉ chủ SaaS. */
create or replace function public.admin_dat_thu_nghiem(
  p_khoa text, p_trang text, p_cau_a text, p_cau_b text, p_dang_chay boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'ly_do', 'forbidden');
  end if;

  insert into public.thu_nghiem_ab (khoa, trang, cau_a, cau_b, dang_chay, created_by)
  values (p_khoa, p_trang, p_cau_a, p_cau_b, coalesce(p_dang_chay, true), auth.uid())
  on conflict (khoa) do update set
    trang = excluded.trang,
    cau_a = excluded.cau_a,
    cau_b = excluded.cau_b,
    dang_chay = excluded.dang_chay,
    ket_thuc = case when excluded.dang_chay then null else current_date end;

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    -- Trang đó đã có một thử nghiệm khác đang chạy.
    return jsonb_build_object('ok', false, 'ly_do', 'trang_da_co_thu_nghiem');
  when check_violation then
    return jsonb_build_object('ok', false, 'ly_do', 'du_lieu_khong_hop_le');
end;
$$;

revoke all on function public.admin_dat_thu_nghiem(text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_dat_thu_nghiem(text, text, text, text, boolean) to authenticated;

/**
 * KẾT QUẢ — và điều kiện để được phép KẾT LUẬN.
 *
 * ⚠️ HÀM NÀY PHẢI BIẾT NÓI KHÔNG. Công cụ A/B phổ biến hay tô xanh bên đang dẫn
 *   ngay từ ngày đầu; ở lưu lượng nhỏ của iFan thì chênh lệch ngày đầu gần như
 *   luôn là may rủi. Ba điều kiện, phải đủ CẢ BA:
 *     ① chạy tối thiểu 14 ngày (để triệt tiêu ảnh hưởng của ngày trong tuần),
 *     ② mỗi bên tối thiểu 300 lượt xem (dưới mức đó thì phép kiểm vô nghĩa),
 *     ③ chênh lệch vượt ngưỡng may rủi 5% (phép kiểm hai tỉ lệ, z ≥ 1,96).
 *
 * ⚠️ Trả về LUÔN cả `con_thieu` — số lượt còn thiếu mỗi bên. "Chưa đủ số" mà
 *   không nói thiếu bao nhiêu thì người ta chờ mòn mỏi hoặc bỏ dở.
 */
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
          (current_date - x.bat_dau) so_ngay,
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

/** Danh sách thử nghiệm cho màn quản trị. */
create or replace function public.admin_thu_nghiem()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.is_platform_admin() then '[]'::jsonb else
    coalesce(
      (select jsonb_agg(public.admin_ket_qua_thu_nghiem(khoa) order by dang_chay desc, bat_dau desc)
         from public.thu_nghiem_ab),
      '[]'::jsonb
    )
  end;
$$;

revoke all on function public.admin_thu_nghiem() from public, anon;
grant execute on function public.admin_thu_nghiem() to authenticated;
