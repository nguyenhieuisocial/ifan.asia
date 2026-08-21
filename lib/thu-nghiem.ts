import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * THỬ NGHIỆM A/B — lấy câu của HÔM NAY cho một trang (#336).
 *
 * ⚠️ LUÂN PHIÊN THEO NGÀY, KHÔNG CHIA THEO NGƯỜI. Chia theo người thì phải nhớ
 *   được mỗi người thuộc nhóm nào — tức là đặt một dấu vết trong máy khách,
 *   đúng cái iFan vừa quyết KHÔNG làm ở phần đếm lượt (#333).
 *
 * ⚠️ NGÀY TÍNH Ở CƠ SỞ DỮ LIỆU, không tính ở trình duyệt và cũng không tính ở
 *   máy chủ web. Ba nơi ba đồng hồ; lệch nhau một chút quanh nửa đêm là lượt
 *   xem bị ghi vào nhánh này còn cú bấm ghi vào nhánh kia. Một nguồn duy nhất
 *   thì không có chỗ để lệch.
 *
 * ⚠️ Hỏng thì trả `null` và trang dùng câu gốc. Một thử nghiệm không chạy được
 *   KHÔNG được phép làm trang giới thiệu trống chữ.
 */

export interface CauThuNghiem {
  khoa: string;
  bien_the: "a" | "b";
  cau: string;
}

/** Nhớ tạm 60 giây — câu chỉ đổi mỗi ngày một lần, không cần hỏi lại liên tục. */
const HAN_MS = 60_000;
const dem = new Map<string, { luc: number; v: CauThuNghiem | null }>();

export async function cauThuNghiem(trang: string): Promise<CauThuNghiem | null> {
  const cu = dem.get(trang);
  if (cu && Date.now() - cu.luc < HAN_MS) return cu.v;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("thu_nghiem_hom_nay", { p_trang: trang });
    const r = (data ?? {}) as Partial<CauThuNghiem>;
    const v = !error && r.khoa && r.cau && (r.bien_the === "a" || r.bien_the === "b")
      ? { khoa: r.khoa, bien_the: r.bien_the, cau: r.cau }
      : null;
    dem.set(trang, { luc: Date.now(), v });
    return v;
  } catch {
    return null;
  }
}
