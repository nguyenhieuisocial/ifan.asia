/**
 * CỔNG: chọn English thì KHUNG phải là tiếng Anh — soát LÚC CHẠY, không soát tệp.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CẦN MỘT CỔNG NỮA, TRONG KHI ĐÃ CÓ CỔNG SOÁT TỪ ĐIỂN
 * ═══════════════════════════════════════════════════════════════════
 * `soat-hai-ban-dich.mjs` đọc hai tệp `messages/vi.json` và `messages/en.json`
 * rồi báo "sạch 4394/4394 khoá". Đúng — và KHÔNG ĐỦ. Nó soát TỆP, không soát
 * MÀN. Chữ tiếng Việt vẫn lọt lên màn tiếng Anh bằng ba đường mà cổng kia
 * không thấy:
 *
 *   ① dữ liệu trong kho chỉ có tiếng Việt (từ vựng ngành) bị đè lên nhãn;
 *   ② mã nguồn gõ thẳng chữ tiếng Việt, không đi qua kho câu chữ;
 *   ③ nhãn dựng từ biến, tra khoá lúc chạy chứ không lúc dịch.
 *
 * Đo 22/08 — đường ①: cột trái máy tính gọi `navLabelFor(...)` mà QUÊN truyền
 * `locale`. Hàm mặc định coi là tiếng Việt, rồi đè từ vựng ngành (chỉ có tiếng
 * Việt) lên nhãn. Kết quả: màn tiếng Anh vẫn hiện "Khách hàng", "Gói liệu
 * trình". Bản điện thoại truyền đúng từ trước, nên lỗi chỉ nằm ở cột trái — và
 * không ai thấy vì gần như mọi người dùng chạy tiếng Việt.
 *
 * ⚠️ CHỈ SOÁT KHUNG, KHÔNG SOÁT DỮ LIỆU. Tên khách "Chị Lan", tên tiệm "Spa
 *   Hương Sen", tên hàng "Gói liệu trình" — những thứ đó tiếng Việt là ĐÚNG và
 *   không bao giờ được dịch. Soát cả nội dung thì cổng kêu 1.252 dòng và không
 *   ai đọc nổi. Chỉ nhặt nhãn điều hướng, tiêu đề cột, nhãn ô nhập.
 *
 * ⚠️ Tên hiển thị của người đăng nhập nằm trong nút tài khoản ở thanh trên —
 *   cũng là DỮ LIỆU. Đã miễn trừ đích danh bên dưới.
 *
 * Chạy: node scripts/soat-tieng-anh-luc-chay.mjs [địa-chỉ]
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";

let duongTrinhDuyet = null;
if (process.platform === "win32") {
  if (!existsSync(CENT)) {
    console.error(`❌ Không tìm thấy Cent Browser ở: ${CENT}`);
    process.exit(1);
  }
  duongTrinhDuyet = CENT;
}

/** Chữ có dấu — bằng chứng chắc chắn nhất của tiếng Việt. */
const CO_DAU =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

/**
 * DỮ LIỆU đội lốt khung — miễn trừ đích danh, kèm lý do.
 *
 * ⚠️ Danh sách này phải NGẮN và mỗi dòng phải nói được vì sao. Thêm bừa vào đây
 *   là tự tay bịt mắt cổng.
 */
const MIEN_TRU = [
  // Nút tài khoản ở thanh trên in TÊN NGƯỜI ĐANG ĐĂNG NHẬP — tên người là dữ
  // liệu, không dịch. Nhận diện bằng chính tên trong tài khoản xem thử.
  /Chủ tiệm|Bạn |lễ tân|thợ/i,
];

const MAN = [
  "/app/today", "/app/calendar", "/app/contacts", "/app/orders", "/app/inbox",
  "/app/items", "/app/tasks", "/app/settings", "/app/reports", "/app/team",
  // ⚠️ BỐN MÀN THÊM 22/08 — chúng dùng nhiều chỗ chèn số kiểu ICU
  //   (`{n, number}`, `{pct}`, `{moc}`), mà chèn số SAI KHUÔN chỉ nổ lúc dựng
  //   giao diện Ở ĐÚNG NGÔN NGỮ ĐÓ. Dịch mã không thấy, và bản tiếng Việt chạy
  //   ngon vẫn không nói gì về bản tiếng Anh.
  "/app", "/app/cong-no", "/app/cashbook", "/app/orders/new",
];

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});
const ctx = await b.newContext({
  viewport: { width: 1280, height: 900 },
  locale: "en-US",
  // Trình duyệt chạy ngầm tự khai "HeadlessChrome" và bộ lọc máy dò ở
  // `/api/luot` loại đúng chữ đó — không đổi thì mỗi lượt chạy cổng này lại
  // làm lệch số liệu phễu.
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
});
const p = await ctx.newPage();

await p.goto(`${NEN}/login`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1200);

// ⚠️ BẤM NÚT EN THẬT, không đặt cookie tay. Đường người dùng thật đi qua là cái
//   nút này; đặt cookie tay là đo một cảnh không ai gặp.
const nutEn = p.getByRole("button", { name: /^EN$/ });
if ((await nutEn.count()) === 0) {
  kiem("có nút đổi sang English", false, "không thấy nút EN ở màn đăng nhập");
  await b.close();
  process.exit(1);
}
await nutEn.first().click();
await p.waitForTimeout(1500);
kiem("có nút đổi sang English", true);

await p.fill("#identifier", "demo.ifan.2026@gmail.com");
await p.fill("#password", "DemoIfan#2026");
await p.click('button[type="submit"]');
let daVao = false;
for (let i = 0; i < 90; i++) {
  if (!new URL(p.url()).pathname.startsWith("/login")) { daVao = true; break; }
  await p.waitForTimeout(1000);
}
if (!daVao) {
  // ⚠️ KHÔNG coi là "đạt vì chưa đo được". Không vào được thì cổng ĐỎ.
  kiem("đăng nhập bằng tiếng Anh", false, "thường do chạm trần 10 lượt/5 phút");
  await b.close();
  process.exit(1);
}
kiem("đăng nhập bằng tiếng Anh", true);

const SEL = "aside a, header a, header button, nav a, nav button, [role='tab'], th, label";
for (const duong of MAN) {
  await p.goto(`${NEN}${duong}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(600);
  const khung = await p.evaluate((sel) => {
    const ra = [];
    for (const el of document.querySelectorAll(sel)) {
      const t = (el.innerText || "").trim();
      if (t) ra.push(t);
    }
    return ra;
  }, SEL);
  const lot = [...new Set(khung)]
    .filter((x) => CO_DAU.test(x))
    .filter((x) => !MIEN_TRU.some((r) => r.test(x)));
  kiem(
    `${duong}: khung đã là tiếng Anh`,
    lot.length === 0,
    lot.slice(0, 5).map((x) => x.replace(/\n/g, " ").slice(0, 30)).join(" | "),
  );
}

await b.close();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
