import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/header";
import { LandingFooter } from "@/components/landing/footer";
import { Reveal } from "@/components/landing/reveal";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getIndustryPackPublic } from "@/lib/industry-public";
import { capitalizeFirst } from "@/lib/tenant-pack";
import { SPOTLIGHT_INDUSTRIES } from "@/lib/industries";

// Trang công khai, không đăng nhập, dữ liệu đọc live từ industry_packs qua
// RPC (như storefront page) — createClient() chạm cookies() nên buộc động,
// không dùng force-static (sẽ lỗi build "Dynamic server usage").
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return SPOTLIGHT_INDUSTRIES.map((slug) => ({ slug }));
}

function isSpotlight(slug: string): slug is (typeof SPOTLIGHT_INDUSTRIES)[number] {
  return (SPOTLIGHT_INDUSTRIES as readonly string[]).includes(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSpotlight(slug)) return {};
  const t = await getTranslations(`nganh.${slug}`);
  const tieuDe = `${t("headline")} — iFan.asia`;
  const moTa = t("subheadline");
  return {
    title: tieuDe,
    description: moTa,
    alternates: { canonical: `/nganh/${slug}` },
    openGraph: { type: "website", url: `/nganh/${slug}`, title: tieuDe, description: moTa },
    twitter: { card: "summary_large_image", title: tieuDe, description: moTa },
  };
}

/**
 * /nganh/[slug] × 6 (ADR-0011 mục 5.3, thẻ design trang-theo-nganh.html) —
 * hero + "Bấm một cái, có sẵn ngay" tĩnh + đọc LIVE từ industry_packs qua
 * RPC industry_pack_view (migration #86). Cấm chép tay dịch vụ/nhãn/bước —
 * chép tay là trang và pack lệch nhau khi pack đổi (D2).
 *
 * shop/retail/fnb KHÔNG có dịch vụ mẫu trong seed thật (booking không áp
 * dụng ba ngành này) — khối "Bảng giá dịch vụ" tự ẩn khi services rỗng,
 * không bịa dữ liệu để lấp chỗ trống.
 */
export default async function NganhPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSpotlight(slug)) notFound();

  const [t, tCommon, tIndustries] = await Promise.all([
    getTranslations(`nganh.${slug}`),
    getTranslations("nganh.common"),
    getTranslations("common.industries"),
  ]);

  const supabase = await createClient();
  const pack = await getIndustryPackPublic(supabase, slug);

  const hasGrid =
    pack &&
    ((pack.services && pack.services.length > 0) ||
      (pack.sample_data?.tags && pack.sample_data.tags.length > 0) ||
      (pack.pipeline_stages && pack.pipeline_stages.length > 0) ||
      pack.terminology);

  return (
    <>
      <LandingHeader />
      <main id="noi-dung-chinh" className="flex-1">
        <section className="border-b bg-primary/5">
          <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
            <Reveal>
              <span className="inline-flex items-center rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
                {t("badge")}
              </span>
              <h1 className="mt-3 max-w-xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                {t("headline")}
              </h1>
              <p className="mt-3 max-w-xl text-muted-foreground">{t("subheadline")}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild className="hover-lift btn-sheen">
                  <Link href="/signup">{t("ctaPrimary")}</Link>
                </Button>
                <Button variant="outline" asChild className="hover-lift">
                  <Link href="/tinh-nang">{tCommon("ctaSecondary")}</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>

        {hasGrid && (
          <section className="border-b">
            <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
              <Reveal>
                <h2 className="font-display text-xl font-semibold">{tCommon("gridTitle")}</h2>
              </Reveal>
              <Reveal delay={60} className="mt-5 grid gap-3 sm:grid-cols-2">
                {pack?.services && pack.services.length > 0 && (
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                      {tCommon("servicesLabel")}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed">
                      {pack.services.map((s, i) => (
                        <span key={s.name}>
                          {i > 0 && <br />}
                          {s.name} · {s.duration_minutes}′
                        </span>
                      ))}
                    </p>
                  </div>
                )}
                {pack?.sample_data?.tags && pack.sample_data.tags.length > 0 && (
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                      {tCommon("tagsLabel")}
                    </p>
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      {pack.sample_data.tags.slice(0, 6).map((tag) => (
                        <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {tag}
                        </span>
                      ))}
                    </p>
                  </div>
                )}
                {pack?.pipeline_stages && pack.pipeline_stages.length > 0 && (
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                      {tCommon("pipelineLabel")}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed">{pack.pipeline_stages.join(" → ")}</p>
                  </div>
                )}
                {pack?.terminology && (pack.terminology.contact || pack.terminology.deal) && (
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                      {tCommon("terminologyLabel")}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed">
                      {pack.terminology.contact && (
                        <>
                          {capitalizeFirst(pack.terminology.contact)}{" "}
                          <span className="text-muted-foreground">{tCommon("contactNote")}</span>
                          <br />
                        </>
                      )}
                      {pack.terminology.deal && (
                        <>
                          {capitalizeFirst(pack.terminology.deal)}{" "}
                          <span className="text-muted-foreground">{tCommon("dealNote")}</span>
                        </>
                      )}
                    </p>
                  </div>
                )}
              </Reveal>
            </div>
          </section>
        )}

        <section className="border-b bg-muted/40">
          <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
            <Reveal>
              <h2 className="font-display text-xl font-semibold">{t("dailyTitle")}</h2>
              <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
                <li>· {t("daily1")}</li>
                <li>· {t("daily2")}</li>
                <li>· {t("daily3")}</li>
              </ul>
            </Reveal>
          </div>
        </section>

        <section>
          <div className="mx-auto w-full max-w-3xl px-6 py-10">
            <Reveal className="flex flex-wrap items-center gap-3">
              {SPOTLIGHT_INDUSTRIES.filter((k) => k !== slug).map((k) => (
                <Link
                  key={k}
                  href={`/nganh/${k}`}
                  className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {tIndustries(`${k}.label`)}
                </Link>
              ))}
            </Reveal>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
