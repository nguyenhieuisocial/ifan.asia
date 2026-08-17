#!/usr/bin/env node
/**
 * Bộ kiểm BẢN TIN LÊN BẢN — gọi `tg_release_mark` THẬT rồi ROLLBACK sạch.
 *
 * Vì sao gọi thật thay vì kiểm từng biểu thức: cả ba lỗ founder phản ánh trong
 * ngày 17/08 đều nằm ở chỗ *hàm quyết định phát tin gì*, không ở biểu thức lẻ:
 *   lần 1+2 (13/08) — băng-rôn chỉ có mã bản, rồi câu commit thô khó đọc
 *   lần 3 (17/08)   — phát lại nguyên văn lời chỉ đạo, không dấu (migration #129)
 *   lần 4 (17/08)   — phát cả việc dọn dẹp nội bộ vào chủ đề Thông báo (#133)
 *
 * Bốn lần cùng một hàm ⇒ nó cần bộ kiểm riêng, không chỉ kiểm bằng mắt.
 *
 * An toàn: toàn bộ chạy trong MỘT transaction và ROLLBACK ở cuối, kể cả khi
 * lỗi. `platform_notify` chỉ INSERT vào `platform_outbox` (pg_net bị khoá từ
 * #36 nên CSDL không tự gọi HTTP) ⇒ rollback là sạch tuyệt đối, không tin nào
 * bay vào nhóm Telegram thật.
 *
 * Cần env `SUPABASE_DB_URL`.
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

const GOC = path.resolve(import.meta.dirname, "..");

if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* CI có env sẵn */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
});
await c.connect();

let hong = 0;
let n = 0;
const check = (ten, dat, chiTiet = "") => {
  n += 1;
  if (!dat) hong += 1;
  console.log(`  ${dat ? "PASS" : "FAIL"} ${n}: ${ten}${dat ? "" : ` — ${chiTiet}`}`);
};

/**
 * Gọi tg_release_mark với một thân commit giả, trả về tin release đã sinh.
 *
 * Từ migration #137, tin `release` KHÔNG còn phát ngay: bản mới vào hàng chờ
 * `private.release_pending`, và `release_digest()` gộp mỗi giờ. Nên hàm này trả
 * về CẢ hai: tin đã phát (nếu bản ưu tiên flush) và số dòng còn trong hàng chờ.
 * `khoaTin` cho phép tìm tin gộp theo mã bản cuối.
 */
async function thu(nhan, than, { goiDigest = false } = {}) {
  await c.query("savepoint sp");
  const sha = `smoke${Date.now().toString(36)}${Math.floor(n * 7 + 13)}`;
  const { rows: [key] } = await c.query(
    `select value from private.app_config where key = 'bot_ingest_key'`,
  );
  const { rows: [features] } = await c.query(
    `select value from private.app_config where key = 'feature_map'`,
  );
  const { rows: [kq] } = await c.query(
    `select public.tg_release_mark($1, $2, $3::jsonb, $4) as kq`,
    [key.value, sha, features?.value ?? "{}", than],
  );
  if (goiDigest) await c.query(`select public.release_digest()`);
  const { rows: tin } = await c.query(
    `select body from public.platform_outbox
      where kind = 'release' and dedupe_key in ($1, $2)`,
    [`rel:${sha}`, `reldigest:${sha.slice(0, 7)}`],
  );
  const { rows: [cho] } = await c.query(
    `select count(*)::int as n from private.release_pending`,
  );
  await c.query("rollback to savepoint sp");
  return {
    nhan, kq: kq.kq, body: tin[0]?.body ?? null, coTin: tin.length > 0,
    trongHangCho: cho.n,
  };
}

try {
  await c.query("begin");

  // Phải có sẵn release_sha, nếu không hàm coi đây là lần đầu và cố ý không
  // phát tin (nhánh `v_old_sha is not null`).
  const { rows: [cu] } = await c.query(
    `select value from private.app_config where key = 'release_sha'`,
  );
  check("CSDL đã có release_sha (điều kiện để hàm phát tin)", Boolean(cu?.value), "chưa có");

  console.log("[tin-ban-moi] Ca 1 — bản có câu gửi founder tử tế (GỘP, không phát ngay):");
  const t1 = await thu(
    "tử tế",
    "feat(orders): them man Don hang\n\nFounder: Giờ xem được đơn hàng của khách và biết ai còn nợ tiền.\n\nchi tiet thi cong...",
    { goiDigest: true },
  );
  check("vào hàng chờ (queued)", t1.kq?.queued === true, JSON.stringify(t1.kq));
  check("KHÔNG tự phát ngay khi chưa gộp", t1.kq?.flushed_now === false, JSON.stringify(t1.kq));
  check("sau khi gộp thì có tin", t1.coTin, JSON.stringify(t1.kq));
  check(
    "tin dùng ĐÚNG câu người viết, không phải tiêu đề",
    t1.body?.includes("Giờ xem được đơn hàng của khách") === true,
    t1.body?.slice(0, 120),
  );
  check("không kèm cảnh báo sai khuôn", t1.body?.includes("sai khuôn") !== true);
  check("cờ internal_only = false", t1.kq?.internal_only === false, JSON.stringify(t1.kq));

  console.log("[tin-ban-moi] Ca 2 — câu gửi founder SAI KHUÔN (ca thật 17/08):");
  const t2 = await thu(
    "sai khuôn",
    'feat(v3): man Hang hoa\n\nFounder: "Tiep tuc ngay, khong duoc dung cho nhu vay nua"\n',
    { goiDigest: true },
  );
  check("vẫn phát tin (thay đổi thật thì không được nuốt)", t2.coTin);
  check(
    "KHÔNG dùng câu sai khuôn",
    t2.body?.includes("Tiep tuc ngay") !== true,
    t2.body?.slice(0, 120),
  );
  check("rơi về lưới đỡ tiêu đề", t2.body?.includes("Thêm mới") === true, t2.body?.slice(0, 120));
  check("NÓI RA là đã bỏ câu sai khuôn", t2.body?.includes("sai khuôn") === true);
  check("cờ founder_line_rejected = true", t2.kq?.founder_line_rejected === true);

  console.log("[tin-ban-moi] Ca 3 — bản NỘI BỘ (founder phản ánh 17/08):");
  const t3 = await thu(
    "nội bộ",
    "chore(gitnexus): cap nhat ban do code\n\nNội bộ: chỉ cập nhật bản đồ code trong máy.\n",
    { goiDigest: true },
  );
  check("KHÔNG phát tin dù đã gọi gộp", !t3.coTin, t3.body?.slice(0, 120));
  check("KHÔNG vào hàng chờ", t3.kq?.queued === false, JSON.stringify(t3.kq));
  check("cờ internal_only = true", t3.kq?.internal_only === true, JSON.stringify(t3.kq));
  check("cờ release = false", t3.kq?.release === false, JSON.stringify(t3.kq));

  console.log("[tin-ban-moi] Ca 4 — KHÔNG được né tin bằng cách viết câu sai khuôn:");
  const t4 = await thu(
    "né tin",
    'feat(x): doi gi do\n\nFounder: "tiep tuc lam di"\n\nNội bộ: không cần báo.\n',
    { goiDigest: true },
  );
  check(
    "vẫn vào hàng chờ + ra tin dù thân có cả dòng Nội bộ",
    t4.coTin,
    "câu Founder sai khuôn KHÔNG được biến bản thành nội bộ",
  );
  check("cờ internal_only = false", t4.kq?.internal_only === false, JSON.stringify(t4.kq));

  console.log("[tin-ban-moi] Ca 5 — bản không có dòng nào (ca thật db9d6c5):");
  const t5 = await thu("trống", "feat(v3): man Don hang\n\n- lib/catalog/orders.ts: kieu\n", { goiDigest: true });
  check("vẫn phát tin", t5.coTin);
  check("dùng lưới đỡ tiêu đề", t5.body?.includes("Thêm mới") === true, t5.body?.slice(0, 120));
  check("không kèm cảnh báo sai khuôn (vì không có câu nào để bỏ)", t5.body?.includes("sai khuôn") !== true);

  // ───── ADR-0020: cơ chế GỘP (migration #137) ─────
  console.log("[tin-ban-moi] Ca 6 — bản BẢO MẬT phải ra NGAY, không chờ gộp:");
  const t6 = await thu(
    "bảo mật",
    "security(auth): va lo phien dang nhap\n\nFounder: Đã vá một lỗ có thể để người khác vào được tài khoản của bạn.\n",
  );
  check("tự flush ngay, không cần chờ nhịp giờ", t6.kq?.flushed_now === true, JSON.stringify(t6.kq));
  check("có tin ngay", t6.coTin, t6.body?.slice(0, 100));
  check("hàng chờ đã dọn sạch sau flush", t6.trongHangCho === 0, `còn ${t6.trongHangCho}`);

  console.log("[tin-ban-moi] Ca 7 — bản có mảng đổi trạng thái cũng ra NGAY:");
  await c.query("savepoint sp7");
  const shaA = "smokeA0001";
  const { rows: [k7] } = await c.query(
    `select value from private.app_config where key = 'bot_ingest_key'`,
  );
  // Đổi feature_map để sinh feature_change → bản này thuộc diện ưu tiên.
  const { rows: [f7] } = await c.query(
    `select value from private.app_config where key = 'feature_map'`,
  );
  const mapMoi = JSON.parse(f7.value);
  const khoaDau = Object.keys(mapMoi)[0];
  mapMoi[khoaDau] = { ...mapMoi[khoaDau], trang: "Đang xây ngay lúc này" };
  const { rows: [kq7] } = await c.query(
    `select public.tg_release_mark($1, $2, $3::jsonb, $4) as kq`,
    [k7.value, shaA, JSON.stringify(mapMoi),
     "feat(x): doi trang thai mang\n\nFounder: Một mảng vừa chuyển sang đang xây.\n"],
  );
  check("có mảng đổi ⇒ flush ngay", kq7.kq?.flushed_now === true, JSON.stringify(kq7.kq));
  check("đồng thời phát tin chủ đề Tính năng", kq7.kq?.features_changed === true, JSON.stringify(kq7.kq));
  await c.query("rollback to savepoint sp7");

  console.log("[tin-ban-moi] Ca 8 — GỘP nhiều bản thành MỘT tin:");
  await c.query("savepoint sp8");
  const { rows: [k8] } = await c.query(
    `select value from private.app_config where key = 'bot_ingest_key'`,
  );
  const { rows: [f8] } = await c.query(
    `select value from private.app_config where key = 'feature_map'`,
  );
  const cauMau = [
    "Giờ xem được đơn hàng của khách.",
    "Sổ quỹ hiện đủ ba con số thu, chi, còn lại.",
    "Bản tin thôi gửi trùng.",
  ];
  for (let i = 0; i < cauMau.length; i += 1) {
    await c.query(`select public.tg_release_mark($1, $2, $3::jsonb, $4)`, [
      k8.value, `smokeG${i}00`, f8?.value ?? "{}",
      `feat(x): viec ${i}\n\nFounder: ${cauMau[i]}\n`,
    ]);
  }
  const { rows: [choTruoc] } = await c.query(`select count(*)::int as n from private.release_pending`);
  check("3 bản đều nằm trong hàng chờ, chưa tin nào", choTruoc.n === 3, `hàng chờ có ${choTruoc.n}`);
  const { rows: [dg] } = await c.query(`select public.release_digest() as ok`);
  const { rows: tinGop } = await c.query(
    `select body from public.platform_outbox where kind='release' and dedupe_key like 'reldigest:%'
      order by id desc limit 1`,
  );
  const bodyGop = tinGop[0]?.body ?? "";
  check("gộp trả về true", dg.ok === true);
  check("ra ĐÚNG MỘT tin cho 3 bản", bodyGop.includes("3 bản mới"), bodyGop.slice(0, 90));
  check("tin chứa cả 3 câu", cauMau.every((x) => bodyGop.includes(x)), bodyGop.slice(0, 200));
  check("có khoảng giờ (dấu hiệu tin gộp)", /\d\d:\d\d–\d\d:\d\d/.test(bodyGop), bodyGop.slice(0, 90));
  const { rows: [choSau] } = await c.query(`select count(*)::int as n from private.release_pending`);
  check("hàng chờ sạch sau khi gộp", choSau.n === 0, `còn ${choSau.n}`);
  const { rows: [dg2] } = await c.query(`select public.release_digest() as ok`);
  check("gọi gộp lần hai khi hàng chờ rỗng ⇒ false, không phát tin trống", dg2.ok === false);
  await c.query("rollback to savepoint sp8");

  // ───── ADR-0020 mục 3.3: nhịp ngày (migration #138) ─────
  console.log("[tin-ban-moi] Ca 9 — nhịp ngày: nói RA khi chưa có khách:");
  await c.query("savepoint sp9");
  const { rows: [dp] } = await c.query(`select public.daily_pulse() as ok`);
  const { rows: tinNgay } = await c.query(
    `select body from public.platform_outbox where kind='daily_pulse' order by id desc limit 1`,
  );
  const bodyNgay = tinNgay[0]?.body ?? "";
  check("hôm nay có bản ra ⇒ nhịp ngày PHẢI phát (trước #138 thì im)", dp.ok === true, JSON.stringify(dp));
  check("có phần Sản phẩm", bodyNgay.includes("Sản phẩm"), bodyNgay.slice(0, 150));
  check(
    "phần Khách NÓI RA khi bằng 0 (không để trống)",
    bodyNgay.includes("Khách") && /chưa có tiệm mới|tiệm mới đăng ký|khách hàng mới/.test(bodyNgay),
    bodyNgay.slice(0, 250),
  );
  await c.query("rollback to savepoint sp9");
} finally {
  // Rollback TOÀN BỘ — không để lại một dòng nào trên CSDL thật.
  await c.query("rollback");
  await c.end();
}

console.log(
  hong === 0
    ? `[tin-ban-moi] TẤT CẢ PASS (${n} ca). Đã rollback sạch.`
    : `[tin-ban-moi] ${hong}/${n} ca FAIL.`,
);
process.exit(hong === 0 ? 0 : 1);
