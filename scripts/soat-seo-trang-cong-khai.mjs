/**
 * CỔNG: mỗi trang CÔNG KHAI phải khai đủ thứ máy tìm kiếm và Zalo/Facebook cần.
 *
 * ═══════════════════════════════════════════════════════════════════
 * HAI LỖI ĐO ĐƯỢC NGÀY 21/08 — VÀ CẢ HAI ĐỀU KHÔNG LÀM TRANG HỎNG
 * ═══════════════════════════════════════════════════════════════════
 * 1. THẺ `ld+json` KHÔNG MANG NONCE. CSP của kho dùng `nonce-… strict-dynamic`
 *    nên mọi thẻ `<script>` không có vé đều bị trình duyệt CHẶN — kể cả loại
 *    `application/ld+json`. Đo trên bản thật: 17/18 thẻ script có vé, đúng thẻ
 *    dữ liệu-cho-máy-tìm-kiếm thì không. Googlebot chạy bằng Chrome và CÓ áp
 *    CSP ⇒ phần dữ liệu có cấu trúc coi như không tồn tại.
 *
 * 2. 5/8 TRANG CÔNG KHAI KHÔNG CÓ `canonical` VÀ KHÔNG CÓ Open Graph — trong
 *    đó có `/t/[slug]`, tức MẶT TIỀN CỦA TỪNG TIỆM. Hệ quả nhìn thấy được:
 *    chủ tiệm dán link tiệm mình vào Zalo thì hiện tiêu đề và ảnh của trang
 *    chủ iFan, khách không nhận ra là tiệm nào.
 *
 * ⚠️ Cả hai lỗi đều IM LẶNG: trang vẫn hiện đẹp, không lỗi đỏ, không ai báo.
 *   Đó chính là lý do phải có cổng — mắt người không bắt được lớp này.
 *
 * Chạy: node scripts/soat-seo-trang-cong-khai.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * Trang CÔNG KHAI — người lạ vào được và máy tìm kiếm nên đọc được.
 * Trang sau đăng nhập (`/app/**`), trang xác thực và trang lỗi KHÔNG nằm đây:
 * chúng cố ý không cần đánh chỉ mục.
 */
const TRANG = [
  ["app/page.tsx", "/"],
  ["app/bang-gia/page.tsx", "/bang-gia"],
  ["app/tinh-nang/page.tsx", "/tinh-nang"],
  ["app/lo-trinh/page.tsx", "/lo-trinh"],
  ["app/nganh/[slug]/page.tsx", "/nganh/[slug]"],
  ["app/t/[slug]/page.tsx", "/t/[slug]"],
];

let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  if (!ok) truot++;
};

for (const [tep, duong] of TRANG) {
  const day = path.join(GOC, tep);
  if (!existsSync(day)) {
    kiem(`${duong}: file tồn tại`, false, tep);
    continue;
  }
  const s = readFileSync(day, "utf8");
  kiem(`${duong}: có canonical`, s.includes("canonical"));
  kiem(`${duong}: có Open Graph`, s.includes("openGraph"));
}

// ── Thẻ ld+json phải mang nonce ──────────────────────────────────────
// Quét TOÀN BỘ `app/`, không chỉ danh sách trên: ai thêm dữ liệu có cấu trúc
// ở một trang mới cũng phải mang vé.
import { readdirSync, statSync } from "node:fs";
function moiFile(thuMuc) {
  const ra = [];
  for (const ten of readdirSync(thuMuc)) {
    const d = path.join(thuMuc, ten);
    if (statSync(d).isDirectory()) ra.push(...moiFile(d));
    else if (/\.tsx?$/.test(ten)) ra.push(d);
  }
  return ra;
}
let soLd = 0;
let thieuVe = [];
for (const f of moiFile(path.join(GOC, "app"))) {
  const s = readFileSync(f, "utf8");
  // Bắt từng thẻ <script ...> có type ld+json, xét cả cụm thuộc tính của nó.
  for (const m of s.matchAll(/<script\b([\s\S]{0,400}?)type="application\/ld\+json"/g)) {
    soLd++;
    if (!m[1].includes("nonce")) thieuVe.push(path.relative(GOC, f));
  }
}
kiem(
  `mọi thẻ ld+json mang nonce (${soLd} thẻ)`,
  thieuVe.length === 0,
  thieuVe.join(", ") || "đủ vé",
);
// ⚠️ Không có thẻ nào cũng là ĐỎ: nghĩa là phép quét hỏng, hoặc dữ liệu có cấu
//   trúc đã bị xoá mất. Cổng không đo được thì không khác cổng luôn xanh.
kiem("có ít nhất một thẻ dữ liệu có cấu trúc", soLd > 0, `${soLd} thẻ`);

// ── MỘT TRANG = MỘT VÙNG NỘI DUNG CHÍNH ─────────────────────────────
// ⚠️ `<main>` lồng trong `<main>` là HTML sai, và làm liên kết "bỏ qua điều
//   hướng" nhảy vào đúng chỗ nó đang muốn tránh. Đo 21/08: 6 màn trong `app/app`
//   tự mở thêm một `<main>` bên trong `<main>` của khung app.
const trongApp = moiFile(path.join(GOC, "app", "app")).filter((f) =>
  readFileSync(f, "utf8").includes("<main") && !f.endsWith(path.join("app", "app", "layout.tsx")),
);
kiem(
  "không màn nào trong khung app tự mở thêm <main>",
  trongApp.length === 0,
  trongApp.map((f) => path.relative(GOC, f)).join(", ") || "sạch",
);

console.log("");
if (truot) {
  console.error(`❌ ${truot} chỗ chưa đạt.`);
  console.error("   Nhớ: cả hai lớp lỗi này KHÔNG làm trang hỏng — không có cổng thì không ai thấy.");
  process.exit(1);
}
console.log("✅ Trang công khai khai đủ canonical, Open Graph, và thẻ dữ liệu đều mang nonce.");
