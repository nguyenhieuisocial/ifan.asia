#!/usr/bin/env node
/**
 * Cổng soát: THẺ THIẾT KẾ CÓ CÒN ĐÚNG KHÔNG — không phải "thẻ có tồn tại không".
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO DỰNG — founder nhìn ra trước cổng
 * ════════════════════════════════════════════════════════════════════
 *
 * Chỉ thị ngày 21/08, nguyên văn: *"Rất nhiều tính năng và trang bạn làm ra
 * nhưng không thông qua claude design, cần fix toàn bộ ngay."*
 *
 * Lúc ấy hai cổng thẻ đang XANH:
 *   · `soat-the-design.mjs`  → "90/90 màn có thẻ, 155 thẻ, 0 vấn đề"
 *   · `soat-dong-bo-the.mjs` → "155 thẻ khớp sổ, không thẻ nào sửa sau lần đẩy"
 *
 * Cả hai đều đúng, và cả hai đều **không trả lời được câu hỏi founder đang
 * hỏi**. Cổng thứ nhất hỏi *"có file thẻ không"*. Cổng thứ hai hỏi *"file thẻ
 * đã đẩy lên chưa"*. Không cổng nào hỏi **"thẻ có còn tả đúng cái màn đang
 * chạy không"** — mà đó mới là thứ làm thẻ có giá trị.
 *
 * Đo lần đầu (21/08): **48/90 màn có mã đổi giao diện SAU ngày thẻ sửa lần
 * cuối**, tổng ~2.609 dòng động tới giao diện. Nợ tích trong nhiều tuần, không
 * cổng nào kêu một tiếng.
 *
 * ════════════════════════════════════════════════════════════════════
 * ĐO BẰNG GÌ, VÀ VÌ SAO PHÉP ĐO NÀY CÓ THỂ SAI
 * ════════════════════════════════════════════════════════════════════
 *
 * Với mỗi màn: lấy mốc thời gian thẻ được sửa lần cuối, rồi đếm những dòng mã
 * THÊM/BỚT sau mốc đó có mang dấu hiệu giao diện (`className=`, thẻ JSX, lời
 * gọi chuỗi dịch, `aria-label`).
 *
 * ⚠️ **Phép đo này chỉ đủ để KHOANH VÙNG, không đủ để KẾT LUẬN.** Nó không
 * biết một thay đổi có thật sự làm thẻ sai hay không — đổi tên biến trong JSX,
 * sửa lỗi kiểu dữ liệu, gỡ một `className` thừa đều bị tính. Nên:
 *   · ngưỡng đặt ở 6 dòng, không phải 1 — nhiễu lặt vặt không làm đỏ cổng
 *   · và có SỔ MIỄN TRỪ để người soát rồi ghi lại "đã xem, thẻ vẫn đúng"
 *
 * Cổng kêu oan là cổng bị tắt đi. Thà bỏ sót vài chỗ nhỏ còn hơn đỏ liên miên
 * rồi bị người ta bấm qua theo phản xạ.
 *
 * ⚠️ Cũng KHÔNG đo được: thẻ sửa cùng ngày nhưng sửa sang chuyện khác, hoặc
 * thẻ tả sai ngay từ lúc viết. Cổng này bắt đúng MỘT con bệnh — *sửa mã rồi
 * quên thẻ* — và đó là con bệnh đã xảy ra thật 48 lần.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SO_MIEN_TRU = path.join(GOC, "design-system", ".the-da-soat.json");

/** Ngưỡng: dưới ngần này dòng giao diện thì coi là nhiễu lặt vặt. */
const NGUONG = 6;

/**
 * Gọi git bằng MẢNG tham số, không ghép chuỗi cho shell.
 *
 * Đầu vào ở đây đều đến từ chính kho (bản đồ màn→thẻ trong `soat-the-design.mjs`
 * và ngày tháng do git trả về), nên nguy cơ thấp — nhưng file này chạy trên máy
 * chủ kiểm, và một tên màn chứa ký tự lạ thì shell diễn giải chứ git không.
 * Truyền mảng là không có shell nào tham gia.
 */
const git = (...args) => {
  try { return execFileSync("git", args, { cwd: GOC, encoding: "utf8", maxBuffer: 64e6 }).trim(); }
  catch { return ""; }
};

// ── Đọc bản đồ màn → thẻ từ chính cổng kia, để một nguồn sự thật ────────────
const src = readFileSync(path.join(GOC, "scripts", "soat-the-design.mjs"), "utf8");
const khoi = src.slice(src.indexOf("const BAN_DO_THE = {"));
const than = khoi.slice(0, khoi.indexOf("\n};"));
const CAP = [...than.matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]);
if (CAP.length === 0) {
  console.error("❌ Không đọc được BAN_DO_THE từ soat-the-design.mjs — cổng này dựa vào đó.");
  process.exit(1);
}

const mienTru = existsSync(SO_MIEN_TRU)
  ? JSON.parse(readFileSync(SO_MIEN_TRU, "utf8"))
  : {};

const lech = [];
for (const [man, the] of CAP) {
  const duongThe = `design-system/${the}`;
  const nThe = git("log", "-1", "--format=%cI", "--", duongThe);
  if (!nThe) continue;

  // CHỈ file trực tiếp của màn. Thư mục cha (`app`, `app/app`) gộp cả màn con
  // vào và thổi con số lên vô nghĩa — đã dính lúc đo lần đầu.
  let files;
  try {
    files = readdirSync(path.join(GOC, man), { withFileTypes: true })
      .filter((d) => d.isFile() && /\.tsx?$/.test(d.name))
      .map((d) => `${man}/${d.name}`);
  } catch { continue; }
  if (files.length === 0) continue;

  /**
   * ⚠️ BỎ QUA COMMIT NÀO SỬA CẢ THẺ LẪN MÃ — đó là nếp ĐÚNG, không phải nợ.
   *
   *   `--since` của git là BAO GỒM mốc đó. Mốc ở đây lấy từ chính commit sửa
   *   thẻ, nên commit ấy luôn lọt vào kết quả. Hệ quả: thẻ nào được sửa CÙNG
   *   commit với mã — tức làm đúng quy trình "sửa mã thì sửa thẻ" — lại bị gắn
   *   cờ nợ VĨNH VIỄN, không cách nào gỡ.
   *   Đo 22/08: `man-chi-tiet-don.html` dính đúng cái này; soi ra chỉ một commit
   *   lọt vào, và nó chính là commit sửa thẻ.
   *   Cổng phạt người làm đúng quy trình thì sớm muộn không ai theo quy trình.
   */
  const cacBan = git("log", `--since=${nThe}`, "--format=%H", "--", ...files)
    .split("\n")
    .filter(Boolean)
    .filter((sha) => !git("show", "--name-only", "--format=", sha, "--", duongThe));
  if (cacBan.length === 0) continue;

  const diff = cacBan.map((sha) => git("show", "-p", "--format=", sha, "--", ...files)).join("\n");
  if (!diff) continue;

  const soDong = diff
    .split("\n")
    .filter((d) => /^[+-][^+-]/.test(d))
    .filter((d) => /className=|<[A-Za-z][\w.]*[\s/>]|t\("|aria-label/.test(d)).length;
  if (soDong < NGUONG) continue;

  // Miễn trừ có hiệu lực khi người soát ghi lại ĐÚNG mốc thẻ lúc họ soát —
  // thẻ sửa lại sau đó thì miễn trừ tự hết hạn, không phải nhớ gỡ tay.
  if (mienTru[man]?.mocThe === nThe) continue;
  lech.push({ man, the, soDong, nThe: nThe.slice(0, 10) });
}

lech.sort((a, b) => b.soDong - a.soDong);

if (process.argv.includes("--ghi")) {
  // Ghi sổ: "đã soát tay, thẻ vẫn đúng". CHỈ chạy sau khi thật sự mở thẻ ra đọc.
  const moi = { ...mienTru };
  for (const x of lech) {
    moi[x.man] = { the: x.the, mocThe: git("log", "-1", "--format=%cI", "--", `design-system/${x.the}`) };
  }
  writeFileSync(SO_MIEN_TRU, JSON.stringify(moi, null, 2) + "\n", "utf8");
  console.log(`✅ Đã ghi sổ ${lech.length} màn là "đã soát, thẻ vẫn đúng".`);
  console.log("   ⚠️ Chỉ chạy lệnh này khi ĐÃ mở thẻ ra đọc — ghi bừa là tự bịt mắt mình.");
  process.exit(0);
}

if (lech.length === 0) {
  console.log(`✅ ${CAP.length} màn: không màn nào đổi giao diện sau ngày thẻ được sửa.`);
  process.exit(0);
}

console.error(`❌ ${lech.length}/${CAP.length} MÀN ĐỔI GIAO DIỆN SAU NGÀY THẺ — thẻ có thể đã lạc hậu.\n`);
for (const x of lech.slice(0, 25)) {
  console.error(`   ${String(x.soDong).padStart(4)} dòng · ${x.man}`);
  console.error(`        thẻ ${x.the} sửa lần cuối ${x.nThe}`);
}
if (lech.length > 25) console.error(`   … và ${lech.length - 25} màn nữa`);
console.error(`
   Cách xử — theo đúng thứ tự:
     1. Mở thẻ ra đọc, đối chiếu với mã hiện tại của màn.
     2. Thẻ SAI  ⇒ sửa thẻ, đẩy lên Claude Design bằng DesignSync,
                   rồi \`node scripts/soat-dong-bo-the.mjs --ghi\`.
     3. Thẻ ĐÚNG ⇒ \`node scripts/soat-the-con-dung.mjs --ghi\` để ghi sổ đã soát.

   ⚠️ ĐỪNG chạy --ghi để làm xanh cổng khi CHƯA mở thẻ ra đọc. Cổng này sinh ra
   vì founder phát hiện 48 màn lạc hậu trong lúc mọi cổng thẻ đều xanh — ghi bừa
   là dựng lại đúng cái mù đó, chỉ khác là lần này có một sổ nói dối hộ.`);
process.exit(1);
