#!/usr/bin/env node
/**
 * BÙ NHỮNG NGÀY BÁN HÀNG CÒN THIẾU CHO CÁC TIỆM MẪU.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CẦN FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Bộ nạp dữ liệu mẫu (`seed-khach-lich-don-demo.mjs`) đóng cứng ngày "hôm nay"
 * ở dòng 165. Nó chạy một lần rồi thôi, nên mỗi ngày trôi qua là dữ liệu mẫu
 * lùi xa thêm một ngày. Đo 22/08: **cả 6 tiệm mẫu đều dừng ở 20/08** — mọi màn
 * "hôm nay" hiện số 0 và tiệm demo trông như đã ngừng bán. Đây là tài khoản
 * founder mở ra xem thử, nên nó không phải chuyện nhỏ.
 *
 * ⚠️ VÌ SAO KHÔNG SỬA THẲNG BỘ NẠP GỐC RỒI CHẠY LẠI. Đã soát: bộ nạp neo mỗi
 *   bản ghi bằng UUIDv5 dựng từ **số thứ tự chạy** (`…:don:<n>`). Dời mốc "hôm
 *   nay" làm đổi những ngày nào được coi là quá khứ, kéo theo đổi cách đánh số
 *   — nên đơn mới sinh ra sẽ TRÙNG ID với đơn cũ và bị bỏ qua im lặng, hoặc
 *   tệ hơn là gắn sai ngày. Chạy lại KHÔNG bù được ngày thiếu.
 *   ⇒ File này dùng KHÔNG GIAN TÊN RIÊNG (`…:bu:<ngày>:<n>`) neo theo NGÀY, nên
 *     không bao giờ đụng vào bản ghi của bộ nạp gốc, và chạy lại bao nhiêu lần
 *     cũng ra đúng một bộ.
 *
 * ⚠️ ĐƠN ĐI ĐÚNG ĐƯỜNG ĐỜI THẬT: nháp → thêm dòng hàng → thu tiền → xác nhận →
 *   hoàn tất. Chèn thẳng `status='completed'` thì `orders_bat_dau_tu_nhap` chặn
 *   ngay — và kể cả nếu lách được thì hoa hồng, trừ kho, tích điểm đều KHÔNG
 *   sinh ra, vì cả ba treo ở bước CHUYỂN trạng thái chứ không phải bước chèn.
 *
 * ⚠️ CHỈ BÁN SẢN PHẨM CÒN TỒN. Không có chốt nào chặn tồn kho âm ở tầng dữ
 *   liệu; bán bừa là màn Kho của tiệm demo hiện số âm — một lỗi nhìn thấy được
 *   do chính bộ dữ liệu mẫu gây ra.
 *
 * ⚠️ KÉO MỐC GIỜ CỦA PHIẾU QUỸ / DÒNG KHO VỀ ĐÚNG NGÀY CHỨNG TỪ. Trigger sinh
 *   chúng với `now()`, nên bù cho ngày hôm kia mà không kéo lại thì Sổ quỹ dồn
 *   hết vào hôm nay. Chỉ sửa MỐC, không đổi số tiền, không thêm dòng.
 *
 * CÁCH DÙNG
 *   node scripts/bu-ngay-thieu-demo.mjs            # bù tới hôm nay
 *   node scripts/bu-ngay-thieu-demo.mjs --xem      # chỉ nói sẽ làm gì, không ghi
 */
import pg from "pg";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const CHI_XEM = process.argv.includes("--xem");
/**
 * `--thu` — làm THẬT mọi bước rồi HOÀN TÁC, và đếm xem trigger có sinh đủ
 * hoa hồng / dòng kho / phiếu quỹ không.
 *
 * ⚠️ Cần chế độ này vì "chèn được" KHÔNG có nghĩa là "đúng". Đơn chèn thẳng
 *   sang trạng thái hoàn tất vẫn nằm trong bảng, nhưng ba thứ kéo theo thì
 *   không sinh ra và KHÔNG có gì báo lỗi — đúng cái bẫy đã làm tiệm mẫu có 87
 *   đơn mà bảng hoa hồng trống trơn.
 */
const CHAY_THU = process.argv.includes("--thu");
/** Chỉ làm cho một tiệm — dùng lúc thử cho nhanh. */
const CHI_TIEM = (process.argv.find((x) => x.startsWith("--tiem=")) ?? "").slice(7);

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
  console.error("❌ Thiếu SUPABASE_DB_URL.");
  process.exit(1);
}

/** UUIDv5 từ một tên gọi cố định — cùng tên thì cùng id, chạy lại không nhân đôi. */
const NEO = "6ba7b811-9dad-11d1-80b4-00c04fd430c8"; // namespace URL
function uuid5(ten) {
  const ns = Buffer.from(NEO.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(ten, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/**
 * Bộ sinh số CÓ HẠT GIỐNG — cùng tiệm, cùng ngày thì ra đúng cùng một "ngày bán
 * hàng". Không dùng `Math.random()`: chạy lại phải ra y hệt, nếu không thì lần
 * chạy thứ hai đẻ ra một ngày khác hẳn với ngày đã ghi.
 */
function boSinhSo(hat) {
  let s = 0;
  for (let i = 0; i < hat.length; i++) s = (s * 31 + hat.charCodeAt(i)) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();

const { rows: [{ hom_nay }] } = await c.query(`select public.ngay_vn()::text hom_nay`);
const themNgay = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Chỉ tiệm ĐÃ CÓ đơn mới là tiệm mẫu. Tiệm trống là tiệm thật của người khác
// hoặc tiệm nháp — bù đơn vào đó là bịa ra doanh thu cho một tiệm không bán gì.
const { rows: tiems } = await c.query(`
  select t.id, t.name,
    (select max((o.created_at at time zone 'Asia/Ho_Chi_Minh')::date)::text
       from public.orders o where o.tenant_id = t.id and o.deleted_at is null) ngay_cuoi
  from public.tenants t
  where t.deleted_at is null
    and exists (select 1 from public.orders o where o.tenant_id = t.id and o.deleted_at is null)
  order by t.name`);

let tongDon = 0;
for (const tiem of tiems) {
  if (CHI_TIEM && !tiem.name.toLowerCase().includes(CHI_TIEM.toLowerCase())) continue;
  const thieu = [];
  for (let d = themNgay(tiem.ngay_cuoi, 1); d <= hom_nay; d = themNgay(d, 1)) thieu.push(d);
  if (thieu.length === 0) {
    console.log(`✓ ${tiem.name} — đã đủ tới hôm nay`);
    continue;
  }

  // Nhịp bán của 14 ngày gần nhất, dùng làm khuôn cho ngày bù. Lấy số THẬT của
  // chính tiệm đó chứ không đặt một con số chung: quán cà phê 200 đơn/ngày,
  // phòng khám 20 — dùng chung một con số là bịa ra một tiệm không có thật.
  const { rows: nhip } = await c.query(`
    select count(*)::int n
      from public.orders o
     where o.tenant_id = $1 and o.deleted_at is null and o.kind = 'order'
       and o.status = 'completed'
       and (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date
           between $2::date - 14 and $2::date
     group by (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date`,
    [tiem.id, tiem.ngay_cuoi]);
  const mauSoDon = nhip.map((r) => r.n).filter((n) => n > 0);
  if (mauSoDon.length === 0) {
    console.log(`⚠️ ${tiem.name} — không đọc được nhịp bán, bỏ qua`);
    continue;
  }

  const { rows: khachs } = await c.query(
    `select id from public.contacts where tenant_id = $1 and deleted_at is null limit 400`,
    [tiem.id],
  );
  // ⚠️ LẤY ĐÚNG THỨ TIỆM ĐÓ THẬT SỰ ĐÃ BÁN, KHÔNG TỰ ĐẶT TỈ LỆ.
  //   Bản đầu đóng cứng "65% dịch vụ, 35% sản phẩm" — nghe hợp lý với tiệm spa,
  //   nhưng chạy thử thì BA tiệm bị bỏ qua: quán cà phê, cửa hàng mỹ phẩm và
  //   shop thời trang **không có dịch vụ nào**, chỉ bán hàng hoá. Một con số tôi
  //   nghĩ ra trong đầu không mô tả được cả sáu tiệm.
  //   Cách đúng: đếm những món đã bán 30 ngày qua rồi bốc theo TẦN SUẤT THẬT.
  //   Nó tự đúng cho mọi ngành, và còn giữ được cả "món nào bán chạy" — thứ
  //   không tỉ lệ nào nói ra được.
  //   Sản phẩm HẾT TỒN thì loại: không có chốt nào chặn tồn kho âm ở tầng dữ
  //   liệu, bán bừa là màn Kho hiện số âm.
  const { rows: monHangs } = await c.query(`
    with ton as (
      select i.id, coalesce(sum(m.qty), 0) con
        from public.items i
        left join public.stock_moves m on m.item_id = i.id
       where i.tenant_id = $1 group by 1
    )
    select l.item_id id,
           count(*)::int lan,
           -- ⚠️ GIÁ HAY GẶP NHẤT, KHÔNG PHẢI GIÁ TRUNG BÌNH. Bản đầu lấy trung
           --   bình, mà trung bình của những dòng CÓ GIẢM GIÁ ra một con số LẺ:
           --   146.661đ, 443.230đ, 482.093đ — trong khi giá thật của tiệm luôn
           --   tròn (150.000đ, 350.000đ). Nhìn vào đơn là thấy ngay nó không
           --   phải giá do người đặt ra.
           --   mode() trả về giá xuất hiện nhiều nhất, tức đúng giá niêm yết.
           mode() within group (order by l.unit_price_vnd)::bigint gia
      from public.order_lines l
      join public.orders o on o.id = l.order_id
      join public.items i on i.id = l.item_id
      join ton on ton.id = i.id
     where o.tenant_id = $1 and o.deleted_at is null
       and (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= $2::date - 30
       and l.qty > 0
       and (i.kind <> 'product' or ton.con >= 30)
     group by 1 order by 2 desc limit 60`,
    [tiem.id, tiem.ngay_cuoi]);
  // Bảng bốc thăm theo tần suất: món bán 40 lần có 40 ô, món bán 1 lần có 1 ô.
  const thung = monHangs.flatMap((m) => Array(Math.min(m.lan, 50)).fill(m));
  const { rows: thos } = await c.query(`
    select e.id, e.user_id from public.employees e
     where e.tenant_id = $1 and e.ended_on is null and e.user_id is not null limit 30`,
    [tiem.id]);
  const { rows: [nguoiGhi] } = await c.query(
    `select user_id from public.tenant_members where tenant_id = $1
      and role in ('owner','admin') limit 1`,
    [tiem.id],
  );

  if (khachs.length === 0 || thung.length === 0 || !nguoiGhi) {
    console.log(
      `⚠️ ${tiem.name} — bỏ qua (khách ${khachs.length}, món bán được ${thung.length}, chủ ${nguoiGhi ? "có" : "không"})`,
    );
    continue;
  }

  for (const ngay of thieu) {
    const rnd = boSinhSo(`${tiem.id}:${ngay}`);
    const soDon = mauSoDon[Math.floor(rnd() * mauSoDon.length)];
    const ids = [];

    if (CHI_XEM) {
      console.log(`  · ${tiem.name} ${ngay}: sẽ tạo ${soDon} đơn`);
      tongDon += soDon;
      continue;
    }

    await c.query("begin");
    try {
      for (let n = 1; n <= soDon; n++) {
        const donId = uuid5(`${tiem.id}:bu:${ngay}:${n}`);
        const { rows: daCo } = await c.query(`select 1 from public.orders where id = $1`, [donId]);
        if (daCo.length) continue;

        // Giờ bán rải trong ngày làm việc, không dồn hết vào một mốc.
        const gio = 8 + Math.floor(rnd() * 12);
        const phut = Math.floor(rnd() * 60);
        const luc = `${ngay} ${String(gio).padStart(2, "0")}:${String(phut).padStart(2, "0")}:00`;
        const khach = khachs[Math.floor(rnd() * khachs.length)].id;

        await c.query(
          `insert into public.orders (id, tenant_id, kind, contact_id, status, created_at, updated_at)
           values ($1, $2, 'order', $3, 'draft',
                   ($4::timestamp at time zone 'Asia/Ho_Chi_Minh'),
                   ($4::timestamp at time zone 'Asia/Ho_Chi_Minh'))`,
          [donId, tiem.id, khach, luc],
        );

        // 1–2 dòng hàng; món bốc từ thùng tần suất thật của chính tiệm đó.
        const soDong = rnd() < 0.55 ? 1 : 2;
        let tong = 0n;
        for (let k = 0; k < soDong; k++) {
          const mon = thung[Math.floor(rnd() * thung.length)];
          const sl = rnd() < 0.15 ? 2 : 1;
          const tho = thos.length ? thos[Math.floor(rnd() * thos.length)] : null;
          const gia = BigInt(mon.gia);
          tong += gia * BigInt(sl);
          await c.query(
            `insert into public.order_lines
               (id, tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd,
                performed_by_user_id, performed_by_employee_id, sort_order, created_at)
             values ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9,
                     ($10::timestamp at time zone 'Asia/Ho_Chi_Minh'))`,
            [uuid5(`${donId}:dong:${k}`), tiem.id, donId, mon.id, sl, mon.gia,
             tho?.user_id ?? null, tho?.id ?? null, k, luc],
          );
        }

        await c.query(
          `insert into public.order_payments
             (id, tenant_id, order_id, method, amount_vnd, received_by, received_at, created_at)
           values ($1, $2, $3, $4, $5, $6,
                   ($7::timestamp at time zone 'Asia/Ho_Chi_Minh'),
                   ($7::timestamp at time zone 'Asia/Ho_Chi_Minh'))`,
          // ⚠️ Tên cách thanh toán phải khớp CHECK của bảng: cash · bank_transfer
          //   · vietqr · points. Bản đầu ghi "transfer" — CSDL từ chối, và lỗi
          //   chỉ lộ ra lúc chạy chứ không lúc viết. Tỉ lệ lấy theo số THẬT của
          //   kho: tiền mặt nhiều nhất, rồi quét mã, rồi chuyển khoản.
          [uuid5(`${donId}:thu`), tiem.id, donId,
           (() => { const x = rnd(); return x < 0.42 ? "cash" : x < 0.79 ? "vietqr" : "bank_transfer"; })(),
           tong.toString(), nguoiGhi.user_id, luc],
        );

        // Hai bước RIÊNG — trigger hoa hồng/kho/điểm treo ở bước chuyển.
        await c.query(`update public.orders set status = 'confirmed' where id = $1`, [donId]);
        await c.query(`update public.orders set status = 'completed' where id = $1`, [donId]);
        // Trigger vừa chạm `updated_at` thành now(); trả nó về mốc chứng từ để
        // mọi báo cáo đọc theo ngày đều thấy đúng ngày.
        await c.query(
          `update public.orders set updated_at = ($2::timestamp at time zone 'Asia/Ho_Chi_Minh')
            where id = $1`,
          [donId, luc],
        );
        ids.push(donId);
      }

      if (ids.length) {
        // Kéo mốc của DỮ LIỆU KÉO THEO về đúng ngày chứng từ — xem cảnh báo đầu file.
        await c.query(
          `update public.cash_entries ce
              set created_at = o.created_at
             from public.orders o
            where ce.order_id = o.id and o.id = any($1)`,
          [ids],
        );
        // ⚠️ KHÔNG KÉO ĐƯỢC MỐC GIỜ CỦA DÒNG KHO, VÀ ĐÓ LÀ SẢN PHẨM ĐANG ĐÚNG.
        //   `stock_moves_immutable` chặn mọi lượt sửa: *"sổ kho không sửa được
        //   — ghi một dòng ngược lại thay vì sửa dòng cũ"*. Cùng nguyên tắc với
        //   sổ tiền.
        //   HỆ QUẢ THẬT, NÓI THẲNG: ngày bù cho hôm kia thì SỐ LƯỢNG tồn kho
        //   đúng, nhưng dòng ghi nhận mang mốc của lúc chạy bù. Chỉ lệch đúng
        //   phần bù dồn; chạy bù mỗi ngày thì mốc trùng luôn với ngày chứng từ.
        //   (Trên đường đi còn phát hiện một cái sai của chính bản đầu: dòng kho
        //   neo theo DÒNG HÀNG chứ không theo ĐƠN, nên câu update cũ khớp 0 dòng
        //   mà vẫn "chạy thành công" — một câu update khớp 0 dòng trông y hệt
        //   một câu update đúng.)
      }
      if (CHAY_THU) {
        const { rows: [d] } = await c.query(
          `select
             (select count(*) from public.commission_entries x where x.order_id = any($1))::int hoa_hong,
             (select count(*) from public.stock_moves x
                join public.order_lines ol on ol.id = x.ref_id
               where x.ref_type = 'order_line' and ol.order_id = any($1))::int dong_kho,
             (select count(*) from public.cash_entries x where x.order_id = any($1))::int phieu_quy`,
          [ids],
        );
        console.log(
          `  ~ THỬ ${tiem.name} ${ngay}: ${ids.length} đơn ⇒ hoa hồng ${d.hoa_hong} · dòng kho ${d.dong_kho} · phiếu quỹ ${d.phieu_quy}`,
        );
        await c.query("rollback");
        tongDon += ids.length;
        continue;
      }
      await c.query("commit");
      console.log(`  + ${tiem.name} ${ngay}: ${ids.length} đơn`);
      tongDon += ids.length;
    } catch (e) {
      await c.query("rollback");
      console.error(`  ✗ ${tiem.name} ${ngay}: ${e.message}`);
      throw e;
    }
  }
}

await c.end();
console.log(`\n${CHI_XEM ? "Sẽ tạo" : CHAY_THU ? "Đã thử (và hoàn tác)" : "Đã tạo"} tổng cộng ${tongDon} đơn.`);
// ════════════════════════════════════════════════════════════════════
// PHẦN HAI — BÙ LỊCH HẸN SẮP TỚI
// ════════════════════════════════════════════════════════════════════
// ⚠️ VÌ SAO PHẦN NÀY TỒN TẠI, VÀ NÓ LÀ HỆ QUẢ CỦA MỘT TÍNH NĂNG VỪA LÀM.
//   Báo động "ngày mai vắng bất thường" (#348) so số lịch của ngày mai với mức
//   thường ngày. Đo 22/08 trên chính tiệm demo: mức thường ngày 33,5 lịch,
//   nhưng MƯỜI ngày tới đều chỉ 11–16 lịch. Nghĩa là báo động sẽ kêu MỖI NGÀY
//   trên đúng tài khoản founder mở ra xem.
//   Đó là kịch bản tệ nhất mà thẻ thiết kế đã cảnh báo: "một tin báo sai là lần
//   sau họ tắt thông báo, và mọi tin sau đó — kể cả tin đúng — đều mất".
//
// ⚠️ LỖI NẰM Ở DỮ LIỆU MẪU, KHÔNG Ở LUẬT BÁO ĐỘNG. Bộ nạp gốc sinh ngày quá
//   khứ với mật độ đầy còn ngày tương lai với mật độ vơi — nó không mô phỏng
//   việc khách đặt dần trước bao lâu. Với tiệm THẬT thì phép so là đúng: ngày
//   mai còn nửa số lịch so với thường ngày đúng là chuyện đáng biết.
//   ⇒ Chữa dữ liệu, không nới luật. Nới luật là bịt mắt cả tiệm thật.
//
// ⚠️ CHỈ BÙ TỚI NGƯỠNG THƯỜNG NGÀY, KHÔNG NHỒI CHO ĐẦY. Lịch dày hơn cả mức
//   thường ngày cũng là một kiểu bịa — và nó làm mất luôn những ngày vắng THẬT
//   mà chủ tiệm nên nhìn thấy.

const NGAY_TOI = 14;
let tongLich = 0;

const c2 = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c2.connect();

const { rows: [{ hn }] } = await c2.query(`select public.ngay_vn()::text hn`);

for (const tiem of tiems) {
  if (CHI_TIEM && !tiem.name.toLowerCase().includes(CHI_TIEM.toLowerCase())) continue;

  const { rows: [nen] } = await c2.query(`
    with dai as (select generate_series(public.ngay_vn() - 14, public.ngay_vn() - 1, interval '1 day')::date d)
    select percentile_cont(0.5) within group (order by (
      select count(*) from public.appointments a
       where a.tenant_id = $1 and a.deleted_at is null
         and a.status not in ('cancelled','no_show')
         and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date = dai.d))::int tv
    from dai`, [tiem.id]);
  // Tiệm ít lịch thì báo động vốn đã không kêu (chốt ≥ 5 lịch trong #348) —
  // không cần bù, và bù vào là bịa ra một tiệm bận rộn không có thật.
  if (!nen.tv || nen.tv < 5) continue;

  const { rows: dichVus } = await c2.query(
    `select id from public.items where tenant_id = $1 and kind = 'service' limit 20`, [tiem.id]);
  const { rows: thos } = await c2.query(
    `select id, user_id from public.employees
      where tenant_id = $1 and ended_on is null and user_id is not null limit 30`, [tiem.id]);
  const { rows: khachs } = await c2.query(
    `select id from public.contacts where tenant_id = $1 and deleted_at is null limit 400`, [tiem.id]);
  if (dichVus.length === 0 || thos.length === 0 || khachs.length === 0) continue;

  for (let i = 1; i <= NGAY_TOI; i++) {
    const ngay = themNgay(hn, i);
    const { rows: [dang] } = await c2.query(`
      select count(*)::int n from public.appointments
       where tenant_id = $1 and deleted_at is null and status not in ('cancelled','no_show')
         and (start_at at time zone 'Asia/Ho_Chi_Minh')::date = $2::date`, [tiem.id, ngay]);
    const rnd = boSinhSo(`${tiem.id}:lich:${ngay}`);
    // Đích: quanh mức thường ngày, lệch ±15% cho khỏi phẳng lì.
    const dich = Math.round(nen.tv * (0.9 + rnd() * 0.3));
    const canThem = dich - dang.n;
    if (canThem <= 0) continue;

    if (CHI_XEM) {
      console.log(`  · ${tiem.name} ${ngay}: lịch ${dang.n}/${dich}, sẽ thêm ${canThem}`);
      tongLich += canThem;
      continue;
    }

    await c2.query("begin");
    try {
      let them = 0;
      for (let n = 0; n < canThem; n++) {
        // Ô giờ 30 phút, ca dài 25 phút ⇒ không ca nào chồng ca nào. Bảng có
        // ràng buộc loại trừ theo (tiệm, thợ, khoảng giờ), nên đây không phải
        // chuyện thẩm mỹ mà là điều kiện để câu ghi chạy được.
        const tho = thos[(n + Math.floor(rnd() * thos.length)) % thos.length];
        const o = n % 24;
        const gio = 8 + Math.floor(o / 2);
        const phut = (o % 2) * 30;
        const bd = `${ngay} ${String(gio).padStart(2, "0")}:${String(phut).padStart(2, "0")}:00`;
        const kt = `${ngay} ${String(gio).padStart(2, "0")}:${String(phut + 25).padStart(2, "0")}:00`;
        const id = uuid5(`${tiem.id}:bu-lich:${ngay}:${n}`);
        const { rows: daCo } = await c2.query(`select 1 from public.appointments where id = $1`, [id]);
        if (daCo.length) continue;
        // ⚠️ ĐIỂM LƯU CHO TỪNG Ô GIỜ, KHÔNG HOÀN TÁC CẢ NGÀY. Bản đầu bắt lỗi
        //   trùng giờ bằng `rollback` rồi `begin` lại — tức là VỨT hết những ca
        //   đã thêm được trong ngày đó, trong khi biến đếm vẫn cộng như thường.
        //   Nó sẽ báo "thêm 14 ca" rồi ghi vào có 3. Một câu báo cáo sai còn tệ
        //   hơn không báo cáo.
        await c2.query("savepoint o");
        try {
          await c2.query(
            `insert into public.appointments
               (id, tenant_id, contact_id, item_id, staff_user_id, staff_employee_id,
                start_at, end_at, status, price_vnd, source)
             values ($1, $2, $3, $4, $5, $6,
                     ($7::timestamp at time zone 'Asia/Ho_Chi_Minh'),
                     ($8::timestamp at time zone 'Asia/Ho_Chi_Minh'),
                     'booked', 0, 'calendar')`,
            [id, tiem.id, khachs[Math.floor(rnd() * khachs.length)].id,
             dichVus[Math.floor(rnd() * dichVus.length)].id, tho.user_id, tho.id, bd, kt],
          );
          await c2.query("release savepoint o");
          them += 1;
        } catch (e) {
          await c2.query("rollback to savepoint o");
          // Ô giờ đó đã có ca của chính thợ ấy (lịch cũ của bộ nạp gốc) — bỏ
          // qua đúng ô đó, giữ nguyên phần còn lại của ngày.
          if (!/appointments_no_overlap/.test(e.message)) throw e;
        }
      }
      if (CHAY_THU) {
        console.log(`  ~ THỬ lịch ${tiem.name} ${ngay}: thêm ${them}`);
        await c2.query("rollback");
      } else {
        await c2.query("commit");
        if (them) console.log(`  + lịch ${tiem.name} ${ngay}: thêm ${them}`);
      }
      tongLich += them;
    } catch (e) {
      await c2.query("rollback");
      console.error(`  ✗ lịch ${tiem.name} ${ngay}: ${e.message}`);
      throw e;
    }
  }
}
await c2.end();
console.log(
  `${CHI_XEM ? "Sẽ thêm" : CHAY_THU ? "Đã thử (và hoàn tác)" : "Đã thêm"} ${tongLich} lịch hẹn sắp tới.`,
);
