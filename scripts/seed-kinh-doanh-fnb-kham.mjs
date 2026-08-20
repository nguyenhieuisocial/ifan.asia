#!/usr/bin/env node
/**
 * Nạp DỮ LIỆU KINH DOANH + NHÂN SỰ cho hai tiệm mẫu:
 *   • `sample-fnb`  — Cafe Góc Phố (18 người đang làm)
 *   • `sample-kham` — Nha Khoa Gia Đình An Tâm (14 người đang làm)
 *
 * Hai tiệm đã có sẵn hồ sơ nhân viên, khách, hội thoại, cơ hội — nhưng TRỐNG
 * sạch phần làm ra tiền: 0 mặt hàng, 0 tài nguyên, 0 lịch hẹn, 0 đơn, 0 ca làm,
 * 0 bảng lương. Bộ nạp này dựng đủ phần đó, theo đúng thứ tự mà các chốt chặn
 * của kho cho phép.
 *
 *   node --env-file=.env.local scripts/seed-kinh-doanh-fnb-kham.mjs
 *   TIEM=sample-kham node --env-file=.env.local scripts/seed-kinh-doanh-fnb-kham.mjs
 *   CHI_TINH=1 node --env-file=.env.local scripts/seed-kinh-doanh-fnb-kham.mjs   ← chỉ tính, KHÔNG ghi
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI "GHI NGUỒN, ĐỂ TRIGGER LÀM PHẦN CÒN LẠI"
 * ═══════════════════════════════════════════════════════════════════════════
 * Đã đo trên lược đồ thật (20/08/2026), không suy từ tên bảng:
 *
 *   • `orders_sinh_dong_kho`, `orders_sinh_hoa_hong`, `orders_tier_recompute`
 *     là trigger **AFTER UPDATE OF status** — KHÔNG phải AFTER INSERT. Chèn
 *     thẳng một đơn `status='completed'` thì KHÔNG sinh dòng kho, KHÔNG sinh
 *     hoa hồng, và KHÔNG có gì báo lỗi. Nên ở đây mọi đơn đều đi đúng đường
 *     đời thật: chèn `draft` → thêm dòng hàng → thu tiền → `confirmed` →
 *     `completed`. Trigger tự lo kho, sổ quỹ, hoa hồng, hạng khách.
 *
 *   • `orders_status_transition_guard` chỉ mở đúng đường
 *     draft→confirmed→completed (và huỷ từ draft/confirmed/completed).
 *     Không có đường tắt nào khác.
 *
 *   • `order_lines.line_total_vnd` là cột SINH TỰ ĐỘNG. `order_payments_guard`
 *     lấy chính cột đó để chặn thu vượt tổng đơn ⇒ tiền thu phải suy từ
 *     đơn giá × số lượng − giảm, không được bịa.
 *
 *   • `order_lines_lock_guard` cấm sửa dòng khi đơn đã `completed`/`cancelled`;
 *     `order_lines_sign_guard` bắt phiếu hoàn phải có `qty` ÂM.
 *     ⇒ Trình tự trên là trình tự DUY NHẤT còn hợp lệ, không phải sở thích.
 *
 *   • `order_lines_snapshot_cost` chốt giá vốn NGAY LÚC CHÈN DÒNG, đọc từ
 *     `item_costs`. ⇒ Phải ghi `item_costs` TRƯỚC khi ghi dòng đơn, nếu không
 *     mọi dòng mang giá vốn NULL và màn Lãi gộp nói dối.
 *
 *   • `commission_sinh_cho_don()` nối người ăn hoa hồng bằng
 *     `e.user_id = coalesce(l.performed_by_user_id, a.staff_user_id, o.created_by)`
 *     và nhân với `commission_rates.percent` theo `items.kind`.
 *     ⇒ Mỗi dòng đơn phải mang `performed_by_user_id` = người THẬT SỰ làm ra
 *       dòng đó. Bỏ trống là hoa hồng rơi hết về người lập đơn.
 *
 *   • `appointments_item_kind_guard` chỉ cho `item_id` trỏ vào mặt hàng
 *     `kind='service'`. Thực đơn quán cà phê toàn `product` ⇒ lịch ĐẶT BÀN của
 *     quán mang `item_id = NULL`. Đây là đo được, không phải chọn cho tiện.
 *
 *   • `appointments_no_overlap_staff` / `_resource` là ràng buộc EXCLUDE, chỉ
 *     hiệu lực với ca `booked`/`arrived`. Dù vậy bộ nạp này tránh chồng giờ cho
 *     MỌI trạng thái — một tiệm thật không có hai ca cùng người cùng giờ, kể cả
 *     ca đã xong.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG TỰ CHÈN stock_moves / commission_entries
 * ═══════════════════════════════════════════════════════════════════════════
 * Ba bảng `stock_moves`, `commission_entries`, và phần `sale` của `cash_entries`
 * là dữ liệu KÉO THEO. Tự chèn thì có hai nguồn cùng nói về một việc, tới lúc
 * lệch nhau không ai biết bên nào đúng. Bộ nạp này KHÔNG có một câu `insert`
 * nào vào `stock_moves` và `commission_entries` — grep thử là thấy.
 *
 * `cash_entries` có hai câu `insert`, và cả hai đều là CHỨNG TỪ GỐC do người
 * ghi, không phải bản sao của thứ khác:
 *   1. Phiếu chi lương mỗi kỳ (đúng như sản phẩm làm khi chốt kỳ lương).
 *   2. Phiếu nộp tiền mặt cuối ca về ngân hàng (cặp out/cash + in/bank).
 * Toàn bộ phiếu quỹ loại `sale` vẫn 100% do trigger sinh — phần nghiệm thu có
 * câu kiểm chứng điều đó.
 *
 * Ngoại lệ DUY NHẤT, và chỉ là MỐC THỜI GIAN: trigger sinh phiếu quỹ với
 * `created_at = now()`, nên nếu để nguyên thì mấy nghìn đơn rải 3,5 tháng sẽ đổ
 * hết vào Sổ quỹ trong một phút. Sau khi trigger chạy xong, ta KÉO `created_at`
 * của chính những dòng đó về đúng ngày chứng từ gốc. Không thêm dòng, không đổi
 * số tiền — chỉ sửa mốc.
 *
 * Sổ kho thì KHÔNG kéo mốc được: `stock_moves_immutable_guard` chặn mọi
 * UPDATE/DELETE. Dòng kho do trigger sinh mang mốc LÚC CHẠY SCRIPT. Tồn kho
 * hiện tại vẫn ĐÚNG; chỉ báo cáo kho theo ngày là dồn về hôm nay. Hạn chế được
 * ghi nhận, không lách bằng cách chèn tay.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO NHÂN SỰ CHẠY SAU ĐƠN HÀNG
 * ═══════════════════════════════════════════════════════════════════════════
 * Phiếu lương lấy hoa hồng từ `commission_entries`. Hoa hồng chỉ sinh ra khi
 * đơn chuyển sang `completed`. Chốt lương TRƯỚC rồi mới sinh hoa hồng thì phiếu
 * lương thiếu đúng phần đó, và `payroll_close_guard` không cho sửa kỳ đã chốt
 * nếu không có lý do mở khoá. Đó là lỗi đã xảy ra ở tiệm spa hôm nay.
 * ⇒ Trong bộ nạp này: MẶT HÀNG → TÀI NGUYÊN → KHÁCH → LỊCH HẸN → ĐƠN → NHẬP
 *   HÀNG → rồi mới CA LÀM → CHẤM CÔNG → BẢNG CÔNG → LƯƠNG.
 *
 * Thứ tự trong phần nhân sự cũng do chốt chặn quy định, không phải sở thích:
 *   1. `punch_locked_period_guard` chặn ghi lần chấm vào tháng đã chốt bảng
 *      công ⇒ CHẤM CÔNG TRƯỚC, CHỐT BẢNG CÔNG SAU.
 *   2. `payroll_close_guard` từ chối chốt kỳ lương nếu bảng công tháng đó chưa
 *      chốt ⇒ CHỐT BẢNG CÔNG TRƯỚC, CHỐT LƯƠNG SAU.
 *   3. `payslips_locked_guard` chặn ghi phiếu khi kỳ đã chốt ⇒ DỰNG PHIẾU
 *      TRƯỚC, CHỐT KỲ SAU.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * QUY MÔ PHẢI CÂN — bài học từ tiệm spa
 * ═══════════════════════════════════════════════════════════════════════════
 * Tiệm spa từng bị đặt 20 nhân viên nhưng lượng giao dịch của tiệm 3 người:
 * quỹ lương 182 triệu/tháng, doanh thu 72 triệu/tháng ⇒ mở Báo cáo ra thấy sắp
 * phá sản. Số khớp từng ô mà câu chuyện thì sai.
 *
 * Nên ở đây quy mô được TÍNH NGƯỢC từ quỹ lương thật đọc từ CSDL:
 *   • Cafe Góc Phố: quỹ lương 149,9 tr/tháng ⇒ doanh thu ~450 tr/tháng
 *     (lương cứng ~33% doanh thu — mặt bằng F&B Việt Nam).
 *   • Nha Khoa An Tâm: quỹ lương 223 tr/tháng ⇒ doanh thu ~700 tr/tháng
 *     (lương cứng ~32% — nha khoa biên lợi nhuận cao hơn quán cà phê).
 * Phần nghiệm thu in bảng doanh thu từng tháng kèm tỉ lệ lương/doanh thu, cả
 * lương cứng lẫn lương cứng + hoa hồng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHẠY LẠI KHÔNG NHÂN ĐÔI
 * ═══════════════════════════════════════════════════════════════════════════
 * `orders` / `appointments` không có cột `external_id` để neo, nên mỗi bản ghi
 * được neo bằng khoá tự sinh TẤT ĐỊNH: id = UUIDv5(tên gọi cố định), tên gọi
 * dựng từ mã tiệm + mã mẻ + loại + số thứ tự. Cùng đầu vào ⇒ cùng UUID ⇒ lần
 * chạy thứ hai lọc ra "đã có" và bỏ qua. Bảng có khoá duy nhất tự nhiên (mặt
 * hàng, tài nguyên, ca làm, bảng công, phiếu lương) thì neo bằng khoá đó.
 *
 * Mọi con số ngẫu nhiên đi qua `nn()` — hàm băm TẤT ĐỊNH theo khoá, KHÔNG phải
 * `Math.random()` và cũng không phải bộ sinh số theo thứ tự gọi. Nghĩa là đổi
 * thứ tự vòng lặp cũng không đổi kết quả.
 *
 * ⚠️ ĐỔI SỐ Ở KHỐI `QUY_MO` THÌ PHẢI ĐỔI `MA_ME`. Quên đổi thì mẻ mới trùng
 * khoá mẻ cũ, bị lọc là "đã có", và bạn ngồi nhìn một script chạy xong mà không
 * ghi được gì. Cũng KHÔNG xoá được mẻ cũ: `stock_moves_immutable_guard` chặn
 * cả UPDATE lẫn DELETE, xoá đơn cũ để lại dòng kho mồ côi không xoá nổi.
 *
 * ⚠️ CHỈ ghi vào tiệm `is_sample = true` VÀ nằm trong danh sách cho phép — có
 * chốt kiểm ở đầu, không phải lời hứa. `demo-spa-huong-sen` bị chặn cứng.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// ── Chốt kiểm phạm vi ─────────────────────────────────────────────────────
/** Hai tiệm được giao. Không có tiệm nào khác đi qua được cổng này. */
const CHO_PHEP = ["sample-fnb", "sample-kham"];
/** Tiệm đã xong và đang cân — chạm vào là phá. Chặn cứng, kể cả khi gõ nhầm. */
const CAM_TUYET_DOI = ["demo-spa-huong-sen"];

const MA_ME = "kd1";
const CHI_TINH = process.env.CHI_TINH === "1"; // chỉ tính và in dự báo, không ghi

const TIEM_YEU_CAU = (process.env.TIEM ?? "").trim();
if (TIEM_YEU_CAU && CAM_TUYET_DOI.includes(TIEM_YEU_CAU)) {
  console.error(`✖ DỪNG: "${TIEM_YEU_CAU}" nằm trong danh sách CẤM TUYỆT ĐỐI của bộ nạp này.`);
  process.exit(1);
}
if (TIEM_YEU_CAU && !CHO_PHEP.includes(TIEM_YEU_CAU)) {
  console.error(`✖ DỪNG: "${TIEM_YEU_CAU}" không nằm trong danh sách được giao (${CHO_PHEP.join(", ")}).`);
  process.exit(1);
}
const DANH_SACH_TIEM = TIEM_YEU_CAU ? [TIEM_YEU_CAU] : CHO_PHEP;

if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL");
  process.exit(1);
}
const ca = readFileSync(new URL("../supabase/supabase-ca.crt", import.meta.url), "utf8");
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca, rejectUnauthorized: true },
});

// ── Khoá tất định ─────────────────────────────────────────────────────────
// UUIDv5 chuẩn (SHA-1 + không gian tên cố định). Không dùng thư viện ngoài để
// script chạy được bằng node trần.
const KHONG_GIAN_TEN = "1b0a5e2c-9d47-4c3f-8e51-6a2f7c4d9b83";
const uuid5 = (ten) => {
  const ns = Buffer.from(KHONG_GIAN_TEN.replace(/-/g, ""), "hex");
  const b = Buffer.from(
    createHash("sha1").update(Buffer.concat([ns, Buffer.from(ten, "utf8")])).digest().subarray(0, 16),
  );
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

// ── Ngẫu nhiên TẤT ĐỊNH ───────────────────────────────────────────────────
// Băm FNV-1a rồi trộn kiểu mulberry32. Cùng khoá ⇒ cùng số, KHÔNG phụ thuộc
// thứ tự gọi — nên đổi thứ tự vòng lặp cũng dựng lại đúng bộ dữ liệu cũ.
function bam(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function nn(...phan) {
  let t = (bam(phan.join("|")) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const nnInt = (a, b, ...phan) => a + Math.floor(nn(...phan) * (b - a + 1));
const nnChon = (mang, ...phan) => mang[Math.floor(nn(...phan) * mang.length)];
const nnTrongSo = (cap, ...phan) => {
  const tong = cap.reduce((s, [, w]) => s + w, 0);
  let x = nn(...phan) * tong;
  for (const [v, w] of cap) if ((x -= w) < 0) return v;
  return cap[cap.length - 1][0];
};

// ── Ngày giờ ──────────────────────────────────────────────────────────────
// Máy chủ chạy UTC nên KHÔNG dùng `new Date(y,m,d)` của máy cục bộ, sẽ lệch múi
// giờ và lịch hẹn nhảy sang ngày khác.
const VN = (y, m, d, gio = 0, phut = 0) => new Date(Date.UTC(y, m - 1, d, gio - 7, phut));
const NGAY_MS = 86400000;
const ngayToSo = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const soToNgay = (t) => new Date(t).toISOString().slice(0, 10);
const themNgay = (s, n) => soToNgay(ngayToSo(s) + n * NGAY_MS);
/** 0 = Chủ nhật … 6 = Thứ Bảy. */
const thuCua = (s) => new Date(ngayToSo(s)).getUTCDay();
const cuoiKy = (ky) => { const [y, m] = ky.split("-").map(Number); return soToNgay(Date.UTC(y, m, 0)); };
/** Nhãn kỳ 'MM/YYYY'. */
const nhanKy = (ky) => `${ky.slice(5, 7)}/${ky.slice(0, 4)}`;
/** Giờ VN (phút trong ngày) → mốc UTC. */
const gioVN = (ngay, phut) => {
  const [y, m, d] = ngay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, phut - 7 * 60));
};
const tien = (n) => Number(n).toLocaleString("vi-VN");
const log = (...a) => console.log(...a);

// ── Cửa sổ thời gian ──────────────────────────────────────────────────────
const HOM_NAY = "2026-08-20";
const BAT_DAU = "2026-05-01";   // 3 tháng TRÒN (5, 6, 7) + tháng 8 chạy dở
const KET_THUC = "2026-09-05";  // + hơn hai tuần lịch hẹn sắp tới
/** Kỳ lương / bảng công. `timesheets.period` bắt buộc là ngày mùng 1. */
const KY = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"];
const KY_DA_CHOT = ["2026-05-01", "2026-06-01", "2026-07-01"];
const MO_KHOA = (process.env.MO_KHOA ?? "").trim();
const BAN_KINH_M = 300; // ngoài bán kính này thì `attendance_set_flag()` gắn cờ

/** Haversine — SAO CHÉP nguyên `khoangCachM` của app/app/team/queries.ts. */
function khoangCachM(a, b) {
  const R = 6_371_000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}
function toaDoCach(goc0, met, goc) {
  const dLat = (met * Math.cos(goc)) / 111_320;
  const dLng = (met * Math.sin(goc)) / (111_320 * Math.cos((goc0.lat * Math.PI) / 180));
  return { lat: Number((goc0.lat + dLat).toFixed(6)), lng: Number((goc0.lng + dLng).toFixed(6)) };
}

// ── Kho tên người Việt (để dựng khách hàng) ───────────────────────────────
const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng",
  "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Trịnh", "Đinh", "Tô", "Mai", "Lương", "Cao"];
const DEM_NU = ["Thị Ngọc", "Thị Thu", "Thị Kim", "Thanh", "Ngọc", "Thu", "Minh", "Khánh",
  "Bảo", "Hoài", "Diệu", "Thuỳ", "Tuyết", "Phương", "Hồng", "Mỹ", "Quỳnh", "Gia", "Cẩm", "Yến", "Thảo"];
const TEN_NU = ["Anh", "Linh", "Hương", "Trang", "Ngân", "Nhi", "Vân", "Thảo", "Hà", "My",
  "Trâm", "Uyên", "Chi", "Dung", "Hạnh", "Lan", "Mai", "Nga", "Oanh", "Phượng", "Quyên",
  "Như", "Tâm", "Thuý", "Tiên", "Trinh", "Tuyền", "Vy", "Xuân", "Yến", "Đào", "Hiền"];
const DEM_NAM = ["Văn", "Hữu", "Minh", "Quốc", "Thanh", "Đức", "Anh", "Hoàng", "Tuấn", "Bá"];
const TEN_NAM = ["Nam", "Hùng", "Dũng", "Khang", "Kiên", "Long", "Phúc", "Quân", "Sơn",
  "Thắng", "Trung", "Vinh", "Bảo", "Đạt", "Huy", "Tú", "Lâm", "Khoa"];
const DAU_SO = ["090", "091", "093", "094", "096", "097", "098", "070", "076", "078",
  "079", "081", "082", "083", "084", "085", "032", "033", "034", "035", "036", "037", "038", "039"];

// ══════════════════════════════════════════════════════════════════════════
// CẤU HÌNH TỪNG NGÀNH
// Hai tiệm KHÔNG dùng chung một khuôn: quán cà phê sống bằng đơn tại quầy, còn
// phòng khám sống bằng lịch hẹn. Ép giống nhau là dựng hai tiệm không có thật.
// ══════════════════════════════════════════════════════════════════════════

/** Quán cà phê — thực đơn. Mọi món đều là `product` (bán ra là trừ kho). */
const THUC_DON_CAFE = [
  // [tên, giá bán, giá vốn, đơn vị, nhóm, trọng số xuất hiện]
  ["Cà phê đen đá", 29000, 10000, "ly", "Cà phê", 90],
  ["Cà phê sữa đá", 35000, 12000, "ly", "Cà phê", 130],
  ["Bạc xỉu", 39000, 14000, "ly", "Cà phê", 85],
  ["Cà phê muối", 42000, 15000, "ly", "Cà phê", 70],
  ["Espresso", 40000, 13000, "ly", "Cà phê máy", 30],
  ["Americano", 45000, 14000, "ly", "Cà phê máy", 45],
  ["Cappuccino", 55000, 19000, "ly", "Cà phê máy", 50],
  ["Latte", 55000, 19000, "ly", "Cà phê máy", 55],
  ["Cold brew", 59000, 20000, "ly", "Cà phê máy", 35],
  ["Trà đào cam sả", 55000, 18000, "ly", "Trà", 95],
  ["Trà vải", 55000, 18000, "ly", "Trà", 60],
  ["Trà sen vàng", 52000, 17000, "ly", "Trà", 45],
  ["Trà tắc mật ong", 42000, 13000, "ly", "Trà", 55],
  ["Trà sữa trân châu", 49000, 17000, "ly", "Trà", 70],
  ["Sinh tố bơ", 59000, 22000, "ly", "Sinh tố - nước ép", 40],
  ["Sinh tố xoài", 55000, 20000, "ly", "Sinh tố - nước ép", 35],
  ["Nước ép cam", 49000, 19000, "ly", "Sinh tố - nước ép", 35],
  ["Nước ép dưa hấu", 45000, 16000, "ly", "Sinh tố - nước ép", 25],
  ["Cacao đá xay", 59000, 21000, "ly", "Đá xay", 30],
  ["Matcha đá xay", 62000, 23000, "ly", "Đá xay", 32],
  ["Soda việt quất", 52000, 18000, "ly", "Đá xay", 22],
  ["Nước suối Lavie 500ml", 15000, 6000, "chai", "Khác", 40],
];
const DO_AN_CAFE = [
  ["Cơm gà xối mỡ", 69000, 29000, "phần", "Cơm - mì", 60],
  ["Cơm sườn nướng", 75000, 32000, "phần", "Cơm - mì", 55],
  ["Mì Ý sốt bò bằm", 85000, 35000, "phần", "Cơm - mì", 40],
  ["Nui xào bò", 69000, 28000, "phần", "Cơm - mì", 30],
  ["Gà rán giòn (3 miếng)", 79000, 34000, "phần", "Đồ ăn nhanh", 45],
  ["Khoai tây chiên", 39000, 15000, "phần", "Đồ ăn nhanh", 55],
  ["Salad ức gà", 65000, 27000, "phần", "Đồ ăn nhanh", 25],
  ["Bánh mì chảo", 55000, 23000, "phần", "Đồ ăn sáng", 50],
  ["Bánh mì ốp la", 39000, 16000, "phần", "Đồ ăn sáng", 45],
  ["Bánh mì thịt nguội", 35000, 15000, "ổ", "Đồ ăn sáng", 35],
];
const BANH_CAFE = [
  ["Bánh croissant bơ", 35000, 14000, "cái", "Bánh ngọt", 45],
  ["Bánh tiramisu", 45000, 18000, "miếng", "Bánh ngọt", 40],
  ["Bánh mousse chanh dây", 45000, 18000, "miếng", "Bánh ngọt", 30],
  ["Bánh flan", 25000, 9000, "cái", "Bánh ngọt", 35],
  ["Bánh su kem", 22000, 8000, "cái", "Bánh ngọt", 30],
];

/** Phòng khám nha khoa — dịch vụ (`service`, bắt buộc có `duration_minutes`). */
const DICH_VU_NHA_KHOA = [
  // [tên, giá, phút, nhóm, trọng số, ai làm]
  ["Khám và tư vấn tổng quát", 100000, 20, "Khám - chẩn đoán", 10, "bacsi"],
  ["Chụp X-quang răng (phim nhỏ)", 100000, 15, "Khám - chẩn đoán", 4, "xquang"],
  ["Chụp X-quang toàn cảnh Panorama", 250000, 20, "Khám - chẩn đoán", 3, "xquang"],
  ["Tái khám sau điều trị", 0, 15, "Khám - chẩn đoán", 6, "bacsi"],
  ["Cạo vôi răng và đánh bóng", 400000, 40, "Nha khoa tổng quát", 16, "bacsi"],
  ["Trám răng thẩm mỹ Composite", 500000, 45, "Nha khoa tổng quát", 14, "bacsi"],
  ["Trám răng sữa trẻ em", 300000, 30, "Nha khoa trẻ em", 5, "bacsi"],
  ["Trám bít hố rãnh phòng ngừa (Sealant)", 350000, 30, "Nha khoa trẻ em", 3, "bacsi"],
  ["Nhổ răng sữa", 200000, 20, "Nha khoa trẻ em", 4, "bacsi"],
  ["Nhổ răng thường", 700000, 40, "Tiểu phẫu", 5, "bacsi"],
  ["Nhổ răng khôn mọc lệch", 2500000, 75, "Tiểu phẫu", 4, "bacsi"],
  ["Điều trị tuỷ răng cửa", 1800000, 60, "Điều trị tuỷ", 3, "bacsi"],
  ["Điều trị tuỷ răng hàm", 3000000, 90, "Điều trị tuỷ", 4, "bacsi"],
  ["Điều trị viêm nướu - nha chu", 800000, 45, "Nha khoa tổng quát", 4, "bacsi"],
  ["Tẩy trắng răng tại phòng khám", 2800000, 75, "Thẩm mỹ răng", 3, "bacsi"],
  ["Bọc răng sứ Titan (1 răng)", 3000000, 60, "Phục hình răng sứ", 3, "bacsi"],
  ["Bọc răng sứ Cercon (1 răng)", 5500000, 60, "Phục hình răng sứ", 3, "bacsi"],
  ["Dán sứ Veneer (1 răng)", 7000000, 75, "Phục hình răng sứ", 2, "bacsi_truong"],
  ["Phục hình răng tháo lắp", 4500000, 60, "Phục hình răng sứ", 2, "bacsi"],
  ["Niềng răng mắc cài kim loại - đặt cọc", 8000000, 60, "Chỉnh nha", 1, "bacsi_nieng"],
  ["Niềng răng trong suốt Invisalign - đặt cọc", 15000000, 60, "Chỉnh nha", 1, "bacsi_truong"],
  ["Niềng răng - tái khám định kỳ", 1500000, 30, "Chỉnh nha", 8, "bacsi_nieng"],
  ["Máng chống nghiến răng ban đêm", 2200000, 40, "Thẩm mỹ răng", 2, "bacsi"],
  ["Cấy ghép Implant (1 trụ)", 18000000, 120, "Cấy ghép Implant", 1, "bacsi_truong"],
];
const VAT_TU_NHA_KHOA = [
  ["Bàn chải kẽ răng (hộp 6 cái)", 120000, 55000, "hộp", "Vật tư chăm sóc", 45],
  ["Chỉ nha khoa cuộn 50m", 65000, 28000, "cuộn", "Vật tư chăm sóc", 55],
  ["Nước súc miệng kháng khuẩn 500ml", 150000, 70000, "chai", "Vật tư chăm sóc", 50],
  ["Kem đánh răng chống ê buốt", 130000, 62000, "tuýp", "Vật tư chăm sóc", 45],
  ["Bàn chải lông siêu mềm sau tiểu phẫu", 90000, 38000, "cái", "Vật tư chăm sóc", 30],
  ["Sáp nha khoa cho người niềng", 60000, 22000, "hộp", "Vật tư chỉnh nha", 35],
  ["Bàn chải chuyên dụng cho người niềng", 110000, 45000, "cái", "Vật tư chỉnh nha", 25],
  ["Máng tẩy trắng tại nhà (bộ)", 1500000, 620000, "bộ", "Vật tư thẩm mỹ", 8],
  ["Gel tẩy trắng bổ sung", 450000, 180000, "ống", "Vật tư thẩm mỹ", 12],
  ["Thuốc giảm đau kê đơn (vỉ 10 viên)", 45000, 18000, "vỉ", "Thuốc", 60],
];

const NGANH = {
  "sample-fnb": {
    nhan: "Cafe Góc Phố",
    viTri: { lat: 10.801400, lng: 106.710900 }, // Phú Nhuận, TP.HCM
    nhaCungCap: [
      ["Rang xay Cầu Đất Farm", "0283 8 456 112", "Cà phê hạt, cold brew — giao thứ Ba hằng tuần."],
      ["Công ty TNHH Thực phẩm Minh Phát", "0283 9 771 240", "Sữa, kem, siro, trà — công nợ 15 ngày."],
      ["Lò bánh Nhà Bơ", "0908 774 512", "Bánh ngọt giao mỗi sáng 6h30."],
      ["Chợ đầu mối Bình Điền - sạp 24", "0913 220 845", "Rau củ, trái cây tươi."],
    ],
    taiNguyen: [
      ...Array.from({ length: 12 }, (_, i) => [`Bàn ${String(i + 1).padStart(2, "0")}`, "table"]),
      ...Array.from({ length: 4 }, (_, i) => [`Bàn sân vườn ${i + 1}`, "table"]),
      ["Phòng nhóm số 1", "room"],
      ["Phòng nhóm số 2", "room"],
      ["Quầy bar - ghế cao", "table"],
      ["Máy pha Espresso La Marzocco", "machine"],
    ],
    matHang: [
      ...THUC_DON_CAFE.map((x) => ["product", ...x]),
      ...DO_AN_CAFE.map((x) => ["product", ...x]),
      ...BANH_CAFE.map((x) => ["product", ...x]),
    ],
    quyMo: {
      khach: 1200,
      donMoiNgay: 58, donCuoiTuanThem: 24, donDaoDong: 12,
      lichMoiNgay: 2, lichCuoiTuanThem: 3, lichDaoDong: 2, lichSapToi: 3,
      phieuHoan: 25,
    },
    gioMoCua: 7 * 60, gioDongCua: 22 * 60 + 30,
    caLam: { morning: { vao: 6 * 60 + 30, ra: 14 * 60 }, afternoon: { vao: 14 * 60, ra: 22 * 60 + 30 }, full: { vao: 7 * 60, ra: 20 * 60 } },
    cachThu: [["cash", 45], ["vietqr", 40], ["bank_transfer", 15]],
  },

  "sample-kham": {
    nhan: "Nha Khoa Gia Đình An Tâm",
    viTri: { lat: 10.762600, lng: 106.682200 }, // Quận 5, TP.HCM
    nhaCungCap: [
      ["Công ty CP Vật tư Nha khoa Sài Gòn", "0283 8 350 771", "Composite, trâm nội nha, vật tư tiêu hao."],
      ["Dentsply Sirona Việt Nam", "0283 9 112 668", "Trụ Implant, máy nội nha — bảo hành chính hãng."],
      ["Labo răng sứ Ngọc Minh", "0909 447 231", "Gia công răng sứ Titan/Cercon, trả trong 3 ngày."],
      ["Nhà thuốc sỉ Quận 5", "0283 8 559 004", "Thuốc kê đơn, nước súc miệng."],
    ],
    taiNguyen: [
      ["Ghế nha số 1", "chair"], ["Ghế nha số 2", "chair"],
      ["Ghế nha số 3", "chair"], ["Ghế nha số 4 (dự phòng)", "chair"],
      ["Phòng tiểu phẫu vô trùng", "room"],
      ["Phòng tư vấn kế hoạch điều trị", "room"],
      ["Máy X-quang toàn cảnh Panorama", "machine"],
      ["Máy CT Cone Beam 3D", "machine"],
    ],
    matHang: [
      ...DICH_VU_NHA_KHOA.map(([ten, gia, phut, nhom, ts]) => ["service", ten, gia, null, null, nhom, ts, phut]),
      ...VAT_TU_NHA_KHOA.map((x) => ["product", ...x]),
    ],
    quyMo: {
      khach: 700,
      caMoiNgay: 19, caCuoiTuanThem: 6, caDaoDong: 6, caSapToi: 8,
      tyLeRaDon: 0.94, tyLeBanKem: 0.30, donMuaLe: 160,
      phieuHoan: 12,
    },
    gioMoCua: 8 * 60, gioDongCua: 19 * 60,
    caLam: { morning: { vao: 7 * 60 + 45, ra: 13 * 60 }, afternoon: { vao: 13 * 60, ra: 20 * 60 }, full: { vao: 7 * 60 + 45, ra: 19 * 60 } },
    cachThu: [["bank_transfer", 40], ["vietqr", 30], ["cash", 30]],
  },
};

/**
 * Chức danh nghề đọc từ `employees.note` — đó là nơi bộ nạp nhân sự ghi nghề.
 * KHÔNG đọc từ `tenant_members.role`: `role` là QUYỀN trong app, không phải nghề.
 * Đọc bằng TỪ KHOÁ và có đường lui, vì vài người mang ghi chú đời thường
 * ("Phục vụ — đã nghỉ việc 30/04/2026, về quê.").
 * Thứ tự các nhánh là có chủ ý: "bếp trưởng" phải xét trước "bếp".
 */
function ngheFnb(ghiChu) {
  const s = (ghiChu ?? "").toLowerCase();
  if (s.includes("quản lý")) return "quanly";
  if (s.includes("bếp trưởng")) return "beptruong";
  if (s.includes("bếp phó")) return "bepho";
  if (s.includes("phụ bếp")) return "phubep";
  if (s.includes("pha chế")) return "phache";
  if (s.includes("thu ngân")) return "thungan";
  if (s.includes("phục vụ")) return "phucvu";
  if (s.includes("tạp vụ")) return "tapvu";
  return "phucvu";
}
function ngheKham(ghiChu) {
  const s = (ghiChu ?? "").toLowerCase();
  if (s.includes("bác sĩ")) return "bacsi";
  if (s.includes("quản lý")) return "quanly";
  if (s.includes("kế toán")) return "ketoan";
  if (s.includes("labo")) return "labo";
  if (s.includes("x-quang") || s.includes("chẩn đoán hình ảnh")) return "xquang";
  if (s.includes("điều dưỡng") || s.includes("phụ tá")) return "phuta";
  if (s.includes("lễ tân")) return "letan";
  if (s.includes("dược sĩ")) return "duocsi";
  if (s.includes("tạp vụ")) return "tapvu";
  return "phuta";
}

/**
 * Xếp ca cho một người vào một ngày. Trả 'off' = ô nghỉ cố ý.
 * Hàm này THUẦN (không đụng CSDL) và được dùng ở HAI nơi: lúc xếp lịch hẹn (để
 * không đặt lịch cho người đang nghỉ) và lúc ghi bảng xếp ca. Một nguồn duy
 * nhất ⇒ hai màn không bao giờ nói hai chuyện.
 */
function caTrongNgay(slug, nv, ngay) {
  const d = thuCua(ngay);
  const nghiTuan = 1 + (nv.thuTu % 6); // rải ngày nghỉ tuần ra thứ Hai..thứ Bảy
  const tuan = Math.floor(ngayToSo(ngay) / (7 * NGAY_MS));
  const luanPhien = () => ((nv.thuTu + tuan) % 2 === 0 ? "morning" : "afternoon");
  if (slug === "sample-fnb") {
    switch (nv.nghe) {
      case "quanly": return d === 0 ? "off" : "full";
      case "beptruong": case "bepho": return d === nghiTuan ? "off" : "full";
      case "phache": return d === nghiTuan ? "off" : "full";
      case "tapvu": return d === 0 ? "off" : "morning";
      case "phubep": return d === nghiTuan ? "off" : luanPhien();
      case "thungan": return d === nghiTuan ? "off" : (nv.thuTu % 2 === 0 ? "morning" : "afternoon");
      default: return d === nghiTuan ? "off" : luanPhien(); // phục vụ
    }
  }
  switch (nv.nghe) {
    case "bacsi": return d === nghiTuan ? "off" : "full";
    case "quanly": return d === 0 ? "off" : "full";
    case "ketoan": return d === 0 || d === 6 ? "off" : "full";
    case "labo": return d === 0 ? "off" : "full";
    case "xquang": return d === nghiTuan ? "off" : "full";
    case "duocsi": return d === nghiTuan ? "off" : "full";
    case "tapvu": return d === 0 ? "off" : "morning";
    case "letan": return d === nghiTuan ? "off" : (nv.thuTu % 2 === 0 ? "morning" : "afternoon");
    default: return d === nghiTuan ? "off" : luanPhien(); // điều dưỡng / phụ tá
  }
}

/** Đơn nghỉ phép mẫu — dựng TRƯỚC cả lịch hẹn lẫn ca làm (xem chú thích trên). */
const NGHI_DA_DUYET = [
  ["2026-05-11", "2026-05-13", "paid", "Về quê giỗ nội."],
  ["2026-05-25", "2026-05-26", "sick", "Sốt siêu vi, có giấy khám của bệnh viện."],
  ["2026-06-08", "2026-06-10", "paid", "Đi du lịch Đà Lạt cùng gia đình."],
  ["2026-06-22", "2026-06-22", "sick", "Đau dạ dày, xin nghỉ một ngày."],
  ["2026-07-06", "2026-07-08", "paid", "Đám cưới chị gái ở Đồng Nai."],
  ["2026-07-20", "2026-07-21", "unpaid", "Việc nhà, xin nghỉ không lương."],
  ["2026-08-03", "2026-08-04", "paid", "Đưa con đi nhập học đầu năm."],
  ["2026-08-12", "2026-08-12", "sick", "Cảm cúm, xin nghỉ một ngày."],
];
const NGHI_CHO_DUYET = [
  ["2026-08-24", "2026-08-26", "paid", "Về quê ăn giỗ, xin nghỉ ba ngày."],
  ["2026-08-28", "2026-08-28", "paid", "Đi khám sức khoẻ định kỳ."],
  ["2026-09-01", "2026-09-03", "unpaid", "Chuyển nhà, xin nghỉ không lương."],
];
const NGHI_TU_CHOI = [
  ["2026-06-27", "2026-06-28", "paid", "Xin nghỉ cuối tuần đi chơi."],
  ["2026-08-15", "2026-08-16", "paid", "Xin nghỉ hai ngày cuối tuần."],
];

const LY_DO_HUY_LICH = [
  "Khách báo bận đột xuất, hẹn tuần sau",
  "Khách kẹt xe, xin dời buổi khác",
  "Trùng lịch công ty, khách xin huỷ",
  "Khách ốm, dời sang tuần sau",
];
const LY_DO_HUY_DON = [
  "Khách đổi ý, không lấy nữa",
  "Ghi nhầm bàn, lập lại phiếu mới",
  "Khách báo huỷ trước khi lên món",
  "Trùng phiếu, huỷ phiếu này",
];
const GHI_CHU_LICH_CAFE = [
  "Đặt bàn 4 người, xin chỗ gần cửa sổ.",
  "Nhóm học nhóm, cần ổ cắm điện.",
  "Sinh nhật — nhờ quán giữ bánh kem trong tủ mát.",
  "Khách quen, thích bàn sân vườn.",
  "Họp nhóm 6 người, xin phòng riêng.",
  null, null, null, null, null,
];
const GHI_CHU_LICH_KHAM = [
  "Bệnh nhân sợ đau, dặn bác sĩ tê kỹ.",
  "Có tiền sử dị ứng kháng sinh nhóm Beta-lactam.",
  "Đi cùng con nhỏ, xin hẹn khung giờ sáng.",
  "Tái khám theo kế hoạch điều trị đã tư vấn.",
  "Bệnh nhân bảo hiểm, cần xuất hoá đơn.",
  "Khách hẹn lại sau khi chụp phim ở nơi khác.",
  null, null, null, null,
];

// ══════════════════════════════════════════════════════════════════════════
async function main() {
  await c.connect();
  await c.query("set lock_timeout = '10s'");
  // Mẻ này ghi vài nghìn đơn, mỗi lần đổi trạng thái lại kích trigger sinh kho /
  // quỹ / hoa hồng. Câu lệnh dài hơn hạn mặc định là bình thường ở đây, nên nới
  // hạn CHẠY (statement) — KHÔNG nới hạn CHỜ KHOÁ (lock_timeout), vì chờ khoá
  // lâu nghĩa là đang giẫm chân người khác, phải hỏng sớm cho biết.
  await c.query("set statement_timeout = '20min'");
  await c.query("set idle_in_transaction_session_timeout = '20min'");

  for (const slug of DANH_SACH_TIEM) {
    log(`\n${"═".repeat(76)}`);
    await lamMotTiem(slug);
  }
  await c.end();
}

async function lamMotTiem(slug) {
  const cauHinh = NGANH[slug];

  // ── CHỐT KIỂM ────────────────────────────────────────────────────────────
  const { rows: tiemRows } = await c.query(
    `select id, name, slug, is_sample, deleted_at from public.tenants where slug = $1`, [slug]);
  const tiem = tiemRows[0];
  if (!tiem) throw new Error(`Không có tiệm nào mang mã "${slug}".`);
  if (tiem.is_sample !== true) {
    throw new Error(`DỪNG: tiệm "${tiem.name}" (${slug}) có is_sample = ${tiem.is_sample}. Bộ nạp này CHỈ ghi vào tiệm mẫu.`);
  }
  if (CAM_TUYET_DOI.includes(slug)) throw new Error(`DỪNG: "${slug}" nằm trong danh sách cấm.`);
  const T = tiem.id;
  log(`✔ Tiệm mẫu: ${tiem.name} (${slug})${CHI_TINH ? "   [CHỈ TÍNH — KHÔNG GHI]" : ""}`);

  // ── Đếm TRƯỚC ────────────────────────────────────────────────────────────
  const BANG_DEM = ["items", "resources", "contacts", "appointments", "orders", "order_lines",
    "order_payments", "purchases", "purchase_lines", "suppliers",
    "stock_moves", "cash_entries", "commission_entries",
    "shifts", "attendance_punches", "timesheets", "leave_requests",
    "payroll_periods", "payslips", "payslip_lines", "shift_closings"];
  const dem = async () => {
    const kq = {};
    for (const b of BANG_DEM) {
      const { rows } = await c.query(`select count(*)::int n from public.${b} where tenant_id = $1`, [T]);
      kq[b] = rows[0].n;
    }
    return kq;
  };
  const truoc = await dem();

  // ── Người trong tiệm ─────────────────────────────────────────────────────
  const doNghe = slug === "sample-fnb" ? ngheFnb : ngheKham;
  const { rows: nvRaw } = await c.query(
    `select id, user_id, full_name, note,
            to_char(started_on,'YYYY-MM-DD') started_on,
            to_char(ended_on,'YYYY-MM-DD')   ended_on,
            base_salary_vnd, overtime_rate_vnd, annual_leave_days
       from public.employees where tenant_id = $1
      order by started_on, full_name`, [T]);
  const NV = nvRaw.map((r, i) => ({
    id: r.id, uid: r.user_id, ten: r.full_name, nghe: doNghe(r.note),
    vao: r.started_on, nghiViec: r.ended_on,
    luong: Number(r.base_salary_vnd), giaTangCa: Number(r.overtime_rate_vnd),
    phepNam: Number(r.annual_leave_days), thuTu: i,
  }));
  if (NV.some((n) => !n.uid)) throw new Error("Có hồ sơ nhân viên chưa nối user_id — hoa hồng sẽ rơi mất, dừng.");
  const dangLamHomNay = NV.filter((n) => !n.nghiViec);
  const quyLuongThang = dangLamHomNay.reduce((s, n) => s + n.luong, 0);
  log(`  Nhân sự: ${NV.length} hồ sơ · ${dangLamHomNay.length} đang làm · quỹ lương ${tien(quyLuongThang)} đ/tháng`);
  const theoNghe = (...ds) => NV.filter((n) => ds.includes(n.nghe));
  log(`  Nghề: ${[...new Set(NV.map((n) => n.nghe))].map((g) => `${g}=${NV.filter((n) => n.nghe === g).length}`).join(" · ")}`);

  // Người quyết: chốt bảng công là việc quản lý trở lên, chốt lương là việc
  // chủ/quản trị. Tra theo VAI trong tiệm, không đóng cứng mã người.
  const { rows: vai } = await c.query(
    `select tm.user_id, tm.role from public.tenant_members tm
      where tm.tenant_id = $1 and tm.status = 'active' order by tm.role, tm.user_id`, [T]);
  const chuTiem = vai.find((v) => v.role === "owner")?.user_id;
  const quanTri = vai.find((v) => v.role === "admin")?.user_id ?? chuTiem;
  if (!chuTiem || !quanTri) throw new Error("Tiệm mẫu thiếu vai chủ tiệm / quản trị — dừng.");

  /** Người đang đi làm vào một ngày (theo hợp đồng), chưa xét ca. */
  const conLam = (nv, ngay) => (!nv.vao || ngay >= nv.vao) && (!nv.nghiViec || ngay <= nv.nghiViec);

  // ── Đơn nghỉ phép: dựng KẾ HOẠCH trước, dùng chung cho lịch hẹn và ca làm ─
  const nguoiCoTheNghi = NV.filter((n) => !n.nghiViec);
  const keHoachNghi = [];
  const chonNguoiNghi = (i) => nguoiCoTheNghi[(i * 3 + 1) % nguoiCoTheNghi.length];
  NGHI_DA_DUYET.forEach(([tu, den, loai, ly], i) => keHoachNghi.push({
    nv: chonNguoiNghi(i), tu, den, loai, ly, trangThai: "approved",
    boi: i % 2 === 0 ? quanTri : chuTiem, luc: gioVN(themNgay(tu, -3), 10 * 60),
  }));
  NGHI_CHO_DUYET.forEach(([tu, den, loai, ly], i) => keHoachNghi.push({
    nv: nguoiCoTheNghi[(i * 5 + 2) % nguoiCoTheNghi.length], tu, den, loai, ly,
    trangThai: "pending", boi: null, luc: null,
  }));
  NGHI_TU_CHOI.forEach(([tu, den, loai, ly], i) => keHoachNghi.push({
    nv: nguoiCoTheNghi[(i * 7 + 4) % nguoiCoTheNghi.length], tu, den, loai, ly,
    trangThai: "rejected", boi: quanTri, luc: gioVN(themNgay(tu, -4), 15 * 60),
  }));
  /** Ngày nghỉ ĐÃ DUYỆT — người này ngày đó không xếp ca, không nhận lịch hẹn. */
  const ngayNghi = new Set();
  for (const d of keHoachNghi) {
    if (d.trangThai !== "approved") continue;
    for (let x = d.tu; x <= d.den; x = themNgay(x, 1)) ngayNghi.add(`${d.nv.id}|${x}`);
  }
  /** Người này ngày đó có mặt ở tiệm không (hợp đồng + ca + nghỉ phép). */
  const coMat = (nv, ngay) => {
    if (!conLam(nv, ngay)) return false;
    if (ngayNghi.has(`${nv.id}|${ngay}`)) return false;
    return caTrongNgay(slug, nv, ngay) !== "off";
  };

  // ── 1) MẶT HÀNG + GIÁ VỐN ────────────────────────────────────────────────
  // `item_costs` phải có TRƯỚC dòng đơn: `order_lines_snapshot_cost` chốt giá
  // vốn ngay lúc chèn dòng. Ghi sau là mọi dòng mang giá vốn NULL.
  const matHangKeHoach = cauHinh.matHang.map(([loai, ten, gia, von, donVi, nhom, ts, phut], i) => ({
    id: uuid5(`${T}:mathang:${ten}`),
    loai, ten, gia, von: von ?? null, donVi: donVi ?? null, nhom, trongSo: ts,
    phut: phut ?? null, thuTu: i,
  }));

  // ── 2) TÀI NGUYÊN ────────────────────────────────────────────────────────
  // `resources.kind` chỉ nhận bed/room/chair/table/machine (đo từ CHECK, không đoán).
  const taiNguyenKeHoach = cauHinh.taiNguyen.map(([ten, kind], i) => ({
    id: uuid5(`${T}:tainguyen:${ten}`), ten, kind, thuTu: i,
  }));

  const nhaCungCapKeHoach = cauHinh.nhaCungCap.map(([ten, sdt, ghiChu]) => ({
    id: uuid5(`${T}:ncc:${ten}`), ten, sdt, ghiChu,
  }));

  // ── 3) KHÁCH HÀNG ────────────────────────────────────────────────────────
  // Danh sách khách dựng HOÀN TOÀN từ khoá tất định, KHÔNG nhìn vào CSDL. Đây
  // là mấu chốt của "chạy lại không nhân đôi": nếu kế hoạch phụ thuộc vào cái
  // mà chính nó vừa ghi thì lần chạy thứ hai ra một kế hoạch khác.
  const khachMoi = [];
  const daDungSdt = new Set();
  for (let i = 0; khachMoi.length < cauHinh.quyMo.khach && i < cauHinh.quyMo.khach * 4; i++) {
    const dau = DAU_SO[i % DAU_SO.length];
    const duoi = String(1000000 + ((i * 7919 + (slug === "sample-fnb" ? 314159 : 271828)) % 9000000)).slice(0, 7);
    const sdt = dau + duoi;
    const e164 = "+84" + sdt.slice(1);
    if (daDungSdt.has(e164)) continue;
    daDungSdt.add(e164);
    const k = `${slug}:kh:${i}`;
    const nam = nn(k, "gioitinh") < (slug === "sample-fnb" ? 0.45 : 0.42);
    const ten = nam
      ? `${nnChon(HO, k, "ho")} ${nnChon(DEM_NAM, k, "dem")} ${nnChon(TEN_NAM, k, "ten")}`
      : `${nnChon(HO, k, "ho")} ${nnChon(DEM_NU, k, "dem")} ${nnChon(TEN_NU, k, "ten")}`;
    khachMoi.push({
      id: uuid5(`${T}:khach:${e164}`), ten, sdt, e164,
      tinh: "TP Hồ Chí Minh",
      // Rải ngày tạo khắp cửa sổ để màn Khách hàng có đường tăng trưởng thật.
      taoLuc: new Date(ngayToSo(BAT_DAU) + nnInt(0, 108, k, "ngaytao") * NGAY_MS
        + nnInt(8, 20, k, "giotao") * 3600000),
    });
  }
  const SDT_DU_KIEN = new Set(khachMoi.map((k) => k.e164));
  const { rows: khachCu } = await c.query(
    `select id, phone_e164 from public.contacts where tenant_id = $1 and deleted_at is null order by id`, [T]);
  const theoSdt = new Map(khachCu.filter((k) => k.phone_e164).map((k) => [k.phone_e164, k.id]));
  const khachNen = khachCu.filter((k) => !k.phone_e164 || !SDT_DU_KIEN.has(k.phone_e164));
  for (const k of khachMoi) k.id = theoSdt.get(k.e164) ?? k.id;

  const moiKhach = [...khachNen.map((k) => ({ id: k.id })), ...khachMoi.map((k) => ({ id: k.id }))];
  /** Khách ruột — tiệm thật nào cũng có nhóm quay lại nhiều lần. */
  const khachRuot = moiKhach.filter((_, i) => i % 3 === 0);

  // ── 4) LỊCH HẸN ──────────────────────────────────────────────────────────
  // Giờ đã kín của từng người / từng tài nguyên. Phải nạp ca CÓ SẴN trong CSDL,
  // nếu không sẽ đụng ràng buộc EXCLUDE. Nhưng phải LOẠI ca do chính bộ nạp này
  // từng ghi: kể chúng vào thì lần chạy thứ hai xếp ra thời khoá biểu khác.
  const ID_LICH_DU_KIEN = new Set();
  for (let n = 1; n <= 6000; n++) ID_LICH_DU_KIEN.add(uuid5(`${T}:lich:${MA_ME}:${n}`));
  const { rows: caCuTatCa } = await c.query(
    `select id, staff_user_id, resource_id, start_at, end_at from public.appointments
      where tenant_id = $1 and deleted_at is null order by start_at, id`, [T]);
  const kin = new Map();
  const banRoi = (khoa, tu, den) => (kin.get(khoa) ?? []).some(([a, b]) => tu < b && den > a);
  const ghiKin = (khoa, tu, den) => { if (!kin.has(khoa)) kin.set(khoa, []); kin.get(khoa).push([tu, den]); };
  for (const r of caCuTatCa) {
    if (ID_LICH_DU_KIEN.has(r.id)) continue;
    ghiKin(`nv:${r.staff_user_id}`, +new Date(r.start_at), +new Date(r.end_at));
    if (r.resource_id) ghiKin(`tn:${r.resource_id}`, +new Date(r.start_at), +new Date(r.end_at));
  }

  const lichHen = [];
  let sttLich = 0;
  const tenTaiNguyen = new Map(taiNguyenKeHoach.map((r) => [r.ten, r]));

  if (slug === "sample-kham") {
    // Nha khoa: LỊCH HẸN LÀ TRỤC CHÍNH. Bác sĩ gắn ghế cố định (ghế trùng giờ
    // thì cũng là bác sĩ trùng giờ — một phép kiểm thay cho hai). X-quang đi
    // theo KTV chẩn đoán hình ảnh và máy Panorama; tiểu phẫu vào phòng vô trùng.
    const dichVu = matHangKeHoach.filter((m) => m.loai === "service");
    const bacSi = theoNghe("bacsi");
    if (bacSi.length === 0) throw new Error("Phòng khám không tra ra bác sĩ nào từ cột note — dừng.");
    // Bác sĩ phụ trách chuyên môn = người vào làm sớm nhất trong nhóm bác sĩ.
    const bacSiTruong = bacSi[0];
    const bacSiNieng = bacSi.slice(0, Math.max(2, Math.min(2, bacSi.length)));
    const ktvXquang = theoNghe("xquang");
    const gheCua = new Map(bacSi.map((b, i) => [b.id, `Ghế nha số ${i + 1}`]));
    const letan = theoNghe("letan", "quanly");

    for (let ngay = BAT_DAU; ngay <= KET_THUC; ngay = themNgay(ngay, 1)) {
      const d = thuCua(ngay);
      const tuongLai = ngay > HOM_NAY;
      let soCa = tuongLai
        ? cauHinh.quyMo.caSapToi + nnInt(0, 4, ngay, "sapca")
        : cauHinh.quyMo.caMoiNgay + (d === 6 ? cauHinh.quyMo.caCuoiTuanThem : 0)
          + nnInt(0, cauHinh.quyMo.caDaoDong, ngay, "daodong");
      if (d === 0) soCa = Math.round(soCa * 0.45); // Chủ nhật chỉ trực nửa buổi

      for (let k = 0; k < soCa; k++) {
        const key = `${ngay}:ca${k}`;
        const tenDv = nnTrongSo(dichVu.map((m) => [m.ten, m.trongSo]), key, "dichvu");
        const dv = dichVu.find((m) => m.ten === tenDv);
        const vaiTro = DICH_VU_NHA_KHOA.find((x) => x[0] === tenDv)?.[5] ?? "bacsi";

        let ungVien, tenTn;
        if (vaiTro === "xquang") { ungVien = ktvXquang; tenTn = "Máy X-quang toàn cảnh Panorama"; }
        else if (vaiTro === "bacsi_truong") { ungVien = [bacSiTruong]; tenTn = null; }
        else if (vaiTro === "bacsi_nieng") { ungVien = bacSiNieng; tenTn = null; }
        else { ungVien = bacSi; tenTn = null; }
        if (tenDv.includes("Nhổ răng khôn") || tenDv.includes("Implant")) tenTn = "Phòng tiểu phẫu vô trùng";

        const coTheLam = ungVien.filter((n) => coMat(n, ngay));
        if (coTheLam.length === 0) continue;
        const nguoi = nnChon(coTheLam, key, "nguoi");
        const tn = tenTn ? tenTaiNguyen.get(tenTn) : tenTaiNguyen.get(gheCua.get(nguoi.id));
        if (!tn) continue;

        // Tìm ô trống sớm nhất, bước 15 phút. Cách này bảo đảm KHÔNG BAO GIỜ đè
        // giờ của cùng một người hay cùng một ghế — kể cả ca đã có trong CSDL.
        const phut = dv.phut;
        const batTu = cauHinh.gioMoCua + nnInt(0, 8, key, "lechdau") * 15;
        let batDau = null;
        for (let p = batTu; p + phut <= cauHinh.gioDongCua; p += 15) {
          const tu = +gioVN(ngay, p), den = tu + phut * 60000;
          if (!banRoi(`nv:${nguoi.uid}`, tu, den) && !banRoi(`tn:${tn.id}`, tu, den)) { batDau = tu; break; }
        }
        if (batDau === null) {
          for (let p = cauHinh.gioMoCua; p + phut <= cauHinh.gioDongCua; p += 15) {
            const tu = +gioVN(ngay, p), den = tu + phut * 60000;
            if (!banRoi(`nv:${nguoi.uid}`, tu, den) && !banRoi(`tn:${tn.id}`, tu, den)) { batDau = tu; break; }
          }
        }
        if (batDau === null) continue;
        const ketThuc = batDau + phut * 60000;
        ghiKin(`nv:${nguoi.uid}`, batDau, ketThuc);
        ghiKin(`tn:${tn.id}`, batDau, ketThuc);

        const khach = nn(key, "ruot") < 0.55 ? nnChon(khachRuot, key, "khach") : nnChon(moiKhach, key, "khach");
        const trangThai = tuongLai ? "booked"
          : nnTrongSo([["done", 88], ["cancelled", 6], ["no_show", 6]], key, "trangthai");
        // Giá đúng bảng giá, thỉnh thoảng có ưu đãi khách quen / trẻ em.
        const gia = dv.gia > 0 && nn(key, "uudai") < 0.15
          ? Math.round((dv.gia * 0.9) / 10000) * 10000 : dv.gia;

        lichHen.push({
          id: uuid5(`${T}:lich:${MA_ME}:${++sttLich}`),
          khach: khach.id, nhanVien: nguoi.uid, nvHoSo: nguoi,
          item: dv.id, tenDv, taiNguyen: tn.id,
          batDau: new Date(batDau), ketThuc: new Date(ketThuc),
          trangThai, gia,
          note: nnChon(GHI_CHU_LICH_KHAM, key, "note"),
          lyDoHuy: trangThai === "cancelled" ? nnChon(LY_DO_HUY_LICH, key, "lydo") : null,
          nguon: nn(key, "nguon") < 0.4 ? "chat" : "calendar",
          taoBoi: (letan.filter((n) => coMat(n, ngay))[0] ?? letan[0] ?? nguoi).uid,
        });
      }
    }
  } else {
    // Quán cà phê: LỊCH HẸN LÀ PHỤ — chỉ là đặt bàn trước, vài cái mỗi ngày,
    // đông hơn vào cuối tuần. `item_id` để TRỐNG vì thực đơn quán toàn
    // `product`, mà `appointments_item_kind_guard` chỉ nhận `service`.
    const ban = taiNguyenKeHoach.filter((r) => r.kind === "table" || r.kind === "room");
    const phucVu = theoNghe("phucvu", "thungan", "quanly");
    for (let ngay = BAT_DAU; ngay <= KET_THUC; ngay = themNgay(ngay, 1)) {
      const d = thuCua(ngay);
      const tuongLai = ngay > HOM_NAY;
      const soCa = tuongLai
        ? cauHinh.quyMo.lichSapToi + nnInt(0, 2, ngay, "sapdatban")
        : cauHinh.quyMo.lichMoiNgay + (d === 0 || d === 6 ? cauHinh.quyMo.lichCuoiTuanThem : 0)
          + nnInt(0, cauHinh.quyMo.lichDaoDong, ngay, "daodongban");
      for (let k = 0; k < soCa; k++) {
        const key = `${ngay}:datban${k}`;
        const coTheLam = phucVu.filter((n) => coMat(n, ngay));
        if (coTheLam.length === 0) continue;
        const nguoi = nnChon(coTheLam, key, "nguoi");
        const phut = nnTrongSo([[90, 55], [120, 35], [150, 10]], key, "dodai");
        const tn = nnChon(ban, key, "ban");
        // Đặt bàn rơi vào khung chiều tối và cuối tuần — đúng lúc quán kín chỗ.
        const khungGio = nnTrongSo([[10 * 60, 12], [14 * 60, 22], [17 * 60, 36], [19 * 60, 30]], key, "khung");
        let batDau = null;
        for (let p = khungGio; p + phut <= cauHinh.gioDongCua; p += 30) {
          const tu = +gioVN(ngay, p), den = tu + phut * 60000;
          if (!banRoi(`nv:${nguoi.uid}`, tu, den) && !banRoi(`tn:${tn.id}`, tu, den)) { batDau = tu; break; }
        }
        if (batDau === null) continue;
        const ketThuc = batDau + phut * 60000;
        ghiKin(`nv:${nguoi.uid}`, batDau, ketThuc);
        ghiKin(`tn:${tn.id}`, batDau, ketThuc);
        const khach = nn(key, "ruot") < 0.5 ? nnChon(khachRuot, key, "khach") : nnChon(moiKhach, key, "khach");
        const trangThai = tuongLai ? "booked"
          : nnTrongSo([["done", 82], ["cancelled", 10], ["no_show", 8]], key, "trangthai");
        lichHen.push({
          id: uuid5(`${T}:lich:${MA_ME}:${++sttLich}`),
          khach: khach.id, nhanVien: nguoi.uid, nvHoSo: nguoi,
          item: null, tenDv: null, taiNguyen: tn.id,
          batDau: new Date(batDau), ketThuc: new Date(ketThuc),
          trangThai, gia: 0,
          note: nnChon(GHI_CHU_LICH_CAFE, key, "note"),
          lyDoHuy: trangThai === "cancelled" ? nnChon(LY_DO_HUY_LICH, key, "lydo") : null,
          nguon: nn(key, "nguon") < 0.55 ? "chat" : "calendar",
          taoBoi: nguoi.uid,
        });
      }
    }
  }

  // ── 5) ĐƠN HÀNG ──────────────────────────────────────────────────────────
  const donHang = [];
  let sttDon = 0;
  const sanPham = matHangKeHoach.filter((m) => m.loai === "product");

  if (slug === "sample-kham") {
    // Đơn mọc TỪ ca đã làm xong: xong dịch vụ mới ra quầy trả tiền.
    const duocSi = theoNghe("duocsi", "letan");
    const letan = theoNghe("letan", "quanly");
    for (const l of lichHen.filter((x) => x.trangThai === "done")) {
      const key = `don:${l.id}`;
      if (nn(key, "radon") > cauHinh.quyMo.tyLeRaDon) continue; // vài ca hẹn trả sau
      if (l.gia <= 0) continue;                                  // tái khám miễn phí không lập phiếu
      const luc = new Date(l.ketThuc.getTime() + 8 * 60000);
      const ngay = soToNgay(ngayToSo(soToNgay(+l.batDau + 7 * 3600000)));
      const dong = [{
        item: l.item, qty: 1, donGia: l.gia, giam: 0,
        lich: l.id, lamBoi: l.nhanVien, // ⇐ mấu chốt để hoa hồng về đúng bác sĩ
      }];
      // Vật tư bán kèm ở quầy thuốc — hoa hồng sản phẩm về dược sĩ.
      if (nn(key, "bankem") < cauHinh.quyMo.tyLeBanKem) {
        const sp = nnTrongSo(sanPham.map((s) => [s.ten, s.trongSo]), key, "vattu");
        const spObj = sanPham.find((s) => s.ten === sp);
        const nguoiBan = duocSi.filter((n) => coMat(n, ngay));
        const sl = nn(key, "sl") < 0.82 ? 1 : 2;
        dong.push({
          item: spObj.id, qty: sl, donGia: spObj.gia,
          giam: nn(key, "giam") < 0.1 ? Math.round((spObj.gia * sl * 0.05) / 1000) * 1000 : 0,
          lich: null, lamBoi: (nguoiBan[0] ?? duocSi[0] ?? l.nvHoSo).uid,
        });
      }
      const nguoiLap = letan.filter((n) => coMat(n, ngay));
      donHang.push({
        id: uuid5(`${T}:don:${MA_ME}:${++sttDon}`),
        khach: l.khach, lich: l.id, luc, dong,
        trangThai: nnTrongSo([["completed", 93], ["confirmed", 4], ["cancelled", 3]], key, "trangthai"),
        taoBoi: (nguoiLap[0] ?? letan[0] ?? l.nvHoSo).uid,
      });
    }
    // Khách ghé mua lẻ vật tư / thuốc, không đặt lịch.
    for (let i = 0; i < cauHinh.quyMo.donMuaLe; i++) {
      const key = `muale:${i}`;
      const ngay = themNgay(BAT_DAU, nnInt(0, 111, key, "ngay"));
      if (ngay > HOM_NAY) continue;
      const nguoiBanDs = theoNghe("duocsi", "letan").filter((n) => coMat(n, ngay));
      if (nguoiBanDs.length === 0) continue;
      const nguoiBan = nnChon(nguoiBanDs, key, "nguoi");
      const luc = gioVN(ngay, nnInt(cauHinh.gioMoCua, cauHinh.gioDongCua - 30, key, "gio"));
      const dong = [];
      for (let j = 0; j < 1 + (nn(key, `them${j}`) < 0.4 ? 1 : 0); j++) {
        const ten = nnTrongSo(sanPham.map((s) => [s.ten, s.trongSo]), key, `mon${j}`);
        const sp = sanPham.find((s) => s.ten === ten);
        if (dong.some((x) => x.item === sp.id)) continue;
        dong.push({ item: sp.id, qty: nnInt(1, 2, key, `sl${j}`), donGia: sp.gia, giam: 0, lich: null, lamBoi: nguoiBan.uid });
      }
      if (dong.length === 0) continue;
      donHang.push({
        id: uuid5(`${T}:don:${MA_ME}:${++sttDon}`),
        khach: nnChon(moiKhach, key, "khach").id, lich: null, luc, dong,
        trangThai: nnTrongSo([["completed", 95], ["cancelled", 5]], key, "trangthai"),
        taoBoi: nguoiBan.uid,
      });
    }
  } else {
    // Quán cà phê: TRỤC CHÍNH LÀ ĐƠN TẠI QUẦY. Mỗi đơn là một bàn: đồ uống theo
    // đầu người, cộng đồ ăn / bánh tuỳ khung giờ.
    const doUong = matHangKeHoach.filter((m) => THUC_DON_CAFE.some((x) => x[0] === m.ten));
    const doAn = matHangKeHoach.filter((m) => DO_AN_CAFE.some((x) => x[0] === m.ten));
    const banh = matHangKeHoach.filter((m) => BANH_CAFE.some((x) => x[0] === m.ten));
    const canDoUong = doUong.map((m) => [m.ten, m.trongSo]);
    const canDoAn = doAn.map((m) => [m.ten, m.trongSo]);
    const canBanh = banh.map((m) => [m.ten, m.trongSo]);
    const lichTheoNgay = new Map();
    for (const l of lichHen) {
      if (l.trangThai !== "done") continue;
      const ng = soToNgay(+l.batDau + 7 * 3600000);
      if (!lichTheoNgay.has(ng)) lichTheoNgay.set(ng, []);
      lichTheoNgay.get(ng).push(l);
    }

    for (let ngay = BAT_DAU; ngay <= HOM_NAY; ngay = themNgay(ngay, 1)) {
      const d = thuCua(ngay);
      const soDon = cauHinh.quyMo.donMoiNgay + (d === 0 || d === 6 ? cauHinh.quyMo.donCuoiTuanThem : 0)
        + nnInt(0, cauHinh.quyMo.donDaoDong, ngay, "daodongdon");
      const datBanHomNay = (lichTheoNgay.get(ngay) ?? []).slice();
      const phucVuHomNay = theoNghe("phucvu", "phache").filter((n) => coMat(n, ngay));
      const bepHomNay = theoNghe("beptruong", "bepho", "phubep").filter((n) => coMat(n, ngay));
      const quayHomNay = theoNghe("thungan", "quanly").filter((n) => coMat(n, ngay));
      if (phucVuHomNay.length === 0 || quayHomNay.length === 0) continue;

      for (let k = 0; k < soDon; k++) {
        const key = `${ngay}:don${k}`;
        // Khung giờ: sáng cà phê, trưa cơm, chiều trà bánh, tối nhóm bạn.
        const khung = nnTrongSo([["sang", 30], ["trua", 22], ["chieu", 26], ["toi", 22]], key, "khung");
        const gioBatDau = { sang: 7 * 60, trua: 11 * 60, chieu: 14 * 60 + 30, toi: 18 * 60 }[khung];
        const gioKetThuc = { sang: 11 * 60, trua: 14 * 60 + 30, chieu: 18 * 60, toi: 22 * 60 }[khung];
        const luc = gioVN(ngay, nnInt(gioBatDau, gioKetThuc - 10, key, "gio"));
        const soNguoi = nnTrongSo([[1, 10], [2, 26], [3, 24], [4, 20], [5, 12], [6, 8]], key, "songuoi");
        const phucVu = nnChon(phucVuHomNay, key, "phucvu");
        const quay = nnChon(quayHomNay, key, "quay");

        // Đồ uống — gom món trùng thành một dòng có qty > 1, đúng cách quán in bill.
        const demMon = new Map();
        for (let p = 0; p < soNguoi; p++) {
          const ten = nnTrongSo(canDoUong, key, `uong${p}`);
          demMon.set(ten, (demMon.get(ten) ?? 0) + 1);
        }
        const dong = [];
        for (const [ten, sl] of demMon) {
          const m = doUong.find((x) => x.ten === ten);
          dong.push({ item: m.id, qty: sl, donGia: m.gia, giam: 0, lich: null, lamBoi: phucVu.uid });
        }
        // Đồ ăn — bữa trưa gần như bàn nào cũng gọi; hoa hồng dòng đồ ăn về bếp.
        const tyLeAn = { sang: 0.42, trua: 0.86, chieu: 0.28, toi: 0.52 }[khung];
        if (nn(key, "goian") < tyLeAn && bepHomNay.length > 0) {
          const soPhan = soNguoi >= 4 ? nnInt(1, 3, key, "sophan") : nnInt(1, 2, key, "sophan");
          for (let p = 0; p < soPhan; p++) {
            const ten = nnTrongSo(canDoAn, key, `an${p}`);
            const m = doAn.find((x) => x.ten === ten);
            const daCo = dong.find((x) => x.item === m.id);
            if (daCo) { daCo.qty += 1; continue; }
            dong.push({ item: m.id, qty: 1, donGia: m.gia, giam: 0, lich: null, lamBoi: nnChon(bepHomNay, key, `bep${p}`).uid });
          }
        }
        // Bánh ngọt ăn kèm.
        if (nn(key, "goibanh") < { sang: 0.30, trua: 0.14, chieu: 0.42, toi: 0.26 }[khung]) {
          const ten = nnTrongSo(canBanh, key, "banh");
          const m = banh.find((x) => x.ten === ten);
          dong.push({ item: m.id, qty: nn(key, "slbanh") < 0.75 ? 1 : 2, donGia: m.gia, giam: 0, lich: null, lamBoi: phucVu.uid });
        }
        // Giảm giá thành viên — 8% số bàn được giảm 10% trên một dòng đồ uống.
        if (nn(key, "giam") < 0.08 && dong.length > 0) {
          const x = dong[0];
          x.giam = Math.round((x.qty * x.donGia * 0.1) / 1000) * 1000;
        }
        // Bàn có đặt trước thì gắn đơn về đúng ca đặt bàn đó.
        const lichGan = datBanHomNay.length > 0 && nn(key, "gandatban") < 0.6 ? datBanHomNay.pop() : null;

        // Hôm nay còn vài bàn đang ngồi (chưa thu tiền) — đó mới là quán đang mở cửa.
        const trangThai = ngay === HOM_NAY
          ? nnTrongSo([["completed", 78], ["confirmed", 8], ["draft", 10], ["cancelled", 4]], key, "trangthai")
          : nnTrongSo([["completed", 96], ["cancelled", 4]], key, "trangthai");

        donHang.push({
          id: uuid5(`${T}:don:${MA_ME}:${++sttDon}`),
          khach: (lichGan ? { id: lichGan.khach } : (nn(key, "ruot") < 0.58 ? nnChon(khachRuot, key, "khach") : nnChon(moiKhach, key, "khach"))).id,
          lich: lichGan?.id ?? null, luc, dong, trangThai, taoBoi: quay.uid,
        });
      }
    }
  }

  // ── 6) PHIẾU HOÀN ────────────────────────────────────────────────────────
  // `qty` ÂM là luật của `order_lines_sign_guard`, và KHÔNG có phiếu thu:
  // `order_payments_guard` chặn thu vào đơn có tổng âm.
  const donCoSanPham = donHang.filter(
    (d) => d.trangThai === "completed" && d.dong.some((x) => sanPham.some((s) => s.id === x.item)));
  const phieuHoan = [];
  for (let i = 0; i < cauHinh.quyMo.phieuHoan && donCoSanPham.length > 0; i++) {
    const goc = donCoSanPham[Math.floor((i * donCoSanPham.length) / cauHinh.quyMo.phieuHoan)];
    if (!goc) continue;
    const dongSp = goc.dong.find((x) => sanPham.some((s) => s.id === x.item));
    // Kẹp trong [đơn gốc + 2 giờ, hôm qua]: phiếu hoàn đề ngày TRƯỚC đơn gốc là
    // một chứng từ không thể tồn tại.
    const luc = new Date(Math.max(goc.luc.getTime() + 2 * 3600000,
      Math.min(goc.luc.getTime() + 2 * NGAY_MS, ngayToSo(HOM_NAY) - NGAY_MS)));
    phieuHoan.push({
      id: uuid5(`${T}:hoan:${MA_ME}:${i + 1}`),
      goc: goc.id, khach: goc.khach, luc,
      dong: [{ item: dongSp.item, qty: -1, donGia: dongSp.donGia, giam: 0, lich: null, lamBoi: null }],
      taoBoi: goc.taoBoi,
    });
  }

  // ── DỰ BÁO QUY MÔ (chạy được cả ở chế độ CHỈ TÍNH) ───────────────────────
  const doanhThuTheoThang = new Map();
  for (const d of donHang) {
    if (d.trangThai !== "completed") continue;
    const thang = soToNgay(+d.luc + 7 * 3600000).slice(0, 7);
    const tong = d.dong.reduce((s, x) => s + x.qty * x.donGia - x.giam, 0);
    doanhThuTheoThang.set(thang, (doanhThuTheoThang.get(thang) ?? 0) + tong);
  }
  log(`\n  ── DỰ BÁO TỪ KẾ HOẠCH (trước khi ghi) ──`);
  log(`     lịch hẹn ${lichHen.length} · đơn ${donHang.length} (+${phieuHoan.length} phiếu hoàn)` +
    ` · dòng đơn ${donHang.reduce((s, d) => s + d.dong.length, 0)}`);
  for (const thang of [...doanhThuTheoThang.keys()].sort()) {
    const tienT = doanhThuTheoThang.get(thang);
    const cut = thang === "2026-08" ? "  (tháng chạy dở, tới 20/08)" : "";
    log(`     ${thang}  ${tien(tienT).padStart(15)}đ   lương/doanh thu ${((quyLuongThang / tienT) * 100).toFixed(1).padStart(5)}%${cut}`);
  }
  const thangTron = [...doanhThuTheoThang.keys()].sort().filter((k) => k !== "2026-08");
  if (thangTron.length) {
    const tb = thangTron.reduce((s, k) => s + doanhThuTheoThang.get(k), 0) / thangTron.length;
    log(`     ── tháng TRÒN: doanh thu TB ${tien(Math.round(tb))}đ/tháng · lương cứng ${((quyLuongThang / tb) * 100).toFixed(1)}%`);
  }
  if (CHI_TINH) { log(`\n  [CHỈ TÍNH] Không ghi gì vào CSDL.`); return; }

  // ══════════════════════════════════════════════════════════════════════════
  // GHI — PHẦN KINH DOANH
  // ══════════════════════════════════════════════════════════════════════════
  await c.query("begin");

  // Toạ độ tiệm — gộp vào jsonb, KHÔNG ghi đè cả ô `settings`.
  await c.query(
    `update public.tenants
        set settings = coalesce(settings, '{}'::jsonb)
                     || jsonb_build_object('workLocation', jsonb_build_object('lat', $2::numeric, 'lng', $3::numeric))
      where id = $1
        and coalesce(settings->'workLocation'->>'lat', '') is distinct from $2::text`,
    [T, cauHinh.viTri.lat, cauHinh.viTri.lng]);

  // Mặt hàng — neo bằng khoá duy nhất tự nhiên (tenant_id, name).
  const nMatHang = await chenNhieu("items",
    ["id", "tenant_id", "name", "kind", "price_vnd", "unit", "duration_minutes", "group_name", "status", "sort_order"],
    matHangKeHoach.map((m) => [m.id, T, m.ten, m.loai, m.gia, m.donVi, m.phut, m.nhom, "active", m.thuTu]),
    300, "(tenant_id, name)");
  // Đọc lại id thật: mặt hàng có thể đã tồn tại với id khác từ trước.
  const { rows: matHangDb } = await c.query(
    `select id, name, kind, price_vnd from public.items where tenant_id = $1`, [T]);
  const idTheoTen = new Map(matHangDb.map((r) => [r.name, r.id]));
  for (const m of matHangKeHoach) m.id = idTheoTen.get(m.ten) ?? m.id;
  // Đồng bộ lại id trong kế hoạch đơn/lịch (nếu mặt hàng đã có sẵn id khác).
  const idCu = new Map(cauHinh.matHang.map(([, ten]) => [uuid5(`${T}:mathang:${ten}`), idTheoTen.get(ten)]));
  const doiId = (x) => idCu.get(x) ?? x;
  for (const l of lichHen) if (l.item) l.item = doiId(l.item);
  for (const d of [...donHang, ...phieuHoan]) for (const x of d.dong) x.item = doiId(x.item);

  // Giá vốn — PHẢI ghi trước dòng đơn (xem chú thích đầu file).
  const nGiaVon = await chenNhieu("item_costs", ["item_id", "tenant_id", "cost_vnd"],
    matHangKeHoach.filter((m) => m.von != null).map((m) => [m.id, T, m.von]), 300, "(item_id)");

  const nTaiNguyen = await chenNhieu("resources", ["id", "tenant_id", "name", "kind", "is_active"],
    taiNguyenKeHoach.map((r) => [r.id, T, r.ten, r.kind, true]), 300, "(tenant_id, name)");
  const { rows: tnDb } = await c.query(`select id, name from public.resources where tenant_id = $1`, [T]);
  const tnIdTheoTen = new Map(tnDb.map((r) => [r.name, r.id]));
  const tnIdCu = new Map(taiNguyenKeHoach.map((r) => [r.id, tnIdTheoTen.get(r.ten)]));
  for (const l of lichHen) if (l.taiNguyen) l.taiNguyen = tnIdCu.get(l.taiNguyen) ?? l.taiNguyen;

  const nNcc = await chenNhieu("suppliers", ["id", "tenant_id", "name", "phone", "note"],
    nhaCungCapKeHoach.map((n) => [n.id, T, n.ten, n.sdt, n.ghiChu]));

  // Khách — vào sổ là `lead`; ai thật sự có đơn đã xong mới nâng lên `customer`.
  const canChenKhach = khachMoi.filter((k) => !theoSdt.has(k.e164));
  const nKhach = await chenNhieu("contacts",
    ["id", "tenant_id", "full_name", "phone", "phone_e164", "province", "lifecycle", "created_at", "updated_at"],
    canChenKhach.map((k) => [k.id, T, k.ten, k.sdt, k.e164, k.tinh, "lead", k.taoLuc, k.taoLuc]));

  // Lịch hẹn — lọc bỏ ca đã có để lần chạy hai không đụng ràng buộc EXCLUDE.
  const daCoLich = await daCo("appointments", lichHen.map((l) => l.id));
  const lichChen = lichHen.filter((l) => !daCoLich.has(l.id));
  const nLich = await chenNhieu("appointments",
    ["id", "tenant_id", "contact_id", "staff_user_id", "resource_id", "item_id", "start_at", "end_at",
      "status", "price_vnd", "note", "source", "cancel_reason", "created_by", "created_at", "updated_at"],
    lichChen.map((l) => [l.id, T, l.khach, l.nhanVien, l.taiNguyen, l.item, l.batDau, l.ketThuc,
      l.trangThai, l.gia, l.note, l.nguon, l.lyDoHuy, l.taoBoi,
      new Date(l.batDau.getTime() - 2 * NGAY_MS), l.batDau]));

  // Đơn — chèn `draft` trước, dòng hàng + phiếu thu sau, RỒI MỚI chuyển trạng
  // thái. Trình tự này là bắt buộc (xem khối chú thích đầu file).
  const tatCaDon = [...donHang, ...phieuHoan.map((p) => ({ ...p, hoan: true }))];
  const daCoDon = await daCo("orders", tatCaDon.map((d) => d.id));
  const donChen = tatCaDon.filter((d) => !daCoDon.has(d.id));
  const nDon = await chenNhieu("orders",
    ["id", "tenant_id", "contact_id", "kind", "parent_order_id", "status",
      "source_appointment_id", "created_by", "created_at", "updated_at"],
    donChen.map((d) => [d.id, T, d.khach, d.hoan ? "return" : "order", d.goc ?? null, "draft",
      d.lich ?? null, d.taoBoi, d.luc, d.luc]));

  const dongDon = [];
  const phieuThu = [];
  for (const d of donChen) {
    d.dong.forEach((x, i) => dongDon.push(
      [uuid5(`${T}:dong:${d.id}:${i}`), T, d.id, x.item, x.lich, x.lamBoi, x.qty, x.donGia, x.giam, i]));
    if (d.hoan) continue; // phiếu hoàn không có phiếu thu
    const tong = d.dong.reduce((s, x) => s + x.qty * x.donGia - x.giam, 0);
    if (tong <= 0) continue;
    if (d.trangThai === "completed") {
      phieuThu.push([uuid5(`${T}:thu:${d.id}:0`), T, d.id,
        nnTrongSo(cauHinh.cachThu, d.id, "cachthu"), tong, d.taoBoi, d.luc, uuid5(`${T}:thu:${d.id}:0`)]);
    } else if (d.trangThai === "confirmed") {
      // Đã chốt nhưng mới đặt cọc — nuôi đúng câu hỏi "ai còn nợ tiền".
      // Kẹp trong [1đ, tổng đơn]: `order_payments_guard` chặn thu vượt tổng đơn.
      const coc = Math.min(tong, Math.max(50000, Math.round((tong * 0.4) / 10000) * 10000));
      phieuThu.push([uuid5(`${T}:thu:${d.id}:0`), T, d.id, "cash", coc, d.taoBoi, d.luc,
        uuid5(`${T}:thu:${d.id}:0`)]);
    }
  }
  const nDong = await chenNhieu("order_lines",
    ["id", "tenant_id", "order_id", "item_id", "appointment_id", "performed_by_user_id",
      "qty", "unit_price_vnd", "discount_vnd", "sort_order"], dongDon);
  const nThu = await chenNhieu("order_payments",
    ["id", "tenant_id", "order_id", "method", "amount_vnd", "received_by", "received_at", "provider_ref"],
    phieuThu);

  // ĐÂY là chỗ trigger sinh kho / sổ quỹ / hoa hồng / hạng khách.
  const canConfirm = donChen.filter((d) => d.hoan || d.trangThai === "confirmed" || d.trangThai === "completed");
  await doiTrangThai(canConfirm.map((d) => d.id), "confirmed");
  const canComplete = donChen.filter((d) => d.hoan || d.trangThai === "completed");
  await doiTrangThai(canComplete.map((d) => d.id), "completed");
  for (const d of donChen.filter((x) => !x.hoan && x.trangThai === "cancelled")) {
    await c.query(`update public.orders set status='cancelled', cancel_reason=$2, cancelled_by=$3 where id=$1`,
      [d.id, nnChon(LY_DO_HUY_DON, d.id, "lydohuy"), d.taoBoi]);
  }

  // ── NHẬP HÀNG ────────────────────────────────────────────────────────────
  // Mấy nghìn đơn vừa ghi đã RÚT hàng khỏi kho. Không nhập vào thì tiệm mẫu
  // hiện tồn kho ÂM — một tiệm không thể bán thứ nó chưa từng mua. Đây là dọn
  // đúng phần mình vừa làm ra. Vẫn đi đúng đường sản phẩm:
  // `purchases_sinh_dong_kho` cũng là AFTER UPDATE OF status.
  const banTheoThang = new Map();
  for (const d of donHang) {
    if (d.trangThai !== "completed") continue;
    const thang = soToNgay(+d.luc + 7 * 3600000).slice(0, 7);
    for (const x of d.dong) {
      if (!sanPham.some((s) => s.id === x.item)) continue;
      const k = `${thang}|${x.item}`;
      banTheoThang.set(k, (banTheoThang.get(k) ?? 0) + x.qty);
    }
  }
  const nccId = nhaCungCapKeHoach[0].id;
  const phieuNhap = [];
  const dongNhap = [];
  for (const thang of [...new Set([...banTheoThang.keys()].map((k) => k.split("|")[0]))].sort()) {
    const id = uuid5(`${T}:nhap:${MA_ME}:${thang}`);
    const [y, m] = thang.split("-").map(Number);
    const nguoiNhap = (theoNghe("quanly")[0] ?? NV[0]).uid;
    phieuNhap.push([id, T, nccId, "draft", `Nhập hàng tháng ${m}/${y}`,
      VN(y, m, 1, 8, 0), nguoiNhap, VN(y, m, 1, 8, 0), VN(y, m, 1, 8, 0)]);
    sanPham.forEach((sp, i) => {
      const ban = banTheoThang.get(`${thang}|${sp.id}`) ?? 0;
      // Mua dư ~22% và làm tròn lên chục — tiệm mua theo thùng, không mua lẻ
      // đúng bằng số sẽ bán. Phần dư chính là tồn kho cuối kỳ.
      const sl = Math.max(10, Math.ceil((ban * 1.22) / 10) * 10);
      // Giá nhập = ĐÚNG giá vốn đang khai: trigger sẽ ghi đè `item_costs` bằng
      // `don_gia_mua / he_so`, đặt lệch là tự tay đổi lãi gộp của tiệm mẫu.
      dongNhap.push([uuid5(`${T}:nhapdong:${MA_ME}:${thang}:${sp.id}`), T, id, sp.id, sl, 1, sp.von, i]);
    });
  }
  const daCoNhap = await daCo("purchases", phieuNhap.map((p) => p[0]));
  const nhapChen = phieuNhap.filter((p) => !daCoNhap.has(p[0]));
  const idNhapChen = new Set(nhapChen.map((p) => p[0]));
  const nNhap = await chenNhieu("purchases",
    ["id", "tenant_id", "supplier_id", "status", "note", "received_at", "created_by", "created_at", "updated_at"],
    nhapChen);
  const nDongNhap = await chenNhieu("purchase_lines",
    ["id", "tenant_id", "purchase_id", "item_id", "qty_mua", "he_so", "don_gia_mua", "sort_order"],
    dongNhap.filter((d) => idNhapChen.has(d[2])));
  for (const id of idNhapChen) {
    await c.query(`update public.purchases set status = 'completed' where id = $1`, [id]);
  }

  // ── KÉO MỐC PHIẾU QUỸ DO TRIGGER SINH ────────────────────────────────────
  // Không thêm dòng, không đổi số — chỉ đưa `created_at` về đúng ngày chứng từ.
  const { rowCount: nQuy } = await c.query(
    `update public.cash_entries ce set created_at = op.received_at
       from public.order_payments op
      where ce.order_payment_id = op.id and ce.tenant_id = $1
        and ce.created_at is distinct from op.received_at`, [T]);
  // SỔ KHO thì KHÔNG kéo mốc được, và đó là chủ ý của kho này:
  // `stock_moves_immutable_guard` chặn mọi UPDATE/DELETE. Dòng kho do trigger
  // sinh mang mốc LÚC CHẠY SCRIPT, không phải ngày bán. Tồn kho hiện tại vẫn
  // ĐÚNG; chỉ báo cáo kho theo ngày là dồn về hôm nay. Không lách bằng cách
  // chèn thẳng `stock_moves` với ngày đẹp — đó là hai nguồn nói một việc.

  const { rowCount: nKhachThat } = await c.query(
    `update public.contacts ct set lifecycle = 'customer'
      where ct.tenant_id = $1 and ct.lifecycle <> 'customer'
        and exists (select 1 from public.orders o
                     where o.contact_id = ct.id and o.status = 'completed'
                       and o.kind = 'order' and o.deleted_at is null)`, [T]);
  const { rowCount: nMoc } = await c.query(
    `update public.contacts ct set last_interaction_at = m.luc
       from (select x.contact_id, max(x.luc) luc from (
               select contact_id, start_at luc from public.appointments
                 where tenant_id = $1 and deleted_at is null and start_at <= now()
               union all
               select contact_id, created_at from public.orders
                 where tenant_id = $1 and deleted_at is null
             ) x group by x.contact_id) m
      where ct.id = m.contact_id and ct.tenant_id = $1
        and ct.last_interaction_at is distinct from m.luc`, [T]);

  await c.query("commit");
  log(`\n  ── ĐÃ GHI: KINH DOANH ──`);
  log(`     mặt hàng ${nMatHang} (+${nGiaVon} giá vốn) · tài nguyên ${nTaiNguyen} · nhà cung cấp ${nNcc}`);
  log(`     khách ${nKhach} · lịch hẹn ${nLich} · đơn ${nDon} · dòng đơn ${nDong} · phiếu thu ${nThu}`);
  log(`     phiếu nhập ${nNhap} (${nDongNhap} dòng) · kéo mốc ${nQuy} phiếu quỹ · ${nMoc} mốc khách`);
  log(`     nâng lên "khách hàng": ${nKhachThat}`);

  // ══════════════════════════════════════════════════════════════════════════
  // GHI — PHẦN NHÂN SỰ (chạy SAU đơn hàng, để hoa hồng đã đủ rồi mới chốt lương)
  // ══════════════════════════════════════════════════════════════════════════
  const kq = await nhanSu({ T, slug, cauHinh, NV, keHoachNghi, ngayNghi, chuTiem, quanTri });

  // ══════════════════════════════════════════════════════════════════════════
  // NGHIỆM THU
  // ══════════════════════════════════════════════════════════════════════════
  const sau = await dem();
  const NGUON = {
    items: "script ghi", resources: "script ghi", contacts: "script ghi",
    appointments: "script ghi", orders: "script ghi", order_lines: "script ghi",
    order_payments: "script ghi", purchases: "script ghi", purchase_lines: "script ghi",
    suppliers: "script ghi",
    stock_moves: "TRIGGER", commission_entries: "TRIGGER",
    cash_entries: "TRIGGER (bán) + script (lương, nộp két)",
    shifts: "script ghi", attendance_punches: "script ghi", timesheets: "script ghi",
    leave_requests: "script ghi", payroll_periods: "script ghi", payslips: "script ghi",
    payslip_lines: "script ghi", shift_closings: "script ghi",
  };
  log(`\n  ── ĐỐI CHỨNG TRƯỚC / SAU ──`);
  log(`     bảng                     trước       sau      tăng   nguồn`);
  for (const b of BANG_DEM) {
    log(`     ${b.padEnd(22)}${String(truoc[b]).padStart(6)}${String(sau[b]).padStart(10)}${String(sau[b] - truoc[b]).padStart(10)}   ${NGUON[b]}`);
  }

  // ĐỐI CHỨNG 2 — đơn đã xong mà tiền thu ≠ tổng dòng đơn.
  const { rows: lech } = await c.query(
    `select count(*)::int n from (
       select o.id,
              coalesce((select sum(l.line_total_vnd) from public.order_lines l where l.order_id = o.id), 0) tong,
              coalesce((select sum(p.amount_vnd) from public.order_payments p where p.order_id = o.id), 0) thu
         from public.orders o
        where o.tenant_id = $1 and o.status = 'completed' and o.kind = 'order' and o.deleted_at is null
     ) x where x.tong <> x.thu`, [T]);
  // ĐỐI CHỨNG 1 — mọi phiếu quỹ loại `sale` đều do trigger sinh (có order_payment_id).
  const { rows: quySale } = await c.query(
    `select count(*)::int tong, count(*) filter (where order_payment_id is null)::int mo_coi
       from public.cash_entries where tenant_id = $1 and category = 'sale' and deleted_at is null`, [T]);
  const { rows: hh } = await c.query(
    `select count(*)::int dong, count(distinct employee_id)::int nguoi, coalesce(sum(amount_vnd),0)::bigint tienhh
       from public.commission_entries where tenant_id = $1`, [T]);
  const { rows: pb } = await c.query(
    `select status, count(*)::int n from public.appointments where tenant_id = $1 group by 1 order by 1`, [T]);
  log(`\n  ── KIỂM CHÉO ──`);
  log(`     [ĐC1] phiếu quỹ 'sale': ${quySale[0].tong} dòng · mồ côi (không nối phiếu thu) ${quySale[0].mo_coi}` +
    ` ${quySale[0].mo_coi === 0 ? "✔ 100% do trigger" : "✖ CÓ DÒNG TỰ CHÈN"}`);
  log(`     [ĐC1] hoa hồng: ${hh[0].dong} dòng · ${hh[0].nguoi} người · ${tien(hh[0].tienhh)}đ` +
    ` ${hh[0].dong > 0 ? "✔" : "✖ PHÉP NỐI HOA HỒNG ĐANG HỎNG"}`);
  log(`     [ĐC2] đơn đã xong mà thu ≠ tổng dòng: ${lech[0].n} ${lech[0].n === 0 ? "✔" : "✖ LỆCH"}`);

  // ĐỐI CHỨNG 3 — tồn kho không âm; không lịch hẹn nào chồng giờ cùng một người.
  const { rows: am } = await c.query(
    `select i.name, coalesce(sum(sm.qty),0)::int ton
       from public.items i left join public.stock_moves sm on sm.item_id = i.id
      where i.tenant_id = $1 and i.kind = 'product'
      group by 1 having coalesce(sum(sm.qty),0) < 0 order by 2`, [T]);
  const { rows: chongNguoi } = await c.query(
    `select count(*)::int n from public.appointments a join public.appointments b
        on b.tenant_id = a.tenant_id and b.staff_user_id = a.staff_user_id and b.id > a.id
       and tstzrange(a.start_at, a.end_at) && tstzrange(b.start_at, b.end_at)
      where a.tenant_id = $1 and a.deleted_at is null and b.deleted_at is null`, [T]);
  const { rows: chongTn } = await c.query(
    `select count(*)::int n from public.appointments a join public.appointments b
        on b.tenant_id = a.tenant_id and b.resource_id = a.resource_id and b.id > a.id
       and tstzrange(a.start_at, a.end_at) && tstzrange(b.start_at, b.end_at)
      where a.tenant_id = $1 and a.resource_id is not null and a.deleted_at is null and b.deleted_at is null`, [T]);
  log(`     [ĐC3] mặt hàng tồn ÂM: ${am.length} ${am.length === 0 ? "✔" : "✖ " + am.map((r) => `${r.name}=${r.ton}`).join(" · ")}`);
  log(`     [ĐC3] lịch hẹn chồng giờ CÙNG NGƯỜI: ${chongNguoi[0].n} ${chongNguoi[0].n === 0 ? "✔" : "✖"}` +
    ` · chồng giờ CÙNG TÀI NGUYÊN: ${chongTn[0].n} ${chongTn[0].n === 0 ? "✔" : "✖"}`);
  log(`     lịch hẹn theo trạng thái: ${pb.map((r) => `${r.status}=${r.n}`).join(" · ")}`);

  // ĐỐI CHỨNG 4 — hoa hồng trên phiếu lương khớp sổ hoa hồng từng tháng.
  const { rows: doiChieuHh } = await c.query(
    `select to_char(k.period,'YYYY-MM') ky, k.status,
            coalesce((select sum(h.amount_vnd) from public.commission_entries h
                       where h.tenant_id = k.tenant_id and h.amount_vnd <> 0
                         and h.earned_on >= k.period and h.earned_on < (k.period + interval '1 month')), 0)::bigint so_hh,
            coalesce((select sum(l.amount_vnd) from public.payslip_lines l
                        join public.payslips p on p.id = l.payslip_id
                       where p.period_id = k.id and l.source_type = 'commission'), 0)::bigint tren_phieu
       from public.payroll_periods k where k.tenant_id = $1 order by k.period`, [T]);
  log(`\n  ── [ĐC4] HOA HỒNG: SỔ vs PHIẾU LƯƠNG ──`);
  let lechHh = 0;
  for (const r of doiChieuHh) {
    const ok = BigInt(r.so_hh) === BigInt(r.tren_phieu);
    if (!ok) lechHh++;
    log(`     ${nhanKy(r.ky + "-01")} (${r.status.padEnd(6)}) sổ ${tien(r.so_hh).padStart(14)}đ · phiếu ${tien(r.tren_phieu).padStart(14)}đ  ${ok ? "✔ khớp" : "✖ LỆCH " + tien(BigInt(r.so_hh) - BigInt(r.tren_phieu)) + "đ"}`);
  }

  // ── TIỆM CÓ LÃI KHÔNG ────────────────────────────────────────────────────
  // Phép kiểm ở TẦNG KINH DOANH, không phải tầng bảng biểu: dữ liệu có thể khớp
  // từng ô mà vẫn kể một câu chuyện sai.
  const { rows: thang } = await c.query(
    `select to_char(o.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') ky,
            count(distinct o.id)::int don, sum(l.line_total_vnd)::bigint doanhthu,
            sum(coalesce(lc.cost_vnd,0) * l.qty)::bigint giavon
       from public.orders o
       join public.order_lines l on l.order_id = o.id
       left join public.order_line_costs lc on lc.order_line_id = l.id
      where o.tenant_id = $1 and o.status = 'completed' and o.deleted_at is null
      group by 1 order by 1`, [T]);
  const { rows: hhThang } = await c.query(
    `select to_char(earned_on,'YYYY-MM') ky, coalesce(sum(amount_vnd),0)::bigint tienhh
       from public.commission_entries where tenant_id = $1 group by 1`, [T]);
  const hhCua = new Map(hhThang.map((r) => [r.ky, Number(r.tienhh)]));
  log(`\n  ── TIỆM CÓ LÃI KHÔNG ──`);
  log(`     quỹ lương cứng ${dangLamHomNay.length} người: ${tien(quyLuongThang)}đ/tháng`);
  log(`     kỳ        đơn        doanh thu        giá vốn      hoa hồng   lương/DT  (lương+HH)/DT`);
  const kyTron = [];
  for (const r of thang) {
    const dt = Number(r.doanhthu);
    const hhK = hhCua.get(r.ky) ?? 0;
    const cut = r.ky === "2026-08" || r.ky === "2026-05" && BAT_DAU.slice(0, 7) !== "2026-05";
    if (!cut) kyTron.push({ dt, hhK });
    log(`     ${r.ky}  ${String(r.don).padStart(6)}  ${tien(dt).padStart(15)}đ ${tien(r.giavon).padStart(14)}đ ${tien(hhK).padStart(13)}đ` +
      `  ${((quyLuongThang / dt) * 100).toFixed(1).padStart(6)}%  ${(((quyLuongThang + hhK) / dt) * 100).toFixed(1).padStart(7)}%` +
      `${r.ky === "2026-08" ? "  (tháng chạy dở)" : ""}`);
  }
  if (kyTron.length) {
    const tbDt = kyTron.reduce((s, x) => s + x.dt, 0) / kyTron.length;
    const tbHh = kyTron.reduce((s, x) => s + x.hhK, 0) / kyTron.length;
    const tyLe = (quyLuongThang / tbDt) * 100;
    const tyLeTong = ((quyLuongThang + tbHh) / tbDt) * 100;
    log(`     ── tháng TRÒN: doanh thu TB ${tien(Math.round(tbDt))}đ/tháng`);
    log(`        lương cứng/doanh thu ${tyLe.toFixed(1)}% ${tyLe >= 28 && tyLe <= 40 ? "✔ đúng mặt bằng ngành" : "✖ LỆCH MẶT BẰNG"}`);
    log(`        (lương + hoa hồng)/doanh thu ${tyLeTong.toFixed(1)}% ${tyLeTong <= 42 ? "✔" : "✖ NHÂN CÔNG QUÁ NẶNG"}`);
    log(`        lãi gộp sau nhân công: ${tien(Math.round(tbDt - quyLuongThang - tbHh))}đ/tháng ${tbDt - quyLuongThang - tbHh > 0 ? "✔ có lãi" : "✖ ĐANG LỖ"}`);
  }
  log(`\n  ── NHÂN SỰ ──`);
  log(`     ${kq}`);
  if (lechHh > 0) log(`\n  ⚠️  ${lechHh} kỳ lệch hoa hồng — xem hướng dẫn MO_KHOA ở đầu file.`);
}

// ══════════════════════════════════════════════════════════════════════════
// PHẦN NHÂN SỰ
// ══════════════════════════════════════════════════════════════════════════
async function nhanSu({ T, slug, cauHinh, NV, keHoachNghi, ngayNghi, chuTiem, quanTri }) {
  const GIO_CA = cauHinh.caLam;
  const VI_TRI = cauHinh.viTri;

  // ── 1. Đơn nghỉ phép ─────────────────────────────────────────────────────
  let themNghi = 0;
  for (const d of keHoachNghi) {
    const { rowCount } = await c.query(
      `insert into public.leave_requests
         (tenant_id, employee_id, from_date, to_date, kind, reason, status, decided_by, decided_at)
       select $1,$2,$3::date,$4::date,$5,$6,$7,$8,$9::timestamptz
        where not exists (select 1 from public.leave_requests
                           where tenant_id = $1 and employee_id = $2 and from_date = $3::date)`,
      [T, d.nv.id, d.tu, d.den, d.loai, d.ly, d.trangThai, d.boi, d.luc]);
    themNghi += rowCount;
  }
  // Đọc lại ngày nghỉ ĐÃ DUYỆT từ CSDL để dùng cả đơn có từ lần chạy trước.
  const { rows: nghiRows } = await c.query(
    `select employee_id, to_char(from_date,'YYYY-MM-DD') tu, to_char(to_date,'YYYY-MM-DD') den
       from public.leave_requests where tenant_id = $1 and status = 'approved'`, [T]);
  const nghiThat = new Set(ngayNghi);
  for (const r of nghiRows) for (let d = r.tu; d <= r.den; d = themNgay(d, 1)) nghiThat.add(`${r.employee_id}|${d}`);

  // ── 2. Xếp ca ────────────────────────────────────────────────────────────
  // Duyệt cho nghỉ mà vẫn xếp ca là hai màn nói hai chuyện ⇒ ngày nghỉ đã duyệt
  // thành ô 'off' có ghi chú.
  const caEmp = [], caNgay = [], caLoai = [], caNote = [];
  const lichCa = new Map();
  for (const nv of NV) {
    for (let d = BAT_DAU; d <= HOM_NAY; d = themNgay(d, 1)) {
      if (nv.vao && d < nv.vao) continue;
      if (nv.nghiViec && d > nv.nghiViec) continue;
      let k = caTrongNgay(slug, nv, d);
      let note = null;
      if (nghiThat.has(`${nv.id}|${d}`)) { k = "off"; note = "Nghỉ phép đã duyệt"; }
      lichCa.set(`${nv.id}|${d}`, k);
      caEmp.push(nv.id); caNgay.push(d); caLoai.push(k); caNote.push(note);
    }
  }
  await c.query(
    `insert into public.shifts (tenant_id, employee_id, work_date, kind, note)
     select $1, x.emp, x.d, x.k, x.n from unnest($2::uuid[], $3::date[], $4::text[], $5::text[]) as x(emp, d, k, n)
     on conflict (tenant_id, employee_id, work_date) do update set kind = excluded.kind, note = excluded.note`,
    [T, caEmp, caNgay, caLoai, caNote]);

  // ── 3. Chấm công ─────────────────────────────────────────────────────────
  // Tháng ĐÃ chốt bảng công thì bỏ qua hẳn: `punch_locked_period_guard` chặn
  // ghi, và cũng KHÔNG nên ghi — đó là tháng đã khoá sổ.
  const { rows: daChotRows } = await c.query(
    `select employee_id, to_char(period,'YYYY-MM-DD') ky from public.timesheets
      where tenant_id = $1 and status = 'closed'`, [T]);
  const bangCongDaChot = new Set(daChotRows.map((r) => `${r.employee_id}|${r.ky}`));
  const LY_DO_NGOAI_VUNG = [
    "Đi mua đồ cho tiệm, chấm từ ngoài đường.",
    "Máy định vị lệch, đang đứng ở cổng sau.",
    "Kẹt xe, chấm ở đầu hẻm rồi đi bộ vào.",
    "Đưa khách ra bãi xe, quên chấm lúc còn trong tiệm.",
  ];
  const soNguoiGo = new Map();
  let soLanCham = 0, soLanCoLyDo = 0;
  for (const nv of NV) {
    for (const ky of KY) {
      if (bangCongDaChot.has(`${nv.id}|${ky}`)) continue;
      const cuoi = cuoiKy(ky);
      // Ghi lại từ đầu cho tháng còn nháp: xoá rồi dựng lại là cách duy nhất
      // chạy-lại-không-nhân-đôi trên bảng KHÔNG có khoá duy nhất.
      //
      // `not exists (...)` KHÔNG phải cho chắc ăn — nó là điều kiện BẮT BUỘC.
      // `punch_locked_period_guard` gom lần chấm về tháng bằng
      // `date_trunc('month', punched_at)`, tính theo MÚI GIỜ PHIÊN (UTC), chứ
      // không theo giờ Việt Nam. Ca sáng quán cà phê vào lúc 6h22 ngày mùng 1
      // rơi vào 23h22 ngày cuối THÁNG TRƯỚC theo UTC ⇒ chốt chặn soi vào bảng
      // công tháng trước. Tháng đó đã chốt thì cả XOÁ lẫn GHI lần chấm ấy đều
      // bị từ chối, và cả mẻ hỏng ở lần chạy thứ hai.
      // Nên câu xoá này dùng ĐÚNG phép gom của chốt chặn để chừa lại những lần
      // chấm thuộc tháng đã khoá — không lách bằng cách đổi múi giờ phiên, cũng
      // không tắt chốt chặn. Phần sinh lần chấm bên dưới chừa đúng bấy nhiêu.
      await c.query(
        `delete from public.attendance_punches p
          where p.tenant_id = $1 and p.employee_id = $2
            and p.punched_at >= $3::timestamptz and p.punched_at < $4::timestamptz
            and not exists (select 1 from public.timesheets t
                             where t.employee_id = p.employee_id
                               and t.period = date_trunc('month', p.punched_at)::date
                               and t.status = 'closed')`,
        [T, nv.id, gioVN(ky, 0), gioVN(themNgay(cuoi, 1), 0)]);
      const pAt = [], pKind = [], pLat = [], pLng = [], pDist = [], pLy = [];
      let tre = 0, phutTangCa = 0;
      for (let d = ky; d <= cuoi && d <= HOM_NAY; d = themNgay(d, 1)) {
        const k = lichCa.get(`${nv.id}|${d}`);
        if (!k || k === "off") continue;
        const g = GIO_CA[k];
        const laTre = nn(nv.id, d, "tre") < 0.06;
        const vao = g.vao + (laTre ? nnInt(12, 45, nv.id, d, "phuttre") : nnInt(-8, 7, nv.id, d, "jitter"));
        if (laTre) tre++;
        const themGio = nn(nv.id, d, "tangca") < 0.14;
        const ra = g.ra + (themGio ? nnInt(45, 125, nv.id, d, "phuttangca") : nnInt(-6, 18, nv.id, d, "jitter2"));
        if (ra - g.ra >= 30) phutTangCa += ra - g.ra;
        for (const [loai, phut] of [["in", vao], ["out", ra]]) {
          const moc = gioVN(d, phut);
          // Chừa đúng những lần chấm mà chốt chặn gom về một tháng ĐÃ CHỐT
          // (xem chú thích ở câu xoá trên). `tre` / `phutTangCa` vẫn cộng bình
          // thường: bỏ đếm chúng thì bảng công tháng 8 sẽ đổi số giữa hai lần
          // chạy, mà số công thì lại đọc từ CSDL — hai chỗ đá nhau ngay.
          if (bangCongDaChot.has(`${nv.id}|${moc.toISOString().slice(0, 8)}01`)) continue;
          // Ngoài vùng ~2,5% số lần chấm. `out_of_range` KHÔNG ghi ở đây —
          // trigger `attendance_set_flag()` tự quyết theo `distance_m`.
          const xa = nn(nv.id, d, loai, "xa") < 0.025;
          const met = xa ? nnInt(420, 1400, nv.id, d, loai, "met") : nnInt(3, 140, nv.id, d, loai, "met");
          const toaDo = toaDoCach(VI_TRI, met, nn(nv.id, d, loai, "goc") * 2 * Math.PI);
          const khoang = khoangCachM(VI_TRI, toaDo);
          const lyDo = khoang > BAN_KINH_M
            ? LY_DO_NGOAI_VUNG[nnInt(0, LY_DO_NGOAI_VUNG.length - 1, nv.id, d, loai, "ly")] : null;
          if (lyDo) soLanCoLyDo++;
          pAt.push(moc); pKind.push(loai);
          pLat.push(toaDo.lat); pLng.push(toaDo.lng); pDist.push(khoang); pLy.push(lyDo);
        }
      }
      if (pAt.length) {
        await c.query(
          `insert into public.attendance_punches
             (tenant_id, employee_id, punched_at, kind, lat, lng, distance_m, reason)
           select $1, $2, x.at, x.k, x.la, x.ln, x.di, x.ly
             from unnest($3::timestamptz[], $4::text[], $5::numeric[], $6::numeric[], $7::int[], $8::text[])
               as x(at, k, la, ln, di, ly)`,
          [T, nv.id, pAt, pKind, pLat, pLng, pDist, pLy]);
        soLanCham += pAt.length;
      }
      soNguoiGo.set(`${nv.id}|${ky}`, { tre, phutTangCa });
    }
  }

  // ── 4. Bảng công ─────────────────────────────────────────────────────────
  // `work_days` và `flag_count` HỎI CSDL, không tự đếm trong bộ nhớ: phải đúng
  // con số nút "Tính lại bảng công" sẽ ra, nếu không hai chỗ đá nhau.
  for (const nv of NV) {
    for (const ky of KY) {
      if (bangCongDaChot.has(`${nv.id}|${ky}`)) continue;
      if (nv.nghiViec && nv.nghiViec < ky) continue;
      if (nv.vao && cuoiKy(ky) < nv.vao) continue;
      const { rows: [t] } = await c.query(
        `select count(distinct case when kind = 'in'
                  then (punched_at at time zone 'Asia/Ho_Chi_Minh')::date end)::int cong,
                count(*) filter (where out_of_range)::int co
           from public.attendance_punches
          where tenant_id = $1 and employee_id = $2
            and punched_at >= $3::timestamptz and punched_at < $4::timestamptz`,
        [T, nv.id, gioVN(ky, 0), gioVN(themNgay(cuoiKy(ky), 1), 0)]);
      const go = soNguoiGo.get(`${nv.id}|${ky}`) ?? { tre: 0, phutTangCa: 0 };
      const gioTangCa = Math.round((go.phutTangCa / 60) * 10) / 10;
      await c.query(
        `insert into public.timesheets
           (tenant_id, employee_id, period, work_days, overtime_hours, late_count, flag_count)
         values ($1,$2,$3::date,$4,$5,$6,$7)
         on conflict (tenant_id, employee_id, period) do update
            set work_days = excluded.work_days, overtime_hours = excluded.overtime_hours,
                late_count = excluded.late_count, flag_count = excluded.flag_count
          where timesheets.status = 'draft'`,
        [T, nv.id, ky, t.cong, gioTangCa, Math.min(go.tre, 200), Math.min(t.co, 200)]);
    }
  }

  // ── 5. Chốt bảng công các kỳ cũ ──────────────────────────────────────────
  for (const ky of KY_DA_CHOT) {
    await c.query(
      `update public.timesheets set status = 'closed', closed_by = $3, closed_at = $4::timestamptz
        where tenant_id = $1 and period = $2::date and status = 'draft'`,
      [T, ky, quanTri, gioVN(themNgay(cuoiKy(ky), 1), 10 * 60)]);
  }

  // ── 5b. Mở khoá kỳ lương ĐÃ CHỐT bị lệch hoa hồng ────────────────────────
  // Đi đúng đường `payroll_close_guard` mở: về 'draft' + bắt buộc kèm lý do.
  // KHÔNG phải tắt chốt chặn — chính chốt chặn ấy quy định cách này.
  const { rows: kyLech } = await c.query(
    `select k.id, to_char(k.period,'YYYY-MM-DD') ky,
            coalesce((select sum(h.amount_vnd) from public.commission_entries h
                       where h.tenant_id = k.tenant_id and h.amount_vnd <> 0
                         and h.earned_on >= k.period and h.earned_on < (k.period + interval '1 month')), 0)::bigint so_hh,
            coalesce((select sum(l.amount_vnd) from public.payslip_lines l
                        join public.payslips p on p.id = l.payslip_id
                       where p.period_id = k.id and l.source_type = 'commission'), 0)::bigint tren_phieu
       from public.payroll_periods k where k.tenant_id = $1 and k.status = 'closed'`, [T]);
  const canMo = kyLech.filter((r) => BigInt(r.so_hh) !== BigInt(r.tren_phieu));
  for (const r of canMo) {
    if (!MO_KHOA) {
      log(`     ⚠️  kỳ ${nhanKy(r.ky)} đã chốt đang thiếu hoa hồng ${tien(BigInt(r.so_hh) - BigInt(r.tren_phieu))}đ` +
        ` — chạy lại kèm MO_KHOA="lý do thật" để nạp lại.`);
      continue;
    }
    await c.query(`update public.payroll_periods set status = 'draft', unlock_reason = $2 where id = $1`, [r.id, MO_KHOA]);
    log(`     mở khoá kỳ lương ${nhanKy(r.ky)} — lý do: ${MO_KHOA}`);
  }

  // ── 6. Bảng lương ────────────────────────────────────────────────────────
  // Dựng theo đúng `tinhLaiKyLuong`: dòng lương cứng / tăng ca sinh TỪ bảng công
  // và trỏ `source_id` về đúng dòng bảng công đó. Kỳ đã chốt bỏ qua hẳn.
  const tongKy = [];
  for (const ky of KY) {
    await c.query(`insert into public.payroll_periods (tenant_id, period) values ($1, $2::date)
                   on conflict (tenant_id, period) do nothing`, [T, ky]);
    const { rows: [kyRow] } = await c.query(
      `select id, status from public.payroll_periods where tenant_id = $1 and period = $2::date`, [T, ky]);
    if (kyRow.status === "closed") continue;

    const nguoiTrongKy = NV.filter((n) => (!n.nghiViec || n.nghiViec >= ky) && (!n.vao || n.vao <= cuoiKy(ky)));
    await c.query(
      `insert into public.payslips (tenant_id, period_id, employee_id)
       select $1, $2, x.emp from unnest($3::uuid[]) as x(emp)
       on conflict (period_id, employee_id) do nothing`, [T, kyRow.id, nguoiTrongKy.map((n) => n.id)]);
    const { rows: phieuRows } = await c.query(
      `select id, employee_id from public.payslips where tenant_id = $1 and period_id = $2`, [T, kyRow.id]);
    const phieuCua = new Map(phieuRows.map((r) => [r.employee_id, r.id]));
    const { rows: bcRows } = await c.query(
      `select id, employee_id, work_days, overtime_hours from public.timesheets
        where tenant_id = $1 and period = $2::date`, [T, ky]);
    const bcCua = new Map(bcRows.map((r) => [r.employee_id, r]));
    // Hoa hồng: MỖI KHOẢN MỘT DÒNG, `source_id` trỏ về đúng khoản gốc — gộp
    // thành một dòng tổng là mất đường bấm về nơi con số ra đời.
    const { rows: hhRows } = await c.query(
      `select id, employee_id, amount_vnd, to_char(earned_on,'YYYY-MM-DD') earned_on, note
         from public.commission_entries
        where tenant_id = $1 and earned_on >= $2::date and earned_on <= $3::date and amount_vnd <> 0`,
      [T, ky, cuoiKy(ky)]);
    const hhCua = new Map();
    for (const h of hhRows) {
      if (!hhCua.has(h.employee_id)) hhCua.set(h.employee_id, []);
      hhCua.get(h.employee_id).push(h);
    }

    const phieuIds = [];
    for (const nv of nguoiTrongKy) {
      const phieuId = phieuCua.get(nv.id);
      if (!phieuId) continue;
      phieuIds.push(phieuId);
      const bc = bcCua.get(nv.id);
      const dong = [];
      if (bc && nv.luong > 0) {
        dong.push({ kind: "base", tienD: nv.luong, nguon: "timesheet", nguonId: bc.id,
          nhan: `Lương cứng kỳ ${nhanKy(ky)} · ${Number(bc.work_days)} công` });
      }
      const gioTangCa = Number(bc?.overtime_hours ?? 0);
      if (bc && gioTangCa > 0 && nv.giaTangCa > 0) {
        dong.push({ kind: "overtime", tienD: Math.round(gioTangCa * nv.giaTangCa), nguon: "timesheet",
          nguonId: bc.id, nhan: `Tăng ca kỳ ${nhanKy(ky)} · ${gioTangCa} giờ` });
      }
      for (const h of hhCua.get(nv.id) ?? []) {
        dong.push({ kind: "commission", tienD: Number(h.amount_vnd), nguon: "commission",
          nguonId: h.id, nhan: h.note ?? `Hoa hồng ngày ${h.earned_on}` });
      }
      // Dòng GHI TAY — 'manual' bắt buộc có nhãn + người ghi (CHECK payslip_lines_co_goc).
      if (nv.luong > 0) {
        const bh = Math.round((nv.luong * 0.105) / 1000) * 1000;
        dong.push({ kind: "insurance", tienD: -bh, nguon: "manual", nguonId: null,
          nhan: `BHXH - BHYT - BHTN 10,5% kỳ ${nhanKy(ky)}` });
      }
      if (nn(nv.id, ky, "tamung") < 0.22 && nv.luong > 0) {
        dong.push({ kind: "advance", tienD: -nnInt(1, 3, nv.id, ky, "mucung") * 1_000_000, nguon: "manual",
          nguonId: null, nhan: `Tạm ứng lương kỳ ${nhanKy(ky)}` });
      }
      // Dọn dòng MÁY sinh (đúng như sản phẩm làm) + dọn ĐÚNG những dòng ghi tay
      // của chính bộ nạp này, nhận dạng bằng nhãn. Không đụng dòng người khác ghi.
      const nhanTay = dong.filter((x) => x.nguon === "manual").map((x) => x.nhan);
      await c.query(
        `delete from public.payslip_lines
          where payslip_id = $1
            and (source_type in ('timesheet','commission')
                 or (source_type = 'manual' and label = any($2::text[])))`, [phieuId, nhanTay]);
      for (let i = 0; i < dong.length; i += 400) {
        const phan = dong.slice(i, i + 400);
        await c.query(
          `insert into public.payslip_lines
             (tenant_id, payslip_id, kind, amount_vnd, source_type, source_id, label, created_by)
           select $1, $2, x.k, x.t, x.st, x.si, x.nh,
                  case when x.st = 'manual' then $8::uuid else null end
             from unnest($3::text[], $4::bigint[], $5::text[], $6::uuid[], $7::text[]) as x(k, t, st, si, nh)`,
          [T, phieuId, phan.map((x) => x.kind), phan.map((x) => x.tienD), phan.map((x) => x.nguon),
           phan.map((x) => x.nguonId), phan.map((x) => x.nhan), quanTri]);
      }
    }
    // Tổng phiếu CỘNG TỪ DÒNG (`net_vnd` là cột sinh); tổng kỳ CỘNG TỪ PHIẾU.
    await c.query(
      `update public.payslips p set gross_vnd = coalesce(g.gross, 0), deduction_vnd = coalesce(g.ded, 0)
         from unnest($1::uuid[]) as x(id)
         left join (select payslip_id,
                           sum(case when amount_vnd > 0 then amount_vnd else 0 end) gross,
                           sum(case when amount_vnd < 0 then -amount_vnd else 0 end) ded
                      from public.payslip_lines where payslip_id = any($1::uuid[]) group by payslip_id) g
           on g.payslip_id = x.id
        where p.id = x.id`, [phieuIds]);
    const { rows: [tg] } = await c.query(
      `update public.payroll_periods set total_vnd = greatest(0, coalesce(
          (select sum(net_vnd) from public.payslips where period_id = $1), 0))
        where id = $1 returning total_vnd`, [kyRow.id]);
    tongKy.push(`${nhanKy(ky)}=${tien(tg.total_vnd)}đ`);
  }

  // ── 7. Chốt các kỳ lương cũ + phiếu chi lương ────────────────────────────
  // `payroll_close_guard` từ chối nếu còn bảng công chưa chốt — bước 5 đã lo.
  for (const ky of KY_DA_CHOT) {
    const mocChot = gioVN(themNgay(cuoiKy(ky), 2), 15 * 60);
    await c.query(
      `update public.payroll_periods set status = 'closed', closed_by = $3, closed_at = $4::timestamptz
        where tenant_id = $1 and period = $2::date and status = 'draft'`, [T, ky, chuTiem, mocChot]);
    // Phiếu chi lương — chạy cho MỌI kỳ đã chốt, không riêng kỳ vừa chốt xong:
    // như vậy lần chạy sau còn VÁ được phiếu chi thiếu hoặc lệch số.
    const { rows: [ph] } = await c.query(
      `select coalesce(sum(p.net_vnd), 0)::bigint tong from public.payslips p
         join public.payroll_periods k on k.id = p.period_id
        where k.tenant_id = $1 and k.period = $2::date and k.status = 'closed'`, [T, ky]);
    const tongChi = BigInt(ph.tong);
    if (tongChi <= 0n) continue;
    const ghiChu = `Lương kỳ ${nhanKy(ky)}`;
    const { rows: [daCoPhieu] } = await c.query(
      `select id, amount_vnd from public.cash_entries
        where tenant_id = $1 and category = 'salary' and note = $2 and deleted_at is null limit 1`, [T, ghiChu]);
    if (!daCoPhieu) {
      await c.query(
        `insert into public.cash_entries (tenant_id, direction, amount_vnd, fund, category, note, recorded_by, created_at)
         values ($1, 'out', $2, 'bank', 'salary', $3, $4, $5::timestamptz)`,
        [T, tongChi.toString(), ghiChu, chuTiem, mocChot]);
    } else if (BigInt(daCoPhieu.amount_vnd) !== tongChi) {
      await c.query(`update public.cash_entries set amount_vnd = $2 where id = $1`, [daCoPhieu.id, tongChi.toString()]);
    }
  }

  // ── 8. Chốt sổ ca (két sắt) ──────────────────────────────────────────────
  // `expected_cash` đi theo chuỗi của `tinhExpectedCash`: tiền đầu ca + tiền mặt
  // vào/ra KỂ TỪ ca trước. Trước mỗi lần chốt, tiệm NỘP tiền mặt về ngân hàng và
  // chỉ chừa quỹ lẻ ~2 triệu — không có bước đó thì sau mười ngày két phình lên
  // vài chục triệu, một con số không ai tin. Đây là chứng từ gốc của người ghi,
  // không phải bản sao của thứ trigger đã ghi.
  const QUY_LE = 2_000_000;
  const NGAY_CHOT = [];
  for (let d = themNgay(HOM_NAY, -10); d < HOM_NAY; d = themNgay(d, 1)) NGAY_CHOT.push(d);
  const nguoiChot = NV.filter((n) => !n.nghiViec && ["quanly", "thungan", "beptruong", "letan", "ketoan"].includes(n.nghe));
  let themChotCa = 0, mocTruoc = null, tienTruoc = null;
  for (const [i, ngay] of NGAY_CHOT.entries()) {
    const moc = gioVN(ngay, 21 * 60 + 30);
    const { rows: [daCoCa] } = await c.query(
      `select actual_cash, created_at from public.shift_closings where tenant_id = $1 and shift_date = $2::date limit 1`,
      [T, ngay]);
    if (daCoCa) { tienTruoc = Number(daCoCa.actual_cash); mocTruoc = daCoCa.created_at.toISOString(); continue; }
    const dauCa = tienTruoc ?? QUY_LE;
    const tuMoc = mocTruoc ?? gioVN(ngay, 0).toISOString();
    // HAI chỗ cố ý khác hàm thật `tinhExpectedCash`, nói ra chứ không giấu:
    //  · Chặn trên `<= moc`: lúc hàm thật chạy thì khoản thu sau giờ chốt chưa
    //    tồn tại; ở đây đang dựng lại quá khứ nên phải tự cắt.
    //  · Ca ĐẦU TIÊN tính từ 00:00 hôm đó, không phải từ đầu lịch sử — tiệm mẫu
    //    có mấy tháng tiền mặt chưa chốt, dồn hết vào một ca là con số vô lý.
    const dem = async (den) => {
      const { rows: [q] } = await c.query(
        `select coalesce(sum(case when direction = 'in' then amount_vnd else -amount_vnd end), 0)::bigint rong
           from public.cash_entries where tenant_id = $1 and fund = 'cash' and deleted_at is null
            and created_at > $2::timestamptz and created_at <= $3::timestamptz`, [T, tuMoc, den]);
      return Number(q.rong);
    };
    const rongTruocNop = await dem(gioVN(ngay, 21 * 60 + 10));
    const nop = Math.max(0, Math.floor((dauCa + rongTruocNop - QUY_LE) / 100000) * 100000);
    if (nop > 0) {
      const mocNop = gioVN(ngay, 21 * 60 + 15);
      const ghiChu = `Nộp tiền mặt cuối ca ngày ${ngay.slice(8)}/${ngay.slice(5, 7)} về ngân hàng`;
      await c.query(
        `insert into public.cash_entries (tenant_id, direction, amount_vnd, fund, category, note, recorded_by, created_at)
         select $1,'out',$2,'cash','other_out',$3,$4,$5::timestamptz
          where not exists (select 1 from public.cash_entries where tenant_id=$1 and note=$3 and fund='cash' and deleted_at is null)`,
        [T, nop, ghiChu, quanTri, mocNop]);
      await c.query(
        `insert into public.cash_entries (tenant_id, direction, amount_vnd, fund, category, note, recorded_by, created_at)
         select $1,'in',$2,'bank','other_in',$3,$4,$5::timestamptz
          where not exists (select 1 from public.cash_entries where tenant_id=$1 and note=$3 and fund='bank' and deleted_at is null)`,
        [T, nop, ghiChu, quanTri, mocNop]);
    }
    const duKien = dauCa + await dem(moc);
    // Lệch quỹ: đa số ngày khớp, vài ngày lệch nhỏ — đó mới là két sắt thật.
    const lech = nn(ngay, "lech") < 0.3 ? nnInt(-1, 1, ngay, "muclech") * nnInt(1, 5, ngay, "buoc") * 10_000 : 0;
    const thucTe = Math.max(0, duKien + lech);
    const ai = nguoiChot.length ? nguoiChot[i % nguoiChot.length].uid : quanTri;
    await c.query(
      `insert into public.shift_closings
         (tenant_id, closed_by, shift_date, opening_cash, actual_cash, expected_cash, note, created_at)
       values ($1,$2,$3::date,$4,$5,$6,$7,$8::timestamptz)`,
      [T, ai, ngay, dauCa, thucTe, duKien,
       lech === 0 ? null : lech > 0 ? "Dư quỹ — khách trả dư chưa kịp thối, đã ghi sổ."
                                    : "Thiếu quỹ — thối nhầm cho khách, sẽ đối chiếu lại.", moc]);
    themChotCa++;
    tienTruoc = thucTe; mocTruoc = moc.toISOString();
  }

  const { rows: [tt] } = await c.query(
    `select (select count(*)::int from public.timesheets where tenant_id=$1 and status='closed') bc_chot,
            (select count(*)::int from public.timesheets where tenant_id=$1 and status='draft')  bc_nhap,
            (select coalesce(sum(late_count),0)::int from public.timesheets where tenant_id=$1)  di_tre,
            (select coalesce(sum(flag_count),0)::int from public.timesheets where tenant_id=$1)  co,
            (select count(*)::int from public.payroll_periods where tenant_id=$1 and status='closed') luong_chot,
            (select count(*)::int from public.leave_requests where tenant_id=$1 and status='pending') cho_duyet`, [T]);
  return `ca làm ${caEmp.length} ô · chấm công ${soLanCham} lần (${soLanCoLyDo} ngoài vùng) · bảng công ${tt.bc_chot} chốt / ${tt.bc_nhap} nháp` +
    ` · ${tt.di_tre} lần đi trễ · ${tt.co} lần bị gắn cờ · nghỉ phép +${themNghi} (${tt.cho_duyet} chờ duyệt)` +
    ` · kỳ lương ${tongKy.join(" · ")} (${tt.luong_chot} kỳ đã chốt) · chốt sổ ca +${themChotCa} ngày`;
}

// ── Tiện ích ghi ──────────────────────────────────────────────────────────
async function daCo(bang, ids) {
  const co = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const { rows } = await c.query(`select id from public.${bang} where id = any($1::uuid[])`, [ids.slice(i, i + 500)]);
    for (const r of rows) co.add(r.id);
  }
  return co;
}

async function chenNhieu(bang, cot, hang, moLan = 300, xungDot = "(id)") {
  let n = 0;
  for (let i = 0; i < hang.length; i += moLan) {
    const phan = hang.slice(i, i + moLan);
    const o = [], tsn = [];
    phan.forEach((r, j) => {
      o.push("(" + cot.map((_, k) => `$${j * cot.length + k + 1}`).join(",") + ")");
      tsn.push(...r);
    });
    const kq = await c.query(
      `insert into public.${bang} (${cot.join(",")}) values ${o.join(",")} on conflict ${xungDot} do nothing`, tsn);
    n += kq.rowCount;
  }
  return n;
}

/** Chuyển trạng thái theo mẻ nhỏ — mỗi dòng vẫn kích trigger riêng. */
async function doiTrangThai(ids, trangThai) {
  for (let i = 0; i < ids.length; i += 100) {
    await c.query(`update public.orders set status = $2 where id = any($1::uuid[])`, [ids.slice(i, i + 100), trangThai]);
  }
}

main().catch(async (e) => {
  try { await c.query("rollback"); } catch { /* kết nối có thể đã đứt */ }
  console.error("\n✖ HỎNG:", e.message);
  if (e.detail) console.error("  chi tiết:", e.detail);
  if (e.constraint) console.error("  ràng buộc:", e.constraint);
  process.exit(1);
});
