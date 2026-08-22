/**
 * CỔNG: dữ liệu tiệm mẫu không được đứng yên trong quá khứ.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CẦN CANH CHUYỆN NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Bộ nạp dữ liệu mẫu đóng cứng ngày "hôm nay" ở trong mã, chạy một lần rồi
 * thôi. Mỗi ngày trôi qua là dữ liệu lùi xa thêm một ngày, và KHÔNG có gì báo.
 * Đo 22/08: cả 6 tiệm mẫu đều dừng ở 20/08 — mọi màn "hôm nay" hiện số 0, tiệm
 * demo trông như đã ngừng bán. Nó đã âm thầm hỏng như vậy suốt hai ngày.
 *
 * ⚠️ ĐÂY LÀ LỖI KHÔNG NẰM TRONG MÃ NGUỒN. Mọi bộ kiểm khác đều xanh trong lúc
 *   nó xảy ra, vì mã chạy đúng — chỉ có dữ liệu là cũ. Lớp lỗi này chỉ bắt được
 *   bằng cách hỏi thẳng cơ sở dữ liệu "lần bán gần nhất là bao giờ".
 *
 * ⚠️ NGƯỠNG LÀ 3 NGÀY, KHÔNG PHẢI 1. Trễ một ngày thì màn "hôm qua" vẫn có số,
 *   người xem không nhận ra. Đặt ngưỡng 1 ngày là cổng đỏ gần như mỗi sáng và
 *   chặn cả những bản phát hành không liên quan — một cổng kêu suốt là một cổng
 *   người ta học cách bỏ qua.
 *
 * Chạy: node scripts/du-lieu-mau-con-tuoi-smoke.mjs
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

const TRE_TOI_DA = 3;

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

const { rows: tiems } = await c.query(`
  select t.name,
    (public.ngay_vn() - max((o.created_at at time zone 'Asia/Ho_Chi_Minh')::date))::int tre
  from public.tenants t
  join public.orders o on o.tenant_id = t.id and o.deleted_at is null
  where t.deleted_at is null
  group by t.id, t.name
  order by 2 desc`);

// TỰ KIỂM PHÉP ĐO: không thấy tiệm mẫu nào thì cổng phải ĐỎ, không phải xanh.
// Một câu truy vấn trả rỗng trông y hệt "mọi thứ đều ổn".
kiem(
  "phép đo còn sống: đọc được ít nhất một tiệm mẫu có đơn hàng",
  tiems.length > 0,
  "không tiệm nào có đơn — nhiều khả năng đang trỏ nhầm cơ sở dữ liệu",
);

for (const t of tiems) {
  kiem(
    `${t.name} — lần bán gần nhất không quá ${TRE_TOI_DA} ngày`,
    t.tre <= TRE_TOI_DA,
    `đã ${t.tre} ngày không có đơn nào`,
  );
}

await c.end();

if (truot > 0) {
  console.log(`
  ⇒ CÁCH CHỮA: chạy \`node scripts/bu-ngay-thieu-demo.mjs\`
    Nó bù đúng những ngày còn thiếu, đi đúng đường đời thật của một đơn hàng
    (nháp → thêm hàng → thu tiền → xác nhận → hoàn tất) nên hoa hồng, kho và
    sổ quỹ đều sinh ra đủ. Chạy lại nhiều lần không nhân đôi.
    Xem trước mà không ghi gì: thêm \`--xem\`.`);
}
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
