import { chromium } from "playwright";
const NEN = "https://ifan-web.vercel.app";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";
const DAU = `thu-${Date.now().toString(36).slice(-6)}`;
const b = await chromium.launch({ executablePath: CENT, headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "vi-VN" });
const page = await ctx.newPage();
const loi = [];
page.on("console", (m) => { if (m.type() === "error") loi.push(m.text().slice(0, 160)); });

await page.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
await page.fill("#identifier", "demo.ifan.2026@gmail.com");
await page.fill("#password", "DemoIfan#2026");
await page.click('button[type="submit"]');
await page.waitForURL(/\/app/, { timeout: 45000 });
await page.goto(`${NEN}/app/chat`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const buoc = async (ten, fn) => {
  try { await fn(); console.log(`  ✓ ${ten}`); }
  catch (e) { console.log(`  ✗ ${ten}: ${String(e).slice(0, 110)}`); }
};

// 1. Nút tạo kênh có hiện không
await buoc("thay nut tao kenh", async () => {
  const n = page.getByRole("button", { name: /Tạo kênh mới/i }).first();
  if ((await n.count()) === 0) throw new Error("khong thay nut");
  await n.click();
  await page.waitForTimeout(700);
});

// 2. Cảnh báo kênh hạn chế có hiện đúng lúc tick không
await buoc("canh bao kenh han che hien khi tick", async () => {
  await page.fill("#ten-kenh", DAU);
  const cb = page.locator('input[type="checkbox"]').first();
  await cb.check();
  await page.waitForTimeout(400);
  const chu = await page.locator("text=/chủ tiệm LUÔN đọc được|Chủ tiệm LUÔN/i").count();
  if (chu === 0) throw new Error("KHONG thay cau canh bao");
  await cb.uncheck();
});

// 3. Tạo kênh thật
await buoc("tao kenh that", async () => {
  await page.getByRole("button", { name: /^Tạo kênh$/ }).click();
  await page.waitForTimeout(5000);
  const co = await page.locator(`text=${DAU}`).count();
  if (co === 0) throw new Error("kenh khong xuat hien trong danh sach");
});

// 4. Gửi một tin
await buoc("gui mot tin", async () => {
  const o = page.locator("textarea").first();
  await o.fill(`Cau hoi goc ${DAU}`);
  await page.getByRole("button", { name: /^Gửi$/ }).first().click();
  await page.waitForTimeout(2500);
  if ((await page.locator(`text=Cau hoi goc ${DAU}`).count()) === 0)
    throw new Error("tin khong hien");
});

// 5. Thả cảm xúc (nút ẩn — phải rê chuột vào dòng tin)
await buoc("tha cam xuc", async () => {
  await page.locator(`text=Cau hoi goc ${DAU}`).first().hover();
  await page.waitForTimeout(500);
  const n = page.getByRole("button", { name: /Thả cảm xúc 👍/ }).first();
  await n.click({ timeout: 5000 });
  await page.waitForTimeout(2500);
  if ((await page.locator("text=/👍\\s*1/").count()) === 0) throw new Error("khong thay 👍 1");
});

// 6. Mở luồng và trả lời
await buoc("tra loi trong luong", async () => {
  await page.locator(`text=Cau hoi goc ${DAU}`).first().hover();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Trả lời trong luồng/ }).first().click();
  await page.waitForTimeout(1200);
  const o = page.locator('textarea[placeholder*="luồng"]').first();
  await o.fill(`Tra loi ${DAU}`);
  await page.getByRole("button", { name: /^Gửi$/ }).last().click();
  await page.waitForTimeout(2500);
  if ((await page.locator(`text=Tra loi ${DAU}`).count()) === 0)
    throw new Error("cau tra loi khong hien");
});

// 7. Đếm câu trả lời hiện ở dòng chính
await buoc("dong chinh hien so cau tra loi", async () => {
  if ((await page.locator("text=/1 câu trả lời/").count()) === 0)
    throw new Error("khong thay '1 cau tra loi'");
});

await page.screenshot({ path: "scratchpad-chat.png" });
console.log(`\nloi do trong ca phien: ${loi.length}${loi[0] ? " — " + loi[0] : ""}`);
await b.close();
