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
// Cổng kiểm chạy trên ĐÚNG kho dữ liệu của khách thật — một lượt kiểm treo sẽ
// giữ khoá và chặn cả việc áp bản vá khẩn. Đặt hạn để nó tự bỏ cuộc.
// (luật 1 của scripts/soat-ky-luat-bo-kiem.mjs)
await c.query("set lock_timeout = '10s'");
await c.query("set statement_timeout = '60s'");

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

// ── Sổ lịch phía TRƯỚC cũng mòn dần, và nó gây hại theo kiểu khác ──
// ⚠️ CHUYỆN ĐÃ XẢY RA THẬT 22/08. Bộ nạp mẫu sinh lịch tương lai với mật độ
//   VƠI hơn ngày quá khứ (11–16 lịch/ngày so với mức thường ngày 33,5). Hệ quả:
//   báo động "ngày mai vắng bất thường" (#348) kêu MỖI NGÀY trên đúng tài khoản
//   founder — đúng kịch bản tệ nhất mà thẻ thiết kế cảnh báo, vì một tin sai là
//   lần sau người ta tắt thông báo và mất luôn cả những tin đúng.
//   Đây là ca canh cho lớp bệnh đó, không phải cho "tiệm hôm nay vắng khách".
const { rows: soLich } = await c.query(`
  with nen as (
    select t.id, t.name,
      (select percentile_cont(0.5) within group (order by (
         select count(*) from public.appointments a
          where a.tenant_id = t.id and a.deleted_at is null
            and a.status not in ('cancelled','no_show')
            and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date = d.d))
       from generate_series(public.ngay_vn() - 14, public.ngay_vn() - 1, interval '1 day') d(d)
      )::numeric muc
    from public.tenants t
    where t.deleted_at is null
      and exists (select 1 from public.appointments a where a.tenant_id = t.id)
  )
  select nen.name, nen.muc,
    (select count(*) from public.appointments a
      where a.tenant_id = nen.id and a.deleted_at is null
        and a.status not in ('cancelled','no_show')
        and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date = public.ngay_vn() + 1)::int mai
  from nen
  -- Dưới 5 lịch/ngày thì báo động vốn đã không kêu (chốt trong #348), nên sổ
  -- lịch mỏng ở đó không gây tin sai.
  where nen.muc >= 5`);

for (const t of soLich) {
  // Ngưỡng đúng bằng ngưỡng báo động: dưới một nửa mức thường ngày là tin sẽ nổ.
  kiem(
    `${t.name} — sổ lịch ngày mai không mỏng tới mức tự kích báo động`,
    t.mai * 2 > Number(t.muc),
    `ngày mai ${t.mai} lịch, mức thường ngày ${t.muc} ⇒ báo động sẽ kêu oan mỗi ngày`,
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
