/**
 * Cổng: BẬT CHỤP ẢNH mà HEADER CÒN CHẶN CAMERA thì đỏ.
 *
 * ⚠️ LỖI CÓ THẬT, tìm được 22/08 — và là loại tệ nhất trong họ "im lặng".
 *   Tính năng chụp ảnh chấm công ra bản ngày 20/08 với ĐỦ mọi thứ: màn hình,
 *   nút bấm, chỗ lưu, chốt quyền xem, cả phần đóng dấu vị trí và giờ lên ảnh.
 *   Nhìn vào thấy xong hẳn.
 *
 *   Nhưng `next.config.ts` gửi kèm mỗi trang một dòng `Permissions-Policy:
 *   camera=()` — chặn camera HOÀN TOÀN, kể cả chính iFan. Trình duyệt từ chối
 *   ngay khi mã hỏi camera. Tính năng **chưa từng chạy được lần nào**.
 *
 *   Không ai biết suốt hai ngày, vì công tắc "bắt chụp ảnh" mặc định TẮT ở mọi
 *   tiệm — nên chưa ai chạm tới nó. Ngày bật lên mới lộ.
 *
 * ⚠️ VÌ SAO CẦN CỔNG RIÊNG: hai thứ này nằm ở HAI TẦNG KHÁC HẲN NHAU — một bên
 *   là cấu hình máy chủ, một bên là công tắc trong cơ sở dữ liệu của từng tiệm.
 *   Không cổng nào nhìn cả hai cùng lúc, và cả hai đều "đúng" khi xét riêng.
 *
 * Cổng đọc HEADER THẬT từ máy chủ đang chạy, không đọc file cấu hình — vì thứ
 * quyết định là cái trình duyệt nhận được, không phải cái ta viết ra.
 */
const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://127.0.0.1:3000";

let loi = 0;
const bao = (ok, ten, them = "") => {
  if (!ok) loi++;
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${them ? " — " + them : ""}`);
};

const r = await fetch(NEN + "/", { redirect: "manual" }).catch((e) => ({ loi: e.message }));
if (r.loi) {
  console.error(`❌ Không gọi được ${NEN}: ${r.loi}`);
  process.exit(1);
}
const pp = r.headers.get("permissions-policy") ?? "";
bao(pp.length > 0, "máy chủ có gửi Permissions-Policy", pp || "(trống)");

// `camera=()` = chặn tất. `camera=(self)` = cho chính trang này.
const chanHet = /camera=\(\s*\)/.test(pp);
bao(!chanHet, "camera KHÔNG bị chặn hoàn toàn", chanHet ? "đang là camera=() — màn chấm công sẽ chết câm" : pp.match(/camera=\([^)]*\)/)?.[0] ?? "");

// Micro thì PHẢI còn chặn — không màn nào cần, mở ra là nới quyền không lý do.
bao(/microphone=\(\s*\)/.test(pp), "micro vẫn bị chặn (không màn nào cần)");

console.log(loi === 0 ? "\nXANH" : `\nĐỎ: ${loi} mục`);
process.exit(loi === 0 ? 0 : 1);
