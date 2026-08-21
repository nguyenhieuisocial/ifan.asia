"use client";

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
