/**
 * CỔNG: thử nghiệm A/B (#336) — và nhất là chỗ nó phải BIẾT NÓI KHÔNG.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CỔNG NÀY TỒN TẠI
 * ═══════════════════════════════════════════════════════════════════
 * Giá trị của mảng A/B ở iFan KHÔNG nằm ở chỗ chia nhánh — chia nhánh thì dễ.
 * Nó nằm ở chỗ màn TỪ CHỐI tuyên bố bên nào thắng khi chưa đủ số. Công cụ A/B
 * phổ biến hay tô xanh bên đang dẫn ngay từ ngày đầu; ở lưu lượng nhỏ của iFan
 * thì chênh lệch ngày đầu gần như luôn là may rủi, và người đọc sẽ sửa cả trang
 * theo một con số vô nghĩa.
 *
 * ⇒ Phần lớn ca ở đây gieo số liệu giả rồi soi ĐÚNG một thứ: `ket_luan_duoc`
 *   có bật đúng lúc không, và có TẮT đúng lúc không.
 *
 * NĂM LUẬT:
 * ① Chưa đủ 14 NGÀY ⇒ không kết luận, dù số lượt đã rất nhiều.
 * ② Chưa đủ 300 LƯỢT mỗi bên ⇒ không kết luận, dù đã chạy rất lâu.
 * ③ Đủ ngày, đủ lượt, nhưng CHÊNH LỆCH NHỎ ⇒ vẫn không kết luận.
 * ④ Đủ cả ba ⇒ mới kết luận, và chỉ đúng bên thật sự hơn.
 * ⑤ Một trang chỉ một thử nghiệm đang chạy; chỉ chủ SaaS tạo được.
 *
 * ⚠️ CÓ THÁO CHỐT: `THAO_CHOT=ket-luan-som` bỏ điều kiện đủ ngày/đủ lượt ⇒ ca
 *   ① và ② PHẢI ĐỎ. Ca ③ vẫn xanh, và ĐÚNG là phải vậy: nó dựa vào ngưỡng may
 *   rủi — thứ mà phép tháo chốt này không đụng tới. Một cổng xanh không phân
 *   biệt được với một cổng không kiểm gì.
 *
 * Chạy: node scripts/thu-nghiem-ab-smoke.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const sp = `sp_ab_${++spN}`;
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

const nhuNguoi = async (uid, fn) => {
  await c.query(
    `select set_config('request.jwt.claims',$1,true), set_config('role','authenticated',true)`,
    [JSON.stringify({ sub: uid, role: "authenticated" })],
  );
  try {
    return await fn();
  } finally {
    await c.query(`select set_config('role','postgres',true)`);
  }
};

const THAO_CHOT = process.env.THAO_CHOT ?? "";

await c.query("begin");
try {
  if (THAO_CHOT === "ket-luan-som") {
    // ⚠️ VÁ TỪ ĐỊNH NGHĨA ĐANG CHẠY, KHÔNG VÁ TỪ TỆP BẢN VÁ CŨ.
    //   Bản đầu đọc thẳng tệp `#336`. Bản vá `#337` sau đó sửa chính hàm này
    //   (đổi `current_date` sang giờ Việt Nam) — nên phép tháo chốt dựng lại
    //   một phiên bản CŨ, và ca ① xanh oan vì hàm cũ đọc nhầm ngày chứ không
    //   phải vì chốt còn nguyên. Đọc từ cơ sở dữ liệu thì nó tự đúng mãi mãi.
    const { rows: [dn] } = await c.query(
      `select pg_get_functiondef(oid) d from pg_proc
        where proname = 'admin_ket_qua_thu_nghiem' and pronamespace = 'public'::regnamespace`,
    );
    const truoc = dn.d;
    const sau = truoc.replace(
      /'ket_luan_duoc',[\s\S]*?>= 1\.96,/,
      "'ket_luan_duoc', coalesce(z.diem_z, 0) >= 1.96,",
    );
    if (sau === truoc) {
      console.error("❌ Tháo chốt KHÔNG khớp chỗ nào — phép tháo chốt hỏng, không phải mã hỏng.");
      process.exit(2);
    }
    await c.query(sau);
    console.log('⚠️ ĐANG THÁO CHỐT "ket-luan-som" — ca ① và ② PHẢI ĐỎ.');
  }

  // ── Dựng một chủ SaaS thật để gọi các hàm quản trị ────────────────
  const uAdmin = randomUUID();
  await c.query(
    `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
    [uAdmin, `ab-admin-${Date.now()}@t.local`],
  );
  await c.query(`insert into public.platform_admins (user_id) values ($1)`, [uAdmin]);

  const uThuong = randomUUID();
  await c.query(
    `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
    [uThuong, `ab-thuong-${Date.now()}@t.local`],
  );

  // ── ⑤ Chỉ chủ SaaS tạo được ───────────────────────────────────────
  await nhuNguoi(uThuong, async () => {
    const { rows: [r] } = await c.query(
      `select public.admin_dat_thu_nghiem('ab-thu','/','Cau A','Cau B') j`);
    check("⑤ người thường KHÔNG tạo được thử nghiệm",
      r.j.ok === false && r.j.ly_do === "forbidden", JSON.stringify(r.j));
    const { rows: [d] } = await c.query(`select public.admin_thu_nghiem() j`);
    check("⑤ người thường đọc danh sách ⇒ RỖNG", JSON.stringify(d.j) === "[]", JSON.stringify(d.j));
  });

  await nhuNguoi(uAdmin, async () => {
    const { rows: [r] } = await c.query(
      `select public.admin_dat_thu_nghiem('ab-thu','/','Dang ky mien phi','Dung thu 14 ngay') j`);
    check("⑤ chủ SaaS tạo được", r.j.ok === true, JSON.stringify(r.j));
  });

  // ── ⑤ Một trang chỉ một thử nghiệm đang chạy ──────────────────────
  await nhuNguoi(uAdmin, async () => {
    const { rows: [r] } = await c.query(
      `select public.admin_dat_thu_nghiem('ab-thu-2','/','X','Y') j`);
    check("⑤ trang đã có thử nghiệm ⇒ không tạo thêm được",
      r.j.ok === false && r.j.ly_do === "trang_da_co_thu_nghiem", JSON.stringify(r.j));
  });

  // ── Luân phiên theo ngày: CẢ TRANG cùng một câu, và ổn định ────────
  const lan = [];
  for (let i = 0; i < 5; i++) {
    const { rows: [r] } = await c.query(`select public.thu_nghiem_hom_nay('/') j`);
    lan.push(r.j.bien_the);
  }
  check(
    "gọi 5 lần trong cùng một ngày ⇒ CÙNG một nhánh",
    new Set(lan).size === 1 && (lan[0] === "a" || lan[0] === "b"),
    lan.join(","),
  );
  const { rows: [hn] } = await c.query(`select public.thu_nghiem_hom_nay('/') j`);
  check(
    "câu trả về khớp đúng nhánh của hôm nay",
    hn.j.cau === (hn.j.bien_the === "a" ? "Dang ky mien phi" : "Dung thu 14 ngay"),
    JSON.stringify(hn.j),
  );
  const { rows: [kh] } = await c.query(`select public.thu_nghiem_hom_nay('/tinh-nang') j`);
  check("trang không có thử nghiệm ⇒ trả rỗng", JSON.stringify(kh.j) === "{}", JSON.stringify(kh.j));

  // ── Gieo số liệu giả để soi luật kết luận ─────────────────────────
  const gieo = async (ngayTruoc, nhanh, xem, bam) => {
    await c.query(
      // ⚠️ `public.ngay_vn()`, KHÔNG `current_date`. Bảng đếm ghi theo ngày Việt
      //   Nam (#337), mà `bat_dau` của thử nghiệm cũng vậy — gieo bằng giờ quốc
      //   tế thì dòng rơi ra NGOÀI khoảng đọc và mọi con số về 0. Đã dính đúng
      //   vậy: ca "tháo chốt" vẫn xanh vì hàm đọc chẳng thấy dòng nào.
      `insert into public.luot_cong_khai (ngay, duong_dan, loai, bien_the, so)
       values (public.ngay_vn() - $1::int, '/', 'xem', $2, $3),
              (public.ngay_vn() - $1::int, '/', 'bam-dang-ky', $2, $4)
       on conflict (ngay, duong_dan, loai, bien_the)
       do update set so = public.luot_cong_khai.so + excluded.so`,
      [ngayTruoc, nhanh, xem, bam],
    );
  };
  const doc = async () => {
    const { rows: [r] } = await c.query(`select public.admin_ket_qua_thu_nghiem('ab-thu') j`);
    return r.j;
  };

  // ① Rất nhiều lượt, chênh lệch rất lớn, nhưng MỚI CHẠY 1 NGÀY.
  await gieo(0, "a", 5000, 50);
  await gieo(0, "b", 5000, 300);
  let k = await nhuNguoi(uAdmin, doc);
  check(
    "① chưa đủ 14 ngày ⇒ KHÔNG kết luận, dù lượt rất nhiều và chênh rất lớn",
    k.ket_luan_duoc === false && k.du_ngay === false,
    JSON.stringify({ ngay: k.so_ngay, du_ngay: k.du_ngay, ket: k.ket_luan_duoc }),
  );

  // ② Đủ ngày nhưng ÍT LƯỢT.
  await c.query(
    `update public.thu_nghiem_ab set bat_dau = public.ngay_vn() - 30 where khoa = 'ab-thu'`);
  await c.query(`delete from public.luot_cong_khai where duong_dan = '/'`);
  await gieo(1, "a", 100, 1);
  await gieo(1, "b", 100, 20);
  k = await nhuNguoi(uAdmin, doc);
  check(
    "② chưa đủ 300 lượt mỗi bên ⇒ KHÔNG kết luận, dù đã chạy 30 ngày",
    k.ket_luan_duoc === false && k.du_luot === false && k.con_thieu === 200,
    JSON.stringify({ xem_a: k.xem_a, du_luot: k.du_luot, thieu: k.con_thieu }),
  );

  // ③ Đủ ngày, đủ lượt, nhưng HAI BÊN SÁT NHAU.
  await c.query(`delete from public.luot_cong_khai where duong_dan = '/'`);
  await gieo(1, "a", 1000, 30);
  await gieo(1, "b", 1000, 32);
  k = await nhuNguoi(uAdmin, doc);
  check(
    "③ đủ ngày đủ lượt nhưng chênh lệch nhỏ ⇒ VẪN không kết luận",
    k.ket_luan_duoc === false && k.du_ngay === true && k.du_luot === true,
    JSON.stringify({ ti_a: k.ti_a, ti_b: k.ti_b, ket: k.ket_luan_duoc }),
  );

  // ④ Đủ cả ba ⇒ kết luận, và đúng bên.
  await c.query(`delete from public.luot_cong_khai where duong_dan = '/'`);
  await gieo(1, "a", 3000, 60);
  await gieo(1, "b", 3000, 150);
  k = await nhuNguoi(uAdmin, doc);
  check(
    "④ đủ cả ba điều kiện ⇒ kết luận được",
    k.ket_luan_duoc === true,
    JSON.stringify({ ti_a: k.ti_a, ti_b: k.ti_b, ket: k.ket_luan_duoc }),
  );
  check("④ và chỉ đúng bên thật sự hơn", k.ben_hon === "b", JSON.stringify(k.ben_hon));

  // ── Trình duyệt KHÔNG tự khai được nhánh ──────────────────────────
  // Chốt nằm ở tầng web (`/api/luot`): nó tự tra nhánh, không đọc từ thân tin.
  const route = readFileSync(path.join(GOC, "app", "api", "luot", "route.ts"), "utf8");
  check(
    "trình duyệt không tự khai được nhánh thử nghiệm",
    route.includes("thu_nghiem_hom_nay") && !/bienThe/.test(route),
    "route.ts vẫn đọc `bienThe` từ thân tin — số liệu A/B bịa được",
  );
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(
  fail === 0
    ? `[thu-nghiem-ab-smoke] ${n}/${n} PASS — luân phiên ổn định, và màn từ chối kết luận đúng ba chỗ phải từ chối.`
    : `[thu-nghiem-ab-smoke] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
);
process.exit(fail === 0 ? 0 : 1);
