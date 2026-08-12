import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/header";
import { LandingFooter } from "@/components/landing/footer";
import { Reveal } from "@/components/landing/reveal";
import { StatusBadge } from "@/components/landing/status-badge";
import { Button } from "@/components/ui/button";
import { MODULE_REGISTRY, MODULE_COUNTS, TINH_NANG_GROUPS } from "@/lib/feature-registry";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tinhNang");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/**
 * /tinh-nang (ADR-0011 mục 5.3, thẻ design trang-tinh-nang.html) — đủ 20
 * mảng, gom 6 nhóm theo DÒNG CHẢY CÔNG VIỆC của tiệm (TINH_NANG_GROUPS),
 * không theo tên màn hình. Tên/mô tả/trạng thái mọi mảng đọc từ
 * feature-registry.ts + landing.modules.* — cấm gõ tay (D1).
 */
export default async function TinhNangPage() {
  const [t, tModules] = await Promise.all([
    getTranslations("tinhNang"),
    getTranslations("landing.modules"),
  ]);

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
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-closed px-3 py-1 text-xs font-medium text-status-closed-foreground">
                  {t("countReady", { count: MODULE_COUNTS.ready })}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-pending px-3 py-1 text-xs font-medium text-status-pending-foreground">
                  {t("countBuilding", { count: MODULE_COUNTS.building })}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  {t("countPlanned", { count: MODULE_COUNTS.planned })}
                </span>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-b bg-muted/40">
          <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
            {TINH_NANG_GROUPS.map((group, gi) => (
              <Reveal key={group.id} delay={gi * 40} className={gi > 0 ? "mt-8" : undefined}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {gi + 1} · {t(`groups.${group.id}.title`)}
                </p>
                <div className="mt-2 rounded-xl border bg-card px-4">
                  {group.keys.map((key, mi) => {
                    const mod = MODULE_REGISTRY.find((m) => m.key === key);
                    if (!mod) return null;
                    return (
                      <div
                        key={key}
                        className={`flex gap-3 py-3 ${mi < group.keys.length - 1 ? "border-b" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug">
                            {tModules(`${key}.name`)}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            {tModules(`${key}.desc`)}
                            {tModules.has(`${key}.note`) && (
                              <span className="text-muted-foreground/70"> {tModules(`${key}.note`)}.</span>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <StatusBadge status={mod.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="border-b">
          <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
            <Reveal>
              <p className="text-sm font-semibold">{t("whyGroupsTitle")}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("whyGroupsDesc")}</p>
            </Reveal>
            <Reveal delay={60} className="mt-6">
              <p className="text-sm font-semibold">{t("whyInterleaveTitle")}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("whyInterleaveDesc")}</p>
            </Reveal>
            <Reveal delay={120} className="mt-8">
              <Button asChild className="hover-lift btn-sheen">
                <Link href="/signup">{t("cta")}</Link>
              </Button>
            </Reveal>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
