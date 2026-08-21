/**
 * KIỂM ĐẦU-CUỐI ĐĂNG NHẬP BẰNG VÂN TAY / FACE ID.
 *
 * Dùng "vân tay ảo" của Chrome (CDP `WebAuthn.addVirtualAuthenticator`) — máy
 * này không có đầu đọc vân tay thật, nhưng vân tay ảo chạy ĐÚNG giao thức:
 * cùng thuật toán ký, cùng phép kiểm chữ ký ở máy chủ. Cái nó không thay được
 * chỉ là hộp thoại hỏi người dùng, mà hộp đó không phải phần iFan viết.
 *
 * Chạy:  node scripts/passkey-smoke.mjs [địa-chỉ]     (mặc định localhost:3000)
 */
import { chromium } from "playwright-core";
import pg from "pg";
import { existsSync, readFileSync } from "node:fs";

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";

/**
 * Máy founder chạy Cent Browser (luật máy, CLAUDE.md §7); máy chạy cổng kiểm là
 * Linux nên dùng Chromium đi kèm Playwright. Cùng một nhân trình duyệt, nên
 * phép đo không đổi ý nghĩa.
 */
let duongTrinhDuyet = null;
if (process.platform === "win32") {
  if (!existsSync(CENT)) {
    console.error(`❌ Không tìm thấy Cent Browser ở: ${CENT}`);
    process.exit(1);
  }
  duongTrinhDuyet = CENT;
}
const EMAIL = "demo.ifan.2026@gmail.com";
const MAT_KHAU = "DemoIfan#2026";
const TEN_MAY = `may-thu-${Date.now().toString(36).slice(-6)}`;

// Máy founder đọc `.env.local`; máy chạy cổng kiểm nhận thẳng từ môi trường.
if (!process.env.SUPABASE_DB_URL && existsSync(".env.local")) {
  for (const d of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("❌ Thiếu SUPABASE_DB_URL — phép đo chốt chống phát lại cần đọc CSDL.");
  process.exit(1);
}
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
// Cổng kiểm chạy trên ĐÚNG kho của khách thật — không được giữ khoá lâu.
await db.query("set lock_timeout = '10s'");
await db.query("set statement_timeout = '30s'");

let dat = 0, truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  ok ? dat++ : truot++;
};

const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "vi-VN" });
const page = await ctx.newPage();
const loiConsole = [];
page.on("console", (m) => { if (m.type() === "error") loiConsole.push(m.text().slice(0, 200)); });

/** Giữ lại thân yêu cầu đăng nhập cuối cùng, để thử PHÁT LẠI nó ở bước 4. */
let thanDangNhap = null;
page.on("request", (r) => {
  if (r.method() === "POST" && r.url().endsWith("/api/passkey/dang-nhap")) thanDangNhap = r.postData();
});

// ── Gắn vân tay ảo ────────────────────────────────────────────────────
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    transport: "internal",        // "internal" = vân tay/Face ID gắn liền máy
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,          // coi như người dùng đã chạm vân tay
    automaticPresenceSimulation: true,
  },
});
console.log(`Vân tay ảo: ${authenticatorId}\nĐịa chỉ: ${NEN}\n`);

// ── 1. Đăng nhập bằng mật khẩu ────────────────────────────────────────
await page.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
await page.fill("#identifier", EMAIL);
await page.fill("#password", MAT_KHAU);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }),
  page.click('button[type="submit"]'),
]);
kiem("đăng nhập bằng mật khẩu vào được", !page.url().includes("/login"), page.url());

// ── 2. Thêm máy này ở Cài đặt → Tài khoản ─────────────────────────────
await page.goto(`${NEN}/app/settings/account`, { waitUntil: "domcontentloaded" });
const oTen = page.getByPlaceholder(/Đặt tên để nhận ra máy/i);
await oTen.waitFor({ state: "visible", timeout: 30000 });
kiem("mục vân tay / Face ID hiện ra ở Cài đặt", true);

await oTen.fill(TEN_MAY);
await page.getByRole("button", { name: /Thêm máy này/ }).click();
const dongMay = page.getByRole("listitem").filter({ hasText: TEN_MAY });
await dongMay.waitFor({ state: "visible", timeout: 30000 });
kiem("thêm được vân tay cho máy này", true, TEN_MAY);

// Vân tay ảo phải THẬT SỰ giữ một khoá — nếu không thì đăng ký chỉ là giao diện.
const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
kiem("máy đã giữ khoá thật", credentials.length === 1, `${credentials.length} khoá`);

// ── 3. Đăng xuất rồi vào lại CHỈ bằng vân tay ─────────────────────────
await ctx.clearCookies();
await page.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
const nutVanTay = page.getByRole("button", { name: /vân tay/i });
await nutVanTay.waitFor({ state: "visible", timeout: 30000 });
kiem("nút đăng nhập bằng vân tay hiện ở màn đăng nhập", true);

await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }),
  nutVanTay.click(),
]);
kiem("VÀO ĐƯỢC chỉ bằng vân tay, không gõ mật khẩu", !page.url().includes("/login"), page.url());

// ── 4. Chặn PHÁT LẠI — chốt an toàn quan trọng nhất của cả tính năng ──
//
// Chữ ký dùng lại được thì ai chặn được nó trên đường truyền cũng vào được tài
// khoản, mãi mãi. Có HAI ổ khoá độc lập, và phải đo RIÊNG từng cái:
//
//   ổ 1 — BỘ ĐẾM: thư viện tự chặn khi bộ đếm không tăng.
//   ổ 2 — THỬ THÁCH DÙNG MỘT LẦN: xoá ngay khi lấy ra.
//
// ⚠️ Đo chung thì ổ 1 che mất ổ 2 (đã dính đúng bẫy này ngày 21/08: cố tình bỏ
//   hẳn ổ 2 mà phép thử vẫn xanh). Ổ 2 mới là ổ DUY NHẤT còn tác dụng với
//   khoá đồng bộ của Apple/Google — loại luôn báo bộ đếm bằng 0, tức ổ 1 nghỉ.
kiem("bắt được thân yêu cầu để thử phát lại", Boolean(thanDangNhap));
if (thanDangNhap) {
  const than = JSON.parse(thanDangNhap);
  const doc = JSON.parse(Buffer.from(than.response.clientDataJSON, "base64url").toString("utf8"));

  // Thử thách vừa dùng phải BIẾN MẤT khỏi cơ sở dữ liệu.
  const conLai = await db.query(
    "select count(*)::int as n from public.passkey_challenges where challenge=$1", [doc.challenge]);
  kiem("thử thách bị xoá ngay sau khi dùng", conLai.rows[0].n === 0, `còn ${conLai.rows[0].n} dòng`);

  // Hạ bộ đếm trong CSDL xuống dưới mức chữ ký mang theo, để TẮT ổ 1. Còn lại
  // một mình ổ 2 đỡ đòn — đúng hoàn cảnh của khoá đồng bộ Apple/Google.
  const dem = await db.query(
    "select counter from public.passkeys where credential_id=$1", [than.id]);
  const demHienTai = Number(dem.rows[0]?.counter ?? 0);
  await db.query("update public.passkeys set counter=$2 where credential_id=$1",
    [than.id, Math.max(0, demHienTai - 1)]);

  const r = await ctx.request.post(`${NEN}/api/passkey/dang-nhap`, {
    headers: { "content-type": "application/json" },
    data: than,
  });
  const loi = await r.text();
  kiem("PHÁT LẠI bị chặn KỂ CẢ khi bộ đếm không cứu", r.status() === 401,
    `máy chủ trả ${r.status()} ${loi.slice(0, 60)}`);
  kiem("chặn đúng bằng ổ THỬ THÁCH, không phải ổ bộ đếm",
    loi.includes("challengeExpired"), loi.slice(0, 60));

  await db.query("update public.passkeys set counter=$2 where credential_id=$1",
    [than.id, demHienTai]);
}

// ── 5. Gỡ máy — danh sách phải gỡ được, không chỉ để xem ──────────────
await page.goto(`${NEN}/app/settings/account`, { waitUntil: "domcontentloaded" });
page.once("dialog", (d) => d.accept());
const dong2 = page.getByRole("listitem").filter({ hasText: TEN_MAY });
await dong2.waitFor({ state: "visible", timeout: 30000 });
await dong2.getByRole("button").click();
await dong2.waitFor({ state: "detached", timeout: 30000 });
kiem("gỡ được máy khỏi danh sách", true);

// ── 6. Gỡ rồi thì vân tay đó KHÔNG còn vào được ───────────────────────
await ctx.clearCookies();
await page.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
const nut2 = page.getByRole("button", { name: /vân tay/i });
await nut2.waitFor({ state: "visible", timeout: 30000 });
await nut2.click();
// Phải Ở LẠI màn đăng nhập. Chờ báo lỗi hiện ra thay vì chờ theo đồng hồ.
const bao = page.locator("[data-sonner-toast], [role='status'], [role='alert']").first();
await bao.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
kiem("vân tay đã gỡ thì KHÔNG vào được nữa", page.url().includes("/login"), page.url());

kiem("không có lỗi đỏ nào trên trình duyệt", loiConsole.length === 0, loiConsole.slice(0, 2).join(" | "));

await b.close();
await db.end();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
