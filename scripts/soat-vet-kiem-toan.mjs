/**
 * CỔNG: mọi thao tác sửa/xoá trên bảng DÍNH TIỀN đều để lại vết ai làm gì.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Tiệm có nhiều người cùng đụng vào quỹ và đơn. Không có vết thì một khoản chi
 * tự nhiên xuất hiện, hoặc một đơn tự nhiên giảm tiền, là KHÔNG AI TRUY ĐƯỢC —
 * và người bị nghi oan cũng không có gì để tự minh oan.
 *
 * Đo 21/08: bảng `record_audit` đã có sẵn nhưng CHỈ MỖI `contacts` ghi vào.
 * Migration #328 gắn chốt cho 6 bảng tiền; cổng này canh để chúng không bị gỡ
 * ra trong im lặng.
 *
 * ⚠️ ĐO BẰNG CÁCH GHI THẬT rồi rollback, KHÔNG đếm trigger trong danh mục hệ
 *   thống. Trigger có mặt mà thân hàm hỏng, hoặc điều kiện `when` chặn mất, thì
 *   danh mục vẫn báo "có" trong khi không dòng vết nào được ghi. Đếm trigger là
 *   phép đo dễ chịu nhất và cũng vô dụng nhất.
 *
 * Chạy: node scripts/soat-vet-kiem-toan.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
// ⚠️ `\r?\n`, KHÔNG phải `\n`: tách theo `\n` thì dòng kiểu Windows còn sót `\r` ở
//   đuôi, mà trong regex JavaScript `\r` LÀ ký tự xuống dòng — `.` không khớp nó và
//   `$` (không cờ `m`) chỉ khớp cuối chuỗi, nên `(.*)$` TRƯỢT sạch mọi dòng CRLF.
//   Đo 22/08 trên `.env.local` của máy này (37 dòng CRLF + 6 dòng LF): đọc được đúng
//   1/22 biến rồi dừng ở "thiếu khoá" ⇒ script này CHƯA TỪNG CHẠY ĐƯỢC trên Windows.
for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
});
await c.connect();
await c.query("set lock_timeout = '10s'");
await c.query("set statement_timeout = '60s'");

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

/**
 * Mỗi mục: [bảng, loại ghi vào record_audit, cột đem ra sửa thử, giá trị mới].
 * Cột sửa thử phải là cột THẬT SỰ mang nghĩa tiền hoặc trạng thái — sửa một cột
 * vô nghĩa thì chốt có thể bỏ qua đúng theo thiết kế và ta kết luận nhầm.
 */
const MUC = [
  ["cash_entries", "cash_entry", "note", "thu-nghiem-vet-kiem-toan", null],
  ["order_payments", "order_payment", "amount_vnd", null, null],
  // ⚠️ Phiếu lương của kỳ ĐÃ CHỐT bị `payroll_locked` chặn — lệnh ghi hỏng vì
  //   lý do KHÁC. Đó là một chốt CÓ SẴN và đúng: lương đã chốt thì không sửa
  //   được nữa. Lấy phiếu của kỳ còn mở. (Cùng cái bẫy với `order_locked`.)
  [
    "payslips",
    "payslip",
    "gross_vnd",
    null,
    "period_id in (select id from public.payroll_periods where status <> 'closed')",
  ],
  ["orders", "order", "cancel_reason", "thu-nghiem-vet-kiem-toan", "status in ('draft','confirmed')"],
  // ⚠️ Dòng hàng của đơn ĐÃ CHỐT bị `order_locked` chặn — lệnh ghi hỏng vì lý
  //   do KHÁC, và ta sẽ tưởng chốt vết kiểm toán không chạy. Lọc lấy dòng của
  //   đơn chưa chốt. Cùng cái bẫy đã dính ở đợt đo chéo tiệm.
  [
    "order_lines",
    "order_line",
    "qty",
    null,
    "order_id in (select id from public.orders where status in ('draft','confirmed'))",
  ],
  ["vouchers", "voucher", "code", null, null],
];

for (const [bang, loai, cot, giaTri, loc] of MUC) {
  await c.query("begin");
  try {
    const { rows } = await c.query(
      `select id, tenant_id, "${cot}" as cu from public."${bang}" ${loc ? "where " + loc : ""} limit 1`,
    );
    if (!rows.length) {
      kiem(`${bang}: sửa để lại vết`, false, "bảng chưa có dòng nào để thử");
      await c.query("rollback");
      continue;
    }
    const { id, tenant_id, cu } = rows[0];
    // Giá trị mới: chuỗi thì gán chuỗi thử, số thì cộng thêm 1.
    const moi = giaTri ?? (typeof cu === "number" ? cu + 1 : Number(cu) + 1);

    const truoc = await c.query(
      `select count(*)::int n from public.record_audit where entity_type=$1 and entity_id=$2`,
      [loai, id],
    );
    await c.query(`update public."${bang}" set "${cot}" = $2 where id = $1`, [id, moi]);
    const sau = await c.query(
      `select action, diff from public.record_audit
        where entity_type=$1 and entity_id=$2 order by id desc limit 1`,
      [loai, id],
    );
    const them = await c.query(
      `select count(*)::int n from public.record_audit where entity_type=$1 and entity_id=$2`,
      [loai, id],
    );
    const coVet = them.rows[0].n === truoc.rows[0].n + 1;
    const coCot = coVet && sau.rows[0]?.diff && Object.hasOwn(sau.rows[0].diff, cot);
    kiem(
      `${bang}: sửa "${cot}" để lại vết`,
      Boolean(coVet && coCot),
      coVet ? `ghi "${sau.rows[0].action}"` : "KHÔNG có dòng vết nào",
    );
    void tenant_id;
  } catch (e) {
    kiem(`${bang}: sửa để lại vết`, false, String(e.message).slice(0, 80));
  }
  await c.query("rollback");
}

// XOÁ cũng phải để lại vết — thao tác đáng ngờ nhất.
//
// ⚠️ KHÔNG đo trên sổ quỹ. Cơ sở dữ liệu CẤM HẲN xoá dòng tiền
//   (`so_quy_khong_duoc_xoa_dong_tien`) — một chốt CÓ SẴN và đúng: dòng tiền
//   chỉ được ghi bù, không được xoá. Đo ở đó thì cổng đỏ vì gặp một chốt KHÁC
//   chứ không phải vì vết kiểm toán hỏng. Đã dính đúng bẫy này ở lượt đo đầu.
await c.query("begin");
try {
  const { rows } = await c.query(`select id from public.vouchers limit 1`);
  if (rows.length) {
    const id = rows[0].id;
    await c.query(`delete from public.vouchers where id=$1`, [id]);
    const v = await c.query(
      `select action, diff from public.record_audit
        where entity_type='voucher' and entity_id=$1 order by id desc limit 1`,
      [id],
    );
    kiem("phiếu giảm giá: XOÁ để lại vết", v.rows[0]?.action === "deleted", v.rows[0]?.action ?? "không có");
    // ⚠️ Vết xoá phải giữ NGUYÊN NỘI DUNG dòng đã mất. Chỉ ghi "đã xoá" mà
    //   không giữ nội dung thì lúc cần đối chiếu không còn gì để đối chiếu.
    kiem(
      "vết xoá giữ lại nội dung dòng đã mất",
      Boolean(v.rows[0]?.diff && Object.keys(v.rows[0].diff).length > 3),
      `${Object.keys(v.rows[0]?.diff ?? {}).length} cột`,
    );
  } else {
    kiem("phiếu giảm giá: XOÁ để lại vết", false, "chưa có dòng nào để thử");
  }
} catch (e) {
  kiem("phiếu giảm giá: XOÁ để lại vết", false, String(e.message).slice(0, 80));
}
await c.query("rollback");

// Sổ quỹ CẤM xoá — đo luôn để chốt đó không bị gỡ trong im lặng.
await c.query("begin");
try {
  const { rows } = await c.query(`select id from public.cash_entries limit 1`);
  let biChan = false;
  if (rows.length) {
    await c.query("savepoint x");
    try {
      await c.query(`delete from public.cash_entries where id=$1`, [rows[0].id]);
    } catch {
      biChan = true;
    }
    await c.query("rollback to savepoint x");
  }
  kiem("sổ quỹ: dòng tiền KHÔNG xoá được (chốt sẵn có)", biChan);
} catch (e) {
  kiem("sổ quỹ: dòng tiền KHÔNG xoá được", false, String(e.message).slice(0, 70));
}
await c.query("rollback");

await c.end();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
if (truot) {
  console.error("❌ Có bảng tiền không để lại vết — sửa/xoá ở đó sẽ không ai truy được.");
  process.exit(1);
}
console.log("✅ Mọi bảng dính tiền đều để lại vết ai làm gì.");
