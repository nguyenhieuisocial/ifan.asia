import { getTranslations } from "next-intl/server";

/**
 * Trang dự phòng cuối cùng khi mất mạng (task #50 PWA bước 2) — service worker
 * (public/sw.js) chỉ trả về trang này nếu KHÔNG có bản lưu nào của màn đang mở,
 * tức lần đầu tiên mở app mà đã mất mạng sẵn. Bình thường người dùng sẽ thấy
 * bản lưu lần xem gần nhất (components/pwa/offline-banner.tsx) chứ không phải
 * trang này.
 */
export default async function OfflinePage() {
  const t = await getTranslations("pwa.offline");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
          aria-hidden
        >
          <path d="M1 1l22 22M16.7 16.7A9 9 0 0 1 12 18M5 12.5a11 11 0 0 1 4-2.6M2 8.8a16 16 0 0 1 5-3.2" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="max-w-xs text-sm text-muted-foreground">{t("description")}</p>
    </main>
  );
}
