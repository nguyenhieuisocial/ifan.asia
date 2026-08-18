import type { Locale } from "@/i18n/config";

/**
 * Số lượng kho, KHÔNG phải tiền — nên không dùng `formatMoney`.
 *
 * `stock_moves.qty` là `numeric(14,3)` để bán được theo cân/lít chứ không chỉ
 * theo cái (migration #150). Cắt số 0 thừa ở đuôi: 48.000 phải đọc ra "48",
 * còn 0.5 kg vẫn giữ "0,5".
 *
 * Dấu ÂM giữ nguyên — tồn âm là hợp lệ (ADR-0021 mục 5), người dùng PHẢI đọc
 * được là âm chứ không phải bị làm tròn về 0.
 */
export function soLuong(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    maximumFractionDigits: 3,
  }).format(n);
}
