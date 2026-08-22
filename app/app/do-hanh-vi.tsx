"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";

/**
 * ĐO HÀNH VI NGƯỜI DÙNG — chỉ trong khu ĐÃ ĐĂNG NHẬP.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ, VÀ VÌ SAO CHỈ Ở ĐÂY
 * ═══════════════════════════════════════════════════════════════════
 * Trước 22/08 iFan **không đo được gì**. Mọi câu kiểu "màn này ít người dùng"
 * trong mọi tài liệu đều là **suy đoán**, không phải số liệu — đã ghi vào bảng
 * mẫu số mục C3. Quyết định về giao diện dựa trên cảm giác là cách chắc nhất để
 * bỏ công vào đúng chỗ không ai cần.
 *
 * ⚠️ CỐ Ý KHÔNG ĐẶT Ở TRANG CÔNG KHAI. Đo được ba lý do:
 *   1. Đo bằng trình duyệt 22/08: khách lạ vào trang chủ iFan **không dính một
 *      cookie nào**. Cắm công cụ đo vào đó là tự tay phá mất điều đó, và kéo
 *      theo cả một dải xin phép cookie mà hôm nay chưa cần.
 *   2. Câu hỏi thật sự cần trả lời là *"chủ tiệm dùng màn nào"* — câu đó chỉ
 *      trả lời được ở khu đã đăng nhập.
 *   3. Người đã đăng nhập vốn đã có một vé phiên; thêm phần đo ở đây không đổi
 *      bản chất quan hệ, còn ở trang công khai thì có.
 *
 * ⚠️ KHÔNG có khoá thì KHÔNG chạy gì — và CSP cũng không được nới (xem
 *   `lib/security/csp.ts`). Nửa vời ở đây nghĩa là trình duyệt chặn một lời gọi
 *   ra ngoài mỗi lượt tải trang, im lặng, mãi mãi.
 */
export function DoHanhVi({ userId, tenantId }: { userId?: string; tenantId?: string }) {
  const duongDan = usePathname();

  /**
   * ⚠️ MỘT effect duy nhất cho cả nạp – gắn danh tính – gửi lượt xem. Bản đầu
   *   tách làm hai và chặn lượt gửi bằng `if (!posthog.__loaded) return` — lúc
   *   effect thứ hai chạy thì thư viện CHƯA nạp xong, nên điều kiện đó chặn
   *   đúng lượt xem đầu tiên; và vì đường dẫn không đổi sau đó, nó **không bao
   *   giờ gửi gì cả**.
   *
   *   Đo được bằng trình duyệt: thư viện tải về, gọi được `/flags/`, nhưng
   *   KHÔNG có một lượt gửi sự kiện nào — và bảng PostHog nhận 0 sự kiện. Nhìn
   *   từ ngoài thì mọi thứ trông như đang chạy.
   *
   *   Đúng họ lỗi với camera và micro cùng ngày: có đủ mảnh, thiếu đúng một
   *   mắt xích, và im lặng tuyệt đối.
   */
  useEffect(() => {
    const khoa = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!khoa || !duongDan) return;

    if (!posthog.__loaded) {
      posthog.init(khoa, {
        api_host: "https://us.i.posthog.com",
        // ⚠️ TỰ GỬI lượt xem trang, không để thư viện tự bắt. Next chuyển trang
        //   KHÔNG tải lại tài liệu, nên bộ bắt tự động chỉ thấy đúng lượt đầu —
        //   và mọi con số "màn nào hay dùng" sẽ sai theo hướng ai cũng chỉ mở
        //   đúng một màn.
        capture_pageview: false,
        capture_pageleave: true,
        // ⚠️ KHÔNG ghi hình phiên. Màn hình của chủ tiệm có tên, số điện thoại,
        //   tiền của khách — quay lại là gom một kho dữ liệu cá nhân mà không
        //   ai xin phép. Muốn bật phải là một quyết định riêng, có che dữ liệu.
        disable_session_recording: true,
        mask_all_element_attributes: true,
        mask_all_text: true,
      });
    }

    if (userId) {
      // Gắn danh tính để trả lời được "một người dùng bao nhiêu màn", không chỉ
      // "bao nhiêu lượt xem". `tenant_id` để tách theo tiệm.
      posthog.identify(userId, tenantId ? { tenant_id: tenantId } : undefined);
    }

    /**
     * ⚠️ GỬI ĐƯỜNG DẪN ĐÃ LÀM SẠCH, không gửi nguyên bản.
     *   Đường dẫn trong iFan có mã bản ghi (`/app/contacts/<mã khách>`). Gửi
     *   nguyên là đẩy mã định danh của khách hàng THẬT sang một dịch vụ ngoài,
     *   và mỗi màn lại thành hàng nghìn "trang" khác nhau nên không thống kê nổi.
     */
    const sach = duongDan
      .split("/")
      .map((d) => (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(d) || /^\d+$/.test(d) ? ":id" : d))
      .join("/");
    posthog.capture("$pageview", { $current_url: sach, man: sach });
  }, [duongDan, userId, tenantId]);

  return null;
}
