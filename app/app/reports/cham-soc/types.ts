import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hình dữ liệu của màn "Lỗ hổng chăm sóc" (RPC `lo_hong_cham_soc`, migration
 * #371). Định nghĩa số liệu nằm ở đầu file migration — đọc ở đó, đừng đoán lại
 * từ tên biến.
 */

/** Cửa sổ đo, tính bằng ngày. Hàm CSDL tự kẹp trong 1…365. */
export const CUA_SO = [7, 30, 90] as const;
export type CuaSo = (typeof CUA_SO)[number];
export const CUA_SO_MAC_DINH: CuaSo = 30;

export function laCuaSo(v: number): v is CuaSo {
  return (CUA_SO as readonly number[]).includes(v);
}

/** Bộ lọc theo hạn. Mặc định `qua_han` — màn này mở ra là để thấy người bị bỏ quên. */
export const LOC = ["qua_han", "hom_nay", "sap_toi", "tat_ca"] as const;
export type Loc = (typeof LOC)[number];
export const LOC_MAC_DINH: Loc = "qua_han";

/** Bộ lọc theo nguồn lượt gần nhất. */
export const NGUON = ["tat_ca", "buoi_hen", "don_hang"] as const;
export type Nguon = (typeof NGUON)[number];
export const NGUON_MAC_DINH: Nguon = "tat_ca";

export type TrangThai =
  | "qua_han"
  | "den_han"
  | "chua_toi_han"
  | "dung_han"
  | "cham_tre";

export type DongChamSoc = {
  contact_id: string;
  ten: string;
  dien_thoai: string | null;
  /** Mốc lượt đến/mua gần nhất (ISO). */
  luc: string;
  loai: "buoi_hen" | "don_hang";
  /** Tên dịch vụ của buổi hẹn; null với đơn hàng hoặc buổi không gắn dịch vụ. */
  nhan: string | null;
  /** Tiền của lượt đó (đồng); null khi không có. */
  tien: number | null;
  /** Số ngày lịch (giờ VN) từ lượt gần nhất tới hôm nay. */
  so_ngay: number;
  /** Ngày thứ mấy kể từ lượt gần nhất thì có liên hệ ĐẦU TIÊN. null = chưa ai liên hệ. */
  ngay_lien_he: number | null;
  trang_thai: TrangThai;
  nguoi_phu_trach: string | null;
};

export type BaoCaoChamSoc = {
  ngay: number;
  loc: Loc;
  nguon: Nguon;
  /** true = đang xem cả tiệm; false = nhân viên, chỉ khách mình phụ trách. */
  ca_tiem: boolean;
  /** Tiệm đã bật quy trình nào chạy sau buổi hẹn / sau đơn chưa. */
  bat_tu_dong: boolean;
  /** Số khách đã tắt nhận tin, bị loại khỏi MỌI con số. Màn phải nói ra. */
  an_tat_tin: number;
  /** Khách có lượt đến/mua trong kỳ (đã trừ người tắt nhận tin). */
  tong: number;
  /** Trong đó, số khách có lượt gần nhất cách đây ≥ 3 ngày — mẫu số của tỉ lệ. */
  da_toi_han: number;
  qua_han: number;
  den_han: number;
  dung_han: number;
  /** Đã tới hạn VÀ có ít nhất một liên hệ (kể cả trễ) — tử số của tỉ lệ. */
  da_cham: number;
  dong: DongChamSoc[];
};

/** Nhịp chăm sau buổi/sau đơn mà hai quy trình mẫu #368 đang dùng. */
export const NHIP = [3, 5, 7] as const;

export type OMoc = "xong" | "tre" | "hom_nay" | "chua_toi" | "chua_ro";

/**
 * Ba ô 3-5-7 của một dòng.
 *
 * ⚠️ CHỖ PHÉP ĐO NÀY CỐ Ý KHÔNG BIẾT: hàm CSDL chỉ trả về liên hệ ĐẦU TIÊN sau
 * lượt gần nhất, không đếm từng lần chạm. Nên với khách ĐÃ có liên hệ, ta chỉ
 * tô xanh được đúng mốc mà liên hệ đó phủ; hai ô còn lại để TRỐNG (`chua_ro`)
 * chứ không tô đỏ — tô đỏ ở đây là bịa ra một điều chưa đo.
 * Đếm đủ từng lần chạm cần thêm 5 truy vấn con cho mỗi khách, trong khi việc
 * của màn này là tìm người BỊ QUÊN, không phải chấm điểm người chăm chăm chỉ.
 */
export function oMoc(so_ngay: number, ngay_lien_he: number | null): OMoc[] {
  if (ngay_lien_he !== null) {
    const phu = NHIP.find((m) => m >= ngay_lien_he);
    return NHIP.map((m) => (m === phu ? "xong" : "chua_ro"));
  }
  return NHIP.map((m) =>
    so_ngay > m ? "tre" : so_ngay === m ? "hom_nay" : "chua_toi",
  );
}

export async function fetchChamSoc(
  supabase: SupabaseClient,
  ngay: CuaSo,
  loc: Loc,
  nguon: Nguon,
): Promise<BaoCaoChamSoc | null> {
  const { data, error } = await supabase.rpc("lo_hong_cham_soc", {
    p_ngay: ngay,
    p_loc: loc,
    p_nguon: nguon,
    p_gioi_han: 100,
  });
  if (error) throw new Error(error.message);
  return (data ?? null) as BaoCaoChamSoc | null;
}
