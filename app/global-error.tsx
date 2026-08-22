"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * LƯỚI ĐỠ CUỐI CÙNG — khi chính khung gốc (`app/layout.tsx`) hỏng.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO TỆP NÀY KHÔNG GIỐNG BẤT KỲ MÀN NÀO KHÁC
 * ═══════════════════════════════════════════════════════════════════
 * Nó THAY THẾ cả khung gốc, nên phải TỰ VIẾT `<html>` và `<body>`. Và vì khung
 * gốc đã hỏng, nó KHÔNG được dùng bất cứ thứ gì khung đó cung cấp:
 *
 *   ⚠️ KHÔNG dùng `useTranslations` — kho câu chữ nằm trong khung gốc. Gọi nó ở
 *     đây là ném thêm một lỗi ngay trong lưới đỡ cuối cùng, và người dùng nhận
 *     một trang trắng hoàn toàn. Vì vậy chữ ở đây VIẾT CỨNG tiếng Việt, và đó
 *     là ngoại lệ i18n CÓ CHỦ ĐÍCH, không phải chỗ quên dịch.
 *
 *   ⚠️ KHÔNG dùng thành phần giao diện dùng chung, KHÔNG dùng biến màu của
 *     Tailwind — bảng kiểu cũng nạp từ khung gốc. Viết kiểu thẳng vào thẻ.
 *
 * Trang này gần như không bao giờ hiện ra. Nhưng đúng lúc nó cần hiện thì mọi
 * thứ khác đã hỏng, nên nó phải đứng được một mình.
 */
export default function LoiToanCuc({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Không nạp `baoLoiLenMayChu` qua import dùng chung: mô-đun đó cũng có thể
    // nằm trong phần đang hỏng. Gửi thẳng, và nuốt mọi lỗi của chính lượt gửi.
    // Sentry nhập thẳng ở đầu tệp, không đi qua khung gốc đang hỏng — an toàn
    // theo đúng luật của tệp này. Bọc `try` riêng để không cướp mất lượt gửi
    // về sổ bên dưới nếu chính Sentry hỏng.
    try {
      Sentry.captureException(error);
    } catch {
      /* im lặng */
    }

    try {
      const than = JSON.stringify({
        loi: String(error?.message ?? "lỗi khung gốc").slice(0, 500),
        vet: String(error?.stack ?? "").slice(0, 3000),
        duongDan: window.location.pathname,
      });
      navigator.sendBeacon?.("/api/loi", new Blob([than], { type: "application/json" }));
    } catch {
      /* im lặng */
    }
  }, [error]);

  return (
    <html lang="vi">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf9f8",
          color: "#1c1917",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
            iFan đang gặp trục trặc
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#57534e", margin: "0 0 18px" }}>
            Dữ liệu của bạn vẫn an toàn. Thử tải lại trang; nếu vẫn vậy thì chờ ít
            phút rồi vào lại.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: "0 20px",
              borderRadius: 8,
              border: "none",
              background: "#c94c18",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Tải lại
          </button>
        </div>
      </body>
    </html>
  );
}
