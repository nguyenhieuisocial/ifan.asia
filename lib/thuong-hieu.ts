/**
 * THƯƠNG HIỆU TIỆM — tám màu đã duyệt (thẻ `man-thuong-hieu-tiem`, #334).
 *
 * ⚠️ TÁM MÀU CHỌN SẴN, KHÔNG CHO CHỌN MÀU TỰ DO — và đây là quyết định bảo vệ
 *   người dùng, không phải để làm nhanh. Bảng chọn tự do nghe rộng rãi hơn,
 *   nhưng hậu quả thật là: có tiệm sẽ chọn vàng nhạt, nút "Đặt lịch" thành chữ
 *   trắng trên nền vàng nhạt, và KHÁCH CỦA HỌ không đọc nổi nút — mà chính họ
 *   cũng không biết, vì trên màn của họ nhìn vẫn "đẹp".
 *
 * ⚠️ MỌI MÀU Ở ĐÂY ĐÃ ĐO TƯƠNG PHẢN VỚI CHỮ TRẮNG ≥ 4.5:1 (WCAG AA). Thêm màu
 *   mới thì PHẢI đo lại — cổng `soat-tuong-phan.mjs` canh đúng chuyện đó. Đừng
 *   thêm màu vì "nhìn hợp mắt": hợp mắt trên màn của người thêm, không phải
 *   trên điện thoại giữa nắng của khách.
 *
 * ⚠️ Kho dữ liệu lưu MÃ MÀU ("xanh-ngoc"), không lưu hex. Lưu hex thì ai gõ
 *   thẳng vào kho là lách được cả bảng này.
 */

export const MA_MAU = [
  "cam",
  "xanh-ngoc",
  "xanh-duong",
  "tim",
  "hong",
  "do",
  "xanh-la",
  "nau",
] as const;

export type MaMau = (typeof MA_MAU)[number];

/** Nền đậm (chữ trắng đặt lên trên) và nền nhạt (dải trang trí). */
export const MAU: Record<MaMau, { dam: string; nhat: string }> = {
  cam: { dam: "#C94C18", nhat: "#fde9dc" },
  "xanh-ngoc": { dam: "#0f766e", nhat: "#ccfbf1" },
  "xanh-duong": { dam: "#1d4ed8", nhat: "#dbeafe" },
  tim: { dam: "#6d28d9", nhat: "#ede9fe" },
  hong: { dam: "#be185d", nhat: "#fce7f3" },
  do: { dam: "#b91c1c", nhat: "#fee2e2" },
  "xanh-la": { dam: "#15803d", nhat: "#dcfce7" },
  nau: { dam: "#78350f", nhat: "#f5e6d8" },
};

export function laMaMau(x: unknown): x is MaMau {
  return typeof x === "string" && (MA_MAU as readonly string[]).includes(x);
}

/** Không chọn màu ⇒ dùng màu iFan. */
export function mauCua(ma: string | null | undefined): { dam: string; nhat: string } {
  return laMaMau(ma) ? MAU[ma] : MAU.cam;
}

/**
 * Hai chữ cái đầu của tên tiệm — dùng khi CHƯA có logo, và cũng dùng khi logo
 * hỏng. Ảnh có thể bị xoá khỏi kho lúc nào không biết; một ô ảnh vỡ trên trang
 * khách nhìn thì tệ hơn hẳn hai chữ cái.
 */
export function chuVietTat(ten: string): string {
  const tu = ten.trim().split(/\s+/).filter(Boolean);
  if (tu.length === 0) return "?";
  if (tu.length === 1) return tu[0].slice(0, 2).toUpperCase();
  return (tu[0][0] + tu[tu.length - 1][0]).toUpperCase();
}
