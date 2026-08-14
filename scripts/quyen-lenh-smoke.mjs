#!/usr/bin/env node
/**
 * Kiểm quyền lệnh bot Telegram (ADR-0017, task #135) — script Node THUẦN,
 * không cần dựng ứng dụng, không cần vitest/jest. Import thẳng
 * lib/telegram/quyen-lenh.ts vì Node 22 chạy được TypeScript thuần (đã thử
 * thật trước khi chọn hướng này — xem ADR-0017 mục 2).
 *
 * Sinh ra sau BA lỗ quyền liên tiếp trong một đêm (13-14/08), và một khoảng
 * trống bị nói thẳng trong nhật ký: "cả 399 ca rls-smoke.mjs đều canh tầng
 * CSDL — không có ca nào canh tầng route". File này bịt đúng khoảng trống đó
 * cho lệnh bot Telegram.
 */
import {
  BANG_LENH,
  chuanHoaLenh,
  danhSachLenh,
  duocGoi,
} from "../lib/telegram/quyen-lenh.ts";

let failed = 0;
let nCheck = 0;
const STATIC_CHECKS = 22; // 3(ca1)+3(ca2)+4(ca3)+1(ca4)+3(ca5)+7(ca6)+1(ca7) — cập nhật khi đổi số lệnh
const check = (name, cond, detail = "") => {
  nCheck++;
  if (cond) {
    console.log(`  PASS ${nCheck}/${STATIC_CHECKS} ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${nCheck}/${STATIC_CHECKS} ${name}${detail ? " — " + detail : ""}`);
  }
};

const TEN_LENH = Object.keys(BANG_LENH);
const LENH_CHI_CHU_DU_AN = TEN_LENH.filter((t) => BANG_LENH[t].chiChuDuAn);
const LENH_CONG_KHAI = TEN_LENH.filter((t) => !BANG_LENH[t].chiChuDuAn);

console.log("[quyen-lenh-smoke] Quyền lệnh bot Telegram (ADR-0017, task #135):");

// Ca 1 — mỗi lệnh CHỈ CHỦ DỰ ÁN: người thường phải bị từ chối.
for (const lenh of LENH_CHI_CHU_DU_AN) {
  check(`Ca 1: "${lenh}" (chỉ chủ dự án) — người thường bị từ chối`,
    duocGoi(lenh, false) === false, `duocGoi("${lenh}", false) = ${duocGoi(lenh, false)}`);
}

// Ca 2 — đối chứng: đúng các lệnh đó, chủ dự án PHẢI được gọi.
for (const lenh of LENH_CHI_CHU_DU_AN) {
  check(`Ca 2 (đối chứng): "${lenh}" — chủ dự án được gọi`,
    duocGoi(lenh, true) === true, `duocGoi("${lenh}", true) = ${duocGoi(lenh, true)}`);
}

// Ca 3 — lệnh công khai: người thường PHẢI được gọi (không siết nhầm).
for (const lenh of LENH_CONG_KHAI) {
  check(`Ca 3: "${lenh}" (công khai) — người thường được gọi`,
    duocGoi(lenh, false) === true, `duocGoi("${lenh}", false) = ${duocGoi(lenh, false)}`);
}

// Ca 4 — mặc định TỪ CHỐI: lệnh không có trong bảng.
{
  const la = chuanHoaLenh("/khong-ton-tai");
  check("Ca 4: lệnh không có trong BANG_LENH → chuanHoaLenh trả null (mặc định từ chối)",
    la === null, `chuanHoaLenh("/khong-ton-tai") = ${la}`);
}

// Ca 5 — ĐÂY LÀ CA BẮT ĐÚNG MÂU THUẪN ĐÃ SỐNG THẬT (lệnh /trangthai từng vừa
// bị chặn vừa được quảng cáo trong /help — ADR-0017 mục 1). Bảng /help cho
// người thường KHÔNG được chứa bất kỳ lệnh chiChuDuAn nào.
{
  const bangNguoiThuong = danhSachLenh(false);
  for (const lenh of LENH_CHI_CHU_DU_AN) {
    check(`Ca 5: bảng /help cho người thường KHÔNG chứa "${lenh}" (chỉ chủ dự án)`,
      !bangNguoiThuong.includes(lenh), bangNguoiThuong);
  }
}

// Ca 6 — bảng /help cho chủ dự án phải chứa ĐỦ mọi lệnh trong BANG_LENH.
{
  const bangChuDuAn = danhSachLenh(true);
  for (const lenh of TEN_LENH) {
    check(`Ca 6: bảng /help cho chủ dự án CÓ "${lenh}"`,
      bangChuDuAn.includes(lenh), bangChuDuAn);
  }
}

// Ca 7 — mọi lệnh route.ts thật sự xử lý (đọc trực tiếp từ mã nguồn, không
// chép tay danh sách — chép tay là tự tạo hai nguồn sự thật, đúng lỗi vừa vá)
// đều phải có mặt trong BANG_LENH. Bắt được nếu route.ts thêm nhánh xử lý cho
// một lệnh mà quên khai quyền — dù đây là ca chạy-thời-gian, nó vẫn là lưới
// đỡ thứ hai bên cạnh chốt kiểu dữ liệu lúc biên dịch (ADR-0017 mục 4).
{
  const { readFileSync } = await import("node:fs");
  const routePath = new URL("../app/api/telegram/webhook/route.ts", import.meta.url);
  const src = readFileSync(routePath, "utf8");
  const found = new Set(
    [...src.matchAll(/command === "(\/[a-z]+)"/g)].map((m) => m[1]),
  );
  const chuaKhai = [...found].filter((lenh) => !Object.hasOwn(BANG_LENH, lenh));
  check("Ca 7: mọi lệnh route.ts so khớp (command === \"/...\") đều có trong BANG_LENH",
    chuaKhai.length === 0, `chưa khai: ${JSON.stringify(chuaKhai)}`);
}

if (failed) {
  console.error(`[quyen-lenh-smoke] ${failed} kiểm tra FAIL`);
  process.exit(1);
}
console.log("[quyen-lenh-smoke] TẤT CẢ PASS.");
