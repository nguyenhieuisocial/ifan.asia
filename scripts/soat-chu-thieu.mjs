#!/usr/bin/env node
/**
 * Cổng soát: MÀN NÀO GỌI MỘT CÂU CHỮ CHƯA CÓ.
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO DỰNG — một màn đã lên bản thật và hiện MÃ MÁY cho người dùng
 * ════════════════════════════════════════════════════════════════════
 *
 * Ngày 21/08 founder chốt lại nghĩa của chữ "xong": *"Xong tức là tôi thấy
 * được, chạy được thực tế và không có bug!"*
 *
 * Mở màn Chia sẻ báo cáo trên bản thật ngay sau đó — nó hiện nguyên:
 *
 *     settings.reportShares.title
 *     settings.reportShares.create.reportLabel
 *     settings.reportShares.period.month
 *
 * Tức là **mã khoá thô**, không phải tiếng Việt. Màn đã được tuyên bố "xong",
 * đã qua mọi cổng, đã lên bản chạy thật — và không ai nhìn nó một lần.
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG CỔNG NÀO CŨ BẮT ĐƯỢC
 * ════════════════════════════════════════════════════════════════════
 *
 * Thiếu một câu chữ **không phải lỗi lập trình**: `t("abc")` với `abc` chưa có
 * vẫn biên dịch được, vẫn dựng được, vẫn chạy được. Thư viện dịch chỉ lặng lẽ
 * in ra chính cái tên khoá.
 *
 *   · cổng kiểu dữ liệu — không thấy, vì khoá là một chuỗi thường
 *   · cổng dựng bản thật — không thấy, vì trang vẫn dựng xong
 *   · cổng hai bản dịch — không thấy, vì nó so VI với EN; **thiếu ở CẢ HAI
 *     bên thì nó vẫn báo khớp**. Đây đúng là chỗ nó mù.
 *
 * Cổng này hỏi câu còn lại: *mọi khoá màn hình đang gọi có tồn tại không?*
 *
 * ⚠️ **Chỗ phép đo này có thể sai:** nó đọc mã bằng biểu thức, nên
 *   · khoá ghép động (`t(\`x.${loai}\`)`) — KHÔNG soát được, cố ý bỏ qua
 *   · lời gọi nằm trong CHÚ THÍCH — đã lọc, vì bản đầu báo nhầm đúng chỗ đó
 * Nói ra để người sau không tin cổng này quá mức nó đáng được tin.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const vi = JSON.parse(readFileSync(path.join(GOC, "messages", "vi.json"), "utf8"));
const doc = (o, p) =>
  p.split(".").reduce((a, k) => (a && typeof a === "object" ? a[k] : undefined), o);

/** Bỏ chú thích trước khi dò — bản đầu báo nhầm một lời gọi nằm trong `//`. */
function boChuThich(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((d) => d.replace(/\/\/.*$/, ""))
    .join("\n");
}

const files = execFileSync(
  "git",
  ["ls-files", "app/**/*.tsx", "components/**/*.tsx"],
  { cwd: GOC, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

const thieu = new Map();
for (const f of files) {
  let src;
  try { src = boChuThich(readFileSync(path.join(GOC, f), "utf8")); } catch { continue; }
  const nhanh = [...src.matchAll(/useTranslations\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
  if (nhanh.length === 0) continue;
  // Chỉ nhận `t("…")` và `tXxx("…")` — tên biến dịch trong kho luôn là `t` hoặc
  // `t` + CHỮ HOA (tTime, tSeed, tRoles). Khuôn rộng hơn (`t\w*`) bắt nhầm cả
  // `toggleSection("overdue")`: bản đầu báo oan đúng ba chỗ như vậy, và một
  // cổng kêu oan là một cổng sắp bị tắt đi.
  const khoa = [...src.matchAll(/\bt(?:[A-Z]\w*)?\(\s*"([a-zA-Z0-9_.]+)"/g)].map((m) => m[1]);
  for (const k of new Set(khoa)) {
    const co = nhanh.some((n) => doc(vi, `${n}.${k}`) !== undefined) || doc(vi, k) !== undefined;
    if (!co) {
      if (!thieu.has(f)) thieu.set(f, []);
      thieu.get(f).push(k);
    }
  }
}

if (thieu.size === 0) {
  console.log(`✅ ${files.length} file màn hình: không màn nào gọi một câu chữ chưa có.`);
  process.exit(0);
}

const tong = [...thieu.values()].reduce((s, a) => s + a.length, 0);
console.error(
  `❌ ${thieu.size} MÀN GỌI ${tong} CÂU CHỮ CHƯA CÓ — người dùng sẽ thấy MÃ MÁY thay vì tiếng Việt.\n`,
);
for (const [f, ks] of thieu) {
  console.error(`   ${f}`);
  console.error(`      ${ks.slice(0, 10).join(", ")}${ks.length > 10 ? ` … và ${ks.length - 10} khoá nữa` : ""}`);
}
console.error(`
   Thêm câu còn thiếu vào CẢ HAI file \`messages/vi.json\` và \`messages/en.json\`,
   rồi chạy \`node scripts/soat-hai-ban-dich.mjs\` để chắc hai bên không lệch.

   ⚠️ Đừng chữa bằng cách xoá lời gọi \`t(...)\` cho cổng xanh — chỗ đó là chữ
   người dùng phải đọc; gỡ đi là đổi một màn nói tiếng máy lấy một màn câm.`);
process.exit(1);
