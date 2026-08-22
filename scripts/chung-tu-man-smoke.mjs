/**
 * CỔNG: trọn vòng ảnh chứng từ trên màn thật — gửi ảnh lên, và mở lại xem được.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG ĐỦ NẾU CHỈ CÓ CỔNG PHÍA CƠ SỞ DỮ LIỆU
 * ═══════════════════════════════════════════════════════════════════
 * `chung-tu-phieu-chi-smoke.mjs` chứng minh HÀM chốt đúng. Nhưng chuỗi thật đi
 * qua bốn lớp: trình duyệt thu nhỏ ảnh → tải lên kho (RLS theo thư mục tiệm) →
 * ghi vào phiếu → xin đường dẫn ký hạn để xem lại. Chỉ cần một lớp rớt là chủ
 * tiệm mở phiếu ra không thấy ảnh đâu — mà không có gì đỏ lên, vì mỗi lớp tự
 * nó vẫn "đúng".
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CỔNG NÀY KHÔNG TỰ GHI MỘT PHIẾU CHI MỚI
 * ═══════════════════════════════════════════════════════════════════
 * Bản đầu có: ghi một phiếu chi thật rồi định dọn ở cuối. KHÔNG DỌN ĐƯỢC — và
 * đó là sản phẩm đang ĐÚNG. Sổ tiền chặn cả xoá cứng (`cash_entries_cam_xoa_cung`)
 * lẫn xoá mềm (`cash_entries_cam_xoa`), với gợi ý *"ghi một dòng đối ứng ngược
 * chiều để sửa — hai dòng cùng nằm lại làm bằng chứng"*. Ghi đối ứng ở đây cũng
 * sai nốt: tiền chưa từng ra khỏi két, thêm một dòng thu giả là bịa ra một giao
 * dịch không có thật.
 *   ⇒ Cổng MƯỢN một phiếu chi CÓ SẴN, nhớ nguyên trạng ảnh của nó, thử, rồi
 *     TRẢ LẠI y như cũ. Không thêm một dòng nào vào sổ của tiệm.
 *   ⇒ Phần "ghi phiếu mới có kèm ảnh" đã được cổng phía CSDL chứng minh.
 *
 * Chạy: node scripts/chung-tu-man-smoke.mjs [địa-chỉ]
 */
import { chromium } from "playwright-core";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";

if (!process.env.SUPABASE_DB_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    for (const d of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* CI đã có env sẵn */
  }
}
if (!process.env.SUPABASE_DB_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Thiếu SUPABASE_DB_URL / SUPABASE_SERVICE_ROLE_KEY — cổng này KHÔNG tự bỏ qua.");
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
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${!ok && ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

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
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { rows: [tiem] } = await c.query(
  `select id from public.tenants where slug = 'demo-spa-huong-sen'`,
);
// Phiếu chi mới nhất CỦA THÁNG NÀY — màn sổ quỹ mặc định mở tháng hiện tại,
// mượn phiếu tháng khác thì mở màn ra không thấy nó đâu.
const { rows: [muon] } = await c.query(
  `select id, chung_tu, amount_vnd from public.cash_entries
    where tenant_id = $1 and direction = 'out' and deleted_at is null
      and created_at >= date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')
    order by created_at desc limit 1`,
  [tiem.id],
);

const ANH_TAM = "scratch-chung-tu.png";
writeFileSync(
  ANH_TAM,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAJUlEQVR42u3OMQEAAAgDoC252H0F" +
      "swZOJgAAAAAAAAAAAAAAgDcHZ0YAAdxQyMoAAAAASUVORK5CYII=",
    "base64",
  ),
);
const DUONG_DAN_THU = `${tiem.id}/chung-tu/kiem-${Date.now()}.png`;
let daDatAnh = false;

const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});
const ctx = await b.newContext({ viewport: { width: 900, height: 1000 }, locale: "vi-VN" });
const p = await ctx.newPage();

try {
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
    throw new Error("khong dang nhap duoc");
  }
  kiem("đăng nhập", true);

  // ── ① Ô chọn ảnh, và nó chỉ có ở phiếu CHI ──────────────────────
  await p.goto(`${NEN}/app/cashbook`, { waitUntil: "networkidle", timeout: 120000 });
  await p.waitForTimeout(1200);
  await p.getByRole("button", { name: /Ghi sổ/ }).first().click();
  await p.waitForTimeout(700);

  kiem("① phiếu CHI có ô ảnh chứng từ", (await p.getByText("Ảnh chứng từ").count()) > 0);

  await p.getByRole("button", { name: "Tiền vào" }).first().click();
  await p.waitForTimeout(500);
  kiem(
    "① đổi sang phiếu THU ⇒ ô ảnh biến mất (tiền vào đã có chứng từ sẵn)",
    (await p.getByText("Chụp hoặc chọn ảnh").count()) === 0,
  );
  await p.getByRole("button", { name: "Tiền ra" }).first().click();
  await p.waitForTimeout(500);

  // ── ② Gửi ảnh lên kho THẬT, qua RLS THẬT ────────────────────────
  await p.locator('input[type="file"]').first().setInputFiles(ANH_TAM);
  await p.waitForTimeout(4000);
  kiem(
    "② gửi ảnh lên xong ⇒ hiện ô ảnh đã chọn",
    (await p.locator('button[aria-label^="Bỏ ảnh"]').count()) === 1,
    "không thấy ô ảnh — nhiều khả năng RLS của kho chặn đường tải lên",
  );
  kiem(
    "② KHÔNG có lời báo gửi ảnh hỏng",
    !/Chưa gửi được ảnh/.test(await p.innerText("body")),
  );

  // Ảnh vừa gửi là ảnh MỒ CÔI (người dùng bỏ ngang, chưa lưu phiếu) — đúng cái
  // nợ đã khai trong thẻ. Dọn nó ở phần cuối.
  const { data: dsMoi } = await db.storage.from("tenant-files").list(`${tiem.id}/chung-tu`);
  const moCoi = (dsMoi ?? []).map((f) => `${tiem.id}/chung-tu/${f.name}`);

  // ── ③ Xem lại ảnh của một phiếu ĐÃ CÓ ───────────────────────────
  if (!muon) {
    console.log("  ⚠️ BỎ QUA 3 ca xem lại: tiệm demo chưa có phiếu chi nào trong tháng này.");
  } else {
    await db.storage
      .from("tenant-files")
      .upload(DUONG_DAN_THU, readFileSync(ANH_TAM), { contentType: "image/png", upsert: true });
    await c.query(`update public.cash_entries set chung_tu = $2::jsonb where id = $1`, [
      muon.id,
      JSON.stringify([{ duong_dan: DUONG_DAN_THU, ten: "hoa-don.png", co: 120 }]),
    ]);
    daDatAnh = true;

    await p.goto(`${NEN}/app/cashbook`, { waitUntil: "networkidle", timeout: 120000 });
    await p.waitForTimeout(1500);
    const ghim = p.getByRole("button", { name: /\d+ ảnh chứng từ/ }).first();
    kiem("③ dòng phiếu tự khai là có chứng từ", (await ghim.count()) > 0);

    if ((await ghim.count()) > 0) {
      await ghim.click();
      await p.waitForTimeout(3000);
      const anhHien = p.locator('img[alt="Ảnh"]');
      kiem("③ bấm vào ⇒ ảnh mở bằng đường dẫn ký hạn giờ", (await anhHien.count()) > 0);
      if ((await anhHien.count()) > 0) {
        const nap = await anhHien.first().evaluate((el) => el.complete && el.naturalWidth > 0);
        kiem("③ ảnh tải về được thật, không phải khung vỡ", nap, "thẻ ảnh có nhưng không nạp được");
      }
      kiem(
        "③ KHÔNG hiện ô 'không mở được ảnh'",
        !/Không mở được ảnh này/.test(await p.innerText("body")),
      );
    }
  }

  await b.close();
  if (moCoi.length) await db.storage.from("tenant-files").remove(moCoi);
} catch (e) {
  await b.close().catch(() => {});
  console.error("Lỗi khi chạy:", e.message);
  truot += 1;
}

// ── Trả lại nguyên trạng ──────────────────────────────────────────
unlinkSync(ANH_TAM);
if (daDatAnh && muon) {
  await c.query(`update public.cash_entries set chung_tu = $2::jsonb where id = $1`, [
    muon.id,
    JSON.stringify(muon.chung_tu ?? []),
  ]);
  await db.storage.from("tenant-files").remove([DUONG_DAN_THU]);
  const { rows: [sau] } = await c.query(
    `select chung_tu from public.cash_entries where id = $1`,
    [muon.id],
  );
  kiem(
    "trả phiếu đã mượn về ĐÚNG nguyên trạng",
    JSON.stringify(sau.chung_tu) === JSON.stringify(muon.chung_tu ?? []),
    `phiếu ${muon.id} còn dính dữ liệu của bộ kiểm`,
  );
}
const { rows: [con] } = await c.query(
  `select count(*)::int n from public.cash_entries
    where tenant_id = $1 and chung_tu::text like $2`,
  [tiem.id, "%kiem-%"],
);
await c.end();
kiem("không phiếu nào còn dính ảnh của bộ kiểm", con.n === 0, `còn ${con.n} phiếu`);

console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
