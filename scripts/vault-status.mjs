#!/usr/bin/env node
/**
 * ĐO TRẠNG THÁI THẬT rồi TỰ GHI vào trang chủ vault.
 *
 * Vì sao có file này (12/08): một agent đọc-thử kiểm 4 con số trên trang chủ
 * vault thì 3 SAI ("66 migration" khi thật ra 77, "~50 tính năng" khi sổ ghi
 * 55). Gốc bệnh là con số được GÕ TAY rồi không ai cập nhật. Số sai làm người
 * đọc mất tin vào cả những chỗ đúng.
 *
 * Cách chữa đúng: KHÔNG gõ số nữa — đo bằng máy rồi ghi đè vào khối đánh dấu
 * <!-- AUTO:TRANG-THAI:START --> ... <!-- AUTO:TRANG-THAI:END --> trên trang chủ.
 *
 * Chạy:  node scripts/vault-status.mjs          (đo + ghi vào vault)
 *        node scripts/vault-status.mjs --xem    (chỉ in ra, không ghi)
 *
 * Không có SUPABASE_DB_URL vẫn chạy được — phần cần CSDL sẽ ghi "chưa đo được"
 * thay vì chết, đúng nếp hai-chế-độ của cả dự án.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const VAULT = "C:/iFan.asia";
const TRANG_CHU = path.join(VAULT, "00 Trang chủ.md");
const CHI_XEM = process.argv.includes("--xem");

const MOC_DAU = "<!-- AUTO:TRANG-THAI:START -->";
const MOC_CUOI = "<!-- AUTO:TRANG-THAI:END -->";

/** Đếm file theo phần mở rộng, bỏ qua thư mục ẩn. */
function dem(dir, duoi) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.endsWith(duoi)).length;
}

function demSau(dir, loc, bo = []) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || bo.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += demSau(p, loc, bo);
    else if (loc(e.name)) n++;
  }
  return n;
}

// ---------- đo kho code ----------
const thuMucMigration = path.join(REPO, "supabase/migrations");
const dsMigration = existsSync(thuMucMigration)
  ? readdirSync(thuMucMigration).filter((f) => f.endsWith(".sql")).sort()
  : [];
const soMigration = dsMigration.length;
// Tên file dạng 20260812000079_ten.sql — tiền tố 14 số = YYYYMMDD + 6 số thứ tự;
// "số hiệu nội bộ" (#79) là 2 chữ số CUỐI của tiền tố, tức chỉ số 12–13.
// (Bản đầu viết slice(14,16) → ra "_p" vô nghĩa; bắt được vì CHẠY THẬT rồi đọc
// output, không phải vì đọc lại code.)
const soHieuMoiNhat = dsMigration.at(-1)?.slice(12, 14)?.replace(/^0/, "") ?? "—";

const soADR = dem(path.join(REPO, "docs/adr"), ".md");
const soTheDesign = dem(path.join(REPO, "design-system"), ".html");

// đọc số CHẠY THẬT từ chính sổ sự thật (nguồn sự thật, không tự đếm lại)
let chayThat = "—";
let lapSan = "—";
let motPhan = "—";
const soThat = path.join(REPO, "docs/SU-THAT-SAN-PHAM.md");
if (existsSync(soThat)) {
  const t = readFileSync(soThat, "utf8");
  chayThat = t.match(/\|\s*CHẠY THẬT\s*\|\s*(\d+)/)?.[1] ?? "—";
  lapSan = t.match(/\|\s*LẮP SẴN CHỜ BÊN NGOÀI\s*\|\s*(\d+)/)?.[1] ?? "—";
  motPhan = t.match(/\|\s*MỘT PHẦN\s*\|\s*(\d+)/)?.[1] ?? "—";
}

// ---------- đo vault ----------
const soFileVault = demSau(VAULT, (f) => f.endsWith(".md"));

// ---------- đo CSDL (tuỳ chọn) ----------
let dongCsdl = "- **Người dùng thật:** chưa đo được ở lần chạy này (thiếu đường nối CSDL).";
// Số việc chạy nền phải lấy từ CSDL THẬT (bảng cron.job), không đếm qua đọc
// migration: migration có thể unschedule/đổi tên, đếm text sẽ ra số ma.
let soCron = "—";
const DB_URL = process.env.SUPABASE_DB_URL ?? (() => {
  const p = path.join(REPO, ".env.local");
  if (!existsSync(p)) return null;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^SUPABASE_DB_URL=(.*)$/);
    if (m) return m[1].trim();
  }
  return null;
})();

if (DB_URL) {
  try {
    const pg = (await import("pg")).default;
    const ca = path.join(REPO, "supabase/supabase-ca.crt");
    const c = new pg.Client({
      connectionString: DB_URL,
      ssl: { ca: readFileSync(ca, "utf8"), rejectUnauthorized: true },
    });
    await c.connect();
    const r = await c.query(`
      select
        (select count(*) from public.tenants where is_sample is not true and deleted_at is null) as tiem_that,
        (select count(*) from public.tenants where is_sample) as tiem_mau,
        (select count(*) from public.contacts where deleted_at is null) as khach,
        (select count(*) from public.saved_views where user_id is not null) as chip,
        (select count(*) from public.bulk_operations) as hang_loat,
        (select count(*) from public.help_requests) as can_giup`);
    const d = r.rows[0];
    const rc = await c.query(`select count(*)::int as n from cron.job`);
    soCron = String(rc.rows[0].n);
    await c.end();
    dongCsdl =
      `- **Người dùng thật: ${d.tiem_that} tiệm thật / ${d.tiem_mau} tiệm mẫu**, ${d.khach} khách trong CSDL. ` +
      `⚠️ **Chưa có khách trả tiền nào** — đây là nút thắt lớn nhất, không phải thiếu tính năng.\n` +
      `- **4 số đo sống của V1b (điều kiện mở cổng V2):** chip tự lưu ${d.chip} · lượt hàng loạt ${d.hang_loat} · yêu cầu "Cần giúp?" ${d.can_giup} → ` +
      `**CHƯA ĐO** (số hiện có do đội ngũ tự tạo khi kiểm thử, không phải hành vi người dùng thật).`;
  } catch (e) {
    dongCsdl = `- **Người dùng thật:** chưa đo được (${String(e.message).slice(0, 60)}).`;
  }
}

// ---------- dựng khối ----------
const homNay = new Date().toISOString().slice(0, 10).split("-").reverse().join("/");
const khoi = `${MOC_DAU}
*Khối này do máy tự đo và tự ghi — **cấm sửa tay**. Cập nhật bằng: \`node scripts/vault-status.mjs\` (trong kho code). Đo lúc: ${homNay}.*

- **Tính năng: ${chayThat} CHẠY THẬT · ${lapSan} lắp sẵn chờ bên ngoài · ${motPhan} một phần.** Chi tiết từng mục: \`docs/SU-THAT-SAN-PHAM.md\` — sổ đó mới là nguồn sự thật.
- **Nền kỹ thuật:** ${soMigration} migration có sổ (mới nhất #${soHieuMoiNhat}) · ${soCron} việc chạy nền trong CSDL · ${soADR} quyết định kiến trúc (ADR) · ${soTheDesign} thẻ design.
- **Vault:** ${soFileVault} file chữ — nhưng chỉ **4 file là LUẬT** (xem bảng bên dưới).
${dongCsdl}
${MOC_CUOI}`;

if (CHI_XEM) {
  console.log(khoi);
  process.exit(0);
}

if (!existsSync(TRANG_CHU)) {
  console.error("Không tìm thấy trang chủ vault:", TRANG_CHU);
  process.exit(1);
}
const cu = readFileSync(TRANG_CHU, "utf8");
if (!cu.includes(MOC_DAU) || !cu.includes(MOC_CUOI)) {
  console.error("Trang chủ thiếu mốc AUTO:TRANG-THAI — chưa ghi được. Thêm 2 dòng mốc rồi chạy lại.");
  process.exit(1);
}
const moi = cu.replace(
  new RegExp(`${MOC_DAU}[\\s\\S]*?${MOC_CUOI}`),
  khoi.replace(/\$/g, "$$$$"),
);
if (moi === cu) {
  console.log("Số liệu không đổi — không ghi lại.");
} else {
  writeFileSync(TRANG_CHU, moi, "utf8");
  console.log("Đã cập nhật khối trạng thái trên trang chủ vault.");
}
console.log(khoi);
