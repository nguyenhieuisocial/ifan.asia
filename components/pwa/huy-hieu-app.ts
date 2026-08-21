"use client";

/**
 * HUY HIỆU TRÊN BIỂU TƯỢNG APP — con số nhỏ trên góc icon ở màn hình chính.
 *
 * Đây là thứ khiến một app đã cài "sống" khi người ta không mở nó: liếc màn
 * hình chính là biết có việc mới hay không, không cần mở ra xem. Chuông trong
 * ứng dụng chỉ nói được với người ĐANG mở ứng dụng.
 *
 * ⚠️ Chỉ chạy khi app ĐÃ CÀI lên màn hình chính. Trên tab trình duyệt thường
 *   thì `setAppBadge` hoặc không có, hoặc có mà không hiện ở đâu cả — không
 *   phải lỗi, chỉ là không có chỗ để hiện.
 *
 * ⚠️ NUỐT LỖI CÓ CHỦ ĐÍCH. Huy hiệu là thứ làm cho tốt hơn; hỏng thì cùng lắm
 *   là không có số trên icon. Để nó ném lỗi ra ngoài là đổi một thứ phụ lấy
 *   nguy cơ làm gãy chuông thông báo — thứ chính.
 *
 * ⚠️ Số 0 phải GỠ huy hiệu chứ không đặt "0". Đặt 0 thì vài hệ điều hành vẫn
 *   vẽ một chấm — và một chấm không bao giờ tắt là thứ khiến người ta thôi
 *   nhìn vào nó.
 */
export function datHuyHieu(soChuaDoc: number) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (soChuaDoc > 0) void nav.setAppBadge?.(soChuaDoc)?.catch(() => {});
    else void nav.clearAppBadge?.()?.catch(() => {});
  } catch {
    // xem ghi chú "nuốt lỗi có chủ đích" ở trên
  }
}
