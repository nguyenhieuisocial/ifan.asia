import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SỐ LIỆU CỦA HÔM NAY (thẻ `man-so-lieu-va-bieu-do`, migration #343/#345/#346).
 *
 * ⚠️ ĐÂY LÀ CÂU HỎI KHÁC với hai hàng ô số đã có trên màn Tổng quan.
 *   Hàng "TIỀN" trả lời *"kỳ này so kỳ trước"* và đổi theo bộ lọc `?r=`; hàng
 *   thứ hai trả lời *"hộp thư và khách đang thế nào"*. Không hàng nào trả lời
 *   được câu chủ tiệm hỏi đầu tiên mỗi sáng: **"hôm nay tiệm thế nào?"** —
 *   nhất là hai thứ chưa từng có chỗ nào hiện: huỷ hẹn hôm nay có bất thường
 *   không, và ngày mai lịch dày hay thưa.
 *
 * ⚠️ MỌI MỐC SO SÁNH LẤY TỪ CSDL, KHÔNG TÍNH Ở TRÌNH DUYỆT. Tính ngày ở trình
 *   duyệt là dính hai bệnh: máy người dùng đặt sai múi giờ, và `react-hooks/purity`
 *   cấm đọc đồng hồ lúc dựng giao diện (đã vấp một lần ở #342).
 */

export interface KhungGioHuy {
  /** Giờ bắt đầu khung 2 tiếng: 14 nghĩa là 14–16 giờ. */
  tu_gio: number;
  so: number;
}

export interface SoLieuHomNay {
  tien_hom_nay: number;
  tien_hom_qua: number;
  don_hom_nay: number;
  don_hom_qua: number;
  huy_hom_nay: number;
  /** TRUNG VỊ 14 ngày trước, có thể lẻ (vd 3,5). */
  huy_thuong_ngay: number;
  /** null khi huỷ KHÔNG dồn cục thật — xem hai chốt trong migration #345. */
  huy_khung_gio: KhungGioHuy | null;
  hen_ngay_mai: number;
  hen_thuong_ngay: number;
}

export async function docSoLieuHomNay(
  supabase: SupabaseClient,
): Promise<SoLieuHomNay | null> {
  const { data, error } = await supabase.rpc("so_lieu_hom_nay");
  // Tiệm chưa có thành viên → hàm trả `{}`; đọc ra không có `tien_hom_nay`.
  if (error || !data || typeof data !== "object" || !("tien_hom_nay" in data)) return null;
  const d = data as Record<string, unknown>;
  return {
    tien_hom_nay: Number(d.tien_hom_nay ?? 0),
    tien_hom_qua: Number(d.tien_hom_qua ?? 0),
    don_hom_nay: Number(d.don_hom_nay ?? 0),
    don_hom_qua: Number(d.don_hom_qua ?? 0),
    huy_hom_nay: Number(d.huy_hom_nay ?? 0),
    huy_thuong_ngay: Number(d.huy_thuong_ngay ?? 0),
    huy_khung_gio: (d.huy_khung_gio as KhungGioHuy | null) ?? null,
    hen_ngay_mai: Number(d.hen_ngay_mai ?? 0),
    hen_thuong_ngay: Number(d.hen_thuong_ngay ?? 0),
  };
}

export type Chieu = "len" | "xuong" | "deu";

/**
 * So hai con số, trả về hướng và phần trăm.
 *
 * ⚠️ NGƯỠNG "GẦN NHƯ KHÔNG ĐỔI" LÀ 5%. Không có ngưỡng thì một ngày hơn kém
 *   1% cũng hiện mũi tên xanh/đỏ, và chủ tiệm học được rằng mũi tên vô nghĩa.
 *
 * ⚠️ `pct` LÀ null KHI HÔM QUA BẰNG 0 — chia cho 0 ra Infinity, và "tăng vô
 *   hạn phần trăm" là câu vô nghĩa. Nơi gọi phải nói bằng lời thay vì bằng số.
 */
export function soSanh(nay: number, truoc: number): { chieu: Chieu; pct: number | null } {
  if (truoc === 0) {
    if (nay === 0) return { chieu: "deu", pct: null };
    return { chieu: "len", pct: null };
  }
  const pct = Math.round(((nay - truoc) / truoc) * 100);
  if (Math.abs(pct) < 5) return { chieu: "deu", pct };
  return { chieu: pct > 0 ? "len" : "xuong", pct: Math.abs(pct) };
}

/**
 * So một con số với MỨC THƯỜNG NGÀY (trung vị), dùng cho huỷ hẹn và lịch.
 *
 * ⚠️ "GẤP MẤY LẦN" CHỈ NÓI KHI TỪ 2 LẦN TRỞ LÊN. Dưới mức đó thì "gấp 1,3 lần"
 *   nghe như báo động trong khi thực tế là dao động thường ngày.
 */
export function soVoiThuongNgay(
  nay: number,
  moc: number,
): { chieu: Chieu; lan: number | null } {
  if (moc <= 0) return { chieu: nay > 0 ? "len" : "deu", lan: null };
  const ty = nay / moc;
  if (ty >= 2) return { chieu: "len", lan: Math.round(ty * 10) / 10 };
  if (ty >= 0.75) return { chieu: "deu", lan: null };
  return { chieu: "xuong", lan: null };
}
