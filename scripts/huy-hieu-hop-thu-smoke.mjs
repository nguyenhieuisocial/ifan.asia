/**
 * Cổng: huy hiệu "tin chưa trả lời" ở thanh điều hướng ĐIỆN THOẠI không được
 * xuất hiện trong HTML do máy chủ dựng.
 *
 * VÌ SAO: màn Hộp thư bơm sẵn số đếm vào ĐÚNG khoá dữ liệu mà huy hiệu này đọc
 * (`["inbox-counts"]`). Trong một lượt dựng ở máy chủ, hai chỗ dùng CHUNG bộ nhớ
 * đệm — nên huy hiệu có hiện hay không phụ thuộc THỨ TỰ VẼ. Đo ngày 22/08 trước
 * khi sửa: máy chủ vẽ huy hiệu **10/15 lượt**, tức không ổn định.
 *
 * Trình duyệt luôn khởi đầu với bộ nhớ đệm rỗng ⇒ hai bên khác nhau ⇒ React vứt
 * toàn bộ HTML của máy chủ và vẽ lại bằng JavaScript. Bản phát hành thật KHÔNG
 * in cảnh báo nào (chỉ bản phát triển in) nên lỗi này **im lặng hoàn toàn** —
 * chỉ thấy được qua việc trang khựng một nhịp trên máy yếu. Đó là lý do phải có
 * cổng: không có gì tự kêu.
 *
 * Cổng đo HTML THÔ, chưa chạy JavaScript — đúng thứ quyết định có lệch hay không.
 * Sau đó kiểm huy hiệu VẪN HIỆN khi trang chạy xong, để không "chữa" lỗi bằng
 * cách giết luôn tính năng.
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://127.0.0.1:3000";
// Máy founder chạy Cent Browser (luật máy, CLAUDE.md §7); máy chạy cổng kiểm
// là Linux nên dùng Chromium đi kèm Playwright. Cùng nhân trình duyệt nên phép
// đo không đổi ý nghĩa. Giống hệt scripts/passkey-smoke.mjs.
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";
let TRINH_DUYET = null;
if (process.platform === "win32") {
  if (!existsSync(CENT)) {
    console.error(`❌ Không tìm thấy Cent Browser ở: ${CENT}`);
    process.exit(1);
  }
  TRINH_DUYET = CENT;
}
const DAU_HUY_HIEU = "-top-1.5 -right-2.5";
const SO_LUOT = 15;

let loi = 0;
const bao = (ok, ten, them = "") => {
  if (!ok) loi++;
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${them ? " — " + them : ""}`);
};

const b = await chromium.launch({
  headless: true,
  ...(TRINH_DUYET ? { executablePath: TRINH_DUYET } : {}),
});
const ctx = await b.newContext({ locale: "vi-VN", viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
await p.fill("#identifier", "demo.ifan.2026@gmail.com");
await p.fill("#password", "DemoIfan#2026");
await p.click('button[type="submit"]');
await p.waitForURL(/\/app\//, { timeout: 150000 });
const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

let coHuyHieu = 0;
for (let i = 0; i < SO_LUOT; i++) {
  const html = await (await fetch(`${NEN}/app/inbox`, { headers: { cookie } })).text();
  if (html.includes(DAU_HUY_HIEU)) coHuyHieu++;
}
bao(coHuyHieu === 0, `HTML máy chủ không chứa huy hiệu`, `${coHuyHieu}/${SO_LUOT} lượt có`);

await p.goto(`${NEN}/app/inbox`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4000);
const nhan = await p.locator('nav.fixed a[href="/app/inbox"]').first().getAttribute("aria-label");
const soHuyHieu = await p.locator('nav.fixed a[href="/app/inbox"] span.bg-destructive').count();
bao(soHuyHieu === 1, "huy hiệu VẪN hiện sau khi trang chạy xong", `thấy ${soHuyHieu}`);
bao(!!nhan && /\d/.test(nhan), "nhãn trợ năng có kèm SỐ tin chưa trả lời", JSON.stringify(nhan));

await b.close();
console.log(loi === 0 ? "\nXANH" : `\nĐỎ: ${loi} mục`);
process.exit(loi === 0 ? 0 : 1);
