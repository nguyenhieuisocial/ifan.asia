import type { MetadataRoute } from "next";

/**
 * PWA bước 1 (task #50): bản khai để "Thêm vào màn hình chính" ra một app đúng
 * nghĩa — icon riêng, mở toàn màn không thanh địa chỉ, vào thẳng /app/today
 * (màn làm việc, cùng đích với sau-đăng-nhập).
 *
 * Bước sau (chưa làm ở đây): service worker (Serwist) + đẩy thông báo iOS 16.4+.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iFan — CRM & hộp thư cho tiệm",
    short_name: "iFan",
    description:
      "Gom tin nhắn khách về một chỗ, nhắc việc mỗi ngày, đo nguồn nào ra tiền.",
    start_url: "/app/today",
    display: "standalone",
    background_color: "#FAF5EF",
    theme_color: "#C94C18",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // Bản maskable: nét vẽ đã nằm trong vùng an toàn 80% giữa — Android cắt tròn không mất chữ.
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
