/**
 * CỔNG: nhân bản đơn phải chép ĐÚNG thứ được phép chép.
 *
 * ═══════════════════════════════════════════════════════════════════
 * CA QUAN TRỌNG NHẤT LÀ CA "KHÔNG CHÉP KHOẢN GIẢM GIÁ"
 * ═══════════════════════════════════════════════════════════════════
 * Giảm giá ở iFan đi qua `discount_request` với TRẦN THEO VAI: nhân viên chỉ
 * được giảm tới một mức, quá thì phải chờ quản lý duyệt (#165). Nếu nhân bản
 * chép luôn khoản giảm sang đơn mới thì cả cái trần đó thành vô nghĩa — xin
 * duyệt một lần rồi nhân bản mãi.
 *
 * Đây là lớp lỗi KHÔNG có gì báo: đơn mới trông bình thường, tiền vẫn cộng
 * đúng, chỉ có điều khoản giảm chưa ai duyệt.
 *
 * ⚠️ Mọi ca ghi đều nằm trong giao dịch rồi hoàn tác.
 *
 * Chạy: node scripts/nhan-ban-don-smoke.mjs
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

// ── Phần A: HỢP ĐỒNG của hàm ở tầng web, đọc thẳng từ mã nguồn ──────
// Hàm `duplicateOrder` chạy ở máy chủ Next, không gọi được từ đây. Nhưng thứ
// cần canh nhất là NÓ CHÉP CÁI GÌ — và cái đó đọc được từ mã.
// ⚠️ Đọc mã nguồn là cách kiểm YẾU (nó không chứng minh lúc chạy ra sao). Phần
//   B bù lại bằng cách dựng đúng cảnh đó trong CSDL.
const ma = readFileSync("app/app/orders/actions.ts", "utf8");
const than = ma.slice(ma.indexOf("export async function duplicateOrder"));
kiem("hàm nhân bản có tồn tại", than.length > 100);
kiem(
  "KHÔNG chép khoản giảm giá (ghi thẳng 0)",
  /discount_vnd:\s*0/.test(than),
  "không thấy chỗ đặt lại giảm giá về 0",
);
kiem(
  "KHÔNG chép tiền đã thu",
  !/order_payments/.test(than),
  "có đụng tới bảng thu tiền",
);
kiem(
  "KHÔNG chép lịch hẹn nguồn",
  !/source_appointment_id|appointment_id/.test(than),
  "có chép mã lịch hẹn",
);
kiem(
  "CÓ chép người thực hiện từng dòng (hoa hồng về đúng người)",
  /performed_by_employee_id/.test(than),
);
kiem(
  "chỉ nhân bản đơn ĐÃ HOÀN TẤT, và không nhân bản phiếu hoàn",
  /status !== "completed"/.test(than) && /kind !== "order"/.test(than),
);

// ── Phần B: dựng đúng cảnh trong CSDL ───────────────────────────────
const { rows: [t] } = await c.query(
  `select id from public.tenants where slug = 'demo-spa-huong-sen'`,
);
const { rows: [chu] } = await c.query(
  `select user_id from public.tenant_members where tenant_id = $1 and role = 'owner' limit 1`,
  [t.id],
);
const { rows: [mon] } = await c.query(
  `select id, coalesce(price_vnd, 200000)::bigint gia from public.items
    where tenant_id = $1 and kind = 'service' limit 1`,
  [t.id],
);
const { rows: [khach] } = await c.query(
  `select id from public.contacts where tenant_id = $1 and deleted_at is null limit 1`,
  [t.id],
);

await c.query("begin");
try {
  // Đơn gốc: hoàn tất, có MỘT dòng và một khoản giảm giá đã được duyệt.
  const { rows: [goc] } = await c.query(
    `insert into public.orders (tenant_id, contact_id, created_by)
     values ($1, $2, $3) returning id`,
    [t.id, khach.id, chu.user_id],
  );
  await c.query(
    `insert into public.order_lines
       (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd, sort_order)
     values ($1, $2, $3, 1, $4, 100000, 0)`,
    [t.id, goc.id, mon.id, mon.gia],
  );
  await c.query(`update public.orders set status = 'confirmed' where id = $1`, [goc.id]);
  await c.query(`update public.orders set status = 'completed' where id = $1`, [goc.id]);

  const { rows: [g] } = await c.query(
    `select sum(discount_vnd)::bigint giam, count(*)::int n from public.order_lines where order_id = $1`,
    [goc.id],
  );
  kiem("dựng được đơn gốc có khoản giảm giá", Number(g.giam) === 100000 && g.n === 1);

  // Mô phỏng ĐÚNG những gì hàm nhân bản làm — nếu ai đó sửa hàm cho chép cả
  // khoản giảm thì phần A ở trên đỏ trước.
  const { rows: [moi] } = await c.query(
    `insert into public.orders (tenant_id, contact_id, created_by) values ($1,$2,$3) returning id, status`,
    [t.id, khach.id, chu.user_id],
  );
  kiem("bản mới luôn ở trạng thái NHÁP", moi.status === "draft", moi.status);

  await c.query(
    `insert into public.order_lines
       (tenant_id, order_id, item_id, variant_id, qty, unit_price_vnd, discount_vnd,
        performed_by_employee_id, sort_order)
     select $1, $2, item_id, variant_id, qty, unit_price_vnd, 0,
            performed_by_employee_id, sort_order
       from public.order_lines where order_id = $3`,
    [t.id, moi.id, goc.id],
  );
  const { rows: [m2] } = await c.query(
    `select sum(discount_vnd)::bigint giam, sum(unit_price_vnd)::bigint gia, count(*)::int n
       from public.order_lines where order_id = $1`,
    [moi.id],
  );
  kiem("bản mới có đủ dòng hàng", m2.n === 1);
  kiem("bản mới giữ nguyên ĐƠN GIÁ", Number(m2.gia) === Number(mon.gia));
  kiem(
    "bản mới KHÔNG mang theo khoản giảm giá",
    Number(m2.giam) === 0,
    `giảm ${m2.giam}đ — trần duyệt giảm giá bị vô hiệu`,
  );
  const { rows: [thu] } = await c.query(
    `select count(*)::int n from public.order_payments where order_id = $1`, [moi.id],
  );
  kiem("bản mới chưa có đồng nào đã thu", thu.n === 0);
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
