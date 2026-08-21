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

// 8. Moc ngay giua dong tin
await buoc("co moc ngay giua dong tin", async () => {
  if ((await page.locator("text=/^Hôm nay$/").count()) === 0)
    throw new Error("khong thay moc ngay 'Hom nay'");
});

// 9. Ghim tin
await buoc("ghim tin len dau kenh", async () => {
  await page.locator(`text=Cau hoi goc ${DAU}`).first().hover();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Ghim tin này lên đầu kênh/ }).first().click();
  await page.waitForTimeout(2500);
  if ((await page.locator("text=Đã ghim").count()) === 0)
    throw new Error("khong thay dai ghim");
});

// 10. De doc sau
await buoc("danh dau de doc sau", async () => {
  await page.locator(`text=Cau hoi goc ${DAU}`).first().hover();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Để đọc sau$/ }).first().click();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /Để đọc sau/ }).first().click();
  await page.waitForTimeout(2500);
  if ((await page.locator(`text=Cau hoi goc ${DAU}`).count()) === 0)
    throw new Error("tin khong co trong hop 'De doc sau'");
});

// 11. Tim trong tin nhan
await buoc("tim trong tin nhan", async () => {
  await page.goto(`${NEN}/app/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const o = page.getByPlaceholder(/Tìm kênh hoặc người/).first();
  await o.fill(DAU);
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: new RegExp(`Tìm .${DAU}. trong tin nhắn`) }).click();
  await page.waitForTimeout(2500);
  if ((await page.locator(`text=Cau hoi goc ${DAU}`).count()) === 0)
    throw new Error("khong tim thay tin vua gui");
});

// 12. TỰ DỌN — kênh và tin do chính phép thử vừa tạo.
//
// ⚠️ Bắt buộc, không phải "cho gọn". Cổng này chạy mỗi lần đẩy mã; không dọn
//   thì sau một tuần tiệm demo có vài chục kênh `thu-xxxxx` và người xem thử
//   sản phẩm nhìn vào thấy một đống rác.
//
// ⚠️ Dọn bằng KẾT NỐI CƠ SỞ DỮ LIỆU, KHÔNG dựng một đường API "xoá kênh theo
//   tên" trong bản chạy. Một đường như vậy tồn tại mãi mãi, phục vụ đúng một
//   phép thử, và là một cửa xoá dữ liệu mở sẵn cho bất kỳ ai tìm ra nó.
//
// ⚠️ Thiếu `SUPABASE_DB_URL` thì BÁO ĐỎ, không im lặng bỏ qua — bỏ qua nghĩa
//   là rác cứ chồng lên mà không ai biết.
await buoc("tu don kenh vua tao", async () => {
  if (!process.env.SUPABASE_DB_URL) {
    throw new Error("thieu SUPABASE_DB_URL nen khong don duoc — chay lai voi --env-file=.env.local");
  }
  const { readFileSync } = await import("node:fs");
  const pg = (await import("pg")).default;
  const db = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
  });
  await db.connect();
  try {
    const { rows } = await db.query(
      "select id from chat_channels where kind = 'topic' and name = $1",
      [DAU],
    );
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) throw new Error("khong tim thay kenh vua tao de don");
    await db.query(
      "delete from chat_reactions where message_id in (select id from chat_messages where channel_id = any($1))",
      [ids],
    );
    await db.query("delete from chat_messages where channel_id = any($1)", [ids]);
    await db.query("delete from chat_channels where id = any($1)", [ids]);
  } finally {
    await db.end();
  }
});

await page.screenshot({ path: "scratchpad-chat.png" });
console.log(`\nloi do trong ca phien: ${loi.length}${loi[0] ? " — " + loi[0] : ""}`);
await b.close();
