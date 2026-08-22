"use client";

import * as Sentry from "@sentry/nextjs";

/**
 * Gửi một lời báo lỗi lên máy chủ.
 *
 * ⚠️ DÙNG `sendBeacon` TRƯỚC. Lỗi thường xảy ra ngay trước lúc người dùng đóng
 *   tab hoặc chuyển trang, và một lời `fetch` bình thường sẽ bị huỷ giữa chừng
 *   — tức là đúng những lỗi tệ nhất lại là những lỗi không bao giờ về tới nơi.
 *   `sendBeacon` được trình duyệt cam kết gửi nốt kể cả khi trang đang đóng.
 *
 * ⚠️ TỰ NÓ KHÔNG ĐƯỢC NÉM LỖI. Nó chạy trên đường xử lý một lỗi đã xảy ra; ném
 *   thêm một lỗi ở đây là nuốt mất lỗi gốc.
 */
export function baoLoiLenMayChu(loi: unknown, them?: { duongDan?: string }) {
  /**
   * ⚠️ GỬI SANG SENTRY TRƯỚC, ở NGAY ĐÂY chứ không ở đâu khác.
   *
   *   Sentry tự bắt được lỗi `window.onerror` và lời hứa bị bỏ rơi. Nhưng lỗi
   *   rơi vào LƯỚI ĐỠ của React (`app/error.tsx`) thì React NUỐT trước khi tới
   *   trình duyệt — Sentry không bao giờ thấy. Đó lại đúng là nhóm lỗi hay gặp
   *   nhất của kho này: hỏng lúc tải mảnh mã (chunk) sau khi lên bản mới.
   *
   *   Đặt ở hàm dùng chung này thay vì rải vào từng màn lỗi: một lời báo lỗi đi
   *   MỘT đường, tới HAI nơi — sổ trong app (chuông báo cho founder) và Sentry
   *   (vết gọi hàm đọc được). Thêm màn lỗi mới thì tự động có cả hai.
   *
   *   Bọc riêng một `try`: Sentry hỏng cũng không được làm mất lời báo về sổ.
   */
  try {
    Sentry.captureException(loi);
  } catch {
    /* im lặng — xem ghi chú đầu file */
  }

  try {
    const e = loi as Error | undefined;
    const than = JSON.stringify({
      loi: String(e?.message ?? loi ?? "").slice(0, 500),
      vet: String(e?.stack ?? "").slice(0, 3000),
      duongDan: them?.duongDan ?? window.location.pathname,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/loi", new Blob([than], { type: "application/json" }));
      return;
    }
    // Đường lùi cho trình duyệt cũ. `keepalive` để lượt gửi sống qua lúc rời trang.
    void fetch("/api/loi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: than,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* cố ý im lặng — xem ghi chú đầu file */
  }
}
