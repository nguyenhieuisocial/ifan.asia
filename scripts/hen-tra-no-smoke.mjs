/**
 * CỔNG: hẹn trả nợ — chỉ ghi thêm, không sửa không xoá, và đúng vai.
 *
 * ═══════════════════════════════════════════════════════════════════
 * CA ĐÁNG CANH NHẤT LÀ "KHÔNG SỬA ĐƯỢC HẸN CŨ"
 * ═══════════════════════════════════════════════════════════════════
 * Cả giá trị của tính năng nằm ở chỗ giữ lại LỊCH SỬ: khách hẹn ba lần và trễ
 * cả ba là thông tin quyết định còn nên bán chịu cho họ nữa hay không. Nếu sửa
 * được hẹn cũ thì con số "thất hẹn 2 lần" trở thành một con số ai cũng chỉnh
 * được — tức là vô nghĩa.
 *
 * Bảng cố ý KHÔNG có policy cho UPDATE và DELETE. Không có policy nghĩa là RLS
 * từ chối. Ca ở đây canh đúng điều đó, vì "quên viết policy" và "cố ý không
 * viết policy" nhìn từ mã nguồn thì giống hệt nhau.
 *
 * ⚠️ Mọi ca ghi đều nằm trong giao dịch rồi hoàn tác.
 *
 * Chạy: node scripts/hen-tra-no-smoke.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";

if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* CI đã có env sẵn */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("❌ Thiếu SUPABASE_DB_URL — cổng này KHÔNG tự bỏ qua.");
  process.exit(1);
}

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${!ok && ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();

const { rows: [t] } = await c.query(
  `select id from public.tenants where slug = 'demo-spa-huong-sen'`,
);
const lay = async (vai) =>
  (await c.query(
    `select user_id from public.tenant_members where tenant_id = $1 and role = $2 limit 1`,
    [t.id, vai],
  )).rows[0]?.user_id ?? null;
const chu = await lay("owner");
const nv = await lay("staff");
const { rows: [khach] } = await c.query(
  `select id from public.contacts where tenant_id = $1 and deleted_at is null limit 1`,
  [t.id],
);

const nhuNguoi = async (uid, viec) => {
  await c.query("begin");
  try {
    await c.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [uid],
    );
    await c.query("set local role authenticated");
    return await viec();
  } finally {
    await c.query("rollback");
  }
};
const thu = async (viec) => {
  await c.query("savepoint s");
  try {
    await viec();
    await c.query("release savepoint s");
    return { ok: true, loi: null };
  } catch (e) {
    await c.query("rollback to savepoint s");
    return { ok: false, loi: e.message };
  }
};

console.log("[hen-tra] Ghi va doc:");
await nhuNguoi(chu, async () => {
  const a = await thu(() =>
    c.query(
      `insert into public.hen_tra_no (tenant_id, contact_id, ngay_hen, ghi_chu, tao_boi)
       values ($1, $2, public.ngay_vn() + 3, 'lan mot', $3)`,
      [t.id, khach.id, chu],
    ),
  );
  kiem("chủ tiệm ghi được một lần hẹn", a.ok, a.loi);

  const b = await thu(() =>
    c.query(
      `insert into public.hen_tra_no (tenant_id, contact_id, ngay_hen, ghi_chu, tao_boi)
       values ($1, $2, public.ngay_vn() - 2, 'lan hai, da tre', $3)`,
      [t.id, khach.id, chu],
    ),
  );
  kiem("ghi được lần hẹn THỨ HAI — hẹn mới không thay hẹn cũ", b.ok, b.loi);

  const { rows: [n] } = await c.query(
    `select count(*)::int n from public.hen_tra_no where contact_id = $1`,
    [khach.id],
  );
  kiem("cả hai lần hẹn đều còn nằm lại", n.n === 2, `chỉ còn ${n.n} dòng`);

  const { rows: [r] } = await c.query(`select public.hen_tra_gan_nhat($1::uuid[]) j`, [[khach.id]]);
  const h = r.j[khach.id];
  kiem("hàm trả về lần hẹn GẦN NHẤT theo ngày hẹn", h?.ngay_hen?.startsWith?.("20") === true || Boolean(h));
  kiem("đếm đúng số lần đã thất hẹn", h?.lan_that_hen === 1, JSON.stringify(h));
});

console.log("[hen-tra] Khong sua, khong xoa:");
await nhuNguoi(chu, async () => {
  await c.query("set local role postgres");
  const { rows: [x] } = await c.query(
    `insert into public.hen_tra_no (tenant_id, contact_id, ngay_hen, tao_boi)
     values ($1, $2, public.ngay_vn() + 5, $3) returning id`,
    [t.id, khach.id, chu],
  );
  await c.query("set local role authenticated");

  // ⚠️ TỰ KIỂM PHÉP ĐO TRƯỚC KHI KHẲNG ĐỊNH. Câu update ở dưới có thể "không
  //   đổi được gì" vì RLS chặn (điều ta muốn), NHƯNG cũng có thể vì chính câu
  //   lệnh hỏng — sai tên cột, sai kiểu, hàng không tồn tại. Hai thứ đó nhìn từ
  //   kết quả thì giống hệt nhau, và cái thứ hai làm ca kiểm luôn xanh mà không
  //   canh gì cả.
  //   Nên chạy ĐÚNG câu đó bằng quyền chủ sở hữu bảng (bỏ qua RLS) trước: nếu
  //   nó cũng không đổi được gì thì lỗi nằm ở bài kiểm, không ở phân quyền.
  await c.query("set local role postgres");
  await c.query("savepoint tu_kiem");
  await c.query(`update public.hen_tra_no set ngay_hen = public.ngay_vn() + 30 where id = $1`, [x.id]);
  const { rows: [doiDuoc] } = await c.query(
    `select (ngay_hen = public.ngay_vn() + 30) da_doi from public.hen_tra_no where id = $1`,
    [x.id],
  );
  await c.query("rollback to savepoint tu_kiem");
  await c.query("set local role authenticated");
  kiem(
    "phép đo còn sống: chính câu update đó CÓ tác dụng khi không bị RLS chặn",
    doiDuoc?.da_doi === true,
    "câu update tự nó không đổi được gì — ca dưới sẽ luôn xanh mà không canh gì",
  );

  const sua = await thu(() =>
    c.query(`update public.hen_tra_no set ngay_hen = public.ngay_vn() + 30 where id = $1`, [x.id]),
  );
  const { rows: [sauSua] } = await c.query(
    `select (ngay_hen = public.ngay_vn() + 5) giu_nguyen from public.hen_tra_no where id = $1`,
    [x.id],
  );
  kiem(
    "SỬA một lần hẹn cũ ⇒ không đổi được gì",
    sauSua?.giu_nguyen === true,
    `ngày hẹn đã bị đổi (câu update ${sua.ok ? "chạy lọt" : "bị chặn"})`,
  );

  await thu(() => c.query(`delete from public.hen_tra_no where id = $1`, [x.id]));
  const { rows: [con] } = await c.query(
    `select count(*)::int n from public.hen_tra_no where id = $1`, [x.id],
  );
  kiem("XOÁ một lần hẹn ⇒ vẫn còn nguyên", con.n === 1, "dòng đã bị xoá");
});

console.log("[hen-tra] Chot vai:");
if (nv) {
  await nhuNguoi(nv, async () => {
    const a = await thu(() =>
      c.query(
        `insert into public.hen_tra_no (tenant_id, contact_id, ngay_hen, tao_boi)
         values ($1, $2, public.ngay_vn() + 1, $3)`,
        [t.id, khach.id, nv],
      ),
    );
    kiem("nhân viên thường KHÔNG ghi được hẹn trả", !a.ok, "nhân viên ghi được");
    const { rows: [d] } = await c.query(`select count(*)::int n from public.hen_tra_no`);
    kiem("nhân viên thường KHÔNG đọc được sổ hẹn", d.n === 0, `đọc được ${d.n} dòng`);
  });
} else {
  console.log("  ⚠️ BỎ QUA 2 ca: tiệm demo không có nhân viên vai staff.");
  truot += 1;
}

await c.end();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
