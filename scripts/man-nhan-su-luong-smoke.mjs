#!/usr/bin/env node
/**
 * Cổng cho MÀN HÌNH Nhân sự & Chấm công (/app/team) và Bảng lương (/app/payroll).
 *
 * Khác với `nhan-su-luong-smoke.mjs` (khoá luật của CSDL), file này khoá thứ
 * TẦNG WEB chịu trách nhiệm — những chỗ CSDL không đỡ được:
 *
 *   1. HÌNH LỆNH màn hình thật sự chạy. Ba `upsert` (bảng công, xếp ca, phiếu
 *      lương) khai `onConflict` bằng CHUỖI TÊN CỘT. Gõ sai một tên là lỗi lúc
 *      CHẠY, không phải lúc build — typecheck và lint đều xanh, chỉ người dùng
 *      bấm nút mới thấy hỏng.
 *   2. `payslips.gross_vnd` / `deduction_vnd` KHÔNG có trigger cộng (chỉ
 *      `net_vnd` là cột sinh) ⇒ tầng web phải cộng lại từ dòng. Sai chỗ này thì
 *      phiếu lương mang con số không khớp dòng — đúng thứ quyết định 2 của thẻ
 *      man-bang-luong.html cấm.
 *   3. ⛔ PHIẾU QUỸ LƯƠNG KHÔNG ĐƯỢC LỘ LƯƠNG TỪNG NGƯỜI. `cash_entries_rw`
 *      (migration #127) mở cho CẢ vai `manager`, mà cả mảng lương tồn tại để
 *      quản lý KHÔNG thấy lương đồng nghiệp. Ghi mỗi người một phiếu kèm tên là
 *      mở đúng cái cửa #167 vừa khoá. Phần soát TĨNH ở cuối file khoá luật này
 *      ngay trong mã nguồn, vì CSDL không có cách nào biết một dòng ghi chú có
 *      chứa tên người hay không.
 *
 * Chạy trong MỘT transaction rồi ROLLBACK — không để lại dữ liệu thật.
 *   node scripts/man-nhan-su-luong-smoke.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { themThanhVien } from "./ho-tro/tu-cach-thanh-vien.mjs";
const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL (env hoặc .env.local).");
  process.exit(1);
}

let n = 0;
let fail = 0;
const check = (ten, dk, ct = "") => {
  n++;
  console.log(`  ${dk ? "PASS" : "FAIL"} ${n} ${ten}${dk ? "" : " — " + ct}`);
  if (!dk) fail++;
};

// ════════════════════════════════════════════════════════════
// PHẦN 1 — HÌNH LỆNH CHẠY THẬT TRÊN CSDL
// ════════════════════════════════════════════════════════════
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
});
await c.connect();

let sp = 0;
const thu = async (fn) => {
  const s = `sp_${++sp}`;
  await c.query(`savepoint ${s}`);
  try {
    const v = await fn();
    await c.query(`release savepoint ${s}`);
    return { ok: true, v };
  } catch (e) {
    await c.query(`rollback to savepoint ${s}`);
    return { ok: false, e: e.message };
  }
};

await c.query("begin");
await c.query("set local lock_timeout = '10s'");
try {
  const uChu = randomUUID();
  const uNV = randomUUID();
  const st = Date.now();
  await c.query(
    `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
    [uChu, `chu${st}@t.local`, uNV, `nv${st}@t.local`],
  );
  const { rows: [t] } = await c.query(
    `insert into public.tenants (name, slug) values ('Tiem thu man', $1) returning id`,
    ["thu-man-" + st]);
  // Bắt buộc từ #301 — xem `scripts/ho-tro/tu-cach-thanh-vien.mjs`.
  await themThanhVien(c, t.id, uChu, "owner");
  await themThanhVien(c, t.id, uNV);
  const { rows: [nv] } = await c.query(
    `insert into public.employees (tenant_id, user_id, full_name, base_salary_vnd, overtime_rate_vnd)
       values ($1,$2,'Chi Huong',8000000,60000) returning id`, [t.id, uNV]);
  const eId = nv.id;
  const KY = "2099-03-01";
  const NHAN_KY = "03/2099";

  console.log("[man-nhan-su-luong] Ba lệnh upsert của màn hình — sai tên cột là hỏng lúc chạy:");
  {
    // Khớp app/app/team/actions.ts → luuBangCong()
    const r = await thu(() => c.query(
      `insert into public.timesheets (tenant_id, employee_id, period, work_days, overtime_hours, late_count, flag_count)
         values ($1,$2,$3,24,6,1,2)
       on conflict (tenant_id, employee_id, period) do update
         set work_days=excluded.work_days, overtime_hours=excluded.overtime_hours,
             late_count=excluded.late_count, flag_count=excluded.flag_count`, [t.id, eId, KY]));
    check("upsert bảng công theo (tenant_id, employee_id, period)", r.ok, r.ok ? "" : r.e);
  }
  {
    const r = await thu(() => c.query(
      `insert into public.timesheets (tenant_id, employee_id, period, work_days)
         values ($1,$2,$3,20)
       on conflict (tenant_id, employee_id, period) do update set work_days=excluded.work_days`,
      [t.id, eId, KY]));
    check("bấm Lưu lần hai chỉ SỬA dòng cũ, không tạo dòng công thứ hai", r.ok, r.ok ? "" : r.e);
  }
  {
    // Khớp app/app/team/actions.ts → xepCa()
    const r = await thu(() => c.query(
      `insert into public.shifts (tenant_id, employee_id, work_date, kind)
         values ($1,$2,'2099-03-04','morning')
       on conflict (tenant_id, employee_id, work_date) do update set kind=excluded.kind`,
      [t.id, eId]));
    check("upsert xếp ca theo (tenant_id, employee_id, work_date)", r.ok, r.ok ? "" : r.e);
  }

  console.log("[man-nhan-su-luong] Mở khoá bảng công bằng ĐÚNG lệnh màn hình gửi:");
  await c.query(
    `update public.timesheets set status='closed', closed_by=$2, closed_at=now()
       where employee_id=$1 and period=$3`, [eId, uChu, KY]);
  {
    // moKhoaBangCong() CỐ Ý không đụng closed_by/closed_at (dấu vết ai từng
    // chốt). Bản vá #173 mở đường này — nếu ai siết lại ràng buộc thì gãy ở đây.
    const r = await thu(() => c.query(
      `update public.timesheets set status='draft', unlock_reason=$2 where employee_id=$1 and period=$3`,
      [eId, "Ghi nham so cong", KY]));
    check("mở khoá chỉ đặt status + unlock_reason ⇒ được chấp nhận", r.ok, r.ok ? "" : r.e);
  }
  {
    const r = await thu(() => c.query(
      `update public.timesheets set status='closed', closed_by=$2, closed_at=now()
         where employee_id=$1 and period=$3`, [eId, uChu, KY]));
    check("chốt LẠI sau khi mở khoá vẫn được (lý do mở khoá cũ không cản)", r.ok, r.ok ? "" : r.e);
  }

  console.log("[man-nhan-su-luong] Tính lại bảng lương — chạy lại nhiều lần phải ra một kết quả:");
  const { rows: [hh] } = await c.query(
    `insert into public.commission_entries (tenant_id, employee_id, earned_on, amount_vnd, note)
       values ($1,$2,'2099-03-10',3240000,'38 luot lam') returning id`, [t.id, eId]);
  const { rows: [ky] } = await c.query(
    `insert into public.payroll_periods (tenant_id, period) values ($1,$2) returning id`, [t.id, KY]);
  const upsertPhieu = () => c.query(
    `insert into public.payslips (tenant_id, period_id, employee_id) values ($1,$2,$3)
     on conflict (period_id, employee_id) do update set tenant_id=excluded.tenant_id returning id`,
    [t.id, ky.id, eId]);
  let phieuId = null;
  {
    const r = await thu(upsertPhieu);
    check("upsert phiếu lương theo (period_id, employee_id)", r.ok, r.ok ? "" : r.e);
    phieuId = r.ok ? r.v.rows[0].id : null;
  }
  {
    const r = await thu(upsertPhieu);
    check("bấm Tính lại lần hai KHÔNG sinh phiếu thứ hai cho cùng một người",
      r.ok && r.v.rows[0].id === phieuId, JSON.stringify(r));
  }
  const { rows: [ts] } = await c.query(
    `select id from public.timesheets where employee_id=$1 and period=$2`, [eId, KY]);
  {
    const r = await thu(() => c.query(
      `insert into public.payslip_lines (tenant_id, payslip_id, kind, amount_vnd, source_type, source_id, label)
       values ($1,$2,'base',8000000,'timesheet',$3,$5),
              ($1,$2,'overtime',360000,'timesheet',$3,$6),
              ($1,$2,'commission',3240000,'commission',$4,'38 luot lam')`,
      [t.id, phieuId, ts.id, hh.id,
       `Luong cung ky ${NHAN_KY} - 24 cong`, `Tang ca ky ${NHAN_KY} - 6 gio`]));
    check("ba dòng máy sinh (cứng · tăng ca · hoa hồng) đều mang gốc và ghi được",
      r.ok, r.ok ? "" : r.e);
  }
  {
    const r = await thu(() => c.query(
      `insert into public.payslip_lines (tenant_id, payslip_id, kind, amount_vnd, source_type, label, created_by)
       values ($1,$2,'advance',-500000,'manual','Tam ung 12/03',$3)`, [t.id, phieuId, uChu]));
    check("khoản trừ ghi tay (tạm ứng) mang dấu ÂM + nhãn + người ghi ⇒ được",
      r.ok, r.ok ? "" : r.e);
  }
  {
    // Khớp app/app/payroll/actions.ts → capNhatTongPhieu()
    await c.query(
      `update public.payslips p set
         gross_vnd = coalesce((select sum(amount_vnd) from public.payslip_lines l
                                where l.payslip_id=p.id and l.amount_vnd>0),0),
         deduction_vnd = coalesce((select -sum(amount_vnd) from public.payslip_lines l
                                where l.payslip_id=p.id and l.amount_vnd<0),0)
       where p.id=$1`, [phieuId]);
    const { rows } = await c.query(
      `select gross_vnd, deduction_vnd, net_vnd from public.payslips where id=$1`, [phieuId]);
    check("cộng lại từ dòng ⇒ thực nhận 11.600.000 − 500.000 = 11.100.000",
      Number(rows[0].net_vnd) === 11_100_000, JSON.stringify(rows[0]));
  }

  console.log("[man-nhan-su-luong] Chốt lương ⇒ MỘT phiếu quỹ gộp, không tên ai:");
  {
    const r = await thu(() => c.query(
      `update public.payroll_periods set status='closed', closed_by=$2, closed_at=now() where id=$1`,
      [ky.id, uChu]));
    check("bảng công đã chốt ⇒ chốt lương được", r.ok && r.v.rowCount === 1, JSON.stringify(r));
  }
  const GHI_CHU = `Lương kỳ ${NHAN_KY}`;
  await c.query(
    `insert into public.cash_entries (tenant_id, direction, amount_vnd, fund, category, note, recorded_by)
       values ($1,'out',11100000,'bank','salary',$2,$3)`, [t.id, GHI_CHU, uChu]);
  {
    // Khớp truy vấn chống ghi trùng trong chotKyLuong(): mở khoá rồi chốt lại
    // KHÔNG được sinh phiếu quỹ thứ hai.
    const { rows } = await c.query(
      `select id from public.cash_entries
        where tenant_id=$1 and category='salary' and note=$2 and deleted_at is null`,
      [t.id, GHI_CHU]);
    check("truy vấn chống ghi trùng tìm đúng phiếu quỹ đã có", rows.length === 1, JSON.stringify(rows));
  }
  {
    const { rows } = await c.query(
      `select note from public.cash_entries where tenant_id=$1 and category='salary'`, [t.id]);
    check("ĐÚNG MỘT phiếu quỹ cho cả kỳ (không phải mỗi người một phiếu)",
      rows.length === 1, JSON.stringify(rows));
    check("ghi chú phiếu quỹ KHÔNG chứa tên nhân sự nào",
      !rows.some((r) => /Huong/i.test(r.note ?? "")), JSON.stringify(rows));
  }
  {
    const r = await thu(() => c.query(`update public.payslips set gross_vnd=99 where id=$1`, [phieuId]));
    check("kỳ đã chốt ⇒ cả đường cộng lại tổng của tầng web cũng bị CSDL chặn",
      !r.ok && /payroll_locked/.test(r.e), JSON.stringify(r));
  }
} finally {
  await c.query("rollback");
  await c.end();
}

// ════════════════════════════════════════════════════════════
// PHẦN 2 — SOÁT TĨNH: LƯƠNG TỪNG NGƯỜI KHÔNG ĐƯỢC RƠI VÀO SỔ QUỸ
// ════════════════════════════════════════════════════════════
// CSDL không biết một dòng ghi chú có chứa tên người hay không, nên luật này
// chỉ giữ được bằng cách soát chính mã nguồn.
console.log("[man-nhan-su-luong] Soát mã nguồn — phiếu quỹ lương không được lộ từng người:");
{
  const nguon = readFileSync(path.join(GOC, "app", "app", "payroll", "actions.ts"), "utf8");
  // ⚠️ LUẬT NÀY ĐÃ ĐỔI 22/08 — ĐỌC KỸ TRƯỚC KHI SIẾT LẠI.
  //
  // Bản đầu đếm: "mảng lương chỉ được có ĐÚNG MỘT chỗ ghi vào sổ quỹ". Đúng khi
  // viết ra, vì lúc đó chỉ có phiếu chi lúc CHỐT KỲ. Bản vá #270 thêm khoản TẠM
  // ỨNG trừ vào lương — tiền RA KHỎI KÉT thật, nên phải có phiếu quỹ thật, và
  // đó là chỗ ghi thứ hai HỢP LỆ. Cổng đỏ, mà mã nguồn không sai.
  //
  // Điều luật này thật sự muốn giữ không phải là CON SỐ MỘT, mà là: KHÔNG phiếu
  // quỹ nào của mảng lương được nêu tên hay mã của một người. Nên giờ nó soi
  // từng chỗ ghi và bắt mỗi chỗ phải lấy lời ghi chú từ kho câu chữ đã duyệt —
  // hai khoá dưới đây, và cả hai đều chỉ nhận đúng biến "kỳ lương".
  const KHOA_GHI_CHU_DUOC_PHEP = ["cash.note", "cash.advanceNote"];
  const khoiGhiQuy = nguon.split('from("cash_entries")').slice(1).filter((x) => /^\s*\.insert/.test(x));
  check(
    "mảng lương có ít nhất một chỗ ghi sổ quỹ (nếu không, phép soát này rỗng)",
    khoiGhiQuy.length > 0,
    `đếm được ${khoiGhiQuy.length}`,
  );
  /**
   * Lời ghi chú có thể viết thẳng (`note: t("cash.advanceNote", …)`) hoặc đi qua
   * MỘT biến (`const ghiChu = t("cash.note", …)` rồi `note: ghiChu`). Cả hai
   * đều hợp lệ, nên phải lần được một bậc — bản đầu chỉ nhận cách viết thẳng và
   * kêu oan đúng chỗ mã nguồn viết gọn hơn.
   *
   * ⚠️ CHỈ lần MỘT bậc, cố ý. Lần sâu hơn thì phép soát bắt đầu đoán, và một
   *   phép soát biết đoán là một phép soát sẽ có ngày đoán sai theo hướng dễ dãi.
   *   Ai viết vòng vo hơn một bậc thì cổng đỏ — và đó là câu trả lời đúng.
   */
  const lanMotBac = (bieuThuc) => {
    if (bieuThuc.includes('t("')) return bieuThuc;
    const ten = bieuThuc.trim().replace(/,$/, "");
    if (!/^[A-Za-z_$][\w$]*$/.test(ten)) return bieuThuc;
    return nguon.match(new RegExp(`\\b(?:const|let|var)\\s+${ten}\\s*=\\s*(.+)`))?.[1] ?? bieuThuc;
  };
  for (const [i, khoi] of khoiGhiQuy.entries()) {
    const viet = khoi.slice(0, khoi.indexOf("})")).match(/note:\s*(.+)/)?.[1] ?? "";
    const that = lanMotBac(viet);
    check(
      `phiếu quỹ lương thứ ${i + 1} lấy lời ghi chú từ kho câu chữ đã duyệt`,
      KHOA_GHI_CHU_DUOC_PHEP.some((k) => that.includes(`t("${k}"`)),
      `${viet.trim().slice(0, 40)} ⇒ ${that.trim().slice(0, 60)}`,
    );
  }

  // Cắt riêng thân `chotKyLuong` rồi soát trong đó — soát cả file thì cái vòng
  // lặp hợp lệ ở `tinhLaiKyLuong` (duyệt từng người để dựng phiếu) sẽ bị bắt oan,
  // mà cổng kêu oan là cổng sẽ bị tắt đi.
  const than = nguon.slice(nguon.indexOf("export async function chotKyLuong"));
  const thanChot = than.slice(0, than.indexOf("export async function moKhoaKyLuong"));
  check(
    "thân chotKyLuong có ĐÚNG MỘT lệnh ghi sổ quỹ",
    (thanChot.match(/from\("cash_entries"\)\s*\.insert/g) ?? []).length === 1,
  );
  check(
    "lệnh ghi sổ quỹ KHÔNG nằm trong vòng lặp theo từng người",
    !/\bfor\s*\(|\bwhile\s*\(|\.forEach\(/.test(thanChot),
    thanChot.match(/\bfor\s*\(|\bwhile\s*\(|\.forEach\(/)?.[0] ?? "",
  );

  // Soát CẢ HAI khoá, cả hai ngôn ngữ: đây mới là chỗ luật thật sự nằm. Một
  // khoá lọt biến `{name}` là phiếu quỹ nêu đích danh một người ngay.
  for (const ten of ["vi", "en"]) {
    const msg = JSON.parse(readFileSync(path.join(GOC, "messages", `${ten}.json`), "utf8"));
    for (const khoa of KHOA_GHI_CHU_DUOC_PHEP) {
      const mau = msg.payroll?.cash?.[khoa.slice("cash.".length)] ?? "";
      const oTruyen = [...mau.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      check(
        `ghi chú "${khoa}" (${ten}) CHỈ nhận biến kỳ lương, không nhận tên/mã người`,
        mau !== "" && oTruyen.length === 1 && oTruyen[0] === "period",
        JSON.stringify({ mau, oTruyen }),
      );
    }
  }
}

console.log(
  fail === 0
    ? `[man-nhan-su-luong] ${n}/${n} PASS — lệnh của màn chạy đúng, tổng phiếu cộng từ dòng, phiếu quỹ lương gộp và không nêu tên ai.`
    : `[man-nhan-su-luong] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
);
process.exit(fail === 0 ? 0 : 1);
