#!/usr/bin/env node
/**
 * Cổng canh "INSERT QUÊN KHAI TIỆM" — lỗi thiếu dữ liệu ĐỘI LỐT lỗi thiếu quyền.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ CỔNG NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Đo trên CSDL 20/08: **119 bảng** khai `tenant_id not null`, KHÔNG default,
 * và KHÔNG bảng nào có trigger điền hộ. Lệnh ghi quên truyền `tenant_id` thì
 * Postgres từ chối — nhưng **không lần nào** báo 23502 "null value in column",
 * tức không lần nào nói đúng chuyện "thiếu cột". Đo đóng vai trên hai bảng của
 * Két sắt, ra hai mã khác hẳn nhau và cả hai đều đánh lạc hướng:
 *   · `shift_closings` → **42501 "row-level security"**, vì Postgres xét
 *     `with check` của RLS TRƯỚC ràng buộc not-null ⇒ "Không có quyền".
 *   · `supplier_payments` → **23514** từ trigger `supplier_payments_tenant_guard`
 *     (trigger BEFORE chạy trước cả RLS; thấy `new.tenant_id` NULL nên kêu
 *     *"nhà cung cấp thuộc tiệm khác"*) ⇒ người dùng đi soát nhà cung cấp.
 *
 * ⇒ Lỗi THIẾU DỮ LIỆU luôn đội lốt một lỗi khác. Người dùng đi soát phân quyền
 * hoặc soát dữ liệu tham chiếu, và không bao giờ tới được chỗ sai thật.
 *
 * Lớp bệnh này đã cắn TRỌN từng mảng một, mỗi lần đều im lặng:
 *   · `app/app/team/actions.ts` · `app/app/payroll/actions.ts` (lần 1-2)
 *   · Hợp đồng & Gói định kỳ — 3 hàm ghi đều thiếu ⇒ **0 gói · 0 hợp đồng ·
 *     0 buổi** trên toàn CSDL (lần 3, vá 20/08)
 *   · Két sắt — `chotSoCa` + `ghiThanhToanNCC` ⇒ **0/0 dòng**, cả hai nút ghi
 *     của mảng đều chết (lần 4, vá 20/08)
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI LÀ CỔNG CHẠY ĐƯỢC, KHÔNG PHẢI LỜI DẶN
 * ═══════════════════════════════════════════════════════════════════
 * `app/app/contracts/actions.ts` ĐÃ ghi sẵn khối cảnh báo dài cho đúng lỗi
 * này. Két sắt viết CÙNG ĐỢT (V5 / ADR-0022), file ngay bên cạnh, header lại
 * kết luận NGƯỢC: *"RLS đủ, tầng này không siết thêm"*. Chú thích trong một
 * file không cứu được file bên cạnh — bài học phải thành PHÉP KIỂM.
 *
 * ═══════════════════════════════════════════════════════════════════
 * HAI LUẬT
 * ═══════════════════════════════════════════════════════════════════
 *  LUẬT 1 — mã ứng dụng (`app/**`, `lib/**`): mọi `.insert()` / `.upsert()`
 *    vào bảng thuộc danh sách trên PHẢI có `tenant_id` trong đối số.
 *  LUẬT 2 — hàm CSDL đang chạy (đọc `pg_proc`, KHÔNG đọc file migration): mọi
 *    câu `insert into <bảng>` PHẢI khai `tenant_id` trong danh sách cột.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ CẨN THẬN BÁO OAN — phép quét thô đã báo oan thật
 * ═══════════════════════════════════════════════════════════════════
 * Một đợt quét trước nghi sai `payslip_lines` và `stocktake_lines`: chúng CÓ
 * truyền `tenant_id`, nhưng nằm BÊN TRONG một biến mảng dựng trước đó
 * (`dongMoi`, `dongInsert`), nên phép khớp chuỗi thô không thấy. Vì thế cổng
 * này PHÂN GIẢI BIẾN: đối số là một tên biến thì đọc nơi khai biến đó cộng mọi
 * câu `<biến>.push(…)` trước chỗ ghi, và đòi MỌI khối có hình dạng bản ghi
 * (`{ … }`) đều mang `tenant_id` — một nhánh push quên là đỏ.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ CỔNG NÀY *KHÔNG* CHỨNG MINH ĐƯỢC GÌ — đọc kỹ phần này
 * ═══════════════════════════════════════════════════════════════════
 * Nó soát CHỮ trong mã nguồn, không chạy thử. Nó vẫn XANH khi:
 *  · `tenant_id` được truyền nhưng SAI GIÁ TRỊ (tiệm khác) — chuyện đó do RLS
 *    `with check` và các trigger `*_tenant_guard` chặn, không phải cổng này.
 *  · Bản ghi dựng bằng `{ ...row }` trải từ một biến ở file KHÁC.
 *  · Lệnh ghi đi qua một lớp bọc tự viết mà cổng không nhận ra hình dạng
 *    `.from(...).insert(...)`.
 * Nó cũng chỉ đọc `app/**` và `lib/**` — mã ở nơi khác không được canh.
 *
 * Chạy:  node scripts/soat-insert-thieu-tenant.mjs
 * Chỉ ĐỌC — không ghi, không mở giao dịch.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// ══════════════════════════════════════════════════════════════════════
// MIỄN TRỪ — chỗ CỐ Ý không truyền `tenant_id`
// ══════════════════════════════════════════════════════════════════════
// Miễn trừ là cửa hậu nên phải đắt (cùng khuôn `scripts/soat-loi-vao-mang.mjs`):
// mỗi dòng cần LÝ DO người không rành kỹ thuật đọc hiểu, và BẰNG CHỨNG ĐÃ ĐO —
// không nhận lý do suông kiểu "chỗ này chắc ổn". Khoá là "<đường dẫn>:<bảng>"
// cho luật 1, hoặc "<tên hàm CSDL>:<bảng>" cho luật 2.
//
// Lượt dựng cổng 20/08: **0 miễn trừ**. 92 lệnh ghi trong mã và 128 câu insert
// trong hàm CSDL đều truyền `tenant_id` sau khi vá Két sắt. Bảng rỗng ở đây là
// tin TỐT, không phải cơ chế thừa — chỗ đầu tiên cần nó sẽ là chỗ đầu tiên
// buộc người viết phải ghi ra bằng chứng.
const MIEN_TRU = {
  // Ví dụ khuôn (đang không dùng — xoá dòng này khi thêm miễn trừ thật):
  // "app/vi/du.ts:ten_bang": {
  //   viSao: "Câu người không rành kỹ thuật đọc hiểu — vì sao chỗ này KHÔNG cần khai tiệm.",
  //   daDo: "Phép đo đã chạy + kết quả, ví dụ: trigger `x_fill_tenant` điền hộ (đo trên CSDL 20/08).",
  // },
};

// ══════════════════════════════════════════════════════════════════════
// NỐI CSDL — TLS ghim CA, chỉ đọc
// ══════════════════════════════════════════════════════════════════════
const KET_NOI =
  (process.env.SUPABASE_DB_URL ??
    readFileSync(path.join(GOC, ".env.local"), "utf8")
      .match(/^SUPABASE_DB_URL=(.*)$/m)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "")) ?? "";
if (!KET_NOI) {
  console.error("Thiếu SUPABASE_DB_URL (biến môi trường hoặc .env.local).");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: KET_NOI,
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();
// Hạn chờ khoá — luật 1 của `scripts/soat-ky-luat-bo-kiem.mjs`.
await c.query("set lock_timeout = '10s'");

// ── Bảng nào BẮT BUỘC tự truyền tenant_id ────────────────────────────
// Điều kiện: cột `tenant_id` not null + KHÔNG default + KHÔNG trigger BEFORE
// INSERT nào GÁN `new.tenant_id`. Đọc thẳng lược đồ thật, không đọc migration.
const { rows: cotTenant } = await c.query(`
  select cl.relname as bang
    from pg_class cl
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = cl.oid and a.attname = 'tenant_id' and not a.attisdropped
    left join pg_attrdef d on d.adrelid = cl.oid and d.adnum = a.attnum
   where n.nspname = 'public' and cl.relkind = 'r' and a.attnotnull and d.adbin is null
   order by 1`);

// Trigger BEFORE INSERT có GÁN `new.tenant_id := …` ⇒ bảng đó được điền hộ.
// ⚠️ Phải là phép GÁN. Kho này có ~24 trigger `*_tenant_guard` NHẮC TỚI
// `new.tenant_id` nhưng chỉ để SO SÁNH (chặn khoá ngoại trỏ sang tiệm khác) —
// đếm chúng là "điền hộ" thì cổng bỏ lọt đúng 24 bảng. Đo 20/08: 0 bảng có
// trigger điền hộ thật.
const { rows: trgDien } = await c.query(`
  select cl.relname as bang, t.tgname as trigger, p.proname as ham
    from pg_trigger t
    join pg_class cl on cl.oid = t.tgrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_proc p on p.oid = t.tgfoid
   where n.nspname = 'public' and not t.tgisinternal
     and (t.tgtype & 2) <> 0 and (t.tgtype & 4) <> 0
     and p.prosrc ~* '(new\\.tenant_id|new\\."tenant_id")\\s*:='`);

const dienHo = new Map(trgDien.map((r) => [r.bang, `${r.trigger} → ${r.ham}()`]));
const CAN_TENANT = new Set(cotTenant.map((r) => r.bang).filter((b) => !dienHo.has(b)));

// ══════════════════════════════════════════════════════════════════════
// LUẬT 1 — mã ứng dụng
// ══════════════════════════════════════════════════════════════════════
const loi = [];
const bao = (luat, tieuDe, ...dong) => loi.push({ luat, tieuDe, dong });
const daDung = new Set(); // khoá miễn trừ thật sự được dùng

/** Gom mọi file .ts/.tsx dưới một cây thư mục. */
function gomFile(goc, acc = []) {
  for (const e of readdirSync(goc, { withFileTypes: true })) {
    const p = path.join(goc, e.name);
    if (e.isDirectory()) gomFile(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Bóc đối số CÂN NGOẶC bắt đầu tại dấu `(` ở vị trí i — bỏ qua ngoặc trong chuỗi. */
function canNgoac(src, i) {
  let sau = 0;
  let chuoi = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (chuoi) {
      if (ch === "\\") j++;
      else if (ch === chuoi) chuoi = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") chuoi = ch;
    else if ("([{".includes(ch)) sau++;
    else if (")]}".includes(ch) && --sau === 0) return src.slice(i + 1, j);
  }
  return src.slice(i + 1);
}

/** Đọc từ vị trí i tới hết CÂU LỆNH (dấu `;` ở tầng ngoài cùng). */
function hetCau(src, i) {
  let sau = 0;
  let chuoi = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (chuoi) {
      if (ch === "\\") j++;
      else if (ch === chuoi) chuoi = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") chuoi = ch;
    else if ("([{".includes(ch)) sau++;
    else if (")]}".includes(ch)) sau--;
    else if (ch === ";" && sau <= 0) return src.slice(i, j);
  }
  return src.slice(i);
}

/**
 * Đối số ĐẦU TIÊN (phần trước dấu phẩy ở tầng ngoài cùng) — đó mới là DÒNG GHI.
 * `.upsert(links, { onConflict: … })` có đối số thứ hai là tuỳ chọn, không phải
 * dữ liệu; đọc cả hai rồi kết luận là báo oan đúng chỗ `contact_tags`.
 */
function doiSoDau(s) {
  let sau = 0;
  let chuoi = null;
  for (let j = 0; j < s.length; j++) {
    const ch = s[j];
    if (chuoi) {
      if (ch === "\\") j++;
      else if (ch === chuoi) chuoi = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") chuoi = ch;
    else if ("([{".includes(ch)) sau++;
    else if (")]}".includes(ch)) sau--;
    else if (ch === "," && sau === 0) return s.slice(0, j);
  }
  return s;
}

/** `Buffer.from(x)` / `Array.from(x)` KHÔNG phải bảng CSDL. */
const KHONG_PHAI_BANG = new Set(["Array", "Buffer", "Object", "String", "Number", "Uint8Array", "Set", "Map", "Date"]);

/**
 * Đối số là MỘT tên biến ⇒ đọc nơi dựng biến đó: câu khai (`const x = …`) cộng
 * mọi `x.push(…)` đứng TRƯỚC chỗ ghi. Chỉ xét khối có hình dạng bản ghi (`{`) —
 * `const dongMoi = []` là bình chứa rỗng, không nói gì về nội dung.
 * Trả `null` khi không đọc được khối nào ⇒ gọi bên ngoài coi là đáng ngờ.
 *
 * ⚠️ Câu khai phải đọc TỚI HẾT CÂU, không phải tới hết cặp ngoặc đầu tiên:
 * `const dongInsert = (itemsRes.data ?? []).map((item) => { … })` mà chỉ lấy
 * `(itemsRes.data ?? [])` thì mất sạch phần dựng bản ghi ⇒ báo oan.
 */
function khoiDungBien(src, ten, truocViTri) {
  const khoi = [];
  const khai = new RegExp(`\\b(?:const|let|var)\\s+${ten}\\b[^=;]*=`, "g");
  let m;
  while ((m = khai.exec(src)) && m.index < truocViTri) {
    khoi.push(hetCau(src, m.index + m[0].length));
  }
  const push = new RegExp(`\\b${ten}\\.push\\s*\\(`, "g");
  while ((m = push.exec(src)) && m.index < truocViTri) {
    khoi.push(canNgoac(src, push.lastIndex - 1));
  }
  const coHinhDang = khoi.filter((k) => k.includes("{"));
  return coHinhDang.length > 0 ? coHinhDang : null;
}

const nguon = [...gomFile(path.join(GOC, "app")), ...gomFile(path.join(GOC, "lib"))];
let soLenhGhi = 0;
let soLenhCanhGac = 0;

/**
 * XOÁ CHÚ THÍCH TRƯỚC KHI QUÉT — thay bằng khoảng trắng CÙNG ĐỘ DÀI để số dòng
 * và vị trí ký tự không xê dịch (lời báo lỗi phải chỉ đúng dòng).
 *
 * ⚠️ VÌ SAO CÓ HÀM NÀY — đo 22/08. Cổng này báo 4 lệnh ghi "có thể quên khai
 *   tiệm" ở bốn tệp xuất dữ liệu. Soi ra: cả bốn đều là chữ `.upsert(` NẰM
 *   TRONG MỘT DÒNG CHÚ THÍCH — chú thích viết "cổng đó chỉ soát
 *   .update()/.delete()/.upsert(), không soát .rpc()". Cổng đọc chính lời giải
 *   thích về mình rồi báo động.
 *
 * ⚠️ BỐN LẦN BÁO NHẦM KHÔNG PHẢI CHUYỆN NHỎ. Cổng kêu oan là cổng sẽ bị tắt —
 *   và lúc đó nó không còn canh được lỗi thật nào nữa. Đây là lý do phải sửa
 *   ngay thay vì khai bốn dòng miễn trừ.
 *
 * ⚠️ Cố ý KHÔNG xử lý chuỗi có chứa `//`. Trong kho này chưa có ca nào như vậy
 *   ở gần một lệnh ghi; làm phức tạp hơn là mở đường cho một lỗi tinh vi hơn.
 */
function boChuThich(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (x) => x.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (x, dau) => dau + " ".repeat(x.length - dau.length));
}

for (const f of nguon) {
  const src = boChuThich(readFileSync(f, "utf8"));
  const rel = path.relative(GOC, f).split(path.sep).join("/");
  const re = /\.(insert|upsert)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    soLenhGhi++;
    const viTri = m.index;
    const dong = src.slice(0, viTri).split("\n").length;

    // Tên bảng = `.from(...)` gần nhất TRONG CÙNG CÂU LỆNH. Ranh giới câu là
    // dấu `;` hoặc `}` gần nhất — không có ranh giới thì một `Buffer.from()` ở
    // cách đó vài chục dòng cũng bị nhận nhầm làm tên bảng.
    const dau = Math.max(src.lastIndexOf(";", viTri), src.lastIndexOf("}", viTri)) + 1;
    const doan = src.slice(dau, viTri);
    const mf = [...doan.matchAll(/(?:([A-Za-z_$][\w$]*)\s*)?\.from\(\s*(?:["'`]([a-z0-9_]+)["'`]|([A-Za-z_$][\w$]*))\s*\)/g)].pop();
    const chuNha = mf?.[1] ?? "";
    const bang = mf && !KHONG_PHAI_BANG.has(chuNha) ? (mf[2] ?? null) : undefined;

    const doiSo = doiSoDau(canNgoac(src, viTri + m[0].length - 1)).trim();
    const coTenant = /\btenant_id\b/.test(doiSo);
    const khoa = `${rel}:${bang ?? "?"}`;

    // Tên bảng ĐỌC ĐƯỢC và không thuộc diện phải khai tiệm ⇒ bỏ qua.
    if (typeof bang === "string" && !CAN_TENANT.has(bang)) continue;

    // Không đọc được tên bảng (biến, hoặc không thấy `.from`). Truyền tenant_id
    // rồi thì thôi — còn không thì phải có người nhìn, không đoán hộ.
    if (bang === null || bang === undefined) {
      if (coTenant) continue;
      soLenhCanhGac++;
      if (MIEN_TRU[khoa]) {
        daDung.add(khoa);
        continue;
      }
      bao(
        1,
        `${rel}:${dong} — không đọc được tên bảng của lệnh .${m[1]}(), mà đối số cũng không có tenant_id`,
        `Đối số: ${doiSo.replace(/\s+/g, " ").slice(0, 120)}`,
        "Ghi vào bảng nào thì máy không biết ⇒ không dám kết luận là an toàn.",
        `SỬA: truyền thẳng \`tenant_id\`, hoặc khai "${khoa}" vào MIEN_TRU kèm lý do + bằng chứng đã đo.`,
      );
      continue;
    }

    soLenhCanhGac++;
    if (coTenant) continue;

    // Đối số là MỘT tên biến ⇒ phân giải trước khi kết tội (chống báo oan).
    if (/^[A-Za-z_$][\w$]*$/.test(doiSo)) {
      const khoi = khoiDungBien(src, doiSo, viTri);
      if (khoi && khoi.every((k) => /\btenant_id\b/.test(k))) continue;
      if (MIEN_TRU[khoa]) {
        daDung.add(khoa);
        continue;
      }
      bao(
        1,
        `${rel}:${dong} — ghi vào "${bang}" qua biến \`${doiSo}\` mà không thấy tenant_id`,
        khoi
          ? `${khoi.filter((k) => !/\btenant_id\b/.test(k)).length}/${khoi.length} khối dựng \`${doiSo}\` KHÔNG có tenant_id — một nhánh quên là dòng đó bị từ chối.`
          : `Không đọc được nơi dựng \`${doiSo}\` trong file này ⇒ không dám kết luận là an toàn.`,
        `SỬA: thêm \`tenant_id\` vào MỌI khối dựng \`${doiSo}\`, theo khuôn \`boiCanh()\` của app/app/contracts/actions.ts.`,
      );
      continue;
    }

    if (MIEN_TRU[khoa]) {
      daDung.add(khoa);
      continue;
    }
    bao(
      1,
      `${rel}:${dong} — ghi vào "${bang}" KHÔNG truyền tenant_id`,
      `Bảng "${bang}" khai tenant_id not null, không default, không trigger điền hộ.`,
      "Postgres sẽ từ chối, nhưng KHÔNG báo là thiếu cột: bảng thường ra 42501 \"row-level security\"",
      "(⇒ người dùng đọc ra \"Không có quyền\"), bảng có trigger chốt chéo tiệm ra 23514 kèm câu về khoá ngoại.",
      "SỬA: lấy tiệm đang mở rồi truyền vào, theo khuôn `boiCanh()` của app/app/contracts/actions.ts:",
      '  const ctx = await boiCanh(); if (!ctx.ok) return { error: ctx.error };',
      '  await ctx.supabase.from("' + bang + '").insert({ tenant_id: ctx.tenantId, … });',
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// LUẬT 2 — câu insert trong THÂN hàm CSDL đang chạy
// ══════════════════════════════════════════════════════════════════════
const { rows: hams } = await c.query(`
  select p.proname, p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc ~* 'insert\\s+into'
   order by 1`);

let soCauSql = 0;
for (const h of hams) {
  // `as uc` phải nằm trong khuôn: `insert into public.usage_counters as uc (tenant_id, …)`
  // là câu ĐÚNG, bỏ sót mệnh đề alias thì hai hàm đếm hạn mức bị báo oan.
  const re = /insert\s+into\s+(?:public\.)?"?([a-z0-9_]+)"?\s*(?:as\s+"?[a-z0-9_]+"?\s*)?(\(([^)]*)\))?/gi;
  let m;
  while ((m = re.exec(h.prosrc))) {
    const bang = m[1];
    if (!CAN_TENANT.has(bang)) continue;
    soCauSql++;
    if (/\btenant_id\b/.test(m[3] ?? "")) continue;
    const khoa = `${h.proname}:${bang}`;
    if (MIEN_TRU[khoa]) {
      daDung.add(khoa);
      continue;
    }
    bao(
      2,
      `hàm CSDL ${h.proname}() — câu insert vào "${bang}" không khai tenant_id`,
      m[2] ? `Danh sách cột: (${(m[3] ?? "").replace(/\s+/g, " ").slice(0, 120)})` : "Câu insert KHÔNG có danh sách cột ⇒ không kiểm được.",
      `SỬA: thêm cột \`tenant_id\` vào câu insert của hàm ${h.proname}(), hoặc khai "${khoa}" vào MIEN_TRU kèm bằng chứng.`,
    );
  }
}

await c.end();

// ── Miễn trừ thừa: dòng che một chỗ không còn tồn tại ────────────────
for (const khoa of Object.keys(MIEN_TRU)) {
  if (!daDung.has(khoa)) {
    bao(
      0,
      `MIEN_TRU còn dòng thừa "${khoa}"`,
      "Chỗ này không còn lệnh ghi nào cần miễn trừ (đã vá, hoặc đã xoá).",
      "SỬA: xoá dòng đó khỏi MIEN_TRU — miễn trừ ruỗng che mất chỗ thật sau này.",
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// KẾT
// ══════════════════════════════════════════════════════════════════════
if (loi.length === 0) {
  console.log(
    `✅ Không lệnh ghi nào quên khai tiệm: ${CAN_TENANT.size} bảng buộc tự truyền \`tenant_id\` ` +
      `(0 bảng có trigger điền hộ) · ${soLenhCanhGac}/${soLenhGhi} lệnh .insert/.upsert trong app+lib ` +
      `ghi vào những bảng đó · ${soCauSql} câu insert trong hàm CSDL · ` +
      `${Object.keys(MIEN_TRU).length} miễn trừ có lý do.`,
  );
  process.exit(0);
}

console.error(`❌ ${loi.length} lệnh ghi có thể quên khai tiệm:\n`);
for (const { luat, tieuDe, dong } of loi) {
  console.error(`  [LUẬT ${luat}] ${tieuDe}`);
  for (const d of dong) console.error(`      ${d}`);
  console.error("");
}
console.error("Vì sao chặn: thiếu `tenant_id` KHÔNG báo là thiếu cột — Postgres xét RLS trước,");
console.error("nên lỗi ra là \"row-level security\". Lớp bệnh này đã giết trọn 4 mảng trong im lặng.");
process.exit(1);
