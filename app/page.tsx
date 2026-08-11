import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { TrucGrid } from "@/components/landing/truc-grid";
import { StoryFlow } from "@/components/landing/story-flow";
import { WhyAndPricing } from "@/components/landing/why-and-pricing";
import { Faq } from "@/components/landing/faq";
import { LandingFooter } from "@/components/landing/footer";
import { LandingFx } from "@/components/landing/landing-fx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.metadata");
  return {
    title: t("title"),
    description: t("description"),
  };
}

/**
 * Landing big iFan (PHẦN BỔ SUNG 11/08, mục 6) — khung khóa theo 5 thẻ design
 * landing-{hero,6-truc,luong-ke-chuyen,vi-sao-va-gia,mobile}. Anchor giữ
 * nguyên: #features (lưới trục) · #pricing (bảng giá) · #faq — header/footer
 * đang trỏ tới.
 */
export default function Home() {
  return (
    <>
      <LandingHeader />
      <main className="flex-1">
        <Hero />
        <TrucGrid />
        <StoryFlow />
        <WhyAndPricing />
        <Faq />
      </main>
      <LandingFooter />
      {/* Vi tương tác cần JS (lấp lánh huy hiệu 1 lần, số đếm chạy) — không
          render gì, không ẩn gì; tắt chuyển động là trang tĩnh nguyên vẹn */}
      <LandingFx />
    </>
  );
}
