/**
 * CỔNG: hai thao tác kiểu app trên điện thoại — kéo xuống tải lại, vuốt đổi ngày.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI ĐO BẰNG NGÓN TAY THẬT
 * ═══════════════════════════════════════════════════════════════════
 * Cả hai thao tác chỉ tồn tại trong sự kiện chạm. Đọc mã nguồn rồi suy ra là
 * không đủ: mọi lỗi đáng sợ của mảng này đều nằm ở chỗ CÁC ĐIỀU KIỆN LOẠI TRỪ
 * có chạy không —
 *   · đang cuộn giữa danh sách mà kéo xuống thì KHÔNG được tải lại;
 *   · vuốt xiên thì KHÔNG được đổi ngày;
 *   · đang mở hộp thoại thì cả hai phải câm.
 * Ba điều đó "có viết trong mã" không chứng minh được gì.
 *
 * ⚠️ Playwright dựng sự kiện chạm bằng CDP (`Input.dispatchTouchEvent`) — đúng
 *   loại sự kiện mà mã đang nghe, không phải chuột giả.
 *
 * Chạy: node scripts/thao-tac-app-smoke.mjs [địa-chỉ]
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
  // Khổ điện thoại + có cảm ứng — hai thao tác này CHỈ sống ở đây.
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  locale: "vi-VN",
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
});
const p = await ctx.newPage();

await p.goto(`${NEN}/login`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1200);
await p.fill("#identifier", "demo.ifan.2026@gmail.com");
await p.fill("#password", "DemoIfan#2026");
await p.click('button[type="submit"]');
let daVao = false;
for (let i = 0; i < 90; i++) {
  if (!new URL(p.url()).pathname.startsWith("/login")) { daVao = true; break; }
  await p.waitForTimeout(1000);
}
if (!daVao) {
  kiem("đăng nhập", false, "thường do chạm trần 10 lượt/5 phút");
  await b.close();
  process.exit(1);
}
kiem("đăng nhập", true);

/** Kéo ngón tay theo một đường thẳng, chia nhỏ để mã nghe được từng bước. */
async function keo(tu, den, buoc = 12) {
  const cdp = await ctx.newCDPSession(p);
  const diem = (x, y) => [{ x, y, radiusX: 3, radiusY: 3, force: 1, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: diem(tu.x, tu.y) });
  for (let i = 1; i <= buoc; i++) {
    const x = tu.x + ((den.x - tu.x) * i) / buoc;
    const y = tu.y + ((den.y - tu.y) * i) / buoc;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: diem(x, y) });
    await p.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

// ── ① Kéo xuống ở đỉnh danh sách ⇒ hiện dải "tải lại" ────────────────
await p.goto(`${NEN}/app/today`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1000);
const daiKeo = () => p.locator("text=/Kéo xuống để tải lại|Thả ra để tải lại|Đang tải/").count();
kiem("chưa kéo thì KHÔNG có dải nào", (await daiKeo()) === 0);

// Kéo ngắn (dưới ngưỡng) — dải phải hiện nhưng ở trạng thái "kéo xuống"
const cdp1 = await ctx.newCDPSession(p);
const d1 = (x, y) => [{ x, y, radiusX: 3, radiusY: 3, force: 1, id: 1 }];
await cdp1.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: d1(195, 300) });
for (let i = 1; i <= 10; i++) {
  await cdp1.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: d1(195, 300 + i * 12) });
  await p.waitForTimeout(16);
}
const chuLucKeo = await p.locator("body").innerText();
kiem(
  "kéo xuống ở đỉnh ⇒ hiện dải tải lại",
  /Kéo xuống để tải lại|Thả ra để tải lại/.test(chuLucKeo),
  chuLucKeo.slice(0, 40).replace(/\n/g, " "),
);
await cdp1.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await cdp1.detach();
await p.waitForTimeout(1400);

// ── ② Vuốt NGANG khi đang kéo ⇒ KHÔNG hiện dải ───────────────────────
await p.goto(`${NEN}/app/today`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(900);
await keo({ x: 60, y: 300 }, { x: 330, y: 316 });
await p.waitForTimeout(300);
kiem("vuốt NGANG ⇒ không nhận nhầm thành kéo tải lại", (await daiKeo()) === 0);

// ── ③ Đang mở hộp thoại ⇒ cả hai phải câm ────────────────────────────
await p.goto(`${NEN}/app/calendar?tao=1`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1500);
const coHop = (await p.locator('[role="dialog"][data-state="open"]').count()) > 0;
if (!coHop) {
  // ⚠️ KHÔNG bỏ qua: không mở được hộp thoại nghĩa là phép đo RỖNG.
  kiem("mở được hộp thoại để thử", false, "?tao=1 không mở hộp Đặt lịch");
} else {
  kiem("mở được hộp thoại để thử", true);
  await keo({ x: 195, y: 300 }, { x: 195, y: 460 });
  await p.waitForTimeout(300);
  kiem("đang mở hộp thoại ⇒ kéo xuống KHÔNG tải lại", (await daiKeo()) === 0);
}

// ── ④ Vuốt ngang ở màn Lịch ⇒ đổi ngày ───────────────────────────────
await p.goto(`${NEN}/app/calendar?v=ngay`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1500);
const ngayTruoc = new URL(p.url()).searchParams.get("date");
await keo({ x: 330, y: 500 }, { x: 60, y: 508 });
await p.waitForTimeout(1500);
const ngaySau = new URL(p.url()).searchParams.get("date");
kiem(
  "vuốt sang TRÁI ở Lịch ⇒ sang ngày sau",
  ngaySau !== null && ngaySau !== ngayTruoc,
  `${ngayTruoc ?? "(hôm nay)"} → ${ngaySau ?? "(không đổi)"}`,
);

// Vuốt ngược lại phải quay về đúng ngày cũ.
await keo({ x: 60, y: 500 }, { x: 330, y: 508 });
await p.waitForTimeout(1500);
const ngayVe = new URL(p.url()).searchParams.get("date");
kiem("vuốt sang PHẢI ⇒ quay lại ngày trước đó", ngayVe !== ngaySau, `${ngaySau} → ${ngayVe}`);

// ── ⑤ Vuốt XIÊN ⇒ KHÔNG đổi ngày ─────────────────────────────────────
const truocXien = new URL(p.url()).searchParams.get("date");
await keo({ x: 300, y: 400 }, { x: 210, y: 640 });
await p.waitForTimeout(1200);
kiem(
  "vuốt XIÊN ⇒ không đổi ngày",
  new URL(p.url()).searchParams.get("date") === truocXien,
  `${truocXien} → ${new URL(p.url()).searchParams.get("date")}`,
);

await b.close();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
