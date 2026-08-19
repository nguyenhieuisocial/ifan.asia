#!/usr/bin/env node
/**
 * DÒ cột "CÓ DỮ LIỆU, KHÔNG CÓ ĐƯỜNG VÀO" — chạy tay, KHÔNG phải cổng kiểm.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ĐÂY LÀ DANH SÁCH MANH MỐI, KHÔNG PHẢI DANH SÁCH LỖI
 * ═══════════════════════════════════════════════════════════════════
 * Đọc kỹ chỗ này trước khi tin bất cứ dòng nào file này in ra.
 *
 * Nó chỉ trả lời đúng MỘT câu hẹp: *"cột nào đang chứa dữ liệu mà tên cột
 * không xuất hiện trong mã ứng dụng?"* — và câu đó có **rất nhiều** đáp án
 * hoàn toàn bình thường:
 *
 *   · cột do trigger / hàm CSDL ghi và đọc (`domain_events.*`, `metric_daily.*`)
 *   · cột của việc chạy nền (`workflow_runs.*`, `heartbeats.*`, `app_rate_limits.*`)
 *   · cột nội bộ của con trỏ hàng đợi (`webhook_fanout_cursor.*`)
 *
 * Lượt chạy 19/08: **1.324 cột · 97 cột không thấy tên trong mã app · 53 trong
 * số đó đang có dữ liệu**. Phép xếp loại bên dưới đẩy **50/53** vào nhóm "xem
 * lướt" và để lại **3** dòng đáng đọc kỹ — nhưng ngay cả 3 dòng đó cũng phải
 * xét tay (1 trong 3 là cột nội bộ của bảng số liệu, hoàn toàn bình thường).
 *
 * Vì thế nó **cố ý không** cắm vào CI: kết luận cuối cùng luôn cần một người
 * đọc, mà cổng đỏ cần một câu trả lời máy quyết được.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO VẪN GIỮ
 * ═══════════════════════════════════════════════════════════════════
 * Lớp bệnh này đã cắn hai lần trong MỘT ngày (19/08):
 *   · `qr_attribute_contact` — hàm có dữ liệu, không màn nào gọi (đã xoá)
 *   · `companies.phone` — 13 công ty có số điện thoại, không cửa sổ nào sửa được
 * Sửa xong hai trường hợp thì phải hỏi cả lớp. File này là cách hỏi. Lược đồ
 * kho này lớn nhanh (191 migration trong ~3 tuần) nên câu hỏi sẽ còn phải hỏi lại.
 *
 * ═══════════════════════════════════════════════════════════════════
 * CÁCH ĐỌC KẾT QUẢ
 * ═══════════════════════════════════════════════════════════════════
 * Cột được xếp làm hai phần:
 *   [HÀM]   — tên cột có trong THÂN một hàm CSDL đang chạy (`pg_proc.prosrc`)
 *             ⇒ trigger / hàm / việc nền tự ghi và đọc. Xem lướt.
 *   [TRỐNG] — không thấy ở mã app, cũng không ở thân hàm nào ⇒ **xem từng dòng**.
 *
 * Bản đầu phân loại bằng cách tìm tên cột trong `supabase/migrations/*.sql`.
 * **Phép đó vô dụng** và đã bỏ: cột nào chẳng xuất hiện trong chính câu
 * `create table` sinh ra nó, nên 53/53 dòng đều rơi vào nhóm "xem lướt" —
 * một phép phân loại không loại được gì. Đọc thân hàm thì mới trả lời đúng
 * câu cần hỏi: *có mã nào đang thật sự dùng cột này không.*
 *
 * Và một cái bẫy đã dính thật, ghi để đừng dính lại: đừng bốc `limit 2` rồi
 * kết luận cho cả bảng. Ngày 19/08 hai dòng bốc trúng là dòng đã xoá mềm, suýt
 * thành báo cáo "máy chấm điểm luôn ra 0" — đo lại cả tập thì 86/86 khách còn
 * sống đều có điểm dương. `limit` là phép BỐC THĂM, không phải phép đo.
 *
 * Chạy:  node scripts/soat-cot-mo-coi.mjs
 * Chỉ ĐỌC — không ghi, không sửa gì trong CSDL.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const KET_NOI = (process.env.SUPABASE_DB_URL ??
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .match(/^SUPABASE_DB_URL=(.*)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "")) ?? "";
if (!KET_NOI) {
  console.error("Thiếu SUPABASE_DB_URL (biến môi trường hoặc .env.local).");
  process.exit(1);
}

// TLS verify-full với CA Supabase đã ghim — giống mọi script khác của kho.
const caPath = new URL("../supabase/supabase-ca.crt", import.meta.url);
const c = new pg.Client({
  connectionString: KET_NOI,
  ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true },
});
await c.connect();
await c.query("set lock_timeout = '10s'");

/** Cột kỹ thuật có mặt ở mọi bảng — nhắc tới hay không đều không nói lên điều gì. */
const BO_QUA = new Set(["id", "tenant_id", "created_at", "updated_at", "deleted_at", "created_by"]);

const { rows: cols } = await c.query(`
  select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
   order by c.table_name, c.ordinal_position`);

/** Gộp mọi file của một cây thư mục thành một chuỗi để tra tên cột. */
function gom(goc, duoi) {
  let s = "";
  const di = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) di(p);
      else if (duoi.test(e.name)) s += readFileSync(p, "utf8");
    }
  };
  di(goc);
  return s;
}

const maApp = ["app", "lib", "components"]
  .map((d) => gom(new URL(`../${d}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), /\.(ts|tsx)$/))
  .join("");

// Thân MỌI hàm CSDL đang chạy — không đọc file migration, đọc bản THẬT trong CSDL.
const { rows: thanHam } = await c.query(`
  select string_agg(p.prosrc, E'\\n') as ma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'`);
const maHam = thanHam[0]?.ma ?? "";

const nghi = cols.filter((x) => !BO_QUA.has(x.column_name) && !maApp.includes(x.column_name));

const coDuLieu = [];
for (const x of nghi) {
  const { rows } = await c.query(
    `select count(*)::int as tong, count("${x.column_name}")::int as co from public."${x.table_name}"`,
  );
  if (rows[0].co > 0) coDuLieu.push({ ...x, ...rows[0], trongHam: maHam.includes(x.column_name) });
}
await c.end();

const trong = coDuLieu.filter((x) => !x.trongHam);
const trongSql = coDuLieu.filter((x) => x.trongHam);

console.log(
  `\nCột trong public: ${cols.length} · không thấy trong mã app: ${nghi.length} · ` +
    `trong đó ĐANG CÓ dữ liệu: ${coDuLieu.length}\n`,
);

const in1 = (r) =>
  console.log(`  ${`${r.table_name}.${r.column_name}`.padEnd(48)} ${r.co}/${r.tong} dòng có giá trị  (${r.data_type})`);

console.log(`── [TRỐNG] không thấy ở mã app, cũng không ở thân hàm nào — XEM TỪNG DÒNG (${trong.length}) ──`);
if (trong.length === 0) console.log("  (không có)");
trong.sort((a, b) => b.co - a.co).forEach(in1);

console.log(`\n── [HÀM] có trong thân hàm CSDL ⇒ trigger/việc nền tự ghi-đọc — xem lướt (${trongSql.length}) ──`);
trongSql.sort((a, b) => b.co - a.co).forEach(in1);

console.log(
  "\nNhắc lại: đây là DANH SÁCH MANH MỐI. Lượt 19/08 có 53 dòng, lọc tay còn 3 chỗ đáng làm.\n",
);
