import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // Nhập Excel gửi file qua server action dạng base64 (~+35% dung lượng):
    // trần 2MB file gốc cần hơn mức mặc định 1MB của Next.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default withNextIntl(nextConfig);
