#!/usr/bin/env node
/**
 * Áp migration lên CSDL — CÔNG CỤ CHUẨN mà bất biến 5 nhắc tới.
 *
 * ⚠️ VÌ SAO FILE NÀY SINH RA MUỘN (17/08). Bất biến 5 trong
 * `docs/SO-DO-HE-THONG.md` viết: *"Migration: file mới đánh số tiếp, áp qua node
 * script chuẩn (TLS ghim CA, transaction, ghi sổ schema_migrations)"*. Tìm cả
 * cây thư mục lẫn toàn bộ lịch sử git: **script đó chưa từng tồn tại**. Hệ quả
 * đo được ngày 17/08:
 *
 *   sổ `supabase_migrations.schema_migrations` dừng ở #84 (12/08)
 *   thư mục `supabase/migrations/` đã có tới #130
 *   ⇒ ~44 bản áp thẳng không ghi sổ, dù luật bắt ghi.
 *
 * Đây là lần thứ TƯ dự án gặp cùng một bệnh trong một tuần: luật/tài liệu trỏ
 * vào công cụ không có thật (`check-ds.mjs` — cổng kiểm thẻ design · ADR-0003 —
 * script test-model-override · việc #117 — khoá AI "đã bật" · và cái này).
 * **Một cổng không tồn tại không phân biệt được với một cổng luôn PASS.**
 *
 * Nguy hiểm thật của sổ lệch: ai chạy `supabase db push` sẽ thấy 44 bản "chưa
 * áp" và áp lại. Bản `create or replace` thì vô hại, nhưng bản có
 * `create table` / `add column` / `insert` seed thì hỏng hoặc nhân đôi dữ liệu.
 *
 * CÁCH DÙNG
 *   node scripts/ap-migration.mjs --kiem              # đối chiếu thư mục ↔ sổ ↔ CSDL
 *   node scripts/ap-migration.mjs <version|đường-dẫn> # áp 1 bản (transaction + ghi sổ)
 *   node scripts/ap-migration.mjs --ghi-so <version>  # CHỈ ghi sổ cho bản đã áp tay
 *   node scripts/ap-migration.mjs --ghi-so-tat-ca-da-ap   # ghi bù hàng loạt (dùng 1 lần)
 *
 * Cần env `SUPABASE_DB_URL` (đọc từ .env.local nếu chưa có trong môi trường).
 */

import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const GOC = path.resolve(import.meta.dirname, "..");
const THU_MUC = path.join(GOC, "supabase", "migrations");

/** Đọc .env.local khi chạy tay — CI thì đã có env sẵn. */
function napEnv() {
  if (process.env.SUPABASE_DB_URL) return;
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}

async function moKetNoi() {
  napEnv();
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Thiếu SUPABASE_DB_URL (env hoặc .env.local).");
    process.exit(1);
  }
  // TLS verify-full với CA Supabase đã ghim — cùng khuôn scripts/rls-smoke.mjs.
  const c = new pg.Client({
    connectionString: url,
    ssl: {
      ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"),
      rejectUnauthorized: true,
    },
  });
  await c.connect();
  return c;
}

/**
 * Danh sách file migration trong kho, theo thứ tự version.
 *
 * ⚠️ CHẶN TRÙNG SỐ — lỗi THẬT của chính công cụ này, bắt được 20 phút sau khi
 * viết nó (17/08): hai phiên làm việc song song trên cùng thư mục cùng đặt số
 * `…134`. Bản đầu dùng `find(x => x.version === …)` nên **lặng lẽ lấy file đầu
 * tiên theo thứ tự chữ cái** — và áp NHẦM migration của phiên khác lên CSDL
 * thật (`…135_admin_dashboard…` đã bị áp sớm hơn ý chủ của nó).
 *
 * Số migration là ĐỊNH DANH: trùng số thì không có cách nào đoán đúng, nên phải
 * DỪNG chứ không chọn hộ. Cùng bài học với cả ngày hôm nay: thứ nhập nhằng mà
 * máy tự quyết hộ thì sai trong im lặng.
 */
function danhSachFile() {
  const ds = readdirSync(THU_MUC)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
      const m = f.match(/^(\d+)_(.+)\.sql$/);
      return m ? { version: m[1], name: m[2], file: path.join(THU_MUC, f) } : null;
    })
    .filter(Boolean);

  const theoVersion = new Map();
  for (const m of ds) {
    if (!theoVersion.has(m.version)) theoVersion.set(m.version, []);
    theoVersion.get(m.version).push(m.name);
  }
  const trung = [...theoVersion.entries()].filter(([, v]) => v.length > 1);
  if (trung.length > 0) {
    console.error("⛔ TRÙNG SỐ MIGRATION — dừng, không đoán file nào là đúng:\n");
    for (const [v, names] of trung) {
      console.error(`   ${v}:`);
      for (const n of names) console.error(`      ${v}_${n}.sql`);
    }
    console.error(
      "\n   Số migration là ĐỊNH DANH. Đổi tên file của bạn sang số tiếp theo còn trống",
    );
    console.error("   (đừng đổi file của người khác), rồi chạy lại.");
    console.error("   Hay gặp khi hai phiên làm việc song song trên cùng thư mục.");
    process.exit(3);
  }
  return ds;
}

/**
 * Trích các đối tượng CSDL mà một migration khai, để ĐO xem nó đã áp chưa.
 *
 * ⚠️ Đây là PHÉP ĐOÁN CÓ CĂN CỨ, không phải chứng minh: nó chỉ thấy được các
 * dạng câu lệnh liệt kê dưới đây. Bản chỉ `comment on` / `grant` / `update` dữ
 * liệu sẽ không có dấu hiệu nào và bị xếp "không đo được" — phải xem tay.
 */
function tuKhaiDoiTuong(sql) {
  // Ba nguồn báo động GIẢ đã bắt được lúc chạy thật lần đầu (17/08), phải dọn
  // TRƯỚC khi nhặt — nếu không công cụ tự sinh việc cho người đọc:
  //   ① chú thích `--` tiếng Việt có chữ "create table" (migration #42)
  //   ② chú thích khối /* … */
  //   ③ CHUỖI SQL: event trigger của #42 lọc `tag in ('CREATE TABLE','CREATE
  //      TABLE AS')` — nhặt thẳng sẽ ra một "bảng" tên `as`.
  const s = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
  const ds = [];
  const nhat = (re, loai, nhom = 1) => {
    for (const m of s.matchAll(re)) ds.push({ loai, ten: m[nhom].toLowerCase() });
  };
  const LUOC = String.raw`(?:(?:public|private)\.)?`;
  nhat(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${LUOC}"?([a-z0-9_]+)"?`, "gi"), "table");
  nhat(new RegExp(`alter\\s+table\\s+${LUOC}"?([a-z0-9_]+)"?[\\s\\S]{0,80}?add\\s+column`, "gi"), "table");
  nhat(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+${LUOC}"?([a-z0-9_]+)"?\\s*\\(`, "gi"), "function");
  nhat(/create\s+(?:or\s+replace\s+)?trigger\s+"?([a-z0-9_]+)"?/gi, "trigger");
  nhat(new RegExp(`create\\s+type\\s+${LUOC}"?([a-z0-9_]+)"?\\s+as\\s+enum`, "gi"), "type");
  nhat(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi, "index");
  nhat(/create\s+policy\s+"?([a-z0-9_ ]+?)"?\s+on\s/gi, "policy");
  // Dấu hiệu ĐẢO: bản chỉ đi XOÁ một thứ thì "đã áp" nghĩa là thứ đó KHÔNG
  // còn. Không có dòng này thì mọi migration dọn dẹp đều rơi vào "không đo
  // được" — mà đó lại chính là loại bản hay bị bỏ sót khỏi sổ.
  nhat(new RegExp(`drop\\s+function\\s+(?:if\\s+exists\\s+)?${LUOC}"?([a-z0-9_]+)"?`, "gi"), "khong-con-function");
  // Bỏ trùng.
  const thay = new Set();
  const loc = ds.filter((d) => {
    const k = `${d.loai}:${d.ten}`;
    if (thay.has(k)) return false;
    thay.add(k);
    return true;
  });

  // ⚠️ Bẫy của dấu hiệu ĐẢO, bắt được ngay lần chạy đầu (9 bản báo sai): khuôn
  // phổ biến nhất trong kho này là `drop function X` RỒI `create function X`
  // ngay sau — bắt buộc phải làm vậy khi đổi chữ ký, để PostgREST không thấy
  // hai bản trùng tên (tiền lệ ghi ở migration #107). Hàm vẫn tồn tại sau khi
  // áp, nên "không còn hàm X" là dấu hiệu SAI ở những bản đó.
  const taoLai = new Set(loc.filter((d) => d.loai === "function").map((d) => d.ten));
  return loc.filter((d) => !(d.loai === "khong-con-function" && taoLai.has(d.ten)));
}

async function tonTai(c, d) {
  if (d.loai === "table") {
    const { rows } = await c.query(
      `select 1 from pg_class cl join pg_namespace n on n.oid=cl.relnamespace
        where n.nspname in ('public','private') and cl.relname=$1 and cl.relkind in ('r','p','v','m')`,
      [d.ten],
    );
    return rows.length > 0;
  }
  if (d.loai === "function") {
    const { rows } = await c.query(
      `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','private') and p.proname=$1`,
      [d.ten],
    );
    return rows.length > 0;
  }
  if (d.loai === "trigger") {
    const { rows } = await c.query(`select 1 from pg_trigger where tgname=$1 and not tgisinternal`, [d.ten]);
    return rows.length > 0;
  }
  if (d.loai === "type") {
    const { rows } = await c.query(
      `select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
        where n.nspname='public' and t.typname=$1`,
      [d.ten],
    );
    return rows.length > 0;
  }
  if (d.loai === "index") {
    const { rows } = await c.query(
      `select 1 from pg_class cl join pg_namespace n on n.oid=cl.relnamespace
        where n.nspname in ('public','private') and cl.relname=$1 and cl.relkind='i'`,
      [d.ten],
    );
    return rows.length > 0;
  }
  if (d.loai === "policy") {
    const { rows } = await c.query(`select 1 from pg_policies where policyname=$1`, [d.ten]);
    return rows.length > 0;
  }
  if (d.loai === "khong-con-function") {
    const { rows } = await c.query(
      `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','private') and p.proname=$1`,
      [d.ten],
    );
    return rows.length === 0; // đảo: đã áp = KHÔNG còn hàm đó
  }
  return false;
}

/**
 * ⚠️ HẠN CHẾ GỐC của cách đo này, phải hiểu trước khi tin kết quả: nó xem
 * trạng thái HIỆN TẠI của CSDL, nên **không tự phân biệt được "chưa áp" với
 * "đã áp rồi bị bản SAU xoá/đổi tên"**.
 *
 * Ca thật gặp ngay lần chạy đầu: migration #83 tạo bảng `services`, nhưng #125
 * đã đổi tên `services` → `items`. Bảng không còn ⇒ đo ra "áp một phần", trong
 * khi thực tế nó đã áp từ 12/08 và chạy suốt.
 *
 * Nên trước khi kết luận thiếu, quét các migration SAU nó xem có câu lệnh nào
 * xoá/đổi tên đúng đối tượng đó. Có ⇒ không tính là thiếu.
 */
function biBanSauXoa(ten, loai, banSau, sqlGoc = null) {
  const t = ten.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mau = [
    new RegExp(`drop\\s+${loai}\\s+(?:if\\s+exists\\s+)?(?:(?:public|private)\\.)?"?${t}"?`, "i"),
    new RegExp(`alter\\s+${loai}\\s+(?:if\\s+exists\\s+)?(?:(?:public|private)\\.)?"?${t}"?[\\s\\S]{0,120}?rename\\s+to`, "i"),
    // Hàm bị thay bằng bản có tên khác thì thường kèm `drop function` ở trên.
  ];

  // TRIGGER / POLICY / INDEX bị xoá THEO BẢNG CHA (cascade) — không có câu lệnh riêng
  // nào để bắt, nên trước bản vá này chúng luôn bị báo "thiếu" sau khi bảng cha
  // bị bỏ. Gặp thật ngày 19/08: bỏ bảng `canned_responses` (chết hẳn) làm công cụ
  // kêu oan 3 đối tượng của migration #4. **Một cổng kêu oan là một cổng sắp bị
  // tắt đi** — nên tìm luôn tên bảng cha trong chính bản khai, rồi hỏi xem bảng
  // ấy có bị bản sau bỏ không.
  if ((loai === "trigger" || loai === "policy" || loai === "index") && sqlGoc) {
    const chaRe = new RegExp(
      `create\\s+(?:unique\\s+)?${loai}\\s+(?:if\\s+not\\s+exists\\s+)?"?${t}"?[\\s\\S]{0,200}?\\bon\\s+(?:public|private)\\."?([a-z0-9_]+)"?`,
      "i",
    );
    const cha = chaRe.exec(sqlGoc.replace(/--[^\n]*/g, " "));
    if (cha) {
      mau.push(
        new RegExp(`drop\\s+table\\s+(?:if\\s+exists\\s+)?(?:(?:public|private)\\.)?"?${cha[1]}"?`, "i"),
      );
    }
  }
  for (const b of banSau) {
    const sql = readFileSync(b.file, "utf8").replace(/--[^\n]*/g, " ");
    if (mau.some((r) => r.test(sql))) return b.version;
  }
  return null;
}

/** Trạng thái một bản: trong sổ chưa, và CSDL có dấu hiệu đã áp chưa. */
async function doTrangThai(c, m, trongSo, tatCa = []) {
  const dt = tuKhaiDoiTuong(readFileSync(m.file, "utf8"));
  const banSau = tatCa.filter((x) => x.version > m.version);
  let co = 0;
  const thieu = [];
  const banSauThay = [];
  for (const d of dt) {
    if (await tonTai(c, d)) {
      co += 1;
      continue;
    }
    const boi = biBanSauXoa(d.ten, d.loai, banSau, readFileSync(m.file, "utf8"));
    if (boi) {
      co += 1; // đã áp, chỉ bị bản sau thay — không phải thiếu
      banSauThay.push(`${d.loai}:${d.ten} (bản ${boi} thay)`);
    } else {
      thieu.push(`${d.loai}:${d.ten}`);
    }
  }
  if (banSauThay.length > 0) {
    return { ...m, trongSo: trongSo.has(m.version), soDoiTuong: dt.length, co, thieu, banSauThay,
      ket: thieu.length === 0 ? "da-ap" : co === 0 ? "chua-ap" : "ap-mot-phan" };
  }
  let ket;
  if (dt.length === 0) ket = "khong-do-duoc";
  else if (thieu.length === 0) ket = "da-ap";
  else if (co === 0) ket = "chua-ap";
  else ket = "ap-mot-phan";
  return { ...m, trongSo: trongSo.has(m.version), soDoiTuong: dt.length, co, thieu, ket };
}

async function lenhKiem() {
  const c = await moKetNoi();
  const { rows } = await c.query(`select version from supabase_migrations.schema_migrations`);
  const trongSo = new Set(rows.map((r) => r.version));
  const ds = danhSachFile();

  const dem = { "da-ap": 0, "chua-ap": 0, "ap-mot-phan": 0, "khong-do-duoc": 0 };
  const canGhiSo = [];
  const canBaoDong = [];

  console.log(`Kho có ${ds.length} file migration · sổ có ${trongSo.size} dòng.\n`);
  console.log("version         sổ   CSDL            chi tiết");
  console.log("─".repeat(78));
  for (const m of ds) {
    const t = await doTrangThai(c, m, trongSo, ds);
    dem[t.ket] += 1;
    const nhan = { "da-ap": "đã áp", "chua-ap": "CHƯA ÁP", "ap-mot-phan": "ÁP MỘT PHẦN", "khong-do-duoc": "không đo được" }[t.ket];
    if (!t.trongSo && t.ket === "da-ap") canGhiSo.push(t);
    if (t.ket === "chua-ap" || t.ket === "ap-mot-phan") canBaoDong.push(t);
    const cot = `${m.version}  ${t.trongSo ? "có " : "—  "}  ${nhan.padEnd(14)}`;
    const ct = t.ket === "da-ap" ? `${t.co}/${t.soDoiTuong} đối tượng` : t.thieu.slice(0, 3).join(", ");
    console.log(`${cot} ${ct}`);
  }
  console.log("─".repeat(78));
  console.log(
    `Tổng: đã áp ${dem["da-ap"]} · chưa áp ${dem["chua-ap"]} · áp một phần ${dem["ap-mot-phan"]} · không đo được ${dem["khong-do-duoc"]}`,
  );
  console.log(`Thiếu trong sổ mà CSDL đã có: ${canGhiSo.length} bản.`);

  if (canBaoDong.length > 0) {
    console.log("\n🔴 CẦN XEM TAY — bản chưa áp hoặc áp một phần:");
    for (const t of canBaoDong) {
      console.log(`   ${t.version}_${t.name} → thiếu: ${t.thieu.join(", ")}`);
    }
  }
  const khongDo = ds.length - dem["da-ap"] - dem["chua-ap"] - dem["ap-mot-phan"];
  if (khongDo > 0) {
    console.log(
      `\nℹ️ ${khongDo} bản không có đối tượng nào đo được (chỉ comment/grant/dữ liệu) — công cụ CỐ Ý không đoán, xem tay nếu cần.`,
    );
  }
  if (canGhiSo.length > 0) {
    console.log("\n🟡 SỔ LỆCH — các bản này CSDL đã có nhưng sổ chưa ghi:");
    for (const t of canGhiSo) console.log(`   ${t.version}_${t.name}`);
    console.log("\n   Sửa bằng:");
    console.log(`   node scripts/ap-migration.mjs --ghi-so ${canGhiSo.map((t) => t.version).join(" ")}`);
    console.log(
      "\n   Vì sao chặn: sổ lệch thì `supabase db push` tưởng các bản đó chưa áp và áp lại —",
    );
    console.log("   bản có `create table`/`insert` sẽ hỏng hoặc nhân đôi dữ liệu. Đã lệch 44 bản");
    console.log("   suốt 5 ngày (17/08) vì không có gì canh. Từ nay áp migration bằng chính công cụ");
    console.log("   này (`node scripts/ap-migration.mjs <version>`) thì sổ tự khớp, không phải nhớ.");
  }
  await c.end();
  return canBaoDong.length === 0 && canGhiSo.length === 0;
}

async function lenhGhiSo(versions) {
  const c = await moKetNoi();
  let ghi = 0;
  for (const v of versions) {
    const m = danhSachFile().find((x) => x.version === v);
    if (!m) {
      console.error(`Không có file cho version ${v}`);
      continue;
    }
    const { rowCount } = await c.query(
      `insert into supabase_migrations.schema_migrations (version, name, statements)
       values ($1, $2, $3) on conflict (version) do nothing`,
      [m.version, m.name, [`-- ghi bù bởi scripts/ap-migration.mjs (bản đã áp tay trước khi có công cụ này)`]],
    );
    if (rowCount > 0) ghi += 1;
    console.log(`${rowCount > 0 ? "✓ ghi sổ" : "· đã có"} ${m.version}_${m.name}`);
  }
  console.log(`Ghi bù ${ghi} dòng.`);
  await c.end();
}

async function lenhGhiSoTatCaDaAp() {
  const c = await moKetNoi();
  const { rows } = await c.query(`select version from supabase_migrations.schema_migrations`);
  const trongSo = new Set(rows.map((r) => r.version));
  const canGhi = [];
  const chuaAp = [];
  const ds = danhSachFile();
  for (const m of ds) {
    if (trongSo.has(m.version)) continue;
    const t = await doTrangThai(c, m, trongSo, ds);
    if (t.ket === "da-ap") canGhi.push(m.version);
    else chuaAp.push(`${t.version} (${t.ket}: ${t.thieu.slice(0, 2).join(", ")})`);
  }
  await c.end();

  if (chuaAp.length > 0) {
    console.log("⛔ DỪNG — có bản chưa áp / áp một phần / không đo được. KHÔNG ghi sổ bừa,");
    console.log("   vì ghi sổ cho bản chưa áp là CHE MẤT nó vĩnh viễn:");
    for (const x of chuaAp) console.log(`   - ${x}`);
    console.log("\n   Xử lý từng bản trên rồi chạy lại, hoặc ghi lẻ bằng --ghi-so <version>.");
    process.exit(1);
  }
  await lenhGhiSo(canGhi);
}

async function lenhAp(dinhDanh) {
  const ds = danhSachFile();
  const m = ds.find((x) => x.version === dinhDanh) ?? ds.find((x) => x.file.endsWith(dinhDanh));
  if (!m) {
    console.error(`Không tìm thấy migration: ${dinhDanh}`);
    process.exit(1);
  }
  const sql = readFileSync(m.file, "utf8");
  const c = await moKetNoi();
  const { rows } = await c.query(
    `select 1 from supabase_migrations.schema_migrations where version = $1`,
    [m.version],
  );
  if (rows.length > 0) {
    console.log(`· ${m.version} đã có trong sổ — không áp lại.`);
    await c.end();
    return;
  }
  try {
    // ── DỌN PHIÊN TREO TRƯỚC KHI XIN KHOÁ (việc #176, đợt chữa thứ hai) ─────
    //
    // Đợt chữa THỨ NHẤT (21/08 sáng) đặt `idle_in_transaction_session_timeout`
    // ngay trong bộ kiểm, nghĩ rằng máy chủ sẽ tự cắt phiên bỏ dở. ĐO LẠI
    // CHIỀU CÙNG NGÀY: KHÔNG ĐỦ. Chốt đó tính giờ theo `state_change`, mà qua
    // trình gom kết nối (Supavisor) mốc ấy liên tục được làm mới — nên đồng hồ
    // không bao giờ chạy hết, phiên treo nằm mãi. Đo được một phiên giữ khoá
    // `orders` suốt 194 giây trong khi đồng hồ chốt vẫn về 0. Ghi lại nguyên
    // văn ở đây vì bản vá đầu VẪN CÒN trong bộ kiểm và trông như đã xong việc.
    //
    // NGUỒN THẬT của phiên treo, tìm ra bằng cách soi tiến trình trên MÁY chứ
    // không đoán: máy chủ chạy thử (`next dev`) trên máy lập trình nối thẳng
    // vào cơ sở dữ liệu THẬT. Một lượt bấm dở, một lần nạp lại mã giữa chừng,
    // là còn lại một giao dịch mở không ai đóng. Gốc rễ của gốc rễ là việc
    // #175 (cổng kiểm và bản thật dùng chung một cơ sở dữ liệu) — chờ founder
    // quyết, không tự quyết hộ.
    //
    // Ở ĐÂY chỉ dọn, và dọn có giới hạn: chỉ phiên ĐANG CHỜ CLIENT (`idle in
    // transaction` — không chạy câu nào) và đã mở giao dịch quá 60 giây. Một
    // giao dịch đang làm việc thật không nằm ở trạng thái đó lâu như vậy: bộ
    // kiểm chạy cả bộ trong một giao dịch nhưng các câu lệnh nối đuôi nhau,
    // khoảng nghỉ tính bằng mili giây. Không dùng `state_change` vì đã đo là
    // không tin được (xem trên).
    //
    // Chỉ chạy ở ĐÚNG đây — lúc một người chủ động áp migration — chứ không
    // đặt thành việc chạy nền mỗi phút: một cái tự động đi cắt phiên người
    // khác là thứ phải có người bấm mới được chạy.
    const donDep = await c.query(`
      select pg_terminate_backend(pid), pid
        from pg_stat_activity
       where state = 'idle in transaction'
         and xact_start < now() - interval '60 seconds'
         and pid <> pg_backend_pid()
         and backend_type = 'client backend'`);
    if (donDep.rowCount > 0) {
      console.log(`· Đã dọn ${donDep.rowCount} phiên bỏ dở đang giữ khoá (xem chú thích #176).`);
    }

    // MỘT transaction: áp + ghi sổ cùng đứng cùng ngã. Trước khi có file này,
    // hai việc đó tách nhau và sổ đã lệch 44 bản.
    await c.query("begin");
    // Điều tra việc #176: DB này có traffic PostgREST THẬT chạy song song CSDL
    // (không rảnh riêng cho migration). DDL cần khoá ACCESS EXCLUSIVE mà kẹt
    // hàng đợi (vd đụng traffic thật đang ghi bảng) thì không có lock_timeout
    // sẽ treo lặng lẽ tới hết statement_timeout (đo được 2 phút) rồi báo lỗi
    // mơ hồ "statement timeout" — không nói rõ là do KHOÁ. Đặt lock_timeout
    // ngắn để báo NHANH và RÕ (code 55P03 lock_not_available); không đổi kết
    // quả cuối cùng (đằng nào cũng treo rồi lỗi), chỉ đổi tốc độ + độ rõ.
    await c.query("set local lock_timeout = '10s'");
    await c.query(sql);
    await c.query(
      `insert into supabase_migrations.schema_migrations (version, name, statements)
       values ($1, $2, $3)`,
      [m.version, m.name, [sql]],
    );
    await c.query("commit");
    console.log(`✓ ĐÃ ÁP + GHI SỔ ${m.version}_${m.name}`);
  } catch (e) {
    await c.query("rollback");
    // Việc #176: in thêm code/detail để phân biệt ngay lỗi KHOÁ (55P03/57014)
    // với lỗi cú pháp/logic SQL thật — trước đây chỉ có e.message thì không rõ.
    console.error(`✗ LỖI, đã rollback sạch: ${e.message}`);
    if (e.code) console.error(`  code: ${e.code}`);
    if (e.detail) console.error(`  detail: ${e.detail}`);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
}

const arg = process.argv[2];
if (arg === "--kiem") {
  process.exit((await lenhKiem()) ? 0 : 1);
} else if (arg === "--ghi-so") {
  await lenhGhiSo(process.argv.slice(3));
} else if (arg === "--ghi-so-tat-ca-da-ap") {
  await lenhGhiSoTatCaDaAp();
} else if (arg) {
  await lenhAp(arg);
} else {
  console.error("Dùng: --kiem | --ghi-so <version…> | --ghi-so-tat-ca-da-ap | <version|file>");
  process.exit(2);
}
