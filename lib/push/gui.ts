import "server-only";
import webpush from "web-push";
import { VAPID_CONG_KHAI, VAPID_LIEN_HE, coKhoaBiMat } from "./khoa";

/**
 * GỬI MỘT THÔNG BÁO ĐẨY tới một thiết bị.
 *
 * ⚠️ Trả về kết quả CÓ PHÂN LOẠI, không phải true/false. Ba tình huống khác
 *   nhau hẳn nhau và phải xử khác nhau:
 *     · `ok`      — gửi được
 *     · `bo`      — thiết bị không còn nữa (404/410): người ta đã gỡ ứng dụng
 *                   hoặc xoá dữ liệu trình duyệt ⇒ XOÁ đăng ký, đừng gửi lại
 *                   mãi mãi
 *     · `hong`    — trục trặc tạm (mạng, dịch vụ đẩy quá tải) ⇒ giữ lại, thử
 *                   lần sau
 *   Gộp `bo` và `hong` làm một thì hoặc là xoá nhầm thiết bị còn tốt, hoặc là
 *   giữ mãi những thiết bị đã chết và mỗi nhịp lại gửi hỏng thêm một lần.
 */
export type KetQuaDay = "ok" | "bo" | "hong";

export type DangKyDay = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type NoiDungDay = {
  title: string;
  body: string;
  /** Đường dẫn trong ứng dụng để mở khi người ta bấm vào thông báo. */
  link: string;
  /**
   * Gom nhóm: hai thông báo cùng `nhom` thì cái sau ĐÈ cái trước trên màn hình
   * thay vì xếp chồng. Dùng mã kênh / mã buổi hẹn — mười tin trong một kênh
   * chỉ nên là một dòng thông báo, không phải mười.
   */
  nhom?: string;
};

let daKhai = false;

function khaiKhoa() {
  if (daKhai) return;
  const biMat = process.env.VAPID_PRIVATE_KEY;
  if (!biMat) throw new Error("thieu_khoa_bi_mat");
  webpush.setVapidDetails(VAPID_LIEN_HE, VAPID_CONG_KHAI, biMat);
  daKhai = true;
}

export async function guiMotDay(
  dangKy: DangKyDay,
  noiDung: NoiDungDay,
): Promise<KetQuaDay> {
  if (!coKhoaBiMat()) return "hong";
  khaiKhoa();

  try {
    await webpush.sendNotification(
      {
        endpoint: dangKy.endpoint,
        keys: { p256dh: dangKy.p256dh, auth: dangKy.auth },
      },
      JSON.stringify(noiDung),
      // Thông báo của tiệm chỉ có nghĩa trong ngày. Để dịch vụ đẩy giữ hàng
      // tuần rồi dội về một lúc là làm phiền chứ không giúp gì.
      { TTL: 6 * 3600 },
    );
    return "ok";
  } catch (e) {
    const ma = (e as { statusCode?: number }).statusCode;
    // 404 = địa chỉ không còn · 410 = đăng ký đã bị thu hồi.
    if (ma === 404 || ma === 410) return "bo";
    return "hong";
  }
}
