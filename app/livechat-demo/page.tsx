import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";

/**
 * Trang thử Live Chat do iFan host (spec 02 §4.5, đợt "đường 2 phút").
 *
 * /livechat-demo?key=<khóa nhúng> — trang MẪU công khai đã nhúng sẵn
 * public/livechat.js với khóa của tiệm: chủ shop nhắn thử ngay sau khi Lưu
 * cài đặt và thấy tin đổ về Hộp thư, KHÔNG phải chờ dán mã lên website thật.
 *
 * Bảo mật — vì sao trang này được phép công khai:
 * - Khóa nhúng vốn là khóa CÔNG KHAI (nằm sẵn trong mã nguồn trang khách);
 *   trang chỉ đưa nó vào thuộc tính data của widget, không tra thêm gì —
 *   không lộ tên tiệm, không lộ cấu hình.
 * - Khóa sai / kênh đang tắt → widget tự im lặng (máy chủ trả 'forbidden'),
 *   trang không hé lộ khóa nào tồn tại.
 * - Widget trên trang này gửi Origin = tên miền iFan; tầng API đổi thành
 *   origin ảo 'ifan:demo' (migration #55) — KHÔNG nới rate limit nào, và tin
 *   thử không được tính là "tin thật từ website" (không ghi last_event_at).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("livechat.demo");
  // Trang tiện ích cho từng tiệm (mang khóa trong URL) — không cho máy tìm kiếm lập chỉ mục
  return { title: `${t("title")} — iFan.asia`, robots: { index: false, follow: false } };
}

const EMBED_KEY_RE = /^[0-9a-f]{16,128}$/;

export default async function LivechatDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const raw = typeof sp.key === "string" ? sp.key : "";
  const key = EMBED_KEY_RE.test(raw) ? raw : null;
  const t = await getTranslations("livechat.demo");

  if (!key) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl rounded-lg border bg-card p-6">
          <p className="text-[13px] font-medium text-primary">iFan.asia</p>
          <h1 className="mt-1 text-lg font-semibold">{t("invalidKey.title")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("invalidKey.detail")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl space-y-4">
        <div className="rounded-lg border bg-card p-6">
          <p className="text-[13px] font-medium text-primary">iFan.asia</p>
          <h1 className="mt-1 text-lg font-semibold">{t("title")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("intro")}
          </p>
          <ol className="mt-4 space-y-3">
            {([1, 2, 3] as const).map((n) => (
              <li key={n} className="flex items-start gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-tint text-[13px] font-semibold text-primary">
                  {n}
                </span>
                <p className="text-sm leading-relaxed">{t(`step${n}`)}</p>
              </li>
            ))}
          </ol>
          <Link
            href="/app/inbox"
            className="group mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t("openInbox")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <p className="mt-4 text-[13px] text-muted-foreground">{t("note")}</p>
        </div>

        <div className="rounded-lg border bg-card p-4 text-[13px] text-muted-foreground">
          {t("noBubble")}{" "}
          <Link
            href="/app/settings/channels/livechat"
            className="font-medium text-primary hover:underline"
          >
            {t("openSettings")}
          </Link>
        </div>
      </div>

      {/* Nhúng ĐÚNG mã mà chủ shop sẽ dán lên website thật — cùng file, cùng
          thuộc tính — để trang thử chạy đúng thứ khách của họ sẽ chạy. */}
      <script src="/livechat.js" data-ifan-key={key} async />
    </main>
  );
}
