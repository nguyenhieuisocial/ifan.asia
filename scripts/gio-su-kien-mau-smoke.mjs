#!/usr/bin/env node
/**
 * CỔNG: chứng từ mẫu không được tự mâu thuẫn với chính nó.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Đo 22/08/2026: **20.412 / 20.419** đơn mẫu có giờ ở đầu trang khác giờ dòng
 * đầu trong "Lịch sử đơn" — đầu trang "Tạo lúc 19:50", ngay dưới "Tạo đơn ·
 * 07:14". Bộ nạp lùi ngày cho `orders.created_at` nhưng `domain_events` do
 * trigger ghi bằng giờ thật lúc chạy bộ nạp.
 *
 * Đây là lỗi **của bản demo**, và bản demo là thứ chủ tiệm mở ra đầu tiên. Một
 * chứng từ tự cãi chính nó ở hai dòng cạnh nhau thì mọi con số còn lại trên màn
 * cũng mất tin theo.
 *
 * ⚠️ CHỈ SOI TIỆM MẪU. Tiệm thật chưa từng lệch (đo được: 0) vì đơn thật và sổ
 *   sự kiện thật cùng sinh ra trong một giao dịch. Nếu một ngày cổng này đỏ ở
 *   tiệm THẬT thì đó là chuyện khác hẳn và nặng hơn — nên nó được đếm riêng.
 *
 * ⚠️ THƯỚC ĐO LÀ SỰ KIỆN SỚM NHẤT, KHÔNG PHẢI MỌI SỰ KIỆN. Vòng đời có trải ra
 *   (xác nhận +1…4 phút, hoàn tất +15…80 phút) — đó là CỐ Ý. So từng sự kiện
 *   với giờ tạo đơn thì cổng đỏ ngay cả khi dữ liệu đúng; bản đo đầu tiên đã
 *   sai đúng kiểu đó và báo "còn 19.973 chỗ lệch" trên một bản sửa hoàn hảo.
 *
 * Sửa bằng: node scripts/sua-gio-su-kien-mau.mjs
 * Chạy:     node scripts/gio-su-kien-mau-smoke.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";

if (!process.env.SUPABASE_DB_URL) {
  console.log("BỎ QUA: chưa có SUPABASE_DB_URL — không đo được, và KHÔNG tính là đạt.");
  process.exit(0);
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();

const { rows } = await c.query(`
  select (t.is_sample or t.slug like 'demo-%') la_mau,
         count(*) filter (
           where abs(extract(epoch from (dau.som_nhat - o.created_at))) > 600
         ) lech,
         count(*) tong
  from orders o
  join tenants t on t.id = o.tenant_id
  join lateral (
    select min(e.created_at) som_nhat
    from domain_events e where e.aggregate_id = o.id::text
  ) dau on true
  where dau.som_nhat is not null
  group by 1`);
await c.end();

const mau = rows.find((r) => r.la_mau) ?? { lech: "0", tong: "0" };
const that = rows.find((r) => !r.la_mau) ?? { lech: "0", tong: "0" };

console.log(`tiệm mẫu : ${mau.lech}/${mau.tong} đơn có giờ lịch sử lệch giờ tạo đơn`);
console.log(`tiệm thật: ${that.lech}/${that.tong}`);

if (Number(mau.lech) === 0 && Number(that.lech) === 0) {
  console.log("\n✓ Không đơn nào tự mâu thuẫn.");
  process.exit(0);
}
if (Number(that.lech) > 0) {
  console.log(
    `\n✗ ${that.lech} đơn của TIỆM THẬT lệch. Đây KHÔNG phải chuyện dữ liệu mẫu —` +
      ` đơn thật và sổ sự kiện phải sinh ra trong cùng một giao dịch. Đi tìm chỗ ghi tay.`,
  );
}
if (Number(mau.lech) > 0) {
  console.log(`\n✗ ${mau.lech} đơn mẫu lệch. Chạy: node scripts/sua-gio-su-kien-mau.mjs`);
}
process.exit(1);
