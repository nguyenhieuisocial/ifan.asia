#!/usr/bin/env node
/**
 * Đo thời gian CSDL của từng màn, chạy dưới ĐÚNG danh nghĩa người dùng thật
 * (role `authenticated` + JWT claims giả lập) nên RLS bật đầy đủ.
 *
 * Chỉ đo THỜI GIAN TRONG CSDL (không tính mạng): mỗi phép đo chạy 1 lần khởi
 * động + N lần lấy trung vị. Tuỳ chọn EXPLAIN=1 để in kế hoạch thực thi.
 *
 * Cần env: SUPABASE_DB_URL. Tuỳ chọn: PERF_TENANT_SLUG, RUNS, EXPLAIN.
 */
import pg from "pg";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const envPath = new URL("../.env.local", import.meta.url);
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.error("Thiếu SUPABASE_DB_URL"); process.exit(1); }

const SLUG = process.env.PERF_TENANT_SLUG || "zz-perf-load-test";
const RUNS = Number(process.env.RUNS || 5);
const DO_EXPLAIN = process.env.EXPLAIN === "1";

const caPath = new URL("../supabase/supabase-ca.crt", import.meta.url);
const c = new pg.Client({
  connectionString: DB_URL,
  ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true },
  statement_timeout: 300000,
});
await c.connect();

const { rows: [t] } = await c.query(`select id from public.tenants where slug = $1`, [SLUG]);
if (!t) { console.error(`Không thấy tenant ${SLUG} — chạy perf-seed.mjs trước.`); process.exit(1); }
const TID = t.id;
const { rows: [m] } = await c.query(
  `select user_id from public.tenant_members where tenant_id = $1 and role = 'owner' limit 1`, [TID]);
const UID = m.user_id;

async function beginAsUser() {
  await c.query("begin");
  await c.query(
    `select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
    [JSON.stringify({ sub: UID, role: "authenticated", app_metadata: { tenant_id: TID, role: "owner" } })]);
}
const endAsUser = () => c.query("rollback");

const results = [];
const explains = [];

/**
 * Đo 1 câu hai lớp:
 *  - `srv`  = thời gian CHẠY TRONG MÁY CHỦ (explain analyze) — đây là con số web
 *             trên Vercel bom1 thực sự chịu, vì web cùng vùng Mumbai với CSDL.
 *  - `wall` = thời gian từ máy đo (VN) — gồm cả một vòng mạng VN↔Mumbai, dùng để
 *             thấy chi phí độ trễ vùng.
 */
async function bench(screen, label, sql, params = []) {
  await beginAsUser();
  try {
    await c.query(sql, params); // warm-up
    const ts = [];
    for (let i = 0; i < RUNS; i++) {
      const s = process.hrtime.bigint();
      await c.query(sql, params);
      ts.push(Number(process.hrtime.bigint() - s) / 1e6);
    }
    ts.sort((a, b) => a - b);
    const wall = ts[Math.floor(ts.length / 2)];

    const srvs = [];
    let plan = null;
    for (let i = 0; i < Math.min(RUNS, 3); i++) {
      const e = await c.query(`explain (analyze, buffers, format json) ${sql}`, params);
      const p = e.rows[0]["QUERY PLAN"][0];
      srvs.push(p["Execution Time"] + p["Planning Time"]);
      if (i === 0) plan = p;
    }
    srvs.sort((a, b) => a - b);
    const srv = srvs[Math.floor(srvs.length / 2)];

    const planTxt = JSON.stringify(plan);
    const seq = (planTxt.match(/"Node Type":"Seq Scan"/g) || []).length;
    const seqRel = [...planTxt.matchAll(/"Node Type":"Seq Scan","Parallel Aware":\w+,(?:"Async Capable":\w+,)?"Relation Name":"(\w+)"/g)].map((x) => x[1]);
    results.push({ screen, label, srv, wall, seq, seqRel: [...new Set(seqRel)] });
    console.log(`  ${screen} · ${label}: máy chủ ${srv.toFixed(1)}ms | từ VN ${wall.toFixed(1)}ms${seq ? ` | SEQ SCAN x${seq} (${[...new Set(seqRel)].join(",")})` : ""}`);
    if (DO_EXPLAIN) {
      const e = await c.query(`explain (analyze, buffers, format text) ${sql}`, params);
      explains.push(`\n===== ${screen} · ${label} =====\n` + e.rows.map((r) => r["QUERY PLAN"]).join("\n"));
    }
  } catch (err) {
    results.push({ screen, label, srv: NaN, wall: NaN, err: err.message });
    console.log(`  ${screen} · ${label}: LỖI ${err.message}`);
  } finally { await endAsUser(); }
}

const FROM_30D = `(date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') - interval '29 days') at time zone 'Asia/Ho_Chi_Minh'`;
const TO_NOW = `(date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 day') at time zone 'Asia/Ho_Chi_Minh'`;

console.log(`\n== ĐO CSDL — tenant ${SLUG} · ${RUNS} lần/câu ==`);

// ---- Tổng quan ----
await bench("Tổng quan", "dashboard_overview()", `select public.dashboard_overview()`);
await bench("Tổng quan", "dashboard_sales(30d)",
  `select public.dashboard_sales(${FROM_30D}, ${TO_NOW},
     ${FROM_30D} - interval '30 days', ${FROM_30D})`);
await bench("Tổng quan", "source_revenue_report(30d)", `select * from public.source_revenue_report(${FROM_30D}, ${TO_NOW})`);

// ---- Hôm nay ----
await bench("Hôm nay", "today_queue(all)", `select public.today_queue(false)`);
await bench("Hôm nay", "today_queue(mine)", `select public.today_queue(true)`);

// ---- Hộp thư ----
const CONV_SELECT = `
  select cv.id, cv.contact_id, cv.external_user_id, cv.status, cv.assignee_user_id,
         cv.last_message_at, cv.last_user_message_at, cv.is_unanswered, cv.unread_count
  from public.conversations cv`;
await bench("Hộp thư", "danh sách (tất cả, 25)",
  `${CONV_SELECT} order by cv.last_message_at desc nulls last limit 25`);
await bench("Hộp thư", "danh sách (đang mở, 25)",
  `${CONV_SELECT} where cv.status <> 'closed' order by cv.last_message_at desc nulls last limit 25`);
await bench("Hộp thư", "danh sách (chưa trả lời, 25)",
  `${CONV_SELECT} where cv.status <> 'closed' and cv.is_unanswered order by cv.last_message_at desc nulls last limit 25`);
await bench("Hộp thư", "danh sách (chưa gán, 25)",
  `${CONV_SELECT} where cv.status <> 'closed' and cv.assignee_user_id is null order by cv.last_message_at desc nulls last limit 25`);
await bench("Hộp thư", "inbox_counts()", `select public.inbox_counts()`);
await bench("Hộp thư", "200 tin của 1 hội thoại",
  `select id, conversation_id, direction, sender_type, sender_user_id, content, sent_at
   from public.messages
   where conversation_id = (select id from public.conversations where tenant_id = $1 order by last_message_at desc limit 1)
   order by sent_at desc limit 200`, [TID]);

// ---- Khách hàng ----
await bench("Khách hàng", "danh sách trang 1 (30)",
  `select c.id, c.full_name, c.phone, c.email, c.tier, c.lead_score, c.total_revenue, c.created_at
   from public.contacts c where c.deleted_at is null
   order by c.created_at desc limit 30`);
await bench("Khách hàng", "tìm theo tên (trgm)",
  `select c.id, c.full_name from public.contacts c
   where c.deleted_at is null and c.search_text like '%nguyen thi%'
   order by c.created_at desc limit 30`);
await bench("Khách hàng", "đếm tổng (exact count)",
  `select count(*) from public.contacts c where c.deleted_at is null`);
await bench("Khách hàng", "hồ sơ + dòng thời gian",
  `select (select count(*) from public.activities a where a.contact_id = x.id) acts,
          (select count(*) from public.deals d where d.contact_id = x.id and d.deleted_at is null) deals,
          (select count(*) from public.conversations v where v.contact_id = x.id) convs
   from (select id from public.contacts where tenant_id = $1 order by created_at desc limit 1) x`, [TID]);

// ---- Cơ hội ----
await bench("Cơ hội", "deal_board_stats()",
  `select * from public.deal_board_stats((select id from public.pipelines limit 1))`);
await bench("Cơ hội", "bảng kéo-thả (mỗi cột 50)",
  `select d.id, d.title, d.value_vnd, d.stage_id, d.status, d.next_action_at, d.contact_id
   from public.deals d where d.deleted_at is null and d.status = 'open'
   order by d.stage_entered_at desc limit 300`);

// ---- Báo cáo nguồn (12 tháng — mặc định báo cáo) ----
await bench("Báo cáo nguồn", "source_revenue_report(365d)",
  `select * from public.source_revenue_report(now() - interval '365 days', now())`);

// ---- Trùng lặp ----
await bench("Trùng lặp", "contact_duplicate_count()", `select public.contact_duplicate_count()`);
await bench("Trùng lặp", "contact_duplicate_pairs(20)", `select * from public.contact_duplicate_pairs(20, 0)`);
await bench("Trùng lặp", "contact_duplicate_base() thô", `select count(*) from public.contact_duplicate_base()`);

// ---- Thông báo ----
await bench("Thông báo", "trang 1 (30)",
  `select id, type, title, body, link, read_at, created_at, title_key, body_key, params
   from public.notifications order by created_at desc limit 30`);
await bench("Thông báo", "đếm chưa đọc",
  `select count(*) from public.notifications where read_at is null`);
await bench("Thông báo", "chuông (5 dòng)",
  `select id, type, title, created_at from public.notifications order by created_at desc limit 5`);

// ---- Thao tác ghi (mốc <100ms optimistic) ----
console.log("\n-- thao tác ghi --");
await bench("Cơ hội", "kéo deal sang cột khác (update)",
  `update public.deals set stage_id = stage_id, stage_entered_at = now()
   where id = (select id from public.deals where tenant_id = $1 and status='open' limit 1)`, [TID]);
await bench("Hộp thư", "gửi 1 tin nhắn (insert)",
  `insert into public.messages (tenant_id, conversation_id, direction, sender_type, sender_user_id, content, sent_at)
   select $1, id, 'out', 'agent', $2, 'bench', now()
   from public.conversations where tenant_id = $1 limit 1`, [TID, UID]);

// ---- tổng kết ----
console.log("\n== BẢNG TỔNG HỢP (trung vị) ==");
const w = Math.max(...results.map((r) => (r.screen + " · " + r.label).length));
console.log(`${"CÂU".padEnd(w)}  MÁY CHỦ    TỪ VN   QUÉT TOÀN BẢNG`);
for (const r of results) {
  console.log(
    `${(r.screen + " · " + r.label).padEnd(w)}  ${Number.isNaN(r.srv) ? "LỖI".padStart(7) : (r.srv.toFixed(1) + "ms").padStart(7)}` +
    `  ${Number.isNaN(r.wall) ? "".padStart(7) : (r.wall.toFixed(0) + "ms").padStart(7)}   ${r.seqRel?.length ? r.seqRel.join(",") : ""}`);
}
// Kết quả ghi ra thư mục tạm của hệ điều hành — không để rác trong repo.
const outDir = join(tmpdir(), "ifan-perf");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "bench.json"), JSON.stringify(results, null, 2));
console.log(`\nSố liệu: ${join(outDir, "bench.json")}`);
if (DO_EXPLAIN) {
  writeFileSync(join(outDir, "explain.txt"), explains.join("\n"));
  console.log(`Kế hoạch thực thi: ${join(outDir, "explain.txt")}`);
}
await c.end();
