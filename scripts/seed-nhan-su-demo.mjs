#!/usr/bin/env node
/**
 * NẠP NHÂN SỰ cho tiệm mẫu — dựng một tiệm spa 20 người có thật.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO MỖI NGƯỜI PHẢI CÓ TÀI KHOẢN
 * ═══════════════════════════════════════════════════════════════════
 * Đã đo trên lược đồ thật (20/08), KHÔNG suy từ tên bảng:
 *
 *   • `appointments.staff_user_id` là **not null** và trỏ tới `auth.users`.
 *     Hồ sơ nhân viên KHÔNG có tài khoản thì không xếp được lên Lịch —
 *     màn Lịch dựng danh sách người từ `tenant_members`, không từ `employees`.
 *
 *   • `commission_sinh_cho_don()` nối hoa hồng bằng
 *     `join employees e on e.user_id = coalesce(l.performed_by_user_id,
 *      a.staff_user_id, o.created_by)`. `user_id` null ⇒ phép nối rớt ⇒
 *     người đó **không bao giờ được tính hoa hồng, và không có gì báo**.
 *
 * Nên "20 nhân viên nhưng chỉ 3 người có tài khoản" không phải một tiệm 20
 * người — nó là một tiệm 3 người kèm 17 dòng dữ liệu chết. Muốn dữ liệu mẫu
 * nói đúng sự thật thì phải đi đúng đường sản phẩm đã mở ở việc #61:
 * **tài khoản nhân viên bằng SỐ ĐIỆN THOẠI, không cần email**
 * (`lib/auth/staff-accounts.ts` → `p<sđt>.<mã tiệm>@staff.ifan.local`).
 *
 * Miền `staff.ifan.local` không định tuyến được — không lá thư nào gửi tới đó,
 * và các số điện thoại ở đây là số dựng cho tiệm mẫu.
 *
 * ═══════════════════════════════════════════════════════════════════
 * CHẠY LẠI KHÔNG NHÂN ĐÔI
 * ═══════════════════════════════════════════════════════════════════
 * Mỗi người neo vào MỘT khoá cố định: email tổng hợp suy từ SĐT (người mới)
 * hoặc email thật (3 tài khoản có sẵn từ trước). Chạy lần hai chỉ cập nhật,
 * không đẻ thêm. Cùng khuôn với `seed-demo.mjs` / `seed-sample-tenants.mjs`.
 *
 * ⚠️ CHỈ ghi vào tiệm `is_sample = true` — có chốt kiểm ở đầu, không phải lời hứa.
 *
 *   node --env-file=.env.local scripts/seed-nhan-su-demo.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SLUG = process.env.TIEM ?? "demo-spa-huong-sen";

const SB_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.env.SUPABASE_DB_URL || !SB_URL || !SERVICE) {
  console.error("Thiếu SUPABASE_DB_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const ca = readFileSync(new URL("../supabase/supabase-ca.crt", import.meta.url), "utf8");
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { ca, rejectUnauthorized: true } });
const admin = createClient(SB_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

/** Giống hệt `lib/auth/staff-accounts.ts` — lệch một ký tự là nhân viên không đăng nhập được. */
const emailTuSdt = (sdt, slug) => `p${sdt.replace(/\D/g, "")}.${slug.trim().toLowerCase()}@staff.ifan.local`;

// ── Đội hình một tiệm spa 20 người ────────────────────────────────────────
// `vai` là quyền trong app (tenant_members.role), `viec` là chức danh nghề.
// Hai thứ khác nhau: KTV trưởng ca cần quyền `manager` để duyệt bảng công,
// còn KTV thường chỉ cần `staff`.
const CO_SAN = [
  { email: "demo.ifan.2026@gmail.com", ten: "Chủ tiệm Demo", viec: "Chủ tiệm",
    vao: "2023-01-05", luong: 0, ngoaiGio: 0, phep: 12, sinh: "1988-06-18",
    ghiChu: "Chủ tiệm — không hưởng lương cứng, lấy theo lợi nhuận." },
  { email: "nhanvien.demo.ifan.2026@gmail.com", ten: "Bạn Thảo (lễ tân)", viec: "Lễ tân trưởng",
    vao: "2023-06-15", luong: 9_500_000, ngoaiGio: 68_000, phep: 12, sinh: "1998-11-02" },
];

const MOI = [
  { ten: "Nguyễn Thị Bích Ngọc", viec: "Quản lý tiệm", vai: "admin", sdt: "0903771201",
    vao: "2023-03-01", luong: 18_000_000, ngoaiGio: 130_000, phep: 14, sinh: "1990-04-12" },
  { ten: "Phạm Thị Hồng Nhung", viec: "Kỹ thuật viên trưởng — chăm sóc da", vai: "manager", sdt: "0903771202",
    vao: "2023-02-20", luong: 13_000_000, ngoaiGio: 94_000, phep: 14, sinh: "1992-08-30" },
  { ten: "Võ Thị Thanh Trúc", viec: "Kỹ thuật viên trưởng — massage", vai: "manager", sdt: "0903771203",
    vao: "2023-05-10", luong: 12_500_000, ngoaiGio: 90_000, phep: 14, sinh: "1993-01-25" },
  { ten: "Trần Thị Kim Anh", viec: "Lễ tân", vai: "staff", sdt: "0903771204",
    vao: "2024-02-01", luong: 8_000_000, ngoaiGio: 58_000, phep: 12, sinh: "2000-03-14" },
  { ten: "Lê Thị Mỹ Duyên", viec: "Thu ngân", vai: "staff", sdt: "0903771205",
    vao: "2024-04-08", luong: 8_500_000, ngoaiGio: 61_000, phep: 12, sinh: "1999-07-21" },
  { ten: "Đặng Thị Ngọc Hà", viec: "Kỹ thuật viên chăm sóc da", vai: "staff", sdt: "0903771206",
    vao: "2024-01-15", luong: 9_000_000, ngoaiGio: 65_000, phep: 12, sinh: "1997-05-09" },
  { ten: "Bùi Thị Thu Hiền", viec: "Kỹ thuật viên chăm sóc da", vai: "staff", sdt: "0903771207",
    vao: "2024-03-04", luong: 8_800_000, ngoaiGio: 63_000, phep: 12, sinh: "1996-12-01" },
  { ten: "Hoàng Thị Lan Anh", viec: "Kỹ thuật viên massage", vai: "staff", sdt: "0903771208",
    vao: "2024-05-20", luong: 9_200_000, ngoaiGio: 66_000, phep: 12, sinh: "1995-09-17" },
  { ten: "Ngô Thị Cẩm Tú", viec: "Kỹ thuật viên massage", vai: "staff", sdt: "0903771209",
    vao: "2024-07-01", luong: 8_700_000, ngoaiGio: 62_000, phep: 12, sinh: "1998-02-28" },
  { ten: "Đỗ Thị Phương Thảo", viec: "Kỹ thuật viên triệt lông", vai: "staff", sdt: "0903771210",
    vao: "2024-09-09", luong: 9_500_000, ngoaiGio: 68_000, phep: 12, sinh: "1994-10-06" },
  { ten: "Lý Thị Bảo Trân", viec: "Kỹ thuật viên gội dưỡng sinh", vai: "staff", sdt: "0903771211",
    vao: "2025-01-06", luong: 8_200_000, ngoaiGio: 59_000, phep: 12, sinh: "2001-04-23" },
  { ten: "Trương Thị Yến Nhi", viec: "Kỹ thuật viên gội dưỡng sinh", vai: "staff", sdt: "0903771212",
    vao: "2025-02-17", luong: 8_000_000, ngoaiGio: 58_000, phep: 12, sinh: "2002-06-11" },
  { ten: "Mai Thị Quỳnh Như", viec: "Kỹ thuật viên chăm sóc da", vai: "staff", sdt: "0903771213",
    vao: "2025-04-01", luong: 8_500_000, ngoaiGio: 61_000, phep: 12, sinh: "1999-11-29" },
  { ten: "Phan Thị Tuyết Mai", viec: "Kỹ thuật viên massage", vai: "staff", sdt: "0903771214",
    vao: "2025-05-12", luong: 8_600_000, ngoaiGio: 62_000, phep: 12, sinh: "1997-03-08" },
  { ten: "Huỳnh Thị Diễm My", viec: "Phụ tá kỹ thuật viên", vai: "staff", sdt: "0903771215",
    vao: "2025-08-04", luong: 6_800_000, ngoaiGio: 49_000, phep: 12, sinh: "2003-01-19" },
  { ten: "Vũ Thị Hoài Thương", viec: "Chăm sóc khách hàng & marketing", vai: "staff", sdt: "0903771216",
    vao: "2024-06-03", luong: 11_000_000, ngoaiGio: 79_000, phep: 12, sinh: "1995-07-15" },
  { ten: "Cao Thị Mỹ Linh", viec: "Kế toán (bán thời gian)", vai: "staff", sdt: "0903771217",
    vao: "2023-09-11", luong: 10_000_000, ngoaiGio: 0, phep: 12, sinh: "1991-02-05",
    ghiChu: "Làm 3 buổi/tuần — thứ Hai, thứ Tư, thứ Sáu." },
  { ten: "Nguyễn Văn Tài", viec: "Bảo vệ kiêm tạp vụ", vai: "staff", sdt: "0903771218",
    vao: "2024-08-19", luong: 6_500_000, ngoaiGio: 47_000, phep: 12, sinh: "1985-12-24" },
  // Một người đã nghỉ việc — tiệm thật nào cũng có. Giữ lại để báo cáo lương và
  // lịch sử hoa hồng của các tháng cũ không bị thủng, và để lộ ra chỗ nào trong
  // sản phẩm còn quên lọc "người đã nghỉ" (đúng lớp bệnh việc #199).
  { ten: "Lâm Thị Kiều Oanh", viec: "Kỹ thuật viên massage", vai: "staff", sdt: "0903771219",
    vao: "2023-11-02", nghi: "2026-05-31", luong: 8_900_000, ngoaiGio: 64_000, phep: 12, sinh: "1996-08-08",
    ghiChu: "Đã nghỉ việc 31/05/2026 — chuyển vào Nam." },
];

const log = (s) => console.log(s);

async function main() {
  await c.connect();
  await c.query("set lock_timeout = '10s'");

  const { rows: [T] } = await c.query(
    `select id, name, slug, is_sample from public.tenants where slug = $1`, [SLUG]);
  if (!T) throw new Error(`Không có tiệm '${SLUG}'`);
  // Chốt kiểm, không phải lời hứa: bộ nạp này TẠO TÀI KHOẢN ĐĂNG NHẬP THẬT.
  // Chạy nhầm vào tiệm của khách là dựng người lạ trong nhà người ta.
  if (!T.is_sample) throw new Error(`'${SLUG}' KHÔNG phải tiệm mẫu — dừng.`);
  log(`Tiệm: ${T.name} (${T.slug})\n`);

  /** Tra tài khoản theo email; chưa có thì tạo bằng Admin API. Trả về user id. */
  async function taiKhoan({ email, ten, sdt }) {
    const { rows } = await c.query(`select id from auth.users where email = $1`, [email]);
    if (rows.length) return { id: rows[0].id, moi: false };

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: `Demo!${Math.random().toString(36).slice(2, 10)}A9`,
      email_confirm: true,
      user_metadata: { display_name: ten, phone: sdt ?? null, must_change_password: true },
    });
    if (error) throw new Error(`Tạo tài khoản ${email} hỏng: ${error.message}`);
    return { id: data.user.id, moi: true };
  }

  const danhSach = [
    ...CO_SAN.map((n) => ({ ...n, coSan: true })),
    ...MOI.map((n) => ({ ...n, email: emailTuSdt(n.sdt, T.slug) })),
  ];

  let themTaiKhoan = 0, themNguoi = 0, capNhat = 0;

  for (const n of danhSach) {
    const { id: uid, moi } = await taiKhoan(n);
    if (moi) themTaiKhoan++;

    // Tên hiển thị: trigger handle_new_user chỉ chạy lúc TẠO, nên người có sẵn
    // phải cập nhật riêng — nếu không màn Lịch hiện "—" thay vì tên.
    await c.query(
      `insert into public.profiles (user_id, display_name) values ($1, $2)
       on conflict (user_id) do update set display_name = excluded.display_name`,
      [uid, n.ten]);

    // Vai trong tiệm. Người có sẵn giữ nguyên vai cũ (chủ tiệm / lễ tân / khách xem).
    if (!n.coSan) {
      await c.query(
        `insert into public.tenant_members (tenant_id, user_id, role, status)
         values ($1, $2, $3, $4)
         on conflict (tenant_id, user_id) do update
           set role = excluded.role, status = excluded.status`,
        // `tenant_members.status` chỉ nhận 'active' | 'removed' (đã đo) — người
        // đã nghỉ việc bị gỡ khỏi tiệm, không có trạng thái "tạm ngưng".
        [T.id, uid, n.vai, n.nghi ? "removed" : "active"]);
    }

    // Hồ sơ nhân sự, neo vào user_id (đã có ràng buộc employees_user_unique).
    const { rows: cu } = await c.query(
      `select id from public.employees where tenant_id = $1 and user_id = $2`, [T.id, uid]);
    // Liệt kê tường minh, KHÔNG dùng Object.values(...): thứ tự khoá của đối
    // tượng mà lệch với thứ tự $n là ghi nhầm cột sang cột — hỏng im lặng,
    // đúng lớp bệnh kho này đã trả giá nhiều lần.
    const giaTri = [
      T.id, uid,
      n.ten,
      n.sdt ?? null,
      n.sinh,
      n.vao,
      n.nghi ?? null,
      n.luong,
      n.ngoaiGio,
      n.phep,
      n.ghiChu ?? n.viec,
    ];
    if (cu.length) {
      await c.query(
        `update public.employees set full_name=$3, phone=$4, dob=$5, started_on=$6, ended_on=$7,
           base_salary_vnd=$8, overtime_rate_vnd=$9, annual_leave_days=$10, note=$11
         where tenant_id=$1 and user_id=$2`, giaTri);
      capNhat++;
    } else {
      await c.query(
        `insert into public.employees (tenant_id, user_id, full_name, phone, dob, started_on,
           ended_on, base_salary_vnd, overtime_rate_vnd, annual_leave_days, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, giaTri);
      themNguoi++;
    }
    log(`  ${moi ? "+" : "·"} ${n.ten.padEnd(24)} ${n.viec}${n.nghi ? "  (đã nghỉ)" : ""}`);
  }

  const { rows: [d] } = await c.query(
    `select
       (select count(*)::int from public.employees where tenant_id=$1) nguoi,
       (select count(*)::int from public.employees where tenant_id=$1 and ended_on is null) dang_lam,
       (select count(*)::int from public.employees where tenant_id=$1 and user_id is not null) co_tai_khoan,
       (select count(*)::int from public.tenant_members where tenant_id=$1) thanh_vien`, [T.id]);

  log(`\nHồ sơ nhân sự: ${d.nguoi} (đang làm ${d.dang_lam}) · có tài khoản ${d.co_tai_khoan} · thành viên tiệm ${d.thanh_vien}`);
  log(`Tài khoản mới tạo: ${themTaiKhoan} · hồ sơ mới: ${themNguoi} · cập nhật: ${capNhat}`);

  // ĐỐI CHỨNG: người không nối được tài khoản thì hoa hồng KHÔNG BAO GIỜ tính
  // tới — im lặng. Nếu con số này khác 0 thì bộ nạp đã hỏng, phải biết ngay.
  const { rows: [hong] } = await c.query(
    `select count(*)::int n from public.employees where tenant_id=$1 and user_id is null`, [T.id]);
  if (hong.n > 0) {
    log(`\n⚠️  ${hong.n} hồ sơ KHÔNG nối tài khoản — những người này sẽ không được tính hoa hồng.`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("HỎNG:", e.message); process.exitCode = 1; })
  .finally(() => c.end());
