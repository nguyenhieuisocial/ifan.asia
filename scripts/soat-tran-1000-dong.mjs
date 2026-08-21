/**
 * CỔNG: không nơi nào được xin hơn 1000 dòng từ cổng API.
 *
 * Cổng API của Supabase (PostgREST) CẮT CỨNG ở 1000 dòng, bất kể `.limit()`
 * xin bao nhiêu. Đã đo trên chính dự án này:
 *
 *     xin 1000  → nhận 1000
 *     xin 5000  → nhận 1000
 *     xin 20000 → nhận 1000
 *
 * Không lỗi, không cảnh báo, không dấu hiệu nào. Câu lệnh chạy xong, mảng có
 * dữ liệu, và mọi phép cộng/đếm phía sau ra một con số SAI TRÔNG NHƯ ĐÚNG.
 *
 * Ngày 21/08 lớp lỗi này có mặt ở BỐN chỗ trong kho, và hai trong số đó là
 * SỐ TIỀN:
 *   · tổng đã tiêu của mỗi dự án  → tiệm >1000 phiếu chi bị cộng thiếu
 *   · số ca của mỗi thợ trong kỳ  → BẢNG LƯƠNG thiếu
 *   · số ca cả năm ở màn Lịch     → báo 874 trong khi thật là 8.479
 *   · lượt chấm công một tháng    → chưa cắn ai, nhưng vẫn là lời nói dối
 *
 * Cách đúng: gộp/đếm NGAY TRONG cơ sở dữ liệu bằng một hàm (xem migration
 * #312, #313), hoặc phân trang thật sự bằng `.range()`.
 *
 * Chạy: node scripts/soat-tran-1000-dong.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TRAN = 1000;
const DUOI = /\.(ts|tsx|mjs)$/;
const BO_QUA = /^(node_modules|\.next|scratchpad)/;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && DUOI.test(f) && !BO_QUA.test(f));

const loi = [];
for (const f of files) {
  // ⚠️ BỎ CHÚ THÍCH TRƯỚC KHI SOÁT. Chính file này viết lệnh mẫu trong phần
  //   giải thích, và bản đầu của cổng tự báo mình đỏ — một cổng bắt nhầm thì
  //   sau vài lần người ta sẽ tắt nó đi, và lúc đó nó tệ hơn không có.
  //   Dùng lớp ký tự PHỦ ĐỊNH xuống dòng chứ KHÔNG dùng dấu chấm: trong JS
  //   dấu chấm không khớp ký tự về đầu dòng, nên trên file kiểu Windows thì
  //   chú thích không bị bỏ hết.
  const noiDung = readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, " "))
    .replace(/\/\/[^\r\n]*/g, "");
  noiDung.split(/\r?\n/).forEach((dong, i) => {
    for (const m of dong.matchAll(/\.limit\(\s*([0-9_]+)\s*\)/g)) {
      const n = Number(m[1].replace(/_/g, ""));
      if (n > TRAN) loi.push({ f, dong: i + 1, n, chu: dong.trim().slice(0, 90) });
    }
  });
}

if (loi.length === 0) {
  console.log(
    `✅ ${files.length} file — không nơi nào xin hơn ${TRAN} dòng (trần cứng của cổng API).`,
  );
  process.exit(0);
}

console.log(`❌ ${loi.length} chỗ xin hơn ${TRAN} dòng — cổng API sẽ CẮT ÂM THẦM:\n`);
for (const x of loi) console.log(`   ${x.f}:${x.dong}  (xin ${x.n})\n      ${x.chu}`);
console.log(
  [
    "",
    `   Cong API cat cung o ${TRAN} dong, khong loi va khong canh bao. Moi phep`,
    "   cong hay dem phia sau se ra mot con so SAI TRONG NHU DUNG.",
    "",
    "   Cach dung:",
    "     · gop/dem NGAY TRONG co so du lieu bang mot ham (xem migration #312)",
    "     · hoac phan trang that su bang `.range()` va cong dan tung trang",
    "     · neu that su chi can toi da 1000 dong thi viet dung 1000, va kiem",
    "       xem co CHAM TRAN khong roi bao ra — dung lang le tinh tiep",
  ].join(String.fromCharCode(10)),
);
process.exit(1);
