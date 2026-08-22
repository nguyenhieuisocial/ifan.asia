import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
// Kiểu và phép tính thuần nằm ở file KHÔNG có `server-only` — màn chạy ở
// trình duyệt cũng cần chúng. Xem chú thích đầu `tai-san-chung.ts`.
import type { BanGiao, TaiSan, TinhTrangTaiSan } from "./tai-san-chung";

export type { BanGiao, TaiSan, TinhTrangTaiSan };

/**
 * TÀI SẢN & THIẾT BỊ (thẻ `man-tai-san`, migration #358).
 *
 * ⚠️ HAI TRỤC, KHÔNG PHẢI MỘT. `tinhTrang` là tình trạng VẬT LÝ (dùng được ·
 *   đang sửa · hỏng · đã thanh lý). `dangGiao` là CHỖ ĐANG GIỮ, suy ra từ lượt
 *   bàn giao còn mở — KHÔNG lưu thành một giá trị trạng thái.
 *   Nhét cả hai vào một danh sách thì cái giường *đang giao cho phòng 2 nhưng
 *   vừa gãy chân* chỉ mang được một nhãn, và ta mất đúng thông tin cần nhất.
 */

type DongDb = {
  id: string;
  ma: string | null;
  ten: string;
  loai: string | null;
  vi_tri: string | null;
  ngay_mua: string | null;
  gia_mua_vnd: number | null;
  bao_hanh_den: string | null;
  anh: string | null;
  ghi_chu: string | null;
  tinh_trang: TinhTrangTaiSan;
  asset_assignments: {
    id: string;
    employee_id: string | null;
    bo_phan: string | null;
    giao_luc: string;
    xac_nhan_luc: string | null;
    thu_hoi_luc: string | null;
    ghi_chu: string | null;
    employees: { full_name: string } | null;
  }[];
};

const doiBanGiao = (a: DongDb["asset_assignments"][number]): BanGiao => ({
  id: a.id,
  employeeId: a.employee_id,
  nguoiGiu: a.employees?.full_name ?? null,
  boPhan: a.bo_phan,
  giaoLuc: a.giao_luc,
  xacNhanLuc: a.xac_nhan_luc,
  thuHoiLuc: a.thu_hoi_luc,
  ghiChu: a.ghi_chu,
});

const CHON =
  "id, ma, ten, loai, vi_tri, ngay_mua, gia_mua_vnd, bao_hanh_den, anh, ghi_chu, tinh_trang," +
  " asset_assignments(id, employee_id, bo_phan, giao_luc, xac_nhan_luc, thu_hoi_luc, ghi_chu, employees(full_name))";

/**
 * Danh sách tài sản kèm lượt giao còn mở.
 *
 * ⚠️ MỘT LƯỢT TRUY VẤN cho cả màn. Hỏi từng tài sản xem "ai đang giữ" là mỗi
 *   lần vẽ lại tốn N vòng mạng — và chỉ mục `asset_mot_luot_giao_dang_mo` đã
 *   bảo đảm mỗi tài sản nhiều nhất MỘT lượt còn mở, nên gộp là an toàn.
 */
export async function danhSachTaiSan(
  supabase: SupabaseClient,
): Promise<TaiSan[]> {
  const { data } = await supabase
    .from("assets")
    .select(CHON)
    .is("deleted_at", null)
    .order("ten");

  return ((data ?? []) as unknown as DongDb[]).map((r) => {
    const mo =
      (r.asset_assignments ?? []).find((a) => a.thu_hoi_luc === null) ?? null;
    return {
      id: r.id,
      ma: r.ma,
      ten: r.ten,
      loai: r.loai,
      viTri: r.vi_tri,
      ngayMua: r.ngay_mua,
      giaMuaVnd: r.gia_mua_vnd,
      baoHanhDen: r.bao_hanh_den,
      anh: r.anh,
      ghiChu: r.ghi_chu,
      tinhTrang: r.tinh_trang,
      dangGiao: mo ? doiBanGiao(mo) : null,
    };
  });
}

/** Một tài sản + TOÀN BỘ lịch sử bàn giao (mới nhất trước). */
export async function taiSanKemLichSu(
  supabase: SupabaseClient,
  id: string,
): Promise<{ taiSan: TaiSan; lichSu: BanGiao[] } | null> {
  const { data } = await supabase
    .from("assets")
    .select(CHON)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as DongDb;
  const cac = (r.asset_assignments ?? [])
    .slice()
    .sort((a, b) => b.giao_luc.localeCompare(a.giao_luc));
  const mo = cac.find((a) => a.thu_hoi_luc === null) ?? null;
  return {
    taiSan: {
      id: r.id,
      ma: r.ma,
      ten: r.ten,
      loai: r.loai,
      viTri: r.vi_tri,
      ngayMua: r.ngay_mua,
      giaMuaVnd: r.gia_mua_vnd,
      baoHanhDen: r.bao_hanh_den,
      anh: r.anh,
      ghiChu: r.ghi_chu,
      tinhTrang: r.tinh_trang,
      dangGiao: mo ? doiBanGiao(mo) : null,
    },
    lichSu: cac.map(doiBanGiao),
  };
}

/** Tiệm này có khai tài sản nào chưa — quyết định hiện mục ở cột trái. */
export async function tiemCoTaiSan(supabase: SupabaseClient): Promise<boolean> {
  const { count } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  return (count ?? 0) > 0;
}
