/**
 * KHOÁ CỦA ĐẨY THÔNG BÁO (Web Push / VAPID).
 *
 * Web Push cần một CẶP khoá:
 *   · khoá CÔNG KHAI — trình duyệt cần nó để đăng ký; nó nằm trong mã chạy ở
 *     máy người dùng, ai cũng đọc được, và điều đó hoàn toàn bình thường;
 *   · khoá BÍ MẬT — chỉ máy chủ giữ, dùng để ký từng lần đẩy.
 *
 * ⚠️ Khoá công khai để THẲNG TRONG MÃ, cố ý. Nó công khai theo thiết kế, nó
 *   không bao giờ đổi, và để nó thành biến môi trường nghĩa là thêm một thứ
 *   nữa phải khai đúng ở mọi nơi — mà khai thiếu thì đăng ký thông báo hỏng
 *   im lặng. Một thứ ít phải khai là một chỗ ít sai.
 *
 * ⚠️ Khoá bí mật thì KHÔNG BAO GIỜ được vào mã. Nó ở biến môi trường
 *   `VAPID_PRIVATE_KEY`. Thiếu nó thì đẩy thông báo KHÔNG chạy — và màn hình
 *   phải NÓI RA điều đó thay vì bày một cái công tắc không làm gì.
 *
 * Đổi cặp khoá = mọi thiết bị đã đăng ký phải đăng ký lại. Chỉ đổi khi khoá bí
 * mật thật sự lộ.
 */

/** Khoá công khai VAPID. Công khai theo thiết kế — xem ghi chú ở trên. */
export const VAPID_CONG_KHAI =
  "BDOHdGl60jHs_V2tSV6M-lJJfdON78agTOIVeMs8gEIhKNy5GuuiipLdYy7iYWqg4UqjMfgWCXjuHBhp5A4cOlE";

/**
 * Địa chỉ liên hệ gửi kèm mỗi lần đẩy — chuẩn VAPID bắt buộc có, để nhà cung
 * cấp dịch vụ đẩy (Google, Apple, Mozilla) liên hệ được nếu có sự cố.
 */
export const VAPID_LIEN_HE = "mailto:hello@ifan.asia";

/** Khoá bí mật đã khai chưa — dùng ở máy chủ để màn hình nói đúng sự thật. */
export function coKhoaBiMat(): boolean {
  return Boolean(process.env.VAPID_PRIVATE_KEY);
}
