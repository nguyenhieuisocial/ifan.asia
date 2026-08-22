/**
 * Sentry cho phần chạy ở TRÌNH DUYỆT.
 *
 * ⚠️ TÊN TỆP LÀ BẮT BUỘC. Next 16 chỉ nạp đúng `instrumentation-client.ts` ở
 *   gốc kho. Đặt tên khác (kể cả `sentry.client.config.ts` như tài liệu cũ của
 *   Sentry) thì tệp KHÔNG BAO GIỜ chạy — và không có lời cảnh báo nào. Nửa máy
 *   chủ vẫn gửi lỗi bình thường nên nhìn tưởng Sentry đang chạy tốt.
 */
import * as Sentry from "@sentry/nextjs";
import { CAU_HINH_CHUNG } from "@/lib/sentry-chung";

Sentry.init({
  ...CAU_HINH_CHUNG,
  /**
   * ⛔ CỐ Ý KHÔNG bật Session Replay (quay lại màn hình người dùng). Nó ghi cả
   *   nội dung màn — tên khách, số điện thoại, tin nhắn — tức là dữ liệu của
   *   tiệm rời khỏi Supabase đi sang máy chủ bên thứ ba. Muốn bật thì phải hỏi
   *   founder trước và phải che dữ liệu, không phải bật cho tiện.
   */
});

/** Sentry cần móc này để đo tốc độ chuyển màn. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
