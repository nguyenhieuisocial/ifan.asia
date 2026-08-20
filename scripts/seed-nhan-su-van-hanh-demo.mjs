#!/usr/bin/env node
/**
 * NẠP VẬN HÀNH NHÂN SỰ + TUYỂN DỤNG cho tiệm mẫu — biến 21 hồ sơ nhân viên
 * thành một tiệm 20 người CÓ THẬT ca làm, chấm công, bảng công, lương, tuyển dụng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG BỊA SỐ — mọi con số ở đây đều SUY RA từ dữ liệu gốc
 * ═══════════════════════════════════════════════════════════════════════════
 * Kho này đã trả giá cho lớp bệnh "tự chèn số vào chỗ đáng lẽ sản phẩm tính ra"
 * (việc #18). Nên bộ nạp này KHÔNG gõ tay một con số nào mà màn hình có nút
 * "Tính lại". Cụ thể, đo trên CSDL thật ngày 20/08:
 *
 *   • `timesheets.work_days` / `flag_count` — nút "Tính lại bảng công"
 *     (`app/app/team/actions.ts` → `tinhLaiBangCong`) đếm SỐ NGÀY có lần chấm
 *     'in' và SỐ LẦN bị gắn cờ, lấy từ `attendance_punches`. Ở đây hai số đó
 *     cũng được đếm bằng đúng câu hỏi ấy, hỏi thẳng CSDL SAU KHI đã ghi lần
 *     chấm. Gõ tay "24 công" rồi bấm Tính lại ra 21 là hai sự thật trên một màn.
 *
 *   • `attendance_punches.out_of_range` — KHÔNG ghi. Trigger `attendance_set_flag()`
 *     tự quyết theo `distance_m` (>300m hoặc null ⇒ gắn cờ). Script chỉ đưa toạ
 *     độ thô, y như trình duyệt của nhân viên.
 *
 *   • `attendance_punches.distance_m` — tính bằng ĐÚNG công thức haversine của
 *     `app/app/team/queries.ts` (`khoangCachM`), từ toạ độ tiệm trong
 *     `tenants.settings.workLocation`. Chưa khai toạ độ tiệm thì mọi lần chấm
 *     đều bị gắn cờ — nên script khai toạ độ trước (gộp vào jsonb, không đè).
 *
 *   • `payslip_lines` / `payslips.gross_vnd` / `deduction_vnd` /
 *     `payroll_periods.total_vnd` — dựng lại theo đúng thứ tự và đúng công thức
 *     của `tinhLaiKyLuong` + `capNhatTongPhieu` (`app/app/payroll/actions.ts`):
 *     lương cứng và tăng ca sinh TỪ bảng công (`source_type='timesheet'`, trỏ về
 *     đúng `timesheets.id`), tổng phiếu cộng TỪ dòng, tổng kỳ cộng TỪ phiếu.
 *     `net_vnd` và `shift_closings.variance` là CỘT SINH — không ghi được.
 *
 *   • `shift_closings.expected_cash` — chuỗi tính của `tinhExpectedCash`
 *     (`app/app/ketsat/queries.ts`): tiền đầu ca + tiền mặt vào/ra kể từ ca
 *     trước. Script thêm một chặn trên "tính tới đúng thời điểm chốt ca đó" —
 *     hàm thật không cần vì lúc nó chạy thì tương lai chưa tồn tại.
 *
 * Hai số CÒN LẠI là số NGƯỜI gõ, sản phẩm cố ý không tự tính:
 *   • `late_count` — `tinhLaiBangCong` từ chối đoán, vì `shifts` chỉ có
 *     sáng/chiều/cả-ngày chứ không có giờ bắt đầu ca. Ở đây script tự đặt giờ
 *     ca (sáng 08:30 · chiều 13:30 · cả ngày 08:30) rồi ĐẾM những ngày nó đã
 *     dựng lần chấm muộn hơn giờ đó — nên con số khớp với lần chấm nhìn thấy
 *     được, chứ không phải một con số rơi từ trên trời.
 *   • `overtime_hours` — đếm từ số phút chấm ra SAU giờ tan ca, cùng lý do.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO THỨ TỰ NÀY, KHÔNG PHẢI THỨ TỰ KHÁC
 * ═══════════════════════════════════════════════════════════════════════════
 * Các chốt chặn của kho quy định thứ tự, không phải sở thích:
 *   1. `punch_locked_period_guard` chặn ghi lần chấm vào tháng đã chốt bảng
 *      công ⇒ CHẤM CÔNG TRƯỚC, CHỐT BẢNG CÔNG SAU.
 *   2. `payroll_close_guard` từ chối chốt kỳ lương nếu còn người có phiếu lương
 *      mà bảng công tháng đó chưa chốt ⇒ CHỐT BẢNG CÔNG TRƯỚC, CHỐT LƯƠNG SAU.
 *   3. `payslips_locked_guard` / `payslip_lines_locked_guard` chặn ghi phiếu và
 *      dòng phiếu khi kỳ đã chốt ⇒ DỰNG PHIẾU TRƯỚC, CHỐT KỲ SAU.
 * Không cái nào bị vô hiệu hoá ở đây. Script đi theo đường chúng cho phép.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHẠY LẠI KHÔNG NHÂN ĐÔI
 * ═══════════════════════════════════════════════════════════════════════════
 * Mọi thứ neo vào khoá cố định: `(tenant_id, employee_id, work_date)` cho ca,
 * `(tenant_id, employee_id, period)` cho bảng công, `(period_id, employee_id)`
 * cho phiếu lương. Bảng không có khoá duy nhất (lần chấm, đơn nghỉ, tin tuyển,
 * ứng viên, phỏng vấn, chốt ca) thì neo bằng "đã có thì thôi" trên bộ cột nhận
 * dạng. Mọi số ngẫu nhiên đi qua `nn()` — hàm băm tất định, KHÔNG phải
 * Math.random() — nên chạy lần hai dựng lại y hệt lần một.
 * Kỳ ĐÃ CHỐT thì bỏ qua hẳn, không đụng vào: đó vừa là cách chạy lại an toàn,
 * vừa là tôn trọng đúng ý nghĩa của chữ "đã chốt".
 *
 * ⚠️ CHỈ ghi vào tiệm `is_sample = true` — có chốt kiểm ở đầu, không phải lời hứa.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MỘT VIỆC CỐ Ý KHÔNG LÀM — phải đọc trước khi "bổ sung cho đủ"
 * ═══════════════════════════════════════════════════════════════════════════
 * Chốt kỳ lương trên sản phẩm (`chotKyLuong`) còn TỰ SINH MỘT PHIẾU CHI trong
 * Sổ quỹ (`cash_entries`, loại 'salary'). Script này KHÔNG sinh phiếu chi đó.
 * Lý do đo được: sổ quỹ của tiệm mẫu chỉ có dữ liệu từ 21/07/2026 tới nay
 * (~4 tuần, thu ~50 triệu), trong khi quỹ lương một tháng của 20 người ở đây là
 * ~190 triệu. Ghi 3 tháng lương vào sẽ cho tiệm mẫu lỗ ~500 triệu trên màn Báo
 * cáo, mà tháng 5 và tháng 6 thì thậm chí KHÔNG có một đồng doanh thu nào để
 * đối ứng. Đây là chỗ dữ liệu mẫu đang lệch (doanh thu mẫu quá ngắn so với quy
 * mô nhân sự mẫu) — nói ra để người quyết, chứ không tự ghi rồi im.
 *
 *   node --env-file=.env.local scripts/seed-nhan-su-van-hanh-demo.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";

const SLUG = process.env.TIEM ?? "demo-spa-huong-sen";

/**
 * Mốc "hôm nay" ĐÓNG CỨNG, không lấy `new Date()`.
 * Chạy lại tháng sau mà mốc trôi theo là dữ liệu dựng ra khác lần trước — vi
 * phạm chính điều kiện nghiệm thu "chạy 2 lần ra cùng kết quả".
 */
const HOM_NAY = "2026-08-20";
/** Ba kỳ cũ ĐÃ CHỐT + kỳ hiện tại còn nháp. */
const KY_DA_CHOT = ["2026-05-01", "2026-06-01", "2026-07-01"];
const KY_NHAP = "2026-08-01";
const MOC_DAU = "2026-05-01";

/** Toạ độ tiệm mẫu (Quận 1, TP.HCM). Bán kính "coi như tại tiệm" là 300m. */
const VI_TRI_TIEM = { lat: 10.7769, lng: 106.7009 };
const BAN_KINH_M = 300;

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

// ── Ngẫu nhiên TẤT ĐỊNH ────────────────────────────────────────────────────
// Băm FNV-1a rồi trộn kiểu mulberry32. Cùng đầu vào ⇒ cùng đầu ra, không phụ
// thuộc thứ tự gọi — nên hai lần chạy dựng ra đúng một bộ dữ liệu.
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
/** Số nguyên trong [a,b] tất định. */
const nnInt = (a, b, ...phan) => a + Math.floor(nn(...phan) * (b - a + 1));

// ── Ngày tháng: chuỗi 'yyyy-MM-dd', tính bằng UTC để không bị lệch múi giờ ──
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
/** Nhãn kỳ 'MM/YYYY' — đúng `kpiMonthLabel` của lib/kpi.ts. */
const nhanKy = (ky) => `${ky.slice(5, 7)}/${ky.slice(0, 4)}`;
/** Giờ VN → mốc thời gian ISO (UTC+7). */
const gioVN = (ngay, phutTrongNgay) => {
  const [y, m, d] = ngay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, phutTrongNgay - 7 * 60)).toISOString();
};

/** Haversine — SAO CHÉP nguyên `khoangCachM` của app/app/team/queries.ts. */
function khoangCachM(a, b) {
  const R = 6_371_000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}
/** Một điểm cách tiệm `met` mét theo hướng `goc` (radian). */
function toaDoCach(met, goc) {
  const dLat = (met * Math.cos(goc)) / 111_320;
  const dLng = (met * Math.sin(goc)) / (111_320 * Math.cos((VI_TRI_TIEM.lat * Math.PI) / 180));
  return {
    lat: Number((VI_TRI_TIEM.lat + dLat).toFixed(6)),
    lng: Number((VI_TRI_TIEM.lng + dLng).toFixed(6)),
  };
}

// ── Chức danh nghề đọc từ `employees.note` ─────────────────────────────────
// Cột `note` là chỗ bộ nạp nhân sự ghi chức danh, nhưng vài người mang ghi chú
// đời thường ("Làm 3 buổi/tuần…", "Đã nghỉ việc…"). Nên đọc bằng TỪ KHOÁ và có
// đường lui, chứ không so bằng dấu bằng.
function nghe(ghiChu) {
  const s = (ghiChu ?? "").toLowerCase();
  if (s.includes("buổi/tuần")) return "banthoigian";
  if (s.includes("chủ tiệm")) return "chu";
  if (s.includes("quản lý")) return "quanly";
  if (s.includes("kỹ thuật viên trưởng")) return "ktvtruong";
  if (s.includes("lễ tân")) return "letan";
  if (s.includes("thu ngân")) return "thungan";
  if (s.includes("kế toán")) return "ketoan";
  if (s.includes("bảo vệ")) return "baove";
  if (s.includes("marketing") || s.includes("chăm sóc khách hàng")) return "vanphong";
  if (s.includes("phụ tá")) return "phuta";
  if (s.includes("kỹ thuật viên")) return "ktv";
  return "ktv";
}

/** Giờ bắt đầu / kết thúc từng loại ca, tính bằng phút trong ngày. */
const GIO_CA = {
  morning: { vao: 8 * 60 + 30, ra: 13 * 60 },
  afternoon: { vao: 13 * 60 + 30, ra: 21 * 60 },
  full: { vao: 8 * 60 + 30, ra: 20 * 60 },
};

/**
 * Xếp ca cho một người vào một ngày.
 * Trả null = ngày đó KHÔNG có ô ca nào (đúng cách sản phẩm hiểu: `xepCa` với
 * kind null là XOÁ ô, còn 'off' là ô "nghỉ" cố ý).
 */
function caTrongNgay(nv, ngay) {
  const d = thu(ngay);
  const ngayNghiTuan = 1 + (nv.thuTu % 6); // rải ngày nghỉ tuần ra cả tuần
  switch (nv.nghe) {
    case "chu":
    case "quanly":
      return d === 0 ? "off" : "full";
    case "vanphong":
      return d === 0 || d === 6 ? "off" : "full";
    case "banthoigian":
      return d === 1 || d === 3 || d === 5 ? "full" : "off";
    case "thungan":
      if (d === 0) return "off";
      return d === 6 ? "morning" : "full";
    case "baove":
      return d === ngayNghiTuan ? "off" : "full";
    case "phuta":
      return d === 0 ? "off" : "morning";
    case "letan":
      if (d === ngayNghiTuan) return "off";
      return nv.thuTu % 2 === 0 ? "morning" : "afternoon";
    case "ktvtruong":
      return d === ngayNghiTuan ? "off" : "full";
    default: {
      if (d === ngayNghiTuan) return "off";
      // KTV chia hai kíp sáng/chiều, đảo theo tuần để không ai ôm mãi một kíp.
      const tuan = Math.floor(ngayToSo(ngay) / (7 * 86400000));
      return (nv.thuTu + tuan) % 2 === 0 ? "morning" : "afternoon";
    }
  }
}

// ── Dữ liệu tuyển dụng ─────────────────────────────────────────────────────
const TIN_TUYEN = [
  {
    ma: "phuta2025",
    title: "Phụ tá kỹ thuật viên",
    headcount: 1,
    opened_on: "2025-07-10",
    status: "closed",
    note: "Đã tuyển xong — nhận việc đầu tháng 8/2025.",
  },
  {
    ma: "ktvda",
    title: "Kỹ thuật viên chăm sóc da (2 người)",
    headcount: 2,
    opened_on: "2026-07-05",
    status: "open",
    note: "Ưu tiên người có chứng chỉ chăm sóc da và từng làm spa từ 1 năm.",
  },
  {
    ma: "letanchieu",
    title: "Lễ tân ca chiều",
    headcount: 1,
    opened_on: "2026-07-20",
    status: "open",
    note: "Ca 13:30–21:00, nghỉ 1 ngày trong tuần. Cần giọng dễ nghe, quen dùng máy tính.",
  },
];

/**
 * Ứng viên. `stage` chỉ nhận applied|interview_scheduled|probation|hired (đã
 * đo); "bị loại" KHÔNG phải một cột — nó là `rejected_at` + `reject_reason`,
 * và `rejected_at` chính là đồng hồ đếm hạn giữ 12 tháng theo Nghị định 13.
 */
const UNG_VIEN = [
  // Người đã nhận việc — nối về đúng hồ sơ nhân sự đang đi làm (xem noiUngVienVaoNhanSu).
  { ma: "dm", tin: "phuta2025", ten: "Huỳnh Thị Diễm My", sdt: "0903771215",
    email: "diemmy.hs@example.com", sinh: "2003-01-19", nam: 0.5, nop: "2025-07-12",
    stage: "hired", luongMin: 6_000_000, luongMax: 7_500_000, tuNgay: "2025-08-01",
    nguon: "Người quen giới thiệu", note: "Chưa có kinh nghiệm spa, chịu học, đã thử việc 1 buổi." },

  { ma: "a1", tin: "ktvda", ten: "Nguyễn Thị Thu Hà", sdt: "0912400101",
    email: "thuha.ktv@example.com", sinh: "1997-05-14", nam: 4, nop: "2026-07-08",
    stage: "probation", luongMin: 9_000_000, luongMax: 11_000_000, tuNgay: "2026-08-01",
    nguon: "Facebook tuyển dụng", note: "Có chứng chỉ chăm sóc da, từng làm 3 năm ở spa Quận 3." },
  { ma: "a2", tin: "ktvda", ten: "Trần Ngọc Bảo Hân", sdt: "0912400102",
    email: "baohan.spa@example.com", sinh: "1999-09-02", nam: 2.5, nop: "2026-07-09",
    stage: "probation", luongMin: 8_500_000, luongMax: 10_000_000, tuNgay: "2026-08-10",
    nguon: "Facebook tuyển dụng", note: "Tay nghề khá, cần kèm thêm phần tư vấn liệu trình." },
  { ma: "a3", tin: "ktvda", ten: "Lê Thị Hồng Vân", sdt: "0912400103",
    email: "hongvan.lt@example.com", sinh: "1995-12-20", nam: 6, nop: "2026-07-11",
    stage: "interview_scheduled", luongMin: 11_000_000, luongMax: 13_000_000, tuNgay: "2026-09-01",
    nguon: "Trang tuyển dụng", note: "Mức mong muốn cao hơn khung, nhưng kinh nghiệm dày." },
  { ma: "a4", tin: "ktvda", ten: "Phạm Thị Kiều Trang", sdt: "0912400104",
    email: "kieutrang.pt@example.com", sinh: "2001-03-08", nam: 1.5, nop: "2026-07-15",
    stage: "interview_scheduled", luongMin: 8_000_000, luongMax: 9_500_000, tuNgay: "2026-08-25",
    nguon: "Nộp trực tiếp tại tiệm", note: null },
  { ma: "a5", tin: "ktvda", ten: "Võ Thị Ánh Tuyết", sdt: "0912400105",
    email: "anhtuyet.vo@example.com", sinh: "1998-07-30", nam: 3, nop: "2026-07-18",
    stage: "applied", luongMin: 9_000_000, luongMax: 10_500_000, tuNgay: "2026-09-15",
    nguon: "Facebook tuyển dụng", note: "Đang báo trước 30 ngày ở chỗ cũ." },
  { ma: "a6", tin: "ktvda", ten: "Đinh Thị Mỹ Hạnh", sdt: "0912400106",
    email: "myhanh.dinh@example.com", sinh: "2000-11-11", nam: 2, nop: "2026-07-22",
    stage: "applied", luongMin: 8_500_000, luongMax: 9_500_000, tuNgay: "2026-08-20",
    nguon: "Người quen giới thiệu", note: null },
  { ma: "a7", tin: "ktvda", ten: "Bùi Thị Ngọc Diệp", sdt: "0912400107",
    email: "ngocdiep.bui@example.com", sinh: "1996-02-25", nam: 5, nop: "2026-07-06",
    stage: "interview_scheduled", luongMin: 10_000_000, luongMax: 12_000_000, tuNgay: "2026-08-15",
    nguon: "Trang tuyển dụng",
    loai: { luc: "2026-07-24T04:00:00Z", vi: "Không thống nhất được mức lương — chênh 2 triệu so với khung." } },
  { ma: "a8", tin: "ktvda", ten: "Hoàng Thị Thanh Nga", sdt: "0912400108",
    email: null, sinh: "1994-06-17", nam: 7, nop: "2026-07-07",
    stage: "applied", luongMin: 12_000_000, luongMax: 14_000_000, tuNgay: "2026-10-01",
    nguon: "Nộp trực tiếp tại tiệm",
    loai: { luc: "2026-07-14T07:30:00Z", vi: "Chỉ nhận làm ca sáng, tiệm cần người trực cả ngày." } },

  { ma: "b1", tin: "letanchieu", ten: "Nguyễn Thị Cẩm Ly", sdt: "0912400201",
    email: "camly.nguyen@example.com", sinh: "2002-04-03", nam: 1, nop: "2026-07-23",
    stage: "interview_scheduled", luongMin: 7_500_000, luongMax: 8_500_000, tuNgay: "2026-08-25",
    nguon: "Facebook tuyển dụng", note: "Từng làm lễ tân phòng khám, quen phần mềm đặt lịch." },
  { ma: "b2", tin: "letanchieu", ten: "Trương Thị Hoài An", sdt: "0912400202",
    email: "hoaian.truong@example.com", sinh: "2003-08-19", nam: 0, nop: "2026-07-26",
    stage: "interview_scheduled", luongMin: 7_000_000, luongMax: 8_000_000, tuNgay: "2026-09-01",
    nguon: "Trang tuyển dụng", note: "Sinh viên năm cuối, xin làm ca chiều." },
  { ma: "b3", tin: "letanchieu", ten: "Lý Thị Tuyết Nhi", sdt: "0912400203",
    email: "tuyetnhi.ly@example.com", sinh: "2001-01-27", nam: 2, nop: "2026-07-28",
    stage: "applied", luongMin: 7_500_000, luongMax: 9_000_000, tuNgay: "2026-08-20",
    nguon: "Người quen giới thiệu", note: null },
  { ma: "b4", tin: "letanchieu", ten: "Đỗ Thị Kim Ngân", sdt: "0912400204",
    email: "kimngan.do@example.com", sinh: "2000-10-05", nam: 3, nop: "2026-08-03",
    stage: "applied", luongMin: 8_000_000, luongMax: 9_000_000, tuNgay: "2026-09-10",
    nguon: "Facebook tuyển dụng", note: null },
  { ma: "b5", tin: "letanchieu", ten: "Phan Thị Yến Vy", sdt: "0912400205",
    email: "yenvy.phan@example.com", sinh: "1999-03-12", nam: 4, nop: "2026-08-07",
    stage: "applied", luongMin: 8_500_000, luongMax: 9_500_000, tuNgay: "2026-09-01",
    nguon: "Trang tuyển dụng", note: "Đang cân nhắc thêm một chỗ nữa." },
  { ma: "b6", tin: "letanchieu", ten: "Mai Thị Thuỳ Dương", sdt: "0912400206",
    email: "thuyduong.mai@example.com", sinh: "2002-12-01", nam: 1, nop: "2026-07-30",
    stage: "applied", luongMin: 7_000_000, luongMax: 8_000_000, tuNgay: "2026-08-18",
    nguon: "Nộp trực tiếp tại tiệm",
    loai: { luc: "2026-08-05T09:00:00Z", vi: "Nhà xa, không đi được ca tan lúc 21:00." } },
  { ma: "b7", tin: null, ten: "Nguyễn Văn Hoàng", sdt: "0912400207",
    email: "vanhoang.ng@example.com", sinh: "1993-05-09", nam: 8, nop: "2026-08-11",
    stage: "applied", luongMin: 10_000_000, luongMax: 12_000_000, tuNgay: "2026-09-01",
    nguon: "Nộp trực tiếp tại tiệm", note: "Hồ sơ tự gửi, chưa gắn vào tin tuyển nào — kỹ thuật viên massage nam." },
];

/** Lịch phỏng vấn. `ketQua` null = chưa diễn ra (cột "chờ ghi kết quả"). */
const PHONG_VAN = [
  { ung: "a1", luc: "2026-07-16T02:30:00Z", nguoi: "ktvtruong_da", ketQua: "pass", ketQuaLuc: "2026-07-16T04:00:00Z",
    ghiChu: ["Tay nghề chắc, thao tác đẩy tinh chất gọn. Hỏi về liệu trình trị mụn trả lời có căn cứ.",
             "Đồng ý mức 10 triệu + hoa hồng. Cho thử việc 1 tháng từ 01/08."] },
  { ung: "a2", luc: "2026-07-17T03:00:00Z", nguoi: "ktvtruong_da", ketQua: "pass", ketQuaLuc: "2026-07-17T04:30:00Z",
    ghiChu: ["Làm sạch da tốt, phần tư vấn còn ngập ngừng. Cho thử việc, kèm thêm phần nói chuyện với khách."] },
  { ung: "a3", luc: "2026-08-21T02:30:00Z", nguoi: "quanly", ketQua: null, ketQuaLuc: null, ghiChu: [] },
  { ung: "a4", luc: "2026-08-22T07:00:00Z", nguoi: "ktvtruong_da", ketQua: null, ketQuaLuc: null, ghiChu: [] },
  { ung: "a7", luc: "2026-07-21T03:30:00Z", nguoi: "quanly", ketQua: "hold", ketQuaLuc: "2026-07-21T05:00:00Z",
    ghiChu: ["Kinh nghiệm rất tốt nhưng đòi 12 triệu, vượt khung 2 triệu. Giữ lại, hỏi lại chủ tiệm."] },
  { ung: "b1", luc: "2026-08-06T08:00:00Z", nguoi: "quanly", ketQua: "pass", ketQuaLuc: "2026-08-06T09:00:00Z",
    ghiChu: ["Nói năng dễ nghe, quen phần mềm đặt lịch. Hẹn gặp chủ tiệm chốt lương tuần sau."] },
  { ung: "b2", luc: "2026-08-24T08:30:00Z", nguoi: "quanly", ketQua: null, ketQuaLuc: null, ghiChu: [] },
  { ung: "b6", luc: "2026-08-04T09:00:00Z", nguoi: "quanly", ketQua: "fail", ketQuaLuc: "2026-08-04T10:00:00Z",
    ghiChu: ["Nhà ở Hóc Môn, ca tan 21:00 không có xe về. Bạn tự xin rút."] },
  { ung: "dm", luc: "2025-07-18T03:00:00Z", nguoi: "ktvtruong_massage", ketQua: "pass", ketQuaLuc: "2025-07-18T04:00:00Z",
    ghiChu: ["Chưa biết nghề nhưng nhanh tay, lễ phép. Nhận làm phụ tá, học dần."] },
];

async function main() {
  await c.connect();
  await c.query("set lock_timeout = '10s'");

  const { rows: [T] } = await c.query(
    `select id, name, slug, is_sample from public.tenants where slug = $1`, [SLUG]);
  if (!T) throw new Error(`Không có tiệm '${SLUG}'`);
  // Chốt kiểm, không phải lời hứa: bộ nạp này ghi ca làm, lương và hồ sơ ứng
  // viên. Chạy nhầm vào tiệm của khách là bịa dữ liệu nhân sự trong nhà người ta.
  if (!T.is_sample) throw new Error(`'${SLUG}' KHÔNG phải tiệm mẫu — dừng.`);
  log(`Tiệm: ${T.name} (${T.slug})\n`);

  const BANG = ["shifts", "attendance_punches", "timesheets", "leave_requests",
    "payroll_periods", "payslips", "payslip_lines", "shift_closings",
    "job_openings", "candidates", "interviews", "interview_notes"];

  async function dem() {
    const r = {};
    for (const b of BANG) {
      const { rows: [x] } = await c.query(
        `select count(*)::int n from public.${b} where tenant_id = $1`, [T.id]);
      r[b] = x.n;
    }
    return r;
  }
  const truoc = await dem();
  log("SỐ DÒNG TRƯỚC KHI NẠP");
  for (const b of BANG) log(`  ${b.padEnd(20)} ${String(truoc[b]).padStart(6)}`);
  log("");

  // ── 0. Toạ độ tiệm ───────────────────────────────────────────────────────
  // Gộp vào jsonb, KHÔNG ghi đè cả ô — `settings` là ô dùng chung của tiệm,
  // ghi đè là xoá mất thứ mảng khác đặt vào (đúng cách `datViTriTiem` làm).
  await c.query(
    `update public.tenants
        set settings = coalesce(settings, '{}'::jsonb)
                     || jsonb_build_object('workLocation', jsonb_build_object('lat', $2::numeric, 'lng', $3::numeric))
      where id = $1
        and coalesce(settings->'workLocation'->>'lat', '') is distinct from $2::text`,
    [T.id, VI_TRI_TIEM.lat, VI_TRI_TIEM.lng]);

  // ── 1. Người trong tiệm ──────────────────────────────────────────────────
  const { rows: nvRaw } = await c.query(
    `select id, user_id, full_name, note,
            to_char(started_on,'YYYY-MM-DD') started_on,
            to_char(ended_on,'YYYY-MM-DD')   ended_on,
            base_salary_vnd, overtime_rate_vnd, annual_leave_days
       from public.employees
      where tenant_id = $1
      order by started_on, full_name`, [T.id]);
  const NV = nvRaw.map((r, i) => ({
    id: r.id,
    uid: r.user_id,
    ten: r.full_name,
    nghe: nghe(r.note),
    vao: r.started_on,
    nghiViec: r.ended_on,
    luong: Number(r.base_salary_vnd),
    giaTangCa: Number(r.overtime_rate_vnd),
    phepNam: Number(r.annual_leave_days),
    thuTu: i,
  }));
  log(`Nhân sự: ${NV.length} hồ sơ (${NV.filter((n) => !n.nghiViec).length} đang làm)`);

  // Người quyết: chốt bảng công là việc của quản lý trở lên, chốt lương là việc
  // của chủ/quản trị. Tra theo VAI trong tiệm, không đóng cứng mã người.
  const { rows: vai } = await c.query(
    `select tm.user_id, tm.role, e.id emp_id, e.note
       from public.tenant_members tm
       left join public.employees e on e.tenant_id = tm.tenant_id and e.user_id = tm.user_id
      where tm.tenant_id = $1 and tm.status = 'active'`, [T.id]);
  const chuTiem = vai.find((v) => v.role === "owner")?.user_id;
  const quanTri = vai.find((v) => v.role === "admin")?.user_id ?? chuTiem;
  const ktvTruongDa = vai.find((v) => /trưởng.*da/i.test(v.note ?? ""))?.user_id ?? quanTri;
  const ktvTruongMassage = vai.find((v) => /trưởng.*massage/i.test(v.note ?? ""))?.user_id ?? quanTri;
  if (!chuTiem || !quanTri) throw new Error("Tiệm mẫu thiếu vai chủ tiệm / quản trị — dừng.");
  const NGUOI_PV = { quanly: quanTri, ktvtruong_da: ktvTruongDa, ktvtruong_massage: ktvTruongMassage };

  // ── 2. Đơn nghỉ phép ─────────────────────────────────────────────────────
  // Dựng trước ca làm vì ngày nghỉ ĐÃ DUYỆT phải thành ô "off" trên bảng xếp
  // ca — duyệt cho nghỉ mà vẫn xếp ca là hai màn nói hai chuyện.
  const dangLam = NV.filter((n) => !n.nghiViec && n.nghe !== "chu");
  const donNghi = [];
  const chon = (i) => dangLam[i % dangLam.length];
  // Đã duyệt (trong quá khứ) — chủ tiệm / quản trị quyết, KHÔNG ai tự quyết đơn mình.
  [["2026-05-18", "2026-05-20", "paid", "Về quê giỗ nội."],
   ["2026-06-08", "2026-06-09", "sick", "Sốt siêu vi, có giấy khám."],
   ["2026-06-22", "2026-06-24", "paid", "Đi du lịch cùng gia đình."],
   ["2026-07-06", "2026-07-06", "sick", "Đau dạ dày, xin nghỉ 1 ngày."],
   ["2026-07-13", "2026-07-15", "paid", "Đám cưới chị gái ở Đồng Nai."],
   ["2026-07-27", "2026-07-28", "unpaid", "Việc nhà, xin nghỉ không lương."],
   ["2026-08-10", "2026-08-11", "paid", "Đưa con đi nhập học."],
  ].forEach(([tu, den, loai, ly], i) => {
    const nv = chon(i * 3 + 1);
    donNghi.push({ nv, tu, den, loai, ly, trangThai: "approved",
      boi: i % 2 === 0 ? quanTri : chuTiem, luc: gioVN(themNgay(tu, -3), 10 * 60) });
  });
  // Đang chờ duyệt — ngày trong tương lai, để màn duyệt có việc thật để làm.
  [["2026-08-24", "2026-08-26", "paid", "Về quê ăn giỗ, xin nghỉ 3 ngày."],
   ["2026-08-28", "2026-08-28", "paid", "Đi khám sức khoẻ định kỳ."],
   ["2026-09-01", "2026-09-03", "unpaid", "Chuyển nhà, xin nghỉ không lương."],
  ].forEach(([tu, den, loai, ly], i) => {
    donNghi.push({ nv: chon(i * 5 + 2), tu, den, loai, ly, trangThai: "pending", boi: null, luc: null });
  });
  // Đã từ chối.
  [["2026-07-11", "2026-07-13", "paid", "Xin nghỉ cuối tuần đi chơi."],
   ["2026-08-15", "2026-08-16", "paid", "Xin nghỉ hai ngày cuối tuần."],
  ].forEach(([tu, den, loai, ly], i) => {
    donNghi.push({ nv: chon(i * 7 + 4), tu, den, loai, ly, trangThai: "rejected",
      boi: quanTri, luc: gioVN(themNgay(tu, -4), 15 * 60) });
  });

  let themNghi = 0;
  for (const d of donNghi) {
    const { rowCount } = await c.query(
      `insert into public.leave_requests
         (tenant_id, employee_id, from_date, to_date, kind, reason, status, decided_by, decided_at)
       select $1,$2,$3::date,$4::date,$5,$6,$7,$8,$9::timestamptz
        where not exists (
          select 1 from public.leave_requests
           where tenant_id = $1 and employee_id = $2 and from_date = $3::date)`,
      [T.id, d.nv.id, d.tu, d.den, d.loai, d.ly, d.trangThai, d.boi, d.luc]);
    themNghi += rowCount;
  }
  // Ngày nghỉ ĐÃ DUYỆT — đọc lại từ CSDL để dùng cả đơn đã có từ lần chạy trước.
  const { rows: nghiRows } = await c.query(
    `select employee_id, to_char(from_date,'YYYY-MM-DD') tu, to_char(to_date,'YYYY-MM-DD') den
       from public.leave_requests where tenant_id = $1 and status = 'approved'`, [T.id]);
  const ngayNghi = new Set();
  for (const r of nghiRows) {
    for (let d = r.tu; d <= r.den; d = themNgay(d, 1)) ngayNghi.add(`${r.employee_id}|${d}`);
  }
  log(`Đơn nghỉ phép: thêm ${themNghi} (tổng ${donNghi.length} đơn mẫu)`);

  // ── 3. Xếp ca ────────────────────────────────────────────────────────────
  const caEmp = [], caNgay = [], caLoai = [], caNote = [];
  /** Ca thật của từng người từng ngày — dùng lại ở bước chấm công. */
  const lichCa = new Map();
  for (const nv of NV) {
    for (let d = MOC_DAU; d <= HOM_NAY; d = themNgay(d, 1)) {
      if (d < nv.vao) continue;
      if (nv.nghiViec && d > nv.nghiViec) continue;
      let k = caTrongNgay(nv, d);
      let note = null;
      if (ngayNghi.has(`${nv.id}|${d}`)) { k = "off"; note = "Nghỉ phép đã duyệt"; }
      lichCa.set(`${nv.id}|${d}`, k);
      caEmp.push(nv.id); caNgay.push(d); caLoai.push(k); caNote.push(note);
    }
  }
  await c.query(
    `insert into public.shifts (tenant_id, employee_id, work_date, kind, note)
     select $1, x.emp, x.d, x.k, x.n
       from unnest($2::uuid[], $3::date[], $4::text[], $5::text[]) as x(emp, d, k, n)
     on conflict (tenant_id, employee_id, work_date)
       do update set kind = excluded.kind, note = excluded.note`,
    [T.id, caEmp, caNgay, caLoai, caNote]);
  log(`Xếp ca: ${caEmp.length} ô (${MOC_DAU} → ${HOM_NAY})`);

  // ── 4. Chấm công ─────────────────────────────────────────────────────────
  // Tháng ĐÃ chốt bảng công thì bỏ qua hẳn: `punch_locked_period_guard` chặn
  // ghi, và cũng KHÔNG nên ghi — đó là tháng đã khoá sổ.
  const KY = [...KY_DA_CHOT, KY_NHAP];
  const { rows: daChotRows } = await c.query(
    `select employee_id, to_char(period,'YYYY-MM-DD') ky
       from public.timesheets where tenant_id = $1 and status = 'closed'`, [T.id]);
  const bangCongDaChot = new Set(daChotRows.map((r) => `${r.employee_id}|${r.ky}`));

  /** Số liệu NGƯỜI gõ, đếm từ chính những lần chấm script vừa dựng. */
  const soNguoiGo = new Map(); // `${empId}|${ky}` -> { tre, phutTangCa }
  let soLanCham = 0, soLanCoLyDo = 0;

  const LY_DO_NGOAI_VUNG = [
    "Đi giao đồ cho khách ở chi nhánh phụ, chấm từ đó.",
    "Máy định vị lệch, đang đứng ở cổng sau tiệm.",
    "Kẹt xe, chấm ở đầu hẻm rồi đi bộ vào.",
    "Đưa khách ra bãi xe, quên chấm lúc còn trong tiệm.",
  ];

  for (const nv of NV) {
    for (const ky of KY) {
      if (bangCongDaChot.has(`${nv.id}|${ky}`)) continue;
      const dauKy = ky, cuoi = cuoiKy(ky);
      // Ghi lại từ đầu cho tháng còn nháp: xoá rồi dựng lại là cách duy nhất
      // chạy-lại-không-nhân-đôi trên bảng KHÔNG có khoá duy nhất.
      await c.query(
        `delete from public.attendance_punches
          where tenant_id = $1 and employee_id = $2
            and punched_at >= $3::timestamptz and punched_at < $4::timestamptz`,
        [T.id, nv.id, gioVN(dauKy, 0), gioVN(themNgay(cuoi, 1), 0)]);

      const pAt = [], pKind = [], pLat = [], pLng = [], pDist = [], pLy = [];
      let tre = 0, phutTangCa = 0;
      for (let d = dauKy; d <= cuoi && d <= HOM_NAY; d = themNgay(d, 1)) {
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
          // Ngoài vùng ~2,5% số lần chấm. `out_of_range` KHÔNG ghi ở đây —
          // trigger `attendance_set_flag()` tự quyết theo `distance_m`.
          const xa = nn(nv.id, d, loai, "xa") < 0.025;
          const met = xa ? nnInt(420, 1400, nv.id, d, loai, "met") : nnInt(3, 140, nv.id, d, loai, "met");
          const toaDo = toaDoCach(met, nn(nv.id, d, loai, "goc") * 2 * Math.PI);
          const khoang = khoangCachM(VI_TRI_TIEM, toaDo);
          const lyDo = khoang > BAN_KINH_M
            ? LY_DO_NGOAI_VUNG[nnInt(0, LY_DO_NGOAI_VUNG.length - 1, nv.id, d, loai, "ly")]
            : null;
          if (lyDo) soLanCoLyDo++;
          pAt.push(gioVN(d, phut)); pKind.push(loai);
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
          [T.id, nv.id, pAt, pKind, pLat, pLng, pDist, pLy]);
        soLanCham += pAt.length;
      }
      soNguoiGo.set(`${nv.id}|${ky}`, { tre, phutTangCa });
    }
  }
  log(`Chấm công: ${soLanCham} lần ghi mới (${soLanCoLyDo} lần ngoài vùng, có lý do)`);

  // ── 5. Bảng công ─────────────────────────────────────────────────────────
  // `work_days` và `flag_count` HỎI CSDL, không tự đếm trong bộ nhớ: phải là
  // đúng con số nút "Tính lại bảng công" sẽ ra, nếu không hai chỗ đá nhau.
  let themBC = 0, boQuaBC = 0;
  for (const nv of NV) {
    for (const ky of KY) {
      if (bangCongDaChot.has(`${nv.id}|${ky}`)) { boQuaBC++; continue; }
      if (nv.nghiViec && nv.nghiViec < ky) continue;
      if (cuoiKy(ky) < nv.vao) continue;
      const { rows: [t] } = await c.query(
        `select count(distinct case when kind = 'in'
                  then (punched_at at time zone 'Asia/Ho_Chi_Minh')::date end)::int cong,
                count(*) filter (where out_of_range)::int co
           from public.attendance_punches
          where tenant_id = $1 and employee_id = $2
            and punched_at >= $3::timestamptz and punched_at < $4::timestamptz`,
        [T.id, nv.id, gioVN(ky, 0), gioVN(themNgay(cuoiKy(ky), 1), 0)]);
      const go = soNguoiGo.get(`${nv.id}|${ky}`) ?? { tre: 0, phutTangCa: 0 };
      const gioTangCa = Math.round((go.phutTangCa / 60) * 10) / 10;
      const { rowCount } = await c.query(
        `insert into public.timesheets
           (tenant_id, employee_id, period, work_days, overtime_hours, late_count, flag_count)
         values ($1,$2,$3::date,$4,$5,$6,$7)
         on conflict (tenant_id, employee_id, period) do update
            set work_days = excluded.work_days, overtime_hours = excluded.overtime_hours,
                late_count = excluded.late_count, flag_count = excluded.flag_count
          where timesheets.status = 'draft'`,
        [T.id, nv.id, ky, t.cong, gioTangCa, Math.min(go.tre, 200), Math.min(t.co, 200)]);
      themBC += rowCount;
    }
  }
  log(`Bảng công: ghi ${themBC} dòng · bỏ qua ${boQuaBC} dòng đã chốt`);

  // ── 6. Chốt bảng công các kỳ cũ ──────────────────────────────────────────
  // Quản lý tiệm chốt — đúng vai `manager` trở lên mà RLS #166 cho phép.
  for (const ky of KY_DA_CHOT) {
    const { rowCount } = await c.query(
      `update public.timesheets
          set status = 'closed', closed_by = $3, closed_at = $4::timestamptz
        where tenant_id = $1 and period = $2::date and status = 'draft'`,
      [T.id, ky, quanTri, gioVN(themNgay(cuoiKy(ky), 1), 10 * 60)]);
    if (rowCount) log(`  chốt bảng công kỳ ${nhanKy(ky)}: ${rowCount} dòng`);
  }

  // ── 7. Bảng lương ────────────────────────────────────────────────────────
  // Dựng lại theo đúng `tinhLaiKyLuong`: dòng lương cứng / tăng ca sinh TỪ bảng
  // công và trỏ `source_id` về đúng dòng bảng công đó. Kỳ đã chốt bỏ qua hẳn.
  for (const ky of KY) {
    await c.query(
      `insert into public.payroll_periods (tenant_id, period) values ($1, $2::date)
       on conflict (tenant_id, period) do nothing`, [T.id, ky]);
    const { rows: [kyRow] } = await c.query(
      `select id, status from public.payroll_periods where tenant_id = $1 and period = $2::date`,
      [T.id, ky]);
    if (kyRow.status === "closed") { log(`  kỳ lương ${nhanKy(ky)}: đã chốt — bỏ qua`); continue; }

    // Cùng bộ lọc người với `tinhLaiKyLuong`: còn làm trong kỳ.
    const nguoiTrongKy = NV.filter((n) => (!n.nghiViec || n.nghiViec >= ky) && n.vao <= cuoiKy(ky));
    const empIds = nguoiTrongKy.map((n) => n.id);
    await c.query(
      `insert into public.payslips (tenant_id, period_id, employee_id)
       select $1, $2, x.emp from unnest($3::uuid[]) as x(emp)
       on conflict (period_id, employee_id) do nothing`, [T.id, kyRow.id, empIds]);
    const { rows: phieuRows } = await c.query(
      `select id, employee_id from public.payslips where tenant_id = $1 and period_id = $2`,
      [T.id, kyRow.id]);
    const phieuCua = new Map(phieuRows.map((r) => [r.employee_id, r.id]));
    const { rows: bcRows } = await c.query(
      `select id, employee_id, work_days, overtime_hours
         from public.timesheets where tenant_id = $1 and period = $2::date`, [T.id, ky]);
    const bcCua = new Map(bcRows.map((r) => [r.employee_id, r]));

    // Hoa hồng: MỖI KHOẢN MỘT DÒNG, `source_id` trỏ về đúng khoản gốc — gộp
    // thành một dòng tổng là mất đường bấm về nơi con số ra đời (quyết định 2
    // của thẻ Bảng lương). Đây là dữ liệu do mảng bán hàng sinh; bỏ qua nó thì
    // bấm "Tính lại kỳ lương" là mọi phiếu đổi số ngay.
    const { rows: hhRows } = await c.query(
      `select id, employee_id, amount_vnd, to_char(earned_on,'YYYY-MM-DD') earned_on, note
         from public.commission_entries
        where tenant_id = $1 and earned_on >= $2::date and earned_on <= $3::date
          and amount_vnd <> 0`, [T.id, ky, cuoiKy(ky)]);
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
        dong.push({ kind: "base", tien: nv.luong, nguon: "timesheet", nguonId: bc.id,
          nhan: `Lương cứng kỳ ${nhanKy(ky)} · ${Number(bc.work_days)} công` });
      }
      const gioTangCa = Number(bc?.overtime_hours ?? 0);
      if (bc && gioTangCa > 0 && nv.giaTangCa > 0) {
        dong.push({ kind: "overtime", tien: Math.round(gioTangCa * nv.giaTangCa),
          nguon: "timesheet", nguonId: bc.id,
          nhan: `Tăng ca kỳ ${nhanKy(ky)} · ${gioTangCa} giờ` });
      }
      for (const h of hhCua.get(nv.id) ?? []) {
        dong.push({ kind: "commission", tien: Number(h.amount_vnd), nguon: "commission",
          nguonId: h.id, nhan: h.note ?? `Hoa hồng ngày ${h.earned_on}` });
      }
      // Dòng GHI TAY — 'manual' bắt buộc có nhãn + người ghi (CHECK payslip_lines_co_goc).
      if (nv.luong > 0) {
        const bh = Math.round((nv.luong * 0.105) / 1000) * 1000;
        dong.push({ kind: "insurance", tien: -bh, nguon: "manual", nguonId: null,
          nhan: `BHXH - BHYT - BHTN 10,5% kỳ ${nhanKy(ky)}` });
      }
      if (nn(nv.id, ky, "tamung") < 0.22 && nv.luong > 0) {
        const ung = nnInt(1, 3, nv.id, ky, "mucung") * 1_000_000;
        dong.push({ kind: "advance", tien: -ung, nguon: "manual", nguonId: null,
          nhan: `Tạm ứng lương kỳ ${nhanKy(ky)}` });
      }

      // Dọn dòng MÁY sinh (đúng như sản phẩm làm) + dọn ĐÚNG những dòng ghi tay
      // của chính bộ nạp này, nhận dạng bằng nhãn. Không đụng dòng người khác ghi.
      const nhanTay = dong.filter((x) => x.nguon === "manual").map((x) => x.nhan);
      await c.query(
        `delete from public.payslip_lines
          where payslip_id = $1
            and (source_type in ('timesheet','commission')
                 or (source_type = 'manual' and label = any($2::text[])))`,
        [phieuId, nhanTay]);
      if (dong.length) {
        await c.query(
          `insert into public.payslip_lines
             (tenant_id, payslip_id, kind, amount_vnd, source_type, source_id, label, created_by)
           select $1, $2, x.k, x.t, x.st, x.si,  x.nh,
                  case when x.st = 'manual' then $8::uuid else null end
             from unnest($3::text[], $4::bigint[], $5::text[], $6::uuid[], $7::text[])
               as x(k, t, st, si, nh)`,
          [T.id, phieuId, dong.map((x) => x.kind), dong.map((x) => x.tien),
           dong.map((x) => x.nguon), dong.map((x) => x.nguonId), dong.map((x) => x.nhan), quanTri]);
      }
    }

    // Tổng phiếu CỘNG TỪ DÒNG — công thức `capNhatTongPhieu`. `net_vnd` là cột sinh.
    await c.query(
      `update public.payslips p
          set gross_vnd = coalesce(g.gross, 0), deduction_vnd = coalesce(g.ded, 0)
         from unnest($1::uuid[]) as x(id)
         left join (
           select payslip_id,
                  sum(case when amount_vnd > 0 then amount_vnd else 0 end) gross,
                  sum(case when amount_vnd < 0 then -amount_vnd else 0 end) ded
             from public.payslip_lines where payslip_id = any($1::uuid[]) group by payslip_id
         ) g on g.payslip_id = x.id
        where p.id = x.id`, [phieuIds]);
    // Tổng kỳ CỘNG TỪ PHIẾU.
    const { rows: [tong] } = await c.query(
      `update public.payroll_periods
          set total_vnd = greatest(0, coalesce(
                (select sum(net_vnd) from public.payslips where period_id = $1), 0))
        where id = $1 returning total_vnd`, [kyRow.id]);
    log(`  kỳ lương ${nhanKy(ky)}: ${phieuIds.length} phiếu · tổng ${tien(tong.total_vnd)} ₫`);
  }

  // ── 8. Chốt các kỳ lương cũ ──────────────────────────────────────────────
  // Chủ tiệm chốt. `payroll_close_guard` sẽ từ chối nếu còn bảng công chưa chốt —
  // bước 6 đã lo, nên tới đây là đi qua được, không cần tắt chốt chặn nào.
  for (const ky of KY_DA_CHOT) {
    const { rowCount } = await c.query(
      `update public.payroll_periods
          set status = 'closed', closed_by = $3, closed_at = $4::timestamptz
        where tenant_id = $1 and period = $2::date and status = 'draft'`,
      [T.id, ky, chuTiem, gioVN(themNgay(cuoiKy(ky), 2), 15 * 60)]);
    if (rowCount) log(`  chốt kỳ lương ${nhanKy(ky)}`);
  }

  // ── 9. Chốt sổ ca (két sắt) ──────────────────────────────────────────────
  // `expected_cash` đi theo chuỗi của `tinhExpectedCash`: tiền đầu ca + tiền
  // mặt vào/ra KỂ TỪ ca trước. Chỉ dựng 10 ngày gần nhất — sổ quỹ mẫu chưa có
  // khoản nộp tiền vào ngân hàng, kéo dài hơn thì két phình ra vô lý.
  const NGAY_CHOT_CA = [];
  for (let d = themNgay(HOM_NAY, -10); d < HOM_NAY; d = themNgay(d, 1)) NGAY_CHOT_CA.push(d);
  let themChotCa = 0;
  let mocTruoc = null, tienTruoc = null;
  const NGUOI_CHOT_CA = [quanTri, ktvTruongDa, chuTiem, ktvTruongMassage].filter(Boolean);
  for (const [i, ngay] of NGAY_CHOT_CA.entries()) {
    const moc = gioVN(ngay, 21 * 60 + 30);
    const { rows: [daCo] } = await c.query(
      `select actual_cash, created_at from public.shift_closings
        where tenant_id = $1 and shift_date = $2::date limit 1`, [T.id, ngay]);
    if (daCo) { tienTruoc = Number(daCo.actual_cash); mocTruoc = daCo.created_at.toISOString(); continue; }

    const dauCa = tienTruoc ?? 2_000_000;
    // HAI chỗ cố ý khác hàm thật `tinhExpectedCash`, nói ra chứ không giấu:
    //  · Chặn trên `<= moc`: lúc hàm thật chạy thì khoản thu sau giờ chốt chưa
    //    tồn tại; ở đây đang dựng lại quá khứ nên phải tự cắt.
    //  · Ca ĐẦU TIÊN tính từ 00:00 hôm đó, không phải từ đầu lịch sử. Hàm thật
    //    lấy từ đầu lịch sử vì "chưa từng chốt ca" nghĩa là chưa từng đối
    //    chiếu; nhưng tiệm mẫu có 3 tháng tiền mặt chưa chốt, dồn hết vào một
    //    ca ra ~75 triệu trong ngăn kéo — một con số không ai tin. Từ ca thứ
    //    hai trở đi là ĐÚNG chuỗi của hàm thật, không sai một đồng.
    const { rows: [q] } = await c.query(
      `select coalesce(sum(case when direction = 'in' then amount_vnd else -amount_vnd end), 0)::bigint rong
         from public.cash_entries
        where tenant_id = $1 and fund = 'cash' and deleted_at is null
          and created_at > $2::timestamptz and created_at <= $3::timestamptz`,
      [T.id, mocTruoc ?? gioVN(ngay, 0), moc]);
    const duKien = dauCa + Number(q.rong);
    // Lệch quỹ: đa số ngày khớp, vài ngày lệch nhỏ — đó mới là két sắt thật.
    const lech = nn(ngay, "lech") < 0.3 ? nnInt(-1, 1, ngay, "muclech") * nnInt(1, 5, ngay, "buoc") * 10_000 : 0;
    const thucTe = Math.max(0, duKien + lech);
    await c.query(
      `insert into public.shift_closings
         (tenant_id, closed_by, shift_date, opening_cash, actual_cash, expected_cash, note, created_at)
       values ($1,$2,$3::date,$4,$5,$6,$7,$8::timestamptz)`,
      [T.id, NGUOI_CHOT_CA[i % NGUOI_CHOT_CA.length], ngay, dauCa, thucTe, duKien,
       lech === 0 ? null : lech > 0 ? "Dư quỹ — khách trả dư chưa kịp thối, đã ghi sổ."
                                    : "Thiếu quỹ — trả lại tiền khách bằng tiền mặt, sẽ đối chiếu lại.",
       moc]);
    themChotCa++;
    tienTruoc = thucTe; mocTruoc = moc;
  }
  log(`Chốt sổ ca: thêm ${themChotCa} ngày`);

  // ── 10. Tuyển dụng ───────────────────────────────────────────────────────
  const tinId = new Map();
  for (const t of TIN_TUYEN) {
    await c.query(
      `insert into public.job_openings (tenant_id, title, headcount, opened_on, status, note, created_by)
       select $1,$2,$3,$4::date,$5,$6,$7
        where not exists (
          select 1 from public.job_openings where tenant_id = $1 and title = $2)`,
      [T.id, t.title, t.headcount, t.opened_on, t.status, t.note, quanTri]);
    const { rows: [r] } = await c.query(
      `select id from public.job_openings where tenant_id = $1 and title = $2`, [T.id, t.title]);
    tinId.set(t.ma, r.id);
  }

  const ungId = new Map();
  for (const u of UNG_VIEN) {
    await c.query(
      `insert into public.candidates
         (tenant_id, job_opening_id, full_name, phone, email, dob, experience_years,
          expected_salary_min_vnd, expected_salary_max_vnd, available_from, source,
          applied_on, stage, rejected_at, reject_reason, note, created_by)
       select $1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10::date,$11,$12::date,$13,$14::timestamptz,$15,$16,$17
        where not exists (
          select 1 from public.candidates
           where tenant_id = $1 and full_name = $3 and applied_on = $12::date)`,
      [T.id, u.tin ? tinId.get(u.tin) : null, u.ten, u.sdt, u.email, u.sinh, u.nam,
       u.luongMin, u.luongMax, u.tuNgay, u.nguon, u.nop, u.stage,
       u.loai?.luc ?? null, u.loai?.vi ?? null, u.note ?? null, quanTri]);
    const { rows: [r] } = await c.query(
      `select id from public.candidates where tenant_id = $1 and full_name = $2 and applied_on = $3::date`,
      [T.id, u.ten, u.nop]);
    ungId.set(u.ma, r.id);
  }

  // Người ĐÃ NHẬN VIỆC phải nối về hồ sơ nhân sự — đó chính là việc
  // `candidate_hire()` làm (chép họ tên/điện thoại/ngày sinh sang `employees` và
  // đặt `employees.candidate_id`). Ứng viên 'hired' mà không có ai đang đi làm
  // đứng sau là một trạng thái sản phẩm KHÔNG BAO GIỜ tạo ra được.
  const { rowCount: daNoi } = await c.query(
    `update public.employees e set candidate_id = c.id
       from public.candidates c
      where e.tenant_id = $1 and c.tenant_id = $1 and c.stage = 'hired'
        and e.full_name = c.full_name and e.candidate_id is null`, [T.id]);

  let themPV = 0, themGhiChu = 0;
  for (const pv of PHONG_VAN) {
    const cid = ungId.get(pv.ung);
    if (!cid) continue;
    await c.query(
      `insert into public.interviews (tenant_id, candidate_id, scheduled_at, interviewer_user_id, result, result_at)
       select $1,$2,$3::timestamptz,$4,$5,$6::timestamptz
        where not exists (
          select 1 from public.interviews
           where tenant_id = $1 and candidate_id = $2 and scheduled_at = $3::timestamptz)`,
      [T.id, cid, pv.luc, NGUOI_PV[pv.nguoi], pv.ketQua, pv.ketQuaLuc]);
    const { rows: [iv] } = await c.query(
      `select id from public.interviews
        where tenant_id = $1 and candidate_id = $2 and scheduled_at = $3::timestamptz`,
      [T.id, cid, pv.luc]);
    themPV++;
    for (const body of pv.ghiChu) {
      const { rowCount } = await c.query(
        `insert into public.interview_notes (tenant_id, interview_id, interviewer_user_id, body)
         select $1,$2,$3,$4
          where not exists (
            select 1 from public.interview_notes
             where tenant_id = $1 and interview_id = $2 and body = $4)`,
        [T.id, iv.id, NGUOI_PV[pv.nguoi], body]);
      themGhiChu += rowCount;
    }
  }
  log(`Tuyển dụng: ${TIN_TUYEN.length} tin · ${UNG_VIEN.length} ứng viên · ${themPV} buổi phỏng vấn · thêm ${themGhiChu} ghi chú`);
  if (daNoi) log(`  nối ${daNoi} ứng viên đã nhận việc về hồ sơ nhân sự`);

  // ── 11. Nghiệm thu ───────────────────────────────────────────────────────
  const sau = await dem();
  log("\nSỐ DÒNG SAU KHI NẠP");
  for (const b of BANG) {
    const d = sau[b] - truoc[b];
    log(`  ${b.padEnd(20)} ${String(truoc[b]).padStart(6)} → ${String(sau[b]).padStart(6)}  ${d > 0 ? "+" + d : d === 0 ? "=" : d}`);
  }

  const { rows: [tt] } = await c.query(
    `select
       (select count(*)::int from public.timesheets where tenant_id=$1 and status='closed') bc_chot,
       (select count(*)::int from public.timesheets where tenant_id=$1 and status='draft')  bc_nhap,
       (select coalesce(sum(late_count),0)::int from public.timesheets where tenant_id=$1)  di_tre,
       (select coalesce(sum(flag_count),0)::int from public.timesheets where tenant_id=$1)  co,
       (select count(*)::int from public.payroll_periods where tenant_id=$1 and status='closed') luong_chot,
       (select count(*)::int from public.leave_requests where tenant_id=$1 and status='pending') cho_duyet`,
    [T.id]);
  log(`\nBảng công: ${tt.bc_chot} đã chốt · ${tt.bc_nhap} còn nháp · ${tt.di_tre} lần đi trễ · ${tt.co} lần bị gắn cờ`);
  log(`Bảng lương: ${tt.luong_chot} kỳ đã chốt · Đơn nghỉ đang chờ duyệt: ${tt.cho_duyet}`);

  // ĐỐI CHỨNG 1: số trên bảng công phải KHỚP với lần chấm thật. Đây đúng là
  // phép tính nút "Tính lại bảng công" chạy — lệch một dòng là màn hình sẽ
  // hiện hai sự thật.
  const { rows: lech } = await c.query(
    `select e.full_name, to_char(t.period,'MM/YYYY') ky, t.work_days ghi, x.cong tinh
       from public.timesheets t
       join public.employees e on e.id = t.employee_id
       join lateral (
         select count(distinct (p.punched_at at time zone 'Asia/Ho_Chi_Minh')::date) cong
           from public.attendance_punches p
          where p.employee_id = t.employee_id and p.kind = 'in'
            and p.punched_at >= t.period::timestamptz at time zone 'UTC'
            and p.punched_at <  ((t.period + interval '1 month')::timestamptz at time zone 'UTC')
       ) x on true
      where t.tenant_id = $1 and t.work_days <> x.cong`, [T.id]);
  log(`\nĐỐI CHỨNG · số công khớp lần chấm: ${lech.length === 0 ? "KHỚP toàn bộ" : `LỆCH ${lech.length} dòng`}`);
  for (const r of lech.slice(0, 5)) log(`   ✗ ${r.full_name} ${r.ky}: ghi ${r.ghi} · tính ${r.tinh}`);

  await doiChungChotChan(T.id);
  await c.end();
}

/**
 * ĐỐI CHỨNG chốt chặn: thử làm ĐÚNG những việc lẽ ra phải bị chặn, trong giao
 * dịch có `rollback`. Chốt chặn còn sống thì CSDL từ chối; nó KHÔNG từ chối tức
 * là kho vừa có một lỗ thật, và phải biết ngay chứ không phải khi mất tiền.
 */
async function doiChungChotChan(tenantId) {
  console.log("\nĐỐI CHỨNG · CHỐT CHẶN CÓ CÒN SỐNG KHÔNG");
  const caTest = [];

  async function thu(ten, chuoiMongDoi, chay) {
    await c.query("begin");
    let ketQua;
    try {
      await chay();
      ketQua = { ten, lot: true, loi: null };
    } catch (e) {
      ketQua = { ten, lot: !new RegExp(chuoiMongDoi).test(e.message), loi: e.message.split("\n")[0] };
    }
    await c.query("rollback");
    caTest.push(ketQua);
    console.log(`  ${ketQua.lot ? "✗ LỌT" : "✓ bị chặn"}  ${ten}${ketQua.loi ? `  — ${ketQua.loi}` : ""}`);
  }

  const { rows: [bc] } = await c.query(
    `select id from public.timesheets where tenant_id=$1 and status='closed' limit 1`, [tenantId]);
  const { rows: [ky] } = await c.query(
    `select id, to_char(period,'YYYY-MM-DD') p from public.payroll_periods
      where tenant_id=$1 and status='closed' limit 1`, [tenantId]);
  const { rows: [don] } = await c.query(
    `select l.id, e.user_id from public.leave_requests l
       join public.employees e on e.id = l.employee_id
      where l.tenant_id=$1 and l.status='pending' and e.user_id is not null limit 1`, [tenantId]);

  if (bc) {
    await thu("sửa bảng công ĐÃ CHỐT", "timesheet_locked", () =>
      c.query(`update public.timesheets set work_days = work_days + 1 where id = $1`, [bc.id]));
    await thu("xoá bảng công ĐÃ CHỐT", "timesheet_locked", () =>
      c.query(`delete from public.timesheets where id = $1`, [bc.id]));
  }
  if (ky) {
    const { rows: [ph] } = await c.query(
      `select id from public.payslips where period_id = $1 limit 1`, [ky.id]);
    await thu("thêm dòng lương vào kỳ ĐÃ CHỐT", "payroll_locked", () =>
      c.query(
        `insert into public.payslip_lines (tenant_id, payslip_id, kind, amount_vnd, source_type, label, created_by)
         values ($1,$2,'adjust',999000,'manual','Thử chèn vào kỳ đã chốt',
                 (select closed_by from public.payroll_periods where id=$3))`,
        [tenantId, ph.id, ky.id]));
    await thu("sửa tổng kỳ lương ĐÃ CHỐT", "payroll_locked", () =>
      c.query(`update public.payroll_periods set total_vnd = 1 where id = $1`, [ky.id]));
    await thu("chấm công vào tháng ĐÃ CHỐT bảng công", "period_closed", () =>
      c.query(
        `insert into public.attendance_punches (tenant_id, employee_id, punched_at, kind, distance_m)
         select $1, t.employee_id, (t.period + interval '5 day')::timestamptz, 'in', 20
           from public.timesheets t where t.tenant_id = $1 and t.status = 'closed' limit 1`,
        [tenantId]));
  }
  if (don) {
    // `leave_khong_tu_quyet` so với `auth.uid()`; script chạy bằng quyền
    // postgres nên bình thường auth.uid() là null và trigger cho qua. Đặt
    // `request.jwt.claims` là cách ĐÓNG VAI đúng người đó để thử thật.
    await thu("nhân viên TỰ DUYỆT đơn nghỉ của chính mình", "leave_self_decide", async () => {
      await c.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: don.user_id, role: "authenticated" })]);
      await c.query(
        `update public.leave_requests set status='approved', decided_by=$2, decided_at=now() where id=$1`,
        [don.id, don.user_id]);
    });
  }
  // Chốt chặn chéo tiệm: ca làm trỏ sang nhân viên tiệm khác.
  const { rows: [nvNgoai] } = await c.query(
    `select id from public.employees where tenant_id <> $1 limit 1`, [tenantId]);
  if (nvNgoai) {
    await thu("xếp ca cho nhân viên TIỆM KHÁC", "cùng tiệm", () =>
      c.query(
        `insert into public.shifts (tenant_id, employee_id, work_date, kind)
         values ($1, $2, date '2026-08-19', 'full')`, [tenantId, nvNgoai.id]));
  }

  const lot = caTest.filter((x) => x.lot);
  if (lot.length) {
    console.log(`\n⚠️  ${lot.length}/${caTest.length} chốt chặn KHÔNG chặn — đây là lỗ thật, báo ngay.`);
    process.exitCode = 1;
  } else {
    console.log(`\n${caTest.length}/${caTest.length} chốt chặn đều từ chối. Không cái nào bị vô hiệu hoá để nạp dữ liệu.`);
  }
}

main().catch(async (e) => {
  console.error("HỎNG:", e.message);
  process.exitCode = 1;
  try { await c.end(); } catch { /* đã đóng */ }
});
