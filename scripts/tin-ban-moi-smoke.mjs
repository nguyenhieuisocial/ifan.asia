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

/** Gọi tg_release_mark với một thân commit giả, trả về tin release đã sinh. */
async function thu(nhan, than) {
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
  const { rows: tin } = await c.query(
    `select body from public.platform_outbox
      where kind = 'release' and dedupe_key = $1`,
    [`rel:${sha}`],
  );
  await c.query("rollback to savepoint sp");
  return { nhan, kq: kq.kq, body: tin[0]?.body ?? null, coTin: tin.length > 0 };
}

try {
  await c.query("begin");

  // Phải có sẵn release_sha, nếu không hàm coi đây là lần đầu và cố ý không
  // phát tin (nhánh `v_old_sha is not null`).
  const { rows: [cu] } = await c.query(
    `select value from private.app_config where key = 'release_sha'`,
  );
  check("CSDL đã có release_sha (điều kiện để hàm phát tin)", Boolean(cu?.value), "chưa có");

  console.log("[tin-ban-moi] Ca 1 — bản có câu gửi founder tử tế:");
  const t1 = await thu(
    "tử tế",
    "feat(orders): them man Don hang\n\nFounder: Giờ xem được đơn hàng của khách và biết ai còn nợ tiền.\n\nchi tiet thi cong...",
  );
  check("có phát tin", t1.coTin, JSON.stringify(t1.kq));
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
  );
  check("KHÔNG phát tin vào chủ đề Thông báo", !t3.coTin, t3.body?.slice(0, 120));
  check("cờ internal_only = true", t3.kq?.internal_only === true, JSON.stringify(t3.kq));
  check("cờ release = false", t3.kq?.release === false, JSON.stringify(t3.kq));

  console.log("[tin-ban-moi] Ca 4 — KHÔNG được né tin bằng cách viết câu sai khuôn:");
  const t4 = await thu(
    "né tin",
    'feat(x): doi gi do\n\nFounder: "tiep tuc lam di"\n\nNội bộ: không cần báo.\n',
  );
  check(
    "vẫn phát tin dù thân có cả dòng Nội bộ",
    t4.coTin,
    "câu Founder sai khuôn KHÔNG được biến bản thành nội bộ",
  );
  check("cờ internal_only = false", t4.kq?.internal_only === false, JSON.stringify(t4.kq));

  console.log("[tin-ban-moi] Ca 5 — bản không có dòng nào (ca thật db9d6c5):");
  const t5 = await thu("trống", "feat(v3): man Don hang\n\n- lib/catalog/orders.ts: kieu\n");
  check("vẫn phát tin", t5.coTin);
  check("dùng lưới đỡ tiêu đề", t5.body?.includes("Thêm mới") === true, t5.body?.slice(0, 120));
  check("không kèm cảnh báo sai khuôn (vì không có câu nào để bỏ)", t5.body?.includes("sai khuôn") !== true);
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
