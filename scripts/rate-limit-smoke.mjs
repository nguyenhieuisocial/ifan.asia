#!/usr/bin/env node
/**
 * Cổng chống tái phát cho chốt chặn spam.
 *
 * Món nợ đã từng xảy ra: lib/rate-limit.ts chỉ đếm bằng Upstash và FAIL-OPEN khi
 * chưa cấu hình env — mà env đó chưa bao giờ có, nên mọi chốt dựng trên nó thực
 * tế bằng không suốt nhiều tháng. Script này khóa cả HAI đầu để không lặp lại:
 *
 *   PHẦN A+B — trên DB THẬT: bộ đếm public.app_rate_limit (migration #25) có
 *     đúng hình dạng an toàn và THẬT SỰ chặn đúng ngưỡng. Chạy trong 1
 *     transaction ROLLBACK — không để lại dữ liệu.
 *   PHẦN C — trên MÃ NGUỒN: nhánh "đếm hỏng" của rateLimit() phải CHẶN, và chỉ
 *     file đã được liệt kê mới được dùng bản fail-open. Không cần DB.
 *
 * Cần env SUPABASE_DB_URL cho phần A+B (thiếu thì phần C vẫn chạy và vẫn FAIL
 * được — nhưng CI phải truyền vào, xem .github/workflows/ci.yml).
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

let failed = 0;
let nCheck = 0;
const check = (name, cond, detail = "") => {
  nCheck++;
  console.log(`${cond ? "  PASS" : "  FAIL"} ${nCheck} ${name}${cond ? "" : " — " + detail}`);
  if (!cond) failed++;
};

// ===========================================================================
// PHẦN C — mã nguồn: fail-open không được lén quay lại
// ===========================================================================
const SRC = new URL("../lib/rate-limit.ts", import.meta.url);
const src = readFileSync(SRC, "utf8");

/** Cắt thân hàm `export async function <tên>` bằng cách đếm ngoặc nhọn. */
function bodyOf(name) {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) return null;
  const open = src.indexOf("{", src.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return null;
}

console.log("[rate-limit-smoke] Mã nguồn — nhánh 'đếm hỏng' phải CHẶN:");

const hardened = bodyOf("rateLimit");
check("lib/rate-limit.ts vẫn xuất hàm rateLimit()", !!hardened, "không tìm thấy hàm");
if (hardened) {
  check(
    "rateLimit() chặn khi không đếm được (có 'allowed: false')",
    /allowed:\s*false/.test(hardened),
    "không thấy nhánh chặn",
  );
  check(
    "rateLimit() KHÔNG có đường cho-qua cứng ('allowed: true')",
    !/allowed:\s*true/.test(hardened),
    "fail-open đã quay lại trong rateLimit()",
  );
  check(
    "rateLimit() không tự bỏ qua khi thiếu env Upstash",
    !/UPSTASH|hasUpstash\s*\)\s*return/.test(hardened.replace(/if \(hasUpstash\) \{/, "")),
    "vẫn còn nhánh bỏ qua theo env",
  );
}

const bestEffort = bodyOf("rateLimitBestEffort");
check("Vẫn có bản best-effort tách riêng cho lớp phụ", !!bestEffort);

// Chỉ những file CHỨNG MINH ĐƯỢC đã có chốt thật ở nơi khác mới được fail-open.
// Thêm file vào đây = phải ghi rõ chốt thật nằm ở đâu (xem chú thích trong file đó).
const BEST_EFFORT_ALLOWED = new Set([
  // Chốt thật: RPC livechat_send/livechat_poll tự đếm trong DB (migration #23).
  "lib/channels/livechat.ts",
]);

const repo = fileURLToPath(new URL("..", import.meta.url));
// execFileSync + mảng tham số: không qua shell. git grep trả mã 1 khi 0 kết quả.
let grepOut = "";
try {
  grepOut = execFileSync(
    "git",
    ["grep", "-l", "rateLimitBestEffort", "--", "*.ts", "*.tsx"],
    { cwd: repo, encoding: "utf8" },
  );
} catch (e) {
  if (e.status !== 1) throw e; // 1 = không khớp file nào; khác thế là lỗi thật
}
const users = grepOut
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s && s !== "lib/rate-limit.ts" && s !== "scripts/rate-limit-smoke.mjs");

const rogue = users.filter((f) => !BEST_EFFORT_ALLOWED.has(f));
check(
  "Chỉ file đã được duyệt mới dùng bản fail-open",
  rogue.length === 0,
  `dùng chui: ${rogue.join(", ")}`,
);

// ===========================================================================
// PHẦN A+B — DB thật
// ===========================================================================
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("[rate-limit-smoke] Thiếu SUPABASE_DB_URL — bỏ qua phần DB là KHÔNG chấp nhận được");
  process.exit(1);
}

const caPath = new URL("../supabase/supabase-ca.crt", import.meta.url);
const c = new pg.Client({
  connectionString: url,
  ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true },
});
await c.connect();

const call = async (key, limit, win) => {
  const { rows: [r] } = await c.query(
    `select public.app_rate_limit($1, $2, $3) as r`, [key, limit, win]);
  return r.r;
};

try {
  await c.query("begin");
// Cổng kiểm chạy CHUNG kho dữ liệu với web đang phục vụ khách thật. Không đặt
// hạn chờ khoá thì một lượt kiểm treo sẽ chặn cả việc áp bản vá — ngày 19/08
// đã phải chờ-thử-lại tới 10 lượt vì đúng chuyện này.
await c.query("set local lock_timeout = '10s'");

  console.log("[rate-limit-smoke] Hình dạng an toàn của bộ đếm:");

  const { rows: [tbl] } = await c.query(`
    select c.relrowsecurity as rls,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'app_rate_limits'`);
  check("Bảng đếm app_rate_limits tồn tại", !!tbl);
  check("RLS bật trên bảng đếm", tbl?.rls === true);
  check(
    "Bảng đếm KHÔNG có policy nào (chỉ definer chạm được)",
    Number(tbl?.policies) === 0,
    `có ${tbl?.policies} policy`,
  );

  const { rows: [fn] } = await c.query(`
    select p.prosecdef as definer, p.proconfig::text as cfg,
           has_function_privilege('public', p.oid, 'execute') as pub,
           has_function_privilege('anon',   p.oid, 'execute') as anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'app_rate_limit'`);
  check("Hàm đếm là SECURITY DEFINER", fn?.definer === true);
  check("Hàm đếm ghim search_path", /search_path=public/.test(fn?.cfg ?? ""), fn?.cfg);
  check("PUBLIC không gọi được hàm đếm", fn?.pub === false);
  check("anon gọi được hàm đếm (đăng nhập chạy trước khi có phiên)", fn?.anon === true);

  const { rows: [pep] } = await c.query(
    `select length(value) as n from private.app_config where key = 'rate_limit_pepper'`);
  check("Có muối băm riêng của môi trường", Number(pep?.n) === 64, `độ dài ${pep?.n}`);

  console.log("[rate-limit-smoke] Bộ đếm có THẬT SỰ chặn không:");

  const KEY = `smoke:ip:203.0.113.${Date.now() % 200}`;
  const r1 = await call(KEY, 3, 60);
  const r2 = await call(KEY, 3, 60);
  const r3 = await call(KEY, 3, 60);
  const r4 = await call(KEY, 3, 60);
  check("Lượt 1 trong ngưỡng → cho qua", r1.allowed === true, JSON.stringify(r1));
  check("Lượt 2, 3 vẫn cho qua", r2.allowed === true && r3.allowed === true);
  check("Đếm lùi đúng (còn 2 → 1 → 0)",
    r1.remaining === 2 && r2.remaining === 1 && r3.remaining === 0,
    `${r1.remaining}/${r2.remaining}/${r3.remaining}`);
  check("Lượt 4 VƯỢT ngưỡng → CHẶN", r4.allowed === false, JSON.stringify(r4));

  const other = await call(`${KEY}-khac`, 3, 60);
  check("Khóa khác không bị lây (người dùng thật không bị vạ)", other.allowed === true);

  const { rows: buckets } = await c.query(`select bucket from public.app_rate_limits`);
  check(
    "Không lưu khóa gốc (IP/user id) — chỉ lưu bản băm",
    buckets.every((b) => !b.bucket.includes("203.0.113") && /^[0-9a-f]{64}$/.test(b.bucket)),
    "bucket lộ khóa gốc",
  );

  // Cửa sổ hết hạn: đẩy mốc lùi lại rồi gọi tiếp — phải đếm lại từ đầu.
  await c.query(`update public.app_rate_limits set window_start = now() - interval '10 minutes'`);
  const afterWindow = await call(KEY, 3, 60);
  check(
    "Hết cửa sổ thì mở lại (không khóa người dùng vĩnh viễn)",
    afterWindow.allowed === true && afterWindow.remaining === 2,
    JSON.stringify(afterWindow),
  );

  console.log("[rate-limit-smoke] Đầu vào rác không mở toang được cửa:");

  const nullKey = await call(null, 100, 60);
  check("Khóa rỗng → CHẶN, không phải cho qua", nullKey.allowed === false, JSON.stringify(nullKey));

  const ZERO = `smoke-zero:${Date.now()}`;
  await call(ZERO, 0, 60);
  const zero2 = await call(ZERO, 0, 60);
  check("Ngưỡng 0/âm bị kẹp về 1, không thành 'vô hạn'", zero2.allowed === false, JSON.stringify(zero2));

  const HUGE = `smoke-huge:${Date.now()}`;
  const huge = await call(HUGE, 999999999, 999999);
  check("Ngưỡng/cửa sổ khổng lồ bị kẹp biên", Number(huge.remaining) <= 100000, JSON.stringify(huge));

  // anon (vai trò của người CHƯA đăng nhập) phải gọi được — nếu không thì chốt
  // đăng nhập sẽ ném lỗi và fail-closed sẽ khóa cửa toàn bộ người dùng thật.
  const ANON = `smoke-anon:${Date.now()}`;
  await c.query("savepoint sp_anon");
  let anonErr = null;
  let anonRes = null;
  try {
    await c.query("set local role anon");
    const { rows: [r] } = await c.query(
      `select public.app_rate_limit($1, 5, 60) as r`, [ANON]);
    anonRes = r.r;
  } catch (e) {
    anonErr = e;
  }
  await c.query("rollback to savepoint sp_anon");
  await c.query("reset role");
  check(
    "Người CHƯA đăng nhập vẫn đếm được (không tự khóa cửa đăng nhập)",
    !anonErr && anonRes?.allowed === true,
    anonErr?.message ?? JSON.stringify(anonRes),
  );
} catch (e) {
  console.error("[rate-limit-smoke] LỖI:", e.message);
  failed++;
} finally {
  try { await c.query("rollback"); } catch {}
  await c.end();
}

if (failed) {
  console.error(`[rate-limit-smoke] ${failed}/${nCheck} kiểm tra FAIL`);
  process.exit(1);
}
console.log(`[rate-limit-smoke] ${nCheck}/${nCheck} PASS — chốt chặn có thật, không để lại dữ liệu.`);
