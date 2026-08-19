import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Trang thử Live Chat do iFan host (spec 02 §4.5, đợt "đường 2 phút").
 *
 * /livechat-demo?key=<KHÓA THỬ> — trang MẪU công khai đã nhúng sẵn
 * public/livechat.js: chủ shop nhắn thử ngay sau khi Lưu cài đặt và thấy tin đổ
 * về Hộp thư, KHÔNG phải chờ dán mã lên website thật.
 *
 * ⭐ `key` ở đây là KHÓA THỬ 30 PHÚT, KHÔNG PHẢI khóa nhúng (migration #209).
 * Khóa nhúng là khóa CÔNG KHAI — nó nằm nguyên văn trong mã HTML website của
 * tiệm. Bản trước dùng thẳng nó làm vé vào trang thử, mà trang thử lại chạy
 * trên chính tên miền iFan nên hàng rào tên miền không đụng tới: ai chép được
 * khóa cũng mở link này và chat vào hộp thư tiệm từ bất kỳ mạng nào. Nay vé vào
 * chỉ do `/livechat-demo/moi` phát, sau khi đọc phiên đăng nhập của owner/admin.
 *
 * Trang vẫn CÔNG KHAI (không đòi đăng nhập) là cố ý: chủ tiệm thường mở link
 * này trên ĐIỆN THOẠI để nhắn thử như một khách thật, nơi chưa chắc đã đăng
 * nhập iFan. Vé ngắn hạn giữ được cả hai: mở đâu cũng chạy, mà không thành cửa
 * sau vĩnh viễn.
 *
 * Còn giữ nguyên từ migration #55: tin thử KHÔNG được tính là "tin thật từ
 * website" (không ghi `last_event_at`), và KHÔNG nới bất kỳ rate limit nào.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("livechat.demo");
  // Trang tiện ích cho từng tiệm (mang khóa trong URL) — không cho máy tìm kiếm lập chỉ mục
  return { title: `${t("title")} — iFan.asia`, robots: { index: false, follow: false } };
}

/** Khóa thử: 32 byte ngẫu nhiên = 64 hex (livechat_demo_start, migration #209). */
const DEMO_KEY_RE = /^[0-9a-f]{64}$/;

/**
 * Vé còn hạn không? Hỏi CSDL bằng service client (trang này là server
 * component). Không có bước này thì vé hết hạn = bong bóng chat im lặng không
 * lý do, và chủ tiệm ngồi chờ một tin không bao giờ tới — đúng cái bệnh mà
 * `channels.last_event_at` sinh ra để chống.
 *
 * RPC chỉ trả boolean, không tên tiệm, không cấu hình. Vé là chuỗi 64 hex ngẫu
 * nhiên nên gọi hàm này cũng không dò ra vé nào đang sống.
 */
async function veConHan(key: string): Promise<boolean> {
  const service = createServiceClient();
  if (!service) return false;
  const { data, error } = await service.rpc("livechat_demo_check", { p_demo_key: key });
  return !error && data === true;
}

export default async function LivechatDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const raw = typeof sp.key === "string" ? sp.key : "";
  const key = DEMO_KEY_RE.test(raw) && (await veConHan(raw)) ? raw : null;
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
          {/* Thẻ <a> THƯỜNG, không dùng <Link>: Next nạp trước các <Link>, tức
              chỉ rê chuột qua là đã phát một vé mới (xem route /livechat-demo/moi). */}
          <a
            href="/livechat-demo/moi"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t("newLink")}
            <ArrowRight className="size-4" />
          </a>
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
