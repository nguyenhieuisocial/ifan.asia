/**
 * DỰNG KHO DỮ LIỆU RIÊNG CHO CỔNG KIỂM — áp toàn bộ migration lên một dự án
 * Supabase TRỐNG, theo đúng thứ tự, rồi báo cáo.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Cổng kiểm tự động và TRANG WEB THẬT đang dùng CHUNG một cơ sở dữ liệu
 * (việc #175). Hậu quả đo được trong ngày 22/08:
 *   · ba lượt kiểm chết vì tranh khoá với nhau;
 *   · một lượt áp bản vá bị kẹt chéo (deadlock) rồi phải chờ;
 *   · bộ kiểm bảo mật giữ khoá ghi trên 147 bảng suốt 5–9 phút mỗi lượt —
 *     đúng lúc đó mà ai áp bản vá bằng đường không có hãm thì TRANG THẬT
 *     có thể không đọc không ghi được trong tới 2 phút.
 * Và nguy hiểm hơn cả: bộ kiểm GHI dữ liệu thử vào cùng chỗ với dữ liệu thật.
 *
 * ⚠️ FILE NÀY CHỈ CHẠY MỘT LẦN, BẰNG TAY, TRÊN MỘT DỰ ÁN TRỐNG.
 *   Nó KHÔNG nằm trong CI và không được nằm trong CI: một lệnh áp 316 bản vá
 *   mà chạy nhầm vào cơ sở dữ liệu thật thì không có nút hoàn tác.
 *
 * ⚠️ BA CHỐT AN TOÀN, cố ý làm phiền:
 *   1. Phải truyền đường kết nối qua biến `KHO_KIEM_DB_URL` — KHÔNG dùng
 *      `SUPABASE_DB_URL`, để không bao giờ chạy nhầm vào kho thật chỉ vì quên
 *      đổi biến môi trường.
 *   2. Từ chối chạy nếu kho ĐÃ CÓ dữ liệu (bảng `tenants` tồn tại và có dòng).
 *   3. Từ chối chạy nếu đường kết nối trỏ đúng dự án đang phục vụ trang thật.
 *
 * Chạy:
 *   KHO_KIEM_DB_URL="postgresql://..." node scripts/dung-kho-kiem.mjs
 *   KHO_KIEM_DB_URL="..." node scripts/dung-kho-kiem.mjs --that   (áp thật)
 * Không có `--that` thì chỉ ĐI THỬ: đọc, kiểm, báo sẽ áp bao nhiêu bản, không ghi gì.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const THU_MUC = path.join(GOC, "supabase", "migrations");
const AP_THAT = process.argv.includes("--that");

const URL_KIEM = process.env.KHO_KIEM_DB_URL;
if (!URL_KIEM) {
  console.error(`❌ Thiếu KHO_KIEM_DB_URL.

   CỐ Ý không đọc SUPABASE_DB_URL: biến đó trỏ vào kho THẬT, và một lệnh áp
   316 bản vá chạy nhầm vào đó thì không có nút hoàn tác.

   Chạy:  KHO_KIEM_DB_URL="postgresql://..." node scripts/dung-kho-kiem.mjs`);
  process.exit(2);
}

// Chốt 3 — không cho trỏ vào kho thật, dù có cố tình.
const URL_THAT = process.env.SUPABASE_DB_URL ?? "";
// ⚠️ Bản đầu viết `postgres\.([a-z0-9]+)@` — SAI, và sai im lặng. Đường kết nối
//   qua bộ gộp phiên có dạng `postgres.<ref>:<mật-khẩu>@...`, tức giữa mã dự án
//   và dấu @ còn mật khẩu. Thử thật 22/08: chốt này KHÔNG nổ, chỉ chốt "kho đã
//   có dữ liệu" cứu. Mà chốt kia vô dụng nếu kho thật đang rỗng.
//   Mã dự án Supabase luôn dài đúng 20 ký tự chữ-số.
const refCua = (u) =>
  (u.match(/db\.([a-z0-9]{20})\.supabase\.co|postgres\.([a-z0-9]{20})/) ?? [])
    .slice(1)
    .find(Boolean);
if (URL_THAT && refCua(URL_KIEM) && refCua(URL_KIEM) === refCua(URL_THAT)) {
  console.error("❌ KHO_KIEM_DB_URL đang trỏ vào ĐÚNG dự án của trang thật. Dừng.");
  process.exit(2);
}

// ⚠️ KHÔNG có đường tắt "thiếu chứng thư thì bỏ qua kiểm chứng". Bản đầu của
//   file này có `rejectUnauthorized: false` làm phương án dự phòng — đó là mở
//   cửa cho người đứng giữa đọc trộm và sửa dữ liệu trên đường truyền, mà lại
//   im lặng nên không ai biết. Thiếu chứng thư thì DỪNG, không hạ tiêu chuẩn.
const DUONG_CA = path.join(GOC, "supabase", "supabase-ca.crt");
let caTls;
try {
  caTls = readFileSync(DUONG_CA, "utf8");
} catch {
  console.error(`❌ Không đọc được chứng thư TLS: ${DUONG_CA}`);
  console.error("   Không chạy tiếp mà không kiểm chứng máy chủ.");
  process.exit(2);
}

const ds = readdirSync(THU_MUC)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ version: f.slice(0, f.indexOf("_")), file: path.join(THU_MUC, f), ten: f }));

console.log(`Tìm thấy ${ds.length} bản vá.`);
console.log(AP_THAT ? "CHẾ ĐỘ: ÁP THẬT\n" : "CHẾ ĐỘ: ĐI THỬ (không ghi gì). Thêm --that để áp thật.\n");

const c = new pg.Client({
  connectionString: URL_KIEM,
  ssl: { ca: caTls, rejectUnauthorized: true },
});
await c.connect();
await c.query("set lock_timeout='30s'");

// Chốt 2 — kho phải TRỐNG.
const { rows: [{ co }] } = await c.query(
  "select (to_regclass('public.tenants') is not null) co",
);
if (co) {
  const { rows: [{ n }] } = await c.query("select count(*)::int n from public.tenants");
  if (n > 0) {
    console.error(`❌ Kho này ĐÃ CÓ ${n} tiệm. File này chỉ chạy trên kho TRỐNG. Dừng.`);
    await c.end();
    process.exit(2);
  }
}

await c.query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key, inserted_at timestamptz not null default now());
`);
const { rows: daCo } = await c.query("select version from supabase_migrations.schema_migrations");
const daApSet = new Set(daCo.map((r) => r.version));
const conLai = ds.filter((m) => !daApSet.has(m.version));
console.log(`Đã áp sẵn: ${daApSet.size} · Còn phải áp: ${conLai.length}\n`);

if (!AP_THAT) {
  console.log("Đi thử xong. Không ghi gì.");
  await c.end();
  process.exit(0);
}

let ok = 0;
for (const m of conLai) {
  const sql = readFileSync(m.file, "utf8");
  await c.query("begin");
  try {
    await c.query("set local lock_timeout='30s'");
    await c.query(sql);
    await c.query(
      "insert into supabase_migrations.schema_migrations (version) values ($1) on conflict do nothing",
      [m.version],
    );
    await c.query("commit");
    ok++;
    if (ok % 25 === 0) console.log(`  … ${ok}/${conLai.length}`);
  } catch (err) {
    await c.query("rollback");
    // DỪNG NGAY ở bản đầu tiên hỏng. Bỏ qua rồi chạy tiếp là dựng một cấu trúc
    // LỆCH so với kho thật — mà cổng kiểm chạy trên cấu trúc lệch thì mọi kết
    // luận của nó đều vô nghĩa, và không ai biết.
    console.error(`\n❌ DỪNG ở ${m.ten}\n   ${err.message}`);
    console.error(`   Đã áp được ${ok} bản trước đó. Sửa rồi chạy lại — các bản đã áp sẽ được bỏ qua.`);
    await c.end();
    process.exit(1);
  }
}
console.log(`\n✓ Xong ${ok} bản vá. Kho kiểm đã có ĐÚNG cấu trúc của kho thật.`);
console.log(`  Bước tiếp: gieo dữ liệu mẫu, rồi đổi khoá bí mật SUPABASE_DB_URL trên GitHub.`);
await c.end();
