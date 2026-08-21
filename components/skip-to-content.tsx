"use client";

import { useTranslations } from "next-intl";

/**
 * LIÊN KẾT "BỎ QUA ĐIỀU HƯỚNG" — yêu cầu bắt buộc của WCAG 2.2 (2.4.1).
 *
 * Người đi bằng bàn phím hoặc trình đọc màn hình phải lướt qua TOÀN BỘ thanh
 * điều hướng ở mọi trang trước khi tới nội dung. Ở màn có cột trái nhiều mục
 * thì đó là hàng chục lần nhấn Tab — mỗi lần đổi trang.
 *
 * ⚠️ ẨN nhưng KHÔNG ĐƯỢC `display:none` hay `visibility:hidden`. Hai cách đó
 *   gỡ phần tử khỏi thứ tự tiêu điểm, nên liên kết vĩnh viễn không bao giờ
 *   nhận được Tab — tức là có cũng như không. Cách đúng là đẩy nó ra ngoài màn
 *   rồi kéo về khi được chọn.
 *
 * ⚠️ Đích nhảy tới phải là một phần tử NHẬN ĐƯỢC tiêu điểm. Thẻ `<main>` thường
 *   không nhận, nên nhảy tới sẽ cuộn màn mà tiêu điểm vẫn nằm nguyên chỗ cũ —
 *   trình đọc màn hình tiếp tục đọc thanh điều hướng, đúng thứ ta đang tránh.
 *   Vì vậy bấm xong thì tự đặt `tabindex="-1"` cho đích rồi trao tiêu điểm.
 */
export function SkipToContent() {
  const t = useTranslations("common");
  return (
    <a
      href="#noi-dung-chinh"
      onClick={(e) => {
        const dich = document.getElementById("noi-dung-chinh");
        if (!dich) return;
        e.preventDefault();
        dich.setAttribute("tabindex", "-1");
        dich.focus();
        dich.scrollIntoView({ block: "start" });
      }}
      className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]"
    >
      {t("skipToContent")}
    </a>
  );
}
