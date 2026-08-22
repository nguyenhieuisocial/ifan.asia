/**
 * CỔNG: hai chỗ người bán từng buộc phải rời màn tạo đơn.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI MỞ TRÌNH DUYỆT THẬT
 * ═══════════════════════════════════════════════════════════════════
 * Cả hai tính năng ở đây là CHUỖI THAO TÁC, không phải một hàm trả về giá trị:
 * gõ tên → không thấy → bấm tạo → điền → khách được CHỌN SẴN → nhập giỏ → lưu →
 * MÀN Ở NGUYÊN CHỖ. Đọc mã nguồn không chứng minh được chuỗi đó liền mạch; chỉ
 * cần một bước rớt là cả tính năng vô dụng, mà không có gì đỏ lên.
 *
 * ⚠️ CỔNG NÀY GHI DỮ LIỆU THẬT (một khách và một đơn nháp) rồi TỰ DỌN ở cuối.
 *   Không dọn được thì phải KÊU LÊN, đừng im — rác trong tiệm demo là thứ
 *   founder sẽ nhìn thấy.
 *
 * Chạy: node scripts/nhap-nhanh-don-smoke.mjs [địa-chỉ]
 */
import { chromium } from "playwright-core";
import pg from "pg";
import { existsSync, readFileSync } from "node:fs";

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";

if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* CI đã có env sẵn */
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
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${!ok && ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

// Tên và số điện thoại RIÊNG cho mỗi lượt chạy, để lượt này không thấy rác của
// lượt trước rồi báo "trùng" nhầm.
const dau = String(Date.now()).slice(-7);
const TEN = `Khach Kiem ${dau}`;
const SDT = `09${dau}9`;

const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});
const ctx = await b.newContext({
  viewport: { width: 900, height: 1000 },
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

await p.goto(`${NEN}/app/orders/new`, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(1200);

// ── ① Tìm một khách chắc chắn không có ────────────────────────────
const oTim = p.locator('input[placeholder]').first();
await oTim.fill(TEN);
await p.waitForTimeout(1400);
const nutTao = p.getByRole("button", { name: new RegExp(`Tạo khách`) });
kiem("① tìm không ra ⇒ hiện lối tạo khách ngay tại chỗ", (await nutTao.count()) > 0);

await oTim.fill("a");
await p.waitForTimeout(1400);
kiem(
  "① tìm RA khách ⇒ KHÔNG bày lối tạo mới (đó là cách người ta tạo trùng)",
  (await p.getByRole("button", { name: /Tạo khách/ }).count()) === 0,
);

await oTim.fill(TEN);
await p.waitForTimeout(1400);
await p.getByRole("button", { name: /Tạo khách/ }).click();
await p.waitForTimeout(600);
kiem("① bấm vào ⇒ mở bảng nhập gọn ngay trong màn", (await p.locator("#khach-ten").count()) > 0);
kiem(
  "① tên vừa gõ được điền sẵn, không bắt gõ lại",
  (await p.locator("#khach-ten").inputValue()) === TEN,
);

await p.fill("#khach-dien-thoai", SDT);
await p.waitForTimeout(900);
await p.getByRole("button", { name: "Tạo và chọn" }).click();
await p.waitForTimeout(2500);
const chuSauTao = await p.innerText("body");
kiem("① tạo xong ⇒ khách được CHỌN SẴN, không phải đi tìm lại", chuSauTao.includes(TEN));

// ── ② Cảnh báo trùng số điện thoại ────────────────────────────────
await p.goto(`${NEN}/app/orders/new`, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(1200);
const oTim2 = p.locator('input[placeholder]').first();
await oTim2.fill(`${TEN} khac`);
await p.waitForTimeout(1400);
if ((await p.getByRole("button", { name: /Tạo khách/ }).count()) > 0) {
  await p.getByRole("button", { name: /Tạo khách/ }).click();
  await p.waitForTimeout(500);
  await p.fill("#khach-dien-thoai", SDT);
  await p.waitForTimeout(1400);
  const chu = await p.innerText("body");
  kiem("② gõ trùng số ⇒ CẢNH BÁO đã có khách dùng số này", /Đã có khách dùng số này/.test(chu));
  kiem("② cảnh báo có lối dùng luôn khách cũ", /Dùng khách này/.test(chu));
  kiem(
    "② CẢNH BÁO chứ KHÔNG chặn — nút tạo vẫn bấm được",
    await p.getByRole("button", { name: "Tạo và chọn" }).isEnabled(),
    "nút bị khoá: hai người nhà dùng chung số là chuyện có thật",
  );
} else {
  kiem("② mở được bảng nhập gọn lần hai", false, "không thấy lối tạo khách");
}

// ── ④ Lưới chứng từ: khối tổng, tồn kho, tiền có dấu chấm ─────────
// ⚠️ CA ĐẦU CANH ĐÚNG MỘT LỖI ĐÃ ĐO ĐƯỢC 22/08: thêm hai dòng hàng tổng
//   700.000đ mà TOÀN BỘ chữ trên màn không có chữ "Tổng" nào. Người bán bấm
//   "Tạo đơn" mà chưa từng nhìn thấy khách phải trả bao nhiêu. Trên một màn bán
//   hàng, đó là con số quan trọng nhất.
await p.goto(`${NEN}/app/orders/new`, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(1200);
await p.locator('input[placeholder]').first().fill("a");
await p.waitForTimeout(1500);
await p.locator("ul li button").first().click();
await p.waitForTimeout(700);

const oThem = p.locator('select[aria-label*="Chọn mặt hàng"]').first();
kiem("④ có ô chọn mặt hàng để thêm dòng", (await oThem.count()) > 0);
await oThem.selectOption({ index: 1 });
await p.waitForTimeout(700);
kiem(
  "④ CHỌN mặt hàng là thêm dòng LUÔN, không cần bấm nút Thêm",
  (await p.locator('input[aria-label="SL"]').count()) === 1,
);

const doc = async () => (await p.innerText("main")).replace(/\s+/g, " ");
const tongCua = (s) => (s.match(/Khách phải trả ([\d.]+)đ/) ?? [])[1] ?? null;

let chu = await doc();
kiem("④ có KHỐI TỔNG với dòng 'Khách phải trả'", tongCua(chu) !== null, "không thấy tổng nào");

kiem(
  "④ đơn giá hiện CÓ dấu chấm nghìn",
  /^[\d.]+$/.test(await p.locator('input[aria-label="Đơn giá"]').first().inputValue()) &&
    (await p.locator('input[aria-label="Đơn giá"]').first().inputValue()).includes("."),
  `ô giá đang là "${await p.locator('input[aria-label="Đơn giá"]').first().inputValue()}"`,
);

const truocSL = tongCua(chu);
await p.locator('input[aria-label="SL"]').first().fill("3");
await p.waitForTimeout(600);
chu = await doc();
kiem("④ sửa số lượng ⇒ tổng đổi theo", tongCua(chu) !== truocSL, `vẫn là ${truocSL}`);

const truocGiam = tongCua(chu);
await p.locator('input[aria-label="Giảm"]').first().fill("10%");
await p.waitForTimeout(700);
chu = await doc();
kiem("④ gõ giảm '10%' ⇒ quy ra tiền và tổng giảm theo", tongCua(chu) !== truocGiam, `vẫn là ${truocGiam}`);
kiem("④ khối tổng nói rõ đã giảm bao nhiêu", /Giảm giá −/.test(chu));

// ── ③ Lưu và nhập tiếp ────────────────────────────────────────────
await p.goto(`${NEN}/app/orders/new`, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(1200);
const oTim3 = p.locator('input[placeholder]').first();
await oTim3.fill(TEN);
await p.waitForTimeout(1500);
await p.locator("ul li button").first().click();
await p.waitForTimeout(600);
const nutTiep = p.getByRole("button", { name: "Lưu và nhập tiếp" });
kiem("③ có nút 'Lưu và nhập tiếp' cạnh nút tạo đơn", (await nutTiep.count()) > 0);

if ((await nutTiep.count()) > 0) {
  await nutTiep.click();
  await p.waitForTimeout(3500);
  kiem(
    "③ bấm xong VẪN Ở MÀN TẠO ĐƠN, không bị đẩy sang chi tiết đơn",
    new URL(p.url()).pathname === "/app/orders/new",
    `đã nhảy sang ${new URL(p.url()).pathname}`,
  );
  kiem(
    "③ khách được xoá để nhập khách tiếp theo",
    !(await p.innerText("body")).includes(TEN),
    "khách cũ còn dính lại — đơn sau sẽ ghi nhầm tên người",
  );
}

await b.close();

// ── Dọn rác ───────────────────────────────────────────────────────
if (process.env.SUPABASE_DB_URL) {
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
  const { rows } = await c.query(
    `select id from public.contacts where full_name like $1`,
    ["Khach Kiem %"],
  );
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await c.query(`delete from public.order_lines where order_id in
                     (select id from public.orders where contact_id = any($1))`, [ids]);
    await c.query(`delete from public.orders where contact_id = any($1)`, [ids]);
    await c.query(`delete from public.activities where contact_id = any($1)`, [ids]);
    await c.query(`delete from public.contacts where id = any($1)`, [ids]);
  }
  const { rows: [con] } = await c.query(
    `select count(*)::int n from public.contacts where full_name like $1`,
    ["Khach Kiem %"],
  );
  await c.end();
  kiem("dọn sạch khách và đơn do chính bộ kiểm tạo ra", con.n === 0, `còn sót ${con.n} khách`);
} else {
  console.log("  ⚠️ Thiếu SUPABASE_DB_URL — KHÔNG dọn được rác bộ kiểm vừa tạo.");
  truot += 1;
}

console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
