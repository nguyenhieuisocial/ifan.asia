#!/usr/bin/env node
/**
 * NẠP DỮ LIỆU KINH DOANH + NHÂN SỰ cho BA tiệm mẫu bán lẻ / thú cưng.
 *
 *   • sample-retail  — Mỹ Phẩm Ngọc Trai      (12 người · bán lẻ hàng hoá)
 *   • sample-shop    — Sắc Màu Boutique       (10 người · thời trang bán online)
 *   • sample-pet     — Spa Thú Cưng Bống Bang ( 9 người · dịch vụ + hàng bán kèm)
 *
 * Ba tiệm này trước khi chạy chỉ có hồ sơ nhân viên, khách và hội thoại; KHÔNG
 * có một mặt hàng, một đơn, một ca làm nào. Script dựng phần còn thiếu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. VÌ SAO PHẢI "GHI NGUỒN, ĐỂ TRIGGER LÀM PHẦN CÒN LẠI"
 * ═══════════════════════════════════════════════════════════════════════════
 * Đo trên lược đồ thật ngày 20/08/2026, KHÔNG suy từ tên bảng:
 *
 *   • `orders_sinh_dong_kho` và `orders_sinh_hoa_hong` là trigger
 *     **AFTER UPDATE OF status**, KHÔNG phải AFTER INSERT. Một đơn chèn thẳng
 *     với `status='completed'` sẽ KHÔNG sinh dòng kho, KHÔNG sinh hoa hồng, và
 *     không có gì báo lỗi. ⇒ Mọi đơn ở đây đi đúng đường đời thật:
 *     chèn `draft` → thêm dòng hàng → thu tiền → `confirmed` → `completed`.
 *
 *   • `purchases_sinh_dong_kho` cũng là AFTER UPDATE OF status ⇒ phiếu nhập
 *     cũng phải `draft` → thêm dòng → `completed`.
 *
 *   • `order_lines.line_total_vnd` là cột SINH TỰ ĐỘNG. `order_payments_guard`
 *     lấy chính cột đó để chặn thu vượt tổng đơn, nên số tiền thu phải suy từ
 *     đơn giá × số lượng − giảm, không được chèn tay tổng đơn (bảng `orders`
 *     KHÔNG có cột tổng tiền — doanh thu luôn cộng từ `order_lines`).
 *
 *   • `commission_sinh_cho_don()` nối người ăn hoa hồng bằng
 *     `e.user_id = coalesce(l.performed_by_user_id, a.staff_user_id, o.created_by)`
 *     và nhân với `commission_rates.percent` của tiệm (đã có sẵn: dịch vụ 8%,
 *     hàng hoá 5%). ⇒ Mỗi dòng đơn phải mang `performed_by_user_id` = người
 *     THẬT SỰ làm/bán. Bỏ trống là hoa hồng rơi hết về người tạo đơn.
 *
 *   • `order_lines_snapshot_cost` chốt giá vốn NGAY LÚC CHÈN DÒNG, đọc từ
 *     `item_costs`. ⇒ Giá vốn phải có TRƯỚC khi ghi dòng đơn, nếu không mọi
 *     dòng chốt giá vốn NULL và lãi gộp của tiệm mẫu thành vô nghĩa.
 *     Vì vậy thứ tự bắt buộc: mặt hàng → giá vốn → phiếu nhập → đơn hàng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2. KHÔNG CHÈN TAY VÀO BẢNG KÉO THEO
 * ═══════════════════════════════════════════════════════════════════════════
 * `stock_moves`, `cash_entries`, `commission_entries` là dữ liệu KÉO THEO. Tự
 * chèn là tạo hai nguồn cùng nói một việc, tới lúc lệch không ai biết bên nào
 * đúng (việc #18). Script này KHÔNG chèn dòng nào vào ba bảng đó từ đường bán
 * hàng; phần nghiệm thu đếm chúng TRƯỚC/SAU để tự chứng minh chúng tăng là do
 * trigger. Tự soát bằng lệnh:
 *
 *   grep -n "insert into public.stock_moves\|insert into public.commission_entries" \
 *        scripts/seed-kinh-doanh-banle-pet.mjs      # ⇒ không có dòng nào
 *
 * NGOẠI LỆ DUY NHẤT với `cash_entries`: PHIẾU CHI LƯƠNG. Chốt kỳ lương trên
 * sản phẩm (`chotKyLuong` — app/app/payroll/actions.ts) TỰ SINH một phiếu chi
 * 'salary' trong Sổ quỹ. Kỳ lương đã chốt mà sổ quỹ không có đồng nào đi ra là
 * trạng thái sản phẩm không bao giờ tạo ra được. Script sinh đúng phiếu đó,
 * theo đúng khuôn của bộ nạp tiệm spa: MỘT phiếu gộp cho cả kỳ, ghi chú CHỈ
 * nói kỳ nào — không tên người (Sổ quỹ mở cho vai quản lý, mà cả mảng lương
 * tồn tại để quản lý KHÔNG thấy lương đồng nghiệp).
 *
 * NGOẠI LỆ THỨ HAI, và chỉ là MỐC THỜI GIAN: trigger sinh phiếu quỹ với
 * `created_at = now()`, để nguyên thì mấy nghìn đơn rải 3,5 tháng đổ hết vào Sổ
 * quỹ trong một phút. Sau khi trigger chạy xong, script KÉO `created_at` của
 * chính những dòng đó về đúng ngày chứng từ gốc. Không thêm dòng, không đổi số.
 *
 * ⛔ SỔ KHO thì KHÔNG kéo mốc được: `stock_moves_immutable_guard` chặn mọi
 * UPDATE/DELETE. Nên dòng kho do trigger sinh mang mốc LÚC CHẠY SCRIPT, không
 * phải ngày bán. Tồn kho hiện tại vẫn ĐÚNG; chỉ báo cáo kho THEO NGÀY là dồn
 * về hôm nay. Đây là hạn chế được ghi nhận, không phải lỗi — và tuyệt đối
 * không lách bằng cách chèn thẳng `stock_moves` với ngày đẹp.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 3. THỨ TỰ: HOA HỒNG PHẢI CÓ TRƯỚC KHI CHỐT LƯƠNG
 * ═══════════════════════════════════════════════════════════════════════════
 * Ở tiệm spa hôm nay đã xảy ra đúng lỗi này: chốt kỳ lương xong rồi đơn hàng
 * mới sinh hoa hồng ⇒ phiếu lương thiếu tiền, phải mở khoá kỳ đã chốt để vá.
 * Nên trong script này, MỖI TIỆM chạy theo đúng thứ tự:
 *
 *   mặt hàng → giá vốn → tài nguyên → khách → (lịch hẹn) → phiếu nhập →
 *   ĐƠN HÀNG (hoa hồng sinh ở đây) → ca làm → chấm công → bảng công →
 *   chốt bảng công → BẢNG LƯƠNG (đọc hoa hồng đã đủ) → chốt kỳ lương.
 *
 * Các chốt chặn của kho cũng quy định đúng thứ tự đó, không phải sở thích:
 *   1. `punch_locked_period_guard`  ⇒ chấm công TRƯỚC, chốt bảng công SAU.
 *   2. `payroll_close_guard`        ⇒ chốt bảng công TRƯỚC, chốt lương SAU.
 *   3. `payslips_locked_guard`      ⇒ dựng phiếu TRƯỚC, chốt kỳ SAU.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 4. QUY MÔ PHẢI CÂN VỚI QUỸ LƯƠNG — và cân THEO NGÀNH
 * ═══════════════════════════════════════════════════════════════════════════
 * Bài học đắt nhất của tiệm spa: 20 nhân viên nhưng lượng khách của tiệm 3
 * người ⇒ quỹ lương 190tr/tháng mà doanh thu 72tr ⇒ mở Báo cáo ra thấy tiệm
 * sắp phá sản. Số đúng từng ô mà SAI ở tầng kinh doanh.
 *
 * Nên quy mô ở đây tính NGƯỢC từ quỹ lương thật đọc trong `employees`:
 *
 *   Mỹ Phẩm Ngọc Trai  112,1tr/tháng · bán lẻ hàng hoá, lãi gộp ~38%
 *                      ⇒ nhắm lương/doanh thu ~27%  (doanh thu ~415tr/tháng)
 *   Sắc Màu Boutique    95,4tr/tháng · thời trang, lãi gộp ~48%, có trả hàng
 *                      ⇒ nhắm lương/doanh thu ~28%  (doanh thu ~340tr/tháng)
 *   Spa Thú Cưng        93,5tr/tháng · dịch vụ là chính, lãi gộp ~85%
 *                      ⇒ nhắm lương/doanh thu ~36%  (doanh thu ~260tr/tháng)
 *
 * Bán lẻ hàng hoá biên lợi nhuận THẤP hơn dịch vụ nên cùng một quỹ lương phải
 * gánh doanh thu cao hơn nhiều — dùng chung một tỉ lệ cho ba tiệm là dựng ra
 * hai tiệm sai. Phần nghiệm thu in DOANH THU · LÃI GỘP · TỈ LỆ LƯƠNG từng
 * tháng của từng tiệm để tự chứng minh, không phải để hứa.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 5. CHẠY LẠI KHÔNG NHÂN ĐÔI
 * ═══════════════════════════════════════════════════════════════════════════
 *   • `orders` / `appointments` / `purchases` không có cột neo ⇒ mỗi bản ghi
 *     mang id = UUIDv5(tên gọi cố định) dựng từ mã tiệm + loại + số thứ tự.
 *   • `items` / `resources` neo bằng UNIQUE (tenant_id, name); `item_variants`
 *     neo bằng UNIQUE (tenant_id, sku); `shifts` / `timesheets` / `payslips`
 *     có khoá duy nhất sẵn; `suppliers` / `leave_requests` không có khoá nào
 *     nên neo bằng "đã có thì thôi" trên bộ cột nhận dạng.
 *   • MỌI số ngẫu nhiên đi qua `nn()` — hàm BĂM tất định theo nội dung, KHÔNG
 *     phải `Math.random()` và cũng không phải bộ sinh tuần tự. Nhờ vậy kế
 *     hoạch không phụ thuộc thứ tự vòng lặp: chạy lần hai dựng lại y hệt.
 *   • Kế hoạch dựng HOÀN TOÀN từ hạt giống + dữ liệu CÓ TRƯỚC (nhân viên,
 *     bảng giá trong chính file này), KHÔNG nhìn vào cái mà chính nó vừa ghi.
 *   • Đơn hàng ghi theo TỪNG MẺ có `begin`/`commit` riêng, và bước chuyển
 *     trạng thái luôn kèm `where status = ...` ⇒ script chết giữa chừng thì
 *     lần chạy sau VÁ tiếp chứ không bỏ lại đơn nháp mồ côi.
 *
 * ⚠️ CHỈ ghi vào tiệm `is_sample = true` VÀ nằm trong ba mã được giao — có
 * chốt kiểm ở đầu, không phải lời hứa. `demo-spa-huong-sen`, `sample-fnb`,
 * `sample-kham` KHÔNG nằm trong danh sách và script từ chối chạy vào chúng.
 *
 *   node --env-file=.env.local scripts/seed-kinh-doanh-banle-pet.mjs
 *   TIEM=sample-pet node --env-file=.env.local scripts/seed-kinh-doanh-banle-pet.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// ══════════════════════════════════════════════════════════════════════════
// CHỐT KIỂM PHẠM VI — ba mã tiệm này, không mã nào khác
// ══════════════════════════════════════════════════════════════════════════
const DUOC_PHEP = ["sample-retail", "sample-shop", "sample-pet"];
const TIEM = (process.env.TIEM ?? DUOC_PHEP.join(","))
  .split(",").map((s) => s.trim()).filter(Boolean);
const laMoi = TIEM.filter((s) => !DUOC_PHEP.includes(s));
if (laMoi.length) {
  console.error(`✖ DỪNG: script này chỉ được ghi vào ${DUOC_PHEP.join(" · ")}.`);
  console.error(`   Mã lạ: ${laMoi.join(", ")}`);
  process.exit(1);
}

/**
 * ⚠️ ĐỔI SỐ LƯỢNG Ở KHỐI `quyMo` THÌ PHẢI ĐỔI `MA_ME`. Quên đổi thì mẻ mới
 * trùng khoá mẻ cũ, bị lọc là "đã có", và bạn ngồi nhìn một script chạy xong
 * mà không ghi được gì.
 */
const MA_ME = "b1";

/** Mốc "hôm nay" ĐÓNG CỨNG — lấy `new Date()` là chạy lại tháng sau ra khác. */
const HOM_NAY = "2026-08-20";
const BAT_DAU = "2026-05-01";     // ~3,5 tháng gần đây, tròn tháng 5/6/7 + cụt tháng 8
const KET_THUC_LICH = "2026-09-03"; // lịch hẹn đặt trước 2 tuần (chỉ tiệm thú cưng)
const KY_DA_CHOT = ["2026-05-01", "2026-06-01", "2026-07-01"];
const KY_NHAP = "2026-08-01";
const BAN_KINH_M = 300; // bán kính "coi như đang ở tiệm" khi chấm công

if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL");
  process.exit(1);
}
const ca = readFileSync(new URL("../supabase/supabase-ca.crt", import.meta.url), "utf8");
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca, rejectUnauthorized: true },
});

const log = (...a) => console.log(...a);
const tien = (n) => Number(n).toLocaleString("vi-VN");

// ══════════════════════════════════════════════════════════════════════════
// TIỆN ÍCH TẤT ĐỊNH
// ══════════════════════════════════════════════════════════════════════════

/** UUIDv5 chuẩn (SHA-1 + không gian tên cố định) — không cần thư viện ngoài. */
const KHONG_GIAN_TEN = "7f3c9a41-58d2-4e6b-9c07-2a5b8d1e4f60";
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

/**
 * Ngẫu nhiên TẤT ĐỊNH theo NỘI DUNG, không theo thứ tự gọi.
 * Băm FNV-1a rồi trộn kiểu mulberry32. Chọn cách này thay vì một bộ sinh tuần
 * tự vì kế hoạch được dựng trong nhiều vòng lặp lồng nhau — chỉ cần chèn thêm
 * một lần gọi là mọi số phía sau lệch hết, và "chạy lại ra y hệt" sẽ vỡ âm thầm.
 */
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
/** Bốc theo trọng số: `cap` là mảng [giá trị, trọng số]. */
const nnTrongSo = (cap, ...phan) => {
  const tong = cap.reduce((s, [, w]) => s + w, 0);
  let x = nn(...phan) * tong;
  for (const [v, w] of cap) if ((x -= w) < 0) return v;
  return cap[cap.length - 1][0];
};

// ── Ngày tháng: chuỗi 'YYYY-MM-DD', tính bằng UTC để không lệch múi giờ ──────
const ngayToSo = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const soToNgay = (t) => new Date(t).toISOString().slice(0, 10);
const themNgay = (s, n) => soToNgay(ngayToSo(s) + n * 86400000);
/** 0 = Chủ nhật … 6 = Thứ Bảy. */
const thu = (s) => new Date(ngayToSo(s)).getUTCDay();
const cuoiKy = (ky) => {
  const [y, m] = ky.split("-").map(Number);
  return soToNgay(Date.UTC(y, m, 0));
};
const kyCua = (ngay) => ngay.slice(0, 8) + "01";
const nhanKy = (ky) => `${ky.slice(5, 7)}/${ky.slice(0, 4)}`;
/** Giờ VN (phút trong ngày) → mốc UTC. Máy chủ chạy UTC nên phải trừ 7 tiếng. */
const mocVN = (ngay, phut) => {
  const [y, m, d] = ngay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, phut - 7 * 60));
};
const gioVN = (ngay, phut) => mocVN(ngay, phut).toISOString();
/** Mốc UTC → ngày theo giờ VN. */
const ngayVN = (moc) => new Date(+moc + 7 * 3600000).toISOString().slice(0, 10);
/** `date` của pg về JS thành Date theo giờ MÁY — phải quy về chuỗi rồi mới so. */
const ngayISO = (v) => (v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`
  : String(v).slice(0, 10));

const khongDau = (s) => (s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Haversine — SAO CHÉP nguyên `khoangCachM` của app/app/team/queries.ts. */
function khoangCachM(a, b) {
  const R = 6_371_000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}
const toaDoCach = (goc, met, huong) => ({
  lat: Number((goc.lat + (met * Math.cos(huong)) / 111_320).toFixed(6)),
  lng: Number((goc.lng + (met * Math.sin(huong)) / (111_320 * Math.cos((goc.lat * Math.PI) / 180))).toFixed(6)),
});

// ── Kho tên người Việt (dùng dựng khách hàng) ───────────────────────────────
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
const PHUONG = ["Quận 1", "Quận 3", "Quận 7", "Quận Bình Thạnh", "Quận Phú Nhuận",
  "Quận Gò Vấp", "Quận Tân Bình", "TP Thủ Đức", "Quận 10", "Quận 4", "Quận 11", "Quận Bình Tân"];

// ══════════════════════════════════════════════════════════════════════════
// BẢNG GIÁ TỪNG NGÀNH
// Tên hàng lấy đúng thứ cửa hàng mỹ phẩm / shop thời trang / tiệm thú cưng
// Việt Nam thật bán; giá vốn đặt theo biên lợi nhuận thật của từng ngành
// (mỹ phẩm ~38%, thời trang ~48%, hàng thú cưng ~32% — dịch vụ không có vốn
// hàng nên lãi gộp gần bằng doanh thu).
// ══════════════════════════════════════════════════════════════════════════

/** [tên, nhóm, giá bán, giá vốn, đơn vị, trọng số bán chạy] */
const HANG_MY_PHAM = [
  ["Sữa rửa mặt Cetaphil dịu nhẹ 250ml", "Chăm sóc da", 285_000, 178_000, "chai", 30],
  ["Sữa rửa mặt Simple 150ml", "Chăm sóc da", 165_000, 102_000, "tuýp", 26],
  ["Nước tẩy trang Bioderma 500ml", "Tẩy trang", 465_000, 295_000, "chai", 24],
  ["Nước tẩy trang L'Oréal 400ml", "Tẩy trang", 225_000, 138_000, "chai", 26],
  ["Toner Some By Mi AHA-BHA 150ml", "Chăm sóc da", 295_000, 182_000, "chai", 22],
  ["Xịt khoáng Avene 300ml", "Chăm sóc da", 355_000, 225_000, "chai", 14],
  ["Tẩy tế bào chết Cosrx BHA 100ml", "Chăm sóc da", 235_000, 145_000, "chai", 16],
  ["Serum Vitamin C Klairs 20ml", "Đặc trị", 425_000, 265_000, "lọ", 24],
  ["Serum HA cấp ẩm The Ordinary 30ml", "Đặc trị", 265_000, 162_000, "lọ", 22],
  ["Serum Retinol Paula's Choice 30ml", "Đặc trị", 890_000, 570_000, "lọ", 9],
  ["Kem trị mụn La Roche-Posay 15ml", "Đặc trị", 385_000, 245_000, "tuýp", 16],
  ["Kem dưỡng ẩm CeraVe 340ml", "Dưỡng da", 395_000, 248_000, "hũ", 20],
  ["Kem dưỡng trắng Hada Labo 50g", "Dưỡng da", 245_000, 152_000, "hũ", 18],
  ["Mặt nạ ngủ Laneige 70ml", "Dưỡng da", 485_000, 310_000, "hũ", 12],
  ["Mặt nạ giấy Mediheal hộp 10 miếng", "Mặt nạ", 255_000, 155_000, "hộp", 28],
  ["Mặt nạ đất sét Innisfree 100ml", "Mặt nạ", 195_000, 120_000, "hũ", 16],
  ["Kem chống nắng Anessa vàng 60ml", "Chống nắng", 525_000, 340_000, "chai", 22],
  ["Kem chống nắng Skin1004 50ml", "Chống nắng", 325_000, 200_000, "tuýp", 20],
  ["Kem chống nắng Sunplay Skin Aqua 50g", "Chống nắng", 185_000, 115_000, "tuýp", 24],
  ["Son kem lì Black Rouge A-series", "Trang điểm", 215_000, 128_000, "cây", 30],
  ["Son thỏi 3CE Matte Lip", "Trang điểm", 355_000, 225_000, "cây", 20],
  ["Son dưỡng có màu Dior Addict", "Trang điểm", 965_000, 640_000, "cây", 6],
  ["Cushion Innisfree Water Fit", "Trang điểm", 455_000, 288_000, "hộp", 14],
  ["Kem nền Maybelline Fit Me 30ml", "Trang điểm", 295_000, 182_000, "chai", 16],
  ["Mascara Maybelline Hyper Curl", "Trang điểm", 245_000, 150_000, "cây", 15],
  ["Chì kẻ mày Etude House", "Trang điểm", 125_000, 72_000, "cây", 20],
  ["Phấn phủ kiềm dầu Innisfree", "Trang điểm", 185_000, 112_000, "hộp", 14],
  ["Dầu gội Tsubaki Premium 490ml", "Chăm sóc tóc", 265_000, 168_000, "chai", 14],
  ["Sữa tắm Hatomugi 800ml", "Chăm sóc cơ thể", 295_000, 185_000, "chai", 12],
  ["Bông tẩy trang Silcot túi 82 miếng", "Phụ trợ", 58_000, 32_000, "túi", 34],
  ["Máy rửa mặt Halio Sensitive", "Thiết bị", 895_000, 590_000, "máy", 5],
];

/** [tên, nhóm, giá, vốn, đơn vị, trọng số, cỡ[], màu[]] — cỡ/màu rỗng = không biến thể */
const HANG_THOI_TRANG = [
  ["Áo thun cotton basic tay ngắn", "Áo", 185_000, 92_000, "cái", 30, ["S", "M", "L", "XL"], ["Trắng", "Đen", "Be"]],
  ["Áo sơ mi lụa tay dài", "Áo", 455_000, 235_000, "cái", 22, ["S", "M", "L"], ["Trắng", "Xanh pastel", "Hồng"]],
  ["Áo kiểu tay phồng cổ vuông", "Áo", 325_000, 168_000, "cái", 20, ["S", "M", "L"], ["Trắng", "Đen"]],
  ["Áo croptop thun gân", "Áo", 165_000, 82_000, "cái", 24, ["S", "M", "L"], ["Đen", "Trắng", "Xanh rêu"]],
  ["Áo blazer dáng suông", "Áo khoác", 765_000, 405_000, "cái", 10, ["S", "M", "L"], ["Be", "Đen"]],
  ["Áo cardigan len mỏng", "Áo khoác", 425_000, 220_000, "cái", 14, ["Freesize"], ["Kem", "Xám", "Nâu"]],
  ["Váy hoa nhí dáng dài", "Váy", 525_000, 272_000, "cái", 20, ["S", "M", "L"], ["Hoa xanh", "Hoa hồng"]],
  ["Váy suông linen tay lỡ", "Váy", 485_000, 250_000, "cái", 18, ["S", "M", "L"], ["Be", "Trắng"]],
  ["Đầm body dự tiệc", "Váy", 695_000, 365_000, "cái", 12, ["S", "M", "L"], ["Đen", "Đỏ đô"]],
  ["Đầm maxi đi biển", "Váy", 585_000, 300_000, "cái", 12, ["Freesize"], ["Hoa vàng", "Hoa xanh"]],
  ["Chân váy chữ A dáng ngắn", "Váy", 355_000, 182_000, "cái", 20, ["S", "M", "L"], ["Đen", "Be", "Caro"]],
  ["Quần jean ống rộng", "Quần", 485_000, 255_000, "cái", 20, ["26", "27", "28", "29"], ["Xanh nhạt", "Xanh đậm"]],
  ["Quần tây công sở ống suông", "Quần", 425_000, 220_000, "cái", 16, ["S", "M", "L"], ["Đen", "Be"]],
  ["Quần short kaki lưng cao", "Quần", 285_000, 148_000, "cái", 18, ["S", "M", "L"], ["Be", "Trắng", "Đen"]],
  ["Set áo croptop và chân váy", "Set", 725_000, 380_000, "bộ", 12, ["S", "M", "L"], ["Hồng", "Đen"]],
  ["Túi xách nữ da PU dáng vuông", "Phụ kiện", 395_000, 205_000, "cái", 14, [], ["Đen", "Nâu", "Trắng kem"]],
  ["Túi tote vải canvas in hình", "Phụ kiện", 195_000, 95_000, "cái", 18, [], []],
  ["Thắt lưng nữ bản nhỏ", "Phụ kiện", 155_000, 78_000, "cái", 14, [], ["Đen", "Nâu"]],
  ["Khăn lụa vuông hoạ tiết", "Phụ kiện", 135_000, 66_000, "cái", 12, [], []],
  ["Kính mát gọng vuông", "Phụ kiện", 265_000, 132_000, "cái", 12, [], ["Đen", "Nâu trà"]],
  ["Giày sandal quai mảnh", "Giày dép", 455_000, 238_000, "đôi", 14, ["35", "36", "37", "38", "39"], ["Đen", "Kem"]],
  ["Dép quai ngang đế bệt", "Giày dép", 225_000, 112_000, "đôi", 16, ["35", "36", "37", "38", "39"], ["Đen", "Trắng"]],
];

/** DỊCH VỤ thú cưng: [tên, nhóm, giá, số phút, nghề làm được, loại tài nguyên, trọng số đặt lịch] */
const DICH_VU_THU_CUNG = [
  ["Tắm vệ sinh chó nhỏ (dưới 5kg)", "Tắm", 155_000, 45, ["tho", "quanly"], "phongtam", 16],
  ["Tắm vệ sinh chó vừa (5-15kg)", "Tắm", 225_000, 60, ["tho", "quanly"], "phongtam", 14],
  ["Tắm vệ sinh chó lớn (trên 15kg)", "Tắm", 325_000, 90, ["tho"], "phongtam", 6],
  ["Tắm vệ sinh mèo", "Tắm", 255_000, 60, ["tho"], "phongtam", 9],
  ["Cắt tỉa tạo kiểu chó nhỏ", "Cắt tỉa", 355_000, 90, ["tho"], "bancattia", 12],
  ["Cắt tỉa tạo kiểu chó vừa", "Cắt tỉa", 455_000, 120, ["tho"], "bancattia", 7],
  ["Cắt tỉa lông mèo", "Cắt tỉa", 405_000, 90, ["tho"], "bancattia", 5],
  ["Spa dưỡng lông trị ve rận", "Spa", 385_000, 90, ["tho"], "bancattia", 6],
  ["Spa thư giãn massage thú cưng", "Spa", 305_000, 60, ["tho"], "bancattia", 5],
  ["Cắt móng và vệ sinh tai", "Chăm sóc nhanh", 85_000, 20, ["tho", "quanly"], "bancattia", 11],
  ["Vệ sinh răng miệng", "Chăm sóc nhanh", 185_000, 30, ["tho", "bacsi"], "bancattia", 6],
  ["Khám tổng quát thú y", "Thú y", 205_000, 30, ["bacsi"], "phongkham", 12],
  ["Tiêm vắc-xin (1 mũi)", "Thú y", 285_000, 20, ["bacsi"], "phongkham", 9],
  ["Tẩy giun định kỳ", "Thú y", 125_000, 15, ["bacsi"], "phongkham", 7],
];
/** Trông giữ bán tại quầy, KHÔNG xếp lịch: một ngày trông không chiếm ô giờ của ai. */
const DICH_VU_BAN_QUAY = [["Trông giữ thú cưng theo ngày", "Trông giữ", 255_000, 60]];

const HANG_THU_CUNG = [
  ["Thức ăn hạt Royal Canin 2kg", "Thức ăn", 485_000, 340_000, "túi", 24],
  ["Thức ăn hạt Ganador 1.5kg", "Thức ăn", 215_000, 148_000, "túi", 26],
  ["Pate mèo Whiskas lốc 12 gói", "Thức ăn", 185_000, 125_000, "lốc", 22],
  ["Bánh thưởng Pedigree cho chó", "Thức ăn", 85_000, 55_000, "gói", 30],
  ["Sữa tắm Bio cho chó 200ml", "Chăm sóc", 135_000, 85_000, "chai", 20],
  ["Sữa tắm trị ve Fay 200ml", "Chăm sóc", 155_000, 98_000, "chai", 16],
  ["Vòng cổ chống ve Bayer", "Chăm sóc", 225_000, 150_000, "cái", 12],
  ["Dây dắt kèm vòng cổ", "Phụ kiện", 165_000, 95_000, "bộ", 14],
  ["Bàn chải lông chuyên dụng", "Phụ kiện", 95_000, 55_000, "cái", 16],
  ["Lược chải lông rụng", "Phụ kiện", 115_000, 66_000, "cái", 14],
  ["Đồ chơi gặm cho chó", "Phụ kiện", 78_000, 42_000, "cái", 18],
  ["Áo cho thú cưng", "Phụ kiện", 145_000, 82_000, "cái", 12],
  ["Cát vệ sinh cho mèo 5L", "Vệ sinh", 125_000, 82_000, "bao", 22],
  ["Xịt khử mùi lông thú 250ml", "Vệ sinh", 95_000, 58_000, "chai", 14],
];

/**
 * TÀI NGUYÊN — `resources.kind` CSDL chỉ cho: bed / room / chair / table / machine.
 * CỐ Ý chỉ tiệm thú cưng có tài nguyên: nghề của nó là ĐẶT CHỖ (bàn cắt tỉa,
 * phòng tắm, phòng khám), giữ chỗ sai là hai con thú cùng một bàn. Cửa hàng mỹ
 * phẩm và shop thời trang bán online KHÔNG đặt chỗ gì cả — dựng cho chúng vài
 * cái "ghế" để ba tiệm trông giống nhau là bịa ra một nghiệp vụ không tồn tại.
 */
const TAI_NGUYEN_THU_CUNG = [
  ["Bàn cắt tỉa số 1", "table", "bancattia"],
  ["Bàn cắt tỉa số 2", "table", "bancattia"],
  ["Bàn cắt tỉa số 3", "table", "bancattia"],
  ["Phòng tắm số 1", "room", "phongtam"],
  ["Phòng tắm số 2", "room", "phongtam"],
  ["Phòng khám thú y", "room", "phongkham"],
  ["Máy sấy lồng công nghiệp", "machine", null], // thiết bị dùng chung, không đặt chỗ
];

// ══════════════════════════════════════════════════════════════════════════
// CẤU HÌNH TỪNG TIỆM
// ══════════════════════════════════════════════════════════════════════════
const NGANH = {
  "sample-retail": {
    ten: "Mỹ Phẩm Ngọc Trai",
    viTri: { lat: 10.7743, lng: 106.7009 }, // Quận 1
    gioCa: { morning: { vao: 8 * 60 + 30, ra: 14 * 60 + 30 }, afternoon: { vao: 14 * 60, ra: 21 * 60 + 30 }, full: { vao: 8 * 60 + 30, ra: 20 * 60 } },
    gioBan: [9 * 60, 21 * 60], // khung giờ đơn hàng phát sinh
    /** Chức danh nghề đọc từ cột `note` — nơi bộ nạp nhân sự ghi nghề. */
    nghe: (note) => {
      const t = khongDau(note);
      if (t.includes("quan ly")) return "quanly";
      if (t.includes("ke toan")) return "ketoan";
      if (t.includes("ca truong")) return t.includes("chieu") ? "catruong_chieu" : "catruong_sang";
      if (t.includes("thu ngan")) return "thungan";
      if (t.includes("thu kho")) return "thukho";
      if (t.includes("ban hang")) return "banhang";
      return "banhang";
    },
    /** Ai ĐƯỢC ăn hoa hồng (đứng tên `performed_by_user_id` trên dòng hàng). */
    nguoiBan: ["banhang", "catruong_sang", "catruong_chieu", "quanly"],
    /** Ai lập đơn + thu tiền (`created_by`, `received_by`). */
    nguoiQuay: ["thungan", "catruong_sang", "catruong_chieu", "quanly"],
    quyMo: { khach: 800, donNgayThuong: 14, donCuoiTuan: 6, donDaoDong: 5, hoanTra: 0 },
    /** Số dòng mỗi đơn — giỏ mỹ phẩm thường 2-3 món. */
    soDong: [[1, 25], [2, 35], [3, 25], [4, 15]],
  },

  "sample-shop": {
    ten: "Sắc Màu Boutique",
    viTri: { lat: 10.7862, lng: 106.6890 }, // Quận 3
    gioCa: { morning: { vao: 8 * 60, ra: 13 * 60 }, afternoon: { vao: 13 * 60, ra: 20 * 60 }, full: { vao: 8 * 60 + 30, ra: 18 * 60 } },
    gioBan: [8 * 60, 20 * 60],
    nghe: (note) => {
      const t = khongDau(note);
      if (t.includes("quan ly")) return "quanly";
      if (t.includes("ke toan")) return "ketoan";
      if (t.includes("truong nhom")) return "truongnhom";
      if (t.includes("marketing")) return "marketing";
      if (t.includes("thu kho")) return "thukho";
      if (t.includes("dong goi")) return "donggoi";
      if (t.includes("cham soc khach")) return "cskh";
      return "cskh";
    },
    nguoiBan: ["cskh", "truongnhom", "quanly"],
    nguoiQuay: ["cskh", "truongnhom", "quanly"],
    quyMo: { khach: 700, donNgayThuong: 13, donCuoiTuan: 5, donDaoDong: 5, hoanTra: 0.07 },
    soDong: [[1, 45], [2, 33], [3, 17], [4, 5]],
  },

  "sample-pet": {
    ten: "Spa Thú Cưng Bống Bang",
    viTri: { lat: 10.7995, lng: 106.6822 }, // Quận Phú Nhuận
    gioCa: { morning: { vao: 8 * 60, ra: 13 * 60 + 30 }, afternoon: { vao: 13 * 60, ra: 19 * 60 + 30 }, full: { vao: 8 * 60, ra: 18 * 60 + 30 } },
    gioBan: [8 * 60, 18 * 60 + 30],
    /** Khung giờ nhận lịch hẹn (phút trong ngày) — bước tìm ô trống 15 phút. */
    gioHen: [8 * 60, 18 * 60 + 30],
    nghe: (note) => {
      const t = khongDau(note);
      if (t.includes("bac si")) return "bacsi";
      if (t.includes("quan ly")) return "quanly";
      if (t.includes("cat tia")) return "tho";
      if (t.includes("le tan")) return "letan";
      if (t.includes("ban hang")) return "banhang";
      if (t.includes("tap vu")) return "tapvu";
      return "banhang";
    },
    nguoiBan: ["banhang", "letan", "quanly"],   // hoa hồng HÀNG HOÁ
    nguoiQuay: ["letan", "quanly", "banhang"],  // lập đơn + thu tiền
    quyMo: {
      khach: 450, caNgayThuong: 22, caCuoiTuan: 6, caDaoDong: 4, caSapToi: 6,
      tyLeRaDon: 0.92, tyLeBanKem: 0.35, tyLeThemDichVu: 0.14,
      donMuaLe: 8, hoanTra: 0,
    },
    soDong: [[1, 45], [2, 40], [3, 15]],
  },
};

/**
 * Xếp ca cho một người vào một ngày — trả 'morning' | 'afternoon' | 'full' | 'off'.
 * Đây là NGUỒN DUY NHẤT nói ai có mặt lúc nào: bước xếp lịch hẹn và bước chọn
 * người bán đều hỏi lại chính hàm này, nên không bao giờ có chuyện xếp lịch cho
 * người đang nghỉ hay ghi hoa hồng cho người hôm đó không đi làm.
 */
function caTrongNgay(slug, nghe, thuTu, ngay) {
  const d = thu(ngay);
  const nghiTuan = 1 + (thuTu % 6); // rải ngày nghỉ tuần ra cả tuần, tránh CN
  const tuan = Math.floor(ngayToSo(ngay) / (7 * 86400000));
  const doiKip = (thuTu + tuan) % 2 === 0 ? "morning" : "afternoon";

  if (slug === "sample-retail") {
    switch (nghe) {
      case "quanly": return d === 0 ? "off" : "full";
      case "ketoan": return d === 0 || d === 6 ? "off" : "full";
      case "catruong_sang": return d === nghiTuan ? "off" : "morning";
      case "catruong_chieu": return d === nghiTuan ? "off" : "afternoon";
      case "thukho": return d === 0 ? "off" : "morning";
      case "thungan": return d === nghiTuan ? "off" : (thuTu % 2 === 0 ? "morning" : "afternoon");
      default: return d === nghiTuan ? "off" : doiKip;
    }
  }
  if (slug === "sample-shop") {
    switch (nghe) {
      case "quanly": return d === 0 ? "off" : "full";
      case "ketoan": return d === 0 || d === 6 ? "off" : "full";
      case "marketing": return d === 0 || d === 6 ? "off" : "full";
      case "truongnhom": return d === 0 ? "off" : "full";
      case "thukho": return d === 0 ? "off" : "morning";
      case "donggoi": return d === 0 ? "off" : "morning"; // gói buổi sáng cho kịp chuyến hàng
      default: return d === nghiTuan ? "off" : doiKip;    // cskh
    }
  }
  // sample-pet
  switch (nghe) {
    case "quanly": return d === 0 ? "off" : "full";
    case "bacsi": return d === 1 ? "off" : "full";
    case "tho": return d === nghiTuan ? "off" : "full"; // cắt tỉa cần cả ngày
    case "tapvu": return d === 0 ? "off" : "morning";
    default: return d === nghiTuan ? "off" : doiKip;    // lễ tân, bán hàng
  }
}

// ══════════════════════════════════════════════════════════════════════════
async function main() {
  await c.connect();
  await c.query("set lock_timeout = '10s'");
  // Mẻ này ghi vài nghìn đơn, mỗi lần đổi trạng thái lại kích trigger sinh kho /
  // quỹ / hoa hồng. Nới hạn CHẠY — KHÔNG nới hạn CHỜ KHOÁ, vì chờ khoá lâu
  // nghĩa là đang giẫm chân người khác, phải hỏng sớm cho biết.
  await c.query("set statement_timeout = '20min'");
  await c.query("set idle_in_transaction_session_timeout = '20min'");

  const tomTat = [];
  for (const slug of TIEM) {
    const kq = await lamMotTiem(slug);
    if (kq) tomTat.push(kq);
  }

  log("\n" + "═".repeat(78));
  log("TỔNG KẾT BA TIỆM — TIỆM CÓ LÃI KHÔNG");
  log("═".repeat(78));
  log("  tiệm                     quỹ lương/tháng   doanh thu TB    lương/DT   lãi gộp TB");
  for (const t of tomTat) {
    log(`  ${t.ten.padEnd(24)}${tien(t.quyLuong).padStart(14)}đ${tien(Math.round(t.doanhThuTB)).padStart(15)}đ`
      + `${(t.tyLe.toFixed(1) + "%").padStart(11)}${tien(Math.round(t.laiGopTB)).padStart(15)}đ`);
  }
  const xau = tomTat.filter((t) => t.tyLe > 45 || t.laiGopTB - t.quyLuong <= 0);
  log(xau.length === 0
    ? "  ✔ Cả ba tiệm đều có lãi và quỹ lương nằm trong mặt bằng ngành."
    : `  ✖ ${xau.length} tiệm LỆCH MẶT BẰNG: ${xau.map((t) => t.ten).join(", ")}`);
  if (xau.length) process.exitCode = 1;

  await c.end();
}

// ══════════════════════════════════════════════════════════════════════════
async function lamMotTiem(slug) {
  const G = NGANH[slug];
  log("\n" + "═".repeat(78));
  log(`TIỆM ${G.ten} (${slug})`);
  log("═".repeat(78));

  // ── CHỐT KIỂM: chỉ ghi vào tiệm mẫu ─────────────────────────────────────
  const { rows: [tiem] } = await c.query(
    `select id, name, slug, is_sample, deleted_at from public.tenants where slug = $1`, [slug]);
  if (!tiem) { log(`  ✖ Không có tiệm nào mang mã "${slug}" — bỏ qua.`); return null; }
  if (tiem.is_sample !== true) {
    console.error(`  ✖ DỪNG: "${tiem.name}" có is_sample = ${tiem.is_sample}. Chỉ ghi vào tiệm mẫu.`);
    process.exit(1);
  }
  if (tiem.deleted_at) { log(`  ✖ Tiệm đã xoá mềm — bỏ qua.`); return null; }
  const T = tiem.id;

  // ── ĐẾM TRƯỚC ───────────────────────────────────────────────────────────
  const BANG_DEM = ["items", "item_variants", "resources", "contacts", "appointments",
    "orders", "order_lines", "order_payments", "purchases", "purchase_lines",
    "stock_moves", "cash_entries", "commission_entries",
    "shifts", "attendance_punches", "timesheets", "leave_requests",
    "payroll_periods", "payslips", "payslip_lines"];
  const dem = async () => {
    const r = {};
    for (const b of BANG_DEM) {
      const { rows: [x] } = await c.query(
        `select count(*)::int n from public.${b} where tenant_id = $1`, [T]);
      r[b] = x.n;
    }
    return r;
  };
  const truoc = await dem();

  // ══════════════════════════════════════════════════════════════════════
  // 1. MẶT HÀNG + GIÁ VỐN + BIẾN THỂ
  // ══════════════════════════════════════════════════════════════════════
  const keHoachHang = [];  // { ten, nhom, gia, von, loai, donVi, phut, trongSo, coBienThe }
  if (slug === "sample-retail") {
    for (const [ten, nhom, gia, von, donVi, w] of HANG_MY_PHAM)
      keHoachHang.push({ ten, nhom, gia, von, loai: "product", donVi, phut: null, trongSo: w });
  } else if (slug === "sample-shop") {
    for (const [ten, nhom, gia, von, donVi, w, coCo, mau] of HANG_THOI_TRANG)
      keHoachHang.push({ ten, nhom, gia, von, loai: "product", donVi, phut: null, trongSo: w, coCo, mau });
  } else {
    for (const [ten, nhom, gia, phut] of DICH_VU_BAN_QUAY)
      keHoachHang.push({ ten, nhom, gia, von: null, loai: "service", donVi: null, phut, trongSo: 4, banQuay: true });
    for (const [ten, nhom, gia, phut, ngheCho, loaiTN, w] of DICH_VU_THU_CUNG)
      keHoachHang.push({ ten, nhom, gia, von: null, loai: "service", donVi: null, phut, trongSo: w, ngheCho, loaiTN });
    for (const [ten, nhom, gia, von, donVi, w] of HANG_THU_CUNG)
      keHoachHang.push({ ten, nhom, gia, von, loai: "product", donVi, phut: null, trongSo: w });
  }

  // `items` có UNIQUE (tenant_id, name) ⇒ neo bằng tên. Chèn với id UUIDv5 cho
  // tất định, nhưng nếu tên đã có thì bỏ qua và đọc lại id THẬT ở dưới.
  const nHang = await chenNhieu("items",
    ["id", "tenant_id", "name", "kind", "price_vnd", "duration_minutes", "unit", "group_name", "status", "sort_order"],
    keHoachHang.map((h, i) => [uuid5(`${T}:hang:${h.ten}`), T, h.ten, h.loai, h.gia,
      h.phut, h.donVi, h.nhom, "active", i]),
    "(tenant_id, name)");

  const { rows: hangDB } = await c.query(
    `select id, name, kind, price_vnd, duration_minutes from public.items
      where tenant_id = $1 and status = 'active' order by name`, [T]);
  const idHang = new Map(hangDB.map((r) => [r.name, r.id]));
  for (const h of keHoachHang) h.id = idHang.get(h.ten);
  const thieuId = keHoachHang.filter((h) => !h.id);
  if (thieuId.length) throw new Error(`Không tra ra id cho ${thieuId.length} mặt hàng — dừng.`);

  // GIÁ VỐN phải có TRƯỚC dòng đơn: `order_lines_snapshot_cost` chốt giá vốn
  // ngay lúc chèn dòng. Đặt sau là mọi dòng chốt NULL và lãi gộp thành vô nghĩa.
  const hangCoVon = keHoachHang.filter((h) => h.loai === "product");
  const nVon = await chenNhieu("item_costs", ["item_id", "tenant_id", "cost_vnd"],
    hangCoVon.map((h) => [h.id, T, h.von]), "(item_id)");

  // Biến thể cỡ/màu — chỉ shop thời trang. `item_variants` có UNIQUE
  // (tenant_id, sku) nên SKU là khoá neo. `price_vnd` để NULL = ăn theo giá mặt
  // hàng, đúng cách shop thời trang Việt bán: cùng mẫu thì mọi size một giá.
  let nBienThe = 0;
  const bienTheCua = new Map(); // ten hàng -> [{id, nhan}]
  if (slug === "sample-shop") {
    const hangBT = [];
    keHoachHang.forEach((h, iH) => {
      const cos = h.coCo?.length ? h.coCo : [null];
      const maus = h.mau?.length ? h.mau : [null];
      if (cos[0] === null && maus[0] === null) return; // món không có biến thể
      let k = 0;
      for (const co of cos) for (const mau of maus) {
        const sku = `SMB-${String(iH + 1).padStart(2, "0")}-${khongDau(co ?? "one").replace(/\s+/g, "").slice(0, 8)}-${khongDau(mau ?? "org").replace(/\s+/g, "").slice(0, 10)}`;
        const thuocTinh = {};
        if (co) thuocTinh["Cỡ"] = co;
        if (mau) thuocTinh["Màu"] = mau;
        const id = uuid5(`${T}:bienthe:${sku}`);
        hangBT.push([id, T, h.id, JSON.stringify(thuocTinh), null, sku, k++]);
        if (!bienTheCua.has(h.ten)) bienTheCua.set(h.ten, []);
        bienTheCua.get(h.ten).push({ sku, nhan: [co, mau].filter(Boolean).join(" · ") });
      }
    });
    nBienThe = await chenNhieu("item_variants",
      ["id", "tenant_id", "item_id", "attributes", "price_vnd", "sku", "sort_order"],
      hangBT, "(tenant_id, sku)");
    const { rows: btDB } = await c.query(
      `select id, sku from public.item_variants where tenant_id = $1`, [T]);
    const idBT = new Map(btDB.map((r) => [r.sku, r.id]));
    for (const ds of bienTheCua.values()) for (const v of ds) v.id = idBT.get(v.sku);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 2. TÀI NGUYÊN — để NGÀNH quyết, không ép ba tiệm giống nhau
  // ══════════════════════════════════════════════════════════════════════
  let nTaiNguyen = 0;
  const tnTheoLoai = new Map(); // 'bancattia' -> [id]
  if (slug === "sample-pet") {
    nTaiNguyen = await chenNhieu("resources", ["id", "tenant_id", "name", "kind", "is_active"],
      TAI_NGUYEN_THU_CUNG.map(([ten, kind]) => [uuid5(`${T}:tn:${ten}`), T, ten, kind, true]),
      "(tenant_id, name)");
    const { rows: tnDB } = await c.query(
      `select id, name from public.resources where tenant_id = $1 and is_active order by name`, [T]);
    const idTN = new Map(tnDB.map((r) => [r.name, r.id]));
    for (const [ten, , loai] of TAI_NGUYEN_THU_CUNG) {
      if (!loai) continue;
      if (!tnTheoLoai.has(loai)) tnTheoLoai.set(loai, []);
      tnTheoLoai.get(loai).push(idTN.get(ten));
    }
  }

  // Nhà cung cấp — `suppliers` không có khoá duy nhất nên neo bằng "đã có thì thôi".
  const tenNCC = slug === "sample-retail" ? "Công ty TNHH Mỹ Phẩm Sài Gòn Beauty"
    : slug === "sample-shop" ? "Xưởng may Tân Bình - đầu mối sỉ"
      : "Đại lý thú y - phụ kiện Bống Bang";
  await c.query(
    `insert into public.suppliers (tenant_id, name, phone, note)
     select $1,$2,$3,$4 where not exists (select 1 from public.suppliers where tenant_id=$1 and name=$2)`,
    [T, tenNCC, "02838" + String(100000 + (bam(slug) % 899999)), "Nhà cung cấp chính, công nợ 15 ngày."]);
  const { rows: [ncc] } = await c.query(
    `select id from public.suppliers where tenant_id = $1 and name = $2`, [T, tenNCC]);

  log(`  mặt hàng ${keHoachHang.length} (mới ${nHang}) · giá vốn ${hangCoVon.length} (mới ${nVon})`
    + ` · biến thể ${nBienThe > 0 ? "mới " + nBienThe : slug === "sample-shop" ? "đã có" : "không dùng (ngành không có size/màu)"}`
    + ` · tài nguyên ${slug === "sample-pet" ? "mới " + nTaiNguyen : "không dùng (bán lẻ không đặt chỗ)"}`);

  // ══════════════════════════════════════════════════════════════════════
  // 3. NGƯỜI TRONG TIỆM
  // ══════════════════════════════════════════════════════════════════════
  const { rows: nvRaw } = await c.query(
    `select id, user_id, full_name, note, base_salary_vnd, overtime_rate_vnd, annual_leave_days,
            to_char(started_on,'YYYY-MM-DD') vao, to_char(ended_on,'YYYY-MM-DD') nghi
       from public.employees where tenant_id = $1 order by started_on, full_name`, [T]);
  const NV = nvRaw.map((r, i) => ({
    id: r.id, uid: r.user_id, ten: r.full_name, nghe: G.nghe(r.note),
    vao: r.vao, nghiViec: r.nghi,
    luong: Number(r.base_salary_vnd), giaTangCa: Number(r.overtime_rate_vnd),
    phepNam: Number(r.annual_leave_days), thuTu: i,
  }));
  if (NV.some((n) => !n.uid)) throw new Error("Có hồ sơ nhân viên chưa nối auth.users — dừng.");
  const quyLuong = NV.filter((n) => !n.nghiViec).reduce((s, n) => s + n.luong, 0);
  log(`  nhân sự ${NV.length} hồ sơ (${NV.filter((n) => !n.nghiViec).length} đang làm)`
    + ` · quỹ lương ${tien(quyLuong)}đ/tháng`);

  const { rows: vai } = await c.query(
    `select tm.user_id, tm.role from public.tenant_members tm
      where tm.tenant_id = $1 and tm.status = 'active'`, [T]);
  const uidCua = new Map(NV.map((n) => [n.uid, n]));
  const chuTiem = vai.find((v) => v.role === "owner")?.user_id
    ?? vai.find((v) => v.role === "admin")?.user_id
    ?? NV.find((n) => n.nghe === "quanly")?.uid;
  const quanTri = vai.find((v) => v.role === "admin")?.user_id ?? chuTiem;
  if (!chuTiem || !quanTri) throw new Error("Tiệm thiếu vai chủ / quản trị — dừng.");

  const dangLamLuc = (nv, ngay) => {
    if (nv.vao && ngay < nv.vao) return false;
    if (nv.nghiViec && ngay > nv.nghiViec) return false;
    return true;
  };

  // ══════════════════════════════════════════════════════════════════════
  // 4. ĐƠN NGHỈ PHÉP — dựng TRƯỚC ca làm và trước lịch hẹn
  // Duyệt cho nghỉ mà vẫn xếp ca (hoặc vẫn xếp lịch hẹn) là hai màn hình nói
  // hai chuyện. Nên ngày nghỉ đã duyệt được tính vào ngay từ khâu lập kế hoạch.
  // ══════════════════════════════════════════════════════════════════════
  const nguoiXinNghi = NV.filter((n) => !n.nghiViec && n.nghe !== "quanly");
  const chonNghi = (i) => nguoiXinNghi[i % nguoiXinNghi.length];
  const LY_DO_NGHI = {
    "sample-retail": [
      ["2026-05-14", "2026-05-15", "paid", "Về quê giỗ nội."],
      ["2026-06-03", "2026-06-04", "sick", "Sốt siêu vi, có giấy khám."],
      ["2026-06-19", "2026-06-21", "paid", "Đi du lịch cùng gia đình."],
      ["2026-07-08", "2026-07-08", "sick", "Đau dạ dày, xin nghỉ 1 ngày."],
      ["2026-07-20", "2026-07-22", "paid", "Đám cưới em trai ở Long An."],
      ["2026-08-03", "2026-08-04", "unpaid", "Việc nhà, xin nghỉ không lương."],
      ["2026-08-12", "2026-08-13", "paid", "Đưa con đi nhập học."],
    ],
    "sample-shop": [
      ["2026-05-11", "2026-05-12", "paid", "Về quê thăm mẹ ốm."],
      ["2026-06-09", "2026-06-10", "sick", "Cảm cúm, có đơn thuốc."],
      ["2026-06-25", "2026-06-27", "paid", "Đi Đà Lạt cùng bạn."],
      ["2026-07-14", "2026-07-14", "sick", "Đau đầu, xin nghỉ 1 buổi."],
      ["2026-07-23", "2026-07-25", "paid", "Đám cưới bạn thân ở Cần Thơ."],
      ["2026-08-05", "2026-08-06", "unpaid", "Chuyển trọ, xin nghỉ không lương."],
      ["2026-08-14", "2026-08-14", "paid", "Đi làm giấy tờ ở quê."],
    ],
    "sample-pet": [
      ["2026-05-19", "2026-05-20", "paid", "Về quê giỗ ba."],
      ["2026-06-11", "2026-06-12", "sick", "Bị chó cào, đi tiêm phòng dại."],
      ["2026-06-29", "2026-07-01", "paid", "Đi Vũng Tàu cùng gia đình."],
      ["2026-07-09", "2026-07-09", "sick", "Dị ứng lông, xin nghỉ 1 ngày."],
      ["2026-07-27", "2026-07-29", "paid", "Đám cưới chị gái ở Bến Tre."],
      ["2026-08-06", "2026-08-07", "unpaid", "Việc nhà, xin nghỉ không lương."],
      ["2026-08-17", "2026-08-18", "paid", "Đưa mẹ đi khám bệnh."],
    ],
  }[slug];
  const CHO_DUYET = {
    "sample-retail": [["2026-08-24", "2026-08-26", "paid", "Về quê ăn giỗ, xin nghỉ 3 ngày."],
      ["2026-08-29", "2026-08-29", "paid", "Đi khám sức khoẻ định kỳ."],
      ["2026-09-02", "2026-09-04", "unpaid", "Chuyển nhà, xin nghỉ không lương."]],
    "sample-shop": [["2026-08-25", "2026-08-27", "paid", "Về quê dự đám giỗ."],
      ["2026-08-28", "2026-08-28", "paid", "Đi khám thai định kỳ."],
      ["2026-09-01", "2026-09-02", "unpaid", "Việc riêng, xin nghỉ không lương."]],
    "sample-pet": [["2026-08-26", "2026-08-28", "paid", "Về quê ăn cưới em họ."],
      ["2026-08-30", "2026-08-30", "paid", "Đi khám sức khoẻ định kỳ."],
      ["2026-09-03", "2026-09-04", "unpaid", "Việc nhà, xin nghỉ không lương."]],
  }[slug];
  const TU_CHOI = [
    ["2026-07-11", "2026-07-12", "paid", "Xin nghỉ cuối tuần đi chơi."],
    ["2026-08-15", "2026-08-16", "paid", "Xin nghỉ hai ngày cuối tuần."],
  ];

  const donNghi = [];
  LY_DO_NGHI.forEach(([tu, den, loai, ly], i) => donNghi.push({
    nv: chonNghi(i * 3 + 1), tu, den, loai, ly, trangThai: "approved",
    boi: i % 2 === 0 ? quanTri : chuTiem, luc: gioVN(themNgay(tu, -3), 10 * 60),
  }));
  CHO_DUYET.forEach(([tu, den, loai, ly], i) => donNghi.push({
    nv: chonNghi(i * 5 + 2), tu, den, loai, ly, trangThai: "pending", boi: null, luc: null,
  }));
  TU_CHOI.forEach(([tu, den, loai, ly], i) => donNghi.push({
    nv: chonNghi(i * 7 + 4), tu, den, loai, ly, trangThai: "rejected",
    boi: quanTri, luc: gioVN(themNgay(tu, -4), 15 * 60),
  }));

  let themNghi = 0;
  for (const d of donNghi) {
    const { rowCount } = await c.query(
      `insert into public.leave_requests
         (tenant_id, employee_id, from_date, to_date, kind, reason, status, decided_by, decided_at)
       select $1,$2,$3::date,$4::date,$5,$6,$7,$8,$9::timestamptz
        where not exists (select 1 from public.leave_requests
                           where tenant_id=$1 and employee_id=$2 and from_date=$3::date)`,
      [T, d.nv.id, d.tu, d.den, d.loai, d.ly, d.trangThai, d.boi, d.luc]);
    themNghi += rowCount;
  }
  // Đọc LẠI từ CSDL để dùng cả đơn của lần chạy trước.
  const { rows: nghiRows } = await c.query(
    `select employee_id, to_char(from_date,'YYYY-MM-DD') tu, to_char(to_date,'YYYY-MM-DD') den
       from public.leave_requests where tenant_id = $1 and status = 'approved'`, [T]);
  const ngayNghi = new Set();
  for (const r of nghiRows)
    for (let d = r.tu; d <= r.den; d = themNgay(d, 1)) ngayNghi.add(`${r.employee_id}|${d}`);

  /** Ca THẬT của một người một ngày, đã trừ ngày nghỉ đã duyệt. */
  const caCua = (nv, ngay) => {
    if (!dangLamLuc(nv, ngay)) return null;
    if (ngayNghi.has(`${nv.id}|${ngay}`)) return "off";
    return caTrongNgay(slug, nv.nghe, nv.thuTu, ngay);
  };
  /** Người của nhóm nghề nào ĐANG CÓ MẶT vào phút `phut` của ngày `ngay`. */
  const nguoiTrucLuc = (nhomNghe, ngay, phut) => NV.filter((nv) => {
    if (!nhomNghe.includes(nv.nghe)) return false;
    const k = caCua(nv, ngay);
    if (!k || k === "off") return false;
    const g = G.gioCa[k];
    return phut >= g.vao - 30 && phut <= g.ra + 30;
  });

  // ══════════════════════════════════════════════════════════════════════
  // 5. KHÁCH HÀNG
  // Danh sách dựng HOÀN TOÀN từ hạt giống, KHÔNG nhìn vào CSDL — nếu kế hoạch
  // phụ thuộc vào cái chính nó vừa ghi thì lần chạy thứ hai ra kế hoạch khác và
  // đẻ mẻ dữ liệu thứ hai. SĐT trùng người có sẵn thì DÙNG LẠI người đó.
  // ══════════════════════════════════════════════════════════════════════
  const SO_KHACH = G.quyMo.khach;
  const khachMoi = [];
  const daDungSdt = new Set();
  for (let i = 0; khachMoi.length < SO_KHACH && i < SO_KHACH * 4; i++) {
    const dau = DAU_SO[i % DAU_SO.length];
    const duoi = String(1_000_000 + ((i * 7919 + bam(slug) % 1_000_000) % 9_000_000)).slice(0, 7);
    const sdt = dau + duoi;
    const e164 = "+84" + sdt.slice(1);
    if (daDungSdt.has(e164)) continue;
    daDungSdt.add(e164);
    const nam = nn(slug, e164, "gioitinh") < (slug === "sample-pet" ? 0.30 : slug === "sample-shop" ? 0.08 : 0.12);
    const ten = nam
      ? `${nnChon(HO, slug, e164, "ho")} ${nnChon(DEM_NAM, slug, e164, "dem")} ${nnChon(TEN_NAM, slug, e164, "ten")}`
      : `${nnChon(HO, slug, e164, "ho")} ${nnChon(DEM_NU, slug, e164, "dem")} ${nnChon(TEN_NU, slug, e164, "ten")}`;
    khachMoi.push({
      id: uuid5(`${T}:khach:${e164}`), ten, sdt, e164,
      tinh: nnChon(PHUONG, slug, e164, "tinh"),
      taoLuc: mocVN(themNgay(BAT_DAU, nnInt(0, 108, slug, e164, "ngaytao")), nnInt(8, 20, slug, e164, "giotao") * 60),
    });
  }
  const SDT_DU_KIEN = new Set(khachMoi.map((k) => k.e164));
  const { rows: khachCu } = await c.query(
    `select id, phone_e164 from public.contacts where tenant_id = $1 and deleted_at is null order by id`, [T]);
  const theoSdt = new Map(khachCu.filter((k) => k.phone_e164).map((k) => [k.phone_e164, k.id]));
  const khachNen = khachCu.filter((k) => !k.phone_e164 || !SDT_DU_KIEN.has(k.phone_e164));
  for (const k of khachMoi) k.id = theoSdt.get(k.e164) ?? k.id;

  const canChen = khachMoi.filter((k) => !theoSdt.has(k.e164));
  const nKhach = await chenNhieu("contacts",
    ["id", "tenant_id", "full_name", "phone", "phone_e164", "province", "lifecycle", "created_at", "updated_at"],
    canChen.map((k) => [k.id, T, k.ten, k.sdt, k.e164, k.tinh, "lead", k.taoLuc, k.taoLuc]));

  // Hồ khách để bốc. Một phần là "khách ruột" — tiệm thật nào cũng có nhóm quay
  // lại nhiều lần, và đó chính là thứ làm hạng khách / doanh thu tích luỹ có nghĩa.
  const moiKhach = [...khachNen.map((k) => ({ id: k.id })), ...khachMoi.map((k) => ({ id: k.id }))];
  const khachRuot = moiKhach.filter((_, i) => i % 4 === 0);
  const bocKhach = (...hat) => (nn(...hat, "ruot") < 0.45
    ? nnChon(khachRuot, ...hat, "kr") : nnChon(moiKhach, ...hat, "km"));
  log(`  khách hàng ${moiKhach.length} (mới ${nKhach}) · đơn nghỉ phép mới ${themNghi}/${donNghi.length}`);

  // ══════════════════════════════════════════════════════════════════════
  // 6. LỊCH HẸN — chỉ tiệm thú cưng
  // Hai tiệm bán lẻ trục chính là ĐƠN HÀNG, không phải lịch: ép cửa hàng mỹ
  // phẩm phải đặt lịch mới mua được son là dựng ra một tiệm không có thật.
  // ══════════════════════════════════════════════════════════════════════
  const lichHen = [];
  if (slug === "sample-pet") {
    const dvHen = keHoachHang.filter((h) => h.loai === "service" && !h.banQuay);
    const NHU_CAU = dvHen.map((h) => [h.ten, h.trongSo]);
    const dvTheoTen = new Map(dvHen.map((h) => [h.ten, h]));

    // Giờ đã kín — phải nạp ca CÓ SẴN, nếu không sẽ đụng ràng buộc EXCLUDE
    // `appointments_no_overlap_staff` / `_resource`. Nhưng phải LOẠI ca do chính
    // script này từng ghi: kể chúng vào thì lần chạy thứ hai xếp ra thời khoá
    // biểu khác lần đầu.
    const ID_DU_KIEN = new Set();
    for (let n = 1; n <= 6000; n++) ID_DU_KIEN.add(uuid5(`${T}:lich:${MA_ME}:${n}`));
    const { rows: caCuTatCa } = await c.query(
      `select id, staff_user_id, resource_id, start_at, end_at from public.appointments
        where tenant_id = $1 and deleted_at is null order by start_at, id`, [T]);
    const kin = new Map();
    const banRoi = (khoa, tu, den) => (kin.get(khoa) ?? []).some(([a, b]) => tu < b && den > a);
    const ghiKin = (khoa, tu, den) => {
      if (!kin.has(khoa)) kin.set(khoa, []);
      kin.get(khoa).push([tu, den]);
    };
    for (const r of caCuTatCa.filter((r) => !ID_DU_KIEN.has(r.id))) {
      ghiKin("nv:" + r.staff_user_id, +new Date(r.start_at), +new Date(r.end_at));
      if (r.resource_id) ghiKin("tn:" + r.resource_id, +new Date(r.start_at), +new Date(r.end_at));
    }

    const [gioMo, gioDong] = G.gioHen;
    let stt = 0;
    for (let ngay = BAT_DAU; ngay <= KET_THUC_LICH; ngay = themNgay(ngay, 1)) {
      const d = thu(ngay);
      const tuongLai = ngay > HOM_NAY;
      const soCa = tuongLai
        ? G.quyMo.caSapToi + nnInt(0, 4, slug, ngay, "sapca")
        : G.quyMo.caNgayThuong + (d === 0 || d === 6 ? G.quyMo.caCuoiTuan : 0)
          + nnInt(0, G.quyMo.caDaoDong, slug, ngay, "daoca");

      for (let k = 0; k < soCa; k++) {
        const hat = [slug, ngay, k];
        const tenDv = nnTrongSo(NHU_CAU, ...hat, "dv");
        const dv = dvTheoTen.get(tenDv);
        const ungVien = NV.filter((n) => dv.ngheCho.includes(n.nghe)
          && (caCua(n, ngay) ?? "off") !== "off");
        const dsTN = tnTheoLoai.get(dv.loaiTN) ?? [];
        if (ungVien.length === 0 || dsTN.length === 0) continue;

        // Tìm cặp (người, chỗ) rảnh SỚM NHẤT — cách này bảo đảm không bao giờ
        // đè giờ của cùng một người, và cũng không xếp hai con thú vào một bàn.
        let chon = null;
        for (let p = gioMo; p + dv.phut <= gioDong && !chon; p += 15) {
          const tu = +mocVN(ngay, p), den = tu + dv.phut * 60000;
          for (const nv of ungVien) {
            const g = G.gioCa[caCua(nv, ngay)];
            if (p < g.vao || p + dv.phut > g.ra) continue;
            if (banRoi("nv:" + nv.uid, tu, den)) continue;
            const tn = dsTN.find((x) => !banRoi("tn:" + x, tu, den));
            if (!tn) continue;
            chon = { nv, tn, tu, den };
            break;
          }
        }
        if (!chon) continue;
        ghiKin("nv:" + chon.nv.uid, chon.tu, chon.den);
        ghiKin("tn:" + chon.tn, chon.tu, chon.den);

        const trangThai = tuongLai ? "booked"
          : nnTrongSo([["done", 88], ["cancelled", 6], ["no_show", 6]], ...hat, "tt");
        const gia = nn(...hat, "uudai") < 0.15
          ? Math.round((dv.gia * 0.9) / 1000) * 1000 : dv.gia;
        const quay = nguoiTrucLuc(G.nguoiQuay, ngay, gioMo + 60);
        lichHen.push({
          id: uuid5(`${T}:lich:${MA_ME}:${++stt}`),
          khach: bocKhach(slug, ngay, k, "khach").id,
          nhanVien: chon.nv.uid, taiNguyen: chon.tn, item: dv.id, tenDv,
          batDau: new Date(chon.tu), ketThuc: new Date(chon.den), ngay,
          trangThai, gia,
          note: nnTrongSo([[null, 70],
            ["Bé nhát người lạ, dặn kỹ thuật viên nhẹ tay.", 6],
            ["Chủ dặn không cạo sát, chỉ tỉa gọn.", 6],
            ["Bé bị dị ứng sữa tắm thường, dùng loại trị liệu.", 5],
            ["Khách hay tới trễ 10 phút.", 5],
            ["Lần đầu tới tiệm, cần tư vấn kỹ.", 8]], ...hat, "note"),
          lyDoHuy: trangThai === "cancelled"
            ? nnChon(["Chủ bận đột xuất, hẹn tuần sau", "Bé ốm, dời sang tuần sau",
              "Kẹt xe, xin dời buổi khác", "Trùng lịch, khách xin huỷ"], ...hat, "huy") : null,
          nguon: nn(...hat, "nguon") < 0.42 ? "chat" : "calendar",
          taoBoi: (quay[0] ?? NV.find((n) => n.nghe === "quanly"))?.uid ?? chuTiem,
        });
      }
    }
    const daCoLich = await daCo("appointments", lichHen.map((l) => l.id));
    const lichChen = lichHen.filter((l) => !daCoLich.has(l.id));
    const nLich = await chenNhieu("appointments",
      ["id", "tenant_id", "contact_id", "staff_user_id", "resource_id", "item_id",
        "start_at", "end_at", "status", "price_vnd", "note", "source", "cancel_reason",
        "created_by", "created_at", "updated_at"],
      lichChen.map((l) => [l.id, T, l.khach, l.nhanVien, l.taiNguyen, l.item,
        l.batDau, l.ketThuc, l.trangThai, l.gia, l.note, l.nguon, l.lyDoHuy, l.taoBoi,
        new Date(+l.batDau - 2 * 86400000), l.batDau]));
    log(`  lịch hẹn ${lichHen.length} (mới ${nLich})`);
  } else {
    log(`  lịch hẹn: KHÔNG dựng — ngành bán lẻ trục chính là đơn hàng, không phải đặt lịch`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 7. KẾ HOẠCH ĐƠN HÀNG (chưa ghi — còn phải tính lượng nhập hàng trước)
  // ══════════════════════════════════════════════════════════════════════
  const sanPham = keHoachHang.filter((h) => h.loai === "product");
  const dsBanTrongSo = sanPham.map((h) => [h.ten, h.trongSo]);
  const hangTheoTen = new Map(keHoachHang.map((h) => [h.ten, h]));
  const donHang = [];
  let sttDon = 0;
  const themDon = (d) => { donHang.push(d); return d; };

  /** Một dòng hàng hoá: chọn mặt hàng, số lượng, giảm giá, người bán. */
  const dongSanPham = (ngay, phut, hat, daCoTen) => {
    let ten = nnTrongSo(dsBanTrongSo, ...hat, "sp");
    if (daCoTen.has(ten)) {
      ten = nnTrongSo(dsBanTrongSo, ...hat, "sp2");
      if (daCoTen.has(ten)) return null;
    }
    daCoTen.add(ten);
    const h = hangTheoTen.get(ten);
    const sl = nnTrongSo([[1, 78], [2, 17], [3, 5]], ...hat, "sl");
    const nguoi = nguoiTrucLuc(G.nguoiBan, ngay, phut);
    if (nguoi.length === 0) return null;
    const ban = nnChon(nguoi, ...hat, "nguoiban");
    // Giảm giá: khách quen / mua nhiều mới có, và không quá 10% — vượt là đụng
    // `order_lines_giam_khong_vuot_gia_dong` và cũng không giống tiệm thật.
    const giam = nn(...hat, "giam") < 0.14
      ? Math.round((h.gia * sl * (nn(...hat, "mucgiam") < 0.5 ? 0.05 : 0.10)) / 1000) * 1000 : 0;
    let bienThe = null;
    const ds = bienTheCua.get(ten);
    if (ds?.length) bienThe = nnChon(ds, ...hat, "bt");
    return {
      item: h.id, variant: bienThe?.id ?? null, qty: sl, donGia: h.gia, giam,
      lich: null, lamBoi: ban.uid, ten,
    };
  };

  if (slug === "sample-pet") {
    // 7a. Đơn mọc TỪ ca đã làm xong — đúng đời thật: xong dịch vụ mới ra quầy trả tiền.
    for (const l of lichHen.filter((x) => x.trangThai === "done")) {
      const hat = [slug, "don", l.id];
      if (nn(...hat, "radon") > G.quyMo.tyLeRaDon) continue; // vài ca dùng gói / trả sau
      const phut = new Date(+l.ketThuc + 7 * 3600000).getUTCHours() * 60
        + new Date(+l.ketThuc + 7 * 3600000).getUTCMinutes() + 5;
      const luc = new Date(+l.ketThuc + 5 * 60000);
      const dong = [{
        item: l.item, variant: null, qty: 1, donGia: l.gia, giam: 0,
        lich: l.id, lamBoi: l.nhanVien, ten: l.tenDv, // ⇐ mấu chốt để hoa hồng về đúng thợ
      }];
      // Làm thêm dịch vụ nhanh ngay tại chỗ (tắm xong cắt móng luôn). KHÔNG sinh
      // thêm ca hẹn: đây là việc phát sinh tại quầy, ép thành ca hẹn là chiếm
      // thêm một ô giờ mà khách không hề đặt. Hoa hồng vẫn về đúng người nhờ
      // `performed_by_user_id` — phép nối lấy cột đó TRƯỚC `staff_user_id`.
      if (nn(...hat, "themdv") < G.quyMo.tyLeThemDichVu) {
        const them = hangTheoTen.get("Cắt móng và vệ sinh tai");
        if (them && l.tenDv !== them.ten)
          dong.push({ item: them.id, variant: null, qty: 1, donGia: them.gia, giam: 0, lich: null, lamBoi: l.nhanVien, ten: them.ten });
      }
      if (nn(...hat, "bankem") < G.quyMo.tyLeBanKem) {
        const d = dongSanPham(l.ngay, phut, [...hat, "kem"], new Set());
        if (d) dong.push(d);
      }
      themDon({
        id: uuid5(`${T}:don:${MA_ME}:${++sttDon}`), khach: l.khach, lich: l.id, luc, ngay: l.ngay, dong,
        trangThai: nnTrongSo([["completed", 93], ["confirmed", 3], ["draft", 2], ["cancelled", 2]], ...hat, "tt"),
        taoBoi: (nguoiTrucLuc(G.nguoiQuay, l.ngay, phut)[0] ?? uidCua.get(l.nhanVien) ?? { uid: chuTiem }).uid ?? chuTiem,
      });
    }
    // 7b. Khách ghé mua lẻ thức ăn / phụ kiện, không đặt lịch.
    for (let ngay = BAT_DAU; ngay <= HOM_NAY; ngay = themNgay(ngay, 1)) {
      const soDon = G.quyMo.donMuaLe + nnInt(-2, 3, slug, ngay, "muale");
      for (let i = 0; i < soDon; i++) {
        const hat = [slug, "le", ngay, i];
        const phut = nnInt(G.gioBan[0], G.gioBan[1] - 30, ...hat, "gio");
        const quay = nguoiTrucLuc(G.nguoiQuay, ngay, phut);
        if (quay.length === 0) continue;
        const daCoTen = new Set();
        const dong = [];
        const soDongDon = nnTrongSo(G.soDong, ...hat, "sodong");
        for (let j = 0; j < soDongDon; j++) {
          const d = dongSanPham(ngay, phut, [...hat, j], daCoTen);
          if (d) dong.push(d);
        }
        // Thỉnh thoảng khách gửi bé lại trông vài ngày.
        if (nn(...hat, "tronggiu") < 0.06) {
          const tg = hangTheoTen.get("Trông giữ thú cưng theo ngày");
          const ban = nnChon(quay, ...hat, "bantronggiu");
          dong.push({ item: tg.id, variant: null, qty: nnInt(1, 3, ...hat, "songay"), donGia: tg.gia, giam: 0, lich: null, lamBoi: ban.uid, ten: tg.ten });
        }
        if (dong.length === 0) continue;
        themDon({
          id: uuid5(`${T}:don:${MA_ME}:${++sttDon}`), khach: bocKhach(...hat, "khach").id,
          lich: null, luc: mocVN(ngay, phut), ngay, dong,
          trangThai: nnTrongSo([["completed", 95], ["cancelled", 3], ["draft", 2]], ...hat, "tt"),
          taoBoi: nnChon(quay, ...hat, "quay").uid,
        });
      }
    }
  } else {
    // Bán lẻ / bán online: một trục duy nhất là ĐƠN HÀNG.
    for (let ngay = BAT_DAU; ngay <= HOM_NAY; ngay = themNgay(ngay, 1)) {
      const d = thu(ngay);
      const soDon = G.quyMo.donNgayThuong + (d === 0 || d === 6 ? G.quyMo.donCuoiTuan : 0)
        + nnInt(0, G.quyMo.donDaoDong, slug, ngay, "daodon");
      for (let i = 0; i < soDon; i++) {
        const hat = [slug, "don", ngay, i];
        const phut = nnInt(G.gioBan[0], G.gioBan[1] - 30, ...hat, "gio");
        const quay = nguoiTrucLuc(G.nguoiQuay, ngay, phut);
        if (quay.length === 0) continue;
        const daCoTen = new Set();
        const dong = [];
        const soDongDon = nnTrongSo(G.soDong, ...hat, "sodong");
        for (let j = 0; j < soDongDon; j++) {
          const x = dongSanPham(ngay, phut, [...hat, j], daCoTen);
          if (x) dong.push(x);
        }
        if (dong.length === 0) continue;
        themDon({
          id: uuid5(`${T}:don:${MA_ME}:${++sttDon}`), khach: bocKhach(...hat, "khach").id,
          lich: null, luc: mocVN(ngay, phut), ngay, dong,
          trangThai: nnTrongSo([["completed", 94], ["confirmed", 2], ["draft", 1], ["cancelled", 3]], ...hat, "tt"),
          taoBoi: nnChon(quay, ...hat, "quay").uid,
        });
      }
    }
  }

  /**
   * PHIẾU TRẢ HÀNG — bán online tỉ lệ trả hàng cao, đó là sự thật của ngành
   * (không vừa size, màu lệch ảnh). `qty` ÂM là luật của `order_lines_sign_guard`,
   * và KHÔNG có phiếu thu: `order_payments_guard` chặn thu tiền vào đơn tổng âm.
   */
  const phieuHoan = [];
  if (G.quyMo.hoanTra > 0) {
    const donXong = donHang.filter((d) => d.trangThai === "completed" && d.dong.length > 0);
    const soHoan = Math.round(donXong.length * G.quyMo.hoanTra);
    for (let i = 0; i < soHoan; i++) {
      const goc = donXong[Math.floor((i * donXong.length) / soHoan)];
      const dongGoc = goc.dong[0];
      // Trả trong vòng 3-9 ngày, và không được rơi vào tương lai.
      const luc = new Date(Math.min(+goc.luc + nnInt(3, 9, slug, "hoan", i) * 86400000,
        +mocVN(HOM_NAY, 10 * 60)));
      phieuHoan.push({
        id: uuid5(`${T}:hoan:${MA_ME}:${i + 1}`), goc: goc.id, khach: goc.khach,
        luc, ngay: ngayVN(luc), hoan: true,
        dong: [{ item: dongGoc.item, variant: dongGoc.variant, qty: -1, donGia: dongGoc.donGia,
          giam: 0, lich: null, lamBoi: dongGoc.lamBoi, ten: dongGoc.ten }],
        taoBoi: goc.taoBoi, trangThai: "completed",
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 8. PHIẾU NHẬP HÀNG — nhập TRƯỚC khi bán
  // Kế hoạch bán đã có trong bộ nhớ, nên đếm được cần nhập bao nhiêu mà KHÔNG
  // phải đọc CSDL ⇒ lần chạy thứ hai vẫn ra đúng kế hoạch nhập cũ.
  // Đi đúng đường sản phẩm: `purchases_sinh_dong_kho` cũng là AFTER UPDATE OF
  // status ⇒ chèn `draft` → thêm dòng → chuyển `completed`.
  // ══════════════════════════════════════════════════════════════════════
  const banTheoThang = new Map();
  for (const d of [...donHang, ...phieuHoan]) {
    if (d.trangThai !== "completed") continue;
    const thang = d.ngay.slice(0, 7);
    for (const x of d.dong) {
      const h = hangTheoTen.get(x.ten);
      if (!h || h.loai !== "product") continue;
      const k = `${thang}|${h.ten}`;
      banTheoThang.set(k, (banTheoThang.get(k) ?? 0) + x.qty);
    }
  }
  const phieuNhap = [], dongNhap = [];
  const cacThang = [...new Set([...banTheoThang.keys()].map((k) => k.split("|")[0]))].sort();
  const nguoiNhap = NV.find((n) => n.nghe === "thukho") ?? NV.find((n) => n.nghe === "quanly");
  for (const thang of cacThang) {
    const id = uuid5(`${T}:nhap:${MA_ME}:${thang}`);
    const [y, m] = thang.split("-").map(Number);
    const ngayNhap = `${thang}-01`;
    phieuNhap.push([id, T, ncc.id, "draft", `Nhập hàng tháng ${m}/${y}`,
      mocVN(ngayNhap, 9 * 60), nguoiNhap?.uid ?? chuTiem, mocVN(ngayNhap, 9 * 60), mocVN(ngayNhap, 9 * 60)]);
    sanPham.forEach((h, i) => {
      const ban = banTheoThang.get(`${thang}|${h.ten}`) ?? 0;
      // Mua dư ~25% và làm tròn lên — tiệm mua theo thùng, không mua lẻ đúng
      // bằng số sẽ bán. Phần dư chính là tồn kho cuối kỳ.
      const toiThieu = h.von > 300_000 ? 5 : 10;
      const buoc = h.von > 300_000 ? 5 : 10;
      const sl = Math.max(toiThieu, Math.ceil((ban * 1.25) / buoc) * buoc);
      dongNhap.push([uuid5(`${T}:nhapdong:${MA_ME}:${thang}:${h.ten}`), T, id, h.id, sl, 1, h.von, i]);
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
  // Chuyển trạng thái cho MỌI phiếu trong kế hoạch (không riêng phiếu mới) và
  // kèm `where status='draft'` ⇒ lần chạy trước chết giữa chừng thì lần này vá.
  for (const p of phieuNhap)
    await c.query(`update public.purchases set status='completed' where id=$1 and status='draft'`, [p[0]]);
  log(`  phiếu nhập ${phieuNhap.length} (mới ${nNhap}, ${nDongNhap} dòng)`);

  // ══════════════════════════════════════════════════════════════════════
  // 9. GHI ĐƠN HÀNG — draft → dòng → thu tiền → confirmed → completed
  // Ghi theo TỪNG MẺ có begin/commit riêng: mẻ này ghi vài nghìn đơn, chết giữa
  // chừng mà gói hết vào một giao dịch là mất sạch công.
  // ══════════════════════════════════════════════════════════════════════
  const tatCaDon = [...donHang, ...phieuHoan];
  const daCoDon = await daCo("orders", tatCaDon.map((d) => d.id));
  const donChen = tatCaDon.filter((d) => !daCoDon.has(d.id));

  // Đơn chốt qua chat: chỉ nối được khi hội thoại ĐÚNG của khách đó — nối bừa
  // vào hội thoại người khác là ghi sai ai nói chuyện với ai.
  const { rows: hoiThoai } = await c.query(
    `select id, contact_id from public.conversations where tenant_id = $1 and contact_id is not null`, [T]);
  const chatCua = new Map(hoiThoai.map((r) => [r.contact_id, r.id]));

  let nDon = 0, nDong = 0, nThu = 0;
  for (let i = 0; i < donChen.length; i += 300) {
    const me = donChen.slice(i, i + 300);
    await c.query("begin");
    nDon += await chenNhieu("orders",
      ["id", "tenant_id", "contact_id", "kind", "parent_order_id", "status",
        "source_appointment_id", "source_conversation_id", "created_by", "created_at", "updated_at"],
      me.map((d) => [d.id, T, d.khach, d.hoan ? "return" : "order", d.goc ?? null, "draft",
        d.lich ?? null, d.hoan ? null : (chatCua.get(d.khach) ?? null), d.taoBoi, d.luc, d.luc]));

    const dongDon = [], phieuThu = [];
    for (const d of me) {
      d.dong.forEach((x, j) => dongDon.push([uuid5(`${T}:dong:${d.id}:${j}`), T, d.id, x.item,
        x.variant, x.lich, x.lamBoi, x.qty, x.donGia, x.giam, j]));
      if (d.hoan) continue; // phiếu hoàn không có phiếu thu
      const tong = d.dong.reduce((s, x) => s + x.qty * x.donGia - x.giam, 0);
      if (tong <= 0) continue;
      if (d.trangThai === "completed") {
        // Bán online thì tiền vào chủ yếu bằng chuyển khoản / VietQR; bán tại
        // quầy thì tiền mặt còn nhiều. Đây là khác biệt thật giữa hai mô hình.
        const cachTra = slug === "sample-shop"
          ? nnTrongSo([["bank_transfer", 34], ["vietqr", 40], ["cash", 26]], slug, d.id, "cach")
          : nnTrongSo([["cash", 44], ["bank_transfer", 20], ["vietqr", 36]], slug, d.id, "cach");
        phieuThu.push([uuid5(`${T}:thu:${d.id}`), T, d.id, cachTra, tong, d.taoBoi, d.luc,
          uuid5(`${T}:thuref:${d.id}`)]);
      } else if (d.trangThai === "confirmed") {
        // Đã chốt nhưng mới đặt cọc — nuôi đúng câu hỏi "ai còn nợ tiền".
        // Kẹp trong [1đ, tổng đơn]: `order_payments_guard` chặn thu vượt tổng.
        const coc = Math.min(tong, Math.max(50_000, Math.round((tong * 0.4) / 10_000) * 10_000));
        phieuThu.push([uuid5(`${T}:thu:${d.id}`), T, d.id, "cash", coc, d.taoBoi, d.luc,
          uuid5(`${T}:thuref:${d.id}`)]);
      }
    }
    nDong += await chenNhieu("order_lines",
      ["id", "tenant_id", "order_id", "item_id", "variant_id", "appointment_id",
        "performed_by_user_id", "qty", "unit_price_vnd", "discount_vnd", "sort_order"], dongDon);
    nThu += await chenNhieu("order_payments",
      ["id", "tenant_id", "order_id", "method", "amount_vnd", "received_by", "received_at", "provider_ref"],
      phieuThu);
    await c.query("commit");
  }

  // Chuyển trạng thái — ĐÂY là chỗ trigger sinh kho / sổ quỹ / hoa hồng.
  // Chạy trên TOÀN BỘ kế hoạch (không riêng đơn mới) và luôn kèm `where status`
  // ⇒ vừa vá được lần chạy hỏng trước, vừa là no-op khi đã xong.
  await doiTrangThai(tatCaDon.filter((d) => d.hoan || ["confirmed", "completed"].includes(d.trangThai))
    .map((d) => d.id), "confirmed", "draft");
  await doiTrangThai(tatCaDon.filter((d) => d.hoan || d.trangThai === "completed")
    .map((d) => d.id), "completed", "confirmed");
  const canHuy = tatCaDon.filter((d) => !d.hoan && d.trangThai === "cancelled");
  for (let i = 0; i < canHuy.length; i += 200) {
    const me = canHuy.slice(i, i + 200);
    await c.query(
      `update public.orders set status='cancelled', cancel_reason=$2, cancelled_by=$3
        where id = any($1::uuid[]) and status in ('draft','confirmed')`,
      [me.map((d) => d.id), "Khách đổi ý, huỷ đơn", me[0].taoBoi]);
  }
  log(`  đơn hàng ${tatCaDon.length} (mới ${nDon}; gồm ${phieuHoan.length} phiếu trả hàng)`
    + ` · dòng đơn mới ${nDong} · phiếu thu mới ${nThu}`);

  // ── Kéo mốc phiếu quỹ do trigger sinh về đúng ngày chứng từ gốc ─────────
  // Không thêm dòng, không đổi số tiền — chỉ sửa mốc, nếu không Sổ quỹ dồn hết
  // vào phút chạy script.
  const { rowCount: nQuy } = await c.query(
    `update public.cash_entries ce set created_at = op.received_at
       from public.order_payments op
      where ce.order_payment_id = op.id and ce.tenant_id = $1
        and ce.created_at is distinct from op.received_at`, [T]);

  // Ai đã có đơn XONG thì mới thật sự là khách hàng — không tự phong khách cho
  // người chưa mua gì.
  const { rowCount: nKhachThat } = await c.query(
    `update public.contacts ct set lifecycle = 'customer'
      where ct.tenant_id = $1 and ct.lifecycle <> 'customer'
        and exists (select 1 from public.orders o where o.contact_id = ct.id
                     and o.status='completed' and o.kind='order' and o.deleted_at is null)`, [T]);
  // Mốc tương tác cuối — kéo theo việc tính lại HẠNG khách (trigger
  // `contacts_tier_recompute`), nếu không ai cũng đứng hạng "new".
  const { rowCount: nMoc } = await c.query(
    `update public.contacts ct set last_interaction_at = m.luc
       from (select x.contact_id, max(x.luc) luc from (
               select contact_id, start_at luc from public.appointments
                where tenant_id=$1 and deleted_at is null and start_at <= now()
               union all
               select contact_id, created_at from public.orders where tenant_id=$1 and deleted_at is null
             ) x group by x.contact_id) m
      where ct.id = m.contact_id and ct.tenant_id = $1
        and ct.last_interaction_at is distinct from m.luc`, [T]);
  log(`  kéo mốc ${nQuy} phiếu quỹ · nâng ${nKhachThat} người lên "khách hàng" · ${nMoc} mốc tương tác`);

  // ══════════════════════════════════════════════════════════════════════
  // 10. NHÂN SỰ — LÀM SAU ĐƠN HÀNG
  // Hoa hồng đã sinh đủ ở bước 9 rồi mới tới đây chốt lương. Chốt trước rồi hoa
  // hồng mới sinh thì phiếu lương thiếu tiền — đúng lỗi đã xảy ra ở tiệm spa.
  // ══════════════════════════════════════════════════════════════════════
  await napNhanSu({ T, slug, G, NV, quanTri, chuTiem, caCua });

  // ══════════════════════════════════════════════════════════════════════
  // 11. NGHIỆM THU
  // ══════════════════════════════════════════════════════════════════════
  const sau = await dem();
  log("\n  ── SỐ DÒNG TRƯỚC / SAU ──────────────────────────────────────────");
  log("    bảng                  trước       sau      tăng   nguồn");
  const NGUON_TRIGGER = new Set(["stock_moves", "commission_entries"]);
  for (const b of BANG_DEM) {
    const d = sau[b] - truoc[b];
    const nguon = NGUON_TRIGGER.has(b) ? "◀ TRIGGER"
      : b === "cash_entries" ? "◀ TRIGGER (+ phiếu chi lương)" : "script ghi";
    log(`    ${b.padEnd(20)}${String(truoc[b]).padStart(7)}${String(sau[b]).padStart(10)}${String(d).padStart(10)}   ${nguon}`);
  }

  // ĐỐI CHỨNG 2: đơn đã xong mà tiền thu ≠ tổng dòng đơn phải = 0.
  const { rows: [lech] } = await c.query(
    `select count(*)::int n from (
       select o.id,
              coalesce((select sum(l.line_total_vnd) from public.order_lines l where l.order_id=o.id),0) tong,
              coalesce((select sum(p.amount_vnd) from public.order_payments p where p.order_id=o.id),0) thu
         from public.orders o
        where o.tenant_id=$1 and o.status='completed' and o.kind='order' and o.deleted_at is null
     ) x where x.tong <> x.thu`, [T]);
  // ĐỐI CHỨNG 3a: tồn kho không âm.
  const { rows: ton } = await c.query(
    `select i.name, coalesce(sum(sm.qty),0)::int ton
       from public.items i left join public.stock_moves sm on sm.item_id = i.id
      where i.tenant_id=$1 and i.kind='product' group by 1 order by 2`, [T]);
  const tonAm = ton.filter((r) => r.ton < 0);
  // ĐỐI CHỨNG 3b: không lịch hẹn nào chồng giờ cùng một người / cùng một chỗ.
  const { rows: [chong] } = await c.query(
    `select
       (select count(*)::int from public.appointments a join public.appointments b
          on a.tenant_id=b.tenant_id and a.staff_user_id=b.staff_user_id and a.id < b.id
         and a.deleted_at is null and b.deleted_at is null
         and tstzrange(a.start_at,a.end_at) && tstzrange(b.start_at,b.end_at)
        where a.tenant_id=$1) nguoi,
       (select count(*)::int from public.appointments a join public.appointments b
          on a.tenant_id=b.tenant_id and a.resource_id=b.resource_id and a.id < b.id
         and a.resource_id is not null and a.deleted_at is null and b.deleted_at is null
         and tstzrange(a.start_at,a.end_at) && tstzrange(b.start_at,b.end_at)
        where a.tenant_id=$1) cho`, [T]);
  const { rows: [hh] } = await c.query(
    `select count(*)::int dong, count(distinct employee_id)::int nguoi, coalesce(sum(amount_vnd),0)::bigint tien
       from public.commission_entries where tenant_id=$1`, [T]);

  log("\n  ── KIỂM CHÉO ────────────────────────────────────────────────────");
  log(`    đơn đã xong mà thu ≠ tổng dòng: ${lech.n} ${lech.n === 0 ? "✔" : "✖ LỆCH"}`);
  log(`    mặt hàng tồn ÂM: ${tonAm.length} ${tonAm.length === 0 ? "✔" : "✖ " + tonAm.map((r) => `${r.name}=${r.ton}`).join(", ")}`);
  log(`    lịch hẹn chồng giờ: ${chong.nguoi} cùng người · ${chong.cho} cùng chỗ`
    + ` ${chong.nguoi === 0 && chong.cho === 0 ? "✔" : "✖ CHỒNG GIỜ"}`);
  log(`    hoa hồng: ${hh.dong} khoản · ${hh.nguoi} người · ${tien(hh.tien)}đ`
    + ` ${hh.dong > 0 ? "✔" : "✖ PHÉP NỐI HOA HỒNG ĐANG HỎNG"}`);

  /**
   * ĐỐI CHỨNG 4: hoa hồng trên phiếu lương khớp sổ hoa hồng từng tháng.
   *
   * Phép so phải TÁCH LÀM HAI, vì sản phẩm cố ý không xếp người ĐÃ NGHỈ VIỆC
   * vào kỳ lương: `tinhLaiKyLuong` (app/app/payroll/actions.ts:157) lọc
   * `ended_on is null or ended_on >= <đầu kỳ>`. Nên một khoản hoa hồng phát
   * sinh SAU ngày người đó nghỉ sẽ nằm trong sổ hoa hồng mà không có phiếu
   * lương nào nhận — chuyện có thật ở tiệm thật: khách trả lại món hàng do một
   * nhân viên đã nghỉ bán, sổ hoa hồng trừ ngược đúng người, nhưng không còn
   * bảng lương nào để trừ vào.
   *
   * Gộp hai thứ đó vào một con số là biến một sự thật của nghiệp vụ thành một
   * "lệch" vô danh. Nên phần TRONG KỲ phải khớp TUYỆT ĐỐI (lệch là hỏng thật),
   * còn phần NGOÀI KỲ được gọi đúng tên và liệt kê ra.
   */
  const { rows: soatHH } = await c.query(
    `with hh as (
        select date_trunc('month', ce.earned_on)::date ky,
               (e.ended_on is null or e.ended_on >= date_trunc('month', ce.earned_on)::date) trong_ky,
               count(*)::int n, sum(ce.amount_vnd)::bigint tong
          from public.commission_entries ce
          join public.employees e on e.id = ce.employee_id
         where ce.tenant_id=$1 and ce.amount_vnd<>0 group by 1,2),
      pl as (select k.period ky, count(*)::int n, sum(l.amount_vnd)::bigint tong
               from public.payslip_lines l
               join public.payslips p on p.id=l.payslip_id
               join public.payroll_periods k on k.id=p.period_id
              where l.tenant_id=$1 and l.source_type='commission' group by 1),
      thang as (select ky from hh union select ky from pl)
     select to_char(t.ky,'MM/YYYY') thang,
            coalesce(i.n,0) so_trong, coalesce(i.tong,0)::bigint tien_trong,
            coalesce(o.n,0) so_ngoai, coalesce(o.tong,0)::bigint tien_ngoai,
            coalesce(pl.n,0) so_phieu, coalesce(pl.tong,0)::bigint tien_phieu,
            (coalesce(i.tong,0)-coalesce(pl.tong,0))::bigint lech
       from thang t
       left join hh i on i.ky=t.ky and i.trong_ky
       left join hh o on o.ky=t.ky and not o.trong_ky
       left join pl on pl.ky=t.ky
      order by t.ky`, [T]);
  log("\n  ── ĐỐI CHỨNG HOA HỒNG: SỔ HOA HỒNG so với PHIẾU LƯƠNG ───────────");
  let tongLech = 0n, tongNgoai = 0n, soNgoai = 0;
  for (const r of soatHH) {
    const l = BigInt(r.lech);
    tongLech += l < 0n ? -l : l;
    tongNgoai += BigInt(r.tien_ngoai); soNgoai += r.so_ngoai;
    log(`    ${r.thang}  sổ ${String(r.so_trong).padStart(5)} khoản /${tien(r.tien_trong).padStart(12)}đ`
      + `  ·  phiếu ${String(r.so_phieu).padStart(5)} dòng /${tien(r.tien_phieu).padStart(12)}đ`
      + `  ·  ${l === 0n ? "KHỚP ✔" : "LỆCH " + tien(l) + "đ ✖"}`
      + (r.so_ngoai > 0 ? `  (+ ${r.so_ngoai} khoản /${tien(r.tien_ngoai)}đ của người ĐÃ NGHỈ VIỆC)` : ""));
  }
  if (tongLech !== 0n) { log(`    ✖ Tổng lệch TRONG KỲ ${tien(tongLech)}đ — phải bằng 0.`); process.exitCode = 1; }
  else log(`    ✔ Phần trong kỳ khớp tuyệt đối, không lệch một đồng nào.`);
  if (soNgoai > 0) {
    const { rows: dsNgoai } = await c.query(
      `select e.full_name, to_char(e.ended_on,'YYYY-MM-DD') nghi,
              to_char(ce.earned_on,'YYYY-MM-DD') ngay, ce.amount_vnd, o.kind
         from public.commission_entries ce
         join public.employees e on e.id = ce.employee_id
         left join public.orders o on o.id = ce.order_id
        where ce.tenant_id=$1 and ce.amount_vnd<>0 and e.ended_on is not null
          and ce.earned_on > e.ended_on order by ce.earned_on`, [T]);
    log(`    ℹ ${soNgoai} khoản /${tien(tongNgoai)}đ KHÔNG lên phiếu lương nào — đúng hành vi sản phẩm:`);
    for (const r of dsNgoai)
      log(`        ${r.full_name} (nghỉ ${r.nghi}) · ${r.kind === "return" ? "trả hàng" : "đơn"} ngày ${r.ngay} · ${tien(r.amount_vnd)}đ`);
    log(`        → khách trả lại hàng do người đã nghỉ bán; sổ hoa hồng trừ ngược đúng người,`);
    log(`          nhưng kỳ lương KHÔNG xếp người đã nghỉ nên không có phiếu nào để trừ vào.`);
  }

  // ── TIỆM CÓ LÃI KHÔNG — phép kiểm ở TẦNG KINH DOANH ────────────────────
  const { rows: thang } = await c.query(
    `select to_char(o.created_at at time zone 'Asia/Ho_Chi_Minh','YYYY-MM') ky,
            count(distinct o.id)::int don,
            sum(l.line_total_vnd)::bigint doanh_thu,
            sum(coalesce(lc.cost_vnd,0) * l.qty)::bigint gia_von
       from public.orders o
       join public.order_lines l on l.order_id = o.id
       left join public.order_line_costs lc on lc.order_line_id = l.id
      where o.tenant_id=$1 and o.status='completed' and o.deleted_at is null
      group by 1 order by 1`, [T]);
  log("\n  ── TIỆM CÓ LÃI KHÔNG ────────────────────────────────────────────");
  log(`    quỹ lương ${NV.filter((n) => !n.nghiViec).length} người đang làm: ${tien(quyLuong)}đ/tháng`);
  log("    tháng      đơn      doanh thu         lãi gộp   biên   lương/DT   còn lại sau lương");
  // Tháng CỤT là tháng bị cửa sổ nạp cắt ngang — ở đây chỉ có DUY NHẤT tháng
  // của `HOM_NAY` (nạp từ mùng 1 tháng 5 nên tháng 5/6/7 đều tròn). Đánh dấu để
  // không ai đọc nhầm "tháng đó tiệm ế", và loại khỏi số trung bình.
  const thangCut = HOM_NAY.slice(0, 7);
  for (const r of thang) {
    const dt = Number(r.doanh_thu), lg = dt - Number(r.gia_von);
    const cut = r.ky === thangCut ? ` (tháng cụt — mới tới ngày ${HOM_NAY.slice(8)})` : "";
    log(`    ${r.ky}${String(r.don).padStart(7)}${tien(dt).padStart(16)}đ${tien(lg).padStart(15)}đ`
      + `${((lg / dt * 100).toFixed(0) + "%").padStart(7)}${((quyLuong / dt * 100).toFixed(1) + "%").padStart(11)}`
      + `${tien(Math.round(lg - quyLuong)).padStart(18)}đ${cut}`);
  }
  const tron = thang.filter((r) => r.ky !== thangCut);
  let doanhThuTB = 0, laiGopTB = 0, tyLe = 0;
  if (tron.length > 0) {
    doanhThuTB = tron.reduce((s, r) => s + Number(r.doanh_thu), 0) / tron.length;
    laiGopTB = tron.reduce((s, r) => s + Number(r.doanh_thu) - Number(r.gia_von), 0) / tron.length;
    tyLe = (quyLuong / doanhThuTB) * 100;
    log(`    ── tháng TRÒN: doanh thu TB ${tien(Math.round(doanhThuTB))}đ · lãi gộp TB ${tien(Math.round(laiGopTB))}đ`
      + ` · lương/doanh thu ${tyLe.toFixed(1)}% ${tyLe >= 22 && tyLe <= 42 ? "✔ đúng mặt bằng ngành" : "✖ LỆCH MẶT BẰNG"}`);
    log(`    ── còn lại sau lương: ${tien(Math.round(laiGopTB - quyLuong))}đ/tháng`
      + ` ${laiGopTB - quyLuong > 0 ? "✔ có lãi" : "✖ ĐANG LỖ"}`);
  }
  return { ten: G.ten, quyLuong, doanhThuTB, laiGopTB, tyLe };
}

// ══════════════════════════════════════════════════════════════════════════
// NHÂN SỰ: ca làm · chấm công · bảng công · bảng lương · phiếu lương
// Khuôn lấy nguyên của `seed-nhan-su-van-hanh-demo.mjs`: KHÔNG gõ tay con số
// nào mà màn hình có nút "Tính lại". `work_days` / `flag_count` HỎI CSDL sau
// khi đã ghi lần chấm; `out_of_range` để trigger `attendance_set_flag()` tự
// quyết theo `distance_m`; `net_vnd` là cột sinh nên không ghi.
// ══════════════════════════════════════════════════════════════════════════
async function napNhanSu({ T, slug, G, NV, quanTri, chuTiem, caCua }) {
  const KY = [...KY_DA_CHOT, KY_NHAP];

  // Toạ độ tiệm — chưa khai thì MỌI lần chấm đều bị gắn cờ. Gộp vào jsonb,
  // KHÔNG ghi đè cả ô: `settings` là ô dùng chung, ghi đè là xoá thứ mảng khác đặt vào.
  await c.query(
    `update public.tenants
        set settings = coalesce(settings,'{}'::jsonb)
                     || jsonb_build_object('workLocation', jsonb_build_object('lat',$2::numeric,'lng',$3::numeric))
      where id=$1 and coalesce(settings->'workLocation'->>'lat','') is distinct from $2::text`,
    [T, G.viTri.lat, G.viTri.lng]);

  // ── Xếp ca ──────────────────────────────────────────────────────────────
  const caEmp = [], caNgay = [], caLoai = [], caNote = [];
  const lichCa = new Map();
  for (const nv of NV) {
    for (let d = BAT_DAU; d <= HOM_NAY; d = themNgay(d, 1)) {
      const k = caCua(nv, d);
      if (k === null) continue; // chưa vào làm hoặc đã nghỉ việc
      const nghiPhep = k === "off" && caTrongNgay(slug, nv.nghe, nv.thuTu, d) !== "off";
      lichCa.set(`${nv.id}|${d}`, k);
      caEmp.push(nv.id); caNgay.push(d); caLoai.push(k);
      caNote.push(nghiPhep ? "Nghỉ phép đã duyệt" : null);
    }
  }
  await c.query(
    `insert into public.shifts (tenant_id, employee_id, work_date, kind, note)
     select $1, x.emp, x.d, x.k, x.n from unnest($2::uuid[],$3::date[],$4::text[],$5::text[]) as x(emp,d,k,n)
     on conflict (tenant_id, employee_id, work_date) do update
        set kind = excluded.kind, note = excluded.note`,
    [T, caEmp, caNgay, caLoai, caNote]);

  // ── Chấm công ───────────────────────────────────────────────────────────
  // Tháng ĐÃ chốt bảng công thì bỏ qua hẳn: `punch_locked_period_guard` chặn
  // ghi, và cũng KHÔNG nên ghi — đó là tháng đã khoá sổ.
  const { rows: daChotRows } = await c.query(
    `select employee_id, to_char(period,'YYYY-MM-DD') ky from public.timesheets
      where tenant_id=$1 and status='closed'`, [T]);
  const bangCongDaChot = new Set(daChotRows.map((r) => `${r.employee_id}|${r.ky}`));
  const LY_DO_NGOAI_VUNG = [
    "Đi giao hàng cho khách, chấm từ ngoài đường.",
    "Máy định vị lệch, đang đứng ở cổng sau tiệm.",
    "Kẹt xe, chấm ở đầu hẻm rồi đi bộ vào.",
    "Đi ngân hàng nộp tiền, quên chấm lúc còn trong tiệm.",
  ];
  const soNguoiGo = new Map();
  let soLanCham = 0, soLanCoLyDo = 0;
  for (const nv of NV) {
    for (const ky of KY) {
      if (bangCongDaChot.has(`${nv.id}|${ky}`)) continue;
      const cuoi = cuoiKy(ky);
      // Ghi lại từ đầu cho tháng còn nháp: xoá rồi dựng lại là cách duy nhất
      // chạy-lại-không-nhân-đôi trên bảng KHÔNG có khoá duy nhất.
      await c.query(
        `delete from public.attendance_punches
          where tenant_id=$1 and employee_id=$2 and punched_at >= $3::timestamptz and punched_at < $4::timestamptz`,
        [T, nv.id, gioVN(ky, 0), gioVN(themNgay(cuoi, 1), 0)]);

      const pAt = [], pKind = [], pLat = [], pLng = [], pDist = [], pLy = [];
      let tre = 0, phutTangCa = 0;
      for (let d = ky; d <= cuoi && d <= HOM_NAY; d = themNgay(d, 1)) {
        const k = lichCa.get(`${nv.id}|${d}`);
        if (!k || k === "off") continue;
        const g = G.gioCa[k];
        const laTre = nn(nv.id, d, "tre") < 0.06;
        const vao = g.vao + (laTre ? nnInt(12, 45, nv.id, d, "phuttre") : nnInt(-8, 7, nv.id, d, "jitter"));
        if (laTre) tre++;
        const themGio = nn(nv.id, d, "tangca") < 0.14;
        const ra = g.ra + (themGio ? nnInt(45, 125, nv.id, d, "phuttangca") : nnInt(-6, 18, nv.id, d, "jitter2"));
        if (ra - g.ra >= 30) phutTangCa += ra - g.ra;
        for (const [loai, phut] of [["in", vao], ["out", ra]]) {
          // ~2,5% số lần chấm ở ngoài vùng. `out_of_range` KHÔNG ghi ở đây —
          // trigger `attendance_set_flag()` tự quyết theo `distance_m`.
          const xa = nn(nv.id, d, loai, "xa") < 0.025;
          const met = xa ? nnInt(420, 1400, nv.id, d, loai, "met") : nnInt(3, 140, nv.id, d, loai, "met");
          const toaDo = toaDoCach(G.viTri, met, nn(nv.id, d, loai, "goc") * 2 * Math.PI);
          const khoang = khoangCachM(G.viTri, toaDo);
          const lyDo = khoang > BAN_KINH_M
            ? LY_DO_NGOAI_VUNG[nnInt(0, LY_DO_NGOAI_VUNG.length - 1, nv.id, d, loai, "ly")] : null;
          if (lyDo) soLanCoLyDo++;
          pAt.push(gioVN(d, phut)); pKind.push(loai);
          pLat.push(toaDo.lat); pLng.push(toaDo.lng); pDist.push(khoang); pLy.push(lyDo);
        }
      }
      if (pAt.length) {
        await c.query(
          `insert into public.attendance_punches
             (tenant_id, employee_id, punched_at, kind, lat, lng, distance_m, reason)
           select $1,$2,x.at,x.k,x.la,x.ln,x.di,x.ly
             from unnest($3::timestamptz[],$4::text[],$5::numeric[],$6::numeric[],$7::int[],$8::text[])
               as x(at,k,la,ln,di,ly)`,
          [T, nv.id, pAt, pKind, pLat, pLng, pDist, pLy]);
        soLanCham += pAt.length;
      }
      soNguoiGo.set(`${nv.id}|${ky}`, { tre, phutTangCa });
    }
  }

  // ── Bảng công ───────────────────────────────────────────────────────────
  // `work_days` / `flag_count` HỎI CSDL, không tự đếm trong bộ nhớ: phải đúng
  // con số nút "Tính lại bảng công" sẽ ra, nếu không hai chỗ đá nhau.
  let themBC = 0;
  for (const nv of NV) {
    for (const ky of KY) {
      if (bangCongDaChot.has(`${nv.id}|${ky}`)) continue;
      if (nv.nghiViec && nv.nghiViec < ky) continue;
      if (cuoiKy(ky) < nv.vao) continue;
      const { rows: [t] } = await c.query(
        `select count(distinct case when kind='in'
                  then (punched_at at time zone 'Asia/Ho_Chi_Minh')::date end)::int cong,
                count(*) filter (where out_of_range)::int co
           from public.attendance_punches
          where tenant_id=$1 and employee_id=$2
            and punched_at >= $3::timestamptz and punched_at < $4::timestamptz`,
        [T, nv.id, gioVN(ky, 0), gioVN(themNgay(cuoiKy(ky), 1), 0)]);
      const go = soNguoiGo.get(`${nv.id}|${ky}`) ?? { tre: 0, phutTangCa: 0 };
      const { rowCount } = await c.query(
        `insert into public.timesheets
           (tenant_id, employee_id, period, work_days, overtime_hours, late_count, flag_count)
         values ($1,$2,$3::date,$4,$5,$6,$7)
         on conflict (tenant_id, employee_id, period) do update
            set work_days=excluded.work_days, overtime_hours=excluded.overtime_hours,
                late_count=excluded.late_count, flag_count=excluded.flag_count
          where timesheets.status='draft'`,
        [T, nv.id, ky, t.cong, Math.round((go.phutTangCa / 60) * 10) / 10,
          Math.min(go.tre, 200), Math.min(t.co, 200)]);
      themBC += rowCount;
    }
  }
  // Chốt bảng công các kỳ cũ — `payroll_close_guard` đòi bước này xong trước.
  for (const ky of KY_DA_CHOT)
    await c.query(
      `update public.timesheets set status='closed', closed_by=$3, closed_at=$4::timestamptz
        where tenant_id=$1 and period=$2::date and status='draft'`,
      [T, ky, quanTri, gioVN(themNgay(cuoiKy(ky), 1), 10 * 60)]);

  // ── Bảng lương ──────────────────────────────────────────────────────────
  // Dựng theo đúng `tinhLaiKyLuong`: lương cứng / tăng ca sinh TỪ bảng công và
  // trỏ `source_id` về đúng dòng bảng công; hoa hồng MỖI KHOẢN MỘT DÒNG trỏ về
  // đúng khoản gốc — gộp thành một dòng tổng là mất đường bấm về nơi con số ra đời.
  let soPhieu = 0;
  for (const ky of KY) {
    await c.query(`insert into public.payroll_periods (tenant_id, period) values ($1,$2::date)
                   on conflict (tenant_id, period) do nothing`, [T, ky]);
    const { rows: [kyRow] } = await c.query(
      `select id, status from public.payroll_periods where tenant_id=$1 and period=$2::date`, [T, ky]);
    if (kyRow.status === "closed") continue; // đã chốt thì không đụng vào

    const nguoiTrongKy = NV.filter((n) => (!n.nghiViec || n.nghiViec >= ky) && n.vao <= cuoiKy(ky));
    await c.query(
      `insert into public.payslips (tenant_id, period_id, employee_id)
       select $1,$2,x.emp from unnest($3::uuid[]) as x(emp)
       on conflict (period_id, employee_id) do nothing`,
      [T, kyRow.id, nguoiTrongKy.map((n) => n.id)]);
    const { rows: phieuRows } = await c.query(
      `select id, employee_id from public.payslips where tenant_id=$1 and period_id=$2`, [T, kyRow.id]);
    const phieuCua = new Map(phieuRows.map((r) => [r.employee_id, r.id]));
    const { rows: bcRows } = await c.query(
      `select id, employee_id, work_days, overtime_hours from public.timesheets
        where tenant_id=$1 and period=$2::date`, [T, ky]);
    const bcCua = new Map(bcRows.map((r) => [r.employee_id, r]));
    const { rows: hhRows } = await c.query(
      `select id, employee_id, amount_vnd, to_char(earned_on,'YYYY-MM-DD') earned_on, note
         from public.commission_entries
        where tenant_id=$1 and earned_on >= $2::date and earned_on <= $3::date and amount_vnd <> 0`,
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
      if (bc && nv.luong > 0)
        dong.push({ kind: "base", tien: nv.luong, nguon: "timesheet", nguonId: bc.id,
          nhan: `Lương cứng kỳ ${nhanKy(ky)} · ${Number(bc.work_days)} công` });
      const gioTangCa = Number(bc?.overtime_hours ?? 0);
      if (bc && gioTangCa > 0 && nv.giaTangCa > 0)
        dong.push({ kind: "overtime", tien: Math.round(gioTangCa * nv.giaTangCa),
          nguon: "timesheet", nguonId: bc.id, nhan: `Tăng ca kỳ ${nhanKy(ky)} · ${gioTangCa} giờ` });
      for (const h of hhCua.get(nv.id) ?? [])
        dong.push({ kind: "commission", tien: Number(h.amount_vnd), nguon: "commission",
          nguonId: h.id, nhan: h.note ?? `Hoa hồng ngày ${h.earned_on}` });
      // Dòng GHI TAY — 'manual' bắt buộc có nhãn + người ghi (CHECK payslip_lines_co_goc).
      if (nv.luong > 0)
        dong.push({ kind: "insurance", tien: -(Math.round((nv.luong * 0.105) / 1000) * 1000),
          nguon: "manual", nguonId: null, nhan: `BHXH - BHYT - BHTN 10,5% kỳ ${nhanKy(ky)}` });
      if (nn(nv.id, ky, "tamung") < 0.22 && nv.luong > 0)
        dong.push({ kind: "advance", tien: -(nnInt(1, 3, nv.id, ky, "mucung") * 1_000_000),
          nguon: "manual", nguonId: null, nhan: `Tạm ứng lương kỳ ${nhanKy(ky)}` });

      // Dọn dòng MÁY sinh (đúng như sản phẩm làm) + dọn ĐÚNG những dòng ghi tay
      // của chính bộ nạp này, nhận dạng bằng nhãn. Không đụng dòng người khác ghi.
      const nhanTay = dong.filter((x) => x.nguon === "manual").map((x) => x.nhan);
      await c.query(
        `delete from public.payslip_lines
          where payslip_id=$1 and (source_type in ('timesheet','commission')
                or (source_type='manual' and label = any($2::text[])))`, [phieuId, nhanTay]);
      for (let i = 0; i < dong.length; i += 500) {
        const m = dong.slice(i, i + 500);
        await c.query(
          `insert into public.payslip_lines
             (tenant_id, payslip_id, kind, amount_vnd, source_type, source_id, label, created_by)
           select $1,$2,x.k,x.t,x.st,x.si,x.nh, case when x.st='manual' then $8::uuid else null end
             from unnest($3::text[],$4::bigint[],$5::text[],$6::uuid[],$7::text[]) as x(k,t,st,si,nh)`,
          [T, phieuId, m.map((x) => x.kind), m.map((x) => x.tien), m.map((x) => x.nguon),
            m.map((x) => x.nguonId), m.map((x) => x.nhan), quanTri]);
      }
    }
    soPhieu += phieuIds.length;
    // Tổng phiếu CỘNG TỪ DÒNG — công thức `capNhatTongPhieu`. `net_vnd` là cột sinh.
    await c.query(
      `update public.payslips p set gross_vnd=coalesce(g.gross,0), deduction_vnd=coalesce(g.ded,0)
         from unnest($1::uuid[]) as x(id)
         left join (select payslip_id,
                           sum(case when amount_vnd>0 then amount_vnd else 0 end) gross,
                           sum(case when amount_vnd<0 then -amount_vnd else 0 end) ded
                      from public.payslip_lines where payslip_id = any($1::uuid[]) group by payslip_id) g
           on g.payslip_id = x.id
        where p.id = x.id`, [phieuIds]);
    // Tổng kỳ CỘNG TỪ PHIẾU.
    await c.query(
      `update public.payroll_periods
          set total_vnd = greatest(0, coalesce((select sum(net_vnd) from public.payslips where period_id=$1),0))
        where id=$1`, [kyRow.id]);
  }

  // ── Chốt các kỳ lương cũ + phiếu chi lương trong Sổ quỹ ──────────────────
  for (const ky of KY_DA_CHOT) {
    const mocChot = gioVN(themNgay(cuoiKy(ky), 2), 15 * 60);
    await c.query(
      `update public.payroll_periods set status='closed', closed_by=$3, closed_at=$4::timestamptz
        where tenant_id=$1 and period=$2::date and status='draft'`, [T, ky, chuTiem, mocChot]);
    // Phiếu chi chạy cho MỌI kỳ đã chốt, không riêng kỳ vừa chốt — như vậy lần
    // chạy sau còn VÁ được phiếu chi thiếu hoặc lệch số.
    const { rows: [ph] } = await c.query(
      `select coalesce(sum(p.net_vnd),0)::bigint tong from public.payslips p
         join public.payroll_periods k on k.id=p.period_id
        where k.tenant_id=$1 and k.period=$2::date and k.status='closed'`, [T, ky]);
    const tongChi = BigInt(ph.tong);
    if (tongChi <= 0n) continue;
    const ghiChu = `Lương kỳ ${nhanKy(ky)}`;
    const { rows: [daCoPhieu] } = await c.query(
      `select id, amount_vnd from public.cash_entries
        where tenant_id=$1 and category='salary' and note=$2 and deleted_at is null limit 1`, [T, ghiChu]);
    if (!daCoPhieu) {
      await c.query(
        `insert into public.cash_entries
           (tenant_id, direction, amount_vnd, fund, category, note, recorded_by, created_at)
         values ($1,'out',$2,'bank','salary',$3,$4,$5::timestamptz)`,
        [T, tongChi.toString(), ghiChu, chuTiem, mocChot]);
    } else if (BigInt(daCoPhieu.amount_vnd) !== tongChi) {
      await c.query(`update public.cash_entries set amount_vnd=$2 where id=$1`,
        [daCoPhieu.id, tongChi.toString()]);
    }
  }

  const { rows: [tt] } = await c.query(
    `select (select count(*)::int from public.timesheets where tenant_id=$1 and status='closed') bc_chot,
            (select count(*)::int from public.timesheets where tenant_id=$1 and status='draft') bc_nhap,
            (select coalesce(sum(late_count),0)::int from public.timesheets where tenant_id=$1) tre,
            (select coalesce(sum(flag_count),0)::int from public.timesheets where tenant_id=$1) co,
            (select count(*)::int from public.payroll_periods where tenant_id=$1 and status='closed') luong_chot,
            (select count(*)::int from public.leave_requests where tenant_id=$1 and status='pending') cho_duyet`,
    [T]);
  log(`  nhân sự: ${caEmp.length} ô ca · ${soLanCham} lần chấm mới (${soLanCoLyDo} ngoài vùng có lý do)`
    + ` · bảng công ${tt.bc_chot} chốt/${tt.bc_nhap} nháp · ${tt.tre} lần trễ · ${tt.co} lần gắn cờ`);
  log(`           bảng lương ${soPhieu} phiếu · ${tt.luong_chot} kỳ đã chốt · ${tt.cho_duyet} đơn nghỉ chờ duyệt`);
}

// ══════════════════════════════════════════════════════════════════════════
// TIỆN ÍCH GHI
// ══════════════════════════════════════════════════════════════════════════
async function daCo(bang, ids) {
  const co = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const { rows } = await c.query(
      `select id from public.${bang} where id = any($1::uuid[])`, [ids.slice(i, i + 500)]);
    for (const r of rows) co.add(r.id);
  }
  return co;
}

async function chenNhieu(bang, cot, hang, xungDot = "(id)", moLan = 300) {
  let n = 0;
  for (let i = 0; i < hang.length; i += moLan) {
    const phan = hang.slice(i, i + moLan);
    const o = [], tsn = [];
    phan.forEach((r, j) => {
      o.push("(" + cot.map((_, k) => `$${j * cot.length + k + 1}`).join(",") + ")");
      tsn.push(...r);
    });
    const kq = await c.query(
      `insert into public.${bang} (${cot.join(",")}) values ${o.join(",")}
       on conflict ${xungDot} do nothing`, tsn);
    n += kq.rowCount;
  }
  return n;
}

/**
 * Chuyển trạng thái theo mẻ nhỏ — mỗi dòng vẫn kích trigger riêng.
 * `tuTrangThai` là chốt an toàn: lần chạy trước chết giữa chừng thì lần này vá
 * tiếp, còn khi đã xong thì câu lệnh không đụng dòng nào.
 */
async function doiTrangThai(ids, trangThai, tuTrangThai) {
  for (let i = 0; i < ids.length; i += 100) {
    await c.query(
      `update public.orders set status=$2 where id = any($1::uuid[]) and status=$3`,
      [ids.slice(i, i + 100), trangThai, tuTrangThai]);
  }
}

main().catch(async (e) => {
  try { await c.query("rollback"); } catch { /* kết nối có thể đã đứt */ }
  console.error("\n✖ HỎNG:", e.message);
  if (e.detail) console.error("  chi tiết:", e.detail);
  if (e.constraint) console.error("  ràng buộc:", e.constraint);
  process.exit(1);
});
