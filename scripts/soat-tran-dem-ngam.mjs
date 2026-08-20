#!/usr/bin/env node
/**
 * CỔNG: không được đặt TRẦN CỨNG khi đọc một bảng có thể lớn vô hạn theo tiệm.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CỔNG NÀY TỒN TẠI
 * ═══════════════════════════════════════════════════════════════════
 * `.limit(1000)` trên một bảng mỗi ngày một dài là một **quả bom hẹn giờ**:
 * hôm nay tiệm nhỏ nên không ai thấy gì, ngày mai tiệm đông thì con số hiển thị
 * bắt đầu SAI — và Supabase **không báo lỗi**, nó chỉ trả về ít dòng hơn. Không
 * có gì đỏ, không có gì kêu. Người đọc tin vào con số sai.
 *
 * Kho này đã dọn lớp bệnh đó hai lần (việc #21 và #29). Nó vẫn quay lại, vì mã
 * mới viết sau đợt dọn thì không ai nhắc. Ngày 20/08 nó **nổ thật**:
 *
 *     app/app/payroll/actions.ts đọc `commission_entries` với `.limit(1000)`.
 *     Đo trên tiệm mẫu 20 người:  T6 = 1.548 khoản · T7 = 1.622 · T8 = 1.132.
 *     ⇒ Bảng lương tính qua phần mềm BỎ SÓT 548–622 khoản hoa hồng mỗi tháng.
 *     Tiền thật của nhân viên, mất trong im lặng.
 *
 * Dọn từng chỗ thì lần sau lại có chỗ mới. Nên cổng này canh **cả lớp**: thêm
 * một trần cứng mới trên bảng biết-lớn là CI đỏ, buộc người viết phải hoặc lấy
 * hết trang, hoặc khai miễn trừ KÈM LÝ DO ĐO ĐƯỢC.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG CHỈ ĐƠN GIẢN LÀ "NÂNG TRẦN LÊN"
 * ═══════════════════════════════════════════════════════════════════
 * Nâng 1.000 → 5.000 chỉ dời quả bom sang tiệm to hơn, và sáu tháng nữa không
 * ai nhớ vì sao con số đó là 5.000. Lấy hết trang thì đúng ở mọi cỡ tiệm.
 *
 *   node scripts/soat-tran-dem-ngam.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Bảng LỚN VÔ HẠN theo tiệm: mỗi lượt khách, mỗi lần bán, mỗi lần chấm công
// lại thêm một dòng. Bảng cấu hình (items, resources, channels, lead_sources…)
// KHÔNG nằm đây vì chúng bị chặn bởi chính công sức nhập liệu của chủ tiệm.
const BANG_LON = new Set([
  "appointments", "orders", "order_lines", "order_payments", "commission_entries",
  "cash_entries", "stock_moves", "attendance_punches", "shifts", "loyalty_ledger",
  "payslip_lines", "contacts", "messages", "conversations", "activities",
  "domain_events", "notifications", "qr_scans", "sla_events", "workflow_runs",
  "tasks", "deals", "timesheets", "payslips", "contract_sessions",
  "voucher_redemptions", "campaign_send_recipients", "record_audit",
  "login_events", "internal_messages", "purchases", "stocktake_lines",
]);

// Miễn trừ: khoá là "<đường dẫn>:<bảng>:<trần>". Mỗi dòng phải nói VÌ SAO an
// toàn, và lý do phải là thứ ĐO ĐƯỢC — không nhận "chắc là đủ".
const MIEN_TRU = {
  "app/app/team/actions.ts:attendance_punches:2000":
    "Lọc theo MỘT nhân viên trong MỘT tháng. Đo 20/08 trên tiệm 20 người: cao nhất 54 lần/người/tháng. " +
    "Trần chặn trên là 31 ngày × 4 lần chấm = 124. Cách trần 16 lần.",
  "app/app/team/queries.ts:appointments:2000":
    "Lọc theo khoảng ngày + chỉ trạng thái booked/arrived (lịch CHƯA xong). Đo 20/08: 153 (T8) và 65 (T9). " +
    "Lịch đã xong không lọt vào đây nên không tích luỹ theo thời gian.",
  "app/app/team/queries.ts:appointments:1000":
    "Cùng bộ lọc với dòng 341 — xem lý do ở trên. Đo 20/08: 153 và 65.",
  "app/app/payroll/actions.ts:payslip_lines:500":
    "Lọc theo MỘT phiếu lương (một người, một kỳ). Đo 20/08: người nhiều dòng nhất có 61 dòng " +
    "(1 lương cứng + 1 tăng ca + 58 khoản hoa hồng + 1 khấu trừ). Cách trần hơn 8 lần.",
  "app/app/inbox/queries.ts:messages:200":
    "Lọc theo MỘT hội thoại, và màn Hộp thư vốn chỉ hiện đoạn cuối — đọc thêm là cuộn lên, không phải đếm.",
  "app/app/payroll/actions.ts:timesheets:200":
    "Một dòng mỗi NGƯỜI mỗi KỲ ⇒ bị chặn bởi số nhân viên, không phải bởi lượng giao dịch. " +
    "Gói cao nhất hiện chưa cho quá 200 người; vượt mốc đó thì đây là chỗ phải sửa.",
  "app/app/payroll/page.tsx:timesheets:200": "Cùng lý do với payroll/actions.ts — chặn bởi số nhân viên.",
  "app/app/payroll/queries.ts:payslips:200": "Một phiếu mỗi NGƯỜI mỗi KỲ — chặn bởi số nhân viên.",
  "app/app/deals/queries.ts:conversations:50":
    "Danh sách gợi ý trên màn Cơ hội, cố ý chỉ hiện 50 gần nhất — người dùng tìm bằng ô tìm kiếm, không cuộn hết.",
  "app/app/ketsat/queries.ts:purchases:50":
    "⚠️ ĐÂY LÀ GIỚI HẠN THẬT, không phải chỗ an toàn — khai vào đây để nó NHÌN THẤY ĐƯỢC chứ không phải để tha. " +
    "Ô chọn phiếu nhập khi ghi trả tiền nhà cung cấp, chỉ hiện 50 phiếu gần nhất. Tiệm mua đều 2–4 lần/tháng " +
    "từ một nhà cung cấp thì sau ~1–2 năm phiếu cũ rơi khỏi danh sách và KHÔNG ghi trả tiền cho nó được. " +
    "Cách chữa đúng là lọc theo 'phiếu CÒN NỢ' (đã có bảng supplier_payments để trừ ra) chứ không phải nâng trần — " +
    "danh sách khi đó tự ngắn lại và đúng việc hơn. Ghi thành việc #215.",
};

const files = [];
const di = (d) => {
  for (const t of readdirSync(d)) {
    if (t === "node_modules" || t === ".next") continue;
    const p = join(d, t);
    if (statSync(p).isDirectory()) di(p);
    else if (/\.tsx?$/.test(t)) files.push(p);
  }
};
di("app");
di("lib");

const viPham = [];
let daXet = 0;
let daMienTru = 0;
const dungKhoa = new Set();

for (const f of files) {
  const src = readFileSync(f, "utf8");
  // Bắt `.from("bảng") … .limit(N)` trong cùng một chuỗi lệnh. Cửa sổ 700 ký tự
  // đủ dài cho các bộ lọc thường gặp mà không trườn sang câu truy vấn kế tiếp.
  const re = /\.from\(\s*["'`](\w+)["'`]\s*\)([\s\S]{0,700}?)\.limit\(\s*(\d+)\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const [, bang, giua, soStr] = m;
    const so = Number(soStr);
    if (!BANG_LON.has(bang)) continue;
    // `.limit(1)` là tra cứu một dòng, không phải phép đếm.
    if (so <= 1) continue;
    // Có `.range(` ở giữa nghĩa là đang phân trang thật — không phải trần cứng.
    if (/\.range\(/.test(giua)) continue;
    daXet++;
    const khoa = `${f.replace(/\\/g, "/")}:${bang}:${so}`;
    if (MIEN_TRU[khoa]) { daMienTru++; dungKhoa.add(khoa); continue; }
    const dong = src.slice(0, m.index).split("\n").length;
    viPham.push({ khoa, f: f.replace(/\\/g, "/"), dong, bang, so });
  }
}

// Miễn trừ MỒ CÔI cũng là lỗi: chỗ đó đã sửa/xoá mà lời miễn trừ còn nằm lại,
// lần sau người đọc sẽ tin vào một lý do không còn đúng với mã nào.
const moCoi = Object.keys(MIEN_TRU).filter((k) => !dungKhoa.has(k));

for (const v of viPham) {
  console.error(`\n❌ TRẦN CỨNG trên bảng biết-lớn: ${v.bang}  (trần ${v.so})`);
  console.error(`   ${v.f}:${v.dong}`);
  console.error(`   Supabase KHÔNG báo lỗi khi chạm trần — nó chỉ trả ít dòng hơn.`);
  console.error(`   SỬA: lấy hết trang bằng \`.range(tu, tu + CO_TRANG - 1)\` lặp tới khi hết,`);
  console.error(`        hoặc khai "${v.khoa}" vào MIEN_TRU kèm CON SỐ ĐÃ ĐO chứng minh không thể chạm trần.`);
}
for (const k of moCoi) {
  console.error(`\n❌ MIỄN TRỪ MỒ CÔI: "${k}" không còn khớp chỗ nào trong mã.`);
  console.error(`   Xoá nó khỏi MIEN_TRU — lời giải thích cho một đoạn mã đã chết là lời nói dối để lại.`);
}

if (viPham.length || moCoi.length) {
  console.error(`\n${viPham.length} trần cứng chưa khai · ${moCoi.length} miễn trừ mồ côi.`);
  process.exit(1);
}
console.log(
  `✅ Không trần đếm ngầm nào: ${daXet} lệnh đọc bảng biết-lớn có đặt trần · ` +
    `${daMienTru} miễn trừ đều kèm số đã đo · 0 miễn trừ mồ côi.`,
);
