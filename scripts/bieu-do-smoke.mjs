/**
 * CỔNG: biểu đồ doanh thu bấm được, và đường khoan sâu LỌC THẬT.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY — HAI LỖI ĐÃ XẢY RA THẬT NGÀY 22/08
 * ═══════════════════════════════════════════════════════════════════
 * ① Truyền một HÀM từ thành phần chạy ở máy chủ sang thành phần chạy ở trình
 *    duyệt. TypeScript không kêu, bản dựng không kêu — nhưng lúc chạy thì
 *    **SẬP CẢ MÀN TỔNG QUAN** ("Functions cannot be passed directly to Client
 *    Components"). Chỉ mở màn ra nhìn mới thấy.
 *
 * ② Đường khoan sâu trỏ tới `/app/orders?tu=…&den=…` trong khi màn Đơn hàng
 *    **chỉ nhận `status`** — tức là bấm vào một ngày thì mở ra TOÀN BỘ danh
 *    sách đơn, không lọc gì. Người dùng tưởng mình bấm sai. Đúng lớp bệnh
 *    "lệnh dẫn vào trang trắng" mà cổng bảng lệnh đã canh.
 *
 * ⇒ Hai ca đầu ở đây canh đúng hai lỗi đó, và cả hai chỉ bắt được bằng cách MỞ
 *   TRÌNH DUYỆT THẬT. Đọc mã nguồn không thấy được cái nào.
 *
 * Chạy: node scripts/bieu-do-smoke.mjs [địa-chỉ]
 */
import { chromium } from "playwright-core";
import pg from "pg";
import { existsSync, readFileSync } from "node:fs";

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";

if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(".env.local", "utf8").split("\n")) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}

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
const kiem = (ten, ok, { doDuoc = "", khiTruot = "" } = {}) => {
  const duoi = [doDuoc, ok ? "" : khiTruot].filter(Boolean).join(" · ");
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${duoi ? " — " + duoi : ""}`);
  if (ok) dat++;
  else truot++;
};

const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});
const ctx = await b.newContext({
  viewport: { width: 1400, height: 950 },
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
  kiem("đăng nhập", false, { khiTruot: "thường do chạm trần 10 lượt/5 phút" });
  await b.close();
  process.exit(1);
}
kiem("đăng nhập", true);

// ── ① Màn Tổng quan KHÔNG được sập ───────────────────────────────────
await p.goto(`${NEN}/app?r=30`, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(1500);
const chu = await p.innerText("body");
kiem(
  "① màn Tổng quan dựng được, không rơi vào khung báo lỗi",
  !/Có lỗi xảy ra|Something went wrong/i.test(chu),
  { khiTruot: "khung lỗi hiện ra — xem lại ranh giới máy chủ / trình duyệt" },
);

// ── Biểu đồ bấm được và có bảng số ──────────────────────────────────
const cot = p.locator('[role="img"] button');
const soCot = await cot.count();
kiem("biểu đồ có cột BẤM ĐƯỢC", soCot > 5, { doDuoc: `${soCot} cột` });
kiem(
  "biểu đồ có nhãn cho trình đọc màn hình",
  ((await p.locator('[role="img"]').first().getAttribute("aria-label")) ?? "").length > 10,
);
kiem("có bảng số bên dưới biểu đồ", (await p.locator("table caption").count()) > 0);

if (soCot > 5) {
  await cot.nth(3).click();
  await p.waitForTimeout(500);
  const sau = await p.innerText("body");
  kiem("bấm một cột ⇒ hiện đường dẫn khoan sâu", /Xem đơn ngày/.test(sau));
}

// ── ③ Con số tiền KHÔNG được vỡ ─────────────────────────────────────
// ⚠️ LỖI THẬT 22/08: ô số dùng `break-words`, mà `break-words` cắt được ở GIỮA
//   một từ. Ở khổ 900px "511.081.500đ" tách thành hai dòng "511.081.50" và
//   "0đ" — người đọc thấy một con số KHÁC HẲN, và không có dấu hiệu nào cho
//   biết nó bị cắt. Đây là lỗi ĐỌC SAI SỐ TIỀN, không phải lỗi thẩm mỹ.
//   Sửa xong thì lộ ra vế thứ hai: để `nowrap` mà không thu nhỏ chữ thì số
//   TRÀN ra ngoài mép ô. Nên phải canh CẢ HAI.
for (const rong of [768, 900, 1280]) {
  await p.setViewportSize({ width: rong, height: 1000 });
  await p.goto(`${NEN}/app?r=30`, { waitUntil: "networkidle", timeout: 120000 });
  await p.waitForTimeout(1200);
  const vo = await p.evaluate(() => {
    const ra = [];
    for (const el of document.querySelectorAll("p.tabular-nums")) {
      const chu = (el.textContent ?? "").trim();
      if (!/\d/.test(chu)) continue;
      const dong = parseFloat(getComputedStyle(el).lineHeight) || 24;
      const soDong = Math.round(el.getBoundingClientRect().height / dong);
      const tran = el.scrollWidth > el.clientWidth + 1;
      if (soDong > 1 || tran) ra.push(`${chu.slice(0, 16)} (${soDong > 1 ? "cắt đôi" : "tràn"})`);
    }
    return ra.slice(0, 4);
  });
  kiem(`③ khổ ${rong}px — mọi con số nằm gọn MỘT dòng, không tràn`, vo.length === 0, vo.join(" · "));
}
await p.setViewportSize({ width: 1400, height: 950 });

// ── ② Đường khoan sâu phải LỌC THẬT ─────────────────────────────────
// ⚠️ Đối chiếu với CƠ SỞ DỮ LIỆU, không đối chiếu với chính màn hình. Đếm số
//   dòng rồi bảo "ít hơn là đã lọc" thì một bộ lọc trả về 0 dòng cũng "đạt".
if (!process.env.SUPABASE_DB_URL) {
  console.log("  ⚠️ BỎ QUA 2 ca đối chiếu số đơn: thiếu SUPABASE_DB_URL.");
} else {
  const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
  });
  await c.connect();
// Cổng kiểm chạy trên ĐÚNG kho dữ liệu của khách thật — một lượt kiểm treo sẽ
// giữ khoá và chặn cả việc áp bản vá khẩn. Đặt hạn để nó tự bỏ cuộc.
// (luật 1 của scripts/soat-ky-luat-bo-kiem.mjs)
await c.query("set lock_timeout = '10s'");
await c.query("set statement_timeout = '60s'");
  const t = (
    await c.query(`select id from public.tenants where slug = 'demo-spa-huong-sen'`)
  ).rows[0];
  // Ngày gần nhất CÓ đơn — không đóng cứng một ngày, dữ liệu mẫu sẽ cũ đi.
  const { rows: [n] } = await c.query(
    `select (created_at at time zone 'Asia/Ho_Chi_Minh')::date::text ngay, count(*)::int n
       from public.orders
      where tenant_id = $1 and deleted_at is null
      group by 1 order by 1 desc limit 1`,
    [t.id],
  );
  await c.end();

  const dem = async (url) => {
    await p.goto(url, { waitUntil: "networkidle", timeout: 120000 });
    await p.waitForTimeout(1200);
    return p.locator('a[href^="/app/orders/"]').count();
  };
  const loc = await dem(`${NEN}/app/orders?tu=${n.ngay}&den=${n.ngay}`);
  kiem(
    `② lọc ngày ${n.ngay} ⇒ hiện ĐÚNG số đơn cơ sở dữ liệu nói`,
    loc === n.n,
    { doDuoc: `màn ${loc} · CSDL ${n.n}` },
  );
  kiem(
    "② có chip nói rõ đang xem một lát cắt",
    /Chỉ ngày|Từ .* đến/.test(await p.innerText("body")),
    { khiTruot: "không thấy chip lọc — người dùng sẽ tưởng tiệm mất đơn" },
  );
}

await b.close();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
