#!/usr/bin/env node
/**
 * PHỦ NỐT CÁC MẢNG CÒN TRỐNG CHO 5 TIỆM MẪU
 * (sample-fnb · sample-kham · sample-pet · sample-retail · sample-shop)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════════════
 * Đo ngày 20/08 trên 122 bảng có cột tiệm:
 *     demo-spa-huong-sen  106/122      ← tiệm đã làm xong, dùng làm chuẩn
 *     sample-fnb           49/122
 *     sample-kham          48/122
 *     sample-pet           48/122
 *     sample-shop          46/122
 *     sample-retail        45/122
 * Năm tiệm này đã có người, hàng, khách, đơn, lịch, ca, công, lương, hoa hồng —
 * tức là phần "bán hàng và trả lương" thì đủ. Cái thiếu đúng là phần khiến người
 * xem thử tin đây là phần mềm ALL-IN-ONE chứ không phải máy tính tiền: giữ chân
 * khách, hợp đồng, điều hành, kiểm kho, kho tri thức, duyệt giảm giá, nội bộ,
 * tích hợp. Mở các màn đó ra hiện giờ chỉ thấy khung rỗng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐẶT QUY MÔ THEO NGÀNH — KHÔNG CHÉP Y NGUYÊN CỦA SPA
 * ═══════════════════════════════════════════════════════════════════════════
 * Mỗi ngành sống bằng một mảng khác nhau. Nhồi cho đủ số là làm ra một tiệm
 * không có thật, và người trong nghề nhìn phát ra ngay.
 *
 *   • Cafe Góc Phố (fnb) — TÍCH ĐIỂM là trục chính (thẻ tích điểm quán cà phê),
 *     KIỂM KHO nguyên liệu nặng (sữa, syrup, hạt — hao hụt và hết hạn hàng
 *     tuần), TRẦN GIẢM GIÁ nặng (thu ngân tự bấm giảm là rủi ro thật của quán).
 *     Hợp đồng chỉ NHẸ: quán không bán "liệu trình", nhưng có "thẻ trả trước
 *     10 ly" — đúng là một hợp đồng nhiều buổi.
 *
 *   • Nha Khoa An Tâm (kham) — HỢP ĐỒNG là trục chính và nặng nhất: niềng răng
 *     18–24 tháng, implant, tẩy trắng. KHẢO SÁT HÀI LÒNG nặng (2.353 lịch hẹn,
 *     hỏi sau khám là chuẩn ngành). TÍCH ĐIỂM nhẹ — phòng khám hiếm khi phát
 *     thẻ điểm, ai cũng biết vậy nên làm nặng là sai.
 *
 *   • Spa Thú Cưng Bống Bang (pet) — GÓI TẮM ĐỊNH KỲ là trục chính (gói 10 lần
 *     tắm, gói cắt tỉa). Khảo sát vừa, tích điểm vừa, chiến dịch theo mùa.
 *
 *   • Mỹ Phẩm Ngọc Trai (retail) — TÍCH ĐIỂM + HẠNG KHÁCH nặng (mỹ phẩm bán
 *     lặp lại), CHIẾN DỊCH + MÃ GIẢM nặng, CHI PHÍ NGUỒN nặng (tiền quảng cáo
 *     là khoản chi lớn nhất ngoài hàng), KIỂM KHO nặng (hạn dùng).
 *
 *   • Sắc Màu Boutique (shop) — CHIẾN DỊCH + MÃ GIẢM GIÁ là trục chính nhất
 *     (sale theo mùa, mã cho khách cũ), kiểm kho nặng (thất thoát hàng treo).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NHỮNG MẢNG CỐ Ý BỎ — VÀ VÌ SAO (bỏ có lý tốt hơn nhồi cho đủ số)
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. HỢP ĐỒNG & GÓI cho `sample-retail` và `sample-shop`.
 *     Hai tiệm này đo ra 0 lịch hẹn, 0 tài nguyên, 0 mặt hàng loại dịch vụ —
 *     tức là bán lẻ thuần. Cửa hàng mỹ phẩm và tiệm quần áo không bán "gói
 *     nhiều buổi". Màn Hợp đồng để trống ở đây là ĐÚNG, không phải thiếu.
 *
 *  2. KHẢO SÁT HÀI LÒNG cho `sample-retail` và `sample-shop`.
 *     `satisfaction_surveys.appointment_id` là cột BẮT BUỘC. Hai tiệm không có
 *     lịch hẹn nào ⇒ không có gì để hỏi sau. Không bịa lịch hẹn cho tiệm bán lẻ
 *     chỉ để lấp một bảng.
 *
 *  3. TÀI NGUYÊN (giường/phòng/ghế) cho `sample-retail` và `sample-shop`.
 *     Cùng lý do: bán lẻ không xếp chỗ.
 *
 *  4. `help_requests` (nút "Cần giúp?") — BỎ CHO CẢ 5 TIỆM.
 *     Đã đọc mã: trigger `help_requests_platform_notify` gọi `platform_notify`,
 *     và đã ĐO điều kiện trong hàm đó — hệ đang có `platform_bot_chat_id` và có
 *     quản trị viên nối Telegram ⇒ mỗi dòng chèn vào đây sẽ đẩy MỘT TIN NHẮN
 *     THẬT vào hộp thư nền tảng của người sáng lập. Bộ nạp mẫu không được phép
 *     tạo ra tiếng chuông thật ngoài đời. Đây là cùng một luật với "webhook chỉ
 *     trỏ tên miền ví dụ".
 *
 *  5. `webhook_deliveries` (lịch sử phát tin ra ngoài) — BỎ CHO CẢ 5 TIỆM.
 *     Đường duy nhất sinh ra nó là `webhook_queue_new`, mà hàm đó đọc/ghi
 *     `webhook_fanout_cursor` — một con trỏ CHUNG TOÀN HỆ (`only_row`), không
 *     phải của riêng tiệm nào. Hôm nay đang có phiên khác nạp cho tiệm spa; xê
 *     dịch con trỏ chung lúc này là phát nhầm phiếu cho tiệm người khác. Đổi
 *     một ô rỗng lấy một ô sai thì không phải là sửa. Vẫn nạp `webhook_endpoints`
 *     và `webhook_events` — hai thứ này thuần theo tiệm.
 *
 *  6. Tuyển dụng (`job_openings`, `candidates`, `interviews`…), luồng duyệt
 *     (`wf_*`, `workflows`), chăm sóc đa kênh (`livechat_visitors`,
 *     `conversation_handoffs`, `quick_replies`, `sla_*`), `ai_autopilot`,
 *     `qr_codes` — KHÔNG thuộc phạm vi việc này. Nêu ra để người sau biết là bỏ
 *     có ý thức, không phải quên.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐI BẰNG ĐƯỜNG CỦA SẢN PHẨM, KHÔNG CHÈN TẮT
 * ═══════════════════════════════════════════════════════════════════════════
 * Mọi bảng KÉO THEO đều để hàm/trigger tự đẻ. Script này KHÔNG có một câu ghi
 * thẳng nào vào: `loyalty_ledger` · `voucher_redemptions` · `campaign_summary` ·
 * `campaign_send_recipients` · `discount_approvals` · `stock_moves` ·
 * `commission_entries`. Có một cổng tự soát chạy ngay đầu file, đọc chính thân
 * file này và DỪNG nếu thấy câu ghi thẳng. Đường đi:
 *     điểm            → `loyalty_earn_for_order` / `loyalty_grant` / `loyalty_redeem_for_order`
 *     lượt dùng mã    → `voucher_apply`
 *     người nhận tin  → `campaign_send_add_recipients` (hàm tự loại người chưa đồng ý)
 *     chốt sổ chiến dịch → `campaign_tong_ket_yeu_cau`
 *     phiếu duyệt giảm → `discount_request` / `discount_decide`
 *     chỉ tiêu        → `kpi_set_target`
 *     buổi đã dùng    → trigger `contract_sessions_sync` (không sửa tay `sessions_used`)
 *     dòng kho        → trigger `stocktakes_sinh_dong_kho` (chuyển phiếu sang `da_chot`)
 *     hoa hồng gói    → trigger `contracts_sinh_hoa_hong`
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ HỢP ĐỒNG LÀM LỆCH BẢNG LƯƠNG — CHỖ ĐÃ SAI HAI LẦN HÔM NAY
 * ═══════════════════════════════════════════════════════════════════════════
 * Ghi hợp đồng ⇒ trigger `contracts_sinh_hoa_hong` đẻ hoa hồng ⇒ phiếu lương
 * của tiệm đó thiếu tiền so với sổ hoa hồng. Đã đọc `commission_sinh_cho_hop_dong`
 * để biết chắc: `earned_on` lấy từ `contracts.created_at`, KHÔNG phải `starts_at`.
 * Nên hai chốt cứng:
 *   (a) `created_at` của mọi hợp đồng đặt trong 08/2026 — kỳ lương duy nhất còn
 *       NHÁP ở cả 5 tiệm (05, 06, 07 đã chốt sổ, đã đo). `starts_at` đặt cùng
 *       tháng cho khỏi mâu thuẫn "ký tháng 5 mà nhập máy tháng 8".
 *   (b) Chạy xong, dựng lại dòng hoa hồng trên phiếu lương 08/2026 của đúng
 *       những tiệm bị ảnh hưởng, rồi IN RA đối chứng từng tháng từng tiệm.
 * Kỳ ĐÃ CHỐT không được nhúc nhích một đồng — có phép đo riêng ở cuối bài.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHẠY LẠI KHÔNG NHÂN ĐÔI
 * ═══════════════════════════════════════════════════════════════════════════
 * Mọi thứ neo vào khoá cố định tất định: mã hợp đồng trong ghi chú, mã giảm giá,
 * tên chiến dịch, tên dự án, tiêu đề việc, câu hỏi kho tri thức, mốc trên phiếu
 * kiểm kê, đường dẫn tệp, ngày nghỉ. Chạy hai lần ra cùng một con số.
 *
 *   node --env-file=.env.local scripts/seed-phu-mang-5-tiem-mau.mjs
 *
 * Chỉ đụng tiệm `is_sample = true` và CHỈ 5 slug trong danh sách trắng.
 * TUYỆT ĐỐI không chạm `demo-spa-huong-sen` — có phép đo chứng minh ở cuối.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOC = "[phu-mang-5-tiem]";
const HOM_NAY = "2026-08-20";

/* Danh sách trắng — cứng trong mã, không nhận từ biến môi trường. */
const CHO_PHEP = ["sample-fnb", "sample-kham", "sample-pet", "sample-retail", "sample-shop"];
const CAM_TUYET_DOI = "demo-spa-huong-sen";

/* ══════════════════════════════════════════════════════════════════════════
   CỔNG TỰ SOÁT — đọc chính thân file này trước khi nối CSDL.
   Không tin lời hứa trong phần chú thích; đọc mã và dừng nếu thấy câu cấm.
   ══════════════════════════════════════════════════════════════════════════ */
{
  const than = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const duoi = than.slice(than.indexOf("@@MOC-HET-CONG-TU-SOAT@@"));
  const CAM = [
    [/insert\s+into\s+(public\.)?loyalty_ledger/i, "ghi thẳng sổ điểm"],
    [/insert\s+into\s+(public\.)?voucher_redemptions/i, "ghi thẳng lượt dùng mã"],
    [/insert\s+into\s+(public\.)?campaign_summary/i, "ghi thẳng bản chốt sổ chiến dịch"],
    [/insert\s+into\s+(public\.)?campaign_send_recipients/i, "ghi thẳng người nhận tin"],
    [/insert\s+into\s+(public\.)?discount_approvals/i, "ghi thẳng phiếu xin duyệt"],
    [/insert\s+into\s+(public\.)?stock_moves/i, "ghi thẳng dòng kho"],
    [/insert\s+into\s+(public\.)?commission_entries/i, "ghi thẳng sổ hoa hồng"],
    [/insert\s+into\s+(public\.)?notification_channels/i, "dựng kênh bot giả"],
    [/insert\s+into\s+(public\.)?staff_channel_links/i, "dựng mã đăng nhập bot giả"],
    [/update\s+(public\.)?contracts[\s\S]{0,120}?sessions_used\s*=/i, "sửa tay số buổi đã dùng"],
    [/update\s+(public\.)?payroll_periods[\s\S]{0,80}?status\s*=\s*'closed'/i, "tự chốt sổ kỳ lương"],
  ];
  const pham = CAM.filter(([re]) => re.test(duoi));
  if (pham.length) {
    console.error("DỪNG — cổng tự soát bắt được câu cấm trong thân file: " +
      pham.map(([, ten]) => ten).join(", "));
    process.exit(1);
  }
  if (duoi.includes(CAM_TUYET_DOI)) {
    console.error(`DỪNG — thân file có nhắc "${CAM_TUYET_DOI}" ở phần thi hành.`);
    process.exit(1);
  }
  console.log("Cổng tự soát: thân script không có câu ghi thẳng vào bảng kéo theo,");
  console.log("              không dựng kênh bot, không nhắc tiệm spa. OK.\n");
}
/* @@MOC-HET-CONG-TU-SOAT@@ — từ đây trở xuống là phần cổng trên soi vào. */

const DB = process.env.SUPABASE_DB_URL;
if (!DB) { console.error("Thiếu SUPABASE_DB_URL"); process.exit(1); }

const c = new pg.Client({
  connectionString: DB,
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();
await c.query("set lock_timeout = '10s'");

/* ══════════════════════════════════════════════════════════════════════════
   TIỆN ÍCH CHUNG
   ══════════════════════════════════════════════════════════════════════════ */
const tien = (n) => Number(n).toLocaleString("vi-VN") + "đ";
const so = (n) => Number(n).toLocaleString("vi-VN");
const tieu = (s) => console.log(`\n${"═".repeat(78)}\n  ${s}\n${"═".repeat(78)}`);
const muc = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 70 - s.length))}`);

/* Số giả ngẫu nhiên TẤT ĐỊNH: cùng hạt → cùng dãy, chạy lại không đổi. */
const hat = (s) => {
  const h = createHash("sha256").update(String(s)).digest();
  return h.readUInt32BE(0);
};
const nn = (khoa, tu, den) => {
  const x = hat(khoa);
  return tu + (x % (den - tu + 1));
};

/* Mượn danh người thật trong tiệm để `auth.uid()` / `app_role()` nhìn thấy ai
   đang thao tác. Nối bằng `pg` thì hai hàm đó rỗng ⇒ RPC ném `forbidden`.
   `set_config(..., true)` chỉ sống trong giao dịch hiện tại. */
const CLAIM = (uid, vai, T) => JSON.stringify({
  sub: uid, role: "authenticated", app_metadata: { tenant_id: T, role: vai },
});
async function moPhien(uid, vai, T) {
  await c.query("begin");
  await c.query("set local lock_timeout = '10s'");
  await c.query(`select set_config('request.jwt.claims', $1, true), set_config('role','authenticated',true)`,
    [CLAIM(uid, vai, T)]);
}
async function nhuVai(uid, vai, T, fn) {
  await moPhien(uid, vai, T);
  try { const v = await fn(); await c.query("commit"); return v; }
  catch (e) { await c.query("rollback").catch(() => {}); throw e; }
}

const CANH_BAO = [];
const ghiChu = (s) => { CANH_BAO.push(s); console.log("  ⚠ " + s); };

/* Chạy một bước, hỏng thì ghi lại và đi tiếp — một mảng gãy không được kéo
   theo bốn mảng còn lại xuống hố. */
async function thu(nhan, fn) {
  try { return await fn(); }
  catch (e) { ghiChu(`${nhan}: ${String(e.message).split("\n")[0]}`); return null; }
}

/* ══════════════════════════════════════════════════════════════════════════
   PHÉP ĐO ĐỘ PHỦ — 122 bảng có cột tiệm
   ══════════════════════════════════════════════════════════════════════════ */
const { rows: BANG_TENANT } = await c.query(`
  select c.relname t from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
                     and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public' and c.relkind = 'r' order by 1`);

async function doPhu(ids) {
  const cot = ids.map((x, i) => `count(*) filter (where tenant_id = '${x}')::int c${i}`).join(", ");
  const cau = BANG_TENANT.map((r) => `select '${r.t}' t, ${cot} from public.${r.t}`).join(" union all ");
  const { rows } = await c.query(cau);
  return ids.map((_, i) => rows.filter((r) => r[`c${i}`] > 0).length);
}

/* Bảng KÉO THEO — chỉ được tăng do hàm/trigger. Đếm trước/sau để đối chứng. */
const BANG_KEO_THEO = ["loyalty_ledger", "voucher_redemptions", "campaign_summary",
  "campaign_send_recipients", "discount_approvals", "stock_moves", "commission_entries",
  "cash_entries", "notifications"];

async function demKeoTheo(T) {
  const r = {};
  for (const b of BANG_KEO_THEO)
    r[b] = Number((await c.query(`select count(*) n from public.${b} where tenant_id = $1`, [T])).rows[0].n);
  return r;
}

/* Doanh thu tháng tròn — thứ PHẢI KHÔNG ĐỔI. Nhúc nhích là đã chạm đơn đã chốt. */
const doDoanhThu = async (T) => (await c.query(
  `select to_char(date_trunc('month', o.created_at at time zone 'Asia/Ho_Chi_Minh'), 'MM/YYYY') thang,
          sum(l.line_total_vnd)::bigint dt
     from public.orders o join public.order_lines l on l.order_id = o.id
    where o.tenant_id = $1 and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null
    group by 1 order by 1`, [T])).rows;

/* Đối soát hoa hồng: sổ hoa hồng ↔ dòng hoa hồng trên phiếu lương, theo từng kỳ. */
const doDoiSoatLuong = async (T) => (await c.query(
  `select to_char(k.period, 'MM/YYYY') ky, k.status,
          (select coalesce(sum(ce.amount_vnd), 0) from public.commission_entries ce
            where ce.tenant_id = $1 and date_trunc('month', ce.earned_on) = k.period)::bigint so_hoa_hong,
          (select coalesce(sum(l.amount_vnd), 0) from public.payslip_lines l
             join public.payslips p on p.id = l.payslip_id
            where p.period_id = k.id and l.source_type = 'commission')::bigint tren_phieu,
          k.total_vnd
     from public.payroll_periods k where k.tenant_id = $1 order by k.period`, [T])).rows;

/* ══════════════════════════════════════════════════════════════════════════
   CẤU HÌNH THEO NGÀNH
   `nang` = số lượng đặt cho mảng đó ở tiệm này. 0 = cố ý bỏ (đã giải thích ở đầu file).
   ══════════════════════════════════════════════════════════════════════════ */
const NGANH = {
  "sample-fnb": {
    ten: "Cafe Góc Phố",
    // Quán cà phê: đơn nhỏ, nên 1 điểm cho mỗi 5.000đ mới có nghĩa.
    diem: { vnd_per_point: 5000, redeem_points_unit: 100, redeem_value_vnd: 10000, referral_points: 50, expire_months: 12 },
    hang: { vip_min_revenue: 5000000, vip_min_won_deals: 15, regular_min_won_deals: 4, dormant_after_days: 45 },
    tichDonCu: 140, thuong: 10, doiDiem: 3,       // TÍCH ĐIỂM — NẶNG (trục chính)
    dongY: 420,
    ma: [
      { ma: "GIOVANG20", kind: "percent", pct: 20, tran: 40000, luot: 300, moi: 200000, ghi: "Giảm 20% khung 14h–16h các ngày trong tuần", het: "2026-08-31", cd: "Giờ vàng chiều 14h–16h" },
      { ma: "SANGSOM15", kind: "percent", pct: 15, tran: 30000, luot: 250, moi: 100000, ghi: "Giảm 15% cho đơn trước 8h sáng", het: "2026-08-31", cd: "Cà phê sáng sớm" },
      { ma: "MUA2TANG1", kind: "amount", vnd: 45000, tran: 45000, luot: 150, moi: 90000, ghi: "Mua 2 ly tặng 1 — trừ thẳng giá ly rẻ nhất", het: "2026-07-15", cd: "Cuối tuần mua 2 tặng 1" },
      { ma: "SINHNHAT30", kind: "percent", pct: 30, tran: 60000, luot: 120, moi: 0, ghi: "Ưu đãi sinh nhật khách thân thiết", het: "2026-12-31", cd: null, khachCu: 1 },
      { ma: "HENGAP10", kind: "percent", pct: 10, tran: 25000, luot: 400, moi: 50000, ghi: "Mã cảm ơn khách quay lại", het: "2026-12-31", cd: null },
    ],
    chienDich: [
      { ten: "Cà phê sáng sớm", tu: "2026-06-01", den: "2026-08-31", tran: 6000000, quangCao: 1800000,
        loi: "Đến trước 8h sáng, giảm 15% mọi loại cà phê. Mã SANGSOM15.",
        gui: [{ ngay: "2026-06-02", gio: "08:30", n: 150, than: "Góc Phố chào buổi sáng! Ghé quán trước 8h, nhắn mã SANGSOM15 để giảm 15% mọi loại cà phê. Hẹn gặp anh chị ạ." }] },
      { ten: "Giờ vàng chiều 14h–16h", tu: "2026-07-01", den: "2026-08-31", tran: 9000000, quangCao: 2600000,
        loi: "Khung 14h–16h vắng khách, giảm 20% để kéo người vào. Mã GIOVANG20.",
        gui: [{ ngay: "2026-07-02", gio: "14:10", n: 180, than: "Chiều buồn ngủ quá phải không ạ? Từ 14h đến 16h quán giảm 20% toàn menu. Nhắn mã GIOVANG20 khi gọi món nhé." },
              { ngay: "2026-08-04", gio: "09:20", n: 160, than: "Giờ vàng 14h–16h vẫn còn tới hết tháng 8. Mã GIOVANG20 giảm 20%, tối đa 40k. Ghé quán nha anh chị." }] },
      { ten: "Cuối tuần mua 2 tặng 1", tu: "2026-05-15", den: "2026-07-15", tran: 5000000, quangCao: 1500000,
        loi: "Thứ Bảy và Chủ nhật, mua 2 ly tặng 1 ly cùng loại. Mã MUA2TANG1.",
        gui: [{ ngay: "2026-05-16", gio: "10:00", n: 140, than: "Cuối tuần này rủ bạn ghé Góc Phố: mua 2 ly tặng 1 ly. Nhắn mã MUA2TANG1 tại quầy ạ." }] },
    ],
    goi: [
      { ten: "Thẻ 10 ly cà phê", buoi: 10, gia: 350000, han: 180, mo: "Trả trước 10 ly cà phê bất kỳ, rẻ hơn mua lẻ khoảng 30%. Dùng trong 6 tháng, chuyển cho người thân được." },
      { ten: "Thẻ 20 ly trà & nước ép", buoi: 20, gia: 640000, han: 240, mo: "Trả trước 20 ly trà trái cây hoặc nước ép. Hợp với khách văn phòng gần quán." },
    ],
    soHopDong: 9,                                  // HỢP ĐỒNG — NHẸ (quán không bán liệu trình)
    duAn: [
      { ten: "Ra mắt menu mùa hè 2026", mo: "Thêm 6 món đá xay và trà trái cây cho mùa nóng, đổi bảng giá và ảnh menu.", batDau: "2026-06-01", nganSach: 18000000,
        viec: [["task", "Chốt công thức 6 món đá xay", "2026-06-08", 1], ["task", "Đặt in menu và standee mới", "2026-06-15", 1],
               ["task", "Tập huấn pha chế cho ca sáng và ca chiều", "2026-06-22", 1], ["meeting", "Nếm thử nội bộ, chấm điểm từng món", "2026-06-25", 1],
               ["task", "Chụp ảnh món đăng Facebook và Zalo", "2026-06-29", 0]] },
      { ten: "Chuẩn hoá định lượng và giảm hao hụt", mo: "Cân lại định lượng từng món, ghi công thức chuẩn, giảm hao sữa và syrup.", batDau: "2026-07-10", nganSach: 6000000,
        viec: [["task", "Cân định lượng 15 món bán chạy", "2026-07-18", 1], ["task", "Dán bảng công thức chuẩn tại quầy", "2026-07-25", 1],
               ["task", "Đối chiếu hao hụt tuần đầu sau chuẩn hoá", "2026-08-08", 0], ["call", "Làm việc với nhà cung cấp sữa về hạn dùng", "2026-08-14", 0]] },
    ],
    kpi: [["revenue_won", 180000000], ["new_contacts", 60], ["tasks_done", 25]],
    kiemKho: 4, tranGiam: { staff: 5, manager: 15, admin: 40 }, xinGiam: 5,   // TRẦN GIẢM — NẶNG
    kb: [
      ["published", "Quán mở cửa mấy giờ, có mở cuối tuần không?", "Góc Phố mở cửa 6h30–22h00 tất cả các ngày trong tuần, kể cả thứ Bảy, Chủ nhật.\nKhung đông nhất là 7h–9h sáng và 19h–21h tối. Nếu anh chị đi nhóm từ 6 người trở lên, nhắn quán giữ bàn trước cho chắc ạ."],
      ["published", "Quán có wifi không, mật khẩu là gì?", "Có ạ. Tên wifi là GocPho-Khach, mật khẩu dán trên mỗi bàn và in ở mặt sau hoá đơn.\nĐường truyền quán đủ để họp trực tuyến và tải file. Khu vực gần cửa sổ sóng yếu hơn một chút, anh chị ngồi bàn trong sẽ ổn hơn."],
      ["published", "Quán có nhận đặt bàn trước không?", "Có. Anh chị nhắn Zalo hoặc gọi quán trước ít nhất 2 tiếng, cho quán biết số người và khung giờ.\nQuán giữ bàn 20 phút kể từ giờ hẹn. Quá 20 phút mà chưa thấy anh chị tới, quán buộc phải nhận khách khác — mong anh chị thông cảm vì giờ cao điểm bàn rất căng."],
      ["published", "Có giao hàng tận nơi không?", "Có ạ. Quán giao trong bán kính 3km, phí giao 15.000đ, đơn từ 150.000đ được miễn phí giao.\nĐặt qua Zalo của quán hoặc qua các ứng dụng giao đồ ăn. Giờ cao điểm 11h–13h đơn có thể chậm hơn bình thường 10–15 phút."],
      ["published", "Cà phê của quán dùng hạt gì?", "Quán dùng hai dòng:\n• Robusta Đắk Lắk rang đậm — cho cà phê phin, cà phê sữa đá, bạc xỉu. Vị đắng gắt, hậu ngọt, đúng gu cà phê Việt.\n• Arabica Cầu Đất rang vừa — cho các món máy như espresso, latte, cappuccino. Chua thanh, thơm mùi trái cây.\nHạt rang theo mẻ nhỏ mỗi tuần, quán không trữ quá 3 tuần kể từ ngày rang."],
      ["published", "Có món nào cho người không uống được cà phê?", "Nhiều ạ. Nhóm trà trái cây (đào, vải, chanh dây), nhóm nước ép tươi (cam, dứa, cà rốt), sữa chua đánh đá, và ca cao nóng.\nNhóm trà sữa quán làm bằng trà ủ tươi, không dùng bột pha sẵn. Anh chị nói mức đường 30–50–70–100% khi gọi món nhé."],
      ["published", "Quán có chỗ để xe không?", "Có bãi để xe máy ngay trước quán, miễn phí, có nhân viên trông từ 7h đến 21h.\nÔ tô thì anh chị gửi ở bãi cách quán khoảng 80m, quán không thu phí nhưng bãi đó thu theo giờ."],
      ["draft", "Khách phàn nàn đồ uống sai vị thì xử lý thế nào?", "(Hướng dẫn nội bộ — chưa đăng)\n1. Xin lỗi trước, không giải thích trước.\n2. Hỏi khách muốn làm lại đúng vị hay đổi món khác — làm lại ngay, không tính thêm tiền.\n3. Ghi lại vào sổ ca: món gì, ai pha, sai chỗ nào. Cuối ca quản lý xem lại.\n4. Nếu khách đã uống hơn nửa ly mới nói, vẫn làm lại, nhưng ghi chú riêng để theo dõi.\nKhông tranh luận với khách tại quầy trước mặt khách khác."],
    ],
    kiemKhoTen: "nguyên liệu",
    noiBo: 4, khoaApi: 2, suKien: 5, duongBao: 2, tep: 3, khaoSat: 14, chiNcc: 4, nghiLe: 5, capHinhBao: 5,
    khungNhin: [["contacts", "Khách ghé trên 10 lần", "lifecycle:customer AND deals_won:>10"],
                ["deals", "Đơn đặt tiệc và giao nhóm", "stage:proposal"]],
  },

  "sample-kham": {
    ten: "Nha Khoa Gia Đình An Tâm",
    // Phòng khám: hoá đơn lớn, 1 điểm/50.000đ là đủ; và ngành này ít dùng thẻ điểm.
    diem: { vnd_per_point: 50000, redeem_points_unit: 200, redeem_value_vnd: 100000, referral_points: 300, expire_months: 24 },
    hang: { vip_min_revenue: 40000000, vip_min_won_deals: 4, regular_min_won_deals: 2, dormant_after_days: 180 },
    tichDonCu: 45, thuong: 6, doiDiem: 0,          // TÍCH ĐIỂM — NHẸ (không phải trục của ngành)
    dongY: 260,
    ma: [
      { ma: "KHAMMIENPHI", kind: "amount", vnd: 150000, tran: 150000, luot: 200, moi: 150000, ghi: "Miễn phí khám và tư vấn lần đầu", het: "2026-12-31", cd: "Khám và tư vấn miễn phí", khachMoi: 1 },
      { ma: "CAOVOI20", kind: "percent", pct: 20, tran: 200000, luot: 250, moi: 200000, ghi: "Giảm 20% cạo vôi và đánh bóng răng", het: "2026-09-30", cd: "Cạo vôi định kỳ 6 tháng" },
      { ma: "NIENG3TR", kind: "amount", vnd: 3000000, tran: 3000000, luot: 40, moi: 20000000, ghi: "Giảm 3 triệu khi ký hợp đồng niềng răng", het: "2026-12-31", cd: null },
      { ma: "GIADINH15", kind: "percent", pct: 15, tran: 500000, luot: 120, moi: 500000, ghi: "Ưu đãi khi cả nhà cùng khám trong một ngày", het: "2026-12-31", cd: null },
    ],
    chienDich: [
      { ten: "Khám và tư vấn miễn phí", tu: "2026-05-10", den: "2026-08-31", tran: 20000000, quangCao: 5200000,
        loi: "Khách mới được miễn phí khám, chụp phim và tư vấn kế hoạch điều trị. Mã KHAMMIENPHI.",
        gui: [{ ngay: "2026-05-12", gio: "09:00", n: 120, than: "Nha khoa An Tâm mời anh chị đến khám và tư vấn MIỄN PHÍ, có chụp phim và kế hoạch điều trị chi tiết. Nhắn mã KHAMMIENPHI khi đặt lịch ạ." }] },
      { ten: "Cạo vôi định kỳ 6 tháng", tu: "2026-06-15", den: "2026-09-30", tran: 12000000, quangCao: 3100000,
        loi: "Nhắc khách cũ đến hạn cạo vôi, giảm 20%. Mã CAOVOI20.",
        gui: [{ ngay: "2026-06-16", gio: "10:30", n: 130, than: "Đã 6 tháng kể từ lần cạo vôi gần nhất của anh chị. An Tâm giảm 20% cho lần này, mã CAOVOI20. Anh chị nhắn lại khung giờ tiện nhé." },
              { ngay: "2026-08-06", gio: "10:00", n: 110, than: "Lịch cạo vôi định kỳ của anh chị đã tới hạn. Ưu đãi 20% còn tới hết tháng 9, mã CAOVOI20." }] },
    ],
    goi: [                                          // HỢP ĐỒNG — TRỤC CHÍNH, NẶNG NHẤT
      { ten: "Niềng răng mắc cài kim loại", buoi: 24, gia: 38000000, han: 900, mo: "Niềng răng mắc cài kim loại, 24 lần tái khám siết dây trong khoảng 18–24 tháng. Bao gồm chụp phim, lấy dấu, mắc cài và toàn bộ lần siết." },
      { ten: "Niềng răng trong suốt Invisalign", buoi: 20, gia: 82000000, han: 900, mo: "Niềng bằng khay trong suốt, 20 lần tái khám kiểm tra và đổi khay. Kín đáo, tháo ra khi ăn được." },
      { ten: "Trồng răng Implant 1 trụ", buoi: 6, gia: 22000000, han: 540, mo: "Cấy 1 trụ implant, 6 lần hẹn gồm phẫu thuật, tái khám, lấy dấu và gắn răng sứ trên trụ. Bảo hành trụ 10 năm." },
      { ten: "Tẩy trắng răng tại phòng khám", buoi: 3, gia: 3500000, han: 120, mo: "Tẩy trắng bằng đèn tại phòng khám, 3 buổi cách nhau 1 tuần. Kèm máng và thuốc duy trì tại nhà." },
      { ten: "Gói chăm sóc răng cả nhà 12 tháng", buoi: 8, gia: 6800000, han: 400, mo: "8 lượt khám và cạo vôi trong 12 tháng, dùng chung cho cả gia đình. Hợp với nhà có 3–4 người." },
    ],
    soHopDong: 20,
    duAn: [
      { ten: "Mở phòng vô trùng đạt chuẩn", mo: "Tách khu tiệt trùng riêng, mua máy hấp mới, viết quy trình vô trùng dán tường.", batDau: "2026-06-05", nganSach: 120000000,
        viec: [["task", "Khảo sát mặt bằng và vẽ sơ đồ khu tiệt trùng", "2026-06-12", 1], ["call", "Xin báo giá 3 nhà cung cấp máy hấp", "2026-06-20", 1],
               ["task", "Lắp đặt và chạy thử máy hấp", "2026-07-10", 1], ["task", "Viết và dán quy trình vô trùng 8 bước", "2026-07-20", 1],
               ["meeting", "Tập huấn toàn bộ trợ thủ về quy trình mới", "2026-07-28", 1], ["task", "Kiểm tra chéo tuần đầu áp dụng", "2026-08-12", 0]] },
      { ten: "Số hoá hồ sơ bệnh nhân cũ", mo: "Chuyển hồ sơ giấy 3 năm gần nhất lên phần mềm, gắn phim và ảnh trước–sau.", batDau: "2026-07-01", nganSach: 25000000,
        viec: [["task", "Phân loại hồ sơ giấy theo năm", "2026-07-08", 1], ["task", "Quét và đặt tên file theo mã bệnh nhân", "2026-08-05", 1],
               ["task", "Nhập tiền sử dị ứng và bệnh nền vào phần mềm", "2026-08-18", 0], ["task", "Đối chiếu 50 hồ sơ ngẫu nhiên", "2026-08-26", 0]] },
    ],
    kpi: [["revenue_won", 320000000], ["new_contacts", 45], ["tasks_done", 20]],
    kiemKho: 2, tranGiam: { staff: 3, manager: 10, admin: 30 }, xinGiam: 4,
    kb: [
      ["published", "Niềng răng mất bao lâu và chi phí thế nào?", "Thời gian trung bình 18–24 tháng, tuỳ mức độ lệch lạc và độ tuổi. Người lớn thường lâu hơn trẻ đang tuổi thay răng.\nChi phí tại An Tâm:\n• Mắc cài kim loại: 38 triệu\n• Mắc cài sứ: 48 triệu\n• Khay trong suốt Invisalign: từ 82 triệu\nGiá đã gồm chụp phim, lấy dấu, toàn bộ lần tái khám siết dây và hàm duy trì sau khi tháo. Phòng khám cho trả góp theo tháng không lãi."],
      ["published", "Cạo vôi răng bao lâu một lần, có hại men răng không?", "6 tháng một lần với người bình thường; 3–4 tháng nếu anh chị hút thuốc, uống nhiều trà cà phê, hoặc đang niềng.\nCạo vôi bằng máy siêu âm KHÔNG bào mòn men răng — máy rung làm vỡ mảng vôi bám, không cắt vào răng. Cảm giác ê buốt trong lúc làm là do vôi bong ra để lộ chân răng vốn đã bị tụt lợi, chứ không phải máy làm mỏng răng. Ê buốt thường hết sau 1–2 ngày."],
      ["published", "Trồng implant có đau không, bao lâu thì ăn nhai bình thường?", "Phẫu thuật cấy trụ làm dưới gây tê, trong lúc làm không đau. Sau khi hết tê có ê và sưng nhẹ 2–3 ngày, phòng khám kê thuốc giảm đau và kháng sinh.\nTrụ cần 3–6 tháng để tích hợp với xương hàm. Trong thời gian đó anh chị vẫn ăn được nhưng nhai bên đối diện. Sau khi gắn răng sứ lên trụ thì ăn nhai như răng thật.\nTrường hợp xương hàm mỏng phải ghép xương trước, thời gian kéo dài thêm 3–4 tháng."],
      ["published", "Trẻ mấy tuổi nên đi khám răng lần đầu?", "Ngay khi mọc chiếc răng sữa đầu tiên, thường là 6–12 tháng tuổi. Lần đầu chủ yếu để bác sĩ xem cách vệ sinh và hướng dẫn cha mẹ, không làm gì trên răng bé.\nSau đó khám định kỳ 6 tháng/lần. Từ 6–7 tuổi nên chụp phim toàn cảnh một lần để xem mầm răng vĩnh viễn và phát hiện sớm lệch lạc — can thiệp sớm rẻ hơn và nhẹ hơn niềng khi đã lớn."],
      ["published", "Có bầu thì làm răng được không?", "Được, nhưng chọn thời điểm:\n• 3 tháng đầu: chỉ xử lý cấp cứu (đau, nhiễm trùng). Tránh chụp phim, tránh thủ thuật dài.\n• 3 tháng giữa (tháng 4–6): an toàn nhất, làm được cạo vôi, trám răng, nhổ răng nhẹ.\n• 3 tháng cuối: nằm ghế lâu gây khó chịu, chỉ nên làm việc gấp.\nLuôn báo bác sĩ chị đang mang thai tuần thứ mấy. Thuốc tê nha khoa liều thường dùng đã được chứng minh an toàn cho thai kỳ."],
      ["published", "Phòng khám có nhận bảo hiểm không?", "An Tâm không thanh toán trực tiếp với bảo hiểm y tế nhà nước. Với bảo hiểm sức khoẻ tư nhân, phòng khám xuất đầy đủ hoá đơn đỏ, phiếu chỉ định và giấy ra viện để anh chị nộp lại cho công ty bảo hiểm.\nMột số công ty bảo hiểm có liên kết bảo lãnh trực tiếp — anh chị gửi thẻ trước để phòng khám kiểm tra giúp."],
      ["published", "Sau nhổ răng cần kiêng gì?", "Trong 24 giờ đầu:\n• Cắn chặt gạc 30–45 phút, sau đó bỏ ra.\n• KHÔNG súc miệng mạnh, không khạc nhổ, không mút chỗ nhổ — làm bong cục máu đông sẽ gây viêm ổ răng khô, rất đau.\n• Không hút thuốc, không uống rượu bia, không dùng ống hút.\n• Ăn đồ nguội và mềm, nhai bên đối diện.\nChườm lạnh ngoài má 15 phút nghỉ 15 phút trong ngày đầu để giảm sưng. Từ ngày thứ 2 chuyển sang chườm ấm.\nNếu chảy máu không cầm sau 2 tiếng, sốt trên 38.5°C, hoặc đau tăng dần sau ngày thứ 3 thì gọi ngay cho phòng khám."],
      ["published", "Đang niềng răng thì ăn uống thế nào?", "Tránh: đồ cứng (đá, mía, xương), đồ dai dính (kẹo dẻo, bánh nếp), đồ phải cắn mạnh bằng răng cửa (táo, bắp luộc nguyên bắp — nên cắt nhỏ).\nNên: cắt nhỏ thức ăn, nhai bằng răng hàm, chải răng sau mỗi bữa bằng bàn chải kẽ.\nBung mắc cài không phải chuyện lớn nhưng làm chậm tiến độ — anh chị gọi phòng khám hẹn gắn lại sớm, đừng đợi tới lịch siết."],
      ["draft", "Khách xin giảm giá gói niềng thì trả lời sao?", "(Hướng dẫn nội bộ — chưa đăng)\nLễ tân KHÔNG tự quyết giảm giá gói. Trình tự:\n1. Nói rõ giá đã gồm những gì (phim, lấy dấu, toàn bộ lần siết, hàm duy trì) — phần lớn khách so giá vì nơi khác báo giá chưa gồm các khoản này.\n2. Giới thiệu trả góp 0% theo tháng.\n3. Nếu khách vẫn xin giảm, chuyển cho quản lý. Mức giảm tối đa lễ tân được nêu là mã NIENG3TR đang chạy.\nTuyệt đối không hứa miệng mức giảm chưa được duyệt."],
    ],
    kiemKhoTen: "vật tư nha khoa",
    noiBo: 4, khoaApi: 2, suKien: 4, duongBao: 2, tep: 3, khaoSat: 30, chiNcc: 4, nghiLe: 5, capHinhBao: 5,
    khungNhin: [["contacts", "Bệnh nhân đang niềng", "tag:nieng AND lifecycle:customer"],
                ["deals", "Ca implant đang tư vấn", "stage:proposal"]],
    donNhapCanTao: 6,   // tiệm này đang có 0 đơn nháp — cần đơn nháp để thử mã và duyệt giảm
  },

  "sample-pet": {
    ten: "Spa Thú Cưng Bống Bang",
    diem: { vnd_per_point: 20000, redeem_points_unit: 100, redeem_value_vnd: 50000, referral_points: 150, expire_months: 12 },
    hang: { vip_min_revenue: 15000000, vip_min_won_deals: 8, regular_min_won_deals: 3, dormant_after_days: 90 },
    tichDonCu: 90, thuong: 8, doiDiem: 2,
    dongY: 200,
    ma: [
      { ma: "TAMHE20", kind: "percent", pct: 20, tran: 100000, luot: 180, moi: 150000, ghi: "Giảm 20% dịch vụ tắm trong mùa nóng", het: "2026-09-15", cd: "Mùa nóng — tắm mát cho boss" },
      { ma: "BANMOI15", kind: "percent", pct: 15, tran: 80000, luot: 150, moi: 100000, ghi: "Giảm 15% cho khách được bạn giới thiệu", het: "2026-12-31", cd: null, khachMoi: 1 },
      { ma: "CATTIA10", kind: "percent", pct: 10, tran: 60000, luot: 200, moi: 200000, ghi: "Giảm 10% cắt tỉa tạo kiểu", het: "2026-12-31", cd: null },
      { ma: "TIEMPHONG50", kind: "amount", vnd: 50000, tran: 50000, luot: 100, moi: 250000, ghi: "Giảm 50k khi tiêm phòng kèm tắm", het: "2026-10-31", cd: "Nhắc lịch tiêm phòng" },
    ],
    chienDich: [
      { ten: "Mùa nóng — tắm mát cho boss", tu: "2026-05-20", den: "2026-09-15", tran: 8000000, quangCao: 2400000,
        loi: "Trời nóng, giảm 20% mọi gói tắm. Mã TAMHE20.",
        gui: [{ ngay: "2026-05-22", gio: "09:30", n: 90, than: "Trời nóng quá, boss nhà mình chắc bí bách lắm! Bống Bang giảm 20% mọi gói tắm, mã TAMHE20. Anh chị nhắn lại giờ tiện để em giữ chỗ ạ." },
              { ngay: "2026-08-05", gio: "10:15", n: 80, than: "Nắng còn gắt tới giữa tháng 9, ưu đãi tắm 20% vẫn còn ạ. Mã TAMHE20, đặt lịch trước 1 ngày cho chắc chỗ nhé." }] },
      { ten: "Nhắc lịch tiêm phòng", tu: "2026-06-10", den: "2026-10-31", tran: 6000000, quangCao: 1700000,
        loi: "Nhắc khách cũ đến hạn tiêm phòng, kèm ưu đãi tắm sau tiêm. Mã TIEMPHONG50.",
        gui: [{ ngay: "2026-06-11", gio: "08:45", n: 85, than: "Bống Bang nhắc anh chị: bé nhà mình sắp tới hạn tiêm phòng rồi ạ. Tiêm kèm tắm được giảm 50k, mã TIEMPHONG50." }] },
    ],
    goi: [                                          // GÓI ĐỊNH KỲ — TRỤC CHÍNH CỦA NGÀNH
      { ten: "Gói 10 lần tắm cơ bản", buoi: 10, gia: 1800000, han: 365, mo: "10 lần tắm, sấy, vệ sinh tai và cắt móng. Áp dụng cho chó dưới 10kg và mèo. Dùng trong 12 tháng." },
      { ten: "Gói 10 lần tắm cho bé lớn", buoi: 10, gia: 2900000, han: 365, mo: "10 lần tắm, sấy, vệ sinh tai, cắt móng cho chó trên 10kg. Kèm 2 lần vệ sinh răng miệng." },
      { ten: "Gói 5 lần cắt tỉa tạo kiểu", buoi: 5, gia: 2200000, han: 300, mo: "5 lần cắt tỉa tạo kiểu theo giống, kèm tắm và sấy tạo phom. Đặt lịch trước 2 ngày." },
      { ten: "Gói spa toàn diện 8 buổi", buoi: 8, gia: 4600000, han: 365, mo: "8 buổi gồm tắm thảo dược, dưỡng lông, massage thư giãn, vệ sinh răng và cắt tỉa nhẹ. Dành cho bé da nhạy cảm hoặc lông dài." },
    ],
    soHopDong: 15,
    duAn: [
      { ten: "Mở khu lưu trú qua đêm", mo: "Cải tạo tầng 2 thành 8 chuồng lưu trú có camera, nhận trông giữ theo ngày.", batDau: "2026-06-20", nganSach: 85000000,
        viec: [["task", "Đo đạc và chốt bố trí 8 chuồng", "2026-06-28", 1], ["call", "Chọn nhà cung cấp chuồng inox và camera", "2026-07-05", 1],
               ["task", "Thi công sàn chống trượt và thoát nước", "2026-07-25", 1], ["task", "Lắp camera và mở kênh cho khách xem từ xa", "2026-08-06", 1],
               ["meeting", "Chốt bảng giá và nội quy lưu trú", "2026-08-15", 0]] },
      { ten: "Chuẩn hoá quy trình tắm theo giống", mo: "Viết quy trình riêng cho lông ngắn, lông dài, mèo và bé da nhạy cảm.", batDau: "2026-07-15", nganSach: 8000000,
        viec: [["task", "Ghi lại quy trình đang làm cho 4 nhóm", "2026-07-24", 1], ["task", "Thử nghiệm sữa tắm mới cho bé da nhạy cảm", "2026-08-08", 1],
               ["task", "In quy trình dán tại từng bàn tắm", "2026-08-20", 0]] },
    ],
    kpi: [["revenue_won", 110000000], ["new_contacts", 35], ["tasks_done", 18]],
    kiemKho: 3, tranGiam: { staff: 5, manager: 15, admin: 35 }, xinGiam: 4,
    kb: [
      ["published", "Tắm cho chó mèo bao lâu một lần?", "Tuỳ giống và lối sống:\n• Chó lông ngắn, ở trong nhà: 2–4 tuần/lần.\n• Chó lông dài (Poodle, Golden, Corgi): 1–2 tuần/lần vì lông dễ bết và bốc mùi.\n• Chó hay ra ngoài, chạy nhảy nhiều: 1 tuần/lần.\n• Mèo: 1–2 tháng/lần, mèo tự vệ sinh khá tốt, tắm nhiều làm khô da.\nTắm quá dày làm mất lớp dầu tự nhiên, da khô và ngứa. Nếu bé chỉ bẩn chân thì lau chân là đủ."],
      ["published", "Bé sợ tắm, cào cắn thì spa xử lý thế nào?", "Bống Bang không ép. Quy trình với bé nhát:\n1. Cho bé làm quen phòng tắm 5–10 phút trước, không bật nước.\n2. Một bạn giữ và vuốt ve, một bạn làm — không làm một mình với bé đang hoảng.\n3. Dùng nước ấm vừa, xả từ chân lên, tránh xối thẳng lên đầu.\n4. Nếu bé vẫn quá căng thẳng, spa dừng lại và hẹn buổi khác, không tính tiền buổi đó.\nVới bé từng có tiền sử cắn, anh chị báo trước để spa chuẩn bị rọ mõm mềm — an toàn cho cả bé lẫn bạn nhân viên."],
      ["published", "Cắt tỉa tạo kiểu mất bao lâu?", "• Bé nhỏ dưới 5kg: khoảng 1,5–2 tiếng.\n• Bé 5–15kg: 2–3 tiếng.\n• Bé lớn trên 15kg hoặc lông rối nhiều: 3–4 tiếng.\nAnh chị đặt lịch trước 2 ngày vì bàn cắt tỉa có hạn. Nếu lông bé bị rối thành mảng, thợ phải gỡ hoặc cạo ngắn — spa sẽ gọi hỏi ý anh chị trước khi cạo, không tự quyết."],
      ["published", "Spa có nhận trông giữ qua đêm không?", "Có ạ, khu lưu trú 8 chuồng có camera, anh chị xem bé từ xa được.\nGiá theo ngày, đã gồm 2 bữa ăn và 2 lần dắt đi vệ sinh. Anh chị mang theo thức ăn quen của bé thì tốt nhất — đổi thức ăn đột ngột dễ làm bé đi ngoài.\nSpa chỉ nhận bé đã tiêm phòng đầy đủ và có sổ tiêm. Đây là quy định bắt buộc để không lây bệnh chéo giữa các bé."],
      ["published", "Bé đang bị ve rận có tắm ở spa được không?", "Được, spa có gói tắm trị ve rận riêng bằng sữa tắm chuyên dụng. Nhưng anh chị BÁO TRƯỚC khi đặt lịch để spa xếp bé vào cuối ca và khử trùng bàn sau đó.\nTắm chỉ diệt được ve rận đang bám trên lông. Trứng trong nhà, trong ổ nằm vẫn còn — anh chị cần xử lý cả chỗ ở của bé, và nên hỏi bác sĩ thú y về thuốc nhỏ gáy hoặc thuốc uống định kỳ."],
      ["published", "Giá dịch vụ của spa thế nào?", "Giá phụ thuộc cân nặng và độ dài lông, bảng giá cụ thể spa gửi khi anh chị nhắn cân nặng và giống của bé.\nKhoảng giá tham khảo:\n• Tắm cơ bản: từ 180.000đ\n• Tắm + cắt móng + vệ sinh tai: từ 250.000đ\n• Cắt tỉa tạo kiểu: từ 450.000đ\nMua gói nhiều lần rẻ hơn khoảng 20–25% so với đi lẻ. Gói dùng được trong 12 tháng và chuyển cho bé khác cùng nhà."],
      ["draft", "Bé bị thương hoặc phát hiện bất thường trong lúc tắm thì làm gì?", "(Hướng dẫn nội bộ — chưa đăng)\n1. DỪNG ngay, không làm tiếp.\n2. Chụp ảnh chỗ bất thường (u cục, vết thương, ve rận nhiều, da lở).\n3. Gọi chủ ngay, gửi ảnh, mô tả bình tĩnh — KHÔNG chẩn đoán bệnh, spa không phải phòng khám.\n4. Ghi vào sổ ca: bé nào, ai làm, phát hiện gì, đã gọi chủ lúc mấy giờ.\n5. Nếu do spa làm bé bị thương: xin lỗi thẳng, spa chịu chi phí khám thú y, không đổ cho bé nghịch."],
    ],
    kiemKhoTen: "sữa tắm và phụ kiện",
    noiBo: 3, khoaApi: 2, suKien: 4, duongBao: 2, tep: 3, khaoSat: 22, chiNcc: 3, nghiLe: 5, capHinhBao: 4,
    khungNhin: [["contacts", "Khách có gói còn hiệu lực", "tag:goi_dinh_ky"],
                ["deals", "Khách hỏi lưu trú dài ngày", "stage:qualified"]],
  },

  "sample-retail": {
    ten: "Mỹ Phẩm Ngọc Trai",
    // Bán lẻ mỹ phẩm: mua lặp lại, đơn trung bình 300–800k ⇒ 1 điểm/10.000đ.
    diem: { vnd_per_point: 10000, redeem_points_unit: 200, redeem_value_vnd: 50000, referral_points: 200, expire_months: 18 },
    hang: { vip_min_revenue: 12000000, vip_min_won_deals: 6, regular_min_won_deals: 2, dormant_after_days: 120 },
    tichDonCu: 130, thuong: 12, doiDiem: 4,        // TÍCH ĐIỂM + HẠNG KHÁCH — NẶNG
    dongY: 300,
    ma: [
      { ma: "NGOCTRAI99", kind: "percent", pct: 25, tran: 300000, luot: 400, moi: 500000, ghi: "Sale 9.9 — giảm 25% toàn bộ chăm sóc da", het: "2026-09-30", cd: "Sale 9.9 chăm sóc da" },
      { ma: "SIEUSALE88", kind: "percent", pct: 20, tran: 250000, luot: 350, moi: 400000, ghi: "Sale 8.8 giữa tháng 8", het: "2026-08-31", cd: "Sale 8.8 giữa năm" },
      { ma: "TANGSAMPLE", kind: "amount", vnd: 80000, tran: 80000, luot: 300, moi: 350000, ghi: "Trừ 80k thay cho bộ sample tặng kèm", het: "2026-12-31", cd: "Tặng bộ dùng thử cho khách mới", khachMoi: 1 },
      { ma: "CHONGNANG15", kind: "percent", pct: 15, tran: 120000, luot: 250, moi: 250000, ghi: "Giảm 15% nhóm chống nắng mùa hè", het: "2026-09-15", cd: "Mùa hè — chống nắng là bắt buộc" },
      { ma: "KHACHVIP10", kind: "percent", pct: 10, tran: 200000, luot: 500, moi: 300000, ghi: "Ưu đãi thường trực cho khách hạng VIP", het: "2026-12-31", cd: null, khachCu: 1 },
      { ma: "FULLSIZE50", kind: "amount", vnd: 50000, tran: 50000, luot: 200, moi: 600000, ghi: "Giảm 50k khi mua bản full size sau khi dùng thử", het: "2026-12-31", cd: null },
    ],
    chienDich: [                                    // CHIẾN DỊCH + MÃ GIẢM — NẶNG
      { ten: "Sale 8.8 giữa năm", tu: "2026-08-01", den: "2026-08-31", tran: 25000000, quangCao: 7500000,
        loi: "Giảm 20% toàn bộ cửa hàng trong tháng 8. Mã SIEUSALE88.",
        gui: [{ ngay: "2026-08-02", gio: "09:00", n: 160, than: "Ngọc Trai sale 8.8: giảm 20% toàn bộ cửa hàng suốt tháng 8, mã SIEUSALE88. Hàng chống nắng và serum về đủ mẫu rồi ạ." }] },
      { ten: "Sale 9.9 chăm sóc da", tu: "2026-08-25", den: "2026-09-30", tran: 30000000, quangCao: 9000000,
        loi: "Giảm 25% nhóm chăm sóc da, tặng thêm mini size cho đơn trên 1 triệu. Mã NGOCTRAI99.",
        gui: [{ ngay: "2026-08-10", gio: "10:00", n: 150, than: "Sale 9.9 của Ngọc Trai mở sớm từ 25/8: giảm 25% nhóm chăm sóc da, mã NGOCTRAI99. Đơn trên 1 triệu tặng thêm mini size ạ." }] },
      { ten: "Mùa hè — chống nắng là bắt buộc", tu: "2026-05-15", den: "2026-09-15", tran: 14000000, quangCao: 4200000,
        loi: "Giảm 15% toàn bộ nhóm chống nắng. Mã CHONGNANG15.",
        gui: [{ ngay: "2026-05-18", gio: "09:40", n: 140, than: "Tia UV tháng này cao nhất năm ạ. Ngọc Trai giảm 15% toàn bộ kem chống nắng, mã CHONGNANG15. Em tư vấn loại hợp da giúp chị nhé." }] },
      { ten: "Tặng bộ dùng thử cho khách mới", tu: "2026-06-01", den: "2026-12-31", tran: 18000000, quangCao: 5000000,
        loi: "Khách mua lần đầu được trừ 80k thay cho bộ sample. Mã TANGSAMPLE.",
        gui: [{ ngay: "2026-06-05", gio: "15:00", n: 130, than: "Lần đầu mua tại Ngọc Trai, chị được trừ 80k để chọn thêm món mình thích. Mã TANGSAMPLE, dùng cho đơn từ 350k ạ." }] },
    ],
    goi: [], soHopDong: 0,                          // CỐ Ý BỎ — bán lẻ thuần, không có buổi để dùng
    duAn: [
      { ten: "Mở gian hàng trên sàn thương mại điện tử", mo: "Đưa 31 mã hàng lên sàn, chụp ảnh chuẩn, viết mô tả và chốt chính sách đổi trả.", batDau: "2026-06-10", nganSach: 45000000,
        viec: [["task", "Chụp ảnh nền trắng cho 31 mã hàng", "2026-06-25", 1], ["task", "Viết mô tả và bảng thành phần từng mã", "2026-07-10", 1],
               ["task", "Đăng ký gian hàng và xác minh giấy tờ", "2026-07-18", 1], ["meeting", "Chốt chính sách đổi trả và phí giao", "2026-07-25", 1],
               ["task", "Chạy thử 20 đơn đầu và đo tỷ lệ hoàn", "2026-08-14", 0]] },
      { ten: "Siết quản lý hạn dùng", mo: "Gắn hạn dùng cho từng lô, cảnh báo trước 90 ngày, xả hàng cận hạn có kiểm soát.", batDau: "2026-07-05", nganSach: 12000000,
        viec: [["task", "Ghi hạn dùng toàn bộ hàng đang có trên kệ", "2026-07-20", 1], ["task", "Lập bảng theo dõi lô cận hạn 90 ngày", "2026-07-30", 1],
               ["task", "Chốt mức giảm cho hàng còn dưới 6 tháng hạn", "2026-08-10", 1], ["task", "Rà lại kho lần hai sau khi xả", "2026-08-25", 0]] },
    ],
    kpi: [["revenue_won", 150000000], ["new_contacts", 70], ["tasks_done", 22]],
    kiemKho: 4, tranGiam: { staff: 5, manager: 20, admin: 50 }, xinGiam: 5,   // KIỂM KHO — NẶNG (hạn dùng)
    kb: [
      ["published", "Hàng ở cửa hàng có phải chính hãng không?", "Toàn bộ hàng tại Ngọc Trai nhập chính ngạch, có hoá đơn đỏ và tem nhập khẩu. Cửa hàng cho phép chị kiểm tra hoá đơn đầu vào của bất kỳ món nào trước khi mua.\nCửa hàng KHÔNG bán hàng xách tay không giấy tờ, không bán hàng chiết. Nếu chị thấy giá ở đâu rẻ hơn nhiều thì nên hỏi kỹ nguồn hàng — mỹ phẩm giả rất khó phân biệt bằng mắt."],
      ["published", "Mua rồi có đổi trả được không?", "• Hàng còn nguyên seal, chưa bóc: đổi hoặc trả trong 7 ngày, giữ hoá đơn.\n• Hàng đã bóc seal, đã dùng: không trả lại tiền, nhưng nếu chị bị kích ứng thì cửa hàng đổi sang món khác cùng tầm giá — mang theo món đã dùng và ảnh vùng da bị kích ứng.\n• Hàng khuyến mãi sâu trên 30%: chỉ đổi, không trả.\nHàng lỗi do nhà sản xuất (vòi bơm hỏng, sản phẩm biến màu, mùi lạ): đổi mới bất kể thời gian, cửa hàng chịu trách nhiệm."],
      ["published", "Da dầu mụn nên bắt đầu từ đâu?", "Ba bước bắt buộc, đừng ôm đồm nhiều hơn lúc đầu:\n1. Sữa rửa mặt dịu, pH 5.5, không tạo bọt mạnh, không hạt scrub.\n2. Dưỡng ẩm dạng gel hoặc lotion mỏng — da dầu vẫn cần ẩm; thiếu ẩm da càng tiết dầu bù.\n3. Chống nắng buổi sáng, chọn loại kết cấu mỏng, ghi \"non-comedogenic\".\nSau 2–3 tuần da ổn định mới thêm hoạt chất trị mụn (BHA 2% hoặc Adapalene), và chỉ thêm MỘT món mỗi lần, cách nhau 2 tuần, để biết món nào hợp món nào không."],
      ["published", "Retinol và vitamin C dùng chung được không?", "Không nên dùng cùng một buổi. Cách an toàn:\n• Sáng: vitamin C → dưỡng ẩm → chống nắng.\n• Tối: retinol → dưỡng ẩm.\nDùng chung một lúc dễ gây rát, đỏ và bong tróc, nhất là với da chưa quen.\nNgười mới dùng retinol nên bắt đầu nồng độ thấp, 2 lần/tuần, bôi lên da khô hoàn toàn, và luôn dưỡng ẩm sau. Đang mang thai thì KHÔNG dùng retinol dưới mọi dạng."],
      ["published", "Kem chống nắng bôi bao nhiêu là đủ, có cần bôi lại không?", "Đủ lượng cho mặt là khoảng 2 đốt ngón tay trỏ và giữa (tương đương 1/4 thìa cà phê). Bôi ít hơn thì chỉ số SPF ghi trên hộp không còn đúng nữa.\nBôi lại sau mỗi 2–3 tiếng nếu ở ngoài trời, sau khi bơi hoặc lau mồ hôi. Ngồi trong nhà cả ngày, xa cửa sổ thì bôi buổi sáng là đủ.\nBôi trước khi ra nắng 15–20 phút. Loại vật lý (kẽm, titan) có tác dụng ngay; loại hoá học cần thời gian thấm."],
      ["published", "Mỹ phẩm mở nắp rồi dùng được bao lâu?", "Nhìn ký hiệu hộp mở nắp trên bao bì — con số kèm chữ M (6M, 12M, 24M) là số tháng dùng được SAU KHI MỞ.\nTham khảo nhanh:\n• Mascara, kẻ mắt nước: 3–6 tháng\n• Kem dưỡng hũ: 6–12 tháng\n• Serum vitamin C: 3–6 tháng (đổi màu nâu là đã oxy hoá, bỏ đi)\n• Kem chống nắng: dùng hết trong 1 mùa hè, đừng để sang năm sau\nCửa hàng ghi ngày mở nắp lên đáy hộp giúp chị nếu chị muốn."],
      ["published", "Cửa hàng có tích điểm không, đổi được gì?", "Có ạ. Cứ 10.000đ mua hàng được 1 điểm, tích vào số điện thoại của chị.\n200 điểm đổi được 50.000đ trừ thẳng vào đơn sau. Điểm có hạn 18 tháng kể từ ngày tích.\nGiới thiệu bạn mới mua lần đầu, chị được thêm 200 điểm. Khách đạt hạng VIP còn có mã giảm thường trực 10%."],
      ["draft", "Khách hỏi món cửa hàng không có thì trả lời sao?", "(Hướng dẫn nội bộ — chưa đăng)\n1. Không nói cụt \"không có\". Hỏi chị đang cần giải quyết vấn đề gì trên da.\n2. Giới thiệu 1–2 món cùng công dụng đang có, nói rõ khác nhau chỗ nào.\n3. Nếu khách vẫn muốn đúng món đó, ghi lại tên món và số điện thoại — cửa hàng hỏi nhà cung cấp rồi gọi lại.\nTuyệt đối không chê sản phẩm khách đang hỏi để bán món của mình."],
    ],
    kiemKhoTen: "hàng mỹ phẩm",
    noiBo: 3, khoaApi: 2, suKien: 5, duongBao: 2, tep: 3, khaoSat: 0, chiNcc: 4, nghiLe: 5, capHinhBao: 4,
    khungNhin: [["contacts", "Khách VIP chưa quay lại 60 ngày", "tier:vip AND last_interaction:>60d"],
                ["deals", "Đơn sỉ và cộng tác viên", "stage:negotiation"]],
    chiPhiNguonNang: 1,                              // CHI PHÍ NGUỒN — NẶNG (quảng cáo là khoản chi lớn)
  },

  "sample-shop": {
    ten: "Sắc Màu Boutique",
    diem: { vnd_per_point: 20000, redeem_points_unit: 100, redeem_value_vnd: 50000, referral_points: 150, expire_months: 12 },
    hang: { vip_min_revenue: 20000000, vip_min_won_deals: 5, regular_min_won_deals: 2, dormant_after_days: 150 },
    tichDonCu: 95, thuong: 9, doiDiem: 3,
    dongY: 280,
    ma: [                                           // MÃ GIẢM GIÁ — TRỤC CHÍNH NHẤT
      { ma: "CUOIMUA50", kind: "percent", pct: 50, tran: 500000, luot: 250, moi: 300000, ghi: "Xả hàng cuối mùa hè, giảm tới 50%", het: "2026-09-15", cd: "Xả hàng cuối mùa hè" },
      { ma: "THUDONG30", kind: "percent", pct: 30, tran: 400000, luot: 200, moi: 500000, ghi: "Giảm 30% bộ sưu tập thu đông ra mắt", het: "2026-11-30", cd: "Ra mắt bộ sưu tập Thu Đông" },
      { ma: "KHACHCU20", kind: "percent", pct: 20, tran: 250000, luot: 300, moi: 400000, ghi: "Ưu đãi cho khách đã mua từ 2 lần trở lên", het: "2026-12-31", cd: null, khachCu: 1 },
      { ma: "SINHNHATSHOP", kind: "amount", vnd: 200000, tran: 200000, luot: 150, moi: 800000, ghi: "Mừng sinh nhật shop, trừ thẳng 200k", het: "2026-07-31", cd: "Mừng sinh nhật shop 3 tuổi" },
      { ma: "RUBAN15", kind: "percent", pct: 15, tran: 200000, luot: 200, moi: 600000, ghi: "Rủ bạn cùng mua, cả hai cùng giảm 15%", het: "2026-12-31", cd: null },
      { ma: "FREESHIP", kind: "amount", vnd: 35000, tran: 35000, luot: 400, moi: 350000, ghi: "Miễn phí giao hàng nội thành", het: "2026-12-31", cd: null },
    ],
    chienDich: [
      { ten: "Xả hàng cuối mùa hè", tu: "2026-07-20", den: "2026-09-15", tran: 22000000, quangCao: 6400000,
        loi: "Giảm tới 50% toàn bộ hàng hè. Mã CUOIMUA50.",
        gui: [{ ngay: "2026-07-22", gio: "09:30", n: 150, than: "Sắc Màu xả hàng hè: giảm tới 50%, size còn ít mẫu nên chị ghé sớm ạ. Mã CUOIMUA50, áp dụng cả tại shop và đặt online." },
              { ngay: "2026-08-11", gio: "10:20", n: 130, than: "Đợt xả cuối mùa còn tới 15/9, nhiều mẫu chỉ còn 1–2 size. Mã CUOIMUA50 giảm tới 50% ạ." }] },
      { ten: "Ra mắt bộ sưu tập Thu Đông", tu: "2026-08-10", den: "2026-11-30", tran: 28000000, quangCao: 8200000,
        loi: "Bộ sưu tập Thu Đông giảm 30% tuần đầu ra mắt. Mã THUDONG30.",
        gui: [{ ngay: "2026-08-11", gio: "15:30", n: 140, than: "Bộ sưu tập Thu Đông của Sắc Màu đã lên kệ: len mỏng, blazer và chân váy midi. Giảm 30% tuần đầu, mã THUDONG30 ạ." }] },
      { ten: "Mừng sinh nhật shop 3 tuổi", tu: "2026-06-25", den: "2026-07-31", tran: 15000000, quangCao: 4300000,
        loi: "Trừ thẳng 200k cho đơn từ 800k trong tháng sinh nhật. Mã SINHNHATSHOP.",
        gui: [{ ngay: "2026-06-26", gio: "10:00", n: 135, than: "Sắc Màu tròn 3 tuổi rồi ạ! Cảm ơn chị đã đồng hành. Tháng này chị được trừ thẳng 200k cho đơn từ 800k, mã SINHNHATSHOP." }] },
      { ten: "Khách cũ quay lại", tu: "2026-05-20", den: "2026-12-31", tran: 16000000, quangCao: 3600000,
        loi: "Khách đã mua từ 2 lần được giảm 20% mọi đơn. Mã KHACHCU20.",
        gui: [{ ngay: "2026-05-25", gio: "16:00", n: 120, than: "Lâu rồi chưa thấy chị ghé Sắc Màu. Shop vừa về mẫu mới, và chị vẫn đang có ưu đãi 20% dành riêng cho khách cũ — mã KHACHCU20 ạ." }] },
    ],
    goi: [], soHopDong: 0,                          // CỐ Ý BỎ — tiệm quần áo không bán gói nhiều buổi
    duAn: [
      { ten: "Bộ sưu tập Thu Đông 2026", mo: "Chọn mẫu, đặt hàng xưởng, chụp lookbook và lên kệ trước 10/8.", batDau: "2026-06-01", nganSach: 260000000,
        viec: [["task", "Chốt 18 mẫu cho bộ sưu tập", "2026-06-15", 1], ["call", "Đàm phán giá và tiến độ với xưởng may", "2026-06-25", 1],
               ["task", "Duyệt mẫu may thử, sửa rập", "2026-07-12", 1], ["task", "Chụp lookbook và quay clip mặc thử", "2026-07-28", 1],
               ["task", "Bày kệ và đổi ma-nơ-canh cửa kính", "2026-08-09", 1], ["meeting", "Họp chốt giá bán từng mẫu", "2026-08-06", 1]] },
      { ten: "Giảm thất thoát hàng treo", mo: "Đếm kho hằng tuần, gắn tem chống trộm cho hàng giá cao, đối chiếu camera.", batDau: "2026-07-01", nganSach: 15000000,
        viec: [["task", "Gắn tem chống trộm cho nhóm hàng trên 800k", "2026-07-15", 1], ["task", "Lập lịch đếm kho mỗi tối Chủ nhật", "2026-07-20", 1],
               ["task", "Đối chiếu camera cho 3 lần lệch gần nhất", "2026-08-12", 0], ["task", "Báo cáo thất thoát tháng 8", "2026-08-31", 0]] },
    ],
    kpi: [["revenue_won", 130000000], ["new_contacts", 55], ["tasks_done", 20]],
    kiemKho: 4, tranGiam: { staff: 5, manager: 20, admin: 50 }, xinGiam: 5,
    kb: [
      ["published", "Shop có cho thử đồ không, có đổi size không?", "Có ạ, shop có 3 phòng thử, chị cứ thử thoải mái.\nĐổi size trong 7 ngày, hàng còn nguyên tem mác, chưa giặt, không dính bẩn hay mùi nước hoa. Mang theo hoá đơn hoặc đọc số điện thoại là shop tra được.\nHàng sale trên 30% và đồ lót thì không đổi trả — đây là quy định chung, shop dán rõ tại quầy."],
      ["published", "Làm sao chọn size khi mua online?", "Chị nhắn shop 3 số: chiều cao, cân nặng, và vòng eo (hoặc vòng ngực nếu mua áo). Shop tư vấn size dựa trên rập thật của từng mẫu, vì mỗi mẫu form khác nhau.\nMỗi mẫu trên trang đều có bảng số đo chi tiết: dài áo, rộng vai, vòng ngực, dài tay. Chị so với một món đang mặc vừa ở nhà là chuẩn nhất.\nNếu nhận hàng không vừa, chị đổi size trong 7 ngày, shop chịu phí giao chiều đổi lần đầu."],
      ["published", "Hàng của shop may ở đâu, chất liệu gì?", "Sắc Màu đặt may tại xưởng ở TP.HCM, mỗi mẫu chỉ ra 15–30 sản phẩm nên ít đụng hàng.\nChất liệu ghi rõ trên tem từng món: linen, cotton, lụa tằm, tuyết mưa, len mỏng. Shop không dùng chất liệu pha polyester tỷ lệ cao cho nhóm áo mùa hè vì mặc rất bí.\nChị nhắn tên mẫu, shop gửi ảnh cận cảnh chất vải và ảnh khách mặc thật."],
      ["published", "Shop có nhận sửa đồ không?", "Có ạ. Lên gấu, bóp eo, sửa tay áo — miễn phí cho hàng mua tại shop, làm trong 2–3 ngày.\nSửa lớn (đổi form, thay khoá, cắt ngắn váy dài) thì có phí, shop báo giá trước khi làm.\nĐồ mua nơi khác shop vẫn nhận sửa, tính phí theo bảng giá dán tại quầy."],
      ["published", "Giao hàng bao lâu, phí thế nào?", "• Nội thành: 1–2 ngày, phí 35.000đ. Đơn từ 350.000đ miễn phí giao (mã FREESHIP).\n• Tỉnh: 2–4 ngày, phí theo bảng giá đơn vị vận chuyển.\nShop cho xem hàng trước khi thanh toán ở nội thành. Với đơn tỉnh, chị quay clip lúc mở hộp để shop xử lý nhanh nếu có sai sót.\nĐặt trước 15h thì shop gửi trong ngày."],
      ["published", "Có chương trình gì cho khách quen không?", "Có ạ:\n• Tích điểm: cứ 20.000đ được 1 điểm, 100 điểm đổi 50.000đ.\n• Khách đã mua từ 2 lần: mã KHACHCU20 giảm 20% mọi đơn.\n• Rủ bạn cùng mua: cả hai cùng được 15% với mã RUBAN15.\n• Khách hạng VIP được xem và giữ mẫu mới trước 2 ngày so với khách thường."],
      ["draft", "Khách trả hàng đã mặc đi sự kiện rồi thì xử lý sao?", "(Hướng dẫn nội bộ — chưa đăng)\nDấu hiệu nhận ra: tem đã tháo rồi gắn lại, có mùi nước hoa hoặc mùi mồ hôi, nếp gấp ở khuỷu tay và eo, đế váy bám bụi.\nCách nói: không kết tội. Nói theo hướng quy định — \"hàng đổi trả cần còn nguyên tem và chưa qua sử dụng, món này tem đã tháo nên shop không đổi được ạ\".\nNếu khách gay gắt, mời quản lý ra, đừng tranh cãi trước mặt khách khác. Ghi lại số điện thoại vào sổ theo dõi để lần sau chú ý."],
    ],
    kiemKhoTen: "hàng thời trang",
    noiBo: 3, khoaApi: 2, suKien: 4, duongBao: 2, tep: 3, khaoSat: 0, chiNcc: 3, nghiLe: 5, capHinhBao: 4,
    khungNhin: [["contacts", "Khách mua từ 3 lần", "lifecycle:customer AND deals_won:>3"],
                ["deals", "Đơn đặt may riêng", "stage:proposal"]],
    chiPhiNguonNang: 1,
  },
};

/* Ngày nghỉ lễ Việt Nam — dùng chung, tiệm nào cũng nghỉ. Riêng ngày nghỉ nội
   bộ (bảo trì, kiểm kho) đặt khác nhau cho từng tiệm ở dưới. */
const LE_CHUNG = [
  { tu: "2026-04-30", den: "2026-05-03", ly_do: "Nghỉ lễ 30/4 và Quốc tế Lao động 1/5" },
  { tu: "2026-09-02", den: "2026-09-02", ly_do: "Nghỉ lễ Quốc khánh 2/9" },
  { tu: "2026-04-26", den: "2026-04-26", ly_do: "Nghỉ Giỗ Tổ Hùng Vương (10/3 âm lịch)" },
  { tu: "2027-02-05", den: "2027-02-11", ly_do: "Nghỉ Tết Nguyên đán Đinh Mùi" },
];

/* Bytes tệp thật — nhỏ nhất có thể mà vẫn mở được, để đính kèm không phải là
   dòng ma trỏ vào chỗ trống. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF_MIN = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "utf8");

/* ══════════════════════════════════════════════════════════════════════════
   LẤY DANH SÁCH TIỆM VÀ CHỐT KIỂM
   ══════════════════════════════════════════════════════════════════════════ */
const { rows: TIEM } = await c.query(
  `select id, slug, name, is_sample, timezone from public.tenants
    where slug = any($1) order by slug`, [CHO_PHEP]);

if (TIEM.length !== CHO_PHEP.length) {
  console.error(`DỪNG — chờ ${CHO_PHEP.length} tiệm, tìm thấy ${TIEM.length}.`);
  await c.end(); process.exit(1);
}
for (const t of TIEM) {
  if (t.is_sample !== true) {
    console.error(`DỪNG — "${t.name}" (${t.slug}) KHÔNG phải tiệm mẫu.`);
    await c.end(); process.exit(1);
  }
}
const { rows: [SPA] } = await c.query(`select id from public.tenants where slug = $1`, [CAM_TUYET_DOI]);
const SPA_ID = SPA?.id ?? null;

tieu("ĐO TRƯỚC KHI NẠP");
const ID_DO = [...TIEM.map((t) => t.id), ...(SPA_ID ? [SPA_ID] : [])];
const PHU_TRUOC = await doPhu(ID_DO);
const KEO_TRUOC = {}, DT_TRUOC = {}, LUONG_TRUOC = {};
for (const t of TIEM) {
  KEO_TRUOC[t.slug] = await demKeoTheo(t.id);
  DT_TRUOC[t.slug] = await doDoanhThu(t.id);
  LUONG_TRUOC[t.slug] = await doDoiSoatLuong(t.id);
}
const SPA_KEO_TRUOC = SPA_ID ? await demKeoTheo(SPA_ID) : null;
const SPA_TONG_TRUOC = SPA_ID ? Number((await c.query(
  `select count(*) n from public.contacts where tenant_id = $1`, [SPA_ID])).rows[0].n) : 0;

console.log(`  Tổng bảng có cột tiệm: ${BANG_TENANT.length}`);
TIEM.forEach((t, i) => console.log(`  ${t.slug.padEnd(16)} ${String(PHU_TRUOC[i]).padStart(3)}/${BANG_TENANT.length}  ${t.name}`));
if (SPA_ID) console.log(`  ${CAM_TUYET_DOI.padEnd(16)} ${String(PHU_TRUOC[TIEM.length]).padStart(3)}/${BANG_TENANT.length}  (mốc so sánh — KHÔNG ĐỤNG)`);

/* ══════════════════════════════════════════════════════════════════════════
   NẠP TỪNG TIỆM
   ══════════════════════════════════════════════════════════════════════════ */
const TIEM_CO_HOP_DONG = [];

for (const t of TIEM) {
  const T = t.id, G = NGANH[t.slug];
  tieu(`${G.ten}  ·  ${t.slug}`);

  /* ── Người trong tiệm ─────────────────────────────────────────────────── */
  const { rows: NGUOI } = await c.query(
    `select tm.user_id, tm.role, e.id employee_id, e.full_name
       from public.tenant_members tm
       left join public.employees e on e.user_id = tm.user_id and e.tenant_id = tm.tenant_id
      where tm.tenant_id = $1 and tm.status = 'active'
      order by case tm.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end,
               tm.user_id`, [T]);
  const CHU = NGUOI.find((x) => x.role === "owner");
  const QUAN_TRI = NGUOI.find((x) => x.role === "admin") ?? CHU;
  const QUAN_LY = NGUOI.filter((x) => x.role === "manager");
  const NHAN_VIEN = NGUOI.filter((x) => x.role === "staff");
  if (!CHU) { ghiChu(`${t.slug}: không có chủ tiệm đang hoạt động — bỏ qua tiệm này.`); continue; }
  const nhuChu = (fn) => nhuVai(CHU.user_id, "owner", T, fn);

  /* ══ 1. ĐỒNG Ý NHẬN TIN ══════════════════════════════════════════════════
     KHAI THẲNG: đây là chỗ DUY NHẤT script chạm vào `contacts`, và nó lệch khỏi
     luật "chỉ đi qua RPC". Lý do: toàn bộ khách đang ở `unknown`, mà
     `campaign_send_add_recipients` LỌC BỎ mọi người chưa đồng ý ⇒ không sửa cột
     này thì mảng chiến dịch có 0 người nhận, tức là không nạp được gì. Cột này
     thuần marketing, không dính một đồng doanh thu. Không có RPC nào đặt nó.
     Chỉ đụng dòng còn `unknown`, chọn theo thứ tự cố định ⇒ chạy lại không đổi. */
  const dongY = await thu("đồng ý nhận tin", async () => {
    /* Nạp tới TỔNG `G.dongY` người đồng ý, KHÔNG phải cộng thêm G.dongY mỗi lượt
       chạy. Lần đầu bắt lỗi này ở lượt chạy thứ hai: 420 → 840. Neo vào con số
       đích, không neo vào "còn ai chưa đồng ý". */
    const dangCo = Number((await c.query(
      `select count(*) n from public.contacts
        where tenant_id = $1 and deleted_at is null and marketing_consent = 'granted'`, [T])).rows[0].n);
    const thieu = G.dongY - dangCo;
    if (thieu <= 0) return 0;
    return (await c.query(
      `with chon as (
         select id from public.contacts
          where tenant_id = $1 and deleted_at is null and marketing_consent = 'unknown'
          order by created_at, id limit $2)
       update public.contacts x set marketing_consent = 'granted',
              marketing_consent_at = ($3::date || ' 09:00+07')::timestamptz
         from chon where x.id = chon.id returning x.id`, [T, thieu, "2026-05-01"])).rowCount;
  });
  const tongDongY = Number((await c.query(
    `select count(*) n from public.contacts where tenant_id = $1 and marketing_consent = 'granted'`, [T])).rows[0].n);
  muc("Giữ chân khách");
  console.log(`  Đồng ý nhận tin: +${dongY ?? 0} lượt đặt mới · tổng ${so(tongDongY)} khách đã đồng ý`);

  /* ══ 2. TÍCH ĐIỂM ════════════════════════════════════════════════════════ */
  await thu("bật tích điểm", () => c.query(
    `insert into public.loyalty_config
       (tenant_id, is_active, vnd_per_point, redeem_points_unit, redeem_value_vnd, referral_points, expire_months)
     values ($1, true, $2, $3, $4, $5, $6)
     on conflict (tenant_id) do update set is_active = true,
       vnd_per_point = excluded.vnd_per_point, redeem_points_unit = excluded.redeem_points_unit,
       redeem_value_vnd = excluded.redeem_value_vnd, referral_points = excluded.referral_points,
       expire_months = excluded.expire_months`,
    [T, G.diem.vnd_per_point, G.diem.redeem_points_unit, G.diem.redeem_value_vnd,
     G.diem.referral_points, G.diem.expire_months]));

  await thu("luật hạng khách", () => c.query(
    `insert into public.tier_rules (tenant_id, vip_min_revenue, vip_min_won_deals, regular_min_won_deals, dormant_after_days)
     values ($1, $2, $3, $4, $5) on conflict (tenant_id) do update set
       vip_min_revenue = excluded.vip_min_revenue, vip_min_won_deals = excluded.vip_min_won_deals,
       regular_min_won_deals = excluded.regular_min_won_deals, dormant_after_days = excluded.dormant_after_days`,
    [T, G.hang.vip_min_revenue, G.hang.vip_min_won_deals, G.hang.regular_min_won_deals, G.hang.dormant_after_days]));

  /* Tích điểm cho đơn CŨ ĐÃ XONG. Mỗi đơn đi qua `loyalty_earn_for_order` —
     hàm tự chặn đơn đã tích (chỉ mục `loyalty_ledger_order_unique`), tự bỏ qua
     khách vãng lai và phiếu hoàn. Chọn đơn theo thứ tự cố định ⇒ chạy lại
     không đẻ thêm. */
  const diemTich = await thu("tích điểm đơn cũ", () => nhuChu(async () => {
    const { rows: don } = await c.query(
      `select o.id from public.orders o
        where o.tenant_id = $1 and o.kind = 'order' and o.status = 'completed'
          and o.deleted_at is null and o.contact_id is not null
        order by o.created_at desc, o.id limit $2`, [T, G.tichDonCu]);
    const { rows: [r] } = await c.query(
      `select coalesce(sum(public.loyalty_earn_for_order(x)), 0)::bigint diem
         from unnest($1::uuid[]) x`, [don.map((d) => d.id)]);
    return { don: don.length, diem: Number(r.diem) };
  }));

  /* Thưởng điểm ngoài đơn (giới thiệu bạn). `loyalty_grant` KHÔNG tự chống
     trùng ⇒ phải tự neo bằng ghi chú trước khi gọi. */
  const thuongMoi = await thu("thưởng điểm giới thiệu", () => nhuChu(async () => {
    const { rows: khach } = await c.query(
      `select id, full_name from public.contacts
        where tenant_id = $1 and deleted_at is null and marketing_consent = 'granted'
        order by created_at, id limit $2`, [T, G.thuong]);
    let n = 0;
    for (const [i, k] of khach.entries()) {
      const ghi = `${MOC} giới thiệu bạn mới — lượt ${String(i + 1).padStart(2, "0")}`;
      const { rows: [co] } = await c.query(
        `select 1 from public.loyalty_ledger where tenant_id = $1 and contact_id = $2 and note = $3`, [T, k.id, ghi]);
      if (co) continue;
      await c.query(`select public.loyalty_grant($1, $2, 'referral', $3)`,
        [k.id, G.diem.referral_points, ghi]);
      n++;
    }
    return n;
  }));

  const soDiem = (await c.query(
    `select count(*)::int n, coalesce(sum(delta_points), 0)::int diem
       from public.loyalty_ledger where tenant_id = $1`, [T])).rows[0];
  console.log(`  Tích điểm: ${diemTich ? `${diemTich.don} đơn đi qua hàm, ${so(diemTich.diem)} điểm mới` : "—"}` +
    ` · thưởng giới thiệu +${thuongMoi ?? 0} lượt`);
  console.log(`  Sổ điểm hiện có: ${so(soDiem.n)} dòng · ${so(soDiem.diem)} điểm ròng`);

  /* ══ 3. CHIẾN DỊCH ═══════════════════════════════════════════════════════ */
  const cdId = new Map();
  for (const cd of G.chienDich) {
    const co = (await c.query(`select id from public.campaigns where tenant_id = $1 and name = $2`, [T, cd.ten])).rows[0];
    if (co) { cdId.set(cd.ten, co.id); continue; }
    const r = await thu(`chiến dịch "${cd.ten}"`, () => nhuChu(() => c.query(
      `insert into public.campaigns (tenant_id, name, start_at, end_at, max_discount_total_vnd,
                                     offer_note, status, ad_cost_vnd, created_by)
       values ($1,$2,($3::date||' 08:00+07')::timestamptz,($4::date||' 21:00+07')::timestamptz,$5,$6,$7,$8,$9)
       returning id`,
      [T, cd.ten, cd.tu, cd.den, cd.tran, cd.loi,
       cd.den < HOM_NAY ? "ended" : "running", cd.quangCao, CHU.user_id])));
    if (r) cdId.set(cd.ten, r.rows[0].id);
  }

  /* ══ 4. MÃ GIẢM GIÁ ══════════════════════════════════════════════════════ */
  let maMoi = 0;
  for (const m of G.ma) {
    const r = await thu(`mã ${m.ma}`, () => nhuChu(() => c.query(
      `insert into public.vouchers (tenant_id, code, kind, percent_off, amount_off_vnd, max_uses,
                                    max_discount_vnd, expires_at, min_order_vnd, per_customer_limit,
                                    new_customer_only, status, note, campaign_id, created_by)
       select $1,$2,$3,$4,$5,$6,$7,($8::date||' 23:00+07')::timestamptz,$9,$10,$11,'active',$12,$13,$14
        where not exists (select 1 from public.vouchers where tenant_id = $1 and upper(code) = upper($2))
       returning id`,
      [T, m.ma, m.kind, m.kind === "percent" ? m.pct : null, m.kind === "amount" ? m.vnd : null,
       m.luot, m.tran, m.het, m.moi, m.khachCu ? 1 : 2, m.khachMoi ? true : false,
       m.ghi, m.cd ? cdId.get(m.cd) ?? null : null, CHU.user_id])));
    if (r?.rows.length) maMoi++;
  }
  console.log(`  Chiến dịch: ${cdId.size} · mã giảm giá: +${maMoi} mới / ${G.ma.length} khai báo`);

  /* ══ 5. ĐỢT GỬI TIN + NGƯỜI NHẬN ═════════════════════════════════════════
     `campaign_sends_khung_gio` chỉ cho gửi trong 08:00–20:59 giờ tiệm.
     Mọi mốc gửi đặt TRƯỚC 12/08 vì `campaign_recipient_guard` chặn người vừa
     nhận tin trong 7 ngày — để mốc gần hôm nay thì đợt sau bị chặn sạch. */
  let tinMoi = 0, nguoiNhan = 0;
  for (const cd of G.chienDich) {
    const idcd = cdId.get(cd.ten);
    if (!idcd) continue;
    for (const [gi, g] of cd.gui.entries()) {
      const co = (await c.query(
        `select id from public.campaign_sends where tenant_id = $1 and campaign_id = $2 and body = $3`,
        [T, idcd, g.than])).rows[0];
      let sendId = co?.id;
      if (!sendId) {
        const r = await thu(`đợt gửi "${cd.ten}" #${gi + 1}`, () => nhuChu(() => c.query(
          `insert into public.campaign_sends (tenant_id, campaign_id, send_at, body, created_by)
           values ($1,$2,($3::date||' '||$4||'+07')::timestamptz,$5,$6) returning id`,
          [T, idcd, g.ngay, g.gio, g.than, CHU.user_id])));
        if (!r) continue;
        sendId = r.rows[0].id; tinMoi++;
      }
      /* Người nhận đi qua RPC — hàm tự loại người chưa đồng ý / đã rút / vừa
         nhận tin. Lấy tệp khách theo lát cắt cố định để chạy lại trùng nhau. */
      const kq = await thu(`người nhận "${cd.ten}" #${gi + 1}`, () => nhuChu(async () => {
        const { rows: ids } = await c.query(
          `select id from public.contacts
            where tenant_id = $1 and deleted_at is null and marketing_consent = 'granted'
            order by created_at, id offset $2 limit $3`, [T, gi * 40, g.n]);
        const { rows: [x] } = await c.query(`select public.campaign_send_add_recipients($1, $2::uuid[]) kq`,
          [sendId, ids.map((r) => r.id)]);
        return x.kq;
      }));
      if (kq) nguoiNhan += kq.that_su_gui;
    }
  }
  console.log(`  Đợt gửi tin: +${tinMoi} đợt · +${so(nguoiNhan)} người nhận (hàm tự lọc người chưa đồng ý)`);

  /* ══ 6. CHI PHÍ NGUỒN KHÁCH THEO THÁNG ═══════════════════════════════════ */
  const chiNguon = await thu("chi phí nguồn khách", async () => {
    const { rows: nguon } = await c.query(
      `select id, name, channel_type from public.lead_sources where tenant_id = $1 order by name`, [T]);
    const thang = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"];
    const heSo = G.chiPhiNguonNang ? 1 : 0.45;   // bán lẻ chạy quảng cáo mạnh hơn
    let n = 0, tong = 0;
    for (const [i, s] of nguon.entries()) {
      /* Nguồn "khách tự đến / giới thiệu" không tốn tiền quảng cáo — bỏ qua,
         ghi 0đ vào đó chỉ làm bẩn báo cáo hiệu quả kênh. */
      if (/gioi thieu|giới thiệu|walk|tự đến|tại tiệm|tai tiem|khac|khác/i.test(s.name)) continue;
      for (const [j, m] of thang.entries()) {
        const goc = nn(`${T}|${s.id}|${m}`, 12, 48) * 250000;
        const tienChi = Math.round(goc * heSo * (1 + j * 0.06) / 50000) * 50000;
        const r = await c.query(
          `insert into public.source_costs (tenant_id, source_id, month, amount)
           values ($1,$2,$3::date,$4) on conflict (tenant_id, source_id, month) do nothing returning id`,
          [T, s.id, m, tienChi]);
        if (r.rows.length) { n++; tong += tienChi; }
        void i;
      }
    }
    return { n, tong };
  });
  if (chiNguon) console.log(`  Chi phí nguồn khách: +${chiNguon.n} dòng · ${tien(chiNguon.tong)}`);

  /* ══ 7. ĐƠN NHÁP MƯỢN ĐƯỜNG ══════════════════════════════════════════════
     Cần đơn còn sửa được để thử mã giảm giá và phiếu duyệt giảm. Đơn NHÁP
     không vào doanh thu (báo cáo chỉ tính `completed`) và không sinh hoa hồng
     (`orders_sinh_hoa_hong` là AFTER UPDATE OF status). Tiệm nào không có sẵn
     thì dựng thêm, neo bằng ghi chú cố định. */
  if (G.donNhapCanTao) {
    await thu("dựng đơn nháp", () => nhuChu(async () => {
      const { rows: [dem] } = await c.query(
        `select count(*)::int n from public.orders o
          where o.tenant_id = $1 and o.status = 'draft' and o.deleted_at is null`, [T]);
      if (dem.n >= G.donNhapCanTao) return;
      const { rows: mh } = await c.query(
        `select id, price_vnd from public.items where tenant_id = $1 and status = 'active'
          and price_vnd > 0 order by price_vnd desc limit 6`, [T]);
      const { rows: kh } = await c.query(
        `select id from public.contacts where tenant_id = $1 and deleted_at is null
          order by created_at, id limit $2`, [T, G.donNhapCanTao]);
      for (let i = dem.n; i < G.donNhapCanTao; i++) {
        const { rows: [o] } = await c.query(
          `insert into public.orders (tenant_id, kind, contact_id, status, created_by, created_at)
           values ($1,'order',$2,'draft',$3,($4::date||' 10:00+07')::timestamptz) returning id`,
          [T, kh[i % kh.length].id, CHU.user_id, `2026-08-${String(10 + i).padStart(2, "0")}`]);
        const m = mh[i % mh.length];
        await c.query(
          `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, sort_order)
           values ($1,$2,$3,1,$4,0)`, [T, o.id, m.id, m.price_vnd]);
      }
    }));
  }

  /* ══ 8. DÙNG MÃ TRÊN ĐƠN CÒN SỬA ĐƯỢC (qua voucher_apply) ════════════════
     Chỉ dùng mã CÒN HẠN. `voucher_apply` từ chối mã hết hạn — đó là chốt giữ
     tiền, không đi vòng. Một đơn chỉ mang một mã (chỉ mục
     `voucher_redemptions_order_unique`) nên chạy lại tự dừng. */
  const dungMa = await thu("dùng mã giảm giá", () => nhuChu(async () => {
    const conHan = G.ma.filter((m) => m.het >= HOM_NAY && !m.khachMoi && !m.khachCu);
    if (!conHan.length) return { ap: 0, tuChoi: 0 };
    /* Trần TỔNG lượt dùng của tiệm. Không neo vào "đơn nào chưa có mã" — tiệm
       có hàng chục đơn nháp nên lượt chạy sau sẽ chọn đơn khác và số cứ phình. */
    const TRAN_DUNG_MA = Math.min(12, conHan.length * 3);
    const daDung = Number((await c.query(
      `select count(*) n from public.voucher_redemptions where tenant_id = $1`, [T])).rows[0].n);
    if (daDung >= TRAN_DUNG_MA) return { ap: 0, tuChoi: 0, du: daDung };
    const { rows: don } = await c.query(
      `select o.id from public.orders o
        where o.tenant_id = $1 and o.kind = 'order' and o.status in ('draft','confirmed')
          and o.deleted_at is null
          and exists (select 1 from public.order_lines l where l.order_id = o.id)
          and not exists (select 1 from public.voucher_redemptions v where v.order_id = o.id)
        order by o.created_at, o.id limit $2`, [T, TRAN_DUNG_MA - daDung]);
    let ap = 0, tuChoi = 0;
    for (const [i, d] of don.entries()) {
      const m = conHan[i % conHan.length];
      const { rows: [x] } = await c.query(`select public.voucher_apply($1, $2) kq`, [d.id, m.ma]);
      if (x.kq.ok) ap++; else tuChoi++;
    }
    return { ap, tuChoi };
  }));
  if (dungMa) console.log(`  Dùng mã trên đơn còn sửa được: +${dungMa.ap} đơn áp được` +
    (dungMa.tuChoi ? ` · ${dungMa.tuChoi} đơn bị hàm từ chối (đúng luật)` : "") +
    (dungMa.du ? ` · đã đủ trần ${dungMa.du} lượt từ lượt chạy trước` : ""));

  /* ══ 9. ĐỔI ĐIỂM LẤY TIỀN TRÊN ĐƠN ═══════════════════════════════════════ */
  if (G.doiDiem > 0) {
    const doi = await thu("đổi điểm", () => nhuChu(async () => {
      const daDoi = Number((await c.query(
        `select count(*) n from public.loyalty_ledger where tenant_id = $1 and reason = 'redeem'`, [T])).rows[0].n);
      if (daDoi >= G.doiDiem) return 0;
      const { rows: kh } = await c.query(
        `select l.contact_id, sum(l.remaining)::int con from public.loyalty_ledger l
          where l.tenant_id = $1 and l.delta_points > 0 and l.remaining > 0
          group by l.contact_id having sum(l.remaining) >= $2
          order by 2 desc, 1 limit $3`, [T, G.diem.redeem_points_unit * 2, G.doiDiem - daDoi]);
      let n = 0;
      for (const k of kh) {
        const { rows: [d] } = await c.query(
          `select o.id from public.orders o
            where o.tenant_id = $1 and o.contact_id = $2 and o.kind = 'order'
              and o.status in ('draft','confirmed') and o.deleted_at is null
              and not exists (select 1 from public.loyalty_ledger x
                               where x.order_id = o.id and x.reason = 'redeem')
            order by o.created_at desc limit 1`, [T, k.contact_id]);
        if (!d) continue;
        const diem = Math.floor(k.con / G.diem.redeem_points_unit) * G.diem.redeem_points_unit;
        const { rows: [x] } = await c.query(`select public.loyalty_redeem_for_order($1,$2) kq`, [d.id, diem]);
        if (x.kq.ok) n++;
      }
      return n;
    }));
    if (doi !== null) console.log(`  Khách trả đơn bằng điểm: ${doi} lượt (qua loyalty_redeem_for_order)`);
  }

  /* ══ 10. GÓI DỊCH VỤ + HỢP ĐỒNG ══════════════════════════════════════════
     ⚠️ Trigger `contracts_sinh_hoa_hong` đẻ hoa hồng theo `contracts.created_at`
     (đã đọc `commission_sinh_cho_hop_dong` để chắc, không đoán). Nên mọi hợp
     đồng đặt `created_at` trong 08/2026 — kỳ lương duy nhất còn nháp. `starts_at`
     cũng trong tháng 8 để không mâu thuẫn "ký tháng 5 nhập máy tháng 8". */
  let hdMoi = 0, buoiMoi = 0;
  if (G.goi.length && G.soHopDong > 0) {
    muc("Hợp đồng và gói dịch vụ");
    const goiId = new Map();
    for (const g of G.goi) {
      const co = (await c.query(`select id from public.service_packages where tenant_id = $1 and name = $2`, [T, g.ten])).rows[0];
      if (co) { goiId.set(g.ten, co.id); continue; }
      const r = await thu(`gói "${g.ten}"`, () => nhuChu(() => c.query(
        `insert into public.service_packages (tenant_id, name, description, sessions_total, validity_days, price_vnd, status, created_by)
         values ($1,$2,$3,$4,$5,$6,'active',$7) returning id`,
        [T, g.ten, g.mo, g.buoi, g.han, g.gia, CHU.user_id])));
      if (r) goiId.set(g.ten, r.rows[0].id);
    }

    /* Người bán phải có vai chủ/quản trị/quản lý (RLS) VÀ có hồ sơ nhân viên
       (hoa hồng nối qua `employees.user_id = contracts.created_by`). */
    const nguoiBan = [CHU, QUAN_TRI, ...QUAN_LY].filter((x, i, a) =>
      x?.employee_id && a.findIndex((y) => y.user_id === x.user_id) === i);
    if (!nguoiBan.length) {
      ghiChu(`${t.slug}: không ai vừa đủ vai vừa có hồ sơ nhân sự để lập hợp đồng — bỏ mảng hợp đồng.`);
    } else {
      const { rows: khachQuen } = await c.query(
        `select ct.id, ct.full_name from public.contacts ct
          where ct.tenant_id = $1 and ct.deleted_at is null
            and (select count(*) from public.orders o where o.contact_id = ct.id and o.tenant_id = $1
                   and o.kind = 'order' and o.status = 'completed' and o.deleted_at is null) >= 2
          order by ct.created_at, ct.id limit $2`, [T, G.soHopDong + 5]);

      for (let i = 0; i < G.soHopDong && i < khachQuen.length; i++) {
        const ma = `${t.slug.toUpperCase().replace("SAMPLE-", "")}-HD-${String(i + 1).padStart(2, "0")}`;
        const co = (await c.query(`select id from public.contracts where tenant_id = $1 and note like $2`, [T, ma + " ·%"])).rows[0];
        if (co) continue;
        const g = G.goi[i % G.goi.length];
        const ngay = `2026-08-${String(1 + (i % 18)).padStart(2, "0")}`;
        const hetHan = new Date(new Date(ngay + "T00:00:00+07:00").getTime() + g.han * 86400000)
          .toISOString().slice(0, 10);
        /* Số buổi đã dùng: chỉ tính từ ngày ký tới 20/08 — gói dài (niềng răng)
           mới ký thì mới dùng 1–2 buổi, đúng đời thật. */
        const ngaySong = Math.max(0, Math.floor((new Date(HOM_NAY) - new Date(ngay)) / 86400000));
        const buoi = Math.min(g.buoi, Math.max(0, Math.min(Math.floor(ngaySong / 4), nn(`${T}|${ma}|buoi`, 0, 4))));
        const huy = i === G.soHopDong - 1;   // một hợp đồng huỷ để thấy khoản hoa hồng TRỪ LẠI
        const ghi = huy
          ? `${ma} · ${g.ten} — khách xin huỷ và hoàn phần chưa dùng.`
          : `${ma} · ${g.ten} — khách trả trước tại quầy.`;
        const ban = nguoiBan[i % nguoiBan.length];
        const ok = await thu(`hợp đồng ${ma}`, () => nhuVai(ban.user_id, ban.role, T, async () => {
          const { rows: [hd] } = await c.query(
            `insert into public.contracts (tenant_id, contact_id, package_id, sessions_total, starts_at,
                                           expires_at, price_paid_vnd, payment_method, status, note, created_by, created_at)
             values ($1,$2,$3,$4,$5::date,$6::date,$7,$8,'active',$9,$10,($5::date||' 11:00+07')::timestamptz)
             returning id`,
            [T, khachQuen[i].id, goiId.get(g.ten), g.buoi, ngay, hetHan, g.gia,
             ["cash", "transfer", "qr"][i % 3], ghi, ban.user_id]);
          let n = 0;
          for (let k = 1; k <= buoi; k++) {
            const luc = new Date(new Date(ngay + "T00:00:00+07:00").getTime() + k * 3 * 86400000);
            const ngayBuoi = luc.toISOString().slice(0, 10);
            if (ngayBuoi > HOM_NAY) break;
            /* KHÔNG sửa `sessions_used` — trigger `contract_sessions_sync` mới
               là thứ đếm và tự đóng hợp đồng khi đủ buổi. */
            await c.query(
              `insert into public.contract_sessions (tenant_id, contract_id, redeemed_at, note, recorded_by)
               values ($1,$2,($3::date||' 15:00+07')::timestamptz,$4,$5)`,
              [T, hd.id, ngayBuoi, `Buổi ${k}/${g.buoi} — ghi tại quầy khi khách ra về.`, ban.user_id]);
            n++;
          }
          /* Huỷ bằng UPDATE (sau khi đã ghi buổi, vì `contract_sessions_cap`
             chặn ghi vào hợp đồng đã huỷ) để trigger sinh khoản hoa hồng TRỪ. */
          if (huy) await c.query(`update public.contracts set status = 'cancelled' where id = $1`, [hd.id]);
          return n;
        }));
        if (ok !== null) { hdMoi++; buoiMoi += ok; }
      }
      const pho = (await c.query(
        `select k.status, count(*)::int n, sum(k.sessions_used)::int dung, sum(k.sessions_total)::int tong
           from public.contracts k where k.tenant_id = $1 group by 1 order by 1`, [T])).rows;
      console.log(`  Gói dịch vụ: ${goiId.size} · hợp đồng: +${hdMoi} mới, +${buoiMoi} buổi đã dùng (do trigger cộng)`);
      console.log(`  Trạng thái hợp đồng: ` + (pho.map((r) => `${r.status}=${r.n} (${r.dung}/${r.tong} buổi)`).join(" · ") || "—"));
      if (hdMoi > 0) TIEM_CO_HOP_DONG.push(t);
    }
  } else {
    muc("Hợp đồng và gói dịch vụ");
    console.log(`  CỐ Ý BỎ — ${G.ten} là bán lẻ thuần (0 lịch hẹn, 0 tài nguyên, 0 mặt hàng dịch vụ).`);
    console.log(`  Cửa hàng kiểu này không bán gói nhiều buổi; màn Hợp đồng để trống ở đây là đúng.`);
  }

  /* ══ 11. DỰ ÁN · VIỆC · CHỈ TIÊU ═════════════════════════════════════════ */
  muc("Điều hành: dự án, việc, chỉ tiêu");
  let duAnMoi = 0, viecMoi = 0, chanMoi = 0;
  for (const da of G.duAn) {
    let daId = (await c.query(`select id from public.projects where tenant_id = $1 and name = $2`, [T, da.ten])).rows[0]?.id;
    if (!daId) {
      const r = await thu(`dự án "${da.ten}"`, () => nhuChu(() => c.query(
        /* KHÔNG gửi `due_on` — `projects_chot_ngay_xong` luôn tính lại từ việc
           thật; gửi lên chỉ là gửi thừa rồi bị ghi đè. */
        `insert into public.projects (tenant_id, name, description, started_on, budget_vnd, status, created_by)
         values ($1,$2,$3,$4::date,$5,'active',$6) returning id`,
        [T, da.ten, da.mo, da.batDau, da.nganSach, CHU.user_id])));
      if (!r) continue;
      daId = r.rows[0].id; duAnMoi++;
    }
    const viecId = [];
    for (const [loai, tieuDe, hetHan, xong] of da.viec) {
      const co = (await c.query(
        `select id from public.activities where tenant_id = $1 and project_id = $2 and subject = $3`,
        [T, daId, tieuDe])).rows[0];
      if (co) { viecId.push(co.id); continue; }
      const nguoi = NGUOI[viecId.length % Math.max(1, NGUOI.length)];
      const r = await thu(`việc "${tieuDe.slice(0, 30)}"`, () => nhuChu(() => c.query(
        `insert into public.activities (tenant_id, type, subject, body, project_id, owner_id, due_at, done_at)
         values ($1,$2,$3,$4,$5,$6,($7::date||' 17:00+07')::timestamptz,
                 case when $8 then ($7::date||' 16:20+07')::timestamptz else null end)
         returning id`,
        [T, loai, tieuDe, `${MOC} việc trong dự án "${da.ten}".`, daId,
         nguoi?.user_id ?? CHU.user_id, hetHan, xong === 1])));
      if (r) { viecId.push(r.rows[0].id); viecMoi++; }
    }
    /* Chặn việc: việc sau chờ việc trước. `task_blocks_mot_tang` chỉ cho một
       tầng — không nối dây chuyền. */
    if (viecId.length >= 3) {
      const r = await thu("chặn việc", () => c.query(
        `insert into public.task_blocks (tenant_id, blocker_id, blocked_id, created_by)
         values ($1,$2,$3,$4) on conflict (blocker_id, blocked_id) do nothing returning id`,
        [T, viecId[0], viecId[2], CHU.user_id]));
      if (r?.rows.length) chanMoi++;
    }
  }

  /* Chỉ tiêu — đi qua `kpi_set_target` (tự upsert, tự kiểm người nhận có đang
     làm ở tiệm không). */
  const kpiN = await thu("chỉ tiêu tháng", () => nhuChu(async () => {
    let n = 0;
    const nhan = [CHU, ...QUAN_LY, ...NHAN_VIEN.slice(0, 3)].filter(Boolean);
    for (const thang of ["2026-07-01", "2026-08-01"]) {
      for (const [chiSo, mucTieu] of G.kpi) {
        for (const [i, ng] of nhan.entries()) {
          const chia = chiSo === "revenue_won" ? Math.round(mucTieu / nhan.length / 1000000) * 1000000
                                               : Math.max(1, Math.round(mucTieu / nhan.length));
          await c.query(`select public.kpi_set_target($1, $2::date, $3, $4)`,
            [ng.user_id, thang, chiSo, Math.max(1, chia + i * (chiSo === "revenue_won" ? 1000000 : 1))]);
          n++;
        }
      }
    }
    return n;
  }));
  console.log(`  Dự án: +${duAnMoi} · việc: +${viecMoi} · quan hệ chặn việc: +${chanMoi} · lượt đặt chỉ tiêu: ${kpiN ?? 0}`);

  /* ══ 12. KIỂM KHO ════════════════════════════════════════════════════════
     Ghi số đếm TUYỆT ĐỐI (trên kệ đếm được bao nhiêu), không ghi theo chênh
     lệch: `dem_thuc_te >= 0` là ràng buộc CSDL không nhân nhượng, mà sổ kho có
     thể đang âm. Chênh lệch để trigger tự trừ ra. */
  muc(`Kiểm kho ${G.kiemKhoTen}`);
  const khoTruoc = Number((await c.query(`select count(*) n from public.stock_moves where tenant_id = $1`, [T])).rows[0].n);
  let phieuMoi = 0;
  {
    const { rows: hang } = await c.query(
      `select id, name from public.items where tenant_id = $1 and kind = 'product' and status = 'active'
        order by name limit 12`, [T]);
    const LY_DO = [null, "ghi_nham", "het_han", "vo_hong", "mat"];
    for (let p = 0; p < G.kiemKho && hang.length; p++) {
      const ngay = ["2026-06-28", "2026-07-26", "2026-08-16", "2026-08-19"][p % 4];
      const ghi = `${MOC} phiếu kiểm ${G.kiemKhoTen} ${ngay} (lượt ${p + 1})`;
      const co = (await c.query(`select id from public.stocktakes where tenant_id = $1 and note = $2`, [T, ghi])).rows[0];
      if (co) continue;
      /* Phiếu cuối cùng để ở trạng thái huỷ — cho thấy tiệm cũng có lần đếm
         nhầm ca rồi bỏ, và chứng minh phiếu huỷ KHÔNG sinh dòng kho. */
      const ketThuc = p === G.kiemKho - 1 ? "da_huy" : "da_chot";
      const nguoi = p % 2 === 0 ? (QUAN_TRI ?? CHU) : (QUAN_LY[0] ?? CHU);
      const ok = await thu(`phiếu kiểm ${p + 1}`, () => nhuVai(nguoi.user_id, nguoi.role, T, async () => {
        const { rows: [ph] } = await c.query(
          `insert into public.stocktakes (tenant_id, status, note, created_by, created_at)
           values ($1,'dang_dem',$2,$3,($4::date||' 20:10+07')::timestamptz) returning id`,
          [T, ghi, nguoi.user_id, ngay]);
        const chon = hang.slice(0, 4 + (p % 3) * 2);
        for (const [i, h] of chon.entries()) {
          const { rows: [s] } = await c.query(
            `select coalesce(sum(qty), 0)::numeric n from public.stock_moves where tenant_id = $1 and item_id = $2`,
            [T, h.id]);
          const soSach = Number(s.n);
          const lech = nn(`${T}|${h.id}|${ngay}`, 0, 6) - 3;      // −3…+3, tất định
          const dem = Math.max(0, Math.round(soSach + lech));
          const ly = dem === soSach ? null : LY_DO[nn(`${T}|${h.id}|${ngay}|ly`, 1, 4)];
          await c.query(
            `insert into public.stocktake_lines (tenant_id, stocktake_id, item_id, ton_theo_so, dem_thuc_te, ly_do, created_at)
             values ($1,$2,$3,$4,$5,$6,($7::date||' 20:20+07')::timestamptz)`,
            [T, ph.id, h.id, soSach, dem, ly, ngay]);
          void i;
        }
        /* Chuyển trạng thái là đường chính thức — dòng kho tự sinh từ đây. */
        if (ketThuc === "da_chot")
          await c.query(`update public.stocktakes set status = 'da_chot', closed_at = ($2::date||' 21:30+07')::timestamptz where id = $1`, [ph.id, ngay]);
        else
          await c.query(`update public.stocktakes set status = 'da_huy' where id = $1`, [ph.id]);
        return true;
      }));
      if (ok) phieuMoi++;
    }
  }
  const khoSau = Number((await c.query(`select count(*) n from public.stock_moves where tenant_id = $1`, [T])).rows[0].n);
  console.log(`  Phiếu kiểm kê: +${phieuMoi} · dòng kho do TRIGGER sinh: +${khoSau - khoTruoc} (script không chèn dòng nào)`);

  /* ══ 13. KHO TRI THỨC ════════════════════════════════════════════════════ */
  let kbMoi = 0;
  for (const [tt, hoi, dap] of G.kb) {
    const r = await thu("kho tri thức", () => nhuChu(() => c.query(
      `insert into public.kb_entries (tenant_id, question, answer, status)
       select $1,$2,$3,$4 where not exists
         (select 1 from public.kb_entries where tenant_id = $1 and question = $2) returning id`,
      [T, hoi, dap, tt])));
    if (r?.rows.length) kbMoi++;
  }

  /* ══ 14. TRẦN GIẢM GIÁ + PHIẾU XIN DUYỆT ═════════════════════════════════ */
  await thu("trần giảm giá", () => c.query(
    `insert into public.discount_caps (tenant_id, staff_max_pct, manager_max_pct, admin_max_pct)
     values ($1,$2,$3,$4) on conflict (tenant_id) do update set
       staff_max_pct = excluded.staff_max_pct, manager_max_pct = excluded.manager_max_pct,
       admin_max_pct = excluded.admin_max_pct`,
    [T, G.tranGiam.staff, G.tranGiam.manager, G.tranGiam.admin]));

  const duyet = await thu("phiếu xin duyệt giảm", async () => {
    /* Trần TỔNG phiếu của tiệm. Neo vào "dòng nào chưa có phiếu" thì lượt chạy
       sau chọn dòng khác ⇒ mỗi lượt đẻ thêm 5 phiếu. */
    const daXin = Number((await c.query(
      `select count(*) n from public.discount_approvals where tenant_id = $1`, [T])).rows[0].n);
    if (daXin >= G.xinGiam) return { xin: 0, duyetOk: 0, tuChoi: 0, apLuon: 0, du: daXin };
    const { rows: dong } = await c.query(
      `select l.id, l.qty, l.unit_price_vnd from public.order_lines l
         join public.orders o on o.id = l.order_id
        where l.tenant_id = $1 and o.status in ('draft','confirmed') and o.deleted_at is null
          and l.qty * l.unit_price_vnd > 0
          and not exists (select 1 from public.discount_approvals a where a.order_line_id = l.id)
        order by l.created_at, l.id limit $2`, [T, G.xinGiam - daXin]);
    const nvXin = NHAN_VIEN.length ? NHAN_VIEN : QUAN_LY;
    if (!nvXin.length) return null;
    let xin = 0, duyetOk = 0, tuChoi = 0, apLuon = 0;
    for (const [i, d] of dong.entries()) {
      const goc = Number(d.qty) * Number(d.unit_price_vnd);
      /* Xin mức VƯỢT trần nhân viên để phiếu thật sự phải qua tay người duyệt —
         xin dưới trần thì RPC áp luôn, không có phiếu nào để xem. */
      const pct = G.tranGiam.staff + 5 + (i % 3) * 6;
      const nv = nvXin[i % nvXin.length];
      const kq = await nhuVai(nv.user_id, "staff", T, async () => {
        const { rows: [x] } = await c.query(`select public.discount_request($1,$2,$3) r`,
          [d.id, Math.round(goc * pct / 100 / 1000) * 1000,
           ["Khách mua nhiều, xin giảm thêm để chốt đơn.",
            "Khách quen giới thiệu người mới, xin ưu đãi.",
            "Hàng cận hạn, xin giảm để xả nhanh.",
            "Khách phàn nàn lần trước, xin bù bằng ưu đãi lần này."][i % 4]]);
        return x.r;
      });
      if (kq.ket_qua === "cho_duyet" || kq.id) xin++;
      else if (kq.ket_qua === "da_ap") { apLuon++; continue; }
      else continue;
      /* Người duyệt phải KHÁC người xin (RPC chặn tự duyệt) và có trần cao hơn. */
      const nguoiDuyet = QUAN_LY[0] ?? QUAN_TRI ?? CHU;
      const dongY = i % 4 !== 3;
      const kq2 = await nhuVai(nguoiDuyet.user_id, nguoiDuyet.role, T, async () => {
        const { rows: [ph] } = await c.query(
          `select id from public.discount_approvals where tenant_id = $1 and order_line_id = $2 and status = 'pending'`,
          [T, d.id]);
        if (!ph) return null;
        const { rows: [x] } = await c.query(`select public.discount_decide($1,$2,$3) r`,
          [ph.id, dongY, dongY ? "Đồng ý, khách này mua đều." : "Không duyệt, mức giảm quá tay cho đơn nhỏ."]);
        return x.r;
      });
      if (kq2?.ket_qua === "da_duyet") duyetOk++;
      else if (kq2?.ket_qua === "da_tu_choi") tuChoi++;
    }
    return { xin, duyetOk, tuChoi, apLuon };
  });
  muc("Kho tri thức và duyệt giảm giá");
  console.log(`  Kho tri thức: +${kbMoi} mục · trần giảm giá: nhân viên ${G.tranGiam.staff}% / quản lý ${G.tranGiam.manager}% / quản trị ${G.tranGiam.admin}%`);
  if (duyet) console.log(`  Phiếu xin duyệt: +${duyet.xin} phiếu chờ → ${duyet.duyetOk} duyệt · ${duyet.tuChoi} từ chối` +
    (duyet.apLuon ? ` · ${duyet.apLuon} lượt dưới trần được áp thẳng` : "") +
    (duyet.du ? ` · đã đủ trần ${duyet.du} phiếu từ lượt chạy trước` : ""));

  /* ══ 15. CHAT NỘI BỘ ═════════════════════════════════════════════════════ */
  muc("Nội bộ và tích hợp");
  let luongMoi = 0, tinNoiBo = 0, nhacMoi = 0;
  {
    const { rows: gan } = await c.query(
      `(select 'order' loai, id, created_at from public.orders where tenant_id = $1 and deleted_at is null order by created_at desc limit 2)
       union all
       (select 'contact', id, created_at from public.contacts where tenant_id = $1 and deleted_at is null order by created_at desc limit 2)
       union all
       (select 'appointment', id, created_at from public.appointments where tenant_id = $1 and deleted_at is null order by start_at desc limit 2)`,
      [T]);
    const NOI_DUNG = {
      order: ["Đơn này khách hẹn chiều mai qua lấy, ai trực ca chiều để ý giúp nhé.",
              "Đã gọi xác nhận với khách rồi ạ, khách đồng ý mức giảm đang ghi trên đơn.",
              "Nhớ kiểm lại hàng trước khi giao, lần trước bị thiếu một món."],
      contact: ["Khách này khó tính một chút, mình nói chậm và rõ giúp em.",
                "Đã cập nhật số điện thoại mới, số cũ không liên lạc được.",
                "Khách hỏi về ưu đãi đang chạy, em đã gửi thông tin qua Zalo."],
      appointment: ["Lịch này khách xin dời sang khung sau, em đã đổi giúp rồi ạ.",
                    "Khách đi cùng người nhà, xếp chỗ rộng một chút giúp em.",
                    "Nhắc khách mang theo giấy tờ lần trước còn thiếu nhé."],
    };
    for (const [gi, g] of gan.slice(0, G.noiBo).entries()) {
      let luong = (await c.query(
        `select id from public.internal_threads where tenant_id = $1 and entity_type = $2 and entity_id = $3`,
        [T, g.loai, g.id])).rows[0]?.id;
      if (!luong) {
        const r = await thu("luồng nội bộ", () => c.query(
          `insert into public.internal_threads (tenant_id, entity_type, entity_id, created_by, created_at)
           values ($1,$2,$3,$4,($5::date||' 09:00+07')::timestamptz)
           on conflict (tenant_id, entity_type, entity_id) do nothing returning id`,
          [T, g.loai, g.id, CHU.user_id, "2026-08-14"]));
        if (!r?.rows.length) continue;
        luong = r.rows[0].id; luongMoi++;
      }
      for (const [mi, than] of (NOI_DUNG[g.loai] ?? []).entries()) {
        const nguoi = NGUOI[(gi + mi) % NGUOI.length];
        const r = await thu("tin nội bộ", () => c.query(
          `insert into public.internal_messages (tenant_id, thread_id, sender_user_id, body, created_at)
           select $1,$2,$3,$4,($5::date||' '||$6||'+07')::timestamptz
            where not exists (select 1 from public.internal_messages
                               where thread_id = $2 and sender_user_id = $3 and body = $4)
           returning id`,
          [T, luong, nguoi.user_id, than, "2026-08-14", `0${9 + mi}:${15 + mi * 7}`]));
        if (!r?.rows.length) continue;
        tinNoiBo++;
        /* Gọi tên người khác — trigger `internal_mentions_bao` tự sinh thông báo. */
        const ai = NGUOI[(gi + mi + 1) % NGUOI.length];
        if (ai.user_id !== nguoi.user_id) {
          const rm = await thu("gọi tên", () => c.query(
            `insert into public.internal_mentions (tenant_id, message_id, mentioned_user_id)
             values ($1,$2,$3) on conflict (message_id, mentioned_user_id) do nothing returning id`,
            [T, r.rows[0].id, ai.user_id]));
          if (rm?.rows.length) nhacMoi++;
        }
      }
    }
  }

  /* ══ 16. WEBHOOK + KHOÁ API ══════════════════════════════════════════════
     Địa chỉ chỉ trỏ TÊN MIỀN VÍ DỤ (`example.com` — RFC 2606, không ai sở hữu
     được). Không có bên nhận nào ngoài đời. `secret` là khoá ký thật để chữ ký
     có nghĩa, nhưng vô dụng vì địa chỉ không phân giải được.
     KHÔNG nạp `webhook_deliveries` — xem phần "cố ý bỏ" ở đầu file. */
  let dbMoi = 0, skMoi = 0, khoaMoi = 0;
  {
    const DUONG = [
      { ten: "Đồng bộ đơn sang bảng tính kế toán", url: "https://ke-toan.example.com/ifan/don-hang",
        loai: ["order.completed", "order.cancelled"] },
      { ten: "Báo lịch hẹn sang lịch nội bộ", url: "https://lich-noi-bo.example.com/ifan/lich-hen",
        loai: ["appointment.created", "appointment.cancelled"] },
      { ten: "Đẩy khách mới sang hệ chăm sóc", url: "https://cham-soc.example.com/ifan/khach-moi",
        loai: ["contact.created"] },
    ].slice(0, G.duongBao);
    for (const d of DUONG) {
      const r = await thu("đường báo ra", () => c.query(
        `insert into public.webhook_endpoints (tenant_id, name, url, secret, event_types, status, created_by)
         select $1,$2,$3,$4,$5,'active',$6 where not exists
           (select 1 from public.webhook_endpoints where tenant_id = $1 and name = $2) returning id`,
        [T, d.ten, d.url, randomBytes(32).toString("hex"), d.loai, CHU.user_id]));
      if (r?.rows.length) dbMoi++;
    }
    const SU_KIEN = [
      { nha: "zalo", ma: `${t.slug}-zalo-0001`, xong: 1, tai: { su_kien: "user_send_text", noi_dung: "Cho mình hỏi giá dịch vụ ạ" } },
      { nha: "zalo", ma: `${t.slug}-zalo-0002`, xong: 1, tai: { su_kien: "user_send_text", noi_dung: "Chiều nay còn chỗ không ạ?" } },
      { nha: "meta", ma: `${t.slug}-meta-0001`, xong: 1, tai: { su_kien: "messages", noi_dung: "Shop ơi cho xin bảng giá" } },
      { nha: "livechat", ma: `${t.slug}-livechat-0001`, xong: 0, loi: "Khách đóng cửa sổ trước khi nhân viên trả lời", tai: { su_kien: "visitor_left" } },
      { nha: "google", ma: `${t.slug}-google-0001`, xong: 1, tai: { su_kien: "review_created", diem: 5 } },
    ].slice(0, G.suKien);
    for (const [i, s] of SU_KIEN.entries()) {
      const r = await thu("sự kiện nhận về", () => c.query(
        `insert into public.webhook_events (tenant_id, provider, external_event_id, payload, received_at, processed_at, error)
         values ($1,$2,$3,$4,($5::date||' 10:00+07')::timestamptz,
                 case when $6 then ($5::date||' 10:00:04+07')::timestamptz else null end, $7)
         on conflict (provider, external_event_id) do nothing returning id`,
        [T, s.nha, s.ma, JSON.stringify(s.tai), `2026-08-${String(12 + (i % 6)).padStart(2, "0")}`,
         s.xong === 1, s.loi ?? null]));
      if (r?.rows.length) skMoi++;
    }
    const KHOA = [
      { ten: "Kết nối bảng tính kế toán", quyen: ["read:orders"], goi: 240, thuHoi: false },
      { ten: "Ứng dụng xem lịch của quản lý", quyen: ["read:appointments", "read:contacts"], goi: 96, thuHoi: false },
      { ten: "Khoá cũ của bên làm web (đã thu hồi)", quyen: ["read:orders", "read:contacts"], goi: 1180, thuHoi: true },
    ].slice(0, G.khoaApi + 1);
    for (const k of KHOA) {
      const co = (await c.query(`select id from public.api_keys where tenant_id = $1 and name = $2`, [T, k.ten])).rows[0];
      if (co) continue;
      /* 32 byte ngẫu nhiên đặt THẲNG vào cột băm: không tồn tại chuỗi khoá nào
         băm ra giá trị này ⇒ không ai gọi được API bằng khoá của tiệm mẫu. */
      const r = await thu("khoá API", () => c.query(
        `insert into public.api_keys (tenant_id, name, key_hash, key_prefix, key_suffix, scopes, status, created_by, created_at)
         values ($1,$2,$3,$4,$5,$6,'active',$7,($8::date||' 09:00+07')::timestamptz) returning id`,
        [T, k.ten, randomBytes(32).toString("hex"),
         "ifan_sk_" + randomBytes(3).toString("base64url").slice(0, 4),
         randomBytes(2).toString("base64url").slice(0, 3), k.quyen, CHU.user_id, "2026-06-01"]));
      if (!r) continue;
      khoaMoi++;
      for (let i = 0; i < Math.min(k.goi, 40); i++)
        await c.query(`select public.api_key_touch($1)`, [r.rows[0].id]).catch(() => {});
      if (k.thuHoi)
        await c.query(`update public.api_keys set status = 'revoked', revoked_at = ($2::date||' 16:20+07')::timestamptz where id = $1`,
          [r.rows[0].id, "2026-07-28"]);
    }
  }
  console.log(`  Chat nội bộ: +${luongMoi} luồng, +${tinNoiBo} tin, +${nhacMoi} lượt gọi tên (mỗi lượt sinh 1 thông báo do trigger)`);
  console.log(`  Tích hợp: +${dbMoi} đường báo ra (tên miền ví dụ) · +${skMoi} sự kiện nhận về · +${khoaMoi} khoá API`);

  /* ══ 17. KHUNG NHÌN ĐÃ LƯU + CẤU HÌNH NHẬN BÁO ═══════════════════════════ */
  let knMoi = 0;
  for (const [man, ten, loc] of G.khungNhin) {
    const r = await thu("khung nhìn", () => c.query(
      `insert into public.saved_views (tenant_id, user_id, screen, name, query, vocab_version, position)
       select $1,$2,$3,$4,$5,2,$6 where not exists
         (select 1 from public.saved_views where tenant_id = $1 and screen = $3 and name = $4 and deleted_at is null)
       returning id`, [T, CHU.user_id, man, ten, loc, 10 + knMoi]));
    if (r?.rows.length) knMoi++;
  }
  let baoMoi = 0;
  for (const [i, ng] of NGUOI.slice(0, G.capHinhBao).entries()) {
    const pref = i === 0
      ? { don_moi: true, lich_moi: true, ton_thap: true, gian_doan: true, tin_noi_bo: true }
      : { don_moi: i % 2 === 0, lich_moi: true, ton_thap: false, gian_doan: false, tin_noi_bo: true };
    const r = await thu("cấu hình nhận báo", () => c.query(
      `insert into public.notification_prefs (tenant_id, user_id, pref, updated_at)
       values ($1,$2,$3,($4::date||' 08:00+07')::timestamptz)
       on conflict (tenant_id, user_id) do nothing returning user_id`,
      [T, ng.user_id, JSON.stringify(pref), "2026-06-05"]));
    if (r?.rows.length) baoMoi++;
  }

  /* ══ 18. NGÀY NGHỈ ═══════════════════════════════════════════════════════ */
  const NGHI = [...LE_CHUNG, {
    tu: ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"][TIEM.indexOf(t)],
    den: ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"][TIEM.indexOf(t)],
    ly_do: `Nghỉ nửa ngày để kiểm kê ${G.kiemKhoTen} và tổng vệ sinh`,
    nua: 1,
  }].slice(0, G.nghiLe);
  let nghiMoi = 0;
  for (const n of NGHI) {
    const r = await thu("ngày nghỉ", () => c.query(
      `insert into public.business_closures (tenant_id, date_from, date_to, reason, is_full_day, open_time, close_time)
       select $1,$2::date,$3::date,$4,$5,$6::time,$7::time where not exists
         (select 1 from public.business_closures where tenant_id = $1 and date_from = $2::date and reason = $4)
       returning id`,
      [T, n.tu, n.den, n.ly_do, !n.nua, n.nua ? "14:00" : null, n.nua ? "20:00" : null]));
    if (r?.rows.length) nghiMoi++;
  }

  /* ══ 19. KHẢO SÁT HÀI LÒNG ═══════════════════════════════════════════════ */
  let ksMoi = 0;
  let ksDu = 0;
  if (G.khaoSat > 0) {
    ksDu = Number((await c.query(
      `select count(*) n from public.satisfaction_surveys where tenant_id = $1`, [T])).rows[0].n);
    const { rows: lich } = ksDu >= G.khaoSat ? { rows: [] } : await c.query(
      `select a.id, a.start_at from public.appointments a
        where a.tenant_id = $1 and a.status = 'done' and a.deleted_at is null
          and not exists (select 1 from public.satisfaction_surveys s where s.appointment_id = a.id)
        order by a.start_at desc limit $2`, [T, G.khaoSat - ksDu]);
    const NHAN_XET = {
      5: ["Nhân viên nhẹ nhàng, làm kỹ. Sẽ quay lại ạ.", "Đúng hẹn, sạch sẽ, giá hợp lý.", "Rất hài lòng, được tư vấn tận tình."],
      4: ["Nhìn chung tốt, chỉ hơi đợi lâu một chút.", "Ổn ạ, lần sau mong bớt đông.", "Làm được việc, chỗ ngồi chờ hơi chật."],
      3: ["Bình thường, chưa có gì đặc biệt.", "Được, nhưng đợi khá lâu.", "Tạm ổn, mong cải thiện khâu đón khách."],
      2: ["Đợi quá lâu so với giờ hẹn.", "Nhân viên mới còn lóng ngóng."],
    };
    for (const [i, l] of lich.entries()) {
      const diem = [5, 5, 5, 4, 5, 4, 5, 3, 5, 4, 5, 5, 4, 2, 5][i % 15];
      const traLoi = i % 5 !== 4;   // 1/5 khách nhận phiếu mà không trả lời — đời thật là vậy
      const r = await thu("khảo sát hài lòng", () => c.query(
        `insert into public.satisfaction_surveys (tenant_id, appointment_id, rating, comment, submitted_at, created_at)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [T, l.id, traLoi ? diem : null,
         traLoi ? NHAN_XET[diem][i % NHAN_XET[diem].length] : null,
         traLoi ? new Date(new Date(l.start_at).getTime() + 86400000) : null,
         new Date(new Date(l.start_at).getTime() + 3600000)]));
      if (r?.rows.length) ksMoi++;
    }
  }

  /* ══ 20. CHI TRẢ NHÀ CUNG CẤP ════════════════════════════════════════════ */
  let chiMoi = 0;
  {
    const { rows: pn } = await c.query(
      `select p.id, p.supplier_id, p.received_at,
              coalesce((select sum(l.qty_mua * l.he_so * l.don_gia_mua) from public.purchase_lines l where l.purchase_id = p.id), 0)::bigint tong
         from public.purchases p where p.tenant_id = $1 and p.supplier_id is not null
         order by p.created_at limit $2`, [T, G.chiNcc]);
    for (const [i, p] of pn.entries()) {
      const tienTra = Number(p.tong) > 0 ? Math.round(Number(p.tong) * (i % 3 === 2 ? 0.5 : 1) / 1000) * 1000 : 2000000;
      const ghi = `${MOC} thanh toán phiếu nhập ${String(i + 1).padStart(2, "0")}` +
        (i % 3 === 2 ? " — trả trước 50%, phần còn lại trả sau" : " — trả đủ một lần");
      const r = await thu("chi trả nhà cung cấp", () => c.query(
        `insert into public.supplier_payments (tenant_id, supplier_id, purchase_id, amount_vnd, payment_method, paid_at, note, recorded_by)
         select $1,$2,$3,$4,$5,$6,$7,$8 where not exists
           (select 1 from public.supplier_payments where tenant_id = $1 and note = $7) returning id`,
        [T, p.supplier_id, p.id, Math.max(1000, tienTra), i % 2 === 0 ? "transfer" : "cash",
         p.received_at ?? new Date("2026-07-15T10:00:00+07:00"), ghi, (QUAN_TRI ?? CHU).user_id]));
      if (r?.rows.length) chiMoi++;
    }
  }
  console.log(`  Khung nhìn: +${knMoi} · cấu hình nhận báo: +${baoMoi} người · ngày nghỉ: +${nghiMoi}`);
  console.log(`  Khảo sát hài lòng: ${G.khaoSat > 0
    ? `+${ksMoi} phiếu` + (ksDu >= G.khaoSat ? ` · đã đủ trần ${ksDu} phiếu từ lượt chạy trước` : "")
    : "CỐ Ý BỎ — tiệm không có lịch hẹn nào để hỏi sau"}`);
  console.log(`  Chi trả nhà cung cấp: +${chiMoi} khoản`);

  /* ══ 21. CHỐT SỔ CHIẾN DỊCH ══════════════════════════════════════════════
     Không gõ tay một con số nào vào `campaign_summary` — gọi
     `campaign_tong_ket_yeu_cau` cho từng chiến dịch, hàm tự tính lại từ đơn thật. */
  const chot = await thu("chốt sổ chiến dịch", () => nhuChu(async () => {
    let n = 0;
    for (const id of cdId.values()) { await c.query(`select public.campaign_tong_ket_yeu_cau($1)`, [id]); n++; }
    return n;
  }));
  console.log(`  Chốt sổ chiến dịch: ${chot ?? 0} lượt gọi (bản chốt do hàm sinh, script không ghi dòng nào)`);
}

/* ══════════════════════════════════════════════════════════════════════════
   TỆP ĐÍNH KÈM — cần tải tệp THẬT lên kho, nếu thiếu chìa thì bỏ và nói rõ
   ══════════════════════════════════════════════════════════════════════════ */
tieu("TỆP ĐÍNH KÈM");
const SB_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SERVICE) {
  ghiChu("Bỏ phần tệp đính kèm: thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nên không tải tệp thật lên kho được.");
} else {
  const { createClient } = await import("@supabase/supabase-js");
  const kho = createClient(SB_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const t of TIEM) {
    const T = t.id, G = NGANH[t.slug];
    const { rows: [chu] } = await c.query(
      `select user_id from public.tenant_members where tenant_id = $1 and role = 'owner' and status = 'active' limit 1`, [T]);
    const { rows: moc } = await c.query(
      `(select 'contact' loai, id from public.contacts where tenant_id = $1 and deleted_at is null order by created_at desc limit 1)
       union all
       (select 'order', id from public.orders where tenant_id = $1 and deleted_at is null order by created_at desc limit 1)
       union all
       (select 'appointment', id from public.appointments where tenant_id = $1 and deleted_at is null order by start_at desc limit 1)`,
      [T]);
    const TEN_TEP = {
      "sample-fnb": ["phieu-gop-y-khach.pdf", "bang-dinh-luong-mon-moi.pdf", "anh-menu-mua-he.png"],
      "sample-kham": ["phim-toan-canh-truoc-dieu-tri.png", "ke-hoach-dieu-tri-nieng-rang.pdf", "phieu-cam-ket-thu-thuat.pdf"],
      "sample-pet": ["so-tiem-phong-cua-be.pdf", "anh-truoc-khi-cat-tia.png", "phieu-ban-giao-luu-tru.pdf"],
      "sample-retail": ["hoa-don-nhap-lo-hang.pdf", "anh-tem-han-dung-lo-moi.png", "bang-gia-si-thang-08.pdf"],
      "sample-shop": ["bang-so-do-bo-suu-tap-thu-dong.pdf", "anh-mau-vai-len-mong.png", "phieu-dat-may-rieng.pdf"],
    }[t.slug];
    let them = 0, loi = 0;
    for (const [i, m] of moc.slice(0, G.tep).entries()) {
      const ten = TEN_TEP[i] ?? `tep-dinh-kem-${i + 1}.pdf`;
      const png = ten.endsWith(".png");
      const than = png ? PNG_1X1 : PDF_MIN;
      const duong = `${T}/${m.loai}s/${m.id}/${ten}`;
      const { error } = await kho.storage.from("tenant-files")
        .upload(duong, than, { contentType: png ? "image/png" : "application/pdf", upsert: true });
      if (error) { loi++; ghiChu(`${t.slug}: không tải được ${ten}: ${error.message}`); continue; }
      const r = await thu("đính kèm", () => c.query(
        `insert into public.attachments (tenant_id, entity_type, entity_id, path, content_type, size_bytes, uploaded_by, created_at)
         select $1,$2,$3,$4,$5,$6,$7,($8::date||' 11:00+07')::timestamptz
          where not exists (select 1 from public.attachments where tenant_id = $1 and path = $4) returning id`,
        [T, m.loai, m.id, duong, png ? "image/png" : "application/pdf", than.length, chu.user_id, "2026-08-15"]));
      if (r?.rows.length) them++;
    }
    console.log(`  ${t.slug.padEnd(16)} +${them} tệp${loi ? ` · ${loi} tệp lỗi` : ""}`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   DỰNG LẠI DÒNG HOA HỒNG TRÊN PHIẾU LƯƠNG 08/2026
   ══════════════════════════════════════════════════════════════════════════
   Hợp đồng vừa ghi ⇒ `contracts_sinh_hoa_hong` đã đẻ hoa hồng vào 08/2026.
   Phiếu lương phải cộng lại, nếu không thì sổ hoa hồng và phiếu lương đá nhau —
   đúng lỗi đã xảy ra hai lần hôm nay ở tiệm khác.
   Chỉ đụng dòng `source_type = 'commission'` của ĐÚNG kỳ 08/2026 và ĐÚNG kỳ còn
   NHÁP. Kỳ đã chốt thì dừng ngay, không cạy khoá.
   ══════════════════════════════════════════════════════════════════════════ */
tieu("DỰNG LẠI BẢNG LƯƠNG THÁNG 08/2026 CHO TIỆM CÓ HỢP ĐỒNG MỚI");
const KY = "2026-08-01";
if (!TIEM_CO_HOP_DONG.length) {
  console.log("  Không tiệm nào phát sinh hợp đồng mới ⇒ hoa hồng không đổi ⇒ không cần dựng lại.");
} else {
  for (const t of TIEM_CO_HOP_DONG) {
    const T = t.id;
    const { rows: [ky] } = await c.query(
      `select id, status from public.payroll_periods where tenant_id = $1 and period = $2::date`, [T, KY]);
    if (!ky) { ghiChu(`${t.slug}: không có kỳ lương 08/2026 — không dựng lại được.`); continue; }
    if (ky.status !== "draft") {
      ghiChu(`${t.slug}: kỳ 08/2026 đang "${ky.status}", KHÔNG phải nháp ⇒ DỪNG, không đụng.`);
      continue;
    }
    const kq = await thu(`${t.slug}: dựng lại phiếu lương`, async () => {
      /* Nhân viên có hoa hồng trong kỳ nhưng chưa có phiếu ⇒ dựng phiếu, nếu
         không thì tiền hoa hồng của họ rơi ra ngoài bảng lương. */
      await c.query(
        `insert into public.payslips (tenant_id, period_id, employee_id)
         select $1, $2, e.id from public.employees e
          where e.tenant_id = $1
            and exists (select 1 from public.commission_entries ce
                         where ce.employee_id = e.id and date_trunc('month', ce.earned_on) = $3::date)
            and not exists (select 1 from public.payslips p where p.period_id = $2 and p.employee_id = e.id)`,
        [T, ky.id, KY]);
      const { rows: phieu } = await c.query(
        `select p.id, p.employee_id from public.payslips p where p.period_id = $1`, [ky.id]);
      /* Dọn dòng MÁY sinh rồi dựng lại từ sổ hoa hồng — đúng như sản phẩm làm.
         Không đụng dòng lương cứng, tăng ca, bảo hiểm, tạm ứng. */
      await c.query(
        `delete from public.payslip_lines l using public.payslips p
          where p.id = l.payslip_id and p.period_id = $1 and l.source_type = 'commission'`, [ky.id]);
      let dong = 0;
      for (const p of phieu) {
        const r = await c.query(
          `insert into public.payslip_lines (tenant_id, payslip_id, kind, amount_vnd, source_type, source_id, label)
           select $1, $2, 'commission', ce.amount_vnd, 'commission', ce.id,
                  coalesce(ce.note, 'Hoa hồng ngày ' || to_char(ce.earned_on, 'DD/MM/YYYY'))
             from public.commission_entries ce
            where ce.tenant_id = $1 and ce.employee_id = $3
              and date_trunc('month', ce.earned_on) = $4::date and ce.amount_vnd <> 0`,
          [T, p.id, p.employee_id, KY]);
        dong += r.rowCount;
      }
      /* Tổng phiếu cộng từ dòng; tổng kỳ cộng từ phiếu (`net_vnd` là cột sinh). */
      await c.query(
        `update public.payslips p set gross_vnd = coalesce(g.gross, 0), deduction_vnd = coalesce(g.ded, 0)
           from (select x.id from unnest($1::uuid[]) as x(id)) s
           left join (select payslip_id,
                             sum(case when amount_vnd > 0 then amount_vnd else 0 end) gross,
                             sum(case when amount_vnd < 0 then -amount_vnd else 0 end) ded
                        from public.payslip_lines where payslip_id = any($1::uuid[]) group by payslip_id) g
             on g.payslip_id = s.id
          where p.id = s.id`, [phieu.map((x) => x.id)]);
      await c.query(
        `update public.payroll_periods set total_vnd =
           greatest(0, coalesce((select sum(net_vnd) from public.payslips where period_id = $1), 0))
         where id = $1`, [ky.id]);
      return { phieu: phieu.length, dong };
    });
    if (kq) console.log(`  ${t.slug.padEnd(16)} ${kq.phieu} phiếu · ${kq.dong} dòng hoa hồng dựng lại`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ĐO SAU + BA ĐỐI CHỨNG
   ══════════════════════════════════════════════════════════════════════════ */
const PHU_SAU = await doPhu(ID_DO);

tieu("ĐỘ PHỦ TRƯỚC → SAU (trên " + BANG_TENANT.length + " bảng có cột tiệm)");
console.log("  tiệm                trước    sau    +    so với mốc spa");
TIEM.forEach((t, i) => {
  const spa = SPA_ID ? PHU_SAU[TIEM.length] : 106;
  console.log(`  ${t.slug.padEnd(18)} ${String(PHU_TRUOC[i]).padStart(5)}  ${String(PHU_SAU[i]).padStart(5)}` +
    `  ${String("+" + (PHU_SAU[i] - PHU_TRUOC[i])).padStart(4)}    ${PHU_SAU[i]}/${spa}` +
    `  (${Math.round(PHU_SAU[i] / spa * 100)}%)`);
});
if (SPA_ID)
  console.log(`  ${CAM_TUYET_DOI.padEnd(18)} ${String(PHU_TRUOC[TIEM.length]).padStart(5)}  ${String(PHU_SAU[TIEM.length]).padStart(5)}` +
    `  ${String("+" + (PHU_SAU[TIEM.length] - PHU_TRUOC[TIEM.length])).padStart(4)}    ← PHẢI LÀ +0`);

tieu("ĐỐI CHỨNG 1 — DỮ LIỆU KÉO THEO TĂNG DO TRIGGER/HÀM, KHÔNG DO SCRIPT CHÈN");
console.log("  (cổng tự soát ở đầu file đã đọc thân script và xác nhận không có câu INSERT nào vào các bảng dưới)\n");
for (const t of TIEM) {
  const sau = await demKeoTheo(t.id);
  const dong = BANG_KEO_THEO.map((b) => {
    const d = sau[b] - KEO_TRUOC[t.slug][b];
    return d === 0 ? null : `${b} +${so(d)}`;
  }).filter(Boolean);
  console.log(`  ${t.slug.padEnd(16)} ${dong.length ? dong.join(" · ") : "không đổi"}`);
}

tieu("ĐỐI CHỨNG 2 — HOA HỒNG TRÊN PHIẾU LƯƠNG KHỚP SỔ HOA HỒNG");
let lechXau = 0, dongCu = 0;
for (const t of TIEM) {
  const sau = await doDoiSoatLuong(t.id);
  const truoc = Object.fromEntries(LUONG_TRUOC[t.slug].map((r) => [r.ky, r]));
  console.log(`\n  ${t.slug} — ${NGANH[t.slug].ten}`);
  console.log("    kỳ        tình trạng   sổ hoa hồng      trên phiếu lương   lệch      tổng kỳ đổi?");
  for (const r of sau) {
    const lech = Number(r.so_hoa_hong) - Number(r.tren_phieu);
    const cu = truoc[r.ky];
    const doiTong = cu ? Number(r.total_vnd) - Number(cu.total_vnd) : 0;
    const lechCu = cu ? Number(cu.so_hoa_hong) - Number(cu.tren_phieu) : 0;
    let cot = lech === 0 ? "khớp" : `LỆCH ${so(lech)}`;
    if (lech !== 0 && lech === lechCu) { cot = `lệch ${so(lech)} (có TỪ TRƯỚC, không do lượt này)`; dongCu++; }
    else if (lech !== 0) lechXau++;
    if (r.status === "closed" && doiTong !== 0) lechXau++;
    console.log(`    ${r.ky}   ${r.status.padEnd(11)} ${String(so(r.so_hoa_hong)).padStart(14)}   ` +
      `${String(so(r.tren_phieu)).padStart(16)}   ${cot.padEnd(9)} ` +
      `${r.status === "closed" ? (doiTong === 0 ? "ĐỨNG YÊN ✓" : `XÊ DỊCH ${so(doiTong)} ✗`) : (doiTong === 0 ? "—" : `${doiTong > 0 ? "+" : ""}${so(doiTong)}`)}`);
  }
  const dt = await doDoanhThu(t.id);
  const cu = Object.fromEntries(DT_TRUOC[t.slug].map((r) => [r.thang, r.dt]));
  const doiDT = dt.filter((r) => String(cu[r.thang] ?? 0) !== String(r.dt));
  console.log(`    Doanh thu tháng tròn (đơn đã xong): ${doiDT.length === 0 ? "KHÔNG ĐỔI ✓" : `ĐỔI ở ${doiDT.map((x) => x.thang).join(", ")} ✗`}`);
  if (doiDT.length) lechXau++;
}

tieu("ĐỐI CHỨNG 3 — TIỆM SPA KHÔNG TĂNG MỘT DÒNG NÀO");
if (!SPA_ID) console.log("  Không tìm thấy tiệm mốc — bỏ qua.");
else {
  const sau = await demKeoTheo(SPA_ID);
  const tongSau = Number((await c.query(`select count(*) n from public.contacts where tenant_id = $1`, [SPA_ID])).rows[0].n);
  const lech = BANG_KEO_THEO.map((b) => (sau[b] - SPA_KEO_TRUOC[b]) === 0 ? null : `${b} ${sau[b] - SPA_KEO_TRUOC[b] > 0 ? "+" : ""}${sau[b] - SPA_KEO_TRUOC[b]}`).filter(Boolean);
  console.log(`  Độ phủ: ${PHU_TRUOC[TIEM.length]} → ${PHU_SAU[TIEM.length]} (${PHU_SAU[TIEM.length] === PHU_TRUOC[TIEM.length] ? "KHÔNG ĐỔI ✓" : "ĐỔI ✗"})`);
  console.log(`  Số khách: ${so(SPA_TONG_TRUOC)} → ${so(tongSau)} (${SPA_TONG_TRUOC === tongSau ? "KHÔNG ĐỔI ✓" : "ĐỔI ✗"})`);
  console.log(`  Bảng kéo theo: ${lech.length === 0 ? "KHÔNG DÒNG NÀO ĐỔI ✓" : "⚠ " + lech.join(" · ")}`);
  console.log(`  Lưu ý trung thực: tiệm này đang có phiên khác nạp cùng lúc. Nếu số trên có xê dịch,`);
  console.log(`  đó là của phiên kia — script này không có câu lệnh nào nhắc tới slug đó (cổng tự soát đã chứng minh).`);
}

/* ══════════════════════════════════════════════════════════════════════════ */
tieu("TỔNG KẾT");
console.log(`  Tiệm đã nạp: ${TIEM.map((t) => t.slug).join(" · ")}`);
console.log(`  Tiệm có hợp đồng mới (đã dựng lại bảng lương 08/2026): ` +
  (TIEM_CO_HOP_DONG.length ? TIEM_CO_HOP_DONG.map((t) => t.slug).join(" · ") : "không có"));
console.log(`  Đối chứng lệch cần xem lại: ${lechXau}` + (dongCu ? ` · lệch có sẵn từ trước (không do lượt này): ${dongCu}` : ""));
if (CANH_BAO.length) {
  console.log(`\n  ${CANH_BAO.length} cảnh báo trong lượt chạy:`);
  for (const s of CANH_BAO.slice(0, 25)) console.log(`    • ${s}`);
  if (CANH_BAO.length > 25) console.log(`    … và ${CANH_BAO.length - 25} cảnh báo nữa.`);
} else {
  console.log("  Không có cảnh báo nào.");
}

await c.end();
process.exitCode = lechXau > 0 ? 1 : 0;
