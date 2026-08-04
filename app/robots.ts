import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

/** Cho index toàn bộ trang public; /app và /api tự chặn bằng auth — không cần disallow. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
