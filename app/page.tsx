import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { PainPoints } from "@/components/landing/pain-points";
import { Features } from "@/components/landing/features";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { ClosingCta } from "@/components/landing/closing-cta";
import { LandingFooter } from "@/components/landing/footer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.metadata");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function Home() {
  return (
    <>
      <LandingHeader />
      <main className="flex-1">
        <Hero />
        <PainPoints />
        <Features />
        <Pricing />
        <Faq />
        <ClosingCta />
      </main>
      <LandingFooter />
    </>
  );
}
