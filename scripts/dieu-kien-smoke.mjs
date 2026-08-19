#!/usr/bin/env node
/**
 * Cổng chống tái phát cho ĐIỀU KIỆN của quy trình tự động (migration #163).
 *
 * Vì sao cần bộ kiểm riêng: `wf_match_conditions` là chỗ quyết định một luật có
 * chạy hay không. Sai một nhánh ở đây thì hoặc luật im lặng không chạy (chủ tiệm
 * tưởng đã bật), hoặc chạy với MỌI sự kiện (luật gõ sai thành luật càn quét).
 * Cả hai đều không có gì báo.
 *
 * Kiểm hai điều, điều thứ hai quan trọng hơn:
 *   1. Các phép so MỚI (gt/gte/lt/lte/neq/in/contains) chạy đúng.
 *   2. TƯƠNG THÍCH NGƯỢC: mọi cách viết CŨ (bằng, exists) không đổi hành vi —
 *      playbook cài sẵn đang chạy thật không được phép lệch đi một ly.
 *
 * Hàm là IMMUTABLE và thuần, không đụng dữ liệu — chạy trực tiếp, không cần
 * transaction. Cần env SUPABASE_DB_URL.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL (env hoặc .env.local).");
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
// Đặt hạn chờ khoá dù bộ này CHỈ ĐỌC: một câu ALTER TABLE đang xếp hàng chờ
// khoá độc quyền sẽ khiến MỌI truy vấn sau nó — kể cả SELECT không đụng gì —
// bị Postgres bắt xếp hàng theo sau (luật công bằng FIFO). Đã tái hiện được
// bằng tay, xem chú thích cùng chủ đề trong scripts/rls-smoke.mjs.
await c.query("set lock_timeout = '10s'");

let n = 0;
let fail = 0;
async function ck(ten, cond, payload, mong) {
  n++;
  // Sự kiện thật có hình `{"payload": {...}}`; wf_field tra vào đó.
  const ev = { payload };
  const r = await c.query(
    `select public.wf_match_conditions($1::jsonb, $2::jsonb, '{}'::jsonb) k`,
    [JSON.stringify(cond), JSON.stringify(ev)],
  );
  const ok = r.rows[0].k === mong;
  if (!ok) fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${n} ${ten}${ok ? "" : ` — ra ${r.rows[0].k}, mong ${mong}`}`);
}

const P = { discount_pct: 20, total: 5000000, qty: 2, status: "open", source: "zalo", note: "Khách cần GẤP", ten: "abc" };

console.log("[dieu-kien-smoke] Tương thích ngược (cách viết CŨ phải y nguyên):");
await ck("bằng — khớp", { status: "open" }, P, true);
await ck("bằng — không khớp", { status: "closed" }, P, false);
await ck("bằng số — khớp", { qty: 2 }, P, true);
await ck("exists true — trường có", { status: { exists: true } }, P, true);
await ck("exists true — trường thiếu", { khong_co: { exists: true } }, P, false);
await ck("exists false — trường thiếu", { khong_co: { exists: false } }, P, true);
await ck("điều kiện rỗng ⇒ luôn khớp", {}, P, true);
await ck("nhiều điều kiện — phải khớp HẾT", { status: "open", qty: 2 }, P, true);
await ck("nhiều điều kiện — một cái sai là hỏng", { status: "open", qty: 9 }, P, false);

console.log("[dieu-kien-smoke] Phép so MỚI:");
await ck("gt — 20 > 15", { discount_pct: { gt: 15 } }, P, true);
await ck("gt — 20 > 25 sai", { discount_pct: { gt: 25 } }, P, false);
await ck("gt — biên: 20 > 20 sai", { discount_pct: { gt: 20 } }, P, false);
await ck("gte — biên: 20 >= 20 đúng", { discount_pct: { gte: 20 } }, P, true);
await ck("lt — 2 < 3", { qty: { lt: 3 } }, P, true);
await ck("lte — biên: 2 <= 2", { qty: { lte: 2 } }, P, true);
await ck("khoảng — 15 < x <= 25", { discount_pct: { gt: 15, lte: 25 } }, P, true);
await ck("khoảng — ngoài khoảng", { discount_pct: { gt: 15, lte: 18 } }, P, false);
await ck("tiền lớn — 5.000.000 >= 5.000.000", { total: { gte: 5000000 } }, P, true);
await ck("neq — khác giá trị", { status: { neq: "cancelled" } }, P, true);
await ck("neq — trùng giá trị", { status: { neq: "open" } }, P, false);
await ck("in — thuộc danh sách", { source: { in: ["zalo", "web"] } }, P, true);
await ck("in — ngoài danh sách", { source: { in: ["web", "facebook"] } }, P, false);
await ck("contains — không phân biệt hoa thường", { note: { contains: "gấp" } }, P, true);
await ck("contains — không có", { note: { contains: "huỷ" } }, P, false);

console.log("[dieu-kien-smoke] Nhánh nguy hiểm — sai thì phải KHÔNG KHỚP, không được cho qua:");
await ck("so sánh số trên trường CHỮ ⇒ không khớp", { ten: { gt: 1 } }, P, false);
await ck("so sánh số trên trường THIẾU ⇒ không khớp", { khong_co: { gt: 1 } }, P, false);
await ck("contains trên trường số ⇒ không khớp", { qty: { contains: "2" } }, P, false);
await ck("in mà không phải mảng ⇒ không khớp", { source: { in: "zalo" } }, P, false);
await ck("GÕ SAI tên phép so ⇒ không khớp (không được thành luật càn quét)", { qty: { greater: 1 } }, P, false);
await ck("object rỗng ⇒ không khớp", { qty: {} }, P, false);

await c.end();
console.log(
  fail === 0
    ? `[dieu-kien-smoke] ${n}/${n} PASS — phép so mới đúng, cách viết cũ không đổi hành vi.`
    : `[dieu-kien-smoke] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
);
process.exit(fail === 0 ? 0 : 1);
