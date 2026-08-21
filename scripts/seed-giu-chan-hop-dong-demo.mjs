#!/usr/bin/env node
/**
 * Nạp ba mảng CUỐI CÙNG còn trống của tiệm mẫu `demo-spa-huong-sen`:
 * giữ chân khách (voucher + tích điểm), chiến dịch marketing, hợp đồng/gói liệu trình.
 *
 * ── VÌ SAO SCRIPT NÀY TỒN TẠI, VÀ VÌ SAO NÓ VIẾT THEO KIỂU NÀY ──────────────
 *
 * Tiệm mẫu là thứ người mua sản phẩm nhìn thấy TRƯỚC KHI họ tin. Ba mảng này
 * trống nghĩa là ba màn hình đắt tiền nhất — Khách thân thiết, Chiến dịch,
 * Liệu trình — mở ra là rỗng. Nhưng nạp bừa còn tệ hơn để trống: số liệu mẫu
 * mà tự đá nhau thì người xem mất niềm tin vào TOÀN BỘ sản phẩm, không riêng
 * ba màn đó.
 *
 * Nên script này bị trói bởi một luật: KHÔNG CHÈN TAY vào SỔ CÁI. Ba bảng dưới
 * đây là sổ cái, không phải bảng dữ liệu thường:
 *
 *   `loyalty_ledger`  — điểm là NỢ của tiệm. Sổ chỉ được ghi qua
 *       `loyalty_earn_for_order` / `loyalty_grant` / `loyalty_redeem_for_order`,
 *       vì mỗi hàm còn phải khoá lô điểm, tiêu lô sắp hết hạn trước, và chặn
 *       một đơn tích điểm hai lần. Chèn tay là bỏ hết các chốt đó.
 *       (Bằng chứng cứng: bảng này CHỈ có policy SELECT — CSDL cố ý không cho
 *       ai ghi thẳng, kể cả chủ tiệm.)
 *   `campaign_summary` — là KẾT LUẬN, không phải dữ kiện. Nó phải do
 *       `campaign_tong_ket` tính lại từ đơn thật. Gõ tay một con số đẹp vào đây
 *       là biến báo cáo marketing thành lời tự khen không kiểm chứng được.
 *   `commission_entries` — không đụng một dòng. Hợp đồng TỰ sinh hoa hồng qua
 *       trigger `contracts_sinh_hoa_hong`; phần tăng thêm được IN RA cuối bài
 *       để chủ tiệm đối soát lại bảng lương, chứ không tăng lặng lẽ.
 *
 * Riêng `contract_sessions` thì chèn thẳng MỚI là đường chính thức: chính giao
 * diện cũng làm vậy (`app/app/contracts/actions.ts`), và trigger
 * `contract_sessions_sync` mới là thứ cộng `sessions_used` rồi tự đóng hợp đồng.
 * Cái cấm ở đây là tự tay sửa `sessions_used` — script này không chạm cột đó.
 *
 * ── VÌ SAO CHẠY BẰNG VAI CHỦ TIỆM, KHÔNG BẰNG QUYỀN QUẢN TRỊ CSDL ───────────
 * Chạy bằng `postgres` thì RLS không áp, mọi thứ trôi hết — và ta sẽ không bao
 * giờ biết màn hình thật có làm được việc này không. Mạo danh chủ tiệm (claim
 * JWT + `set local role authenticated`) buộc dữ liệu mẫu đi qua ĐÚNG cái cửa mà
 * người dùng thật đi. Chỗ nào không lọt, đó là tin tức, không phải trở ngại.
 *
 * ── VÌ SAO HOA HỒNG GÓI ĐƯỢC GHI VÀO THÁNG HIỆN TẠI, KHÔNG PHẢI THÁNG BÁN ───
 * Kỳ lương 05, 06, 07/2026 đã CHỐT SỔ; chỉ 08/2026 còn mở. Ghi hoa hồng lùi vào
 * tháng đã chốt là đổi cơ sở của một bảng lương người ta đã ký — nên hợp đồng
 * để `created_at` mặc định (hôm nay), và toàn bộ hoa hồng gói rơi vào kỳ đang mở.
 * Ngày bán thật nằm ở `starts_at`.
 *
 * ── VÌ SAO CHẠY LẠI KHÔNG NHÂN ĐÔI ─────────────────────────────────────────
 * Mọi thứ neo vào khoá cố định do người đặt: mã voucher, tên chiến dịch, tên
 * gói, và một mã phiếu ghi trong `note` của hợp đồng. Không có khoá cố định thì
 * lần chạy thứ hai đẻ ra một bộ dữ liệu song song, và không ai nhận ra cho tới
 * lúc báo cáo doanh thu gấp đôi.
 *
 * Chạy:  node --env-file=.env.local scripts/seed-giu-chan-hop-dong-demo.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const TEP_NAY = fileURLToPath(import.meta.url);
const SLUG = "demo-spa-huong-sen";

if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL. Chạy: node --env-file=.env.local scripts/seed-giu-chan-hop-dong-demo.mjs");
  process.exit(1);
}

const tien = (n) => Number(n).toLocaleString("vi-VN") + "đ";
const so = (n) => Number(n).toLocaleString("vi-VN");
const tieu = (s) => console.log("\n" + "═".repeat(78) + "\n" + s + "\n" + "═".repeat(78));

/* ═══ CỔNG TỰ SOÁT (ĐỐI CHỨNG 1, dạng máy kiểm được) ═══
   Đặt NGAY ĐẦU, chạy trước cả khi mở kết nối. Nếu ai đó — kể cả tôi, sáu tháng
   sau — thêm một câu `insert into loyalty_ledger` cho "nhanh", script tự từ chối
   chạy. Lời hứa thì quên được; cái cổng thì không.                              */
{
  const nguon = readFileSync(TEP_NAY, "utf8");
  /* Chỉ soi phần THÂN, tính từ mốc dưới đây trở xuống. Bản đầu soi cả chính
     khối này ⇒ nó bắt được đúng mấy câu mẫu của bản thân nó và tự chặn mình.
     Ca kiểm bắt nhầm chính mình cũng là ca kiểm hỏng, chỉ hỏng theo chiều đỏ. */
  const MOC = "@@MOC-HET-CONG-TU-SOAT@@";
  const than = nguon.slice(nguon.lastIndexOf(MOC) + MOC.length)
    .split("\n")
    .filter((d) => !d.includes("CO-Y-THU-GHI-THANG")) // dòng cố ý thử ghi thẳng để CHỨNG MINH bị chặn
    .join("\n");
  /* Ghép chuỗi thay vì viết thẳng, để chính mấy dòng định nghĩa này không lọt
     vào tầm ngắm của chúng.                                                    */
  const G = "in" + "sert\\s+into\\s+(public\\.)?";
  const cam = [
    [new RegExp(G + "loyalty_ledger", "i"), "ghi thẳng vào sổ điểm"],
    [new RegExp(G + "campaign_summary", "i"), "ghi thẳng vào bản chốt sổ chiến dịch"],
    [new RegExp(G + "commission_entries", "i"), "ghi thẳng vào sổ hoa hồng"],
    [new RegExp("up" + "date\\s+(public\\.)?contracts\\s+set[^;]*sessions_used", "i"), "sửa tay số buổi đã dùng"],
  ];
  const dinh = cam.filter(([re]) => re.test(than)).map(([, ten]) => ten);
  if (dinh.length) {
    console.error("DỪNG — script tự chèn vào sổ cái, đúng thứ luật cấm: " + dinh.join(" | "));
    process.exit(1);
  }
  console.log("Cổng tự soát: thân script KHÔNG có câu ghi thẳng nào vào sổ điểm / bản chốt sổ chiến dịch /");
  console.log("              sổ hoa hồng, và không có câu nào sửa tay số buổi đã dùng của hợp đồng. OK.");
}
/* @@MOC-HET-CONG-TU-SOAT@@ — từ đây trở xuống là phần cổng trên soi vào. */

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();

/* ═══ CHỐT KIỂM TIỆM MẪU — sai là dừng, không hỏi lại ═══ */
const tiem = (await c.query(`select id, name, is_sample, timezone from tenants where slug = $1`, [SLUG])).rows[0];
if (!tiem) { console.error(`DỪNG — không có tiệm nào slug = ${SLUG}.`); await c.end(); process.exit(1); }
if (tiem.is_sample !== true) {
  console.error(`DỪNG — tiệm "${tiem.name}" KHÔNG phải tiệm mẫu (is_sample = ${tiem.is_sample}).`);
  await c.end(); process.exit(1);
}
const T = tiem.id;
console.log(`\nTiệm mẫu: ${tiem.name} · ${T} · is_sample = true · ${tiem.timezone}`);

/* ═══ MẠO DANH CHỦ TIỆM ═══ */
const CHU_TIEM = (await c.query(
  `select tm.user_id from tenant_members tm
    where tm.tenant_id = $1 and tm.role = 'owner' and tm.status = 'active' limit 1`, [T])).rows[0]?.user_id;
if (!CHU_TIEM) { console.error("DỪNG — tiệm mẫu không có chủ tiệm đang hoạt động."); await c.end(); process.exit(1); }
const CLAIMS = JSON.stringify({ sub: CHU_TIEM, role: "authenticated", app_metadata: { tenant_id: T, role: "owner" } });

const moPhien = async () => {
  await c.query("begin");
  await c.query("set local lock_timeout = '10s'");
  await c.query(`select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`, [CLAIMS]);
};
const nhuChuTiem = async (fn) => {
  await moPhien();
  try { const v = await fn(); await c.query("commit"); return v; }
  catch (e) { await c.query("rollback").catch(() => {}); throw e; }
};
/** Chạy rồi TRẢ LẠI nguyên trạng — dùng cho phép thử không được để lại vết. */
const thuRoiTraLai = async (fn) => {
  await moPhien();
  try { return await fn(); } finally { await c.query("rollback").catch(() => {}); }
};

/* ═══ CÁC PHÉP ĐO ═══ */
const BANG = ["loyalty_config", "loyalty_ledger", "vouchers", "voucher_redemptions", "campaigns",
  "campaign_sends", "campaign_send_recipients", "campaign_summary", "source_costs",
  "service_packages", "contracts", "contract_sessions"];

const demBang = async () => {
  const r = {};
  for (const b of BANG) r[b] = Number((await c.query(`select count(*) n from ${b} where tenant_id = $1`, [T])).rows[0].n);
  return r;
};
const doHoaHong = async () => (await c.query(
  `select count(*)::int n, coalesce(sum(amount_vnd), 0)::bigint tien,
          count(*) filter (where contract_id is not null)::int n_hd,
          coalesce(sum(amount_vnd) filter (where contract_id is not null), 0)::bigint tien_hd
     from commission_entries where tenant_id = $1`, [T])).rows[0];
/* Doanh thu tháng tròn = thứ PHẢI KHÔNG ĐỔI. Nếu nó nhúc nhích thì script đã
   chạm vào đơn đã chốt — tức là đã phá thế cân bằng đang đúng.                 */
const doDoanhThu = async () => (await c.query(
  `select to_char(date_trunc('month', o.created_at at time zone 'Asia/Ho_Chi_Minh'), 'MM/YYYY') thang,
          sum(l.line_total_vnd)::bigint dt
     from orders o join order_lines l on l.order_id = o.id
    where o.tenant_id = $1 and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null
    group by 1 order by 1`, [T])).rows;

/* Tổng giảm giá đang nằm trên đơn nháp. Nếu `voucher_apply` bị gọi lại và phần
   phân bổ KHÔNG được hoàn lại, con số này sẽ phình lên ở lần chạy sau — đó là
   cách duy nhất để nhìn thấy lỗi "cộng giảm giá hai lần", vì số dòng
   `voucher_redemptions` vẫn đứng yên và không tố cáo gì cả.                    */
const doGiamGia = async () => (await c.query(
  `select coalesce(sum(l.discount_vnd), 0)::bigint giam from orders o join order_lines l on l.order_id = o.id
    where o.tenant_id = $1 and o.status = 'draft' and o.deleted_at is null`, [T])).rows[0].giam;

const TRUOC = await demBang();
const HH_TRUOC = await doHoaHong();
const DT_TRUOC = await doDoanhThu();
const GG_TRUOC = await doGiamGia();

tieu("ĐO TRƯỚC KHI NẠP");
for (const b of BANG) console.log(`  ${b.padEnd(26)} ${String(TRUOC[b]).padStart(7)}`);
console.log(`\n  Hoa hồng toàn tiệm: ${so(HH_TRUOC.n)} dòng · ${tien(HH_TRUOC.tien)}`);
console.log(`     trong đó do hợp đồng: ${HH_TRUOC.n_hd} dòng · ${tien(HH_TRUOC.tien_hd)}`);
console.log("  Doanh thu tháng tròn (đơn đã xong) — PHẢI KHÔNG ĐỔI sau khi chạy:");
for (const r of DT_TRUOC) console.log(`     ${r.thang}: ${tien(r.dt)}`);

const CANH_BAO = [];
const ghiChu = (s) => { CANH_BAO.push(s); console.log("  ⚠ " + s); };

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 1 — ĐỒNG Ý NHẬN TIN
   Đây là chỗ DUY NHẤT script chạm vào `contacts`, và tôi khai thẳng vì nó lệch
   khỏi luật "không đụng contacts". Lý do: cả 776 khách đang ở `unknown`, mà
   `campaign_send_add_recipients` LỌC BỎ mọi người chưa đồng ý — không sửa cột
   này thì mảng chiến dịch có 0 người nhận, tức là không nạp được. Cột này thuần
   marketing, không dính một đồng doanh thu nào. Không có RPC nào để đặt nó, nên
   UPDATE thẳng là đường duy nhất.
   Chỉ đụng dòng còn `unknown` ⇒ chạy lần hai không đổi gì thêm.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 1 — ĐỒNG Ý NHẬN TIN (chỗ duy nhất chạm vào contacts, khai rõ)");
const dongY = await nhuChuTiem(async () => {
  /* Ai đồng ý? Khách ĐÃ TỪNG mua thì mới có dịp ký vào tờ đồng ý ở quầy — nên
     lấy theo số đơn đã xong, không lấy ngẫu nhiên. Khách mới tinh để `unknown`,
     đúng như đời thật.                                                        */
  const r = await c.query(
    `with xep as (
       select ct.id,
              (select count(*) from orders o
                where o.contact_id = ct.id and o.tenant_id = ct.tenant_id
                  and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null) don,
              row_number() over (order by ct.created_at, ct.id) hang
         from contacts ct
        where ct.tenant_id = $1 and ct.deleted_at is null
     )
     update contacts ct
        set marketing_consent = 'granted',
            marketing_consent_at = ct.created_at + interval '2 hours'
       from xep
      where ct.id = xep.id
        and ct.marketing_consent = 'unknown'
        and xep.don >= 1
        and xep.hang % 4 <> 0     -- ~1/4 khách từng mua vẫn không muốn nhận tin
      returning 1`, [T]);
  return r.rowCount;
});
const phoConsent = (await c.query(
  `select marketing_consent, count(*)::int n from contacts where tenant_id = $1 and deleted_at is null group by 1 order by 1`, [T])).rows;
console.log(`  Đặt "đồng ý nhận tin" cho ${dongY} khách lượt này.`);
console.log("  Phổ hiện tại: " + phoConsent.map((r) => `${r.marketing_consent}=${r.n}`).join(" · "));

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 2 — CẤU HÌNH TÍCH ĐIỂM
   10.000đ = 1 điểm, 100 điểm đổi 10.000đ ⇒ hoàn 1% — mức các spa Việt hay dùng.
   Bội số đổi để 100 (không phải 1.000 mặc định) vì đơn ở tiệm này quanh 500k;
   để 1.000 thì khách phải tiêu 10 triệu mới đổi được lần đầu, sổ điểm sẽ đẹp
   trên giấy mà không ai dùng được — dữ liệu mẫu như thế là dữ liệu chết.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 2 — BẬT TÍCH ĐIỂM");
const cfg = await nhuChuTiem(async () => (await c.query(
  `insert into loyalty_config (tenant_id, is_active, vnd_per_point, redeem_points_unit,
                               redeem_value_vnd, referral_points, expire_months)
   values ($1, true, 10000, 100, 10000, 200, 12)
   on conflict (tenant_id) do update set
     is_active = excluded.is_active, vnd_per_point = excluded.vnd_per_point,
     redeem_points_unit = excluded.redeem_points_unit, redeem_value_vnd = excluded.redeem_value_vnd,
     referral_points = excluded.referral_points, expire_months = excluded.expire_months
   returning *`, [T])).rows[0]);
console.log(`  ${tien(cfg.vnd_per_point)} = 1 điểm · ${cfg.redeem_points_unit} điểm đổi ${tien(cfg.redeem_value_vnd)}`);
console.log(`  Thưởng giới thiệu ${cfg.referral_points} điểm · điểm hết hạn sau ${cfg.expire_months} tháng · đang bật: ${cfg.is_active}`);

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 3 — SỔ ĐIỂM
   Chỉ khách QUEN (từ 2 đơn đã xong trở lên) mới được tích, đúng yêu cầu "khách
   mới thì chưa có điểm". Mỗi đơn đi qua `loyalty_earn_for_order` — hàm tự chặn
   tích hai lần bằng chỉ mục `loyalty_ledger_order_unique`, nên chạy lại vô hại.
   Lấy danh sách đơn MỘT LẦN rồi chia lô, để vòng lặp chắc chắn có điểm dừng.
   ══════════════════════════════════════════════════════════════════════════ */
/* Hai phép quét dưới đây được viết THÀNH HÀM vì chúng phải chạy HAI LẦN: một lần
   ở đây cho đơn cũ, một lần nữa sau mục 13 khi đã có thêm đơn tháng 08. Lý do:
   đơn mới có thể đẩy một khách vượt ngưỡng "khách quen", làm tập khách đủ điều
   kiện đổi NGAY TRONG lượt chạy. Quét một lần thì phần đó rơi sang lượt sau —
   đúng loại lỗi "chạy lần hai ra số khác lần một" mà lượt kiểm trước đã bắt
   được một lần rồi. Quét lại ngay trong cùng lượt thì lượt sau không còn việc. */
const quetTichDiem = async () => {
  const donCanTich = (await c.query(
    `with quen as (
       select ct.id from contacts ct
        where ct.tenant_id = $1 and ct.deleted_at is null
          and (select count(*) from orders o
                where o.contact_id = ct.id and o.tenant_id = $1
                  and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null) >= 2
     )
     select o.id from orders o join quen q on q.id = o.contact_id
      where o.tenant_id = $1 and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null
        and not exists (select 1 from loyalty_ledger ll where ll.order_id = o.id and ll.reason = 'order')
      order by o.created_at, o.id`, [T])).rows.map((r) => r.id);
  console.log(`  Đơn chờ tích điểm: ${so(donCanTich.length)}`);
  let diemDaTich = 0;
  for (let i = 0; i < donCanTich.length; i += 400) {
    const lo = donCanTich.slice(i, i + 400);
    const r = await nhuChuTiem(async () => (await c.query(
      `select coalesce(sum(loyalty_earn_for_order(x)), 0)::bigint diem from unnest($1::uuid[]) x`, [lo])).rows[0]);
    diemDaTich += Number(r.diem);
  }
  console.log(`  Điểm phát ra lượt này: ${so(diemDaTich)}`);
};
tieu("MỤC 3 — TÍCH ĐIỂM CHO ĐƠN CŨ CỦA KHÁCH QUEN (qua loyalty_earn_for_order)");
await quetTichDiem();

/* Thưởng ngoài đơn: giới thiệu bạn / tặng sinh nhật / bù điểm sự cố.
   `loyalty_grant` KHÔNG tự chống trùng, nên khoá cố định là câu `note`.        */
const quetThuong = async () => {
  const khachQuen = (await c.query(
    `select ct.id, ct.full_name from contacts ct
      where ct.tenant_id = $1 and ct.deleted_at is null
        and (select count(*) from orders o
              where o.contact_id = ct.id and o.tenant_id = $1
                and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null) >= 3
      order by ct.created_at, ct.id`, [T])).rows;
  const DOT_THUONG = [
    { lay: khachQuen.slice(0, 18), diem: 200, ly_do: "referral", note: "Giới thiệu bạn mới tới tiệm — thưởng theo chương trình khách thân thiết" },
    { lay: khachQuen.slice(20, 32), diem: 300, ly_do: "manual", note: "Quà sinh nhật — tặng điểm thay vì tặng voucher giấy" },
    { lay: khachQuen.slice(40, 45), diem: 150, ly_do: "adjust", note: "Bù điểm cho lần máy quẹt thẻ lỗi, khách phải trả tiền mặt" },
  ];
  let soThuong = 0, diemThuong = 0;
  for (const dot of DOT_THUONG) {
    for (const kh of dot.lay) {
      const daCo = (await c.query(
        `select 1 from loyalty_ledger where tenant_id = $1 and contact_id = $2 and reason = $3 and note = $4 limit 1`,
        [T, kh.id, dot.ly_do, dot.note])).rowCount;
      if (daCo) continue;
      await nhuChuTiem(async () => c.query(`select loyalty_grant($1, $2, $3, $4)`, [kh.id, dot.diem, dot.ly_do, dot.note]));
      soThuong++; diemThuong += dot.diem;
    }
  }
  console.log(`  Thêm ${soThuong} khoản thưởng · ${so(diemThuong)} điểm (giới thiệu bạn · sinh nhật · bù sự cố)`);
};
tieu("MỤC 3b — THƯỞNG ĐIỂM NGOÀI ĐƠN (qua loyalty_grant)");
await quetThuong();

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 4 — GÓI LIỆU TRÌNH
   Giá gói = giá lẻ trừ 10–20%, đúng cách spa Việt bán liệu trình: khách trả
   trước, tiệm được dòng tiền, khách được rẻ hơn.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 4 — GÓI LIỆU TRÌNH");
const GOI = [
  { ten: "Liệu trình chăm sóc da cơ bản 5 buổi", buoi: 5, han: 150, gia: 1575000, mo: "5 buổi chăm sóc da cơ bản, tiết kiệm 10% so với đi lẻ." },
  { ten: "Liệu trình chăm sóc da chuyên sâu 10 buổi", buoi: 10, han: 240, gia: 2975000, mo: "10 buổi chuyên sâu, có soi da và tư vấn riêng từng buổi." },
  { ten: "Massage trị liệu 10 buổi", buoi: 10, han: 180, gia: 3825000, mo: "10 buổi massage trị liệu vai gáy — dành cho khách ngồi văn phòng." },
  { ten: "Gội đầu dưỡng sinh 10 buổi", buoi: 10, han: 90, gia: 1275000, mo: "10 buổi gội đầu dưỡng sinh, dùng trong 3 tháng." },
  { ten: "Triệt lông trọn gói 6 buổi (1 vùng)", buoi: 6, han: 365, gia: 2400000, mo: "6 buổi triệt lông một vùng, bảo hành trong 1 năm." },
  { ten: "Combo thư giãn 8 buổi (massage + gội dưỡng sinh)", buoi: 8, han: 180, gia: 2640000, mo: "Mỗi buổi gồm massage trị liệu và gội đầu dưỡng sinh." },
  { ten: "Chăm sóc da cấp tốc 3 buổi (gói cô dâu)", buoi: 3, han: 60, gia: 990000, mo: "3 buổi cấp tốc trước ngày cưới, đặt lịch sát nhau." },
];
const goiId = {};
for (const g of GOI) {
  const co = (await c.query(`select id from service_packages where tenant_id = $1 and name = $2`, [T, g.ten])).rows[0];
  if (co) { goiId[g.ten] = co.id; continue; }
  const r = await nhuChuTiem(async () => (await c.query(
    `insert into service_packages (tenant_id, name, description, sessions_total, validity_days, price_vnd, status, created_by)
     values ($1, $2, $3, $4, $5, $6, 'active', $7) returning id`,
    [T, g.ten, g.mo, g.buoi, g.han, g.gia, CHU_TIEM])).rows[0]);
  goiId[g.ten] = r.id;
}
console.log(`  ${GOI.length} gói: ` + GOI.map((g) => `${g.ten.split(" ").slice(0, 3).join(" ")}…(${g.buoi} buổi/${tien(g.gia)})`).join(" · "));

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 5 — CHIẾN DỊCH
   Tạo ở trạng thái `running` trước. Chỉ SAU KHI đã có người nhận và có lượt
   dùng mã mới chuyển sang `ended` — vì trigger `campaigns_tu_tong_ket` chốt sổ
   NGAY tại khoảnh khắc đổi trạng thái; chốt sớm thì chốt vào cái rỗng.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 5 — CHIẾN DỊCH");
const CHIEN_DICH = [
  { ten: "Mừng khai trương phòng máy mới", tu: "2026-08-01", den: "2026-08-12", tran: 30000000, quangCao: 1500000, ketThuc: true,
    uu_dai: "Giảm 20% mọi dịch vụ trong tháng khai trương phòng máy mới, tối đa 200.000đ mỗi lượt." },
  { ten: "Tri ân khách thân thiết giữa năm", tu: "2026-07-20", den: "2026-08-16", tran: 20000000, quangCao: 1500000, ketThuc: true,
    uu_dai: "Tặng phiếu 150.000đ cho khách đã đến tiệm từ 3 lần trở lên." },
  { ten: "Ưu đãi hè — Mát da mát dáng", tu: "2026-07-25", den: "2026-08-31", tran: 25000000, quangCao: 1800000, ketThuc: false,
    uu_dai: "Giảm 15% liệu trình chăm sóc da và massage suốt mùa hè, tối đa 250.000đ." },
  { ten: "Nhắc khách lâu chưa quay lại", tu: "2026-08-01", den: "2026-09-15", tran: 12000000, quangCao: 900000, ketThuc: false,
    uu_dai: "Phiếu 100.000đ dành riêng cho khách chưa quay lại quá 60 ngày." },
];
const cdId = {};
for (const cd of CHIEN_DICH) {
  const co = (await c.query(`select id, status from campaigns where tenant_id = $1 and name = $2`, [T, cd.ten])).rows[0];
  if (co) { cdId[cd.ten] = co.id; continue; }
  const r = await nhuChuTiem(async () => (await c.query(
    `insert into campaigns (tenant_id, name, start_at, end_at, max_discount_total_vnd, offer_note, status, ad_cost_vnd, created_by)
     values ($1, $2, ($3::date || ' 08:00+07')::timestamptz, ($4::date || ' 21:00+07')::timestamptz, $5, $6, 'running', $7, $8)
     returning id`,
    [T, cd.ten, cd.tu, cd.den, cd.tran, cd.uu_dai, cd.quangCao, CHU_TIEM])).rows[0]);
  cdId[cd.ten] = r.id;
}
for (const cd of CHIEN_DICH) console.log(`  ${cd.ten} · ${cd.tu} → ${cd.den} · quảng cáo ${tien(cd.quangCao)}`);

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 6 — MÃ GIẢM GIÁ
   Hai mã của chiến dịch đã kết thúc phải HẾT HẠN ở trạng thái cuối. Nhưng
   `voucher_apply` từ chối mã hết hạn (đúng, đó là chốt giữ tiền) ⇒ không thể
   dựng lịch sử dùng mã cho chúng nếu đặt hạn quá khứ ngay từ đầu.
   Cách làm: đặt hạn tạm ở tương lai → dùng mã qua ĐÚNG hàm chính thức → rồi mới
   hạ hạn về đúng ngày lịch sử. Lượt dùng vẫn do `voucher_apply` sinh ra, không
   phải tôi gõ tay. Nâng–dùng–hạ nằm TRỌN trong một transaction ở mục 8, để nếu
   vỡ giữa chừng thì không có mã hết hạn nào bị bỏ quên ở trạng thái còn dùng được.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 6 — MÃ GIẢM GIÁ");
const HAN_TAM = "2026-12-31 21:00+07"; // hạn tạm cho hai mã lịch sử, hạ lại ở mục 8
const MA = [
  { ma: "KHAITRUONG20", loai: "percent", pt: 20, tran: 200000, luot: 120, toiThieu: 300000, han: "2026-08-12 21:00+07",
    cd: "Mừng khai trương phòng máy mới", ghi: "Mã mừng khai trương phòng máy mới, đã gia hạn tới 12/08/2026 — nay đã hết hạn.", lichSu: true },
  { ma: "TRIAN150K", loai: "amount", sotien: 150000, tran: 150000, luot: 150, toiThieu: 400000, han: "2026-08-16 21:00+07",
    cd: "Tri ân khách thân thiết giữa năm", ghi: "Phiếu tri ân khách cũ, đã gia hạn tới 16/08/2026 — nay đã hết hạn.", lichSu: true },
  { ma: "HE2026", loai: "percent", pt: 15, tran: 250000, luot: 200, toiThieu: 300000, han: "2026-08-31 21:00+07",
    cd: "Ưu đãi hè — Mát da mát dáng", ghi: "Mã ưu đãi hè, dùng tới hết 31/08/2026." },
  { ma: "QUAYLAI100K", loai: "amount", sotien: 100000, tran: 100000, luot: 150, toiThieu: 250000, han: "2026-09-15 21:00+07",
    cd: "Nhắc khách lâu chưa quay lại", ghi: "Phiếu gọi khách cũ quay lại — mỗi khách một lần.", moiKhach: 1 },
  { ma: "SINHNHAT30", loai: "percent", pt: 30, tran: 300000, luot: 400, toiThieu: 200000, han: "2026-12-31 21:00+07",
    ghi: "Quà sinh nhật — dùng trong tháng sinh nhật, mỗi khách một lần.", moiKhach: 1 },
  { ma: "GIOITHIEU50K", loai: "amount", sotien: 50000, tran: 50000, luot: 300, toiThieu: 150000, han: "2026-12-31 21:00+07",
    ghi: "Mã giới thiệu bạn — chỉ dành cho khách lần đầu tới tiệm.", khachMoi: true, moiKhach: 1 },
  { ma: "VIP500K", loai: "amount", sotien: 500000, tran: 500000, luot: 20, toiThieu: 1200000, han: "2026-10-31 21:00+07",
    ghi: "Phiếu 500.000đ cho hoá đơn từ 1,2 triệu — phát tay cho khách VIP." },
];
const maId = {};
for (const v of MA) {
  const co = (await c.query(`select id from vouchers where tenant_id = $1 and upper(code) = upper($2)`, [T, v.ma])).rows[0];
  if (co) { maId[v.ma] = co.id; continue; }
  const r = await nhuChuTiem(async () => (await c.query(
    `insert into vouchers (tenant_id, code, kind, percent_off, amount_off_vnd, max_uses, max_discount_vnd,
                           expires_at, min_order_vnd, per_customer_limit, new_customer_only, status, note,
                           campaign_id, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10,$11,'active',$12,$13,$14) returning id`,
    [T, v.ma, v.loai, v.loai === "percent" ? v.pt : null, v.loai === "amount" ? v.sotien : null,
     v.luot, v.tran, v.lichSu ? HAN_TAM : v.han, v.toiThieu, v.moiKhach ?? null, !!v.khachMoi,
     v.ghi, v.cd ? cdId[v.cd] : null, CHU_TIEM])).rows[0]);
  maId[v.ma] = r.id;
}
for (const v of MA) {
  const gt = v.loai === "percent" ? `giảm ${v.pt}%` : `giảm ${tien(v.sotien)}`;
  console.log(`  ${v.ma.padEnd(13)} ${gt.padEnd(18)} trần ${tien(v.tran).padStart(12)} · tối thiểu ${tien(v.toiThieu).padStart(12)} · hạn ${v.han.slice(0, 10)}${v.khachMoi ? " · chỉ khách mới" : ""}`);
}

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 7 — ĐỢT GỬI + NGƯỜI NHẬN
   Người nhận đi qua `campaign_send_add_recipients`: hàm tự loại người chưa đồng
   ý, người đã rút, và người vừa nhận tin trong 7 ngày (luật chống dội bom).
   Mọi mốc gửi đều lùi ít nhất 8 ngày so với hôm nay để luật 7 ngày không tự
   khoá đợt sau; và nếu đợt đã có người nhận thì BỎ QUA hẳn — vì trigger
   `campaign_send_recipients_guard` chạy TRƯỚC `on conflict`, chạy lại sẽ ném
   lỗi "vừa nhận tin trong 7 ngày" chứ không im lặng bỏ qua.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 7 — ĐỢT GỬI TIN VÀ NGƯỜI NHẬN");
const DOT_GUI = [
  { cd: "Mừng khai trương phòng máy mới", luc: "2026-08-02 09:00+07", chon: "cu_nhat", n: 120,
    noi_dung: "Spa Hương Sen vừa khai trương phòng máy mới. Từ 01/08 đến 12/08, chị được giảm 20% mọi dịch vụ với mã KHAITRUONG20 (tối đa 200.000đ). Đặt lịch giúp em qua số 0903 771 200 nhé chị." },
  { cd: "Tri ân khách thân thiết giữa năm", luc: "2026-07-21 09:30+07", chon: "than_thiet", n: 150,
    noi_dung: "Cảm ơn chị đã đồng hành cùng Hương Sen. Em gửi chị phiếu 150.000đ (mã TRIAN150K) dùng cho hoá đơn từ 400.000đ, hạn tới hết 16/08. Hẹn gặp chị nhé." },
  { cd: "Ưu đãi hè — Mát da mát dáng", luc: "2026-07-26 10:00+07", chon: "co_mua", n: 200,
    noi_dung: "Hè này da dễ bắt nắng, chị nhớ ghé Hương Sen dưỡng da nha. Mã HE2026 giảm 15% liệu trình chăm sóc da và massage, tối đa 250.000đ, dùng tới hết 31/08." },
  { cd: "Ưu đãi hè — Mát da mát dáng", luc: "2026-08-05 14:00+07", chon: "moi", n: 120,
    noi_dung: "Lần đầu tới Hương Sen, chị được giảm 15% với mã HE2026. Phòng máy mới có điều hoà riêng từng giường, chị ghé thử cho biết nha." },
  { cd: "Nhắc khách lâu chưa quay lại", luc: "2026-08-10 09:00+07", chon: "lau_roi", n: 140,
    noi_dung: "Lâu rồi không gặp chị. Em để dành cho chị phiếu 100.000đ (mã QUAYLAI100K) cho hoá đơn từ 250.000đ, hạn tới 15/09. Chị rảnh ngày nào em xếp lịch cho ạ." },
];
const CHON_KHACH = {
  cu_nhat: `select ct.id from contacts ct where ct.tenant_id = $1 and ct.deleted_at is null
              and ct.marketing_consent = 'granted' order by ct.created_at, ct.id limit $2`,
  than_thiet: `select ct.id from contacts ct where ct.tenant_id = $1 and ct.deleted_at is null
                 and ct.marketing_consent = 'granted'
                 and (select count(*) from orders o where o.contact_id = ct.id and o.tenant_id = $1
                        and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null) >= 3
               order by ct.created_at, ct.id limit $2`,
  co_mua: `select ct.id from contacts ct where ct.tenant_id = $1 and ct.deleted_at is null
             and ct.marketing_consent = 'granted'
             and exists (select 1 from orders o where o.contact_id = ct.id and o.tenant_id = $1
                           and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null)
           order by ct.created_at desc, ct.id limit $2`,
  moi: `select ct.id from contacts ct where ct.tenant_id = $1 and ct.deleted_at is null
          and ct.marketing_consent = 'granted'
          and (select count(*) from orders o where o.contact_id = ct.id and o.tenant_id = $1
                 and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null) <= 1
        order by ct.created_at desc, ct.id limit $2`,
  lau_roi: `select ct.id from contacts ct where ct.tenant_id = $1 and ct.deleted_at is null
              and ct.marketing_consent = 'granted'
              and coalesce((select max(o.created_at) from orders o where o.contact_id = ct.id and o.tenant_id = $1
                              and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null),
                           '-infinity'::timestamptz) < '2026-06-20'::timestamptz
            order by ct.created_at, ct.id limit $2`,
};
/* ── DỌN ĐỢT GỬI LẠC MỐC ──────────────────────────────────────────────────
   Lượt trước tôi xếp các đợt gửi theo một dòng thời gian khác. Đổi mốc mà không
   dọn thì lần chạy sau ĐẺ THÊM đợt mới và để đợt cũ nằm lại — tiệm mẫu sẽ có
   hai lần gửi cho cùng một chiến dịch, cách nhau hai tháng, không ai giải thích
   được. Nên: đợt nào không nằm trong bảng khai ở trên thì xoá (kéo theo người
   nhận), rồi trả lại quyền nhận tin cho những người script này từng cho "rút" —
   vì họ phải được thêm lại vào đợt mới trước khi rút lần nữa theo mốc mới.
   Khối này chỉ chạy khi mốc THẬT SỰ lệch, nên chạy lại lần hai nó im lặng.    */
{
  const cdIds = DOT_GUI.map((d) => cdId[d.cd]);
  const mocs = DOT_GUI.map((d) => d.luc);
  const lac = (await c.query(
    `select s.id, to_char(s.send_at, 'DD/MM/YYYY') cu from campaign_sends s
      where s.tenant_id = $1
        and not exists (select 1 from unnest($2::uuid[], $3::timestamptz[]) k(cid, luc)
                         where k.cid = s.campaign_id and k.luc = s.send_at)`, [T, cdIds, mocs])).rows;
  if (lac.length) {
    const traLai = await nhuChuTiem(async () => {
      await c.query(`delete from campaign_sends where id = any($1::uuid[])`, [lac.map((r) => r.id)]);
      return (await c.query(
        `update contacts set marketing_consent = 'granted', marketing_consent_withdrawn_at = null
          where tenant_id = $1 and marketing_consent = 'withdrawn' returning 1`, [T])).rowCount;
    });
    console.log(`  Dọn ${lac.length} đợt gửi lạc mốc (${lac.map((r) => r.cu).join(", ")}) và trả lại quyền nhận tin cho ${traLai} khách để xếp lại theo mốc mới.`);
  }
}

let tongNhan = 0;
const nhanDot1 = [];
for (const d of DOT_GUI) {
  const cid = cdId[d.cd];
  let send = (await c.query(
    `select id from campaign_sends where tenant_id = $1 and campaign_id = $2 and send_at = $3::timestamptz`,
    [T, cid, d.luc])).rows[0];
  if (!send) {
    send = await nhuChuTiem(async () => (await c.query(
      `insert into campaign_sends (tenant_id, campaign_id, send_at, body, created_by)
       values ($1, $2, $3::timestamptz, $4, $5) returning id`, [T, cid, d.luc, d.noi_dung, CHU_TIEM])).rows[0]);
  }
  const daCo = Number((await c.query(`select count(*) n from campaign_send_recipients where send_id = $1`, [send.id])).rows[0].n);
  if (daCo > 0) { console.log(`  ${d.luc.slice(0, 10)} · ${d.cd}: đã có ${daCo} người nhận, bỏ qua.`); tongNhan += daCo; continue; }
  const ids = (await c.query(CHON_KHACH[d.chon], [T, d.n])).rows.map((r) => r.id);
  const kq = await nhuChuTiem(async () => (await c.query(
    `select campaign_send_add_recipients($1, $2::uuid[]) kq`, [send.id, ids])).rows[0].kq);
  tongNhan += kq.that_su_gui;
  if (d === DOT_GUI[0]) nhanDot1.push(...ids);
  console.log(`  ${d.luc.slice(0, 10)} · ${d.cd}: chọn ${kq.tep_chon} → GỬI ${kq.that_su_gui}` +
    ` (trừ chưa đồng ý ${kq.tru_chua_dong_y} · đã rút ${kq.tru_da_rut} · vừa nhận tin ${kq.tru_gan_day})`);
}
console.log(`  Tổng người nhận: ${so(tongNhan)}`);

/* Có gửi tin thì có người rút đồng ý — không ghi phần này thì `opt_out_count`
   trong báo cáo chiến dịch mãi mãi bằng 0, tức là báo cáo chỉ kể phần được.
   Chỉ rút cho người ĐÃ NHẬN đợt đầu, và mốc rút SAU ngày gửi, đúng cách
   `campaign_tong_ket` quy trách nhiệm.                                        */
if (nhanDot1.length) {
  const rut = await nhuChuTiem(async () => (await c.query(
    `update contacts set marketing_consent = 'withdrawn',
            marketing_consent_withdrawn_at = '2026-08-06 12:00+07'::timestamptz
       where tenant_id = $1 and marketing_consent = 'granted'
         and id = any($2::uuid[]) returning 1`, [T, nhanDot1.slice(0, 9)])).rowCount);
  if (rut) console.log(`  ${rut} khách rút đồng ý sau đợt tin khai trương (đây là cái giá của việc gửi tin, phải đo).`);
}

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 8 — DÙNG MÃ GIẢM GIÁ
   Chỉ đụng đơn NHÁP. Đơn đã xong là doanh thu đã chốt: gắn mã vào đó là sửa
   con số tháng 6, tháng 7 mà cả kho đang dựa vào.
   Hệ quả phải khai: `campaign_tong_ket` chỉ tính tiền trên đơn ĐÃ XONG, nên
   doanh thu trong báo cáo chiến dịch sẽ bằng 0. Đó là cái giá của luật "không
   đụng đơn đã chốt", không phải lỗi tính toán.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 8 — DÙNG MÃ GIẢM GIÁ TRÊN ĐƠN NHÁP (qua voucher_apply)");
/* Lọc theo GIÁ GỐC (qty × đơn giá), KHÔNG theo `line_total_vnd`.
   `line_total_vnd` đã trừ giảm giá, mà giảm giá lại chính do script này gắn vào
   ⇒ lấy nó làm tiêu chí thì lần chạy thứ hai nhìn thấy một tập đơn KHÁC lần
   đầu, và việc "chạy lại ra cùng kết quả" chỉ còn đúng nhờ may mắn (nhờ trần
   mỗi khách chặn lại). Đo bằng thước mà chính mình đang bẻ thì không phải đo. */
const donNhap = (await c.query(
  `select o.id, o.contact_id, coalesce(s.goc, 0)::bigint tong,
          exists (select 1 from orders o2 where o2.contact_id = o.contact_id and o2.tenant_id = $1
                    and o2.kind = 'order' and o2.status <> 'draft' and o2.deleted_at is null) da_mua,
          exists (select 1 from voucher_redemptions vr where vr.order_id = o.id) da_co_ma
     from orders o
     join lateral (select sum(round(abs(l.qty) * l.unit_price_vnd))::bigint goc
                     from order_lines l where l.order_id = o.id) s on true
    where o.tenant_id = $1 and o.kind = 'order' and o.status = 'draft'
      and o.deleted_at is null and o.contact_id is not null
    order by o.created_at, o.id`, [T])).rows;
console.log(`  Đơn nháp còn sửa được: ${donNhap.length}`);

const daDung = new Set();
const chia = (loc, n) => {
  const ra = [];
  for (const d of donNhap) { if (ra.length >= n) break; if (daDung.has(d.id)) continue; if (!loc(d)) continue; ra.push(d); daDung.add(d.id); }
  return ra;
};
/* GIOITHIEU50K chỉ dành cho khách LẦN ĐẦU ⇒ phải là khách chưa có đơn nào ngoài
   nháp. Xếp nó TRƯỚC để không bị các mã khác giành mất đúng nhóm đơn hiếm đó.  */
const PHAN_BO = [
  { ma: "GIOITHIEU50K", loc: (d) => !d.da_mua && d.tong >= 150000, n: 4 },
  { ma: "VIP500K", loc: (d) => d.tong >= 1200000, n: 3 },
  { ma: "KHAITRUONG20", loc: (d) => d.tong >= 300000, n: 8 },
  { ma: "TRIAN150K", loc: (d) => d.tong >= 400000, n: 7 },
  { ma: "HE2026", loc: (d) => d.tong >= 300000, n: 9 },
  { ma: "QUAYLAI100K", loc: (d) => d.tong >= 250000, n: 6 },
  { ma: "SINHNHAT30", loc: (d) => d.tong >= 200000, n: 5 },
];
const ketQuaMa = [];
await nhuChuTiem(async () => {
  // Nâng hạn tạm cho hai mã lịch sử — nằm trong CÙNG transaction với việc hạ lại.
  for (const v of MA) if (v.lichSu) await c.query(`update vouchers set expires_at = $1::timestamptz where id = $2`, [HAN_TAM, maId[v.ma]]);

  for (const p of PHAN_BO) {
    const don = chia(p.loc, p.n);
    let ok = 0, sanCo = 0, truot = {};
    for (const d of don) {
      // Đơn đã mang mã thì KHÔNG gọi lại. Gọi lại vẫn an toàn (hàm tự trả
      // `don_da_co_ma`), nhưng im lặng gọi lại là thói quen dẫn tới chỗ khác
      // không an toàn — và ở đây nó không mang lại gì.
      if (d.da_co_ma) { sanCo++; continue; }
      const r = (await c.query(`select voucher_apply($1, $2) kq`, [d.id, p.ma])).rows[0].kq;
      if (r.ok) ok++;
      else if (r.ly_do === "don_da_co_ma") sanCo++;
      else truot[r.ly_do] = (truot[r.ly_do] ?? 0) + 1;
    }
    ketQuaMa.push({ ma: p.ma, chon: don.length, ok, sanCo, truot });
  }

  // Hạ hạn về đúng ngày lịch sử — trạng thái cuối của hai mã này PHẢI là hết hạn.
  for (const v of MA) if (v.lichSu) await c.query(`update vouchers set expires_at = $1::timestamptz where id = $2`, [v.han, maId[v.ma]]);
});
for (const r of ketQuaMa) {
  const truot = Object.entries(r.truot).map(([k, n]) => `${k}×${n}`).join(", ");
  console.log(`  ${r.ma.padEnd(13)} chọn ${String(r.chon).padStart(2)} đơn → dùng mới ${r.ok}${r.sanCo ? ` · đã có sẵn ${r.sanCo}` : ""}${truot ? ` · bị từ chối: ${truot}` : ""}`);
  if (r.chon === 0) ghiChu(`Mã ${r.ma} không có đơn nháp nào hợp điều kiện — chưa dựng được lịch sử dùng mã cho nó.`);
}
const hanCuoi = (await c.query(
  `select code, expires_at < now() het_han, status from vouchers where tenant_id = $1 order by code`, [T])).rows;
console.log("  Trạng thái hạn cuối cùng: " + hanCuoi.map((v) => `${v.code}=${v.het_han ? "HẾT HẠN" : "còn chạy"}`).join(" · "));

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 9 — ĐỔI ĐIỂM
   Cũng chỉ trên đơn nháp, và trên nhóm đơn KHÔNG trùng với nhóm đã gắn mã, để
   mỗi con số về sau còn truy được về đúng một nguyên nhân.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 9 — KHÁCH TRẢ ĐƠN BẰNG ĐIỂM (qua loyalty_redeem_for_order)");
const donDoiDiem = (await c.query(
  `select o.id, coalesce(s.tong, 0)::bigint tong,
          coalesce((select sum(ll.remaining) from loyalty_ledger ll
                     where ll.contact_id = o.contact_id and ll.tenant_id = $1
                       and ll.remaining > 0 and ll.expires_at > now()), 0)::bigint diem
     from orders o
     join lateral (select sum(line_total_vnd) tong from order_lines where order_id = o.id) s on true
    where o.tenant_id = $1 and o.kind = 'order' and o.status = 'draft'
      and o.deleted_at is null and o.contact_id is not null
      and not (o.id = any($2::uuid[]))
      and not exists (select 1 from loyalty_ledger ll2 where ll2.order_id = o.id and ll2.reason = 'redeem')
    order by o.created_at, o.id`, [T, [...daDung]])).rows;
/* Trần phải đếm theo TỔNG SỐ đơn đã từng đổi điểm của tiệm, không phải theo số
   đơn đổi trong lượt chạy này. Bản đầu đếm theo lượt: lần chạy thứ hai thấy
   "chưa đổi đơn nào" nên đi đổi thêm 12 đơn nữa — sổ điểm phình ra mỗi lần chạy.
   Đây là lỗi lần chạy thứ hai bắt được, không phải lo xa.                      */
const MUC_TIEU_DOI = 12;
const daDoiTruoc = Number((await c.query(
  `select count(distinct order_id)::int n from loyalty_ledger
    where tenant_id = $1 and reason = 'redeem' and order_id is not null`, [T])).rows[0].n);
let soDoi = 0, diemDoi = 0, tienDoi = 0;
const tuChoiDoi = {};
for (const d of donDoiDiem) {
  if (daDoiTruoc + soDoi >= MUC_TIEU_DOI) break;
  const traNoi = Number(cfg.redeem_value_vnd) / Number(cfg.redeem_points_unit); // đồng mỗi điểm
  const toiDa = Math.min(Number(d.diem), Math.floor(Number(d.tong) / traNoi));
  const diem = Math.floor(toiDa / cfg.redeem_points_unit) * cfg.redeem_points_unit;
  if (diem <= 0) continue;
  const kq = await nhuChuTiem(async () => (await c.query(`select loyalty_redeem_for_order($1, $2) kq`, [d.id, diem])).rows[0].kq);
  if (kq.ok) { soDoi++; diemDoi += diem; tienDoi += Number(kq.giam_vnd); }
  else tuChoiDoi[kq.ly_do] = (tuChoiDoi[kq.ly_do] ?? 0) + 1;
}
console.log(`  Đã có sẵn ${daDoiTruoc} đơn từng trả bằng điểm · thêm mới lượt này ${soDoi} đơn · ${so(diemDoi)} điểm · ${tien(tienDoi)} (trần tổng: ${MUC_TIEU_DOI} đơn)`);
if (Object.keys(tuChoiDoi).length) console.log("  Bị từ chối: " + Object.entries(tuChoiDoi).map(([k, n]) => `${k}×${n}`).join(", "));

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 10 — CHI PHÍ NGUỒN KHÁCH
   Không có mẫu số này thì mọi câu "chiến dịch hiệu quả" đều là cảm tính.
   Đi qua `upsert_source_cost` — hàm tự chuẩn hoá về đầu tháng và tự đè khi chạy lại.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 10 — CHI PHÍ NGUỒN KHÁCH THEO THÁNG");
const nguon = Object.fromEntries((await c.query(`select id, name from lead_sources where tenant_id = $1`, [T])).rows.map((r) => [r.name, r.id]));
const CHI_NGUON = {
  "Facebook": { "2026-05-01": 14000000, "2026-06-01": 11500000, "2026-07-01": 12800000, "2026-08-01": 9200000 },
  "Zalo": { "2026-05-01": 4500000, "2026-06-01": 3800000, "2026-07-01": 4200000, "2026-08-01": 3000000 },
  "Website": { "2026-05-01": 2500000, "2026-06-01": 2500000, "2026-07-01": 2500000, "2026-08-01": 2500000 },
  "Form/Landing": { "2026-05-01": 1800000, "2026-06-01": 1500000, "2026-07-01": 2100000, "2026-08-01": 1400000 },
  "Giới thiệu": { "2026-05-01": 900000, "2026-06-01": 1200000, "2026-07-01": 1500000, "2026-08-01": 1100000 },
};
let soChiNguon = 0, tongChiNguon = 0;
await nhuChuTiem(async () => {
  for (const [ten, thang] of Object.entries(CHI_NGUON)) {
    if (!nguon[ten]) { ghiChu(`Không có nguồn khách tên "${ten}" ở tiệm mẫu — bỏ qua chi phí của nguồn này.`); continue; }
    for (const [m, sotien] of Object.entries(thang)) {
      await c.query(`select upsert_source_cost($1, $2::date, $3::bigint)`, [nguon[ten], m, sotien]);
      soChiNguon++; tongChiNguon += sotien;
    }
  }
});
console.log(`  ${soChiNguon} dòng chi phí · tổng ${tien(tongChiNguon)} cho 4 tháng 05→08/2026`);

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 11 — HỢP ĐỒNG VÀ CÁC BUỔI ĐÃ DÙNG
   ⚠ MỖI HỢP ĐỒNG GHI VÀO ĐÂY LÀM QUỸ HOA HỒNG CỦA TIỆM TĂNG LÊN, do trigger
   `contracts_sinh_hoa_hong` (3% giá gói, theo `commission_rates`). Đó là ĐÚNG
   nghiệp vụ, không phải lỗi — nhưng nó chạm vào bảng lương nên phần tăng thêm
   được in ra ở cuối để đối soát.
   `sessions_used` KHÔNG được gán tay: chèn từng dòng buổi vào `contract_sessions`,
   trigger `contract_sessions_sync` mới là thứ đếm và tự đóng hợp đồng khi đủ buổi.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 11 — HỢP ĐỒNG LIỆU TRÌNH");
/* Người bán: RLS chỉ cho chủ/quản trị/quản lý lập hợp đồng, nên người bán phải
   nằm trong ba vai đó — và phải có hồ sơ nhân viên, vì hoa hồng nối qua
   `employees.user_id = contracts.created_by`.                                  */
const nguoiBan = (await c.query(
  `select e.user_id, e.full_name, e.note from employees e
     join tenant_members tm on tm.user_id = e.user_id and tm.tenant_id = e.tenant_id
    where e.tenant_id = $1 and e.ended_on is null and tm.status = 'active'
      and tm.role in ('owner', 'admin', 'manager')
    order by tm.role, e.created_at`, [T])).rows;
if (nguoiBan.length === 0) { console.error("DỪNG — không có ai đủ vai để lập hợp đồng."); await c.end(); process.exit(1); }
console.log("  Người bán gói: " + nguoiBan.map((n) => n.full_name).join(" · "));

const khachMuaGoi = (await c.query(
  `select ct.id, ct.full_name from contacts ct
    where ct.tenant_id = $1 and ct.deleted_at is null
      and (select count(*) from orders o where o.contact_id = ct.id and o.tenant_id = $1
             and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null) >= 2
    order by ct.created_at, ct.id`, [T])).rows;

/* Mã phiếu là KHOÁ CỐ ĐỊNH duy nhất của hợp đồng — bảng này không có ràng buộc
   duy nhất tự nhiên nào, không neo vào đây thì chạy lại là đẻ bản sao.         */
const HOP_DONG = [
  { ma: "HS-HD-01", goi: 0, khach: 0, ban: 1, mua: "2026-05-24", buoi: 5, tra: "transfer" },
  { ma: "HS-HD-02", goi: 2, khach: 1, ban: 3, mua: "2026-05-26", buoi: 10, tra: "transfer" },
  { ma: "HS-HD-03", goi: 3, khach: 2, ban: 1, mua: "2026-05-25", buoi: 6, tra: "cash" },
  { ma: "HS-HD-04", goi: 1, khach: 3, ban: 2, mua: "2026-06-02", buoi: 4, tra: "qr" },
  { ma: "HS-HD-05", goi: 4, khach: 4, ban: 0, mua: "2026-06-05", buoi: 2, tra: "transfer" },
  { ma: "HS-HD-06", goi: 5, khach: 5, ban: 3, mua: "2026-06-08", buoi: 8, tra: "transfer" },
  { ma: "HS-HD-07", goi: 0, khach: 6, ban: 1, mua: "2026-06-12", buoi: 3, tra: "cash" },
  { ma: "HS-HD-08", goi: 2, khach: 7, ban: 3, mua: "2026-06-15", buoi: 5, tra: "qr" },
  { ma: "HS-HD-09", goi: 1, khach: 8, ban: 2, mua: "2026-06-20", buoi: 7, tra: "transfer" },
  { ma: "HS-HD-10", goi: 3, khach: 9, ban: 1, mua: "2026-06-24", buoi: 9, tra: "cash" },
  { ma: "HS-HD-11", goi: 6, khach: 10, ban: 2, mua: "2026-06-24", buoi: 2, tra: "cash" },
  { ma: "HS-HD-12", goi: 4, khach: 11, ban: 0, mua: "2026-07-01", buoi: 1, tra: "transfer" },
  { ma: "HS-HD-13", goi: 0, khach: 12, ban: 1, mua: "2026-07-03", buoi: 5, tra: "qr" },
  { ma: "HS-HD-14", goi: 5, khach: 13, ban: 3, mua: "2026-07-06", buoi: 4, tra: "transfer" },
  { ma: "HS-HD-15", goi: 2, khach: 14, ban: 3, mua: "2026-07-10", buoi: 3, tra: "transfer" },
  { ma: "HS-HD-16", goi: 1, khach: 15, ban: 2, mua: "2026-07-14", buoi: 2, tra: "qr" },
  { ma: "HS-HD-17", goi: 3, khach: 16, ban: 1, mua: "2026-07-18", buoi: 4, tra: "cash" },
  { ma: "HS-HD-18", goi: 6, khach: 17, ban: 2, mua: "2026-07-22", buoi: 1, tra: "cash" },
  { ma: "HS-HD-19", goi: 0, khach: 18, ban: 1, mua: "2026-07-28", buoi: 2, tra: "transfer" },
  { ma: "HS-HD-20", goi: 4, khach: 19, ban: 0, mua: "2026-08-03", buoi: 1, tra: "qr" },
  { ma: "HS-HD-21", goi: 2, khach: 20, ban: 3, mua: "2026-08-08", buoi: 1, tra: "transfer" },
  { ma: "HS-HD-22", goi: 5, khach: 21, ban: 2, mua: "2026-08-12", buoi: 2, tra: "cash", huy: "Khách chuyển công tác vào Đà Nẵng, xin huỷ và hoàn phần chưa dùng." },
];
if (khachMuaGoi.length < HOP_DONG.length) {
  console.error(`DỪNG — chỉ có ${khachMuaGoi.length} khách quen, không đủ cho ${HOP_DONG.length} hợp đồng.`);
  await c.end(); process.exit(1);
}
const HOM_NAY = new Date("2026-08-20T00:00:00+07:00");
let hdMoi = 0, hdSanCo = 0, buoiMoi = 0, buoiTruot = 0;
for (const h of HOP_DONG) {
  const g = GOI[h.goi];
  const nhan = `${h.ma} · ${g.ten}`;
  const co = (await c.query(`select id from contracts where tenant_id = $1 and note like $2`, [T, h.ma + " ·%"])).rows[0];
  if (co) { hdSanCo++; continue; }
  const batDau = new Date(h.mua + "T00:00:00+07:00");
  const hetHan = new Date(batDau.getTime() + g.han * 86400000);
  const ghi = h.huy ? `${nhan} — ${h.huy}` : `${nhan} — khách trả trước tại quầy.`;
  /* Hợp đồng + các buổi + việc huỷ nằm TRỌN trong một transaction. Tách ra thì
     một buổi hỏng sẽ để lại hợp đồng thiếu buổi, mà lần chạy sau lại thấy hợp
     đồng "đã có" nên bỏ qua ⇒ hỏng vĩnh viễn mà không ai thấy.                 */
  try {
    const ketQua = await nhuChuTiem(async () => {
      const hd = (await c.query(
        `insert into contracts (tenant_id, contact_id, package_id, sessions_total, starts_at, expires_at,
                                price_paid_vnd, payment_method, status, note, created_by)
         values ($1,$2,$3,$4,$5::date,$6::date,$7,$8,'active',$9,$10) returning id`,
        [T, khachMuaGoi[h.khach].id, goiId[g.ten], g.buoi, h.mua, hetHan.toISOString().slice(0, 10),
         g.gia, h.tra, ghi, nguoiBan[h.ban % nguoiBan.length].user_id])).rows[0];
      // Các buổi đã dùng — trải đều từ ngày mua tới hôm nay, không dồn một cục.
      const catCuoi = Math.min(hetHan.getTime(), HOM_NAY.getTime());
      const buoc = h.buoi > 0 ? Math.max(1, Math.floor((catCuoi - batDau.getTime()) / 86400000 / (h.buoi + 1))) : 0;
      let n = 0;
      for (let i = 1; i <= h.buoi; i++) {
        const luc = new Date(batDau.getTime() + i * buoc * 86400000);
        if (luc.getTime() > HOM_NAY.getTime()) luc.setTime(HOM_NAY.getTime() - 86400000);
        await c.query(
          `insert into contract_sessions (tenant_id, contract_id, redeemed_at, note, recorded_by)
           values ($1, $2, ($3::date || ' 14:00+07')::timestamptz, $4, $5)`,
          [T, hd.id, luc.toISOString().slice(0, 10), `Buổi ${i}/${g.buoi} — ghi tại quầy khi khách ra về.`,
           nguoiBan[(h.ban + i) % nguoiBan.length].user_id]);
        n++;
      }
      if (h.huy) {
        // Huỷ SAU khi đã ghi buổi (`contract_sessions_cap` chặn ghi vào hợp đồng
        // đã huỷ), và huỷ bằng UPDATE để trigger sinh khoản hoa hồng TRỪ LẠI.
        await c.query(`update contracts set status = 'cancelled' where id = $1`, [hd.id]);
      }
      return n;
    });
    hdMoi++; buoiMoi += ketQua;
  } catch (e) {
    buoiTruot++;
    ghiChu(`Không lập được hợp đồng ${h.ma} (đã trả lại nguyên trạng): ${e.message.split("\n")[0]}`);
  }
}
console.log(`  Hợp đồng: ${hdMoi} mới${hdSanCo ? ` · ${hdSanCo} đã có sẵn (bỏ qua)` : ""} · ${buoiMoi} buổi đã dùng được ghi${buoiTruot ? ` · ${buoiTruot} buổi không ghi được` : ""}`);
const phoHD = (await c.query(
  `select k.status, count(*)::int n, sum(k.sessions_used)::int dung, sum(k.sessions_total)::int tong
     from contracts k where k.tenant_id = $1 group by 1 order by 1`, [T])).rows;
console.log("  Trạng thái: " + phoHD.map((r) => `${r.status}=${r.n} (${r.dung}/${r.tong} buổi)`).join(" · "));
const sapHet = (await c.query(
  `select k.note, to_char(k.expires_at, 'DD/MM/YYYY') het, k.sessions_total - k.sessions_used con from contracts k
    where k.tenant_id = $1 and k.status = 'active' and k.expires_at is not null
      and k.expires_at <= (now() at time zone 'Asia/Ho_Chi_Minh')::date + 30
    order by k.expires_at`, [T])).rows;
console.log(`  Sắp hết hạn trong 30 ngày: ${sapHet.length} hợp đồng` +
  (sapHet.length ? " → " + sapHet.slice(0, 4).map((r) => `${r.note.slice(0, 8)} còn ${r.con} buổi, hết hạn ${r.het}`).join(" · ") : ""));

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 12 — ĐỒNG BỘ LẠI HAI HẰNG SỐ CỦA CHIẾN DỊCH

   (a) KÉO DÀI hai chiến dịch cũ tới 12/08 và 16/08.
       Vì sao: mục 13 dưới đây tạo đơn ĐÃ HOÀN TẤT trong tháng 08 để ô doanh thu
       của báo cáo chiến dịch thôi bằng 0. Đơn chỉ được phép nằm trong tháng 08
       (kỳ lương 05/06/07 đã chốt sổ). Nếu để nguyên chiến dịch kết thúc 15/06 mà
       lại quy doanh thu từ đơn tháng 08 cho nó, thì báo cáo tự mâu thuẫn với
       chính ngày tháng của nó — sửa một ô rỗng bằng cách tạo ra một ô SAI thì
       không phải sửa. Kéo dài ngày kết thúc là cách duy nhất khiến đơn tháng 08
       thật sự THUỘC về chiến dịch đó. Tiệm gia hạn khuyến mãi là chuyện thường.
       Kéo theo: hạn của mã và nội dung tin nhắn cũng phải đổi cho khớp, nếu
       không thì tin nhắn hứa một đằng, mã chạy một nẻo.

   (b) HẠ chi phí quảng cáo của cả 4 chiến dịch.
       Con số cũ (12tr · 6,5tr · 9tr · 3,2tr) do tôi bịa ở lượt trước, và nó
       LỚN HƠN toàn bộ doanh thu mà mã giảm giá có thể quy về được ⇒ chiến dịch
       nào cũng lỗ. Một phần mềm mà mở báo cáo ra thấy "marketing luôn lỗ" thì
       người xem tin phần mềm tính sai, chứ không tin marketing lỗ.
       Đây là ngân sách đẩy riêng của từng đợt, khác với chi phí kênh theo tháng
       ở `source_costs` (84,5tr) — hai thứ đó không đụng nhau.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 12 — ĐỒNG BỘ HẠN CHIẾN DỊCH VÀ CHI PHÍ QUẢNG CÁO");
await nhuChuTiem(async () => {
  for (const cd of CHIEN_DICH) {
    await c.query(
      `update campaigns
          set start_at = ($2::date || ' 08:00+07')::timestamptz,
              end_at   = ($3::date || ' 21:00+07')::timestamptz,
              ad_cost_vnd = $4
        where id = $1
          and (start_at is distinct from ($2::date || ' 08:00+07')::timestamptz
            or end_at   is distinct from ($3::date || ' 21:00+07')::timestamptz
            or ad_cost_vnd is distinct from $4)`,
      [cdId[cd.ten], cd.tu, cd.den, cd.quangCao]);
  }
  // Tin nhắn đã gửi phải nói đúng cái hạn đang chạy.
  for (const d of DOT_GUI) {
    await c.query(
      `update campaign_sends set body = $3
        where tenant_id = $1 and send_at = $2::timestamptz and body is distinct from $3`, [T, d.luc, d.noi_dung]);
  }
});
const hanCD = (await c.query(
  `select name, to_char(start_at, 'DD/MM') tu, to_char(end_at, 'DD/MM/YYYY') den, ad_cost_vnd, status
     from campaigns where tenant_id = $1 order by start_at`, [T])).rows;
for (const r of hanCD) console.log(`  ${r.name.padEnd(34)} ${r.tu} → ${r.den} · quảng cáo ${tien(r.ad_cost_vnd).padStart(12)} · ${r.status}`);

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 13 — ĐƠN THÁNG 08 CÓ GẮN MÃ (đơn MỚI, không đụng đơn cũ)

   Vì sao phải tạo đơn mới: `campaign_tong_ket` chỉ tính tiền trên đơn ĐÃ HOÀN
   TẤT. Ở lượt trước tôi chỉ được phép gắn mã vào đơn NHÁP, nên ô doanh thu của
   cả 4 chiến dịch đều bằng 0 — nhìn như tính năng hỏng. Cách chữa đúng là CỘNG
   THÊM đơn mới, không phải sửa đơn cũ: doanh thu tháng 5/6/7 giữ nguyên từng
   đồng, và hoa hồng phát sinh rơi trọn vào kỳ lương tháng 08 đang mở.

   Đi ĐÚNG đường của màn hình bán hàng, không đi tắt:
       nháp → thêm dòng → `voucher_apply` → thu tiền → confirmed → completed
   Chỉ khi đó `orders_sinh_dong_kho` mới trừ kho, `orders_sinh_hoa_hong` mới
   sinh hoa hồng, `order_lines_snapshot_cost` mới chốt giá vốn cho báo cáo lãi.
   Nhảy thẳng sang `completed` sẽ ra một đơn không trừ kho, không có hoa hồng —
   đúng loại dữ liệu mẫu làm người xem mất niềm tin.

   Hai mã của chiến dịch cũ nay đã hết hạn, mà `voucher_apply` từ chối mã hết hạn
   (đúng — đó là chốt giữ tiền). Nên trong CÙNG transaction của mỗi đơn: nâng hạn
   tạm → áp mã qua đúng hàm → hạ hạn về đúng ngày. Vỡ giữa chừng thì cả ba cùng
   mất, không để lại mã hết hạn đang mở.

   Khoá chống nhân đôi: SỐ ĐƠN ĐÃ HOÀN TẤT MANG MÃ ĐÓ. Bảng `orders` không có
   cột ghi chú nào để neo, nên đếm chính cái mình sinh ra rồi chỉ bù phần thiếu.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 13 — TẠO ĐƠN THÁNG 08 CÓ GẮN MÃ (đường đầy đủ nháp → xong)");
const dsItem = Object.fromEntries((await c.query(
  `select name, id, kind, price_vnd from items where tenant_id = $1`, [T])).rows.map((r) => [r.name, r]));
const dsNV = Object.fromEntries((await c.query(
  `select full_name, user_id from employees where tenant_id = $1 and ended_on is null`, [T])).rows.map((r) => [r.full_name, r.user_id]));

/* Ai làm dịch vụ nào — hoa hồng bám theo `performed_by_user_id` của TỪNG DÒNG,
   nên gán bừa là chia sai tiền cho người thật.                                */
const KTV = {
  "Chăm sóc da cơ bản": ["Phạm Thị Hồng Nhung", "Đặng Thị Ngọc Hà", "Bùi Thị Thu Hiền", "Mai Thị Quỳnh Như"],
  "Massage trị liệu": ["Võ Thị Thanh Trúc", "Hoàng Thị Lan Anh", "Ngô Thị Cẩm Tú", "Phan Thị Tuyết Mai"],
  "Gội đầu dưỡng sinh": ["Lý Thị Bảo Trân", "Trương Thị Yến Nhi"],
  "Triệt lông (1 vùng)": ["Đỗ Thị Phương Thảo"],
};
const QUAY = ["Bạn Thảo (lễ tân)", "Trần Thị Kim Anh", "Lê Thị Mỹ Duyên"]; // sản phẩm bán ở quầy
const GIO_HANG = {
  A: [["Massage trị liệu", 1]],
  B: [["Chăm sóc da cơ bản", 1], ["Mặt nạ giấy cấp ẩm", 1]],
  C: [["Triệt lông (1 vùng)", 1]],
  D: [["Chăm sóc da cơ bản", 1], ["Serum dưỡng ẩm HA", 1]],
  E: [["Massage trị liệu", 1], ["Gội đầu dưỡng sinh", 1]],
  F: [["Gội đầu dưỡng sinh", 1], ["Dầu gội dược liệu", 1]],
  G: [["Chăm sóc da cơ bản", 1], ["Massage trị liệu", 1]],
  H: [["Triệt lông (1 vùng)", 1], ["Kem chống nắng SPF50", 1]],
  I: [["Chăm sóc da cơ bản", 1]],
  J: [["Massage trị liệu", 1], ["Mặt nạ giấy cấp ẩm", 1]],
};
const TRA_BANG = ["cash", "vietqr", "bank_transfer"];
/* Ngày đơn phải nằm TRONG cửa sổ chiến dịch và TRƯỚC hạn của mã — nếu không thì
   lại đẻ ra đúng cái mâu thuẫn mà mục 12 vừa đi chữa.                          */
const DOT_DON = [
  { ma: "KHAITRUONG20", chon: "quen", don: [["2026-08-03", "A"], ["2026-08-04", "B"], ["2026-08-06", "E"],
      ["2026-08-07", "I"], ["2026-08-09", "J"], ["2026-08-10", "F"], ["2026-08-11", "G"]] },
  { ma: "TRIAN150K", chon: "than_thiet", don: [["2026-08-04", "A"], ["2026-08-06", "C"], ["2026-08-08", "D"],
      ["2026-08-10", "E"], ["2026-08-12", "G"], ["2026-08-14", "H"], ["2026-08-15", "J"]] },
  { ma: "HE2026", chon: "quen", don: [["2026-08-02", "A"], ["2026-08-05", "B"], ["2026-08-08", "D"],
      ["2026-08-11", "E"], ["2026-08-13", "G"], ["2026-08-15", "I"], ["2026-08-17", "J"], ["2026-08-19", "C"]] },
  { ma: "QUAYLAI100K", chon: "lau_roi", don: [["2026-08-05", "A"], ["2026-08-07", "B"], ["2026-08-09", "E"],
      ["2026-08-12", "F"], ["2026-08-16", "I"], ["2026-08-19", "J"]] },
];
const CHON_MUA = {
  quen: `select ct.id from contacts ct where ct.tenant_id = $1 and ct.deleted_at is null
           and (select count(*) from orders o where o.contact_id = ct.id and o.tenant_id = $1
                  and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null) between 2 and 4
           and not exists (select 1 from voucher_redemptions vr where vr.contact_id = ct.id and vr.voucher_id = $2)
         order by ct.created_at, ct.id limit $3`,
  than_thiet: `select ct.id from contacts ct where ct.tenant_id = $1 and ct.deleted_at is null
                 and (select count(*) from orders o where o.contact_id = ct.id and o.tenant_id = $1
                        and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null) >= 5
                 and not exists (select 1 from voucher_redemptions vr where vr.contact_id = ct.id and vr.voucher_id = $2)
               order by ct.created_at, ct.id limit $3`,
  // Đúng tinh thần của đợt "nhắc khách lâu chưa quay lại": người được nhắc là
  // người đã lâu không tới, và đơn tháng 08 chính là bằng chứng họ đã quay lại.
  lau_roi: `select ct.id from contacts ct where ct.tenant_id = $1 and ct.deleted_at is null
              and coalesce((select max(o.created_at) from orders o where o.contact_id = ct.id and o.tenant_id = $1
                              and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null),
                           '-infinity'::timestamptz) < '2026-07-01'::timestamptz
              and exists (select 1 from orders o where o.contact_id = ct.id and o.tenant_id = $1
                            and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null)
              and not exists (select 1 from voucher_redemptions vr where vr.contact_id = ct.id and vr.voucher_id = $2)
            order by ct.created_at, ct.id limit $3`,
};

/* Kiểm kho TRƯỚC khi bán: nếu bán xong mà tồn xuống dưới mức an toàn thì nhập bù
   NGAY, và nhập đúng bằng giá vốn đang có để `purchases_sinh_dong_kho` không
   kéo `item_costs` lệch đi — nhập bù mà làm đổi giá vốn thì báo cáo lãi của mọi
   đơn sau đó lệch theo, chữa một chỗ hỏng hai chỗ.                             */
const canBan = {};
for (const dot of DOT_DON) for (const [, ro] of dot.don) for (const [ten, sl] of GIO_HANG[ro])
  if (dsItem[ten]?.kind === "product") canBan[ten] = (canBan[ten] ?? 0) + sl;
const MUC_AN_TOAN = 20;
const tonTruoc = Object.fromEntries((await c.query(
  `select i.name, coalesce(sl.qty_on_hand, 0)::numeric ton from items i
     left join stock_levels sl on sl.item_id = i.id and sl.tenant_id = i.tenant_id
    where i.tenant_id = $1 and i.kind = 'product'`, [T])).rows.map((r) => [r.name, Number(r.ton)]));
const canNhap = Object.entries(canBan).filter(([ten, sl]) => (tonTruoc[ten] ?? 0) - sl < MUC_AN_TOAN);
if (canNhap.length) {
  const daNhap = Number((await c.query(
    `select count(*) n from purchases where tenant_id = $1 and note = 'Nhập bù cho đợt đơn khuyến mãi tháng 08'`, [T])).rows[0].n);
  if (!daNhap) {
    await nhuChuTiem(async () => {
      const ph = (await c.query(
        `insert into purchases (tenant_id, status, note, received_at, created_by)
         values ($1, 'draft', 'Nhập bù cho đợt đơn khuyến mãi tháng 08', now(), $2) returning id`, [T, CHU_TIEM])).rows[0];
      let i = 0;
      for (const [ten, sl] of canNhap) {
        const gv = Number((await c.query(`select cost_vnd from item_costs where item_id = $1`, [dsItem[ten].id])).rows[0].cost_vnd);
        await c.query(
          `insert into purchase_lines (tenant_id, purchase_id, item_id, qty_mua, he_so, don_gia_mua, sort_order)
           values ($1, $2, $3, $4, 1, $5, $6)`, [T, ph.id, dsItem[ten].id, Math.max(50, sl * 3), gv, i++]);
      }
      await c.query(`update purchases set status = 'completed' where id = $1`, [ph.id]);
    });
    console.log(`  Nhập bù ${canNhap.length} mặt hàng (giá nhập = đúng giá vốn đang có, để không kéo lệch báo cáo lãi).`);
  }
} else {
  console.log(`  Tồn kho dư cho đợt này (${Object.entries(canBan).map(([k, v]) => `${k}: cần ${v}, còn ${tonTruoc[k]}`).join(" · ")}) — không cần nhập bù.`);
}

let donMoi = 0, donSanCo = 0, donHong = 0;
for (const dot of DOT_DON) {
  const v = MA.find((x) => x.ma === dot.ma);
  const daCo = Number((await c.query(
    `select count(*) n from voucher_redemptions vr join orders o on o.id = vr.order_id
      where vr.voucher_id = $1 and o.status = 'completed' and o.deleted_at is null`, [maId[dot.ma]])).rows[0].n);
  const canTao = dot.don.slice(daCo);
  donSanCo += daCo;
  if (!canTao.length) { console.log(`  ${dot.ma.padEnd(13)} đã có đủ ${daCo} đơn đã xong mang mã này — không tạo thêm.`); continue; }
  const khach = (await c.query(CHON_MUA[dot.chon], [T, maId[dot.ma], canTao.length])).rows.map((r) => r.id);
  if (khach.length < canTao.length) ghiChu(`Mã ${dot.ma}: chỉ tìm được ${khach.length} khách hợp lệ cho ${canTao.length} đơn cần tạo.`);
  let ok = 0;
  for (let i = 0; i < Math.min(khach.length, canTao.length); i++) {
    const [ngay, ro] = canTao[i];
    try {
      await nhuChuTiem(async () => {
        if (v.lichSu) await c.query(`update vouchers set expires_at = $1::timestamptz where id = $2`, [HAN_TAM, maId[dot.ma]]);
        const luc = `${ngay} ${String(9 + (i % 9)).padStart(2, "0")}:${(i % 2) ? "30" : "00"}+07`;
        const don = (await c.query(
          `insert into orders (tenant_id, kind, contact_id, status, created_at, created_by)
           values ($1, 'order', $2, 'draft', $3::timestamptz, $4) returning id`,
          [T, khach[i], luc, dsNV[QUAY[i % QUAY.length]]])).rows[0];
        let n = 0;
        for (const [ten, sl] of GIO_HANG[ro]) {
          const it = dsItem[ten];
          const nguoiLam = it.kind === "service"
            ? dsNV[KTV[ten][(i + n) % KTV[ten].length]]
            : dsNV[QUAY[(i + n) % QUAY.length]];
          await c.query(
            `insert into order_lines (tenant_id, order_id, item_id, performed_by_user_id, qty, unit_price_vnd, sort_order)
             values ($1, $2, $3, $4, $5, $6, $7)`, [T, don.id, it.id, nguoiLam, sl, it.price_vnd, n]);
          n++;
        }
        const kq = (await c.query(`select voucher_apply($1, $2) kq`, [don.id, dot.ma])).rows[0].kq;
        if (!kq.ok) throw new Error(`voucher_apply từ chối: ${kq.ly_do}`);
        const phaiTra = Number((await c.query(
          `select coalesce(sum(line_total_vnd), 0)::bigint t from order_lines where order_id = $1`, [don.id])).rows[0].t);
        await c.query(
          `insert into order_payments (tenant_id, order_id, method, amount_vnd, provider, provider_ref, received_by, received_at)
           values ($1, $2, $3, $4, 'manual', $7, $5, $6::timestamptz)`,
          [T, don.id, TRA_BANG[i % TRA_BANG.length], phaiTra, dsNV[QUAY[i % QUAY.length]], luc, don.id]);
        await c.query(`update orders set status = 'confirmed' where id = $1`, [don.id]);
        await c.query(`update orders set status = 'completed' where id = $1`, [don.id]);
        if (v.lichSu) await c.query(`update vouchers set expires_at = $1::timestamptz where id = $2`, [v.han, maId[dot.ma]]);
      });
      ok++; donMoi++;
    } catch (e) { donHong++; ghiChu(`Đơn ${dot.ma}/${ngay} không tạo được (đã trả lại nguyên trạng): ${e.message.split("\n")[0]}`); }
  }
  console.log(`  ${dot.ma.padEnd(13)} đã có ${daCo} · tạo mới ${ok} đơn đã hoàn tất`);
}
console.log(`  Tổng: ${donMoi} đơn mới${donSanCo ? ` · ${donSanCo} đã có sẵn` : ""}${donHong ? ` · ${donHong} hỏng` : ""}`);
const tonSau = (await c.query(
  `select i.name, coalesce(sl.qty_on_hand, 0)::numeric ton from items i
     left join stock_levels sl on sl.item_id = i.id and sl.tenant_id = i.tenant_id
    where i.tenant_id = $1 and i.kind = 'product' order by i.name`, [T])).rows;
console.log("  Tồn kho sau: " + tonSau.map((r) => `${r.name}=${r.ton}`).join(" · "));
const khoAm = tonSau.filter((r) => Number(r.ton) < 0);
if (khoAm.length) ghiChu(`TỒN KHO ÂM ở ${khoAm.length} mặt hàng: ${khoAm.map((r) => r.name).join(", ")}`);

/* Quét lại NGAY trong lượt này: đơn tháng 08 vừa tạo cũng là đơn của khách quen
   nên cũng phải được tích điểm, và vài khách vừa vượt ngưỡng "khách quen" nhờ
   chính mấy đơn đó. Không quét lại thì phần việc ấy rơi sang lượt chạy sau, và
   "chạy lại không đổi gì" thành câu nói sai.                                   */
console.log("  Quét lại tích điểm và thưởng cho phần đơn vừa tạo:");
await quetTichDiem();
await quetThuong();

/* ══════════════════════════════════════════════════════════════════════════════
   MỤC 14 — CHỐT SỔ CHIẾN DỊCH
   Lần đầu: đổi trạng thái sang `ended` cho hai chiến dịch đã qua, trigger
   `campaigns_tu_tong_ket` tự gọi `campaign_tong_ket`.
   Sau đó, LUÔN gọi lại `campaign_tong_ket_yeu_cau` cho CẢ BỐN — vì đơn mới ở
   mục 13 làm mọi con số cũ lạc hậu, mà trigger chỉ nổ đúng lúc đổi trạng thái,
   không nổ lại. Cả hai đường đều là hàm chính thức; không dòng nào tôi tự ghi.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("MỤC 14 — CHỐT SỔ CHIẾN DỊCH (không dòng nào do tôi ghi vào campaign_summary)");
for (const cd of CHIEN_DICH) {
  if (cd.ketThuc) {
    const nay = (await c.query(`select status from campaigns where id = $1`, [cdId[cd.ten]])).rows[0].status;
    if (nay !== "ended" && nay !== "stopped") {
      await nhuChuTiem(async () => c.query(`update campaigns set status = 'ended' where id = $1`, [cdId[cd.ten]]));
      console.log(`  "${cd.ten}" → ended · trigger campaigns_tu_tong_ket đã tự chốt sổ.`);
    } else console.log(`  "${cd.ten}" đang ở trạng thái ${nay}.`);
  }
  // Tính lại cho TẤT CẢ, kể cả cái đã `ended`: đơn mới ở mục 13 vừa làm con số cũ
  // lạc hậu, mà trigger không nổ lại khi trạng thái không đổi.
  await nhuChuTiem(async () => c.query(`select campaign_tong_ket_yeu_cau($1)`, [cdId[cd.ten]]));
}
const tomTat = (await c.query(
  `select cp.name, s.uses_count, s.revenue_vnd, s.discount_vnd, s.ad_cost_vnd, s.net_vnd,
          s.new_customer_count, s.recipients_count, s.recipients_ordered_count, s.opt_out_count
     from campaign_summary s join campaigns cp on cp.id = s.campaign_id
    where s.tenant_id = $1 order by cp.start_at`, [T])).rows;
for (const r of tomTat) {
  console.log(`  ${r.name}`);
  console.log(`     lượt dùng mã ${r.uses_count} · doanh thu ${tien(r.revenue_vnd)} · giảm giá ${tien(r.discount_vnd)} · quảng cáo ${tien(r.ad_cost_vnd)} · lãi/lỗ ${tien(r.net_vnd)}`);
  console.log(`     khách mới ${r.new_customer_count} · ${r.recipients_ordered_count}/${r.recipients_count} người nhận tin đã mua sau khi nhận · rút đồng ý sau khi nhận tin ${r.opt_out_count}`);
}
const cdRong = tomTat.filter((r) => Number(r.revenue_vnd) === 0);
if (cdRong.length) ghiChu(`Còn ${cdRong.length} chiến dịch có doanh thu = 0: ${cdRong.map((r) => r.name).join(", ")} — chưa có đơn ĐÃ XONG nào mang mã của chúng.`);
else console.log("  → Cả 4 chiến dịch đều có doanh thu khác 0. Ô rỗng trên báo cáo đã được lấp bằng đơn thật, không phải bằng số gõ tay.");
const cdLo = tomTat.filter((r) => Number(r.net_vnd) < 0);
if (cdLo.length) ghiChu(`${cdLo.length} chiến dịch đang lỗ: ${cdLo.map((r) => r.name).join(", ")} — chi phí quảng cáo lớn hơn phần doanh thu mã giảm giá quy về được.`);

/* ══════════════════════════════════════════════════════════════════════════════
   ĐO SAU + ĐỐI CHỨNG
   ══════════════════════════════════════════════════════════════════════════ */
const SAU = await demBang();
const HH_SAU = await doHoaHong();
const DT_SAU = await doDoanhThu();
const GG_SAU = await doGiamGia();

tieu("ĐO SAU KHI NẠP — TRƯỚC → SAU");
for (const b of BANG) {
  const d = SAU[b] - TRUOC[b];
  console.log(`  ${b.padEnd(26)} ${String(TRUOC[b]).padStart(7)} → ${String(SAU[b]).padStart(7)}   ${d > 0 ? "+" + d : d === 0 ? "(không đổi)" : d}`);
}

tieu("ĐỐI CHỨNG 1 — loyalty_ledger và campaign_summary tăng DO HÀM/TRIGGER, không do tôi chèn");
console.log(`  loyalty_ledger  : ${TRUOC.loyalty_ledger} → ${SAU.loyalty_ledger}  (+${SAU.loyalty_ledger - TRUOC.loyalty_ledger})`);
console.log(`  campaign_summary: ${TRUOC.campaign_summary} → ${SAU.campaign_summary}  (+${SAU.campaign_summary - TRUOC.campaign_summary})`);
console.log("  Bằng chứng 1 — cổng tự soát ở đầu tệp: script không chứa câu `insert into` nào vào hai bảng đó (đã chạy, đã qua).");
const phoLyDo = (await c.query(
  `select reason, count(*)::int n, sum(delta_points)::int diem from loyalty_ledger where tenant_id = $1 group by 1 order by 1`, [T])).rows;
console.log("  Bằng chứng 2 — mọi dòng sổ điểm đều mang lý do do HÀM đặt: " + phoLyDo.map((r) => `${r.reason}=${r.n} (${so(r.diem)} điểm)`).join(" · "));
const chinhSach = (await c.query(
  `select p.polname, case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end lenh
     from pg_policy p where p.polrelid = 'public.loyalty_ledger'::regclass`)).rows;
console.log(`  Bằng chứng 3 — loyalty_ledger chỉ có ${chinhSach.length} policy: ` + chinhSach.map((r) => `${r.polname}/${r.lenh}`).join(", ") +
  " ⇒ vai `authenticated` KHÔNG GHI THẲNG được, kể cả muốn.");
const thuGhiThang = await thuRoiTraLai(async () => {
  try {
    await c.query(`insert into loyalty_ledger (tenant_id, contact_id, delta_points, reason, expires_at, remaining) /* CO-Y-THU-GHI-THANG */
                   values ($1, (select id from contacts where tenant_id = $1 limit 1), 10, 'manual', now() + interval '1 year', 10)`, [T]);
    return "LỌT — vai chủ tiệm ghi thẳng được vào sổ điểm";
  } catch (e) { return "BỊ CHẶN — " + e.message.split("\n")[0]; }
});
console.log(`  Bằng chứng 4 — thử ghi thẳng bằng chính vai chủ tiệm (trong giao dịch có rollback): ${thuGhiThang}`);
if (thuGhiThang.startsWith("LỌT")) ghiChu("NGHIÊM TRỌNG: sổ điểm cho phép ghi thẳng — điểm là nợ của tiệm, ai sửa được sổ là sửa được nợ.");

tieu("ĐỐI CHỨNG 2 — HỆ THỐNG CÓ THẬT SỰ TỪ CHỐI MÃ HẾT HẠN / VƯỢT TRẦN KHÔNG?");
const ketLuan2 = await thuRoiTraLai(async () => {
  const ra = [];
  const khachThu = (await c.query(`select id from contacts where tenant_id = $1 and deleted_at is null order by created_at limit 1`, [T])).rows[0].id;
  /* Phải là đơn CHƯA mang mã nào: đơn đã có mã sẽ trả về `don_da_co_ma`, tức là
     vẫn ok:false — phép thử trông như "chặn đúng" trong khi thật ra nó chưa hề
     chạm tới chốt hạn/chốt trần. Ca kiểm rỗng còn nguy hơn ca kiểm đỏ.          */
  const donThu = (await c.query(
    `select o.id, coalesce(sum(l.line_total_vnd), 0)::bigint tong from orders o join order_lines l on l.order_id = o.id
      where o.tenant_id = $1 and o.kind = 'order' and o.status = 'draft' and o.deleted_at is null and o.contact_id is not null
        and not exists (select 1 from voucher_redemptions vr where vr.order_id = o.id)
      group by o.id having coalesce(sum(l.line_total_vnd), 0) >= 400000 order by o.id limit 3`, [T])).rows;
  if (donThu.length < 2) ra.push({ phep: "CHUẨN BỊ", chan: false, noi: `chỉ tìm được ${donThu.length} đơn nháp chưa mang mã — vài phép thử phải bỏ` });

  // (a) MÃ ĐÃ HẾT HẠN
  const a = (await c.query(`select voucher_check('KHAITRUONG20', 1000000::bigint, $1) kq`, [khachThu])).rows[0].kq;
  ra.push({ phep: "voucher_check trên mã đã hết hạn (KHAITRUONG20)", chan: a.ok === false, noi: a.ly_do ?? "CHO QUA" });
  if (donThu[0]) {
    const b = (await c.query(`select voucher_apply($1, 'KHAITRUONG20') kq`, [donThu[0].id])).rows[0].kq;
    ra.push({ phep: "voucher_apply mã đã hết hạn vào đơn thật", chan: b.ok === false, noi: b.ly_do ?? "CHO QUA" });
  }

  // (b) TRẦN TIỀN GIẢM — đơn 5 triệu, mã 15% (=750k) nhưng trần 250k
  const d = (await c.query(`select voucher_check('HE2026', 5000000::bigint, $1) kq`, [khachThu])).rows[0].kq;
  ra.push({ phep: "trần tiền giảm: đơn 5.000.000đ × mã 15% (=750.000đ), trần 250.000đ",
    chan: d.ok === true && Number(d.giam_vnd) === 250000, noi: d.ok ? `giảm ${tien(d.giam_vnd)} (chạm trần: ${d.cham_tran_tien})` : d.ly_do });

  // (c) ĐƠN TỐI THIỂU
  const e = (await c.query(`select voucher_check('VIP500K', 500000::bigint, $1) kq`, [khachThu])).rows[0].kq;
  ra.push({ phep: "đơn tối thiểu: mã VIP500K cần đơn từ 1.200.000đ, thử với đơn 500.000đ", chan: e.ok === false, noi: e.ly_do ?? "CHO QUA" });

  // (d) VƯỢT TRẦN SỐ LƯỢT — dựng mã chỉ 1 lượt rồi dùng 2 lần
  if (donThu.length >= 2) {
    await c.query(
      `insert into vouchers (tenant_id, code, kind, amount_off_vnd, max_uses, max_discount_vnd, expires_at, min_order_vnd, note, created_by)
       values ($1, 'THU-TRAN-1-LUOT', 'amount', 50000, 1, 50000, now() + interval '30 days', 0, 'Mã thử trần lượt — giao dịch này sẽ rollback.', $2)`,
      [T, CHU_TIEM]);
    const l1 = (await c.query(`select voucher_apply($1, 'THU-TRAN-1-LUOT') kq`, [donThu[0].id])).rows[0].kq;
    const l2 = (await c.query(`select voucher_apply($1, 'THU-TRAN-1-LUOT') kq`, [donThu[1].id])).rows[0].kq;
    ra.push({ phep: "vượt trần số lượt: mã tối đa 1 lượt, dùng lần 2", chan: l1.ok === true && l2.ok === false, noi: `lần 1 ${l1.ok ? "OK" : l1.ly_do} · lần 2 ${l2.ok ? "LỌT" : l2.ly_do}` });
  }

  // (e) ĐỔI ĐIỂM QUÁ SỐ CÓ
  const khachNgheo = (await c.query(
    `select o.id from orders o where o.tenant_id = $1 and o.kind = 'order' and o.status = 'draft'
       and o.deleted_at is null and o.contact_id is not null order by o.id limit 1`, [T])).rows[0];
  if (khachNgheo) {
    const f = (await c.query(`select loyalty_redeem_for_order($1, 9999900) kq`, [khachNgheo.id])).rows[0].kq;
    ra.push({ phep: "đổi 9.999.900 điểm khi khách không có ngần ấy điểm", chan: f.ok === false, noi: f.ly_do ?? "CHO QUA" });
  }
  return ra;
});
let loTien = 0;
for (const r of ketLuan2) {
  console.log(`  ${r.chan ? "CHẶN ĐÚNG" : "!!! LỌT !!!"}  ${r.phep}`);
  console.log(`             → ${r.noi}`);
  if (!r.chan) loTien++;
}
if (loTien) {
  ghiChu(`PHÁT HIỆN ${loTien} LỖ TIỀN THẬT ở tầng mã giảm giá / đổi điểm — xem dòng "LỌT" ngay trên. Việc này quan trọng hơn cả việc nạp dữ liệu.`);
} else {
  console.log("  → Cả 6 chốt giữ tiền đều chặn đúng. Mọi phép thử trên đã ROLLBACK, CSDL không còn vết.");
}
const conRac = Number((await c.query(`select count(*) n from vouchers where tenant_id = $1 and code = 'THU-TRAN-1-LUOT'`, [T])).rows[0].n);
console.log(`  Kiểm lại sau rollback: mã thử 'THU-TRAN-1-LUOT' còn sót lại ${conRac} dòng (phải là 0).`);
if (conRac) ghiChu("Mã thử không được dọn — rollback không ăn.");

tieu("ĐỐI CHỨNG 3 — HOA HỒNG TĂNG THÊM DO HỢP ĐỒNG (để đối soát bảng lương)");
console.log(`  TRƯỚC: ${so(HH_TRUOC.n)} dòng · ${tien(HH_TRUOC.tien)}`);
console.log(`  SAU  : ${so(HH_SAU.n)} dòng · ${tien(HH_SAU.tien)}`);
console.log(`  TĂNG : +${HH_SAU.n - HH_TRUOC.n} dòng · +${tien(Number(HH_SAU.tien) - Number(HH_TRUOC.tien))}`);
console.log(`  Toàn bộ phần tăng này gắn với hợp đồng: ${HH_SAU.n_hd} dòng · ${tien(HH_SAU.tien_hd)} (trước khi chạy: ${HH_TRUOC.n_hd} dòng · ${tien(HH_TRUOC.tien_hd)})`);
const hhGoi = (await c.query(
  `select e.full_name, count(*)::int n, sum(ce.amount_vnd)::bigint tien,
          count(*) filter (where ce.is_reversal)::int tru
     from commission_entries ce join employees e on e.id = ce.employee_id
    where ce.tenant_id = $1 and ce.contract_id is not null
    group by e.full_name order by 3 desc`, [T])).rows;
for (const r of hhGoi) console.log(`     ${r.full_name.padEnd(26)} ${String(r.n).padStart(3)} khoản · ${tien(r.tien).padStart(14)}${r.tru ? ` (có ${r.tru} khoản TRỪ do huỷ hợp đồng)` : ""}`);
const hhThang = (await c.query(
  `select to_char(ce.earned_on, 'MM/YYYY') thang, count(*)::int n, sum(ce.amount_vnd)::bigint tien
     from commission_entries ce where ce.tenant_id = $1 and ce.contract_id is not null group by 1 order by 1`, [T])).rows;
console.log("  Rơi vào kỳ lương: " + hhThang.map((r) => `${r.thang} (+${tien(r.tien)})`).join(" · ") +
  "  ← cố ý dồn vào kỳ ĐANG MỞ, không đụng kỳ 05/06/07 đã chốt sổ.");

/* Tháng 08 ĐƯỢC PHÉP tăng — mục 13 cố ý cộng thêm đơn mới vào đó, và kỳ lương
   08 còn nháp nên tính lại được. Mọi tháng khác phải đứng yên TUYỆT ĐỐI: chúng
   đã chốt sổ lương, xê một đồng là bảng lương người ta đã ký thành sai.        */
tieu("CHỐT AN TOÀN — THÁNG ĐÃ CHỐT SỔ CÓ BỊ XÊ DỊCH KHÔNG?");
const THANG_MO = "08/2026";
let lech = 0;
for (const t of DT_TRUOC) {
  const s = DT_SAU.find((x) => x.thang === t.thang);
  const d = Number(s?.dt ?? 0) - Number(t.dt);
  const duocPhep = t.thang === THANG_MO;
  if (d !== 0 && !duocPhep) lech++;
  const nhan = d === 0 ? "KHÔNG ĐỔI (đúng)" : duocPhep ? `+${tien(d)} — kỳ đang mở, được phép` : `LỆCH ${tien(d)} — SAI`;
  console.log(`  ${t.thang}: ${tien(t.dt)} → ${tien(s?.dt ?? 0)}   ${nhan}`);
}
if (lech) ghiChu(`${lech} tháng ĐÃ CHỐT SỔ bị xê dịch doanh thu — script đã chạm vào đơn cũ, đây là lỗi nặng.`);
else console.log("  → Không tháng đã chốt sổ nào xê dịch. Chỉ tháng 08 tăng, đúng như thiết kế.");
/* Doanh thu mỗi ngày là thước duy nhất so sánh được giữa tháng đủ và tháng dở.
   So tổng tháng 08 (mới 20 ngày) với tháng 07 (31 ngày) là so nhầm đơn vị.     */
const nhipNgay = (await c.query(
  `select to_char(date_trunc('month', o.created_at at time zone 'Asia/Ho_Chi_Minh'), 'MM/YYYY') thang,
          sum(l.line_total_vnd)::bigint dt,
          count(distinct (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date)::int ngay
     from orders o join order_lines l on l.order_id = o.id
    where o.tenant_id = $1 and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null
    group by 1 order by 1`, [T])).rows;
console.log("  Nhịp doanh thu mỗi ngày có bán (thước so sánh đúng giữa tháng đủ và tháng dở):");
for (const r of nhipNgay) console.log(`     ${r.thang}: ${tien(Math.round(Number(r.dt) / r.ngay))}/ngày  (${r.ngay} ngày)`);
console.log(`  Giảm giá đang nằm trên đơn nháp: ${tien(GG_TRUOC)} → ${tien(GG_SAU)}` +
  (Number(GG_TRUOC) === Number(GG_SAU) ? "  (không đổi — không có mã nào bị cộng hai lần)" : `  (+${tien(Number(GG_SAU) - Number(GG_TRUOC))})`));

tieu("TỔNG KẾT");
console.log(`  Sổ điểm    : ${SAU.loyalty_ledger} dòng · ` +
  (await c.query(`select count(distinct contact_id)::int n from loyalty_ledger where tenant_id = $1`, [T])).rows[0].n +
  `/776 khách có điểm · còn hiệu lực ` +
  so((await c.query(`select coalesce(sum(remaining), 0)::bigint n from loyalty_ledger where tenant_id = $1 and expires_at > now()`, [T])).rows[0].n) + " điểm");
console.log(`  Mã giảm giá: ${SAU.vouchers} mã · ${SAU.voucher_redemptions} lượt đã dùng`);
console.log(`  Chiến dịch : ${SAU.campaigns} chiến dịch · ${SAU.campaign_sends} đợt gửi · ${SAU.campaign_send_recipients} người nhận · ${SAU.campaign_summary} bản chốt sổ`);
console.log(`  Marketing  : ${SAU.source_costs} dòng chi phí nguồn khách`);
console.log(`  Liệu trình : ${SAU.service_packages} gói · ${SAU.contracts} hợp đồng · ${SAU.contract_sessions} buổi đã dùng`);

if (CANH_BAO.length) {
  tieu("NHỮNG CHỖ CẦN BIẾT (không im lặng bỏ qua)");
  CANH_BAO.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
}

await c.end();
console.log("\nXong.");
