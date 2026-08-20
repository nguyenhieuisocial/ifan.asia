#!/usr/bin/env node
/**
 * NẠP NHÂN SỰ cho 5 TIỆM MẪU CÒN LẠI — quán cà phê, nha khoa, mỹ phẩm,
 * boutique bán online, spa thú cưng. Mỗi tiệm hiện chỉ có ĐÚNG một người
 * (tài khoản chủ tiệm dùng chung), nên mọi màn về nhân sự / lịch / hoa hồng
 * đều trống trơn — không phải vì sản phẩm hỏng mà vì không có ai để hiện.
 *
 * Cùng khuôn với `seed-nhan-su-demo.mjs` (tiệm spa). File này KHÔNG đụng tới
 * `demo-spa-huong-sen` — tiệm đó đã xong và đang có nhóm khác làm việc trên nó.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO MỖI NGƯỜI BẮT BUỘC PHẢI CÓ TÀI KHOẢN ĐĂNG NHẬP
 * ═══════════════════════════════════════════════════════════════════
 * Đã đo trên lược đồ thật (20/08), KHÔNG suy từ tên bảng:
 *
 *   • `appointments.staff_user_id` là **not null** và trỏ tới `auth.users`.
 *     Hồ sơ nhân viên KHÔNG có tài khoản thì không xếp được lên Lịch — màn
 *     Lịch dựng danh sách người từ `tenant_members`, không từ `employees`.
 *
 *   • `commission_sinh_cho_don()` nối hoa hồng qua `employees.user_id`.
 *     `user_id` null ⇒ phép nối rớt **im lặng** ⇒ người đó không bao giờ
 *     được tính hoa hồng, và KHÔNG có gì báo là đã rớt.
 *
 * Nên một hồ sơ nhân viên không nối tài khoản không phải "một nhân viên chưa
 * cấp quyền" — nó là một dòng dữ liệu chết, và tệ hơn: nó khiến người xem tin
 * rằng tiệm có 18 người trong khi sản phẩm chỉ nhìn thấy 0. Vì vậy bộ nạp này
 * đi đúng đường sản phẩm đã mở ở việc #61: **tài khoản nhân viên bằng SỐ ĐIỆN
 * THOẠI, không cần email** (`lib/auth/staff-accounts.ts` →
 * `p<sđt>.<mã tiệm>@staff.ifan.local`).
 *
 * Miền `staff.ifan.local` không định tuyến được — không lá thư nào gửi tới đó,
 * và toàn bộ số điện thoại ở đây là số dựng cho tiệm mẫu. Mỗi tiệm dùng một dải
 * số riêng để không đụng nhau và không đụng dải `09037712xx` của tiệm spa.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO DANH SÁCH VIẾT TAY, KHÔNG SINH NGẪU NHIÊN
 * ═══════════════════════════════════════════════════════════════════
 * Dữ liệu mẫu phải ĐỨNG YÊN. Sinh tên ngẫu nhiên thì chạy lại lần hai ra một
 * tiệm khác người, ảnh chụp màn hình cũ hết đúng, và bộ soát nào neo vào tên
 * cũng gãy. Viết tay từng người là cách "định trước" chắc nhất: chạy bao nhiêu
 * lần cũng ra đúng những con người đó.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO MỖI TIỆM CÓ MỘT NGƯỜI ĐÃ NGHỈ VIỆC
 * ═══════════════════════════════════════════════════════════════════
 * Tiệm thật nào cũng có người nghỉ. Giữ họ lại để báo cáo lương và lịch sử hoa
 * hồng các tháng cũ không bị thủng — và để LỘ RA chỗ nào trong sản phẩm còn
 * quên lọc "người đã nghỉ" (đúng lớp bệnh việc #199). Người đã nghỉ có
 * `employees.ended_on` và `tenant_members.status = 'removed'`.
 *
 * ═══════════════════════════════════════════════════════════════════
 * CHẠY LẠI KHÔNG NHÂN ĐÔI
 * ═══════════════════════════════════════════════════════════════════
 * Mỗi người neo vào MỘT khoá cố định: email tổng hợp suy từ SĐT + mã tiệm.
 * Có rồi thì cập nhật, chưa có mới tạo. Chạy lần hai phải ra đúng con số của
 * lần một — đó là điều kiện nghiệm thu, không phải lời hứa.
 *
 * ⚠️ CHỈ ghi vào tiệm `is_sample = true`, và chỉ đúng 5 mã tiệm ghi cứng dưới
 * đây. Có chốt kiểm ở đầu, dừng ngay nếu sai: bộ nạp này TẠO TÀI KHOẢN ĐĂNG
 * NHẬP THẬT — chạy nhầm vào tiệm của khách là dựng người lạ trong nhà người ta.
 *
 *   node --env-file=.env.local scripts/seed-nhan-su-tiem-mau.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

/** Tiệm spa đã xong, nhóm khác đang làm trên đó — chạm vào là giẫm chân. */
const CAM_DUNG = "demo-spa-huong-sen";

// ─────────────────────────────────────────────────────────────────────────────
// ĐỘI HÌNH — `vai` là quyền trong app (tenant_members.role), `viec` là chức
// danh nghề (ghi vào employees.note). Hai thứ khác nhau: bếp trưởng cần quyền
// `manager` để duyệt bảng công, còn phụ bếp chỉ cần `staff`.
//
// Quy mô đặt theo NGÀNH, không ép bằng nhau: quán cà phê đông người phục vụ,
// phòng khám ít người nhưng lương bác sĩ gấp mấy lần, shop online gọn nhất.
// Lương theo mặt bằng Việt Nam 2026.
// ─────────────────────────────────────────────────────────────────────────────
const TIEMS = [
  {
    slug: "sample-fnb",
    // Tiệm này tên thật là "Cafe Góc Phố" — quán cà phê có phục vụ đồ ăn, nên
    // có đủ bếp trưởng/bếp phó/phụ bếp lẫn một bạn pha chế.
    doi: [
      { ten: "Trịnh Quốc Bảo", viec: "Quản lý quán", vai: "admin", sdt: "0903772101",
        vao: "2023-04-10", luong: 16_000_000, ngoaiGio: 115_000, phep: 14, sinh: "1989-05-22" },
      { ten: "Đinh Văn Hoàng", viec: "Bếp trưởng", vai: "manager", sdt: "0903772102",
        vao: "2023-03-15", luong: 15_000_000, ngoaiGio: 108_000, phep: 14, sinh: "1987-09-03" },
      { ten: "Tạ Minh Khôi", viec: "Bếp phó", vai: "manager", sdt: "0903772103",
        vao: "2023-08-01", luong: 11_500_000, ngoaiGio: 83_000, phep: 14, sinh: "1991-12-17" },
      { ten: "Lương Thị Kim Thoa", viec: "Phụ bếp", vai: "staff", sdt: "0903772104",
        vao: "2024-01-08", luong: 7_500_000, ngoaiGio: 54_000, phep: 12, sinh: "1998-02-11" },
      { ten: "Hà Văn Cường", viec: "Phụ bếp", vai: "staff", sdt: "0903772105",
        vao: "2024-05-06", luong: 7_200_000, ngoaiGio: 52_000, phep: 12, sinh: "2000-06-25" },
      { ten: "Chu Thị Hạnh", viec: "Phụ bếp", vai: "staff", sdt: "0903772106",
        vao: "2024-09-16", luong: 7_000_000, ngoaiGio: 50_000, phep: 12, sinh: "2001-10-04" },
      { ten: "Đoàn Minh Nhật", viec: "Phụ bếp", vai: "staff", sdt: "0903772107",
        vao: "2025-02-03", luong: 7_300_000, ngoaiGio: 53_000, phep: 12, sinh: "2002-03-29" },
      { ten: "Nguyễn Thị Ánh Tuyết", viec: "Phục vụ", vai: "staff", sdt: "0903772108",
        vao: "2023-10-02", luong: 7_000_000, ngoaiGio: 50_000, phep: 12, sinh: "1999-01-16" },
      { ten: "Trần Quang Huy", viec: "Phục vụ", vai: "staff", sdt: "0903772109",
        vao: "2024-02-19", luong: 6_800_000, ngoaiGio: 49_000, phep: 12, sinh: "2001-07-08" },
      { ten: "Phạm Thị Lệ Quyên", viec: "Phục vụ", vai: "staff", sdt: "0903772110",
        vao: "2024-06-10", luong: 6_800_000, ngoaiGio: 49_000, phep: 12, sinh: "2002-11-23" },
      { ten: "Lê Hoàng Nam", viec: "Phục vụ", vai: "staff", sdt: "0903772111",
        vao: "2024-11-04", luong: 6_500_000, ngoaiGio: 47_000, phep: 12, sinh: "2003-04-02" },
      { ten: "Vương Thị Thúy Kiều", viec: "Phục vụ", vai: "staff", sdt: "0903772112",
        vao: "2025-01-13", luong: 6_500_000, ngoaiGio: 47_000, phep: 12, sinh: "2003-08-19" },
      { ten: "Đỗ Văn Lộc", viec: "Phục vụ", vai: "staff", sdt: "0903772113",
        vao: "2025-03-24", luong: 6_500_000, ngoaiGio: 47_000, phep: 12, sinh: "2004-01-07" },
      { ten: "Nguyễn Thị Kiều Trang", viec: "Phục vụ", vai: "staff", sdt: "0903772114",
        vao: "2025-06-02", luong: 6_400_000, ngoaiGio: 46_000, phep: 12, sinh: "2003-12-30" },
      { ten: "Bùi Thị Ngọc Mai", viec: "Thu ngân", vai: "staff", sdt: "0903772115",
        vao: "2023-12-11", luong: 8_200_000, ngoaiGio: 59_000, phep: 12, sinh: "1997-05-27" },
      { ten: "Hồ Thị Thanh Vân", viec: "Thu ngân", vai: "staff", sdt: "0903772116",
        vao: "2024-08-05", luong: 8_000_000, ngoaiGio: 58_000, phep: 12, sinh: "1999-09-13" },
      { ten: "Nguyễn Hữu Thắng", viec: "Pha chế", vai: "staff", sdt: "0903772117",
        vao: "2023-07-17", luong: 9_500_000, ngoaiGio: 68_000, phep: 12, sinh: "1996-04-05" },
      { ten: "Trần Thị Bảy", viec: "Tạp vụ", vai: "staff", sdt: "0903772118",
        vao: "2024-03-11", luong: 6_200_000, ngoaiGio: 45_000, phep: 12, sinh: "1978-08-21" },
      { ten: "Lâm Văn Đạt", viec: "Phục vụ", vai: "staff", sdt: "0903772119",
        vao: "2023-09-05", nghi: "2026-04-30", luong: 6_700_000, ngoaiGio: 48_000, phep: 12, sinh: "2000-12-09",
        ghiChu: "Phục vụ — đã nghỉ việc 30/04/2026, về quê." },
    ],
  },
  {
    slug: "sample-kham",
    // Tiệm này tên thật là "Nha Khoa Gia Đình An Tâm" — phòng khám NHA KHOA,
    // nên chức danh đi theo nha khoa (bác sĩ răng hàm mặt, phụ tá nha khoa,
    // kỹ thuật viên labo/X-quang) thay vì phòng khám đa khoa chung chung.
    doi: [
      { ten: "Đặng Quốc Việt", viec: "Quản lý phòng khám", vai: "admin", sdt: "0903773101",
        vao: "2023-02-06", luong: 20_000_000, ngoaiGio: 143_000, phep: 14, sinh: "1986-03-19" },
      { ten: "Nguyễn Thành Trung", viec: "Bác sĩ răng hàm mặt — phụ trách chuyên môn", vai: "manager", sdt: "0903773102",
        vao: "2023-01-16", luong: 38_000_000, ngoaiGio: 250_000, phep: 15, sinh: "1984-07-11" },
      { ten: "Vũ Thị Hồng Loan", viec: "Bác sĩ răng hàm mặt", vai: "manager", sdt: "0903773103",
        vao: "2023-05-22", luong: 34_000_000, ngoaiGio: 230_000, phep: 15, sinh: "1988-10-28" },
      { ten: "Phan Đăng Khoa", viec: "Bác sĩ răng hàm mặt", vai: "manager", sdt: "0903773104",
        vao: "2024-03-11", luong: 30_000_000, ngoaiGio: 200_000, phep: 15, sinh: "1991-06-14" },
      { ten: "Trịnh Thị Mỹ Hạnh", viec: "Điều dưỡng — phụ tá nha khoa", vai: "staff", sdt: "0903773105",
        vao: "2023-04-03", luong: 10_500_000, ngoaiGio: 76_000, phep: 12, sinh: "1995-02-09" },
      { ten: "Lưu Thị Kim Chi", viec: "Điều dưỡng — phụ tá nha khoa", vai: "staff", sdt: "0903773106",
        vao: "2024-01-22", luong: 10_000_000, ngoaiGio: 72_000, phep: 12, sinh: "1997-08-15" },
      { ten: "Nguyễn Thị Hồng Đào", viec: "Điều dưỡng — phụ tá nha khoa", vai: "staff", sdt: "0903773107",
        vao: "2024-10-07", luong: 9_800_000, ngoaiGio: 70_000, phep: 12, sinh: "1999-05-30" },
      { ten: "Hoàng Minh Quân", viec: "Kỹ thuật viên labo răng sứ", vai: "staff", sdt: "0903773108",
        vao: "2023-07-10", luong: 12_000_000, ngoaiGio: 86_000, phep: 12, sinh: "1993-11-04" },
      { ten: "Tô Thị Diệu Linh", viec: "Kỹ thuật viên chẩn đoán hình ảnh (X-quang)", vai: "staff", sdt: "0903773109",
        vao: "2024-06-17", luong: 11_000_000, ngoaiGio: 79_000, phep: 12, sinh: "1996-01-26" },
      { ten: "Đỗ Thị Ngọc Bích", viec: "Lễ tân", vai: "staff", sdt: "0903773110",
        vao: "2023-09-04", luong: 8_500_000, ngoaiGio: 61_000, phep: 12, sinh: "1998-12-12" },
      { ten: "Nguyễn Thị Thu Hà", viec: "Lễ tân", vai: "staff", sdt: "0903773111",
        vao: "2024-08-12", luong: 8_200_000, ngoaiGio: 59_000, phep: 12, sinh: "2000-04-18" },
      { ten: "Châu Thị Mộng Thu", viec: "Dược sĩ quầy thuốc", vai: "staff", sdt: "0903773112",
        vao: "2023-11-20", luong: 11_500_000, ngoaiGio: 82_000, phep: 12, sinh: "1994-09-07" },
      { ten: "Lại Thị Thanh Nga", viec: "Kế toán", vai: "staff", sdt: "0903773113",
        vao: "2023-03-27", luong: 13_000_000, ngoaiGio: 0, phep: 12, sinh: "1990-06-21",
        ghiChu: "Kế toán — làm giờ hành chính, không tính ngoài giờ." },
      { ten: "Phạm Thị Sáu", viec: "Tạp vụ kiêm tiệt trùng dụng cụ", vai: "staff", sdt: "0903773114",
        vao: "2024-04-15", luong: 6_500_000, ngoaiGio: 47_000, phep: 12, sinh: "1976-02-14" },
      { ten: "Ngô Thị Bảo Châu", viec: "Điều dưỡng — phụ tá nha khoa", vai: "staff", sdt: "0903773115",
        vao: "2023-06-05", nghi: "2026-03-31", luong: 9_900_000, ngoaiGio: 71_000, phep: 12, sinh: "1996-10-11",
        ghiChu: "Phụ tá nha khoa — đã nghỉ việc 31/03/2026, nghỉ sinh rồi không quay lại." },
    ],
  },
  {
    slug: "sample-retail",
    // "Mỹ Phẩm Ngọc Trai" — cửa hàng bán lẻ mỹ phẩm, chạy hai ca nên có hai ca trưởng.
    doi: [
      { ten: "Nguyễn Thị Thanh Tâm", viec: "Quản lý cửa hàng", vai: "admin", sdt: "0903774101",
        vao: "2023-02-13", luong: 15_000_000, ngoaiGio: 108_000, phep: 14, sinh: "1990-01-09" },
      { ten: "Lê Thị Hồng Vân", viec: "Ca trưởng — ca sáng", vai: "manager", sdt: "0903774102",
        vao: "2023-06-19", luong: 10_500_000, ngoaiGio: 76_000, phep: 13, sinh: "1994-05-16" },
      { ten: "Trần Minh Hiếu", viec: "Ca trưởng — ca chiều", vai: "manager", sdt: "0903774103",
        vao: "2024-02-05", luong: 10_200_000, ngoaiGio: 74_000, phep: 13, sinh: "1995-11-22" },
      { ten: "Phùng Thị Cẩm Nhung", viec: "Nhân viên bán hàng", vai: "staff", sdt: "0903774104",
        vao: "2023-08-14", luong: 8_000_000, ngoaiGio: 58_000, phep: 12, sinh: "1999-03-06" },
      { ten: "Nguyễn Thị Xuân Mai", viec: "Nhân viên bán hàng", vai: "staff", sdt: "0903774105",
        vao: "2024-01-09", luong: 7_800_000, ngoaiGio: 56_000, phep: 12, sinh: "2000-07-19" },
      { ten: "Đặng Thị Hoài An", viec: "Nhân viên bán hàng", vai: "staff", sdt: "0903774106",
        vao: "2024-07-01", luong: 7_800_000, ngoaiGio: 56_000, phep: 12, sinh: "2001-02-27" },
      { ten: "Võ Minh Tuấn", viec: "Nhân viên bán hàng", vai: "staff", sdt: "0903774107",
        vao: "2025-01-20", luong: 7_500_000, ngoaiGio: 54_000, phep: 12, sinh: "2002-09-08" },
      { ten: "Lương Thị Thảo Vy", viec: "Nhân viên bán hàng", vai: "staff", sdt: "0903774108",
        vao: "2025-05-05", luong: 7_500_000, ngoaiGio: 54_000, phep: 12, sinh: "2003-06-13" },
      { ten: "Kiều Thị Ngọc Hân", viec: "Thu ngân", vai: "staff", sdt: "0903774109",
        vao: "2023-10-23", luong: 8_300_000, ngoaiGio: 60_000, phep: 12, sinh: "1998-08-02" },
      { ten: "Trương Thị Mỹ Lệ", viec: "Thu ngân", vai: "staff", sdt: "0903774110",
        vao: "2024-09-02", luong: 8_000_000, ngoaiGio: 58_000, phep: 12, sinh: "1999-12-25" },
      { ten: "Bùi Văn Trọng", viec: "Thủ kho", vai: "staff", sdt: "0903774111",
        vao: "2023-12-04", luong: 9_000_000, ngoaiGio: 65_000, phep: 12, sinh: "1992-04-30" },
      { ten: "Hồ Thị Minh Phương", viec: "Kế toán", vai: "staff", sdt: "0903774112",
        vao: "2023-05-08", luong: 12_500_000, ngoaiGio: 0, phep: 12, sinh: "1991-10-17",
        ghiChu: "Kế toán — làm giờ hành chính, không tính ngoài giờ." },
      { ten: "Đinh Thị Kim Ngân", viec: "Nhân viên bán hàng", vai: "staff", sdt: "0903774113",
        vao: "2024-04-22", nghi: "2026-02-28", luong: 7_700_000, ngoaiGio: 55_000, phep: 12, sinh: "2001-05-11",
        ghiChu: "Nhân viên bán hàng — đã nghỉ việc 28/02/2026, chuyển sang hãng khác." },
    ],
  },
  {
    slug: "sample-shop",
    // "Sắc Màu Boutique" — bán hàng online, không có mặt bằng bán trực tiếp:
    // nặng chăm sóc khách + đóng gói, không có thu ngân.
    doi: [
      { ten: "Nguyễn Hoàng Yến Vy", viec: "Quản lý shop", vai: "admin", sdt: "0903775101",
        vao: "2023-03-06", luong: 14_000_000, ngoaiGio: 101_000, phep: 14, sinh: "1992-02-24" },
      { ten: "Trần Thị Bích Thủy", viec: "Trưởng nhóm chăm sóc khách", vai: "manager", sdt: "0903775102",
        vao: "2023-07-24", luong: 10_000_000, ngoaiGio: 72_000, phep: 13, sinh: "1995-08-09" },
      { ten: "Nguyễn Thị Mai Trâm", viec: "Chăm sóc khách", vai: "staff", sdt: "0903775103",
        vao: "2024-01-15", luong: 8_000_000, ngoaiGio: 58_000, phep: 12, sinh: "2000-01-31" },
      { ten: "Lê Thị Tuyết Ngân", viec: "Chăm sóc khách", vai: "staff", sdt: "0903775104",
        vao: "2024-06-24", luong: 7_800_000, ngoaiGio: 56_000, phep: 12, sinh: "2001-09-12" },
      { ten: "Huỳnh Văn Phúc", viec: "Chăm sóc khách", vai: "staff", sdt: "0903775105",
        vao: "2025-02-10", luong: 7_600_000, ngoaiGio: 55_000, phep: 12, sinh: "2002-05-04" },
      { ten: "Phạm Thị Hồng Gấm", viec: "Đóng gói", vai: "staff", sdt: "0903775106",
        vao: "2024-03-18", luong: 7_000_000, ngoaiGio: 50_000, phep: 12, sinh: "1999-06-20" },
      { ten: "Đỗ Văn Hào", viec: "Đóng gói", vai: "staff", sdt: "0903775107",
        vao: "2024-10-14", luong: 7_000_000, ngoaiGio: 50_000, phep: 12, sinh: "2001-11-28" },
      { ten: "Vũ Thị Quỳnh Giang", viec: "Marketing", vai: "staff", sdt: "0903775108",
        vao: "2023-09-11", luong: 13_000_000, ngoaiGio: 94_000, phep: 12, sinh: "1996-03-15" },
      { ten: "Nguyễn Văn Định", viec: "Thủ kho", vai: "staff", sdt: "0903775109",
        vao: "2023-11-27", luong: 9_000_000, ngoaiGio: 65_000, phep: 12, sinh: "1993-07-06" },
      { ten: "Tống Thị Lan Hương", viec: "Kế toán", vai: "staff", sdt: "0903775110",
        vao: "2023-04-17", luong: 12_000_000, ngoaiGio: 0, phep: 12, sinh: "1990-12-03",
        ghiChu: "Kế toán — làm giờ hành chính, không tính ngoài giờ." },
      { ten: "Mai Thị Ánh Nguyệt", viec: "Chăm sóc khách", vai: "staff", sdt: "0903775111",
        vao: "2024-08-19", nghi: "2026-06-30", luong: 7_700_000, ngoaiGio: 55_000, phep: 12, sinh: "2000-10-22",
        ghiChu: "Chăm sóc khách — đã nghỉ việc 30/06/2026, đi học tiếp." },
    ],
  },
  {
    slug: "sample-pet",
    // "Spa Thú Cưng Bống Bang" — tiệm nhỏ nhất: một bác sĩ thú y, ba thợ cắt tỉa.
    doi: [
      { ten: "Lê Nguyễn Khánh Vân", viec: "Quản lý tiệm", vai: "admin", sdt: "0903776101",
        vao: "2023-05-15", luong: 13_500_000, ngoaiGio: 97_000, phep: 14, sinh: "1993-09-26" },
      { ten: "Trần Đức Thịnh", viec: "Bác sĩ thú y", vai: "manager", sdt: "0903776102",
        vao: "2023-04-03", luong: 22_000_000, ngoaiGio: 158_000, phep: 14, sinh: "1989-11-18" },
      { ten: "Nguyễn Thị Hải Yến", viec: "Thợ cắt tỉa lông", vai: "staff", sdt: "0903776103",
        vao: "2023-08-21", luong: 9_500_000, ngoaiGio: 68_000, phep: 12, sinh: "1997-04-09" },
      { ten: "Đặng Văn Sơn", viec: "Thợ cắt tỉa lông", vai: "staff", sdt: "0903776104",
        vao: "2024-02-26", luong: 9_200_000, ngoaiGio: 66_000, phep: 12, sinh: "1999-10-15" },
      { ten: "Phạm Thị Kiều Diễm", viec: "Thợ cắt tỉa lông", vai: "staff", sdt: "0903776105",
        vao: "2024-11-11", luong: 8_800_000, ngoaiGio: 63_000, phep: 12, sinh: "2001-03-23" },
      { ten: "Hoàng Thị Ngọc Trâm", viec: "Nhân viên bán hàng (phụ kiện, thức ăn)", vai: "staff", sdt: "0903776106",
        vao: "2024-05-13", luong: 8_000_000, ngoaiGio: 58_000, phep: 12, sinh: "2000-08-07" },
      { ten: "Nguyễn Minh Trí", viec: "Nhân viên bán hàng (phụ kiện, thức ăn)", vai: "staff", sdt: "0903776107",
        vao: "2025-03-03", luong: 7_800_000, ngoaiGio: 56_000, phep: 12, sinh: "2002-12-19" },
      { ten: "Trịnh Thị Thu Sương", viec: "Lễ tân", vai: "staff", sdt: "0903776108",
        vao: "2023-10-09", luong: 8_200_000, ngoaiGio: 59_000, phep: 12, sinh: "1998-06-02" },
      { ten: "Lý Văn Bình", viec: "Tạp vụ kiêm dọn chuồng", vai: "staff", sdt: "0903776109",
        vao: "2024-07-08", luong: 6_500_000, ngoaiGio: 47_000, phep: 12, sinh: "1980-01-14" },
      { ten: "Cao Thị Bích Ngân", viec: "Thợ cắt tỉa lông", vai: "staff", sdt: "0903776110",
        vao: "2023-12-18", nghi: "2026-01-31", luong: 9_000_000, ngoaiGio: 65_000, phep: 12, sinh: "1996-07-27",
        ghiChu: "Thợ cắt tỉa lông — đã nghỉ việc 31/01/2026, mở tiệm riêng." },
    ],
  },
];

const log = (s) => console.log(s);

/**
 * Tự soát danh sách TRƯỚC khi chạm cơ sở dữ liệu: trùng tên hay trùng số điện
 * thoại là lỗi của người viết danh sách, và nó hỏng IM LẶNG (hai người trùng
 * SĐT ⇒ trùng email tổng hợp ⇒ người thứ hai đè lên người thứ nhất).
 */
function soatDanhSach() {
  const ten = new Map(), sdt = new Map();
  for (const t of TIEMS) {
    if (t.slug === CAM_DUNG) throw new Error(`Danh sách chứa '${CAM_DUNG}' — tiệm này bị cấm đụng.`);
    for (const n of t.doi) {
      if (ten.has(n.ten)) throw new Error(`Trùng tên '${n.ten}' (${ten.get(n.ten)} và ${t.slug})`);
      ten.set(n.ten, t.slug);
      if (sdt.has(n.sdt)) throw new Error(`Trùng SĐT '${n.sdt}' (${sdt.get(n.sdt)} và ${t.slug})`);
      sdt.set(n.sdt, t.slug);
      if (!/^0\d{9,10}$/.test(n.sdt)) throw new Error(`SĐT '${n.sdt}' sai định dạng`);
      if (n.nghi && n.nghi < n.vao) throw new Error(`${n.ten}: ngày nghỉ trước ngày vào`);
    }
  }
  log(`Danh sách: ${TIEMS.length} tiệm · ${ten.size} người · tên và SĐT không trùng.\n`);
}

async function main() {
  soatDanhSach();

  await c.connect();
  await c.query("set lock_timeout = '10s'");

  // Chụp số của tiệm spa TRƯỚC khi chạy, để cuối bài chứng minh không đụng vào.
  const spaTruoc = await demSpa();

  const uidsDaTao = [];   // mọi tài khoản bộ nạp này chạm tới — để đối chứng cuối bài
  const bang = [];        // số liệu từng tiệm

  for (const tiem of TIEMS) {
    const { rows: [T] } = await c.query(
      `select id, name, slug, is_sample from public.tenants where slug = $1`, [tiem.slug]);
    if (!T) throw new Error(`Không có tiệm '${tiem.slug}'`);
    // Chốt kiểm, không phải lời hứa: bộ nạp này TẠO TÀI KHOẢN ĐĂNG NHẬP THẬT.
    // Chạy nhầm vào tiệm của khách là dựng người lạ trong nhà người ta.
    if (!T.is_sample) throw new Error(`'${tiem.slug}' KHÔNG phải tiệm mẫu — dừng.`);
    if (T.slug === CAM_DUNG) throw new Error(`'${CAM_DUNG}' bị cấm đụng — dừng.`);

    log(`── ${T.name} (${T.slug}) ──`);

    let themTaiKhoan = 0, themNguoi = 0, capNhat = 0;

    for (const n of tiem.doi) {
      const email = emailTuSdt(n.sdt, T.slug);
      const { id: uid, moi } = await taiKhoan({ email, ten: n.ten, sdt: n.sdt });
      uidsDaTao.push(uid);
      if (moi) themTaiKhoan++;

      // Tên hiển thị: trigger handle_new_user chỉ chạy lúc TẠO, nên người có sẵn
      // phải cập nhật riêng — nếu không màn Lịch hiện "—" thay vì tên.
      await c.query(
        `insert into public.profiles (user_id, display_name) values ($1, $2)
         on conflict (user_id) do update set display_name = excluded.display_name`,
        [uid, n.ten]);

      await c.query(
        `insert into public.tenant_members (tenant_id, user_id, role, status)
         values ($1, $2, $3, $4)
         on conflict (tenant_id, user_id) do update
           set role = excluded.role, status = excluded.status`,
        // `tenant_members.status` chỉ nhận 'active' | 'removed' (đã đo) — người
        // đã nghỉ việc bị gỡ khỏi tiệm, không có trạng thái "tạm ngưng".
        [T.id, uid, n.vai, n.nghi ? "removed" : "active"]);

      // Hồ sơ nhân sự, neo vào user_id (đã có chỉ mục duy nhất employees_user_unique).
      const { rows: cu } = await c.query(
        `select id from public.employees where tenant_id = $1 and user_id = $2`, [T.id, uid]);
      // Liệt kê tường minh, KHÔNG dùng Object.values(...): thứ tự khoá của đối
      // tượng mà lệch với thứ tự $n là ghi nhầm cột sang cột — hỏng im lặng.
      const giaTri = [
        T.id, uid,
        n.ten,
        n.sdt,
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
         (select count(*)::int from public.employees where tenant_id=$1 and user_id is null) mo_coi,
         (select count(*)::int from public.tenant_members where tenant_id=$1) thanh_vien`, [T.id]);

    bang.push({ slug: T.slug, ten: T.name, ...d, themTaiKhoan, themNguoi, capNhat });
    log(`  → tài khoản mới ${themTaiKhoan} · hồ sơ mới ${themNguoi} · cập nhật ${capNhat}\n`);
  }

  // ───────────────────────── BẢNG NGHIỆM THU ─────────────────────────
  log("═".repeat(96));
  log("TIỆM".padEnd(16) + "HỒ SƠ".padStart(7) + "ĐANG LÀM".padStart(10) +
      "CÓ TÀI KHOẢN".padStart(14) + "KHÔNG TÀI KHOẢN".padStart(17) + "THÀNH VIÊN".padStart(12));
  log("─".repeat(96));
  for (const b of bang) {
    log(b.slug.padEnd(16) + String(b.nguoi).padStart(7) + String(b.dang_lam).padStart(10) +
        String(b.co_tai_khoan).padStart(14) + String(b.mo_coi).padStart(17) +
        String(b.thanh_vien).padStart(12));
  }
  log("═".repeat(96));

  let hong = false;

  // ĐỐI CHỨNG 1 — hồ sơ không nối tài khoản thì hoa hồng KHÔNG BAO GIỜ tính tới,
  // và không có gì báo. Con số này khác 0 nghĩa là bộ nạp hỏng.
  const tongMoCoi = bang.reduce((s, b) => s + b.mo_coi, 0);
  log(`\nĐỐI CHỨNG 1 — hồ sơ KHÔNG nối tài khoản (phải = 0): ${tongMoCoi}`);
  if (tongMoCoi !== 0) { log("  ⚠️  HỎNG: những người này sẽ không bao giờ có hoa hồng."); hong = true; }

  // ĐỐI CHỨNG 2 — không tài khoản nào vừa tạo được đưa vào một tiệm THẬT.
  // Nếu lọt, nghĩa là ta vừa dựng người lạ trong nhà khách hàng.
  const { rows: [lot] } = await c.query(
    `select count(*)::int n from public.tenant_members m
       join public.tenants t on t.id = m.tenant_id
      where t.is_sample = false and m.user_id = any($1::uuid[])`, [uidsDaTao]);
  log(`ĐỐI CHỨNG 2 — tài khoản vừa tạo lọt vào tiệm THẬT (phải = 0): ${lot.n}`);
  if (lot.n !== 0) { log("  ⚠️  HỎNG: có người lạ trong tiệm của khách."); hong = true; }

  // ĐỐI CHỨNG 3 — tiệm spa phải y nguyên, không thừa không thiếu một dòng nào.
  const spaSau = await demSpa();
  const spaYNguyen = spaTruoc.nguoi === spaSau.nguoi && spaTruoc.thanh_vien === spaSau.thanh_vien;
  log(`ĐỐI CHỨNG 3 — ${CAM_DUNG} trước/sau: hồ sơ ${spaTruoc.nguoi}→${spaSau.nguoi} · ` +
      `thành viên ${spaTruoc.thanh_vien}→${spaSau.thanh_vien}  ${spaYNguyen ? "(y nguyên)" : "(ĐÃ ĐỔI)"}`);
  if (!spaYNguyen) { log("  ⚠️  HỎNG: đã giẫm vào tiệm spa."); hong = true; }

  if (hong) process.exitCode = 1;
}

/** Tra tài khoản theo email; chưa có thì tạo bằng Admin API. Trả về user id. */
async function taiKhoan({ email, ten, sdt }) {
  const { rows } = await c.query(`select id from auth.users where email = $1`, [email]);
  if (rows.length) return { id: rows[0].id, moi: false };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Demo!${Math.random().toString(36).slice(2, 10)}A9`,
    email_confirm: true,
    user_metadata: { display_name: ten, phone: sdt, must_change_password: true },
  });
  if (error) throw new Error(`Tạo tài khoản ${email} hỏng: ${error.message}`);
  return { id: data.user.id, moi: true };
}

async function demSpa() {
  const { rows: [r] } = await c.query(
    `select
       (select count(*)::int from public.employees e join public.tenants t on t.id=e.tenant_id where t.slug=$1) nguoi,
       (select count(*)::int from public.tenant_members m join public.tenants t on t.id=m.tenant_id where t.slug=$1) thanh_vien`,
    [CAM_DUNG]);
  return r;
}

main()
  .catch((e) => { console.error("HỎNG:", e.message); process.exitCode = 1; })
  .finally(() => c.end());
