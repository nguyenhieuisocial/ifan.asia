import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { HeroTiles } from "@/components/illustrations/hero-tiles";
import { HeroStage } from "@/components/landing/hero-stage";
import { GROUP_COUNTS } from "@/lib/feature-registry";
// Khung ảnh app thay-ảnh-được (thẻ landing-hero): đổi ảnh = đổi import này,
// KHÔNG đụng khung/bố cục.
import heroShot from "@/public/screens/inbox.png";

export async function Hero() {
  const t = await getTranslations("landing.hero");
  return (
    // relative + overflow-hidden: lớp gạch trang trí tuyệt đối bên dưới không
    // được phép sinh cuộn ngang (bài học 375px)
    <section className="relative overflow-hidden border-b">
      {/* Lớp nền gạch gốm thương hiệu (tái dùng hero-tiles.tsx): trôi chậm
          (tiles-drift) + tụt lại khi cuộn (tiles-parallax, scroll-driven).
          Thuần trang trí: aria-hidden, pointer-events-none, nằm DƯỚI nội dung
          (khối nội dung relative đè lên). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 select-none"
      >
        <div className="tiles-parallax absolute inset-0">
          <HeroTiles className="tiles-drift absolute -top-4 right-[6%] w-52 opacity-50 sm:w-72 dark:opacity-30" />
          <HeroTiles className="tiles-drift-late absolute -bottom-8 -left-10 w-44 opacity-35 blur-[2px] sm:w-60 dark:opacity-20" />
        </div>
      </div>
      {/* HeroStage: client mỏng chỉ để nghiêng 3D khung app theo con trỏ
          (desktop có chuột; mobile/reduced-motion tĩnh). Nội dung con vẫn
          render server → LCP ảnh hero không đổi. */}
      <HeroStage className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-2">
        {/* min-w-0: bài học 375px — ô lưới mặc định không co dưới độ rộng nội
            dung, thiếu nó trang chủ từng trôi ngang 58px trên điện thoại.
            KHÔNG xếp lớp absolute/neo đáy: vết sẹo VI-only break của mock cũ
            (chữ vi dài hơn en làm khung neo đáy trồi lên cắt nội dung phía
            sau) — khung ảnh mới là luồng phẳng, không chồng lớp.
            hero-cascade: 5 con vào so le lúc tải (CSS thuần — không FOUC/CLS,
            không JS; máy không hỗ trợ animation vẫn thấy đủ chữ). */}
        <div className="hero-cascade flex min-w-0 flex-col items-start gap-6">
          {/* Nhãn tròn nói thật tỉ lệ hoàn thành thay vì khẩu hiệu — đếm theo
              NHÓM (ADR-0012 mục 8), không theo mảng: "nhóm đã có phần lõi
              chạy thật" = nhóm có ít nhất 1 mảng ready. Số đọc thẳng từ
              feature-registry.ts (D1), đổi trạng thái 1 mảng ở đó là câu này
              tự cập nhật, không sửa tay ở đây. */}
          <p className="flex items-center gap-1.5 rounded-full border px-4 py-1 text-sm text-muted-foreground">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-status-closed-foreground" />
            {t("badge", { ready: GROUP_COUNTS.readyCore, total: GROUP_COUNTS.total })}
          </p>
          <h1 className="max-w-xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t.rich("headline", { em: (chunks) => <em>{chunks}</em> })}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t.rich("subheadline", { strong: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
          </p>
          {/* Đúng MỘT nút cam đặc trong hero; nút phụ viền thường. 375px: hai
              nút rộng 100% xếp chồng, nút cam trước — không co chữ.
              btn-sheen: vệt sáng quét qua nút cam khi hover. */}
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Button size="lg" asChild className="hover-lift btn-sheen">
              <Link href="/signup">{t("ctaPrimary")}</Link>
            </Button>
            {/* CTA phụ trỏ trang Tính năng — người lạ vào trang chưa cần thử
                một tính năng lẻ, họ cần biết sản phẩm đã tới đâu (ADR-0011
                mục 5, thẻ landing-hero). */}
            <Button size="lg" variant="outline" asChild className="hover-lift">
              <Link href="/tinh-nang">{t("ctaSecondary")}</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("ctaNote")}</p>
        </div>
        <div className="rise-in rise-in-late min-w-0">
          {/* Khung trình duyệt giả 3 chấm — khung và tỉ lệ khóa cứng.
              data-tilt: mục tiêu nghiêng của HeroStage; bg-card để khi nghiêng
              không lộ nền gạch phía sau qua góc bo. */}
          <div
            data-tilt
            className="transform-gpu overflow-hidden rounded-xl border bg-card shadow-sm"
          >
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
      </HeroStage>
    </section>
  );
}
