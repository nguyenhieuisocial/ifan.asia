// Service worker PWA bước 2 (task #50) — viết tay, KHÔNG dùng Serwist/Workbox.
// Lý do: dự án chạy Turbopack (next dev/build --turbopack), các thư viện sinh SW
// qua plugin webpack (Serwist) chưa chắc ăn khớp — một file tĩnh đăng ký thủ
// công thì chạy được ở mọi cấu hình build, không phụ thuộc gì thêm.
//
// Chiến lược CỐ Ý đơn giản (chỉ đọc, KHÔNG có hàng chờ ghi lại khi mất mạng —
// xem ghi chú ở components/pwa/offline-banner.tsx về việc này bị hoãn):
// - Tài nguyên tĩnh Next.js (/_next/static/*, /icons/*): cache trước, dùng mãi
//   (tên file có hash, nội dung không đổi).
// - Trang điều hướng (mở màn): luôn hỏi mạng trước; hỏng mạng thì trả bản đã
//   lưu lần xem gần nhất, không có bản lưu nào thì trả /offline.
// - KHÔNG đụng /api/* (luôn cần dữ liệu mới) và KHÔNG đụng request không cùng
//   gốc (Supabase, ...) — cache nhầm dữ liệu tiệm khác là chuyện nghiêm trọng.

const CACHE_VERSION = "ifan-v1";
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("ifan-") && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          return (await cache.match(request)) ?? (await cache.match("/offline"));
        }
      })(),
    );
  }
});
