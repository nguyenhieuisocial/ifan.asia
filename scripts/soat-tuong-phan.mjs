/**
 * CỔNG: mọi cặp màu chữ / nền phải đạt ngưỡng tương phản WCAG 2.2 AA.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Đo 21/08 trên chính token đang chạy: `--muted-foreground` trên `--muted` ra
 * 4.38 và `--primary-foreground` trên `--primary` ra 4.46 — cả hai DƯỚI ngưỡng
 * 4.5 của AA cho chữ thường. Đây là chữ phụ và chữ trên nút chính, tức là hai
 * chỗ xuất hiện ở gần như mọi màn.
 *
 * ⚠️ KHÔNG chỉnh màu bằng mắt. Chênh 0.1 điểm tương phản mắt không thấy nhưng
 *   chuẩn thì thấy, và ngược lại — một màu "trông đậm hơn" có thể vẫn trượt.
 *   File này tính đúng công thức WCAG từ token thật trong `app/globals.css`.
 *
 * ⚠️ Token viết bằng `oklch`, phải đổi qua sRGB rồi mới tính. Tự viết phép đổi
 *   thay vì thêm thư viện: đúng một hàm, và thêm phụ thuộc cho một hàm là đổi
 *   một chỗ dễ đọc lấy một chỗ phải cập nhật mãi.
 *
 * Chạy: node scripts/soat-tuong-phan.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const CSS = readFileSync(path.join(GOC, "app", "globals.css"), "utf8");

/** oklch → sRGB tuyến tính → sRGB. */
function oklchSangRgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, bl];
}

/** Độ sáng tương đối theo WCAG. */
function doSang(rgbTuyenTinh) {
  const [r, g, b] = rgbTuyenTinh.map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function tuongPhan(m1, m2) {
  const a = doSang(oklchSangRgb(...m1));
  const b = doSang(oklchSangRgb(...m2));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Đọc token `--ten: oklch(L C H)` trong một khối. */
function docToken(khoi) {
  const ra = {};
  for (const m of khoi.matchAll(/--([a-z0-9-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g)) {
    ra[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return ra;
}

/**
 * ⚠️ Cắt khối bằng `indexOf(".dark")` KHÔNG dùng được: chữ ".dark" còn xuất
 *   hiện trong chú thích phía trên, nên khối sáng cắt ra rỗng và cổng báo
 *   "thiếu token" cho cả tám cặp — trông hệt như tệp hỏng. Bắt đúng khối bằng
 *   biểu thức neo đầu dòng.
 */
const layKhoi = (dau) => {
  const re = new RegExp(String.raw`^${dau}\s*\{([\s\S]*?)^\}`, "m");
  const m = CSS.match(re);
  return m ? m[1] : "";
};
const khoiSang = layKhoi(":root");
const khoiToi = layKhoi(String.raw`\.dark`);
const sang = docToken(khoiSang);
const toi = docToken(khoiToi);

/**
 * Các cặp PHẢI đạt. Ngưỡng 4.5 cho chữ thường; 3.0 cho chữ to hoặc đường viền.
 * Chỉ liệt kê cặp THẬT SỰ dùng chung với nhau trên màn.
 */
const CAP = [
  ["foreground", "background", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
];

let truot = 0;
for (const [ten, bo] of [
  ["Nền sáng", sang],
  ["Nền tối", toi],
]) {
  console.log(`\n── ${ten} ──`);
  for (const [chu, nen, nguong] of CAP) {
    const a = bo[chu] ?? sang[chu];
    const b = bo[nen] ?? sang[nen];
    // ⚠️ KHÔNG ĐO ĐƯỢC LÀ ĐỎ, không phải bỏ qua.
    //   Bản đầu của chính file này in "⚪ thiếu token" cho cả 16 cặp rồi kết
    //   luận "✅ đều đạt" — vì một phép cắt khối hỏng làm nó không đọc được
    //   token nào. Một cổng không đo được thì KHÔNG phân biệt được với một cổng
    //   luôn xanh, và đó là thứ nguy hiểm hơn cả không có cổng.
    if (!a || !b) {
      console.error(`  TRƯỢT  KHÔNG ĐỌC ĐƯỢC token: ${chu} / ${nen}`);
      truot++;
      continue;
    }
    const ty = tuongPhan(a, b);
    const ok = ty >= nguong;
    if (!ok) truot++;
    console.log(
      `  ${ok ? "ĐẠT  " : "TRƯỢT"}  ${chu} trên ${nen} = ${ty.toFixed(2)} (cần ≥ ${nguong})`,
    );
  }
}

console.log("");
if (truot) {
  console.error(`❌ ${truot} cặp màu dưới ngưỡng WCAG 2.2 AA.`);
  console.error("   Sửa token trong `app/globals.css` rồi chạy lại — đừng chỉnh bằng mắt.");
  process.exit(1);
}
console.log("✅ Mọi cặp màu chữ/nền đều đạt WCAG 2.2 AA.");
