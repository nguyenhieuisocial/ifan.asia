"use client";

import { useEffect } from "react";

/**
 * Đăng ký service worker (task #50, PWA bước 2) — mount một lần ở khung gốc.
 * Đăng ký hỏng (trình duyệt cũ, chế độ ẩn danh chặn...) thì im lặng bỏ qua —
 * app vẫn chạy bình thường qua mạng, chỉ mất phần đọc-được-lúc-mất-mạng.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG CÀI KHI CHẠY MÁY THỬ — sự cố 19/08/2026
 * ═══════════════════════════════════════════════════════════════════
 * `public/sw.js` giữ mã và kiểu dáng theo kiểu "có trong đệm thì dùng luôn,
 * không hỏi lại máy chủ". Điều đó AN TOÀN ở bản thật, vì tên tệp mang mã băm
 * nội dung: sửa code ⇒ tên đổi ⇒ là một địa chỉ khác.
 *
 * Ở MÁY THỬ thì ngược lại: tên tệp giữ nguyên còn ruột đổi mỗi lần sửa code.
 * Kết quả đo được ngày 19/08: trình duyệt ăn tệp kiểu dáng **của một tuần
 * trước** (140 KB đề ngày 12/08, trong khi máy chủ trả 152 KB của hôm nay),
 * bộ đệm giữ 95 tệp cũ. Máy chủ dựng trang bằng code mới, trình duyệt chạy
 * code cũ ⇒ mọi trang Cài đặt ném lỗi lệch, và cột trái 186px phình thành
 * 1040px.
 *
 * Tốn kém hơn cả cái lỗi là thứ nó gây ra cho người đang sửa: **ba lần trong
 * một ngày suýt báo lỗi sai** vì đang nhìn bản cũ mà tưởng là bản mới.
 *
 * ⚠️ Chỉ "không cài nữa" là CHƯA ĐỦ. Máy nào đã lỡ cài thì bản cũ vẫn nằm đó
 * và vẫn phục vụ mã cũ mãi — nên phải TỰ GỠ và xoá sạch đệm. Không có phần
 * đó thì bản vá này vô hình với đúng những máy đang bị.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void goSachBanDaCai();
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

/**
 * Gỡ mọi bản đã cài + xoá các đệm mang tên `ifan-*`.
 *
 * Nuốt lỗi có chủ đích: đây là việc dọn dẹp ở máy người phát triển, hỏng thì
 * cùng lắm là vẫn còn đệm cũ — không được phép làm gãy màn hình đang mở.
 */
async function goSachBanDaCai() {
  try {
    const dsBanCai = await navigator.serviceWorker.getRegistrations();
    await Promise.all(dsBanCai.map((r) => r.unregister()));

    if ("caches" in window) {
      const ten = await caches.keys();
      await Promise.all(ten.filter((k) => k.startsWith("ifan-")).map((k) => caches.delete(k)));
    }
  } catch {
    // im lặng — xem chú thích trên
  }
}
