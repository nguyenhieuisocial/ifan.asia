import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Chuyển động cuộn kiểu ĐÚNG cho landing: nội dung LUÔN hiển thị sẵn trong
 * markup (không opacity-0 — bài học 11/08: máy chụp/bot/không-JS từng thấy
 * trang trắng). Chuyển động do CSS scroll-driven (.scroll-rise,
 * animation-timeline: view()) đảm nhiệm, nằm trong @supports +
 * prefers-reduced-motion ở globals.css — trình duyệt không hỗ trợ hoặc user
 * tắt chuyển động thì trang tĩnh, fallback im lặng, không cần JS.
 *
 * `delay` (ms — giữ chữ ký cũ để không sửa call site) quy đổi thành mốc bắt
 * đầu animation-range (--rise-start) để các thẻ cùng hàng vào so le.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  // 80ms ≈ 10% quãng entry; chặn 32% để mốc kết thúc (+55%) không vượt 87%
  const start = Math.min(Math.round(delay / 8), 32);
  return (
    <div
      className={cn("scroll-rise", className)}
      style={
        start
          ? ({ "--rise-start": `${start}%` } as CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}
