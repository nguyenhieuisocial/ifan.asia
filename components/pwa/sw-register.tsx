"use client";

import { useEffect } from "react";

/**
 * Đăng ký service worker (task #50, PWA bước 2) — mount một lần ở khung gốc.
 * Đăng ký hỏng (trình duyệt cũ, chế độ ẩn danh chặn...) thì im lặng bỏ qua —
 * app vẫn chạy bình thường qua mạng, chỉ mất phần đọc-được-lúc-mất-mạng.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
