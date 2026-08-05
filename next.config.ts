import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // Nhập Excel gửi file qua server action dạng base64 (~+35% dung lượng):
    // trần 2MB file gốc cần hơn mức mặc định 1MB của Next.
    serverActions: { bodySizeLimit: "4mb" },
  },

  /**
   * Header bảo vệ trình duyệt. Trước đây KHÔNG có cái nào — màn /app nhúng
   * iframe được (lừa bấm), và không có nosniff.
   *
   * KHÔNG đặt CSP ở đây: Next dùng inline script cho hydration nên CSP chặt cần
   * nonce theo từng request, phải làm ở proxy.ts. Đặt CSP nửa vời (unsafe-inline)
   * chỉ tạo cảm giác an toàn giả — để làm đúng ở một đợt riêng.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Chặn nhúng iframe từ tên miền khác (chống lừa bấm).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Mã nhúng hộp chat PHẢI cho website của chủ shop tải được.
        source: "/livechat.js",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
