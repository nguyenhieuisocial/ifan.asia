#!/usr/bin/env node
/**
 * Gom MỌI "điều kiện xem lại" của MỌI ADR trong thư mục về một chỗ để soát
 * bằng mắt. Số lượng do máy đếm lúc chạy — dòng này cố ý không ghi con số,
 * vì bản đầu ghi "17 ADR" và lỗi thời sau đúng một tuần (nay đã 19).
 *
 * VÌ SAO CÓ FILE NÀY — một lỗ thật bắt được 14/08:
 * ADR-0016 ghi *"Khi founder bật AI trên máy chủ (#117) ⇒ xem lại mục 3(A)"*.
 * Việc #117 đóng ngày 14/08 — **điều kiện đã kích hoạt** — nhưng không có gì
 * báo, và mục 3(A) vẫn nằm nguyên với một lý do đã hết đúng ("máy chủ chưa có
 * khoá AI"). Chỉ bắt được vì đọc tay cả 17 ADR.
 *
 * Chính README của thư mục ADR đã trích FlowX cảnh báo đúng bệnh này:
 *   "Write the trigger AND schedule the audit;
 *    the first without the second is a comment."
 * iFan có trigger từ 12/08, **chưa có bước audit**. File này là bước audit.
 *
 * ĐÂY LÀ CÔNG CỤ SOÁT, CỐ Ý *KHÔNG* PHẢI CỔNG CHẶN — nên KHÔNG gắn vào CI:
 * nó không phán được điều kiện nào đã xảy ra (phần lớn là sự kiện ngoài đời:
 * "khi Zalo OA duyệt", "khi có 20 hội thoại thật"). Máy phán bừa rồi chặn
 * commit sẽ dạy người ta bỏ qua cảnh báo — tệ hơn không có. Việc của nó là
 * biến "mở 17 file" thành "chạy một lệnh".
 *
 * Dùng khi: đóng một việc lớn · mở một đợt mới · founder ra quyết định mới ·
 * hoặc định kỳ. Đọc bảng, tự hỏi từng dòng: "cái này xảy ra chưa?"
 *
 *   node scripts/adr-dieu-kien-xem-lai.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const THU_MUC_ADR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "adr");

/**
 * Tiêu đề mục. Phải nhận cả BA cách viết đang tồn tại thật trong kho:
 *   "## Điều kiện xem lại"      (14 file — khuôn chuẩn)
 *   "## 9. Xem lại khi nào"     (0013 — có SỐ THỨ TỰ và tên khác)
 *   (0003 — không có tiêu đề, điều kiện nằm trong thân bài)
 *
 * Bản đầu của regex này quên phần SỐ THỨ TỰ nên báo nhầm 0013 là "thiếu mục" —
 * bắt được ngay lần chạy đầu 14/08. Đúng bài học đã ghi ở nhật ký cùng ngày:
 * **soát bằng khuôn cứng thì bỏ sót đúng file viết khác khuôn.** Lần đó là grep
 * tay, lần này là script — cùng một lỗi, nên nới khuôn thay vì bắt file đổi.
 */
const TIEU_DE = /^##+\s*(\d+[.)]\s*)?(Điều kiện xem lại|Xem lại khi nào)/i;

const dsFile = readdirSync(THU_MUC_ADR)
  .filter((f) => /^\d{4}-.*\.md$/.test(f))
  .sort();

let tongDieuKien = 0;
let soAdrThieu = 0;
const nhacViec = [];
const daKichHoat = [];

console.log("\n[adr] ĐIỀU KIỆN XEM LẠI — gom từ " + dsFile.length + " quyết định kiến trúc\n");

for (const ten of dsFile) {
  const dong = readFileSync(join(THU_MUC_ADR, ten), "utf8").split("\n");
  const batDau = dong.findIndex((d) => TIEU_DE.test(d));

  if (batDau === -1) {
    soAdrThieu++;
    console.log(`  ⚠ ${ten}  — KHÔNG CÓ mục điều kiện xem lại (luật README bắt buộc phải có)`);
    continue;
  }

  // Lấy tới tiêu đề cùng cấp kế tiếp, hoặc hết file.
  const than = [];
  for (let i = batDau + 1; i < dong.length; i++) {
    if (/^##\s/.test(dong[i])) break;
    than.push(dong[i]);
  }

  const dieuKien = than.filter((d) => /^\s*-\s+\S/.test(d));
  if (dieuKien.length === 0) continue;

  console.log(`  ${ten}`);
  for (const d of dieuKien) {
    tongDieuKien++;
    const sach = d.replace(/^\s*-\s+/, "").replace(/\*\*/g, "").trim();
    const rutGon = sach.length > 120 ? sach.slice(0, 117) + "..." : sach;

    // Điều kiện trỏ vào một VIỆC có mã số → đối chiếu được ngay với danh sách việc.
    const maViec = sach.match(/#(\d{1,3})\b/);
    // Đã tự đánh dấu là đã xử.
    // CỐ Ý không bắt "hết hiệu lực": trong các điều kiện, cụm đó hầu hết mô tả
    // HẬU QUẢ TƯƠNG LAI ("khi X xảy ra ⇒ mục 7c hết hiệu lực"), không phải trạng
    // thái đã xử. Bản đầu bắt cụm này nên đánh dấu ✓ nhầm cho ADR-0012 — một điều
    // kiện CHƯA xảy ra. Đánh dấu nhầm ở công cụ soát còn tệ hơn không đánh dấu:
    // nó bảo người đọc "chỗ này yên tâm rồi" đúng chỗ chưa ai xem.
    const xong = /ĐÃ KÍCH HOẠT|ĐÃ XEM LẠI|ĐÃ TRẢ/i.test(sach);

    if (xong) daKichHoat.push(`${ten}: ${rutGon}`);
    else if (maViec) nhacViec.push(`${ten} — việc #${maViec[1]}: ${rutGon}`);

    console.log(`     ${xong ? "✓" : maViec ? "!" : "·"} ${rutGon}`);
  }
  console.log("");
}

console.log("─".repeat(78));
console.log(`Tổng: ${tongDieuKien} điều kiện trong ${dsFile.length} quyết định.`);
if (soAdrThieu) console.log(`⚠ ${soAdrThieu} quyết định THIẾU mục điều kiện xem lại.`);

if (nhacViec.length) {
  console.log(`\n! ${nhacViec.length} điều kiện trỏ vào một VIỆC CÓ MÃ SỐ — soát trước tiên,`);
  console.log(`  vì việc đóng lúc nào là thứ ĐỐI CHIẾU ĐƯỢC NGAY (khác các điều kiện`);
  console.log(`  ngoài đời như "khi Zalo OA duyệt"):\n`);
  for (const d of nhacViec) console.log(`    ${d}`);
  console.log(`\n  → Mở danh sách việc: việc nào trong số này ĐÃ ĐÓNG? Nếu có, đọc lại`);
  console.log(`    đúng quyết định đó NGAY — đừng để nó nằm sai như ADR-0016 hôm 14/08.`);
}

if (daKichHoat.length) {
  console.log(`\n✓ ${daKichHoat.length} điều kiện đã được đánh dấu là đã xử lý:\n`);
  for (const d of daKichHoat) console.log(`    ${d}`);
}

console.log("\nĐây là CÔNG CỤ SOÁT, không phải cổng chặn — nó không tự biết điều kiện nào");
console.log("đã xảy ra. Người đọc phải tự hỏi từng dòng: \"cái này xảy ra chưa?\"\n");
