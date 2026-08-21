/**
 * CỔNG: bắt hàm THOÁT KÝ TỰ bị hỏng thành chuỗi vô nghĩa.
 *
 * Vì sao đáng có: ngày 21/08 dính ĐÚNG lỗi này HAI lần trong cùng một buổi.
 * Câu đúng là
 *
 *     raw.replace(/[\\%_]/g, (c) => `\\${c}`)     ← thoát ký tự đặc biệt của LIKE
 *
 * còn câu hỏng là
 *
 *     raw.replace(/[\%_]/g,  (c) => `\${c}`)      ← mất một dấu gạch chéo
 *
 * Trong chuỗi mẫu, `` `\${c}` `` KHÔNG phải là "gạch chéo rồi giá trị c" — nó
 * là chuỗi CỐ ĐỊNH `${c}`, vì `\$` chỉ là dấu $ thường. Nên hàm thoát biến
 * thành hàm thay-thế-bằng-rác: gõ "50%" vào ô tìm sẽ khớp TOÀN BỘ dữ liệu,
 * và người dùng tin đó là kết quả thật.
 *
 * Không mắt nào bắt được: hai câu chỉ khác nhau MỘT ký tự, và cả hai đều biên
 * dịch xanh, chạy không lỗi. Nguyên nhân gốc là việc soạn mã qua heredoc của
 * môi trường này — nó giảm một nửa số dấu gạch chéo.
 *
 * Chạy: node scripts/soat-thoat-ky-tu.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DUOI = /\.(ts|tsx|mjs|js)$/;
const BO_QUA = /^(node_modules|\.next|scratchpad)/;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && DUOI.test(f) && !BO_QUA.test(f));

/**
 * `\${` bên trong một chuỗi mẫu — luôn đáng ngờ.
 *
 * Có MỘT trường hợp dùng đúng: khi thật sự muốn in ra chữ `${` (ví dụ sinh mã
 * mẫu, viết tài liệu). Chỗ đó khai vào `MIEN_TRU` kèm lý do — bắt khai lý do
 * chính là điểm của cổng này.
 */
const MIEN_TRU = [
  // (chưa có chỗ nào cố ý)
];

const loi = [];
for (const f of files) {
  const noiDung = readFileSync(f, "utf8");
  if (MIEN_TRU.includes(f)) continue;
  noiDung.split(/\r?\n/).forEach((dong, i) => {
    // Chỉ soi phần trong dấu ngoặc chéo ngược (chuỗi mẫu). Tìm `\${` mà TRƯỚC
    // nó không phải một dấu gạch chéo nữa (`\\${` là đúng).
    for (const m of dong.matchAll(/\\\$\{/g)) {
      const truoc = dong[m.index - 1];
      if (truoc === "\\") continue; // `\\${` — đúng, đây là gạch chéo + biến
      loi.push({ f, dong: i + 1, chu: dong.trim().slice(0, 100) });
    }
  });
}

if (loi.length === 0) {
  console.log(`✅ ${files.length} file — không có hàm thoát ký tự nào bị hỏng thành chuỗi cố định.`);
  process.exit(0);
}

console.log(`❌ ${loi.length} chỗ có \\\${…} trong chuỗi mẫu — gần như chắc chắn thiếu một dấu gạch chéo:\n`);
for (const x of loi) console.log(`   ${x.f}:${x.dong}\n      ${x.chu}`);
console.log(
  [
    "",
    '   Trong chuoi mau, dau gach cheo truoc $ chi lam $ thanh dau $ thuong,',
    '   nen $-ngoac-nhon o tren la mot CHUOI CO DINH chu khong phai gia tri.',
    '   Muon "gach cheo roi gia tri" thi phai viet HAI dau gach cheo.',
    "",
    '   Co y in ra chu do thi khai vao MIEN_TRU trong file nay kem ly do.',
  ].join(String.fromCharCode(10)),
);
process.exit(1);
