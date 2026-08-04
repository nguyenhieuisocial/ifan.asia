import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

/** Chỉ các trang public — khu /app sau đăng nhập không đưa vào sitemap. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, priority: 1 },
    { url: `${SITE_URL}/login`, priority: 0.5 },
    { url: `${SITE_URL}/signup`, priority: 0.8 },
  ];
}
