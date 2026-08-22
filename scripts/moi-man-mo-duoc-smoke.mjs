/**
 * CỔNG: mọi màn trong thanh điều hướng đều MỞ ĐƯỢC.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CẦN, DÙ ĐÃ CÓ DỊCH MÃ VÀ BẢN DỰNG
 * ═══════════════════════════════════════════════════════════════════
 * Ngày 22/08 màn Tổng quan **sập hoàn toàn** vì truyền một HÀM từ thành phần
 * chạy ở máy chủ sang thành phần chạy ở trình duyệt. TypeScript không kêu, bản
 * dựng không kêu, mọi bộ kiểm khác vẫn xanh — người dùng thì thấy một khung
 * báo lỗi thay cho cả màn hình.
 *
 * Lớp lỗi đó KHÔNG bắt được bằng cách đọc mã. Chỉ có một cách: mở từng màn ra.
 * Cổng này làm đúng việc thô sơ ấy, và nó rẻ — 27 màn, hơn một phút.
 *
 * ⚠️ TỰ LẤY DANH SÁCH MÀN TỪ THANH ĐIỀU HƯỚNG, KHÔNG ĐÓNG CỨNG. Đóng cứng thì
 *   màn MỚI thêm vào sẽ không ai canh — mà màn mới mới là màn dễ sập nhất.
 *
 * ⚠️ CÓ CA TỰ KIỂM PHÉP ĐO. Nếu không lấy được đủ màn thì cổng phải ĐỎ, không
 *   phải xanh: một danh sách rỗng duyệt qua hết cũng cho ra "0 lỗi".
 *
 * Chạy: node scripts/moi-man-mo-duoc-smoke.mjs [địa-chỉ]
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";
const TOI_THIEU_MAN = 20;

/**
 * ⚠️ DANH SÁCH BỎ QUA PHẢI NGẮN VÀ PHẢI GIẢI THÍCH ĐƯỢC TỪNG CÁI. Bỏ qua bừa là
 *   cách một cổng dần dần hoá mù.
 *   Cái duy nhất ở đây là tiếng ồn của Next lúc CHẠY THỬ: nó tự đo thời gian
 *   dựng trang và đôi khi ra mốc âm. Đã đối chiếu trên bản ĐANG PHỤC VỤ:
 *   /app/reports không hề có lỗi này. Tức là nó không tới tay người dùng.
 */
const ON_AO = [/cannot have a negative time stamp/i];

let duongTrinhDuyet = null;
if (process.platform === "win32") {
  if (!existsSync(CENT)) {
    console.error(`❌ Không tìm thấy Cent Browser ở: ${CENT}`);
    process.exit(1);
  }
  duongTrinhDuyet = CENT;
}

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${!ok && ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});
const ctx = await b.newContext({
  viewport: { width: 1400, height: 1000 },
  locale: "vi-VN",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
});
const p = await ctx.newPage();

await p.goto(`${NEN}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(2000);
await p.fill("#identifier", "demo.ifan.2026@gmail.com");
await p.fill("#password", "DemoIfan#2026");
await p.click('button[type="submit"]');
let daVao = false;
for (let i = 0; i < 120; i++) {
  if (!new URL(p.url()).pathname.startsWith("/login")) { daVao = true; break; }
  await p.waitForTimeout(1000);
}
if (!daVao) {
  kiem("đăng nhập", false, "thường do chạm trần 10 lượt/5 phút");
  await b.close();
  process.exit(1);
}
kiem("đăng nhập", true);

await p.goto(`${NEN}/app`, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(1500);
const duongDans = await p.evaluate(() => {
  const ra = new Set();
  for (const a of document.querySelectorAll('a[href^="/app"]')) {
    const h = a.getAttribute("href") ?? "";
    // Bỏ đường dẫn có tham số và đường dẫn tới MỘT bản ghi cụ thể: chúng phụ
    // thuộc dữ liệu, và cổng này canh MÀN chứ không canh bản ghi.
    if (!h.includes("?") && !/\/[0-9a-f]{8}-/.test(h)) ra.add(h);
  }
  return [...ra].sort();
});

kiem(
  `phép đo còn sống: lấy được danh sách màn từ thanh điều hướng (${duongDans.length})`,
  duongDans.length >= TOI_THIEU_MAN,
  `chỉ thấy ${duongDans.length} màn — nhiều khả năng thanh điều hướng không dựng được`,
);

const hong = [];
for (const d of duongDans) {
  const loi = [];
  const onErr = (e) => {
    if (!ON_AO.some((x) => x.test(e.message))) loi.push(e.message);
  };
  p.on("pageerror", onErr);
  try {
    await p.goto(`${NEN}${d}`, { waitUntil: "networkidle", timeout: 90000 });
    await p.waitForTimeout(900);
  } catch (e) {
    loi.push(`mở trang hỏng: ${e.message.slice(0, 70)}`);
  }
  const chu = await p.innerText("body").catch(() => "");
  p.off("pageerror", onErr);

  if (/Có lỗi xảy ra|Something went wrong|Application error/i.test(chu)) {
    hong.push(`${d}: rơi vào khung báo lỗi`);
  } else if (/Không tìm thấy trang/i.test(chu)) {
    hong.push(`${d}: 404`);
  } else if (loi.length) {
    hong.push(`${d}: ${loi[0].slice(0, 90)}`);
  }
}

kiem(
  `mọi màn đều mở được, không màn nào sập (${duongDans.length} màn)`,
  hong.length === 0,
  hong.join(" · "),
);

await b.close();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
