import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";
import { SPOTLIGHT_INDUSTRIES } from "@/lib/industries";

/**
 * Sơ đồ trang cho máy tìm kiếm — CHỈ trang công khai; khu `/app` sau đăng nhập
 * không đưa vào.
 *
 * ⚠️ Bản trước chỉ khai BA địa chỉ: trang chủ, đăng nhập, đăng ký. Thiếu cả
 * **Bảng giá** lẫn **Tính năng** — hai trang bán hàng chính — và thiếu luôn sáu
 * trang ngành. Sáu trang đó còn ở tình trạng nặng hơn: không trang nào trong
 * web trỏ tới chúng, nên chúng vừa không có trong sơ đồ vừa không có đường vào.
 * Máy tìm kiếm gần như không có cách nào biết chúng tồn tại.
 *
 * ⛔ **Thêm trang công khai mới thì phải thêm vào đây.** Không có cổng nào tự
 * bắt được thiếu sót đó — một trang vắng mặt trong sơ đồ trông y hệt một trang
 * chưa ai tìm thấy.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const nay = new Date();

  const trang: MetadataRoute.Sitemap = [
    { url: SITE_URL, priority: 1, changeFrequency: "weekly", lastModified: nay },
    // Hai trang BÁN HÀNG — người tìm "phần mềm quản lý spa" cần rơi vào đây,
    // không phải vào trang đăng nhập.
    { url: `${SITE_URL}/tinh-nang`, priority: 0.9, changeFrequency: "weekly", lastModified: nay },
    { url: `${SITE_URL}/bang-gia`, priority: 0.9, changeFrequency: "weekly", lastModified: nay },
    { url: `${SITE_URL}/signup`, priority: 0.8, changeFrequency: "monthly", lastModified: nay },
    { url: `${SITE_URL}/lo-trinh`, priority: 0.6, changeFrequency: "weekly", lastModified: nay },
    { url: `${SITE_URL}/login`, priority: 0.5, changeFrequency: "yearly", lastModified: nay },
    // Điều khoản và Bảo mật ít người tìm, nhưng thiếu chúng thì trang web
    // trông như không có ai chịu trách nhiệm.
    { url: `${SITE_URL}/terms`, priority: 0.3, changeFrequency: "yearly", lastModified: nay },
    { url: `${SITE_URL}/privacy`, priority: 0.3, changeFrequency: "yearly", lastModified: nay },
  ];

  // Sáu trang ngành. Đọc thẳng danh sách gốc chứ không chép tay tên ngành:
  // thêm ngành thứ bảy là nó tự có mặt ở đây.
  for (const nganh of SPOTLIGHT_INDUSTRIES) {
    trang.push({
      url: `${SITE_URL}/nganh/${nganh}`,
      priority: 0.7,
      changeFrequency: "monthly",
      lastModified: nay,
    });
  }

  return trang;
}
