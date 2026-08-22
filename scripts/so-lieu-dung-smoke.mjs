/**
 * KIỂM ĐƯỜNG ĐẾM LƯỢT DÙNG — và những thứ nó KHÔNG được đếm.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Trước migration #329, kho KHÔNG có bất kỳ số liệu sử dụng nào: không biết
 * tiệm nào còn quay lại, không biết tính năng nào có người dùng. Founder quyết
 * đầu tư dựa trên cảm giác, mà cảm giác về "tính năng nào quan trọng" gần như
 * luôn lệch với thực tế dùng.
 *
 * ⚠️ ĐƯỜNG ĐẾM LÀ THỨ DỄ HỎNG TRONG IM LẶNG: nó cố ý nuốt mọi lỗi (đếm hỏng
 *   không được làm phiền người dùng). Khi nó hỏng thì bảng trống, mà "bảng
 *   trống" trông giống hệt "chưa ai dùng" — và đó là lúc người ta kết luận sai
 *   về chính sản phẩm của mình.
 *
 * ⚠️ ĐO CẢ HAI CHIỀU. Đếm được là một nửa; nửa còn lại là KHÔNG đếm bừa:
 *   khoá màn phải nằm trong danh sách đóng, và người CHƯA đăng nhập thì không
 *   được tính — trộn lượt của khách lạ ghé trang giới thiệu vào là làm hỏng
 *   chính con số mình đang đo.
 *
 * Chạy: node scripts/so-lieu-dung-smoke.mjs [địa-chỉ]
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";
/** Giờ tiệm — cột `ngay` của `usage_daily` chốt theo múi giờ này (migration #329). */
const MUI_GIO = "Asia/Ho_Chi_Minh";
/** Tiệm của tài khoản demo bên dưới — cần để chốt đúng dòng trong khoá chính 3 cột. */
const TIEM_DEMO = "demo-spa-huong-sen";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync(path.join(GOC, ".env.local"))) {
  // ⚠️ `\r?\n`, KHÔNG phải `\n`: tách theo `\n` thì dòng kiểu Windows còn sót `\r` ở
  //   đuôi, mà trong regex JavaScript `\r` LÀ ký tự xuống dòng — `.` không khớp nó và
  //   `$` (không cờ `m`) chỉ khớp cuối chuỗi, nên `(.*)$` TRƯỢT sạch mọi dòng CRLF.
  //   Đo 22/08 trên `.env.local` của máy này (37 dòng CRLF + 6 dòng LF): đọc được đúng
  //   1/22 biến rồi dừng ở "thiếu khoá" ⇒ script này CHƯA TỪNG CHẠY ĐƯỢC trên Windows.
  for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const URL_NEN = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KHOA = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_NEN || !KHOA) {
  console.error("❌ Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

const db = createClient(URL_NEN, KHOA, { auth: { persistSession: false } });
const gui = async (than) =>
  (
    await fetch(`${NEN}/api/dung`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(than),
    })
  ).status;

// ── (1) Chưa đăng nhập thì KHÔNG được đếm ────────────────────────────
const truocLa = await db.from("usage_daily").select("man", { count: "exact", head: true });
kiem("cửa đếm trả 204 cho người lạ", (await gui({ man: "calendar" })) === 204);
const sauLa = await db.from("usage_daily").select("man", { count: "exact", head: true });
kiem("người CHƯA đăng nhập không được đếm", (sauLa.count ?? 0) === (truocLa.count ?? 0),
  `${truocLa.count} → ${sauLa.count}`);

// ── (2) Đăng nhập rồi mở màn thật ⇒ phải đếm ─────────────────────────
let duongTrinhDuyet = null;
if (process.platform === "win32") {
  if (!existsSync(CENT)) {
    console.error(`❌ Không tìm thấy Cent Browser ở: ${CENT}`);
    process.exit(1);
  }
  duongTrinhDuyet = CENT;
}
const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});
// ⚠️ ĐÓNG CỨNG MÚI GIỜ. Hàm `ghi_luot_dung` chốt cột `ngay` theo múi giờ mà
//   TRÌNH DUYỆT gửi lên, nên nếu để trình duyệt lấy múi giờ của máy thì ngày ghi
//   vào bảng và ngày cổng đi tìm có thể lệch nhau một ngày — cổng đỏ oan.
const ctx = await b.newContext({
  viewport: { width: 1280, height: 900 },
  locale: "vi-VN",
  timezoneId: MUI_GIO,
});
const p = await ctx.newPage();
await p.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
await p.fill("#identifier", "demo.ifan.2026@gmail.com");
await p.fill("#password", "DemoIfan#2026");
await p.click('button[type="submit"]');
try {
  await p.waitForURL(/\/app/, { timeout: 150000 });
} catch {
  console.error("❌ Không đăng nhập được (thường do chạm trần 10 lượt/5 phút).");
  await b.close();
  process.exit(1);
}

// ⚠️ ĐỌC ĐÚNG MỘT DÒNG THEO CẢ BA CỘT KHOÁ CHÍNH (ngay · tenant_id · man).
//   Bản cũ chỉ lọc `.eq("man", man).limit(1)` — mà khoá chính là BỘ BA, nên câu
//   đó bốc BỪA một dòng bất kỳ trùng tên màn: có thể là dòng của HÔM QUA, có thể
//   là dòng của TIỆM KHÁC, và không có `order` nên thứ tự cũng không hứa gì.
//   Hậu quả cả hai chiều: sản phẩm đếm đúng mà cổng vẫn đỏ (bốc trúng dòng cũ
//   không tăng), hoặc sản phẩm đếm hỏng mà cổng vẫn xanh (bốc trúng dòng tiệm
//   khác đang tăng). Đo 22/08: bảng có 5 dòng của 5 màn, câu cũ trả "1 → 1" —
//   một con số không liên quan gì tới lượt vừa mở.
const NGAY = new Intl.DateTimeFormat("en-CA", { timeZone: MUI_GIO }).format(new Date());
const { data: tiem } = await db
  .from("tenants")
  .select("id")
  .eq("slug", TIEM_DEMO)
  .maybeSingle();
if (!tiem?.id) {
  console.error(`❌ Không tìm thấy tiệm '${TIEM_DEMO}' — không chốt được dòng cần đọc.`);
  await b.close();
  process.exit(1);
}
const dem = async (man) => {
  const r = await db
    .from("usage_daily")
    .select("so_luot")
    .eq("ngay", NGAY)
    .eq("tenant_id", tiem.id)
    .eq("man", man)
    .maybeSingle();
  return r.data?.so_luot ?? 0;
};
const truocKho = await dem("stock");
await p.goto(`${NEN}/app/stock`, { waitUntil: "networkidle" });
// Chờ theo ĐIỀU KIỆN: lượt gửi là `sendBeacon`, không có gì để `await`.
let sauKho = truocKho;
for (let i = 0; i < 20 && sauKho === truocKho; i++) {
  await new Promise((r) => setTimeout(r, 500));
  sauKho = await dem("stock");
}
kiem("mở một màn thật thì được đếm", sauKho > truocKho, `${truocKho} → ${sauKho}`);

// ── (3) Đường dẫn có DỮ LIỆU không được lọt vào bảng đếm ──────────────
await p.goto(`${NEN}/app/orders`, { waitUntil: "networkidle" });
await new Promise((r) => setTimeout(r, 2500));
const rac = await db.from("usage_daily").select("man");
const xau = (rac.data ?? []).map((x) => x.man).filter((m) => !/^[a-z0-9_-]{1,40}$/.test(m));
kiem("bảng đếm chỉ chứa TÊN MÀN, không chứa mã đơn/mã khách", xau.length === 0, xau.join(", ") || "sạch");

// ── (4) Khoá màn bịa ra thì bị chặn ──────────────────────────────────
await gui({ man: "khoa-bia-dat-99" });
const bia = await db.from("usage_daily").select("man").like("man", "%bia%");
kiem("khoá màn bịa ra KHÔNG vào bảng", (bia.data ?? []).length === 0);

await b.close();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
