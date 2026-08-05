#!/usr/bin/env node
/**
 * Xoá SẠCH tenant thử tải `zz-perf-load-test` (do perf-seed.mjs sinh ra) và
 * kiểm lại còn 0 dòng ở mọi bảng có cột tenant_id. Không đụng tenant khác.
 *
 * Cần env: SUPABASE_DB_URL (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY để xoá auth user)
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = new URL("../.env.local", import.meta.url);
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.error("Thiếu SUPABASE_DB_URL"); process.exit(1); }

const PERF_SLUG = "zz-perf-load-test";
const PERF_EMAIL = "perf.load.20260805@gmail.com";

const caPath = new URL("../supabase/supabase-ca.crt", import.meta.url);
const c = new pg.Client({
  connectionString: DB_URL,
  ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true },
  statement_timeout: 600000,
});
await c.connect();

const { rows: [t] } = await c.query(`select id from public.tenants where slug = $1`, [PERF_SLUG]);
if (!t) {
  console.log("Không thấy tenant thử — có thể đã dọn rồi.");
} else {
  const TID = t.id;
  // Mọi bảng có cột tenant_id → xoá theo thứ tự phụ thuộc bằng cách lặp tới khi sạch.
  const { rows: tabs } = await c.query(`
    select c.relname as t
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
    where ns.nspname = 'public' and c.relkind = 'r'
    order by 1`);
  await c.query("begin");
  await c.query(`set local session_replication_role = 'replica'`); // bỏ qua trigger guard khi xoá
  let remaining = tabs.map((r) => r.t);
  for (let pass = 0; pass < 8 && remaining.length; pass++) {
    const next = [];
    for (const tb of remaining) {
      try {
        await c.query(`savepoint sp`);
        await c.query(`delete from public.${tb} where tenant_id = $1`, [TID]);
        await c.query(`release savepoint sp`);
      } catch {
        await c.query(`rollback to savepoint sp`);
        next.push(tb);
      }
    }
    if (next.length === remaining.length) { remaining = next; break; }
    remaining = next;
  }
  if (remaining.length) { await c.query("rollback"); throw new Error("Không xoá được: " + remaining.join(", ")); }
  await c.query(`delete from public.tenants where id = $1`, [TID]);
  await c.query("commit");
  console.log("Đã xoá tenant thử.");

  // kiểm lại: phải còn 0 ở MỌI bảng
  let leftovers = [];
  for (const { t: tb } of tabs) {
    const { rows: [r] } = await c.query(`select count(*)::int n from public.${tb} where tenant_id = $1`, [TID]);
    if (r.n > 0) leftovers.push(`${tb}=${r.n}`);
  }
  const { rows: [tn] } = await c.query(`select count(*)::int n from public.tenants where slug = $1`, [PERF_SLUG]);
  console.log(`KIỂM LẠI: bảng còn sót = ${leftovers.length ? leftovers.join(", ") : "0 (SẠCH)"} · tenants còn = ${tn.n}`);
}

// auth user
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (SB_URL && SERVICE) {
  const { rows } = await c.query(`select id from auth.users where email = $1`, [PERF_EMAIL]);
  if (rows[0]) {
    const admin = createClient(SB_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await admin.auth.admin.deleteUser(rows[0].id);
    console.log(error ? "Xoá auth user lỗi: " + error.message : "Đã xoá auth user thử.");
  } else console.log("Auth user thử: không còn.");
}
const { rows: [fin] } = await c.query(`select count(*)::int n from auth.users where email = $1`, [PERF_EMAIL]);
console.log(`KIỂM LẠI auth.users thử còn = ${fin.n}`);
await c.end();
