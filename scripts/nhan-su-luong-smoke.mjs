#!/usr/bin/env node
/**
 * Cổng chống tái phát cho NHÂN SỰ · CHẤM CÔNG · BẢNG LƯƠNG (migration #166-167).
 *
 * Ba thứ ở đây sai là hỏng nặng, và không cái nào có gì báo:
 *   1. LƯƠNG LỘ. Thẻ design có bảng "Ai xem được gì" nói rõ QUẢN LÝ KHÔNG XEM
 *      LƯƠNG — ngoại lệ so với gần hết kho (nơi manager luôn đi cùng owner/admin
 *      cho dữ liệu tài chính). Giấu menu là vô nghĩa: một lời gọi là đọc hết.
 *   2. CHỐT RỒI VẪN SỬA ĐƯỢC. Khoá bảng tổng mà quên khoá từng lần chấm là
 *      đường lách rõ ràng: sửa lần chấm rồi tính lại là bảng đã chốt vẫn đổi.
 *   3. CỜ CHẤM CÔNG DO CLIENT GỬI. Nếu client gửi được cờ "trong vùng" thì toàn
 *      bộ quyết định "gắn cờ khi ở ngoài vùng" thành trang trí.
 *
 * Chạy trong MỘT transaction rồi ROLLBACK — không để lại dữ liệu trên CSDL thật.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

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

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
});
await c.connect();

let n = 0;
let fail = 0;
const check = (ten, dk, ct = "") => {
  n++;
  console.log(`  ${dk ? "PASS" : "FAIL"} ${n} ${ten}${dk ? "" : " — " + ct}`);
  if (!dk) fail++;
};
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
const asUser = async (uid, claims, fn) => {
  await c.query(
    `select set_config('request.jwt.claims',$1,true), set_config('role','authenticated',true)`,
    [JSON.stringify({ sub: uid, role: "authenticated", app_metadata: claims })],
  );
  try {
    return await fn();
  } finally {
    await c.query(`select set_config('role','postgres',true)`);
  }
};

await c.query("begin");
await c.query("set local lock_timeout = '10s'");
try {
  const uNV = randomUUID(), uQL = randomUUID(), uChu = randomUUID();
  const st = Date.now();
  await c.query(
    `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4),
       ($5,'authenticated','authenticated',$6)`,
    [uNV, `nv${st}@t.local`, uQL, `ql${st}@t.local`, uChu, `chu${st}@t.local`],
  );
  const { rows: [t] } = await c.query(
    `insert into public.tenants (name, slug) values ('Tiem thu nhan su', $1) returning id`,
    ["thu-ns-" + st]);
  const emp = async (uid, ten) =>
    (await c.query(
      `insert into public.employees (tenant_id, user_id, full_name, base_salary_vnd)
         values ($1,$2,$3,8000000) returning id`, [t.id, uid, ten])).rows[0].id;
  const eNV = await emp(uNV, "Nhan vien A");
  const eQL = await emp(uQL, "Quan ly B");
  const KY = new Date(Date.UTC(2099, 0, 1)).toISOString().slice(0, 10);

  const NV = { tenant_id: t.id, role: "staff" };
  const QL = { tenant_id: t.id, role: "manager" };
  const CHU = { tenant_id: t.id, role: "owner" };

  console.log("[nhan-su-luong-smoke] Chấm công — gắn cờ, không chặn:");
  {
    // Cờ do TRIGGER quyết. Client cố tình gửi false cho một lần chấm cách 5km.
    const r = await thu(() => c.query(
      `insert into public.attendance_punches
         (tenant_id, employee_id, kind, distance_m, out_of_range, reason)
       values ($1,$2,'in',5000,false,'thu lach co')`, [t.id, eNV]));
    check("client gửi cờ 'trong vùng' cho lần chấm cách 5km ⇒ máy vẫn tự gắn cờ",
      r.ok, r.ok ? "" : r.e);
    if (r.ok) {
      const { rows } = await c.query(
        `select out_of_range from public.attendance_punches where employee_id=$1 order by created_at desc limit 1`, [eNV]);
      check("cờ trong CSDL là TRUE, không phải giá trị client gửi", rows[0].out_of_range === true,
        JSON.stringify(rows));
      await c.query(`delete from public.attendance_punches where employee_id=$1`, [eNV]);
    }
  }
  {
    const r = await thu(() => c.query(
      `insert into public.attendance_punches (tenant_id, employee_id, kind, distance_m)
       values ($1,$2,'in',5000)`, [t.id, eNV]));
    check("chấm ngoài vùng mà KHÔNG có lý do ⇒ bị từ chối", !r.ok, r.ok ? "ghi được!" : "");
  }
  {
    const r = await thu(() => c.query(
      `insert into public.attendance_punches (tenant_id, employee_id, kind, distance_m, reason)
       values ($1,$2,'in',5000,'Mat song GPS, cham o cua tiem')`, [t.id, eNV]));
    check("chấm ngoài vùng CÓ lý do ⇒ được ghi (KHÔNG chặn cứng)", r.ok, r.ok ? "" : r.e);
  }
  {
    const r = await thu(() => c.query(
      `insert into public.attendance_punches (tenant_id, employee_id, kind, distance_m)
       values ($1,$2,'in',50)`, [t.id, eNV]));
    check("chấm trong vùng ⇒ không cần lý do", r.ok, r.ok ? "" : r.e);
  }

  console.log("[nhan-su-luong-smoke] Bảng công — chốt rồi thì khoá CẢ HAI ĐẦU:");
  const { rows: [ts] } = await c.query(
    `insert into public.timesheets (tenant_id, employee_id, period, work_days, status)
       values ($1,$2,$3,24,'draft') returning id`, [t.id, eNV, KY]);
  await asUser(uNV, NV, async () => {
    const r = await thu(() => c.query(
      `update public.timesheets set status='closed', closed_by=$2, closed_at=now() where id=$1`,
      [ts.id, uNV]));
    const chotDuoc = r.ok && r.v.rowCount > 0;
    check("nhân viên KHÔNG tự chốt được bảng công của mình", !chotDuoc,
      r.ok ? `chốt được ${r.v.rowCount} dòng!` : "");
  });
  await c.query(`update public.timesheets set status='closed', closed_by=$2, closed_at=now() where id=$1`,
    [ts.id, uChu]);
  {
    const r = await thu(() => c.query(
      `update public.timesheets set work_days = 30 where id=$1`, [ts.id]));
    check("bảng công đã chốt ⇒ sửa số công bị từ chối", !r.ok && /timesheet_locked/.test(r.e), JSON.stringify(r));
  }
  {
    const r = await thu(() => c.query(`delete from public.timesheets where id=$1`, [ts.id]));
    check("bảng công đã chốt ⇒ xoá bị từ chối", !r.ok && /timesheet_locked/.test(r.e), JSON.stringify(r));
  }
  {
    // ĐƯỜNG LÁCH: không sửa bảng tổng mà sửa từng lần chấm của kỳ đã chốt.
    const r = await thu(() => c.query(
      `insert into public.attendance_punches (tenant_id, employee_id, kind, punched_at, distance_m)
       values ($1,$2,'in', timestamptz '2099-01-15 02:00Z', 50)`, [t.id, eNV]));
    check("LÁCH — thêm lần chấm vào kỳ ĐÃ CHỐT ⇒ bị từ chối",
      !r.ok && /period_closed/.test(r.e), JSON.stringify(r));
  }
  {
    const r = await thu(() => c.query(
      `update public.timesheets set status='draft', unlock_reason='Sua nham so cong' where id=$1`, [ts.id]));
    check("mở khoá KÈM lý do ⇒ được", r.ok, r.ok ? "" : r.e);
    if (r.ok) await c.query(`update public.timesheets set status='closed', closed_by=$2, closed_at=now() where id=$1`, [ts.id, uChu]);
  }
  {
    const r = await thu(() => c.query(
      `update public.timesheets set status='draft', unlock_reason=null where id=$1`, [ts.id]));
    check("mở khoá KHÔNG có lý do ⇒ bị từ chối", !r.ok && /timesheet_locked/.test(r.e), JSON.stringify(r));
  }

  console.log("[nhan-su-luong-smoke] Bảng lương — hai chốt chặn liên bảng:");
  const { rows: [ky] } = await c.query(
    `insert into public.payroll_periods (tenant_id, period) values ($1,$2) returning id`, [t.id, KY]);
  const { rows: [ps] } = await c.query(
    `insert into public.payslips (tenant_id, period_id, employee_id, gross_vnd)
       values ($1,$2,$3,8000000) returning id`, [t.id, ky.id, eQL]);
  // Phiếu của nhân viên phải tạo TRƯỚC khi chốt kỳ — sau khi chốt thì trigger
  // khoá chặn mọi ghi mới, kể cả ghi để phục vụ phép kiểm quyền bên dưới.
  await c.query(
    `insert into public.payslips (tenant_id, period_id, employee_id, gross_vnd)
       values ($1,$2,$3,5000000)`, [t.id, ky.id, eNV]);
  {
    // eQL CHƯA có bảng công chốt cho kỳ này ⇒ không được chốt lương.
    const r = await thu(() => c.query(
      `update public.payroll_periods set status='closed', closed_by=$2, closed_at=now() where id=$1`,
      [ky.id, uChu]));
    check("chốt lương khi bảng công của người đó CHƯA chốt ⇒ bị từ chối",
      !r.ok && /timesheet_not_closed/.test(r.e), JSON.stringify(r));
  }
  {
    const r = await thu(() => c.query(
      `insert into public.payslip_lines (tenant_id, payslip_id, kind, amount_vnd, source_type)
       values ($1,$2,'adjust',500000,'commission')`, [t.id, ps.id]));
    check("dòng tiền có nguồn máy mà THIẾU mã gốc ⇒ bị từ chối", !r.ok, r.ok ? "ghi được!" : "");
  }
  {
    const r = await thu(() => c.query(
      `insert into public.payslip_lines (tenant_id, payslip_id, kind, amount_vnd, source_type, label)
       values ($1,$2,'adjust',500000,'manual',null)`, [t.id, ps.id]));
    check("dòng 'ghi tay' mà không có nhãn giải thích ⇒ bị từ chối", !r.ok, r.ok ? "ghi được!" : "");
  }
  {
    const r = await thu(() => c.query(
      `insert into public.payslip_lines (tenant_id, payslip_id, kind, amount_vnd, source_type, label, created_by)
       values ($1,$2,'adjust',-200000,'manual','Bu tru khieu nai',$3)`, [t.id, ps.id, uChu]));
    check("dòng 'ghi tay' CÓ nhãn + người ghi ⇒ được", r.ok, r.ok ? "" : r.e);
  }
  {
    const { rows } = await c.query(`select gross_vnd, deduction_vnd, net_vnd from public.payslips where id=$1`, [ps.id]);
    check("thực nhận là số TỰ TÍNH, không phải ô gõ",
      Number(rows[0].net_vnd) === Number(rows[0].gross_vnd) - Number(rows[0].deduction_vnd), JSON.stringify(rows));
  }
  {
    await c.query(`insert into public.timesheets (tenant_id, employee_id, period, status, closed_by, closed_at)
                     values ($1,$2,$3,'closed',$4,now())`, [t.id, eQL, KY, uChu]);
    const r = await thu(() => c.query(
      `update public.payroll_periods set status='closed', closed_by=$2, closed_at=now() where id=$1`,
      [ky.id, uChu]));
    check("bảng công đã chốt ⇒ chốt lương được", r.ok && r.v.rowCount === 1, JSON.stringify(r));
  }
  {
    const r = await thu(() => c.query(
      `update public.payslips set gross_vnd = 99000000 where id=$1`, [ps.id]));
    check("kỳ lương đã chốt ⇒ sửa phiếu bị từ chối", !r.ok && /payroll_locked/.test(r.e), JSON.stringify(r));
  }
  {
    const r = await thu(() => c.query(
      `insert into public.payslip_lines (tenant_id, payslip_id, kind, amount_vnd, source_type, label, created_by)
       values ($1,$2,'adjust',9000000,'manual','Them len sau khi chot',$3)`, [t.id, ps.id, uChu]));
    check("kỳ lương đã chốt ⇒ thêm DÒNG mới cũng bị từ chối (khoá cả hai tầng)",
      !r.ok && /payroll_locked/.test(r.e), JSON.stringify(r));
  }

  console.log("[nhan-su-luong-smoke] LƯƠNG KHÔNG ĐƯỢC LỘ — ngoại lệ so với cả kho:");
  const dem = async (uid, claims, bang) => {
    let k = -1;
    await asUser(uid, claims, async () => {
      const r = await c.query(`select 1 from public.${bang}`);
      k = r.rowCount;
    });
    return k;
  };
  // ⚠️ KỲ VỌNG BAN ĐẦU CỦA BỘ KIỂM NÀY SAI, đã sửa: quản lý PHẢI đọc được phiếu
  // của CHÍNH MÌNH — đó là tiền của họ. Thứ thẻ design cấm là đọc lương NGƯỜI
  // KHÁC. Đo "0 dòng" là đo nhầm, và nếu tin theo thì sẽ đi siết một quyền đúng.
  check("QUẢN LÝ chỉ đọc được ĐÚNG phiếu của mình, không thấy phiếu nhân viên",
    (await dem(uQL, QL, "payslips")) === 1, "thấy nhiều hơn 1 phiếu!");
  check("QUẢN LÝ chỉ đọc được dòng lương của phiếu mình",
    (await dem(uQL, QL, "payslip_lines")) === 1, "thấy dòng lương của người khác!");
  check("QUẢN LÝ không đọc được kỳ lương", (await dem(uQL, QL, "payroll_periods")) === 0, "đọc ĐƯỢC!");
  check("QUẢN LÝ VẪN đọc được bảng công (đó là việc của họ)", (await dem(uQL, QL, "timesheets")) > 0, "bị chặn nhầm");
  check("CHỦ TIỆM đọc được phiếu lương", (await dem(uChu, CHU, "payslips")) > 0, "bị chặn nhầm");
  check("nhân viên chỉ thấy 1 trong 2 phiếu (không thấy phiếu của quản lý)",
    (await dem(uNV, NV, "payslips")) === 1, "thấy cả phiếu người khác!");
  check("nhân viên đọc được phiếu của CHÍNH MÌNH — và CHỈ phiếu đó",
    (await dem(uNV, NV, "payslips")) === 1, "đọc sai số phiếu");

  console.log(
    fail === 0
      ? `[nhan-su-luong-smoke] ${n}/${n} PASS — chấm công gắn cờ đúng, chốt rồi khoá cả hai đầu, lương không lộ.`
      : `[nhan-su-luong-smoke] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
  );
} finally {
  await c.query("rollback");
  await c.end();
}
process.exit(fail === 0 ? 0 : 1);
