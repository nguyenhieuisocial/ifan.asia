"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Nút lùi dùng chung cho các màn chi tiết (khách hàng / cơ hội / công ty).
 *
 * Trước đây các nút này là Link cứng về màn danh sách: từ Tổng quan bấm vào một
 * khách rồi bấm ← lại rơi sang danh sách Khách hàng — mất chỗ đang đứng, mất bộ
 * lọc, và trên điện thoại thì lệch hẳn với thao tác vuốt-cạnh. router.back()
 * quay về ĐÚNG màn vừa đứng; chỉ khi không có gì để lùi (mở thẳng bằng link ở
 * tab mới) mới về `fallbackHref`.
 */
export function BackButton({
  fallbackHref,
  ariaLabel,
  className,
  children,
}: {
  /** Đích lùi khi tab mở thẳng màn này, không có trang trước trong lịch sử. */
  fallbackHref: string;
  /** Bắt buộc truyền khi nút chỉ có mũi tên (không có chữ). */
  ariaLabel?: string;
  className?: string;
  /** Nhãn chữ đứng cạnh mũi tên; bỏ trống thì thành nút icon vuông. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size={children ? "sm" : "icon"}
      aria-label={ariaLabel}
      className={className}
      onClick={() => {
        // history.length === 1 = tab này chưa từng ở trang nào khác → không có
        // gì để lùi, back() sẽ đứng im. Về màn danh sách cho có lối ra.
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ArrowLeft />
      {children}
    </Button>
  );
}
