#!/usr/bin/env node
/**
 * Soát: có file nào TỰ KHAI "đợt đang mở là V-mấy" ngoài chỗ được phép không.
 *
 * VÌ SAO CÓ CÔNG CỤ NÀY — đo thật ngày 18/08/2026:
 * BA file cùng khai đợt đang mở, và CẢ BA đều sai, sai theo ba kiểu khác nhau:
 *   · `AGENTS.md`            → "đợt đang mở là V2 Lịch hẹn"   (đóng 13/08 — sai 5 ngày, lệch 2 đợt)
 *   · `00 Trang chủ.md`      → "Đợt đang mở: V2.5"            (cũng đóng 13/08)
 *   · `docs/adr/README.md`   → gọi 0014 là "đợt đang mở", 0019 là "đợt kế tiếp" (V3 đóng 17/08)
 * Hại lớn nhất là ở `AGENTS.md`: đó là file phiên làm việc nào cũng MỞ RA ĐẦU TIÊN,
 * nên mọi phiên sau đều khởi động từ một bản đồ sai.
 *
 * Trớ trêu: bài học chống đúng bệnh này đã được viết sẵn trong chính `AGENTS.md`
 * ngày 17/08 — *"ghi vào sổ dài 1.400 dòng không phải là bàn giao; bàn giao là
 * ghi vào chỗ người sau MỞ RA ĐẦU TIÊN"* — mà chỗ bàn giao đó vẫn cũ. Và
 * `docs/adr/README.md` thì đã tự sửa bệnh lỗi thời HAI lần rồi vẫn tái phát lần ba,
 * kèm câu tự rút ra: *"file dạy về tài liệu lỗi thời không tự miễn nhiễm với lỗi thời"*.
 *
 * ⇒ Kết luận rút thành luật: MỘT BẢN CHÉP LÀ MỘT BẢN SẼ LỆCH. Không chống bằng
 * cách "nhớ cập nhật cả ba" (đã thử, hỏng ba lần), mà bằng cách chỉ cho phép MỘT
 * bản và để máy canh.
 *
 * Cách canh: một dòng bị coi là TỰ KHAI khi nó vừa nói "đợt đang mở" vừa nêu đích
 * danh số đợt (V1a/V2/V2.5/V3...). Dòng chỉ TRỎ sang chỗ khác mà không nêu số đợt
 * thì hợp lệ. Dòng trích dẫn lịch sử (bắt đầu bằng ">") được bỏ qua — kể lại một
 * cái sai cũ không phải là đang khai sai.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const KHO = path.resolve(import.meta.dirname, "..");
const VAULT = "C:/iFan.asia";

// Chỗ DUY NHẤT được phép khai đợt đang mở.
const DUOC_PHEP = path.join(KHO, "docs", "adr", "README.md");

// Bỏ qua: nhật ký theo ngày + kho lưu trữ (chép lại trạng thái CỦA NGÀY HÔM ĐÓ là
// đúng, không phải khai sai), và mọi thứ máy sinh ra.
const BO_QUA = [
  ".git", "node_modules", ".next", ".obsidian",
  "05 Nhật ký", "99 Lưu trữ",
  // Lối tắt trong vault trỏ thẳng vào `docs/` của kho code — quét cả hai sẽ báo
  // trùng đúng một file hai lần dưới hai đường dẫn khác nhau, đọc như hai lỗi.
  "06 Hồ sơ thi công",
];

// File mà NHIỆM VỤ của nó là chép lại nguyên văn những câu khai sai để đối chiếu.
// Bắt nó là bắt nhầm: nó không khai, nó tố cáo.
const MIEN_TRU = [
  path.join(VAULT, "02 Nghiên cứu", "Kiểm chứng sự thật độc lập.md"),
];

function duyet(goc, ra = []) {
  let ds;
  try { ds = readdirSync(goc); } catch { return ra; }
  for (const ten of ds) {
    if (BO_QUA.includes(ten)) continue;
    const p = path.join(goc, ten);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) duyet(p, ra);
    else if (ten.endsWith(".md")) ra.push(p);
  }
  return ra;
}

const NOI_DOT_DANG_MO = /đợt\s+đang\s+mở/i;
const NEU_SO_DOT = /\bV\d/; // V1a · V2 · V2.5 · V3 ...

const pham = [];
for (const f of [...duyet(KHO), ...duyet(VAULT)]) {
  const tuyetDoi = path.resolve(f);
  if (tuyetDoi === DUOC_PHEP) continue;
  if (MIEN_TRU.some((m) => path.resolve(m) === tuyetDoi)) continue;
  let noiDung;
  try { noiDung = readFileSync(f, "utf8"); } catch { continue; }
  noiDung.split(/\r?\n/).forEach((dong, i) => {
    if (dong.trimStart().startsWith(">")) return; // trích dẫn lịch sử
    // Dấu miễn trừ TƯỜNG MINH cho dòng cố ý nhắc lại một đợt cũ (kể lại cái sai
    // để rút bài học, hoặc ghi chú lịch sử trong ADR). Cố ý bắt người viết dán
    // dấu bằng tay thay vì để máy đoán theo văn phong: máy đoán sai thì hoặc bỏ
    // sót lỗi thật, hoặc kêu oan tới mức người ta tắt cổng — cả hai đều tệ hơn.
    if (dong.includes("đợt-cũ")) return;
    if (NOI_DOT_DANG_MO.test(dong) && NEU_SO_DOT.test(dong)) {
      pham.push({ f, dong: i + 1, chu: dong.trim().slice(0, 120) });
    }
  });
}

if (pham.length === 0) {
  console.log("✓ Không file nào tự khai đợt đang mở. Chỉ docs/adr/README.md giữ bản duy nhất.");
  process.exit(0);
}

console.error(`✗ ${pham.length} chỗ TỰ KHAI đợt đang mở ngoài docs/adr/README.md:\n`);
for (const p of pham) {
  console.error(`  ${path.relative(process.cwd(), p.f)}:${p.dong}`);
  console.error(`     ${p.chu}\n`);
}
console.error("Sửa: bỏ số đợt khỏi các chỗ trên, chỉ TRỎ sang docs/adr/README.md (khối 📍).");
console.error("Lý do: ba bản chép, ba lần lệch — xem chú thích đầu file này.");
process.exit(1);
