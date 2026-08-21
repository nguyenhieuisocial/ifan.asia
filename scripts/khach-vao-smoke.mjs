/**
 * CỔNG: bộ đếm trang công khai (#333) đếm đúng, và KHÔNG lưu gì về người xem.
 *
 * ═══════════════════════════════════════════════════════════════════
 * BA LUẬT PHẢI GIỮ
 * ═══════════════════════════════════════════════════════════════════
 * ① ĐẾM THẬT. Mở trang bằng trình duyệt thật thì con số PHẢI tăng. Đây là chỗ
 *    dễ hỏng im lặng nhất: chặn nội dung (CSP) hoặc `sendBeacon` không chạy thì
 *    bộ đếm chết mà không ai biết — bảng vẫn có số cũ, trông vẫn bình thường.
 * ② KHÔNG LƯU GÌ VỀ NGƯỜI XEM. Bảng chỉ được có ngày·trang·loại·biến thể·số.
 *    Thêm một cột nào nhận ra người là hỏng cả thiết kế riêng tư.
 * ③ ĐƯỜNG ĐẾM KHÔNG NHẬN BỪA. Trang ngoài danh sách, loại lạ, máy dò tự động —
 *    đều phải bị bỏ qua. Số liệu bịa được thì mọi quyết định dựa trên nó đều
 *    vô nghĩa.
 *
 * ⚠️ CỔNG NÀY GHI THẬT VÀO BẢNG SỐ LIỆU CỦA CHỦ SAAS. Không có cách nào đo
 *   `sendBeacon` mà không ghi. CI chạy nhiều lượt mỗi ngày, nên nếu để nguyên
 *   thì phễu của founder sẽ cộng thêm vài lượt giả mỗi lần — và số liệu bịa
 *   được thì mọi quyết định dựa trên nó đều vô nghĩa.
 *
 *   ⇒ Cổng TRỪ LẠI ĐÚNG PHẦN MÌNH CỘNG trong `finally`. Trừ theo SỐ LƯỢT ĐÃ
 *   LÀM, không đặt lại về giá trị cũ: đặt lại sẽ xoá mất lượt của một người
 *   thật vừa ghé đúng lúc cổng đang chạy.
 *
 * Chạy: node scripts/khach-vao-smoke.mjs [địa-chỉ]
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
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL.");
  process.exit(1);
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
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();

/** Đếm số lượt CHÍNH CỔNG NÀY đã cộng, để trừ lại đúng bằng đó lúc xong. */
const daThem = new Map();
const ghiNho = (duongDan, loai, n = 1) => {
  const k = `${duongDan}|${loai}`;
  daThem.set(k, (daThem.get(k) ?? 0) + n);
};

const doSo = async (duongDan, loai) =>
  Number(
    (
      await c.query(
        // ⚠️ `public.ngay_vn()`, KHÔNG phải `current_date`. Bộ đếm ghi theo
        //   ngày Việt Nam (#337); đọc bằng giờ quốc tế thì suốt khung 00:00 tới
        //   07:00 sáng giờ VN sẽ đọc nhầm sang hôm qua và cổng đỏ oan.
        `select coalesce(sum(so), 0) n from public.luot_cong_khai
          where ngay = public.ngay_vn() and duong_dan = $1 and loai = $2`,
        [duongDan, loai],
      )
    ).rows[0].n,
  );

// ── ② Bảng chỉ được có đúng năm cột ─────────────────────────────────
const cot = (
  await c.query(
    `select column_name from information_schema.columns
      where table_name = 'luot_cong_khai' order by ordinal_position`,
  )
).rows.map((r) => r.column_name);
kiem(
  "② bảng đếm KHÔNG có cột nào nhận ra người xem",
  JSON.stringify(cot) === JSON.stringify(["ngay", "duong_dan", "loai", "bien_the", "so"]),
  cot.join(", "),
);

// ── ③ Đường đếm không nhận bừa ──────────────────────────────────────
const goi = async (than, ua) =>
  (
    await fetch(`${NEN}/api/luot`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": ua ?? "Mozilla/5.0 (thu-cong)" },
      body: JSON.stringify(than),
    })
  ).status;

const truocRac = await doSo("/", "xem");
await goi({ duongDan: "/app/orders/bi-mat", loai: "xem" });
await goi({ duongDan: "/", loai: "loai-la" });
await goi({ duongDan: "/", loai: "xem" }, "Googlebot/2.1 (+http://www.google.com/bot.html)");
await new Promise((r) => setTimeout(r, 800));
kiem(
  "③ trang ngoài danh sách · loại lạ · máy dò ⇒ đều bị bỏ qua",
  (await doSo("/", "xem")) === truocRac,
  `trước ${truocRac}, sau ${await doSo("/", "xem")}`,
);
// Đường dẫn trong khu đã đăng nhập KHÔNG được lọt vào bảng dù bằng cách nào.
const racApp = Number(
  (
    await c.query(`select count(*) n from public.luot_cong_khai where duong_dan like '/app%'`)
  ).rows[0].n,
);
kiem("③ không dòng nào mang đường dẫn khu đã đăng nhập", racApp === 0, `${racApp} dòng`);

// ── ① Mở trang thật thì số PHẢI tăng ────────────────────────────────
const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});
/**
 * ⚠️ PHẢI ĐỔI CHỮ KÝ TRÌNH DUYỆT. Trình duyệt chạy ngầm tự khai là
 *   "HeadlessChrome", và bộ lọc máy dò ở `/api/luot` loại đúng chữ "headless" —
 *   nên nếu để nguyên thì cổng này đo một cảnh KHÔNG BAO GIỜ xảy ra với người
 *   thật, và luôn báo "không đếm được" dù bộ đếm chạy tốt.
 *
 * ⚠️ Đây KHÔNG phải nới lỏng chốt: bộ lọc máy dò vẫn được kiểm riêng, bằng ca
 *   gọi thẳng với chữ ký Googlebot ở trên. Hai việc khác nhau, đo riêng.
 */
const ctx = await b.newContext({
  viewport: { width: 1280, height: 900 },
  locale: "vi-VN",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
});
const p = await ctx.newPage();
const loiCsp = [];
p.on("console", (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to/i.test(t)) loiCsp.push(t.slice(0, 120));
});

try {
  for (const duong of ["/", "/bang-gia"]) {
    const truoc = await doSo(duong, "xem");
    await p.goto(`${NEN}${duong}`, { waitUntil: "networkidle", timeout: 60000 });
    // `sendBeacon` gửi nền — chờ máy chủ ghi xong.
    await p.waitForTimeout(2500);
    const sau = await doSo(duong, "xem");
    if (sau > truoc) ghiNho(duong, "xem", sau - truoc);
    kiem(`① mở ${duong} ⇒ số lượt tăng`, sau > truoc, `${truoc} → ${sau}`);
  }
  kiem("① không bị chặn nội dung (CSP)", loiCsp.length === 0, loiCsp[0] ?? "");

  // ── Bấm nút Đăng ký ⇒ đếm được ────────────────────────────────────
  await p.goto(`${NEN}/bang-gia`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(600);
  const truocBam = await doSo("/bang-gia", "bam-dang-ky");
  const nut = p.locator('a[href="/signup"], a[href^="/signup?"]').first();
  if ((await nut.count()) === 0) {
    // ⚠️ KHÔNG tính là đạt. Không có nút để bấm nghĩa là phép đo RỖNG, và một
    //   phép đo rỗng nhìn y hệt một phép đo thành công.
    kiem("bấm nút Đăng ký ⇒ đếm được", false, "không thấy nút Đăng ký nào trên /bang-gia");
  } else {
    await nut.click();
    await p.waitForTimeout(2500);
    const sauBam = await doSo("/bang-gia", "bam-dang-ky");
    if (sauBam > truocBam) ghiNho("/bang-gia", "bam-dang-ky", sauBam - truocBam);
    // Bấm nút dẫn sang /signup ⇒ trang đó cũng tự đếm một lượt xem.
    ghiNho("/signup", "xem", 1);
    kiem("bấm nút Đăng ký ⇒ đếm được", sauBam > truocBam, `${truocBam} → ${sauBam}`);
  }

  // ── Màn phễu đọc ra số ─────────────────────────────────────────────
  const { rows: [ad] } = await c.query(`select count(*)::int n from public.platform_admins`);
  if (ad.n > 0) {
    const { rows: [pa] } = await c.query(`select user_id from public.platform_admins limit 1`);
    await c.query("begin");
    await c.query(
      `select set_config('request.jwt.claims',$1,true), set_config('role','authenticated',true)`,
      [JSON.stringify({ sub: pa.user_id, role: "authenticated" })],
    );
    const { rows: [ph] } = await c.query(`select public.admin_phieu_khach_vao(7) j`);
    await c.query("rollback");
    kiem(
      "màn phễu đọc ra đủ sáu bậc",
      ["b1_ghe", "b2_bang_gia", "b3_bam_dang_ky", "b4_mo_dang_ky", "b5_tao_tai_khoan", "b6_lap_tiem"]
        .every((k) => typeof ph.j?.[k] === "number"),
      JSON.stringify(ph.j).slice(0, 140),
    );
    // Người thường gọi hàm phễu ⇒ RỖNG, không ném lỗi.
    const { rows: [u] } = await c.query(`select id from auth.users where id <> $1 limit 1`, [pa.user_id]);
    await c.query("begin");
    await c.query(
      `select set_config('request.jwt.claims',$1,true), set_config('role','authenticated',true)`,
      [JSON.stringify({ sub: u.id, role: "authenticated" })],
    );
    const { rows: [x] } = await c.query(`select public.admin_phieu_khach_vao(7) j`);
    await c.query("rollback");
    kiem("người thường đọc phễu ⇒ RỖNG", JSON.stringify(x.j) === "{}", JSON.stringify(x.j).slice(0, 80));
  } else {
    console.log("  ⚠️ BỎ QUA 2 ca đọc phễu: bảng platform_admins đang trống.");
  }
} finally {
  await b.close();
  // Trừ lại đúng phần cổng đã cộng. `greatest(..., 0)` phòng trường hợp ai đó
  // đã dọn bảng giữa chừng — không bao giờ để số âm.
  for (const [k, n] of daThem) {
    const [duongDan, loai] = k.split("|");
    await c.query(
      `update public.luot_cong_khai set so = greatest(so - $3, 0)
        where ngay = public.ngay_vn() and duong_dan = $1 and loai = $2`,
      [duongDan, loai, n],
    );
  }
  // Ô đếm về 0 thì bỏ hẳn dòng — để bảng không đầy dòng rỗng do cổng sinh ra.
  await c.query(`delete from public.luot_cong_khai where so = 0`);
  if (daThem.size) {
    console.log(
      `  (đã trừ lại ${[...daThem.entries()].map(([k, n]) => `${k}=${n}`).join(" · ")})`,
    );
  }
  await c.end();
}

console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
