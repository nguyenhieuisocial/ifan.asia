/**
 * CỔNG: ngày giờ hiển thị GỌN mà vẫn không nhầm được.
 *
 * Founder chốt 21/08: "tất cả ngày giờ đều cần hiển thị gọn gàng, ví dụ thay
 * vì ngày 21 tháng 8 thì gọn thôi (có thể là 21/8)". Trước đó mọi màn in
 * `21/08/2026` — bốn ký tự thừa trên MỌI dòng của MỌI bảng.
 *
 * Cổng canh HAI luật, và luật thứ hai mới là luật quan trọng:
 *   1. cùng năm với hôm nay  → bỏ năm, bỏ số 0 đệm  (21/8)
 *   2. NĂM KHÁC              → PHẢI còn năm         (21/8/25)
 * Bỏ năm vô điều kiện là làm người đọc hiểu sai ngày — tệ hơn hẳn việc dài
 * thêm ba ký tự. Và mốc "hôm nay là năm nào" phải tính theo GIỜ VIỆT NAM, vì
 * máy chủ chạy UTC.
 *
 * Chạy: node --import ./scripts/ho-tro/dang-ky-nap-ts.mjs scripts/soat-ngay-gon.mjs
 */
const m = await import("../lib/format.ts");
let sai = 0;
const kiem = (d, ham, mong, ten) => {
  const that = ham(d);
  const ok = that === mong;
  if (!ok) sai++;
  console.log(`  ${ok ? "✓" : "✗"} ${ten.padEnd(34)} ${that}${ok ? "" : `   (mong: ${mong})`}`);
};
const vi = (d) => m.formatDate(d, "vi");
const en = (d) => m.formatDate(d, "en");
const viG = (d) => m.formatDateTime(d, "vi");

console.log("Hôm nay theo giờ VN:", vi(Date.now()), "\n");
kiem("2026-08-21T09:00:00Z", vi, "21/8", "cùng năm → bỏ năm");
kiem("2026-08-21T09:00:00Z", en, "Aug 21", "cùng năm, tiếng Anh");
kiem("2025-08-21T09:00:00Z", vi, "21/8/25", "NĂM KHÁC → phải còn năm");
kiem("2025-08-21T09:00:00Z", en, "Aug 21, 2025", "năm khác, tiếng Anh");
kiem("2026-03-05T02:00:00Z", vi, "5/3", "ngày một chữ số, không đệm 0");
kiem("2026-08-21T09:00:00Z", viG, "21/8 16:00", "có giờ, cùng năm");
kiem("2025-08-21T09:00:00Z", (d) => m.formatDateTime(d, "vi"), "21/8/25 16:00", "có giờ, năm khác");
// Ranh giới múi giờ: 20:00 UTC 31/12 = 03:00 VN 1/1 năm sau.
kiem("2025-12-31T20:00:00Z", vi, "1/1", "qua giao thừa theo GIỜ VN");
console.log(`\n${sai === 0 ? "✅" : "❌"} ${8 - sai}/8 đúng`);
process.exit(sai ? 1 : 0);
