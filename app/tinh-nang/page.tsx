import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/header";
import { LandingFooter } from "@/components/landing/footer";
import { Reveal } from "@/components/landing/reveal";
import { StatusBadge } from "@/components/landing/status-badge";
import { Button } from "@/components/ui/button";
import { MODULE_REGISTRY, MODULE_COUNTS, GROUP_REGISTRY } from "@/lib/feature-registry";

import { cauThuNghiem } from "@/lib/thu-nghiem";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tinhNang");
  const tieuDe = t("metaTitle");
  const moTa = t("metaDescription");
  // Thẻ xem trước RIÊNG. Trước bản này ba trang công khai chỉ khai title và
  // description, còn khối `openGraph`/`twitter` thì kế thừa thẳng từ trang chủ
  // — nên chia sẻ đường dẫn Bảng giá hay Tính năng lên mạng xã hội đều hiện
  // thẻ của TRANG CHỦ: cùng một tấm ảnh, cùng một câu chào, không ai biết mình
  // sắp mở trang nào.
  return {
    title: tieuDe,
    description: moTa,
    alternates: { canonical: "/tinh-nang" },
    openGraph: { type: "website", url: "/tinh-nang", title: tieuDe, description: moTa },
    twitter: { card: "summary_large_image", title: tieuDe, description: moTa },
  };
}

/**
 * /tinh-nang (ADR-0012 mục 4 + mục 8) — 9 nhóm theo ngôn ngữ thị trường
 * (GROUP_REGISTRY), mở ra thấy đủ mảng bên trong (MODULE_REGISTRY lọc theo
 * groupId). Tên/mô tả/trạng thái mọi mảng đọc từ feature-registry.ts +
 * landing.modules.* — cấm gõ tay (D1). KHÔNG in tổng số tính năng (mục 8).
 */
export default async function TinhNangPage() {
  // Thử nghiệm A/B (#336): nếu đang có thử nghiệm cho trang này thì dùng câu
  // của HÔM NAY; không có thì dùng câu gốc trong kho câu chữ.
  const tn = await cauThuNghiem("/tinh-nang");
  const [t, tModules] = await Promise.all([
    getTranslations("tinhNang"),
    getTranslations("landing.modules"),
  ]);

  return (
    <>
      <LandingHeader />
      <main id="noi-dung-chinh" className="flex-1">
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
            {GROUP_REGISTRY.map((group, gi) => {
              const mods = MODULE_REGISTRY.filter((m) => m.groupId === group.id);
              return (
                <Reveal key={group.id} delay={gi * 40} className={gi > 0 ? "mt-8" : undefined}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {gi + 1} · {t(`groups.${group.id}.title`)}
                  </p>
                  {t.has(`groups.${group.id}.subtitle`) && (
                    <p className="mt-0.5 text-xs text-muted-foreground/80">
                      {t(`groups.${group.id}.subtitle`)}
                    </p>
                  )}
                  <div className="mt-2 rounded-xl border bg-card px-4">
                    {mods.map((mod, mi) => (
                      <div
                        key={mod.key}
                        className={`flex gap-3 py-3 ${mi < mods.length - 1 ? "border-b" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug">
                            {tModules(`${mod.key}.name`)}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            {tModules(`${mod.key}.desc`)}
                            {tModules.has(`${mod.key}.note`) && (
                              <span className="text-muted-foreground/70"> {tModules(`${mod.key}.note`)}.</span>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <StatusBadge status={mod.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Reveal>
              );
            })}
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
                <Link href="/signup">{tn?.cau ?? t("cta")}</Link>
              </Button>
            </Reveal>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
