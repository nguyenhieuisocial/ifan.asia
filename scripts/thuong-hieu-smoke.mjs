/**
 * CỔNG: thương hiệu tiệm (#334) đúng luật, và KHÔNG mở đường ra kho tệp.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NGUY HIỂM LỚN NHẤT CỦA MẢNG NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Cách hiển nhiên để hiện logo là mở kho `tenant-files` thành công khai. Kho đó
 * đang chứa CHUNG **ảnh chụp mặt nhân viên lúc chấm công** và **tệp đính kèm
 * chat nội bộ của mọi tiệm**. Mở nó ra để lấy được cái logo là mở luôn hai thứ
 * kia cho cả internet.
 *
 * ⇒ Ảnh đi qua `/api/logo/<tiệm>`, nơi máy chủ TỰ TRA đường dẫn. Người gọi
 *   không bao giờ được đưa đường dẫn. Cổng này canh đúng chỗ đó.
 *
 * BỐN LUẬT:
 * ① Kho tệp KHÔNG được công khai.
 * ② `logo_url` chỉ được trỏ vào thư mục thương hiệu của CHÍNH tiệm đó.
 * ③ Chỉ chủ tiệm và quản trị đổi được — quản lý thì không.
 * ④ Hàm công khai KHÔNG trả đường dẫn tệp, và không trả thứ gì ngoài ba trường
 *   đã khai (không gói cước, không mã số thuế, không số tài khoản ngân hàng).
 *
 * ⚠️ CÓ THÁO CHỐT: `THAO_CHOT=mau-tu-do` bỏ danh sách tám màu ⇒ ca "màu ngoài
 *   danh sách bị từ chối" PHẢI ĐỎ.
 *
 * Chạy: node scripts/thuong-hieu-smoke.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { themThanhVien } from "./ho-tro/tu-cach-thanh-vien.mjs";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split("\n")) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL.");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();

let n = 0;
let fail = 0;
const check = (ten, ok, chiTiet = "") => {
  n++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${n} ${ten}${ok ? "" : " — " + chiTiet}`);
  if (!ok) fail++;
};

let spN = 0;
const thu = async (fn) => {
  const sp = `sp_th_${++spN}`;
  await c.query(`savepoint ${sp}`);
  try {
    const v = await fn();
    await c.query(`release savepoint ${sp}`);
    return { ok: true, v };
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    return { ok: false, e: e.message };
  }
};

const nhuNguoi = async (uid, claims, fn) => {
  await c.query(
    `select set_config('request.jwt.claims',$1,true), set_config('role','authenticated',true)`,
    [JSON.stringify({ sub: uid, role: "authenticated", app_metadata: claims })],
  );
  try {
    return await fn();
  } finally {
    await c.query(`select set_config('role','postgres',true)`);
  }
};

const THAO_CHOT = process.env.THAO_CHOT ?? "";

// ── ① Kho tệp KHÔNG được công khai ──────────────────────────────────
// Đây là ca quan trọng nhất trong tệp này. Nó không kiểm mã của mảng thương
// hiệu — nó kiểm rằng KHÔNG AI, vì bất kỳ lý do gì, mở kho đó ra.
{
  const { rows } = await c.query(
    `select id, public from storage.buckets where id = 'tenant-files'`,
  );
  check(
    "① kho tệp `tenant-files` KHÔNG công khai (chứa cả ảnh chấm công và tệp chat)",
    rows.length === 1 && rows[0].public === false,
    JSON.stringify(rows),
  );
}

await c.query("begin");
try {
  if (THAO_CHOT === "mau-tu-do") {
    await c.query(
      `alter table public.tenants drop constraint if exists tenants_mau_thuong_hieu_hop_le`,
    );
    console.log('⚠️ ĐANG THÁO CHỐT "mau-tu-do" — ca màu ngoài danh sách PHẢI ĐỎ.');
  }

  const st = Date.now();
  const uChu = randomUUID();
  const uQL = randomUUID();
  await c.query(
    `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
    [uChu, `th-chu-${st}@t.local`, uQL, `th-ql-${st}@t.local`],
  );
  const { rows: [t] } = await c.query(
    `insert into public.tenants (name, slug) values ('Tiem thuong hieu', $1) returning id`,
    [`th-${st % 1e8}`]);
  await themThanhVien(c, t.id, uChu, "owner");
  await themThanhVien(c, t.id, uQL, "manager");

  const CHU = { tenant_id: t.id, role: "owner" };
  const QL = { tenant_id: t.id, role: "manager" };

  // ── ③ Chỉ chủ tiệm và quản trị đổi được ───────────────────────────
  await nhuNguoi(uQL, QL, async () => {
    const { rows: [r] } = await c.query(
      `select public.dat_thuong_hieu(null, 'tim') j`);
    check("③ quản lý KHÔNG đổi được thương hiệu",
      r.j.ok === false && r.j.ly_do === "forbidden", JSON.stringify(r.j));
  });
  await nhuNguoi(uChu, CHU, async () => {
    const { rows: [r] } = await c.query(
      `select public.dat_thuong_hieu(null, 'xanh-ngoc') j`);
    check("③ chủ tiệm đổi được màu", r.j.ok === true, JSON.stringify(r.j));
  });

  // ── Màu ngoài danh sách tám màu ⇒ từ chối ─────────────────────────
  await nhuNguoi(uChu, CHU, async () => {
    const { rows: [r] } = await c.query(
      `select public.dat_thuong_hieu(null, '#ffff00') j`);
    check("màu ngoài danh sách ⇒ bị từ chối",
      r.j.ok === false && r.j.ly_do === "mau_khong_hop_le", JSON.stringify(r.j));
  });

  // ── ② `logo_url` chỉ trỏ vào thư mục của chính tiệm ───────────────
  // Chốt nằm ở TẦNG WEB (`actions.ts`) và LẶP LẠI ở đường phát ảnh
  // (`/api/logo/<tiệm>`). Ở đây kiểm chốt thứ hai — chốt cuối cùng, cái vẫn
  // giữ được kể cả khi tầng web bị đi vòng.
  const nguon = readFileSync(path.join(GOC, "app", "api", "logo", "[slug]", "route.ts"), "utf8");
  check(
    "② đường phát ảnh tự kiểm đường dẫn thuộc đúng tiệm",
    nguon.includes("/thuong-hieu/") && /startsWith\(/.test(nguon),
    "không thấy chốt `startsWith(<mã tiệm>/thuong-hieu/)` trong route.ts",
  );
  check(
    "② đường phát ảnh KHÔNG nhận đường dẫn từ người gọi",
    !/searchParams|req\.url|\bbody\b/.test(nguon),
    "route.ts có đọc tham số từ người gọi — xem lại",
  );

  // ── ④ Hàm công khai trả ĐÚNG ba trường ────────────────────────────
  await c.query(
    `update public.tenants set logo_url = $2, mau_thuong_hieu = 'tim' where id = $1`,
    [t.id, `${t.id}/thuong-hieu/abc.png`],
  );
  const { rows: [slug] } = await c.query(`select slug from public.tenants where id = $1`, [t.id]);
  const { rows: [ck] } = await c.query(
    `select public.thuong_hieu_cong_khai($1) j`, [slug.slug]);
  const khoa = Object.keys(ck.j ?? {}).sort();
  check(
    "④ hàm công khai trả ĐÚNG ba trường (tên · có logo · màu)",
    JSON.stringify(khoa) === JSON.stringify(["co_logo", "mau", "ten"]),
    JSON.stringify(ck.j),
  );
  check(
    "④ hàm công khai KHÔNG trả đường dẫn tệp",
    !JSON.stringify(ck.j).includes("thuong-hieu/"),
    JSON.stringify(ck.j),
  );
  check("④ `co_logo` đúng là true khi có logo", ck.j?.co_logo === true, JSON.stringify(ck.j));

  // Tiệm đã tắt ⇒ không còn thương hiệu hiện ra ở đâu.
  await c.query(`update public.tenants set status = 'suspended' where id = $1`, [t.id]);
  const { rows: [tat] } = await c.query(
    `select public.thuong_hieu_cong_khai($1) j`, [slug.slug]);
  check("tiệm đang tắt ⇒ hàm công khai trả rỗng",
    JSON.stringify(tat.j) === "{}", JSON.stringify(tat.j));

  // ── Bảng tám màu trong mã và trong CSDL PHẢI KHỚP ─────────────────
  // Lệch nhau thì màn hiện một màu mà cơ sở dữ liệu từ chối — người dùng bấm
  // Lưu và nhận một lời từ chối vô nghĩa.
  const ts = readFileSync(path.join(GOC, "lib", "thuong-hieu.ts"), "utf8");
  const trongMa = [...ts.matchAll(/^\s*"([a-z-]+)",$/gm)].map((m) => m[1]).sort();
  const { rows: [rb] } = await c.query(
    `select pg_get_constraintdef(oid) d from pg_constraint
      where conname = 'tenants_mau_thuong_hieu_hop_le'`);
  const trongDb = [...(rb?.d ?? "").matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
  check(
    "bảng tám màu trong mã KHỚP với danh sách trong CSDL",
    trongMa.length === 8 && JSON.stringify(trongMa) === JSON.stringify(trongDb),
    `mã: ${trongMa.join(",")} | CSDL: ${trongDb.join(",")}`,
  );
  // ── Phiếu hỏi ý kiến cũng mang màu tiệm (#335) ────────────────────
  // Cùng một tiệm gửi cho khách hai trang hai màu khác nhau là lỗi dễ sót
  // nhất của mảng này: mỗi trang nằm một tệp, và mỗi tệp quên một chỗ.
  await c.query(`update public.tenants set status = 'active' where id = $1`, [t.id]);
  const { rows: [ham] } = await c.query(
    `select pg_get_functiondef(oid) d from pg_proc
      where proname = 'get_survey_info' and pronamespace = 'public'::regnamespace`);
  check(
    "phiếu hỏi ý kiến đọc được màu thương hiệu",
    (ham?.d ?? "").includes("mau_thuong_hieu"),
    "hàm get_survey_info chưa trả mã màu",
  );

  // ── KHÔNG còn nút nào trên trang khách nhìn dùng màu iFan ─────────
  // Đây là ca bắt đúng lỗi đã gặp: bản đầu đổi màu hai nút đầu trang mà quên
  // nút "Gửi" trong biểu mẫu, ra một trang xanh ngọc với đúng MỘT nút cam.
  const TRANG_KHACH = [
    ["app", "t", "[slug]", "page.tsx"],
    ["app", "t", "[slug]", "lead-form.tsx"],
    ["app", "t", "[slug]", "dat-lich", "booking-flow.tsx"],
    ["app", "survey", "[token]", "survey-form.tsx"],
  ];
  const sot = TRANG_KHACH.filter((d) =>
    /bg-primary/.test(readFileSync(path.join(GOC, ...d), "utf8")),
  ).map((d) => d[d.length - 1]);
  check(
    "không nút nào trên trang khách nhìn còn dùng màu iFan",
    sot.length === 0,
    sot.join(", "),
  );
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(
  fail === 0
    ? `[thuong-hieu-smoke] ${n}/${n} PASS — kho tệp vẫn kín, ảnh chỉ ra qua đường có chốt, chỉ chủ tiệm đổi được, màu ngoài danh sách bị chặn.`
    : `[thuong-hieu-smoke] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
);
process.exit(fail === 0 ? 0 : 1);
