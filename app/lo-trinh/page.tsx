import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/header";
import { LandingFooter } from "@/components/landing/footer";
import { Reveal } from "@/components/landing/reveal";
import { Button } from "@/components/ui/button";
import {
  MODULE_REGISTRY,
  MODULE_COUNTS,
  READY_MODULES,
  BUILDING_MODULES,
} from "@/lib/feature-registry";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("loTrinh");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

const WAVES = [
  { id: "v3v5", titleKey: "waveV3V5Title", subKey: "waveV3V5Sub", extraKey: "waveV3V5Extra" },
  { id: "v6", titleKey: "waveV6Title", subKey: "waveV6Sub", extraKey: "waveV6Extra" },
  { id: "v7v8", titleKey: "waveV7Title", subKey: "waveV7Sub", extraKey: "waveV7Extra" },
] as const;

/**
 * /lo-trinh (ADR-0011 mục 5.3, thẻ design trang-lo-trinh.html) — công khai
 * 8 mảng còn lại, mảng nào ở đợt nào. Ba con số + danh sách từng mảng ĐỌC
 * TỪ feature-registry.ts (D1) — cấm gõ tay, gõ tay là ngày nào đó trang chủ
 * và trang này đá nhau.
 */
export default async function LoTrinhPage() {
  const [t, tModules] = await Promise.all([
    getTranslations("loTrinh"),
    getTranslations("landing.modules"),
  ]);

  const readyNames = READY_MODULES.map((m) => tModules(`${m.key}.name`)).join(" · ");
  const buildingName = BUILDING_MODULES[0] ? tModules(`${BUILDING_MODULES[0].key}.name`) : "";

  return (
    <>
      <LandingHeader />
      <main className="flex-1">
        <section className="border-b">
          <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
            <Reveal>
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                {t("title")}
              </h1>
              <p className="mt-3 max-w-xl text-muted-foreground">{t("subtitle")}</p>
            </Reveal>
            <Reveal delay={60} className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-status-closed/40 bg-status-closed/10 p-3">
                <p className="text-2xl font-semibold text-status-closed-foreground">{MODULE_COUNTS.ready}</p>
                <p className="mt-1 text-xs text-status-closed-foreground">{t("statReady")}</p>
              </div>
              <div className="rounded-lg border border-status-pending/40 bg-status-pending/10 p-3">
                <p className="text-2xl font-semibold text-status-pending-foreground">{MODULE_COUNTS.building}</p>
                <p className="mt-1 text-xs text-status-pending-foreground">{t("statBuilding")}</p>
              </div>
              <div className="rounded-lg border bg-muted p-3">
                <p className="text-2xl font-semibold text-muted-foreground">{MODULE_COUNTS.planned}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("statPlanned")}</p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-b bg-muted/40">
          <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
            <Reveal className="rounded-xl border bg-card p-5">
              <div className="flex gap-3 border-b pb-4">
                <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-full bg-status-closed-foreground" />
                <div>
                  <p className="text-sm font-semibold text-status-closed-foreground">
                    {t("readyTitle")}{" "}
                    <span className="font-normal text-muted-foreground">· {MODULE_COUNTS.ready} {t("statReady")}</span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{readyNames}</p>
                </div>
              </div>
              <div className="flex gap-3 border-b py-4">
                <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-full bg-status-pending-foreground" />
                <div>
                  <p className="text-sm font-semibold text-status-pending-foreground">
                    {t("buildingTitle")} <span className="font-normal text-muted-foreground">· {t("buildingWave")}</span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    <strong className="font-semibold text-foreground">{buildingName}</strong> — {t("buildingExtra")}
                  </p>
                </div>
              </div>
              {WAVES.map((wave, i) => {
                const keys = MODULE_REGISTRY.filter((m) => m.status === "planned" && m.wave === wave.id).map((m) =>
                  tModules(`${m.key}.name`),
                );
                return (
                  <div key={wave.id} className={`flex gap-3 py-4 ${i < WAVES.length - 1 ? "border-b" : ""}`}>
                    <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-full bg-border" />
                    <div>
                      <p className="text-sm font-semibold">
                        {t(wave.titleKey)} <span className="font-normal text-muted-foreground">· {t(wave.subKey)}</span>
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {keys.join(" · ")} · {t(wave.extraKey)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </Reveal>

            <Reveal delay={80} className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-semibold">{t("launchTitle")}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t("launchDesc")}</p>
            </Reveal>

            <Reveal delay={120} className="mt-4 rounded-lg border bg-card p-4">
              <p className="text-sm font-semibold">{t("notDoingTitle")}</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-sm text-muted-foreground">
                <li>· {t("notDoing1")}</li>
                <li>· {t("notDoing2")}</li>
                <li>· {t("notDoing3")}</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground/80">{t("notDoingNote")}</p>
            </Reveal>

            <Reveal delay={160} className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild className="hover-lift btn-sheen">
                <Link href="/signup">{t("cta")}</Link>
              </Button>
              <Link
                href="/tinh-nang"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("seeFeatures")}
              </Link>
            </Reveal>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
