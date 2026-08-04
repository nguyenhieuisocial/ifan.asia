"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Màn Tổng quan tự lấy lại số mỗi phút — chủ tiệm để màn hình mở cả ngày vẫn
 * thấy số mới mà không phải bấm tải lại. Không vẽ gì ra màn hình (giờ cập nhật
 * do server render, tránh lệch giữa server và trình duyệt).
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
