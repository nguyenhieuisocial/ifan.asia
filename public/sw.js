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

// ═══════════════════════════════════════════════════════════════════
// SỰ CỐ 19/08/2026 — bộ đệm này đã phục vụ mã CŨ MỘT TUẦN trên máy thử
// ═══════════════════════════════════════════════════════════════════
// Đo được: tệp kiểu dáng trình duyệt đang dùng là **140 KB đề ngày 12/08**,
// trong khi cùng địa chỉ đó máy chủ trả về **152 KB của hôm nay**. Bộ đệm giữ
// 95 tệp mã cũ. Hậu quả nhìn thấy: cột trái khu Cài đặt đáng lẽ rộng 186px thì
// thành 1040px, và MỌI trang Cài đặt ném lỗi "máy chủ dựng một đằng, trình
// duyệt dựng một nẻo".
//
// Nhưng cái đắt hơn là thứ nó làm với người đang sửa lỗi: **ba lần trong một
// ngày tôi suýt báo lỗi sai** vì đang nhìn bản cũ — trang đăng nhập "thiếu nút",
// một khối cảnh báo "biến mất", chữ hiện ra mã thô. Mỗi lần đều mất công đi tìm
// nguyên nhân ở chỗ không có nguyên nhân.
//
// Gốc rễ: file này giả định *"tên tệp có mã băm, nội dung không đổi"*. Đúng ở
// bản thật, **sai ở máy thử**. Đã vá hai chỗ: bộ đăng ký không cài khi chạy máy
// thử (và tự gỡ bản đã lỡ cài), và `/icons/*` chuyển sang "dùng đệm nhưng vẫn
// đi lấy bản mới".
//
// Bài học chung: **một bộ đệm im lặng phục vụ bản cũ thì mọi phép kiểm bằng mắt
// đều mất giá trị** — và nó không báo lỗi gì cả, nên rất khó ngờ tới.

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

  // ── Mã và kiểu dáng của Next.js: DÙNG BẢN ĐỆM, KHÔNG HỎI LẠI ──────────
  // An toàn ở BẢN THẬT vì tên file có mã băm nội dung: nội dung đổi ⇒ tên đổi
  // ⇒ là một địa chỉ khác ⇒ không bao giờ ăn nhầm bản cũ.
  // ⚠️ Ở MÁY THỬ thì giả định đó SAI (tên giữ nguyên, ruột đổi mỗi lần sửa code)
  // — nên bộ đăng ký đã được sửa để KHÔNG cài bản này khi chạy máy thử. Xem
  // `components/pwa/sw-register.tsx` và sự cố 19/08 chép ở đầu file.
  if (url.pathname.startsWith("/_next/static/")) {
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

  // ── Biểu tượng: DÙNG BẢN ĐỆM NGAY, NHƯNG VẪN ĐI LẤY BẢN MỚI ───────────
  // Khác chỗ trên vì `/icons/*` **không** có mã băm trong tên. Với cách cũ
  // (dùng đệm, không hỏi lại) thì đổi biểu tượng xong người đã cài sẽ giữ
  // biểu tượng cũ **vĩnh viễn** — mã phiên bản `ifan-v1` viết cứng, không ai
  // nhớ tăng. Nay: trả bản đệm cho nhanh, đồng thời lấy bản mới về để lần sau
  // đúng. Chậm nhất một lần mở là thấy biểu tượng mới.
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const lam = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached ?? lam;
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

// ═══════════════════════════════════════════════════════════════════
// THÔNG BÁO ĐẨY (#315)
// ═══════════════════════════════════════════════════════════════════
// Máy chủ đẩy một gói JSON `{ title, body, link, nhom }`. Ở đây chỉ có hai
// việc: HIỆN nó ra, và MỞ ĐÚNG CHỖ khi người ta bấm vào.
//
// ⚠️ Trình duyệt BẮT BUỘC phải hiện một thông báo cho mỗi lần đẩy (cam kết
//   `userVisibleOnly: true` lúc đăng ký). Không hiện thì Chrome tự hiện một
//   thông báo "trang web này đang chạy nền" — xấu và khó hiểu. Nên kể cả khi
//   gói tin hỏng vẫn phải hiện MỘT thứ gì đó.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Gói tin hỏng — vẫn phải hiện một thông báo, xem ghi chú trên.
  }

  const tieuDe = data.title || "iFan";
  const noiDung = data.body || "";
  const duongDan = data.link || "/app/today";

  event.waitUntil(
    self.registration.showNotification(tieuDe, {
      body: noiDung,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // `tag` gom nhóm: mười tin trong một kênh chỉ nên là MỘT dòng thông báo
      // chứ không phải mười. Không có nó thì người ta mở máy ra thấy một cột
      // thông báo dài và việc đầu tiên họ làm là tắt hẳn.
      tag: data.nhom || duongDan,
      renotify: true,
      data: { duongDan },
      // Rung nhẹ. Không đặt âm riêng: âm mặc định của máy là thứ người ta đã
      // quen, và một âm lạ giữa đêm thì đáng sợ chứ không hữu ích.
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const duongDan = (event.notification.data && event.notification.data.duongDan) || "/app/today";

  event.waitUntil(
    (async () => {
      const dsTab = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // ⚠️ TÌM TAB ĐANG MỞ TRƯỚC, đừng mở tab mới ngay. Lễ tân thường đã có
      //   iFan mở sẵn; mở thêm một tab nữa mỗi lần bấm thông báo thì sau một
      //   buổi sáng có mười tab, và mỗi tab một trạng thái khác nhau.
      for (const tab of dsTab) {
        const u = new URL(tab.url);
        if (u.origin === self.location.origin) {
          await tab.focus();
          // `navigate` có thể bị chặn ở vài trình duyệt — hỏng thì vẫn đã
          // focus được, còn hơn mở thêm tab.
          try {
            await tab.navigate(duongDan);
          } catch {
            // bỏ qua có chủ đích, xem ghi chú trên
          }
          return;
        }
      }
      await self.clients.openWindow(duongDan);
    })(),
  );
});
