/**
 * CỔNG: bảng lệnh (Ctrl K) mở được, đi được bằng bàn phím, và KHÔNG lệnh nào
 * dẫn vào trang trắng.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Bảng lệnh gom hai thứ vốn dễ lệch nhau:
 *   · danh sách MÀN lấy từ nav (`mobileSheetItems`) — nav thêm màn thì bảng
 *     lệnh tự có, không phải sửa hai chỗ;
 *   · danh sách VIỆC gõ tay trong `components/global-search/lenh.ts` — chỗ này
 *     KHÔNG có gì tự canh. Ai đó đổi đường dẫn màn "Tạo đơn" mà quên sửa ở đây
 *     thì lệnh vẫn hiện, vẫn bấm được, và dẫn vào một trang không có gì.
 *
 * ⚠️ LỆNH DẪN VÀO TRANG TRẮNG CÒN TỆ HƠN LÀ KHÔNG CÓ LỆNH: người dùng tưởng
 *   mình bấm sai chứ không nghĩ là máy hỏng, nên sẽ không ai báo.
 *
 * ⚠️ Cổng này mở bằng TRÌNH DUYỆT THẬT và bấm bằng BÀN PHÍM THẬT. Đọc mã nguồn
 *   rồi suy ra là không đủ: cả ba lỗi từng gặp ở đây (mũi tên không chạy, dòng
 *   chọn nằm ngoài tầm nhìn, Enter mở nhầm dòng) đều không thấy được khi đọc.
 *
 * Chạy: node scripts/bang-lenh-smoke.mjs [địa-chỉ]
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
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "vi-VN" });
const p = await ctx.newPage();

await p.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
await p.fill("#identifier", "demo.ifan.2026@gmail.com");
await p.fill("#password", "DemoIfan#2026");
await p.click('button[type="submit"]');
try {
  await p.waitForURL(/\/app/, { timeout: 150000 });
} catch {
  // ⚠️ KHÔNG coi đây là "đạt vì chưa đo được". Đăng nhập hỏng thì cổng ĐỎ.
  //   Trần 10 lượt/5 phút từng làm cổng khác đỏ oan, nhưng "đỏ oan" vẫn đúng
  //   hơn "xanh mà không đo gì".
  kiem("đăng nhập", false, "không vào được /app (có thể chạm trần 10 lượt/5 phút)");
  await b.close();
  process.exit(1);
}
kiem("đăng nhập", true);

const moBang = async () => {
  await p.keyboard.press("Control+k");
  await p.waitForSelector("#bang-lenh-ds", { timeout: 10000 });
};

// ── (1) Mở được, và chưa gõ gì đã có việc để bấm ─────────────────────
await moBang();
const soDongDau = await p.locator('#bang-lenh-ds [role="option"]').count();
kiem("Ctrl K mở bảng lệnh", true);
kiem("chưa gõ gì đã có sẵn việc để bấm", soDongDau > 0, `${soDongDau} dòng`);

// ── (2) Gõ KHÔNG DẤU vẫn ra màn có dấu ───────────────────────────────
// Đây là chỗ dễ lệch nhất: phần tìm khách bỏ dấu bằng RPC trong CSDL, phần lệnh
// bỏ dấu bằng JS trên máy. Hai luật khác nhau ⇒ cùng một ô mà hai nửa cư xử
// khác nhau, người dùng tưởng máy hỏng.
for (const [go, mong] of [
  ["lich", "Lịch"],
  ["don", "Đơn"],
  ["cong", "Công"],
]) {
  await p.fill('input[role="combobox"]', go);
  await p.waitForTimeout(500);
  const chu = await p.locator("#bang-lenh-ds").innerText();
  kiem(`gõ "${go}" (không dấu) ra được "${mong}"`, chu.includes(mong), chu.slice(0, 60).replace(/\n/g, " · "));
}

// ── (3) Bàn phím đi trọn vòng ────────────────────────────────────────
await p.fill('input[role="combobox"]', "lich");
await p.waitForTimeout(500);
const dongDau = await p.getAttribute('input[role="combobox"]', "aria-activedescendant");
await p.keyboard.press("ArrowDown");
const dongSau = await p.getAttribute('input[role="combobox"]', "aria-activedescendant");
kiem("mũi tên xuống đổi dòng đang chọn", dongDau !== dongSau, `${dongDau} → ${dongSau}`);
await p.keyboard.press("ArrowUp");
const veCho = await p.getAttribute('input[role="combobox"]', "aria-activedescendant");
kiem("mũi tên lên quay lại dòng cũ", veCho === dongDau, `${dongSau} → ${veCho}`);

// Trình đọc màn hình bám vào aria-activedescendant. Thiếu nó thì người mù bấm
// mũi tên mà không nghe thấy gì đổi — bảng lệnh coi như không dùng được.
kiem("có aria-activedescendant cho trình đọc màn hình", veCho !== null && veCho !== "");

// Enter phải MỞ ĐÚNG dòng đang sáng, không phải dòng đầu.
const nhanDangChon = await p.locator(`#${veCho}`).innerText();
await p.keyboard.press("Enter");
await p.waitForTimeout(1500);
const dongCua = (await p.locator("#bang-lenh-ds").count()) === 0;
kiem("Enter đóng bảng và đi tới nơi", dongCua, `dòng đang chọn: ${nhanDangChon.trim()}`);

// ── (4) Esc đóng ─────────────────────────────────────────────────────
await moBang();
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
kiem("Esc đóng bảng", (await p.locator("#bang-lenh-ds").count()) === 0);

// ── (5) KHÔNG lệnh nào dẫn vào trang trắng ───────────────────────────
// Đây là lý do chính có cổng này. Mở TỪNG đường dẫn của nhóm "Việc thường làm"
// và soi xem trang có nội dung thật không.
//
// ⚠️ Chỉ kiểm mã 200 là chưa đủ: Next trả 200 cho cả trang lỗi phía client.
//   Phải đo CHỮ TRÊN MÀN — dưới 200 ký tự là coi như trắng.
const DUONG_VIEC = [
  ["Tạo đơn mới", "/app/orders/new"],
  ["Thêm khách mới", "/app/contacts?new="],
  ["Đặt lịch cho khách", "/app/calendar?tao=1"],
  ["Ghi thu chi", "/app/cashbook?tao=1"],
  ["Gửi yêu cầu duyệt", "/app/approvals/new"],
];
for (const [ten, duong] of DUONG_VIEC) {
  const r = await p.goto(`${NEN}${duong}`, { waitUntil: "networkidle", timeout: 60000 });
  const chu = (await p.innerText("body")).trim();
  kiem(
    `lệnh "${ten}" mở ra trang có nội dung`,
    !!r && r.status() < 400 && chu.length > 200,
    `mã ${r?.status()} · ${chu.length} ký tự`,
  );
}

// ── (6) Hai lệnh deep-link phải MỞ SẴN ô nhập ────────────────────────
// Không có phần này thì lệnh "Đặt lịch" chỉ thả người dùng xuống màn Lịch rồi
// để họ tự đi tìm nút — đúng cái việc bảng lệnh sinh ra để khỏi phải làm.
await p.goto(`${NEN}/app/calendar?tao=1`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1200);
kiem(
  "?tao=1 ở Lịch mở sẵn hộp Đặt lịch",
  (await p.locator('[role="dialog"]').count()) > 0,
);

await p.goto(`${NEN}/app/cashbook?tao=1`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1200);
const soO = await p.locator('input[inputmode="numeric"], input[type="number"]').count();
kiem("?tao=1 ở Sổ quỹ mở sẵn ô ghi thu chi", soO > 0, `${soO} ô nhập số`);

// ── (7) Vai hẹp KHÔNG thấy cửa khoá ──────────────────────────────────
// Bảng lệnh gợi ý một cánh cửa rồi báo "không có quyền" thì khó chịu hơn là
// không gợi ý. Số dòng "đi tới màn" phải khớp số mục nav mà vai đó thấy.
await p.goto(`${NEN}/app/today`, { waitUntil: "networkidle", timeout: 60000 });
await moBang();
await p.fill('input[role="combobox"]', "a");
await p.waitForTimeout(600);
const chuBang = await p.locator("#bang-lenh-ds").innerText();
const soMucNav = await p.locator("aside nav a, aside a[href^='/app']").count();
kiem(
  "bảng lệnh không hé màn ngoài quyền",
  soMucNav > 0 && !chuBang.includes("undefined") && !/\bnav\./.test(chuBang),
  `nav thấy ${soMucNav} mục`,
);

// ── (8) CÔNG TẮC TẮT ⇒ BẢNG LỆNH BIẾN MẤT THẬT ──────────────────────
//
// Đây là phép đo nối hai mảng lại: công tắc (#331) và bảng lệnh. Kiểm riêng
// từng mảng thì cả hai đều xanh mà nối vào nhau vẫn có thể hỏng — ví dụ nút bị
// giấu nhưng phím Ctrl K vẫn mở được, tức là tắt nửa vời, và nửa còn lại đúng
// là nửa đang gây lỗi.
//
// ⚠️ Cần SUPABASE_DB_URL. Không có thì BÁO BỎ QUA cho người đọc biết, chứ
//   không lặng lẽ tính là đạt.
if (!process.env.SUPABASE_DB_URL) {
  console.log("  ⚠️ BỎ QUA 2 ca 'công tắc tắt ⇒ bảng lệnh biến mất': thiếu SUPABASE_DB_URL.");
} else {
  const { default: pg } = await import("pg");
  const { readFileSync } = await import("node:fs");
  const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
  });
  await c.connect();
  // ⚠️ TRẢ LẠI NGUYÊN TRẠNG trong `finally`. Cổng này chạy trên cơ sở dữ liệu
  //   THẬT — bỏ quên một công tắc ở trạng thái tắt là tắt tính năng của khách.
  const { rows: [truoc] } = await c.query(
    `select pham_vi from public.feature_flags where khoa = 'bang-lenh'`);
  try {
    await c.query(
      `insert into public.feature_flags (khoa, ten, pham_vi) values ('bang-lenh','Bang lenh','tat')
       on conflict (khoa) do update set pham_vi = 'tat'`);
    // Bộ đệm phía máy chủ giữ tối đa 60 giây (xem `lib/cong-tac.ts`).
    await p.waitForTimeout(62000);
    await p.goto(`${NEN}/app/today`, { waitUntil: "networkidle", timeout: 60000 });
    const conNut = await p.locator('button[aria-label], header button').count();
    await p.keyboard.press("Control+k");
    await p.waitForTimeout(800);
    kiem(
      "công tắc TẮT ⇒ Ctrl K không mở được bảng lệnh",
      (await p.locator("#bang-lenh-ds").count()) === 0,
      `${conNut} nút trên thanh`,
    );

    await c.query(`update public.feature_flags set pham_vi='moi_tiem' where khoa='bang-lenh'`);
    await p.waitForTimeout(62000);
    await p.goto(`${NEN}/app/today`, { waitUntil: "networkidle", timeout: 60000 });
    await p.keyboard.press("Control+k");
    await p.waitForTimeout(800);
    kiem("gạt lại BẬT ⇒ bảng lệnh mở lại được", (await p.locator("#bang-lenh-ds").count()) > 0);
  } finally {
    if (truoc) {
      await c.query(`update public.feature_flags set pham_vi=$1 where khoa='bang-lenh'`, [truoc.pham_vi]);
    } else {
      await c.query(`delete from public.feature_flags where khoa='bang-lenh'`);
    }
    await c.end();
  }
}

await b.close();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
