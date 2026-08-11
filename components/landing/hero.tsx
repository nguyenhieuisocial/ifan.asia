import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
// Khung ảnh app thay-ảnh-được (thẻ landing-hero): đổi ảnh = đổi import này,
// KHÔNG đụng khung/bố cục.
import heroShot from "@/public/screens/inbox.png";

export async function Hero() {
  const t = await getTranslations("landing.hero");
  return (
    <section className="border-b">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-2">
        {/* min-w-0: bài học 375px — ô lưới mặc định không co dưới độ rộng nội
            dung, thiếu nó trang chủ từng trôi ngang 58px trên điện thoại.
            KHÔNG xếp lớp absolute/neo đáy: vết sẹo VI-only break của mock cũ
            (chữ vi dài hơn en làm khung neo đáy trồi lên cắt nội dung phía
            sau) — khung ảnh mới là luồng phẳng, không chồng lớp. */}
        <div className="rise-in flex min-w-0 flex-col items-start gap-6">
          <p className="rounded-full border px-4 py-1 text-sm text-muted-foreground">
            {t("badge")}
          </p>
          <h1 className="max-w-xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t.rich("headline", { em: (chunks) => <em>{chunks}</em> })}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t("subheadline")}
          </p>
          {/* Đúng MỘT nút cam đặc trong hero; nút phụ viền thường. 375px: hai
              nút rộng 100% xếp chồng, nút cam trước — không co chữ. */}
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Button size="lg" asChild className="hover-lift">
              <Link href="/signup">{t("ctaPrimary")}</Link>
            </Button>
            {/* CTA phụ trỏ /signup: /livechat-demo chỉ chạy khi có khóa nhúng
                của tiệm, chưa có cơ chế khóa demo công khai — không chế
                backdoor; ghi chú "có ngay sau khi tạo tiệm" ngay dưới. */}
            <Button size="lg" variant="outline" asChild className="hover-lift">
              <Link href="/signup">{t("ctaSecondary")}</Link>
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{t("ctaNote")}</p>
            <p className="text-xs text-muted-foreground">
              {t("ctaSecondaryNote")}
            </p>
          </div>
        </div>
        <div className="rise-in rise-in-late min-w-0">
          {/* Khung trình duyệt giả 3 chấm — khung và tỉ lệ khóa cứng */}
          <div className="overflow-hidden rounded-xl border shadow-sm">
            <div className="flex items-center gap-1 border-b bg-muted px-3 py-2">
              <span aria-hidden className="size-1.5 rounded-full bg-border" />
              <span aria-hidden className="size-1.5 rounded-full bg-border" />
              <span aria-hidden className="size-1.5 rounded-full bg-border" />
            </div>
            <Image
              src={heroShot}
              alt={t("screenshotAlt")}
              priority
              className="w-full"
              sizes="(min-width: 1024px) 512px, (min-width: 640px) 90vw, 100vw"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
