/**
 * KIỂM THAO TÁC TRÊN LƯỚI LỊCH — bấm ô trống, thu phóng, và màn "Theo người"
 * trên khổ điện thoại.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Founder báo bốn chuyện trong một câu, và cả bốn đều KHÔNG có cổng nào canh:
 *
 *   · "cuộn để zoom hoặc hai ngón để zoom"  → chưa có, và nút +/− còn nằm
 *     trong nhóm `hidden md:flex` nên điện thoại KHÔNG thu phóng được bằng
 *     bất kỳ cách nào.
 *   · "click vào ô trống vẫn Tạo Lịch (sai UX)" → một cú bấm mở thẳng hộp
 *     thoại che kín màn.
 *   · "theo người ở mobile vẫn hỏng ô lưới và hiển thị cột sai" → hàng chọn
 *     người kể 17 tên trong khi lưới dựng 8 cột, hai vùng cuộn ngang RỜI NHAU.
 *   · "lỗi hiển thị che cả tên" → tên bị cắt giữa chừng ("Đỗ Thị Phương T…")
 *     đúng ở phần phân biệt người.
 *
 * ⚠️ Không cổng nào bắt được lớp này bằng cách đọc mã nguồn: tất cả đều là
 *   HÀNH VI lúc chạy, và ba trong bốn cái chỉ hiện ở khổ điện thoại. Phải mở
 *   trình duyệt thật, đúng khổ máy, rồi bấm.
 *
 * ⚠️ HAI PHÉP ĐO ĐẦU TIÊN CỦA CHÍNH FILE NÀY ĐỀU SAI, ghi lại để không lặp:
 *   (1) tìm hộp thoại bằng chữ "Khách hàng" — chữ đó có ở chỗ khác trên màn;
 *   (2) đo cuộn trên "phần tử cuộn được đầu tiên gặp" — vớ phải phần tử khác.
 *   Cả hai ra ĐỎ trong khi mã chạy đúng. Phép đo sai và mã sai trông y hệt
 *   nhau; phải soi lại phép đo trước khi kết luận mã hỏng.
 *
 * Chạy: node scripts/lich-thao-tac-smoke.mjs [địa-chỉ]
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";
const EMAIL = "demo.ifan.2026@gmail.com";
const MAT_KHAU = "DemoIfan#2026";

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
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  ok ? dat++ : truot++;
};

const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});

async function dangNhap(page) {
  await page.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#identifier", EMAIL);
  await page.fill("#password", MAT_KHAU);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 150000 });
}

// ════════════════════════════════════════════════════════════════════
// PHẦN A — MÁY TÍNH (chuột thật)
// ════════════════════════════════════════════════════════════════════
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "vi-VN" });
const p = await ctx.newPage();
const loi = [];
p.on("console", (m) => {
  if (m.type() === "error") loi.push(m.text().slice(0, 140));
});

await dangNhap(p);
await p.goto(`${NEN}/app/calendar?v=tho`, { waitUntil: "networkidle" });
await p.waitForTimeout(2500);

const cot = p.locator("div.relative.flex-1.border-r").first();
const hop = await cot.boundingBox();

// (1) Bấm MỘT lần vào ô trống: chỉ CHỌN, không mở hộp thoại.
await p.mouse.click(hop.x + hop.width / 2, hop.y + hop.height * 0.8);
await p.waitForTimeout(600);
const bong = p.locator("[data-o-trong-dang-chon]").first();
const coBong = (await bong.count()) > 0 && (await bong.isVisible());
kiem("bấm một lần vào ô trống: hiện bong bóng chọn giờ", coBong);
const chuBong = coBong ? (await bong.innerText()).replace(/\s+/g, " ").trim() : "";
kiem("bong bóng có nút thêm lịch", /Thêm lịch|Add/i.test(chuBong), chuBong.slice(0, 46));
// ⚠️ Đếm `[role="dialog"]` — bong bóng KHÔNG được khai role đó (nó không khoá
//   tiêu điểm). Nếu ai đổi lại thành `dialog` thì phép đo này tự hỏng và sẽ
//   nhắc người sửa.
kiem(
  "bấm một lần KHÔNG mở hộp thoại Thêm lịch",
  (await p.locator('[role="dialog"]').count()) === 0,
);

// (2) Esc bỏ chọn.
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
kiem("Esc bỏ chọn ô", (await p.locator("[data-o-trong-dang-chon]").count()) === 0);

// (3) Ctrl + cuộn = thu phóng.
const caoCot = () =>
  p.evaluate(() => document.querySelectorAll("div.relative.flex-1.border-r")[0].clientHeight);
const caoTruoc = await caoCot();
await p.mouse.move(hop.x + hop.width / 2, hop.y + 100);
await p.keyboard.down("Control");
await p.mouse.wheel(0, -300);
await p.keyboard.up("Control");
await p.waitForTimeout(700);
const caoSau = await caoCot();
kiem("Ctrl + cuộn PHÓNG TO lưới", caoSau > caoTruoc, `${caoTruoc} → ${caoSau}`);

// (4) Cuộn THƯỜNG vẫn phải là cuộn — luật dễ phá nhất khi thêm thu phóng.
const dinhCuon = () =>
  p.evaluate(() => {
    const e = document.querySelector("main div.overflow-auto");
    return e ? e.scrollTop : null;
  });
const truocCuon = await dinhCuon();
await p.mouse.wheel(0, 240);
await p.waitForTimeout(600);
kiem("cuộn thường KHÔNG đổi mức phóng", (await caoCot()) === caoSau);
kiem("cuộn thường có dịch màn", (await dinhCuon()) !== truocCuon);

// ════════════════════════════════════════════════════════════════════
// PHẦN B — ĐIỆN THOẠI
// ════════════════════════════════════════════════════════════════════
// ⚠️ DÙNG LẠI PHIÊN của phần A, không đăng nhập lần hai. Cổng chặn 10 lượt
//   đăng nhập mỗi 5 phút cho một email (`authRateLimited`) — chạy đi chạy lại
//   trong lúc sửa là chạm trần, và lúc đó phép đo ĐỎ vì bị chặn cửa chứ không
//   phải vì màn lịch hỏng. Đã mất một lượt đi tìm nhầm chỗ vì chuyện này.
const m = await b.newContext({
  storageState: await ctx.storageState(),
  viewport: { width: 390, height: 844 },
  locale: "vi-VN",
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const p2 = await m.newPage();
await p2.goto(`${NEN}/app/calendar?v=tho`, { waitUntil: "networkidle" });
await p2.waitForTimeout(3000);

const dt = await p2.evaluate(() => {
  const nen = (s) => s.replace(/\s+/g, " ").trim();
  const chip = [...document.querySelectorAll("button")]
    .filter((e) => String(e.className).includes("rounded-full") && String(e.className).includes("border"))
    .map((e) => nen(e.innerText))
    .filter(Boolean);
  const dauCot = [...document.querySelectorAll("p")]
    .filter(
      (e) =>
        String(e.className).includes("font-semibold") &&
        String(e.className).includes("items-center"),
    )
    .map((e) => nen(e.innerText))
    .filter(Boolean);
  const nutZoom = [...document.querySelectorAll("button")].filter(
    (e) => /nhỏ|to|zoom/i.test(e.getAttribute("aria-label") || "") && e.offsetParent !== null,
  ).length;
  const soCa = document.querySelectorAll("[data-ca], main button[style*='top']").length;
  return { chip, dauCot, nutZoom, soCa };
});

// Chip nào không phải "+N người rảnh" thì phải khớp ĐÚNG một cột, cùng thứ tự.
const chipTen = dt.chip.filter((x) => !/rảnh|free/i.test(x)).map((x) => x.replace(/\s*\d+$/, ""));
kiem(
  "hàng chọn người khớp ĐÚNG các cột đang có",
  chipTen.length === dt.dauCot.length && chipTen.every((v, i) => v === dt.dauCot[i]),
  `chip ${chipTen.length} · cột ${dt.dauCot.length}`,
);
kiem(
  "tên rút gọn, không cắt cụt giữa chừng",
  dt.dauCot.length > 0 && dt.dauCot.every((x) => !x.includes("…")),
  dt.dauCot.slice(0, 3).join(" | "),
);
kiem("có nút thu phóng trên điện thoại", dt.nutZoom >= 2, `${dt.nutZoom} nút`);

// Lưới phải canh vào chỗ CÓ ca — không mở ra một màn trống trong khi đầu cột
// ghi "2 ca".
const coCaTrongMan = await p2.evaluate(() => {
  const khung = document.querySelector("main div.overflow-auto");
  if (!khung) return null;
  const r = khung.getBoundingClientRect();
  return [...document.querySelectorAll("main button")].some((e) => {
    const b = e.getBoundingClientRect();
    return b.height > 14 && b.top < r.bottom && b.bottom > r.top && b.width > 40;
  });
});
kiem("mở ra là THẤY ca, không phải màn trống", coCaTrongMan === true);

kiem("không có lỗi đỏ trên trình duyệt", loi.length === 0, loi.slice(0, 2).join(" | "));

await b.close();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
