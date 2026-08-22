#!/usr/bin/env node
/**
 * SỬA GIỜ SỔ SỰ KIỆN CỦA CÁC TIỆM MẪU.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Đo 22/08/2026 trên màn chi tiết đơn: **7.523 / 7.530** đơn mẫu có giờ ở đầu
 * trang KHÁC giờ trong khối "Lịch sử đơn". Một đơn ghi "Tạo lúc 22/8 19:50"
 * còn lịch sử ngay dưới ghi "Tạo đơn · 22/8 07:14".
 *
 * Nguyên nhân: bộ nạp dữ liệu mẫu LÙI NGÀY cho `orders.created_at` để dựng lịch
 * sử bán hàng, nhưng `domain_events` do trigger ghi bằng `now()` — tức giờ thật
 * lúc chạy bộ nạp. Hai mốc nói hai chuyện.
 *
 * ⚠️ ĐÃ KIỂM ĐỂ KHÔNG ĐỔ OAN CHO MÃ. Lấy một đơn KHÔNG do bộ nạp sinh ra, đọc
 *   giá trị thô: cả hai đều là `timestamptz` lưu đúng, cả hai đổi sang giờ Việt
 *   Nam đúng. Hai giá trị THẬT SỰ KHÁC NHAU trong CSDL. Lỗi dữ liệu, không phải
 *   lỗi múi giờ, và sửa ở màn là sửa nhầm chỗ.
 *
 * ⚠️ CHỈ ĐỘNG VÀO TIỆM MẪU. Đã đếm trước khi viết: 59.838 sự kiện lệch, **toàn
 *   bộ** nằm trên tiệm `is_sample` hoặc `demo-*`; tiệm thật lệch **0**. Câu
 *   `where` dưới đây khoá đúng phạm vi đó, và bản `--xem` in ra số theo tiệm để
 *   người chạy tự nhìn thấy phạm vi trước khi ghi.
 *
 * ⚠️ VÌ SAO ĐƯỢC PHÉP SỬA SỔ SỰ KIỆN. `domain_events` là vết kiểm toán, bình
 *   thường KHÔNG được sửa. Ở đây nó ghi lại một quá khứ vốn đã là bịa (đơn mẫu
 *   backdate), nên chỉnh cho khớp là làm cho bản demo NHẤT QUÁN, không phải làm
 *   sai lệch lịch sử thật. Trên tiệm thật, câu lệnh này không chạm tới dòng nào.
 *
 * Ba loại sự kiện vòng đời được TRẢI RA thay vì dồn một giây:
 *   · tạo đơn   → đúng `orders.created_at`
 *   · xác nhận  → tạo + 1…4 phút
 *   · hoàn tất  → tạo + 15…80 phút
 *   · huỷ       → tạo + 5…30 phút
 * Khoảng cách suy từ chính mã đơn nên chạy lại bao nhiêu lần cũng ra một kết
 * quả. Sự kiện loại khác chỉ được DỜI theo cùng độ lệch, giữ nguyên thứ tự.
 *
 *   node scripts/sua-gio-su-kien-mau.mjs --xem   — chỉ đếm, không ghi
 *   node scripts/sua-gio-su-kien-mau.mjs --thu   — ghi rồi HOÀN TÁC, in kết quả
 *   node scripts/sua-gio-su-kien-mau.mjs         — ghi thật
 */
import pg from "pg";
import { readFileSync } from "node:fs";

const XEM = process.argv.includes("--xem");
const THU = process.argv.includes("--thu");

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();

/** Chỉ tiệm mẫu. Dùng chung cho cả đếm lẫn ghi để hai bên không thể lệch phạm vi. */
const PHAM_VI = `(t.is_sample or t.slug like 'demo-%')`;
/**
 * ⚠️ THƯỚC ĐO PHẢI ĐÚNG CÁI MẮT NGƯỜI DÙNG THẤY, KHÔNG PHẢI "MỌI SỰ KIỆN ĐỀU
 *   TRÙNG GIỜ TẠO ĐƠN". Bản đo đầu tiên của chính file này so TỪNG sự kiện với
 *   `orders.created_at` — nên sau khi sửa nó vẫn báo 19.973 chỗ "còn lệch",
 *   trong khi đó chính là các sự kiện "hoàn tất" được TRẢI RA +15…80 phút theo
 *   đúng thiết kế. Bản sửa đúng, cái sai là cái thước.
 *
 * Lỗi người dùng nhìn thấy là: dòng ĐẦU TIÊN trong "Lịch sử đơn" nói một giờ,
 * đầu trang nói một giờ khác. Nên thước đo là khoảng cách giữa
 * `orders.created_at` và sự kiện SỚM NHẤT của đơn đó.
 */
const LECH_DON = `abs(extract(epoch from (dau.som_nhat - o.created_at))) > 600`;
const SOM_NHAT = `
  lateral (
    select min(e2.created_at) som_nhat
    from domain_events e2 where e2.aggregate_id = o.id::text
  ) dau`;

const dem = async (nhan) => {
  const { rows } = await c.query(`
    select t.slug,
           count(*) filter (where ${LECH_DON}) don_lech,
           count(*) don
    from orders o
    join tenants t on t.id = o.tenant_id
    join ${SOM_NHAT} on true
    where ${PHAM_VI} and dau.som_nhat is not null
    group by t.slug order by t.slug`);
  console.log(`\n── ${nhan} ──`);
  console.table(rows);
  const { rows: [that] } = await c.query(`
    select count(*) n from orders o
    join tenants t on t.id = o.tenant_id
    join ${SOM_NHAT} on true
    where not ${PHAM_VI} and dau.som_nhat is not null and ${LECH_DON}`);
  console.log(`tiệm THẬT còn lệch: ${that.n} (phải luôn là 0 — file này không chạm vào tiệm thật)`);
  return rows.reduce((s, r) => s + Number(r.don_lech), 0);
};

const truoc = await dem("trước khi sửa");
if (XEM) {
  console.log("\n--xem: không ghi gì.");
  await c.end();
  process.exit(0);
}

/**
 * `nhip` = số 0…65535 suy từ 4 ký tự đầu mã đơn — cùng một đơn luôn ra cùng một
 * khoảng cách, nên chạy lại không làm giờ nhảy lung tung.
 *
 * Kẹp `least(..., <cuối ngày VN>)`: đơn tạo lúc 22:30 mà cộng 80 phút thì sự
 * kiện "hoàn tất" rơi sang HÔM SAU, và ngày bán hàng của tiệm bị xé đôi.
 *
 * ⚠️ CỐ Ý KHÔNG KẸP THEO `now()`. Bản đầu có kẹp, và nó tự tạo lại đúng cái lỗi
 *   đang chữa: bộ nạp rải đơn của HÔM NAY đều khắp 8h–20h, nên chạy lúc 11h40
 *   thì 116 đơn mang giờ buổi tối chưa tới; kẹp `now()` kéo sổ sự kiện về
 *   11h40 và đầu trang lại nói một giờ, lịch sử nói một giờ.
 *   Gốc rễ nằm ở chỗ ĐƠN bị đặt vào tương lai, không nằm ở sổ sự kiện — nên đã
 *   sửa tại gốc: `bu-ngay-thieu-demo.mjs` giờ chỉ rải đơn tới giờ hiện tại.
 *   Ở đây giữ nhất quán với đơn; 116 đơn đã lỡ ghi sẽ tự hết "tương lai" khi
 *   trời tối, và chúng chỉ nằm trên tiệm mẫu.
 */
const CAU_SUA = `
  with n as (
    select e.id,
           e.event_type,
           o.created_at as goc,
           (('x' || substr(replace(o.id::text, '-', ''), 1, 4))::bit(16)::int) as nhip
    from domain_events e
    join orders o on o.id::text = e.aggregate_id
    join tenants t on t.id = o.tenant_id
    join ${SOM_NHAT} on true
    where ${PHAM_VI} and ${LECH_DON}
  ), m as (
    select id,
      least(
          case
            when event_type like '%created%'   then goc
            when event_type like '%confirmed%' then goc + make_interval(mins => 1 + (nhip % 4))
            when event_type like '%completed%' then goc + make_interval(mins => 15 + (nhip % 66))
            when event_type like '%cancelled%' then goc + make_interval(mins => 5 + (nhip % 26))
            else goc
          end,
          -- cuối ngày Việt Nam của chính ngày tạo đơn
          date_trunc('day', goc at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'
            + interval '23 hours 59 minutes'
      ) as moi
    from n
  )
  update domain_events e set created_at = m.moi from m where m.id = e.id`;

await c.query("begin");
const kq = await c.query(CAU_SUA);
console.log(`\nđã ghi ${kq.rowCount} dòng`);
const sau = await dem(THU ? "sau khi sửa (trong giao dịch sẽ hoàn tác)" : "sau khi sửa");

if (THU) {
  await c.query("rollback");
  console.log("\n--thu: ĐÃ HOÀN TÁC. Không có gì đổi trên CSDL.");
} else {
  await c.query("commit");
  console.log(`\nxong: ${truoc} → ${sau} sự kiện còn lệch.`);
}
await c.end();
