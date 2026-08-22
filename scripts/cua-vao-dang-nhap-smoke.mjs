/**
 * Cổng: hai CỬA VÀO (/login, /signup) phải mở đúng chiều.
 *
 * VÌ SAO CÓ CỔNG NÀY. Founder báo ngày 22/08: *"khi đã login rồi thì không vào
 * được /login nữa chứ nhỉ?"* — và đúng là vào được, ô nhập mật khẩu vẫn hiện.
 * Người dùng thấy cái form thì kết luận mình vừa bị đăng xuất, dù phiên còn
 * nguyên. Đây rất có thể là lời giải cho chuyện "phải đăng nhập lại hoài": đo
 * cả ngày 22/08 cho thấy máy chủ KHÔNG hề cắt phiên của ai (có phiên sống 11,6
 * giờ, không phiên nào bị đặt hạn, vé sống 400 ngày). Thứ hỏng là CÁI HỌ THẤY.
 *
 * ⚠️ BA CHIỀU, THIẾU CHIỀU NÀO CŨNG CHẾT NGƯỜI:
 *   1. CHƯA đăng nhập → /login phải MỞ. Chặn nhầm chiều này là khoá cửa cả
 *      thiên hạ ra ngoài, và không ai báo được vì họ không vào nổi.
 *   2. ĐÃ đăng nhập → /login phải đi thẳng vào trong.
 *   3. Đăng xuất xong → /login phải MỞ LẠI. Nếu chốt "đã đăng nhập" đọc nhầm
 *      cookie cũ thì người vừa đăng xuất bị đá ngược vào trong — vòng lặp không
 *      thoát ra được.
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://127.0.0.1:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";
let TRINH_DUYET = null;
if (process.platform === "win32") {
  if (!existsSync(CENT)) {
    console.error(`❌ Không tìm thấy Cent Browser ở: ${CENT}`);
    process.exit(1);
  }
  TRINH_DUYET = CENT;
}

let loi = 0;
const bao = (ok, ten, them = "") => {
  if (!ok) loi++;
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${them ? " — " + them : ""}`);
};

const b = await chromium.launch({ headless: true, ...(TRINH_DUYET ? { executablePath: TRINH_DUYET } : {}) });
const ctx = await b.newContext({ locale: "vi-VN" });
const p = await ctx.newPage();

const oMatKhau = () => p.locator('input[type="password"]').count();
const dangO = () => new URL(p.url()).pathname;

// ---------- 1. Chưa đăng nhập: cửa phải MỞ ----------
for (const cua of ["/login", "/signup"]) {
  await p.goto(NEN + cua, { waitUntil: "domcontentloaded" });
  bao(dangO() === cua && (await oMatKhau()) > 0, `chưa đăng nhập: ${cua} mở được`, `đang ở ${dangO()}`);
}

// ---------- 2. Đã đăng nhập: cửa phải dẫn vào trong ----------
await p.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
await p.fill("#identifier", "demo.ifan.2026@gmail.com");
await p.fill("#password", "DemoIfan#2026");
await p.click('button[type="submit"]');
await p.waitForURL(/\/app\//, { timeout: 150000 });

for (const cua of ["/login", "/signup"]) {
  await p.goto(NEN + cua, { waitUntil: "domcontentloaded" });
  bao(dangO().startsWith("/app/") && (await oMatKhau()) === 0,
    `đã đăng nhập: ${cua} đi thẳng vào trong`, `đang ở ${dangO()}`);
}
// Trang chủ công khai KHÔNG được đá đi — người đã đăng nhập vẫn có quyền đọc
// trang giới thiệu, bảng giá... Đá cả trang chủ là chặn nhầm.
await p.goto(`${NEN}/`, { waitUntil: "domcontentloaded" });
bao(dangO() === "/", "đã đăng nhập: trang chủ công khai vẫn vào được", `đang ở ${dangO()}`);

// ---------- 3. Đăng xuất: cửa phải MỞ LẠI ----------
await ctx.clearCookies();
await p.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
bao(dangO() === "/login" && (await oMatKhau()) > 0, "sau khi mất phiên: /login mở lại", `đang ở ${dangO()}`);

await b.close();
console.log(loi === 0 ? "\nXANH" : `\nĐỎ: ${loi} mục`);
process.exit(loi === 0 ? 0 : 1);
