/**
 * Dựng ô/dòng CSV cho các cửa "Xuất CSV" (`app/api/export/*`).
 *
 * Gộp về MỘT nguồn sự thật: trước đây ba route contacts/orders/appointments mỗi
 * cái chép một bản `escCsv` giống hệt nhau, nên vá một chỗ là quên hai chỗ.
 *
 * Hai lớp bọc, KHÔNG được bỏ lớp nào:
 *
 * 1. CHÈN CÔNG THỨC (CSV injection). Ô bắt đầu bằng `=` `+` `-` `@`, TAB hoặc CR
 *    thì Excel/LibreOffice/Google Sheets coi cả ô là CÔNG THỨC chứ không phải
 *    chữ. Dữ liệu trong ô là do NGƯỜI LẠ nhập: form thu lead ở trang mặt tiền
 *    công khai (`app/t/[slug]/actions.ts`) cho `fullName` tự do 120 ký tự, đủ
 *    chỗ cho `=HYPERLINK(...)` (bấm vào ô là gửi nội dung ô khác đi),
 *    `=WEBSERVICE(...)` (gửi ngầm) hay DDE `=cmd|' /C calc'!A0` (chạy lệnh máy).
 *    Bịt bằng cách chèn dấu nháy đơn `'` phía trước — bảng tính hiểu là "ô này
 *    là CHỮ", và dấu này không hiện ra khi xem.
 *
 * 2. TÁCH DÒNG. Các dòng nối bằng CRLF nên ô chứa `\r` (không chỉ `\n`) cũng
 *    đẻ thêm dòng khi đọc lại. Điều kiện bọc nháy kép phải xét CẢ HAI.
 *
 * Ngoại lệ duy nhất: giá trị kiểu `number` (tiền, điểm, số phút) do CSDL/ứng
 * dụng tính ra, không thể là công thức. Không chèn `'` cho chúng, nếu không số
 * âm — "còn lại" của phiếu hoàn, `total - paid` ở route orders — sẽ thành CHỮ
 * trong Excel và người dùng không cộng được nữa.
 */

/** Ký tự mở đầu khiến bảng tính đọc cả ô thành công thức. */
const FORMULA_LEAD = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function escCsv(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  if (typeof v !== "number" && s.length > 0 && FORMULA_LEAD.has(s[0])) {
    s = "'" + s;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function csvRow(...cells: unknown[]): string {
  return cells.map(escCsv).join(",");
}
