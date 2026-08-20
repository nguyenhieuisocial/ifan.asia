#!/usr/bin/env node
/**
 * NẠP KHÁCH + LỊCH HẸN + ĐƠN HÀNG ~3 THÁNG cho tiệm mẫu.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI ĐI ĐƯỜNG "GHI NGUỒN, ĐỂ TRIGGER LÀM PHẦN CÒN LẠI"
 * ═══════════════════════════════════════════════════════════════════
 * Đã đo trên lược đồ thật (20/08), KHÔNG suy từ tên bảng:
 *
 *   • `orders_sinh_dong_kho`, `orders_sinh_hoa_hong` là trigger
 *     **AFTER UPDATE OF status** — KHÔNG phải AFTER INSERT. Nghĩa là một đơn
 *     được chèn thẳng với `status='completed'` sẽ **không sinh dòng kho, không
 *     sinh hoa hồng, và không có gì báo lỗi**. Đó đúng là cái bẫy đã làm tiệm
 *     mẫu hôm nay có 87 đơn nhưng `commission_entries` = 0.
 *     ⇒ Ở đây mọi đơn đều đi đúng đường đời thật: chèn `draft` → thêm dòng
 *       hàng → thu tiền → `confirmed` → `completed`. Trigger tự lo kho, sổ quỹ,
 *       hoa hồng, hạng khách.
 *
 *   • `order_lines.line_total_vnd` là **cột SINH TỰ ĐỘNG** (generated always).
 *     Không được chèn tay; `order_payments_guard` lấy chính cột đó để chặn thu
 *     vượt tổng đơn, nên số tiền thu phải suy từ đơn giá × số lượng − giảm.
 *
 *   • `order_lines_lock_guard` cấm sửa dòng khi đơn đã `completed`/`cancelled`,
 *     và `order_lines_sign_guard` bắt phiếu hoàn phải có `qty` ÂM.
 *     ⇒ Trình tự trên là trình tự DUY NHẤT còn hợp lệ, không phải sở thích.
 *
 *   • `commission_sinh_cho_don()` nối người ăn hoa hồng bằng
 *     `e.user_id = coalesce(l.performed_by_user_id, a.staff_user_id, o.created_by)`.
 *     ⇒ Dòng DỊCH VỤ phải mang `performed_by_user_id` = KTV làm ca đó, dòng
 *       SẢN PHẨM mang người bán. Bỏ trống là hoa hồng rơi hết về người tạo đơn —
 *       số vẫn "chạy" nhưng nói sai ai làm ra tiền.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG TỰ CHÈN stock_moves / cash_entries / commission_entries
 * ═══════════════════════════════════════════════════════════════════
 * Ba bảng đó là dữ liệu KÉO THEO. Tự chèn thì có hai nguồn cùng nói về một
 * việc, và tới lúc lệch nhau thì không ai biết bên nào đúng — đây là lớp bệnh
 * nặng nhất kho này từng có (việc #18). Script này KHÔNG chèn một dòng nào vào
 * ba bảng đó; phần nghiệm thu ở cuối đếm chúng TRƯỚC/SAU để tự chứng minh
 * chúng tăng lên là do trigger.
 *
 * Ngoại lệ DUY NHẤT, và chỉ là mốc thời gian: trigger sinh phiếu quỹ / dòng kho
 * với `created_at = now()`, nên nếu để nguyên thì 400 đơn rải 3 tháng sẽ đổ hết
 * vào Sổ quỹ trong một phút. Sau khi trigger chạy xong, ta KÉO `created_at` của
 * chính những dòng đó về đúng ngày chứng từ gốc (`order_payments.received_at`,
 * `orders.created_at`). Không thêm dòng, không đổi số tiền, không đổi số lượng —
 * chỉ sửa mốc. Đây là khuôn có sẵn của `seed-demo.mjs` (dòng "Phiếu quỹ tự sinh
 * từ thu tiền mang mốc now()").
 *
 * ═══════════════════════════════════════════════════════════════════
 * CHẠY LẠI KHÔNG NHÂN ĐÔI
 * ═══════════════════════════════════════════════════════════════════
 * `orders` / `appointments` không có cột `external_id` để neo. Nên mỗi bản ghi
 * được neo bằng **khoá tự sinh tất định**: id = UUIDv5(tên gọi cố định), tên gọi
 * dựng từ mã tiệm + loại + số thứ tự. Cùng đầu vào ⇒ cùng UUID ⇒ lần chạy thứ
 * hai lọc ra "đã có" và bỏ qua. Khách thì neo bằng SĐT (đã chuẩn hoá E.164) để
 * còn dùng lại 16 khách có sẵn thay vì đẻ trùng người.
 *
 * Mọi con số ngẫu nhiên đều từ một bộ sinh số CÓ HẠT GIỐNG cố định — chạy lại
 * ra y hệt kế hoạch cũ, không phụ thuộc `Math.random()`.
 *
 * ⚠️ CHỈ ghi vào tiệm `is_sample = true` — có chốt kiểm ở đầu, không phải lời hứa.
 *
 *   node --env-file=.env.local scripts/seed-khach-lich-don-demo.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const SLUG = process.env.TIEM ?? "demo-spa-huong-sen";

/**
 * ═══════════════════════════════════════════════════════════════════
 * MÃ MẺ — vì sao nạp thêm chứ không nạp lại
 * ═══════════════════════════════════════════════════════════════════
 * Mẻ đầu (`m1`) dựng một tiệm quy mô nhỏ: ~740 lịch hẹn, ~400 đơn, doanh thu
 * ~72 triệu/tháng. Nhưng quỹ lương 20 người của tiệm này là **182,3 triệu/tháng**
 * ⇒ mở màn Báo cáo ra thấy tiệm lỗ ~110 triệu/tháng. Số không sai ở tầng bảng
 * biểu, nhưng SAI Ở TẦNG KINH DOANH: 20 nhân viên mà lượng giao dịch của tiệm
 * 3 người. Phải nâng giao dịch cho khớp người.
 *
 * Không nạp LẠI được, chỉ nạp THÊM: `stock_moves_immutable_guard` chặn cả
 * UPDATE lẫn DELETE trên sổ kho. Xoá đơn cũ sẽ để lại dòng kho mồ côi không
 * xoá nổi ⇒ tồn kho sai vĩnh viễn. Nên mẻ cũ giữ nguyên, mẻ mới chồng lên,
 * mỗi mẻ có khoảng khoá riêng để không giẫm lên nhau.
 *
 * ⚠️ ĐỔI SỐ LƯỢNG Ở KHỐI `QUY_MO` DƯỚI ĐÂY THÌ PHẢI ĐỔI `MA_ME`.
 * Quên đổi thì mẻ mới trùng khoá mẻ cũ, bị lọc là "đã có", và bạn sẽ ngồi nhìn
 * một script chạy xong mà không ghi được gì.
 */
const MA_ME = "m2";

/** Toàn bộ nút vặn quy mô nằm một chỗ — đọc một lần là biết tiệm to cỡ nào. */
const QUY_MO = {
  khach: 760,          // tổng khách script này dựng (gồm cả mẻ trước)
  caMoiNgay: 30,       // lịch hẹn/ngày ngày thường
  caCuoiTuan: 6,       // cộng thêm cho thứ Bảy/Chủ nhật
  caDaoDong: 7,        // dao động 0..n
  caSapToi: 7,         // ngày chưa tới thì mới có vài người đặt trước
  tyLeRaDon: 0.90,     // ca đã làm xong thì hầu hết đều ra đơn — đời thật là vậy
  tyLeBanKem: 0.45,    // tỉ lệ đơn có bán kèm sản phẩm
  tyLeThemDichVu: 0.25,// khách làm thêm dịch vụ thứ hai ngay tại chỗ
  donMuaLe: 200,       // khách ghé mua lẻ, không đặt lịch
  phieuHoan: 40,
};
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

// Bộ sinh số có hạt giống (mulberry32) — thay cho Math.random() để chạy lại
// ra đúng kế hoạch cũ.
function boSinhSo(hat) {
  let a = hat >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = boSinhSo(20260820);
const chon = (mang) => mang[Math.floor(rnd() * mang.length)];
const trongSo = (cap) => {
  const tong = cap.reduce((s, [, w]) => s + w, 0);
  let x = rnd() * tong;
  for (const [v, w] of cap) if ((x -= w) < 0) return v;
  return cap[cap.length - 1][0];
};

const khongDau = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

// Giờ Việt Nam → mốc UTC. Máy chủ chạy UTC nên KHÔNG được dùng `new Date(y,m,d)`
// của máy cục bộ, sẽ lệch múi giờ và lịch hẹn nhảy sang ngày khác.
const VN = (y, m, d, gio = 0, phut = 0) => new Date(Date.UTC(y, m - 1, d, gio - 7, phut));
const NGAY_MS = 86400000;

const HOM_NAY = VN(2026, 8, 20, 0, 0);
const BAT_DAU = VN(2026, 5, 22, 0, 0);   // ~3 tháng gần đây
const KET_THUC = VN(2026, 9, 5, 0, 0);   // + 2 tuần lịch sắp tới

// ── Kho tên người Việt ────────────────────────────────────────────────────
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
  "Quận Gò Vấp", "Quận Tân Bình", "TP Thủ Đức", "Quận 10", "Quận 4"];

// Ghi chú lịch hẹn — để màn Lịch không phải một bảng trống rỗng.
const GHI_CHU_LICH = [
  "Khách quen, thích phòng yên tĩnh.",
  "Da nhạy cảm — dặn KTV giảm lực.",
  "Đi cùng bạn, xin xếp hai giường cạnh nhau.",
  "Khách hay tới trễ 10 phút.",
  "Lần đầu tới tiệm, cần tư vấn kỹ.",
  null, null, null, null, null, null,
];
const LY_DO_HUY = [
  "Khách báo bận đột xuất, hẹn tuần sau",
  "Khách kẹt xe, xin dời buổi khác",
  "Trùng lịch công ty, khách xin huỷ",
  "Khách ốm, dời sang tuần sau",
];

// ══════════════════════════════════════════════════════════════════════════
async function main() {
  await c.connect();
  await c.query("set lock_timeout = '10s'");
  // Mẻ này ghi vài nghìn đơn, mỗi lần đổi trạng thái lại kích trigger sinh kho /
  // quỹ / hoa hồng. Câu lệnh dài hơn hạn mặc định là chuyện bình thường ở đây,
  // nên nới hạn CHẠY (statement) — KHÔNG nới hạn CHỜ KHOÁ (lock_timeout), vì
  // chờ khoá lâu nghĩa là đang giẫm chân người khác, phải hỏng sớm cho biết.
  await c.query("set statement_timeout = '15min'");
  await c.query("set idle_in_transaction_session_timeout = '15min'");

  // ── CHỐT KIỂM: chỉ ghi vào tiệm mẫu ────────────────────────────────────
  const { rows: tiemRows } = await c.query(
    `select id, name, slug, is_sample, deleted_at from public.tenants where slug = $1`,
    [SLUG],
  );
  const tiem = tiemRows[0];
  if (!tiem) {
    console.error(`✖ Không có tiệm nào mang mã "${SLUG}".`);
    process.exit(1);
  }
  if (tiem.is_sample !== true) {
    console.error(
      `✖ DỪNG: tiệm "${tiem.name}" (${SLUG}) có is_sample = ${tiem.is_sample}. ` +
      `Script này CHỈ được ghi vào tiệm mẫu.`,
    );
    process.exit(1);
  }
  const T = tiem.id;
  console.log(`✔ Tiệm mẫu: ${tiem.name} (${SLUG})`);

  // ── Đếm TRƯỚC — làm đối chứng cho phần nghiệm thu ───────────────────────
  const BANG_DEM = ["contacts", "appointments", "orders", "order_lines", "order_payments",
    "stock_moves", "cash_entries", "commission_entries"];
  const dem = async () => {
    const kq = {};
    for (const b of BANG_DEM) {
      const { rows } = await c.query(`select count(*)::int n from public.${b} where tenant_id = $1`, [T]);
      kq[b] = rows[0].n;
    }
    return kq;
  };
  const truoc = await dem();

  // ── Dữ liệu nền ────────────────────────────────────────────────────────
  // `order by` ở mọi truy vấn nền KHÔNG phải cho đẹp: bộ sinh số có hạt giống
  // chỉ chạy lại ra y hệt nếu các mảng nó bốc từ đó có thứ tự cố định.
  const { rows: matHang } = await c.query(
    `select id, name, kind, price_vnd, duration_minutes from public.items
      where tenant_id = $1 and status = 'active' order by kind, name`, [T]);
  const dichVu = Object.fromEntries(matHang.filter((i) => i.kind === "service").map((i) => [i.name, i]));
  const sanPham = matHang.filter((i) => i.kind === "product");

  const { rows: nhanVien } = await c.query(
    `select id, full_name, user_id, note, started_on, ended_on from public.employees
      where tenant_id = $1 and user_id is not null order by full_name`, [T]);

  /**
   * Chức danh nghề đọc từ cột `note` (đó là nơi seed nhân sự ghi nghề), KHÔNG
   * đọc từ `tenant_members.role` — `role` là QUYỀN trong app, không phải nghề.
   * Lễ tân / thu ngân / kế toán / bảo vệ / quản lý KHÔNG nhận lịch hẹn: xếp ca
   * cho họ là dựng một tiệm không có thật.
   */
  const ngheCua = (note) => {
    const t = khongDau(note);
    if (t.includes("triet long")) return "triet_long";
    if (t.includes("massage")) return "massage";
    if (t.includes("goi dau") || t.includes("goi duong sinh")) return "goi";
    if (t.includes("cham soc da")) return "da";
    if (t.includes("phu ta")) return "phu_ta";
    return null;
  };
  /**
   * Người quầy = người ĐANG LÀM, không phải KTV, và không phải bảo vệ.
   * Định nghĩa bằng LOẠI TRỪ chứ không liệt kê chức danh, vì cột `note` không
   * phải lúc nào cũng chứa chức danh — có người ở đó ghi lịch làm việc hoặc lý
   * do nghỉ. Liệt kê chức danh sẽ âm thầm bỏ sót đúng những người đó.
   */
  const laBaoVe = (note) => khongDau(note).includes("bao ve");

  // Dịch vụ nào thì ai làm được.
  const KTV_CHO = {
    "Chăm sóc da cơ bản": ["da", "phu_ta"],
    "Massage trị liệu": ["massage"],
    "Triệt lông (1 vùng)": ["triet_long"],
    "Gội đầu dưỡng sinh": ["goi", "phu_ta"],
  };
  const ktv = nhanVien.filter((n) => ngheCua(n.note) !== null);
  const quayLe = nhanVien.filter(
    (n) => !n.ended_on && ngheCua(n.note) === null && !laBaoVe(n.note));
  if (ktv.length === 0 || quayLe.length === 0) {
    console.error("✖ DỪNG: không tra ra KTV hoặc người quầy lễ tân từ cột note của employees.");
    process.exit(1);
  }
  console.log(`  ${ktv.length} KTV nhận lịch · ${quayLe.length} người quầy tạo đơn/thu tiền`);

  // `date` trong pg về JS là đối tượng Date theo giờ máy — không cắt chuỗi được.
  // Quy về "YYYY-MM-DD" rồi so, để người đã nghỉ việc không bị xếp ca sau ngày nghỉ.
  const ngayISO = (v) => (v instanceof Date
    ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`
    : String(v).slice(0, 10));
  const dangLam = (nv, luc) => {
    const ngay = new Date(luc + 7 * 3600000).toISOString().slice(0, 10); // ngày theo giờ VN
    if (nv.started_on && ngay < ngayISO(nv.started_on)) return false;
    if (nv.ended_on && ngay > ngayISO(nv.ended_on)) return false;
    return true;
  };

  // ── 1) KHÁCH HÀNG ──────────────────────────────────────────────────────
  // Danh sách khách được dựng HOÀN TOÀN từ hạt giống, KHÔNG nhìn vào CSDL.
  // Đây là điểm mấu chốt của "chạy lại không nhân đôi": nếu kế hoạch phụ thuộc
  // vào cái mà chính nó vừa ghi, thì lần chạy thứ hai sẽ ra một kế hoạch khác
  // và đẻ ra một mẻ dữ liệu thứ hai. SĐT trùng người có sẵn thì DÙNG LẠI người
  // đó (tra theo E.164), không chèn thêm.
  const SO_KHACH_MOI = QUY_MO.khach;
  const khachMoi = [];
  const daDungSdt = new Set();
  for (let i = 0; khachMoi.length < SO_KHACH_MOI && i < SO_KHACH_MOI * 4; i++) {
    const dau = DAU_SO[i % DAU_SO.length];
    const duoi = String(1000000 + ((i * 7919 + 314159) % 9000000)).slice(0, 7);
    const sdt = dau + duoi;
    const e164 = "+84" + sdt.slice(1);
    if (daDungSdt.has(e164)) continue;
    daDungSdt.add(e164);

    const nam = rnd() < 0.14;
    const ten = nam
      ? `${chon(HO)} ${chon(DEM_NAM)} ${chon(TEN_NAM)}`
      : `${chon(HO)} ${chon(DEM_NU)} ${chon(TEN_NU)}`;
    khachMoi.push({
      id: uuid5(`${T}:khach:${e164}`),
      ten, sdt, e164,
      tinh: chon(PHUONG),
      // Rải ngày tạo khắp 3 tháng để màn Khách hàng có đường tăng trưởng thật.
      taoLuc: new Date(BAT_DAU.getTime() + Math.floor(rnd() * 95) * NGAY_MS + Math.floor(rnd() * 10 + 8) * 3600000),
    });
  }
  const SDT_DU_KIEN = new Set(khachMoi.map((k) => k.e164));

  const { rows: khachCu } = await c.query(
    `select id, phone_e164 from public.contacts
      where tenant_id = $1 and deleted_at is null order by id`, [T]);
  const theoSdt = new Map(khachCu.filter((k) => k.phone_e164).map((k) => [k.phone_e164, k.id]));
  // Khách "nền" = người CÓ SẴN không nằm trong mẻ mình dựng. Lần chạy thứ hai
  // vẫn ra đúng nhóm này, nên hồ khách để bốc lịch không đổi.
  const khachNen = khachCu.filter((k) => !k.phone_e164 || !SDT_DU_KIEN.has(k.phone_e164));
  // Người đã có sẵn mang đúng SĐT mình định dựng ⇒ dùng lại id của họ.
  for (const k of khachMoi) k.id = theoSdt.get(k.e164) ?? k.id;

  // ── 2) LỊCH HẸN ────────────────────────────────────────────────────────
  // Hồ khách để xếp lịch. Một phần nhỏ là "khách ruột" được bốc lại nhiều lần —
  // tiệm thật nào cũng có nhóm này.
  const moiKhach = [
    ...khachNen.map((k) => ({ id: k.id })),
    ...khachMoi.map((k) => ({ id: k.id })),
  ];
  const khachRuot = moiKhach.filter((_, i) => i % 4 === 0);

  // Giờ đã kín của từng KTV — phải nạp ca CÓ SẴN trong CSDL, nếu không sẽ đụng
  // ràng buộc EXCLUDE `appointments_no_overlap_staff` và hỏng cả mẻ.
  // Nhưng phải LOẠI ca do chính script này từng ghi: kể chúng vào thì lần chạy
  // thứ hai sẽ xếp ra một thời khoá biểu khác với lần đầu.
  const ID_LICH_DU_KIEN = new Set();
  for (let n = 1; n <= 8000; n++) ID_LICH_DU_KIEN.add(uuid5(`${T}:lich:${MA_ME}:${n}`));
  const { rows: caCuTatCa } = await c.query(
    `select id, staff_user_id, start_at, end_at from public.appointments
      where tenant_id = $1 and deleted_at is null order by start_at, id`, [T]);
  const caCu = caCuTatCa.filter((r) => !ID_LICH_DU_KIEN.has(r.id));
  const kin = new Map();
  const banRoi = (uid, tu, den) => {
    const ds = kin.get(uid);
    if (!ds) return false;
    return ds.some(([a, b]) => tu < b && den > a);
  };
  const ghiKin = (uid, tu, den) => {
    if (!kin.has(uid)) kin.set(uid, []);
    kin.get(uid).push([tu, den]);
  };
  for (const r of caCu) ghiKin(r.staff_user_id, +new Date(r.start_at), +new Date(r.end_at));

  const NHU_CAU = [
    ["Massage trị liệu", 30],
    ["Chăm sóc da cơ bản", 30],
    ["Gội đầu dưỡng sinh", 25],
    ["Triệt lông (1 vùng)", 15],
  ];

  const lichHen = [];
  let stt = 0;
  for (let ngay = BAT_DAU.getTime(); ngay <= KET_THUC.getTime(); ngay += NGAY_MS) {
    const d = new Date(ngay + 7 * 3600000); // về ngày theo giờ VN
    const thu = d.getUTCDay();
    const tuongLai = ngay > HOM_NAY.getTime();
    // Cuối tuần đông hơn; ngày chưa tới thì mới có vài người đặt trước.
    const soCa = tuongLai
      ? QUY_MO.caSapToi + Math.floor(rnd() * 5)
      : QUY_MO.caMoiNgay + (thu === 0 || thu === 6 ? QUY_MO.caCuoiTuan : 0)
        + Math.floor(rnd() * QUY_MO.caDaoDong);

    for (let k = 0; k < soCa; k++) {
      const tenDv = trongSo(NHU_CAU);
      const dv = dichVu[tenDv];
      if (!dv) continue;
      const nghe = KTV_CHO[tenDv];
      const ungVien = ktv.filter((n) => nghe.includes(ngheCua(n.note)) && dangLam(n, ngay));
      if (ungVien.length === 0) continue;
      const nguoi = chon(ungVien);

      // Tìm ô trống sớm nhất trong ca 9h–19h, bước 15 phút. Cách này bảo đảm
      // KHÔNG BAO GIỜ đè giờ của cùng một người — kể cả ca đã có sẵn trong CSDL.
      const phut = dv.duration_minutes;
      let batDau = null;
      for (let p = 0; p <= (19 - 9) * 60 - phut; p += 15) {
        const tu = ngay + (9 * 60 + p) * 60000;
        const den = tu + phut * 60000;
        if (!banRoi(nguoi.user_id, tu, den)) { batDau = tu; break; }
      }
      if (batDau === null) continue;
      const ketThuc = batDau + phut * 60000;
      ghiKin(nguoi.user_id, batDau, ketThuc);

      const khach = rnd() < 0.42 ? chon(khachRuot) : chon(moiKhach);
      // Trạng thái theo đời thật: ca chưa tới thì `booked`; ca đã qua thì phần
      // lớn `done`, còn lại là huỷ / không đến.
      let trangThai;
      if (tuongLai) trangThai = "booked";
      else trangThai = trongSo([["done", 86], ["cancelled", 7], ["no_show", 7]]);

      // Giá: đúng bảng giá, thỉnh thoảng có giá ưu đãi khách quen.
      const gia = rnd() < 0.18 ? Math.round((dv.price_vnd * 0.9) / 1000) * 1000 : dv.price_vnd;

      lichHen.push({
        id: uuid5(`${T}:lich:${MA_ME}:${++stt}`),
        khach: khach.id,
        nhanVien: nguoi.user_id,
        item: dv.id,
        tenDv,
        batDau: new Date(batDau),
        ketThuc: new Date(ketThuc),
        trangThai,
        gia,
        note: chon(GHI_CHU_LICH),
        lyDoHuy: trangThai === "cancelled" ? chon(LY_DO_HUY) : null,
        nguon: rnd() < 0.35 ? "chat" : "calendar",
        taoBoi: chon(quayLe).user_id,
      });
    }
  }

  // ── 3) ĐƠN HÀNG ────────────────────────────────────────────────────────
  // Đơn mọc ra TỪ ca đã làm xong (đúng đời thật: xong dịch vụ mới ra quầy trả
  // tiền), cộng thêm ít đơn khách ghé mua lẻ sản phẩm.
  const caXong = lichHen.filter((l) => l.trangThai === "done");
  const donHang = [];
  let sttDon = 0;

  const themDon = (d) => { donHang.push(d); return d; };

  for (const l of caXong) {
    if (rnd() > QUY_MO.tyLeRaDon) continue; // vài ca khách hẹn trả sau / dùng gói
    const luc = new Date(l.ketThuc.getTime() + 5 * 60000);
    const dong = [{
      item: l.item,
      qty: 1,
      donGia: l.gia,
      giam: 0,
      lich: l.id,
      lamBoi: l.nhanVien,     // ⇐ mấu chốt để hoa hồng về đúng KTV
    }];
    // Làm thêm dịch vụ thứ hai ngay tại chỗ (massage xong gội đầu luôn).
    // KHÔNG sinh thêm ca hẹn cho dòng này: đây là việc phát sinh tại quầy, và
    // nếu ép thành ca hẹn thì phải chiếm thêm một ô giờ mà khách không hề đặt.
    // Hoa hồng vẫn về đúng người nhờ `performed_by_user_id` — phép nối của
    // `commission_sinh_cho_don()` lấy cột đó TRƯỚC `staff_user_id` của ca hẹn.
    if (rnd() < QUY_MO.tyLeThemDichVu) {
      const themTen = chon(Object.keys(KTV_CHO).filter((x) => x !== l.tenDv));
      const themDv = dichVu[themTen];
      const nguoiLam = ktv.filter(
        (n) => KTV_CHO[themTen].includes(ngheCua(n.note)) && dangLam(n, +l.batDau));
      if (themDv && nguoiLam.length > 0) {
        dong.push({
          item: themDv.id, qty: 1, donGia: themDv.price_vnd, giam: 0,
          lich: null, lamBoi: chon(nguoiLam).user_id,
        });
      }
    }
    // Bán kèm sản phẩm — hoa hồng sản phẩm về KTV vừa tư vấn.
    if (rnd() < QUY_MO.tyLeBanKem) {
      const sp = chon(sanPham);
      const sl = rnd() < 0.8 ? 1 : 2;
      dong.push({
        item: sp.id, qty: sl, donGia: sp.price_vnd,
        giam: rnd() < 0.12 ? Math.round((sp.price_vnd * sl * 0.05) / 1000) * 1000 : 0,
        lich: null, lamBoi: rnd() < 0.6 ? l.nhanVien : chon(quayLe).user_id,
      });
    }
    themDon({
      id: uuid5(`${T}:don:${MA_ME}:${++sttDon}`),
      khach: l.khach,
      lich: l.id,
      luc,
      dong,
      trangThai: trongSo([["completed", 92], ["confirmed", 4], ["draft", 2], ["cancelled", 2]]),
      taoBoi: chon(quayLe).user_id,
    });
  }

  // Đơn mua lẻ tại quầy: không gắn ca hẹn, người quầy vừa bán vừa thu.
  for (let i = 0; i < QUY_MO.donMuaLe; i++) {
    const ngay = BAT_DAU.getTime() + Math.floor(rnd() * 90) * NGAY_MS;
    const luc = new Date(ngay + (10 + Math.floor(rnd() * 8)) * 3600000);
    const nguoiBan = chon(quayLe).user_id;
    const dong = [];
    for (let j = 0; j < 1 + Math.floor(rnd() * 2); j++) {
      const sp = chon(sanPham);
      if (dong.some((x) => x.item === sp.id)) continue;
      dong.push({ item: sp.id, qty: 1 + Math.floor(rnd() * 2), donGia: sp.price_vnd, giam: 0, lich: null, lamBoi: nguoiBan });
    }
    if (dong.length === 0) continue;
    themDon({
      id: uuid5(`${T}:don:${MA_ME}:${++sttDon}`),
      khach: chon(moiKhach).id,
      lich: null,
      luc,
      dong,
      trangThai: trongSo([["completed", 94], ["cancelled", 4], ["draft", 2]]),
      taoBoi: nguoiBan,
    });
  }

  // Phiếu hoàn: tiệm thật nào cũng có khách trả lại hàng. `qty` ÂM là luật của
  // `order_lines_sign_guard`, và KHÔNG có phiếu thu — `order_payments_guard`
  // chặn thu tiền vào đơn có tổng âm, tiền trả khách đi bằng phiếu quỹ riêng.
  const donCoSanPham = donHang.filter(
    (d) => d.trangThai === "completed" && d.dong.some((x) => sanPham.some((s) => s.id === x.item)),
  );
  const phieuHoan = [];
  for (let i = 0; i < QUY_MO.phieuHoan && i < donCoSanPham.length; i++) {
    const goc = donCoSanPham[Math.floor((i * donCoSanPham.length) / QUY_MO.phieuHoan)];
    const dongSp = goc.dong.find((x) => sanPham.some((s) => s.id === x.item));
    const luc = new Date(Math.min(goc.luc.getTime() + 3 * NGAY_MS, HOM_NAY.getTime() - NGAY_MS));
    phieuHoan.push({
      id: uuid5(`${T}:hoan:${MA_ME}:${i + 1}`),
      goc: goc.id,
      khach: goc.khach,
      luc,
      dong: [{ item: dongSp.item, qty: -1, donGia: dongSp.donGia, giam: 0, lich: null, lamBoi: null }],
      taoBoi: chon(quayLe).user_id,
    });
  }

  // ── 4) GHI ─────────────────────────────────────────────────────────────
  await c.query("begin");

  // Khách. Vào sổ là `lead`; ai thật sự có đơn đã xong mới được nâng lên
  // `customer` ở cuối — không tự phong khách cho người chưa mua gì.
  const canChen = khachMoi.filter((k) => !theoSdt.has(k.e164));
  const nKhach = await chenNhieu("contacts",
    ["id", "tenant_id", "full_name", "phone", "phone_e164", "province", "lifecycle", "created_at", "updated_at"],
    canChen.map((k) => [k.id, T, k.ten, k.sdt, k.e164, k.tinh, "lead", k.taoLuc, k.taoLuc]));

  // Lịch hẹn — lọc bỏ ca đã có để chạy lần hai không đụng ràng buộc EXCLUDE.
  const daCoLich = await daCo("appointments", lichHen.map((l) => l.id));
  const lichChen = lichHen.filter((l) => !daCoLich.has(l.id));
  const nLich = await chenNhieu("appointments",
    ["id", "tenant_id", "contact_id", "staff_user_id", "item_id", "start_at", "end_at",
      "status", "price_vnd", "note", "source", "cancel_reason", "created_by", "created_at", "updated_at"],
    lichChen.map((l) => [l.id, T, l.khach, l.nhanVien, l.item, l.batDau, l.ketThuc,
      l.trangThai, l.gia, l.note, l.nguon, l.lyDoHuy, l.taoBoi,
      new Date(l.batDau.getTime() - 2 * NGAY_MS), l.batDau]));

  // Đơn — chèn `draft` trước, dòng hàng + phiếu thu sau, rồi mới chuyển trạng
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
    d.dong.forEach((x, i) => {
      dongDon.push([uuid5(`${T}:dong:${d.id}:${i}`), T, d.id, x.item, x.lich, x.lamBoi,
        x.qty, x.donGia, x.giam, i]);
    });
    if (d.hoan) continue; // phiếu hoàn không có phiếu thu
    const tong = d.dong.reduce((s, x) => s + x.qty * x.donGia - x.giam, 0);
    if (d.trangThai === "completed") {
      phieuThu.push([uuid5(`${T}:thu:${d.id}:0`), T, d.id,
        trongSo([["cash", 40], ["bank_transfer", 25], ["vietqr", 35]]), tong, d.taoBoi, d.luc,
        uuid5(`${T}:thu:${d.id}:0`)]);
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

  // Chuyển trạng thái — ĐÂY là chỗ trigger sinh kho / sổ quỹ / hoa hồng.
  const canConfirm = donChen.filter((d) => d.hoan || d.trangThai === "confirmed" || d.trangThai === "completed");
  await doiTrangThai(canConfirm.map((d) => d.id), "confirmed");
  const canComplete = donChen.filter((d) => d.hoan || d.trangThai === "completed");
  await doiTrangThai(canComplete.map((d) => d.id), "completed");
  for (const d of donChen.filter((x) => !x.hoan && x.trangThai === "cancelled")) {
    await c.query(
      `update public.orders set status='cancelled', cancel_reason=$2, cancelled_by=$3 where id=$1`,
      [d.id, chon(LY_DO_HUY), d.taoBoi]);
  }

  // ── 4b) NHẬP HÀNG ──────────────────────────────────────────────────────
  // 395 đơn vừa ghi đã RÚT sản phẩm khỏi kho. Không nhập hàng vào thì tiệm mẫu
  // hiện tồn kho ÂM — một tiệm không thể bán thứ nó chưa từng mua. Đây là dọn
  // đúng phần mình vừa làm ra, không phải thêm việc.
  // Vẫn đi đúng đường sản phẩm: `purchases_sinh_dong_kho` cũng là trigger
  // AFTER UPDATE OF status ⇒ chèn phiếu `draft` → thêm dòng → chuyển `completed`.
  const { rows: giaVon } = await c.query(
    `select ic.item_id, ic.cost_vnd from public.item_costs ic
       join public.items i on i.id = ic.item_id where i.tenant_id = $1`, [T]);
  const vonCua = new Map(giaVon.map((r) => [r.item_id, Number(r.cost_vnd)]));
  const { rows: ncc } = await c.query(
    `select id from public.suppliers where tenant_id = $1 order by id limit 1`, [T]);

  // Đếm số lượng bán ra theo tháng từ CHÍNH kế hoạch đơn (không đọc CSDL) —
  // để lần chạy thứ hai vẫn ra đúng kế hoạch nhập cũ.
  const banTheoThang = new Map();
  for (const d of donHang) {
    if (d.trangThai !== "completed") continue;
    const thang = new Date(d.luc.getTime() + 7 * 3600000).toISOString().slice(0, 7);
    for (const x of d.dong) {
      if (!sanPham.some((s) => s.id === x.item)) continue;
      const k = `${thang}|${x.item}`;
      banTheoThang.set(k, (banTheoThang.get(k) ?? 0) + x.qty);
    }
  }
  const phieuNhap = [];
  const dongNhap = [];
  for (const thang of [...new Set([...banTheoThang.keys()].map((k) => k.split("|")[0]))].sort()) {
    const id = uuid5(`${T}:nhap:${MA_ME}:${thang}`);
    // Nhập đầu tháng: mua trước rồi mới bán, đúng chiều đời thật.
    const [y, m] = thang.split("-").map(Number);
    phieuNhap.push([id, T, ncc[0]?.id ?? null, "draft", `Nhập hàng bán kèm tháng ${m}/${y}`,
      VN(y, m, 1, 9, 0), chon(quayLe).user_id, VN(y, m, 1, 9, 0), VN(y, m, 1, 9, 0)]);
    sanPham.forEach((sp, i) => {
      const ban = banTheoThang.get(`${thang}|${sp.id}`) ?? 0;
      // Mua dư ~25% và làm tròn lên chục — tiệm mua theo thùng, không mua lẻ
      // đúng bằng số sẽ bán. Phần dư này chính là tồn kho cuối kỳ.
      const sl = Math.max(10, Math.ceil((ban * 1.25) / 10) * 10);
      dongNhap.push([uuid5(`${T}:nhapdong:${MA_ME}:${thang}:${sp.id}`), T, id, sp.id, sl, 1,
        // Giữ NGUYÊN giá vốn đang có: trigger sẽ ghi đè `item_costs` bằng
        // `don_gia_mua / he_so`, đặt lệch là tự tay đổi lãi gộp của tiệm mẫu.
        vonCua.get(sp.id) ?? Math.round(sp.price_vnd * 0.45), i]);
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

  // ── 5) KÉO MỐC THỜI GIAN CỦA DÒNG DO TRIGGER SINH ──────────────────────
  // Không thêm dòng, không đổi số — chỉ đưa `created_at` về đúng ngày chứng từ
  // gốc, nếu không Sổ quỹ và Sổ kho sẽ dồn hết vào phút chạy script.
  const { rowCount: nQuy } = await c.query(
    `update public.cash_entries ce set created_at = op.received_at
       from public.order_payments op
      where ce.order_payment_id = op.id and ce.tenant_id = $1
        and ce.created_at is distinct from op.received_at`, [T]);

  // SỔ KHO thì KHÔNG kéo mốc được, và đó là chủ ý của kho này:
  // `stock_moves_immutable_guard` chặn mọi UPDATE/DELETE — "sổ kho không sửa
  // được, ghi một dòng ngược lại thay vì sửa dòng cũ". Nên dòng kho do trigger
  // sinh sẽ mang mốc LÚC CHẠY SCRIPT, không phải ngày bán.
  // Không lách bằng cách chèn thẳng `stock_moves` với ngày đẹp: làm vậy là có
  // hai nguồn cùng nói về một lần xuất kho, đúng cái bệnh của việc #18.
  // Tồn kho hiện tại vẫn ĐÚNG (tổng số lượng không đổi); chỉ có báo cáo kho
  // theo ngày là dồn về hôm nay. Đây là hạn chế được ghi nhận, không phải lỗi.

  // Ai đã có đơn XONG thì mới là khách hàng thật sự.
  const { rowCount: nKhachThat } = await c.query(
    `update public.contacts ct set lifecycle = 'customer'
      where ct.tenant_id = $1 and ct.lifecycle <> 'customer'
        and exists (select 1 from public.orders o
                     where o.contact_id = ct.id and o.status = 'completed'
                       and o.kind = 'order' and o.deleted_at is null)`, [T]);

  // Mốc tương tác cuối của khách — kéo theo việc tính lại hạng khách
  // (trigger `contacts_tier_recompute`), nếu không ai cũng đứng hạng "new".
  const { rowCount: nMoc } = await c.query(
    `update public.contacts ct
        set last_interaction_at = m.luc
       from (
         select x.contact_id, max(x.luc) luc from (
           select contact_id, start_at luc from public.appointments
             where tenant_id = $1 and deleted_at is null and start_at <= now()
           union all
           select contact_id, created_at from public.orders
             where tenant_id = $1 and deleted_at is null
         ) x group by x.contact_id
       ) m
      where ct.id = m.contact_id and ct.tenant_id = $1
        and ct.last_interaction_at is distinct from m.luc`, [T]);

  await c.query("commit");

  // ── 6) NGHIỆM THU ──────────────────────────────────────────────────────
  const sau = await dem();
  console.log("\n── ĐÃ GHI TRONG LẦN CHẠY NÀY ──────────────────────────────");
  console.log(`  khách mới          ${nKhach}`);
  console.log(`  lịch hẹn mới       ${nLich}`);
  console.log(`  đơn mới            ${nDon}  (gồm ${phieuHoan.length} phiếu hoàn)`);
  console.log(`  dòng đơn mới       ${nDong}`);
  console.log(`  phiếu thu mới      ${nThu}`);
  console.log(`  phiếu nhập mới     ${nNhap} (${nDongNhap} dòng nhập)`);
  console.log(`  kéo mốc: ${nQuy} phiếu quỹ · ${nMoc} mốc tương tác khách`);
  console.log(`  nâng lên "khách hàng"  ${nKhachThat}`);

  console.log("\n── ĐỐI CHỨNG TRƯỚC / SAU ──────────────────────────────────");
  console.log("  bảng                  trước      sau     tăng   nguồn");
  const nguon = {
    contacts: "script ghi", appointments: "script ghi", orders: "script ghi",
    order_lines: "script ghi", order_payments: "script ghi",
    stock_moves: "TRIGGER", cash_entries: "TRIGGER", commission_entries: "TRIGGER",
  };
  for (const b of BANG_DEM) {
    console.log(`  ${b.padEnd(20)}${String(truoc[b]).padStart(6)}${String(sau[b]).padStart(9)}` +
      `${String(sau[b] - truoc[b]).padStart(9)}   ${nguon[b]}`);
  }

  // Cân đối tiền: tổng thu của đơn đã xong phải bằng tổng dòng đơn.
  const { rows: lech } = await c.query(
    `select count(*)::int n from (
       select o.id,
              coalesce((select sum(l.line_total_vnd) from public.order_lines l where l.order_id = o.id), 0) tong,
              coalesce((select sum(p.amount_vnd) from public.order_payments p where p.order_id = o.id), 0) thu
         from public.orders o
        where o.tenant_id = $1 and o.status = 'completed' and o.kind = 'order' and o.deleted_at is null
     ) x where x.tong <> x.thu`, [T]);
  const { rows: hh } = await c.query(
    `select count(*)::int dong, count(distinct employee_id)::int nguoi, coalesce(sum(amount_vnd),0)::bigint tien
       from public.commission_entries where tenant_id = $1`, [T]);
  const { rows: pb } = await c.query(
    `select status, count(*)::int n from public.appointments where tenant_id = $1 group by 1 order by 1`, [T]);

  console.log("\n── KIỂM CHÉO ──────────────────────────────────────────────");
  console.log(`  đơn đã xong mà thu ≠ tổng dòng: ${lech[0].n} ${lech[0].n === 0 ? "✔" : "✖ LỆCH"}`);
  console.log(`  hoa hồng: ${hh[0].dong} dòng · ${hh[0].nguoi} người · ${Number(hh[0].tien).toLocaleString("vi-VN")}đ` +
    ` ${hh[0].dong > 0 ? "✔" : "✖ PHÉP NỐI HOA HỒNG ĐANG HỎNG"}`);
  console.log(`  lịch hẹn theo trạng thái: ${pb.map((r) => `${r.status}=${r.n}`).join(" · ")}`);

  // ── TIỆM CÓ LÃI KHÔNG ──────────────────────────────────────────────────
  // Đây là phép kiểm ở TẦNG KINH DOANH, không phải tầng bảng biểu: dữ liệu mẫu
  // có thể khớp từng ô mà vẫn kể một câu chuyện sai (20 nhân viên, doanh thu
  // của tiệm 3 người ⇒ mở Báo cáo ra thấy tiệm sắp phá sản).
  const { rows: quyLuong } = await c.query(
    `select coalesce(sum(base_salary_vnd), 0)::bigint luong, count(*)::int n
       from public.employees where tenant_id = $1 and ended_on is null`, [T]);
  const luongThang = Number(quyLuong[0].luong);
  const { rows: thang } = await c.query(
    `select to_char(o.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') ky,
            count(distinct o.id)::int don, sum(l.line_total_vnd)::bigint tien
       from public.orders o join public.order_lines l on l.order_id = o.id
      where o.tenant_id = $1 and o.status = 'completed' and o.deleted_at is null
      group by 1 order by 1`, [T]);
  console.log(`
── TIỆM CÓ LÃI KHÔNG ──────────────────────────────────────`);
  console.log(`  quỹ lương ${quyLuong[0].n} người: ${luongThang.toLocaleString("vi-VN")}đ/tháng`);
  for (const r of thang) {
    const tien = Number(r.tien);
    const tyLe = ((luongThang / tien) * 100).toFixed(1);
    // Tháng đầu và tháng cuối bị cắt cụt theo cửa sổ nạp — đánh dấu để không ai
    // đọc nhầm thành "tháng đó tiệm ế".
    const cut = (r.ky === thang[0].ky || r.ky === thang[thang.length - 1].ky) ? " (tháng cụt)" : "";
    console.log(`  ${r.ky}  ${String(r.don).padStart(5)} đơn  ${tien.toLocaleString("vi-VN").padStart(15)}đ` +
      `  lương/doanh thu ${tyLe.padStart(5)}%${cut}`);
  }
  const tron = thang.slice(1, -1);
  if (tron.length > 0) {
    const tb = tron.reduce((x, r) => x + Number(r.tien), 0) / tron.length;
    const tyLe = (luongThang / tb) * 100;
    console.log(`  ── tháng TRÒN: doanh thu TB ${Math.round(tb).toLocaleString("vi-VN")}đ/tháng` +
      ` · lương/doanh thu ${tyLe.toFixed(1)}%` +
      ` ${tyLe >= 30 && tyLe <= 45 ? "✔ đúng mặt bằng spa" : "✖ LỆCH MẶT BẰNG"}`);
    console.log(`  ── lãi gộp trước chi phí khác: ${Math.round(tb - luongThang).toLocaleString("vi-VN")}đ/tháng` +
      ` ${tb - luongThang > 0 ? "✔ có lãi" : "✖ ĐANG LỖ"}`);
  }

  // Tồn kho phải DƯƠNG: tiệm không bán được thứ nó chưa mua.
  const { rows: ton } = await c.query(
    `select i.name, coalesce(sum(sm.qty), 0)::int ton
       from public.items i left join public.stock_moves sm on sm.item_id = i.id
      where i.tenant_id = $1 and i.kind = 'product' group by 1 order by 1`, [T]);
  const am = ton.filter((r) => r.ton < 0);
  console.log(`  tồn kho: ${ton.map((r) => `${r.name}=${r.ton}`).join(" · ")}`);
  console.log(`  mặt hàng tồn ÂM: ${am.length} ${am.length === 0 ? "✔" : "✖ CÒN ÂM"}`);

  await c.end();
}

// ── Tiện ích ghi ──────────────────────────────────────────────────────────
async function daCo(bang, ids) {
  const co = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const { rows } = await c.query(
      `select id from public.${bang} where id = any($1::uuid[])`, [ids.slice(i, i + 500)]);
    for (const r of rows) co.add(r.id);
  }
  return co;
}

async function chenNhieu(bang, cot, hang, moLan = 300) {
  let n = 0;
  for (let i = 0; i < hang.length; i += moLan) {
    const phan = hang.slice(i, i + moLan);
    const o = [];
    const tsn = [];
    phan.forEach((r, j) => {
      o.push("(" + cot.map((_, k) => `$${j * cot.length + k + 1}`).join(",") + ")");
      tsn.push(...r);
    });
    const kq = await c.query(
      `insert into public.${bang} (${cot.join(",")}) values ${o.join(",")} on conflict (id) do nothing`, tsn);
    n += kq.rowCount;
  }
  return n;
}

/** Chuyển trạng thái theo mẻ nhỏ — mỗi dòng vẫn kích trigger riêng. */
async function doiTrangThai(ids, trangThai) {
  for (let i = 0; i < ids.length; i += 100) {
    await c.query(`update public.orders set status = $2 where id = any($1::uuid[])`,
      [ids.slice(i, i + 100), trangThai]);
  }
}

main().catch(async (e) => {
  try { await c.query("rollback"); } catch { /* kết nối có thể đã đứt */ }
  console.error("\n✖ HỎNG:", e.message);
  if (e.detail) console.error("  chi tiết:", e.detail);
  if (e.constraint) console.error("  ràng buộc:", e.constraint);
  process.exit(1);
});
