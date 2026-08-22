/**
 * SAO LƯU DỮ LIỆU — và KIỂM lại bản sao lưu đó đọc được.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY — ĐO ĐƯỢC NGÀY 21/08
 * ═══════════════════════════════════════════════════════════════════
 * Hỏi thẳng Supabase về dự án iFan:
 *
 *     gói           = free
 *     pitr_enabled  = false
 *     backups       = []      ← RỖNG
 *
 * Nghĩa là HIỆN KHÔNG CÓ BẢN SAO LƯU NÀO để khôi phục. Xoá nhầm một bảng, hoặc
 * dự án gặp sự cố, là mất trắng dữ liệu của mọi tiệm đang dùng. Không cổng nào
 * trong kho từng canh chuyện này, và tài liệu vận hành ghi nó là "việc chưa
 * làm" — nên nó nằm im.
 *
 * ┌─ ĐÂY LÀ TẤM ĐỆM, KHÔNG PHẢI LỜI GIẢI ─────────────────────────────
 * Lời giải thật là bật sao lưu tự động của Supabase (đổi gói), vì bản sao lưu
 * đó nằm ở máy chủ và chạy hằng ngày dù không ai nhớ. File này chỉ là thứ chạy
 * được NGAY hôm nay bằng đúng những gì máy đang có. Nó cần một người bấm chạy —
 * mà "cần người nhớ" chính là điểm yếu của mọi quy trình sao lưu thủ công.
 *
 * ┌─ VÌ SAO KHÔNG DÙNG `pg_dump` ─────────────────────────────────────
 * Máy founder KHÔNG có `pg_dump` (đã kiểm), và Docker không chạy. Chờ cài đặt
 * xong mới có bản sao lưu đầu tiên là để dữ liệu trần thêm nhiều ngày nữa.
 * Bản này đọc bằng chính đường kết nối sẵn có.
 *
 * ⚠️ PHẦN CẤU TRÚC BẢNG KHÔNG NẰM TRONG BẢN SAO LƯU NÀY — nó đã nằm trong
 *   `supabase/migrations/` và có trong git. Đường khôi phục đầy đủ là:
 *   áp lại migration để dựng cấu trúc → nạp dữ liệu từ bản sao lưu này.
 *   Ghi rõ ra đây vì một bản sao lưu chỉ có dữ liệu mà người đọc tưởng là đủ
 *   thì lúc cần mới phát hiện thiếu, và lúc đó đã muộn.
 *
 * ⚠️ ĐÍCH LƯU PHẢI NGOÀI KHO GIT. Đây là dữ liệu thật của khách hàng thật.
 *
 * Chạy:
 *   node scripts/sao-luu.mjs                      → sao lưu vào ../ifan-sao-luu
 *   node scripts/sao-luu.mjs --dich D:/sao-luu    → chọn chỗ khác
 *   node scripts/sao-luu.mjs --kiem <thư-mục>     → đọc lại bản sao lưu, đối chiếu số dòng với CSDL
 */
import pg from "pg";
import { createWriteStream, createReadStream, readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

if (!process.env.SUPABASE_DB_URL && existsSync(path.join(GOC, ".env.local"))) {
  // ⚠️ `\r?\n`, KHÔNG phải `\n`: tách theo `\n` thì dòng kiểu Windows còn sót `\r` ở
  //   đuôi, mà trong regex JavaScript `\r` LÀ ký tự xuống dòng — `.` không khớp nó và
  //   `$` (không cờ `m`) chỉ khớp cuối chuỗi, nên `(.*)$` TRƯỢT sạch mọi dòng CRLF.
  //   Đo 22/08 trên `.env.local` của máy này (37 dòng CRLF + 6 dòng LF): đọc được đúng
  //   1/22 biến rồi dừng ở "thiếu khoá" ⇒ script này CHƯA TỪNG CHẠY ĐƯỢC trên Windows.
  for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("❌ Thiếu SUPABASE_DB_URL.");
  process.exit(1);
}

const doi = (ten, macDinh = null) => {
  const i = process.argv.indexOf(ten);
  return i >= 0 ? (process.argv[i + 1] ?? macDinh) : macDinh;
};

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
});
await c.connect();
// ⚠️ CHỈ ĐỌC, và có hạn chờ: bản sao lưu chạy trên đúng kho đang phục vụ khách.
await c.query("set session characteristics as transaction read only");
await c.query("set lock_timeout = '10s'");
await c.query("set statement_timeout = '600s'");

async function danhSachBang() {
  const { rows } = await c.query(
    `select tablename from pg_tables where schemaname='public' order by tablename`,
  );
  return rows.map((r) => r.tablename);
}

async function demDong(bang) {
  const { rows } = await c.query(`select count(*)::bigint as n from public."${bang}"`);
  return Number(rows[0].n);
}

// ════════════════════════════════════════════════════════════════════
// KIỂM một bản sao lưu đã có
// ════════════════════════════════════════════════════════════════════
if (process.argv.includes("--kiem")) {
  const thuMuc = doi("--kiem");
  if (!thuMuc || !existsSync(thuMuc)) {
    console.error(`❌ Không thấy thư mục: ${thuMuc}`);
    process.exit(1);
  }
  const soTay = JSON.parse(readFileSync(path.join(thuMuc, "so-tay.json"), "utf8"));
  let truot = 0;
  console.log(`Đối chiếu bản sao lưu lúc ${soTay.luc} với CSDL hiện tại:\n`);
  for (const [bang, ghi] of Object.entries(soTay.bang)) {
    const tep = path.join(thuMuc, `${bang}.jsonl.gz`);
    if (!existsSync(tep)) {
      console.log(`  TRƯỢT  ${bang} — THIẾU FILE`);
      truot++;
      continue;
    }
    // Đọc THẬT từng dòng, không tin vào cỡ tệp: tệp gzip hỏng vẫn có cỡ đẹp.
    let doc = 0;
    let hongDong = 0;
    const rl = createInterface({ input: createReadStream(tep).pipe(createGunzip()) });
    for await (const d of rl) {
      if (!d.trim()) continue;
      doc++;
      try {
        JSON.parse(d);
      } catch {
        hongDong++;
      }
    }
    const nay = await demDong(bang);
    const ok = doc === ghi.dong && hongDong === 0;
    if (!ok) truot++;
    const lech = nay - ghi.dong;
    console.log(
      `  ${ok ? "ĐẠT  " : "TRƯỢT"}  ${bang.padEnd(34)} lưu ${String(ghi.dong).padStart(7)} · đọc lại ${String(doc).padStart(7)}` +
        (hongDong ? ` · ${hongDong} DÒNG HỎNG` : "") +
        (lech !== 0 ? ` · CSDL nay ${lech > 0 ? "+" : ""}${lech}` : ""),
    );
  }
  await c.end();
  console.log("");
  if (truot) {
    console.error(`❌ ${truot} bảng KHÔNG đọc lại được đúng như lúc lưu — bản sao lưu này KHÔNG tin được.`);
    process.exit(1);
  }
  console.log("✅ Đọc lại được toàn bộ, số dòng khớp sổ tay. Bản sao lưu dùng được.");
  process.exit(0);
}

// ════════════════════════════════════════════════════════════════════
// SAO LƯU
// ════════════════════════════════════════════════════════════════════
const nen = doi("--dich", path.resolve(GOC, "..", "ifan-sao-luu"));
const dau = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const dich = path.join(nen, dau);
mkdirSync(dich, { recursive: true });

const bangs = await danhSachBang();
console.log(`Sao lưu ${bangs.length} bảng → ${dich}\n`);

const soTay = { luc: new Date().toISOString(), nguon: "public", bang: {} };
let tongDong = 0;

for (const bang of bangs) {
  const n = await demDong(bang);
  const tep = path.join(dich, `${bang}.jsonl.gz`);
  const gz = createGzip();
  const ghi = createWriteStream(tep);
  const xong = pipeline(gz, ghi);

  // Đọc theo lô: bảng lớn mà đọc một phát là hết bộ nhớ, và lỗi đó chỉ hiện ra
  // đúng lúc dữ liệu đã nhiều — tức là lúc bản sao lưu quan trọng nhất.
  const LO = 2000;
  let daDoc = 0;
  while (daDoc < n) {
    const { rows } = await c.query(
      `select * from public."${bang}" order by 1 limit ${LO} offset ${daDoc}`,
    );
    if (rows.length === 0) break;
    for (const r of rows) gz.write(JSON.stringify(r) + "\n");
    daDoc += rows.length;
  }
  gz.end();
  await xong;

  soTay.bang[bang] = { dong: daDoc, byte: statSync(tep).size };
  tongDong += daDoc;
  if (daDoc > 0) console.log(`  ${bang.padEnd(36)} ${String(daDoc).padStart(7)} dòng`);
}

writeFileSync(path.join(dich, "so-tay.json"), JSON.stringify(soTay, null, 1), "utf8");
writeFileSync(
  path.join(dich, "DOC-TRUOC-KHI-KHOI-PHUC.txt"),
  [
    "BẢN SAO LƯU DỮ LIỆU iFan",
    `Lúc: ${soTay.luc}`,
    `Số bảng: ${bangs.length} · Tổng số dòng: ${tongDong}`,
    "",
    "⚠️ BẢN NÀY CHỈ CÓ DỮ LIỆU, KHÔNG CÓ CẤU TRÚC BẢNG.",
    "Cấu trúc nằm trong `supabase/migrations/` của kho mã nguồn (có trong git).",
    "",
    "ĐƯỜNG KHÔI PHỤC ĐẦY ĐỦ:",
    "  1. Dựng một dự án Supabase trống.",
    "  2. Áp toàn bộ migration theo thứ tự  →  có cấu trúc bảng, hàm, luật RLS.",
    "  3. Nạp từng file .jsonl.gz vào đúng bảng cùng tên.",
    "  4. Đối chiếu số dòng với `so-tay.json`.",
    "",
    "⚠️ Đây là DỮ LIỆU THẬT CỦA KHÁCH HÀNG. Không đưa lên chỗ công khai,",
    "   không gửi qua chat, không để trong thư mục có đồng bộ đám mây công cộng.",
  ].join("\n"),
  "utf8",
);

await c.end();
console.log(`\n✓ Xong: ${bangs.length} bảng · ${tongDong} dòng · ${dich}`);
console.log("  Kiểm lại ngay:  node scripts/sao-luu.mjs --kiem " + JSON.stringify(dich));
console.log("\n⚠️ Đây là TẤM ĐỆM, không phải lời giải. Lời giải là bật sao lưu tự");
console.log("   động của Supabase — bản đó chạy hằng ngày mà không cần ai nhớ.");
