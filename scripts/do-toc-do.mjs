/**
 * ĐO TỐC ĐỘ THẬT của các màn quan trọng — LCP, CLS, TTFB.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO ĐO TRƯỚC, SỬA SAU
 * ═══════════════════════════════════════════════════════════════════
 * Kho chưa từng đo tốc độ lần nào (0 chỗ dùng `web-vitals` hay
 * `PerformanceObserver`). Không có số thì mọi phép "tối ưu" đều là đoán, và
 * cách hỏng phổ biến nhất là sửa đúng thứ vốn đã nhanh rồi tự khen.
 *
 * BA CON SỐ, và vì sao đúng ba con số này:
 *   · LCP  — bao lâu thì thấy được thứ TO NHẤT trên màn. Đây là "trang đã hiện
 *            chưa" theo cảm nhận người dùng. Tốt < 2,5 giây.
 *   · CLS  — màn có NHẢY không sau khi hiện. Nhảy là nguyên nhân bấm nhầm nút,
 *            và trên điện thoại thì bấm nhầm là đặt nhầm lịch cho khách.
 *            Tốt < 0,1.
 *   · TTFB — máy chủ mất bao lâu để trả byte đầu tiên. Tách riêng để phân biệt
 *            "máy chủ chậm" với "trình duyệt vẽ chậm" — hai bệnh khác nhau,
 *            hai cách chữa khác nhau.
 *
 * ⚠️ KHÔNG đo INP ở đây. INP là độ trễ khi người dùng CHẠM/BẤM, chỉ có nghĩa
 *   với thao tác thật của người thật. Đo bằng máy sẽ ra một con số đẹp vô
 *   nghĩa. Nói thẳng còn hơn bày một cột số không tin được.
 *
 * ⚠️ ĐO Ở KHỔ ĐIỆN THOẠI LÀ CHÍNH. Phần lớn người dùng iFan là thợ dùng điện
 *   thoại; đo trên màn 1440px rồi kết luận "nhanh" là đo nhầm người.
 *
 * ┌─ KẾT QUẢ ĐO LẦN ĐẦU — 21/08/2026, trên bản đang phục vụ ────────
 * LCP:  XANH ở CẢ 9 màn, cả hai khổ máy (202ms – 1855ms, ngưỡng 2500ms).
 * CLS:  XANH ở cả 9 màn (cao nhất 0,033 — ngưỡng 0,1).
 * TTFB: một chỗ đỏ duy nhất là trang chủ ở lượt đầu (1466ms). Gọi lại 6 lượt
 *       thì ra 234–546ms, trung vị 338ms ⇒ đó là KHỞI ĐỘNG NGUỘI, không phải
 *       chậm thật.
 *
 * ⇒ KẾT LUẬN NGƯỢC VỚI DỰ ĐOÁN, ghi ra để không ai đi làm lại: bản rà soát
 *   trước đó đề xuất đổi sang `next/image`, tải ảnh trễ, chia nhỏ gói... Số đo
 *   nói những việc đó đang sửa thứ KHÔNG HỎNG. Ảnh thiếu kích thước có thể gây
 *   nhảy màn về lý thuyết, nhưng đo thật thì CLS gần bằng 0. Làm "tối ưu" mà
 *   không đo trước là cách phổ biến nhất để tốn công rồi tự khen.
 *
 * ⚠️ KHÔNG cắm file này thành cổng chặn trong CI. Ba con số này đổi theo mạng
 *   và theo máy chạy; đặt ngưỡng chặt thì cổng đỏ vì đường truyền, đặt ngưỡng
 *   lỏng thì nó không bắt được gì. Đây là CÔNG CỤ ĐO, chạy tay khi nghi ngờ.
 *
 * Chạy: node scripts/do-toc-do.mjs [địa-chỉ]
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "https://ifan-web.vercel.app";
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

/** Màn công khai (không cần đăng nhập) và màn trong app. */
const CONG_KHAI = ["/", "/bang-gia", "/tinh-nang", "/login"];
const TRONG_APP = ["/app/today", "/app/calendar", "/app/contacts", "/app/inbox", "/app/orders"];

const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});

/**
 * Đo một màn.
 *
 * ⚠️ Phải cài `PerformanceObserver` TRƯỚC khi trang chạy (`addInitScript`).
 *   Cài sau khi trang tải xong thì LCP đã bắn xong từ lâu và ta đo được số 0 —
 *   một con số đẹp hoàn toàn sai.
 */
async function doMan(page, duong) {
  await page.goto(`${NEN}${duong}`, { waitUntil: "load", timeout: 90000 });
  // Chờ trang lặng đi rồi mới chốt số: LCP có thể còn đổi sau khi ảnh về.
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const w = window;
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      lcp: Math.round(w.__lcp ?? 0),
      cls: Number((w.__cls ?? 0).toFixed(3)),
      ttfb: Math.round(nav?.responseStart ?? 0),
      nang: Math.round(
        performance.getEntriesByType("resource").reduce((t, r) => t + (r.transferSize || 0), 0) / 1024,
      ),
    };
  });
}

const CAI_DAT_DO = () => {
  const w = window;
  w.__lcp = 0;
  w.__cls = 0;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) w.__lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      // Bỏ qua dịch chuyển do chính người dùng gây ra — đó không phải lỗi trang.
      if (!e.hadRecentInput) w.__cls += e.value;
    }
  }).observe({ type: "layout-shift", buffered: true });
};

const NGUONG = { lcp: 2500, cls: 0.1, ttfb: 800 };
const dau = (ten, v) => (v <= NGUONG[ten] ? "🟢" : v <= NGUONG[ten] * 1.6 ? "🟡" : "🔴");

for (const [nhan, rong, cao, dt] of [
  ["ĐIỆN THOẠI (390px)", 390, 844, true],
  ["MÁY TÍNH (1440px)", 1440, 900, false],
]) {
  const ctx = await b.newContext({
    viewport: { width: rong, height: cao },
    locale: "vi-VN",
    ...(dt
      ? {
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 2,
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        }
      : {}),
  });
  await ctx.addInitScript(CAI_DAT_DO);
  const page = await ctx.newPage();

  console.log(`\n══ ${nhan} ══`);
  console.log("   màn                    LCP        CLS      TTFB     tải về");
  for (const d of CONG_KHAI) {
    const r = await doMan(page, d);
    console.log(
      `   ${d.padEnd(20)} ${dau("lcp", r.lcp)}${String(r.lcp).padStart(6)}ms  ${dau("cls", r.cls)}${String(r.cls).padStart(6)}  ${dau("ttfb", r.ttfb)}${String(r.ttfb).padStart(5)}ms ${String(r.nang).padStart(6)}KB`,
    );
  }

  // Đăng nhập một lần rồi đo các màn trong app.
  await page.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#identifier", EMAIL);
  await page.fill("#password", MAT_KHAU);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(/\/app/, { timeout: 120000 });
  } catch {
    console.log("   (không đăng nhập được — bỏ qua các màn trong app)");
    await ctx.close();
    continue;
  }
  for (const d of TRONG_APP) {
    const r = await doMan(page, d);
    console.log(
      `   ${d.padEnd(20)} ${dau("lcp", r.lcp)}${String(r.lcp).padStart(6)}ms  ${dau("cls", r.cls)}${String(r.cls).padStart(6)}  ${dau("ttfb", r.ttfb)}${String(r.ttfb).padStart(5)}ms ${String(r.nang).padStart(6)}KB`,
    );
  }
  await ctx.close();
}

await b.close();
console.log(`\nNgưỡng "tốt": LCP < ${NGUONG.lcp}ms · CLS < ${NGUONG.cls} · TTFB < ${NGUONG.ttfb}ms`);
console.log("⚠️ Không đo INP — nó chỉ có nghĩa với thao tác thật của người thật.");
