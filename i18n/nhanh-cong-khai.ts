/**
 * NHÁNH CÂU CHỮ ĐƯỢC GỬI CHO KHÁCH LẠ.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY — ĐO ĐƯỢC 22/08
 * ═══════════════════════════════════════════════════════════════════
 * Khung gốc trao TOÀN BỘ kho câu chữ cho trình duyệt, nên MỌI trang — kể cả
 * trang giới thiệu mà khách lạ ghé — đều cõng theo chữ của 44 màn chỉ dùng sau
 * khi đăng nhập:
 *
 *     tổng kho câu chữ      259 KB
 *     phần công khai cần     40 KB
 *     phần thừa            219 KB   ← gửi cho người không bao giờ dùng tới
 *
 * Đo trên bản thật: trang Bảng giá nặng 342 KB chữ thô, và trong đó có cả câu
 * "Đăng xuất khỏi mọi thiết bị khác" — một câu chỉ có nghĩa sau khi đăng nhập.
 *
 * ⚠️ ĐÂY LÀ DANH SÁCH CHO PHÉP, KHÔNG PHẢI DANH SÁCH CẤM. Thêm một nhánh mới mà
 *   quên khai ở đây thì trang công khai hiện MÃ MÁY thay vì tiếng Việt — nên có
 *   cổng `soat-nhanh-cong-khai.mjs` canh đúng chuyện đó.
 *
 * ⚠️ Trang sau đăng nhập (`/app`) và khu quản trị (`/admin`) tự bọc lại bằng
 *   một lớp mang ĐỦ kho chữ. Chúng chỉ mở cho người đã đăng nhập, nên phần nặng
 *   nằm đúng chỗ có người dùng tới nó.
 */
export const NHANH_CONG_KHAI = [
  "common",
  "errors",
  "metadata",
  "pwa",
  "landing",
  "tinhNang",
  "loTrinh",
  "bangGia",
  "nganh",
  "auth",
  "passkey",
  "legal",
  "storefront",
  "share",
  "time",
  "csat",
  "reportShare",
  // `seed` — màn báo cáo chia sẻ bằng đường dẫn (`/bc/[token]`) mở công khai và
  // có gọi tới nhánh này. Thiếu nó thì màn đó hiện mã máy cho người nhận link.
  "seed",
] as const;

/** Lọc kho câu chữ xuống còn phần công khai. */
export function locNhanhCongKhai(
  tatCa: Record<string, unknown>,
): Record<string, unknown> {
  const ra: Record<string, unknown> = {};
  for (const k of NHANH_CONG_KHAI) {
    if (k in tatCa) ra[k] = tatCa[k];
  }
  return ra;
}
