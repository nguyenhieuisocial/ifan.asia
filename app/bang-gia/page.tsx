import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/header";
import { LandingFooter } from "@/components/landing/footer";
import { Reveal } from "@/components/landing/reveal";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bangGia");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

// Đối chiếu 9 đối thủ (ADR-0011 mục 4c.3, thẻ design trang-bang-gia.html) —
// giá tra ngày 13/08/2026 từ trang chính thức từng hãng. `method` là khoá
// dịch qua bangGia.methods.* (D1: số không đổi theo ngôn ngữ, cách gọi có).
const COMPETITORS: { name: string; small: number; big: number | null; method: string }[] = [
  { name: "Myspa (spa)", small: 199_000, big: null, method: "cap5" },
  { name: "EasySalon (spa)", small: 240_000, big: null, method: "branch" },
  { name: "Sapo", small: 249_000, big: 249_000, method: "store" },
  { name: "KiotViet", small: 330_000, big: 330_000, method: "branch" },
  { name: "Fresha", small: 520_000, big: 3_120_000, method: "perPerson" },
  { name: "Getfly CRM", small: 780_000, big: 1_568_000, method: "perPerson" },
  { name: "CNV Work", small: 750_000, big: 3_000_000, method: "perPerson" },
  { name: "Haravan", small: 300_000, big: 3_000_000, method: "cap10" },
  { name: "Zoho CRM", small: 1_822_000, big: 10_934_000, method: "perPerson" },
];

/**
 * /bang-gia (ADR-0011 mục 4c + 5.3, thẻ design trang-bang-gia.html) — trạng
 * thái TIỀN-MỞ-BÁN: gói Miễn phí hiện SỐ THẬT, gói trả phí ghi rõ "công bố
 * khi mở bán" kèm 3 cam kết (ADR mục 4c.6 — cấm đưa giá 79k/99k nội bộ lên
 * trang công khai trước ngày mở bán).
 */
export default async function BangGiaPage() {
  const [t, locale] = await Promise.all([getTranslations("bangGia"), getLocale()]);
  const money = (v: number) => formatMoney(v, locale as Locale);

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

            <Reveal delay={60} className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="overflow-hidden rounded-xl border">
                <div className="border-b p-5">
                  <p className="text-sm font-semibold">{t("free.name")}</p>
                  <p className="mt-1 text-2xl font-semibold leading-none">{t("free.price")}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{t("free.priceNote")}</p>
                </div>
                <div className="p-5">
                  <ul className="flex flex-col gap-1.5 text-sm">
                    <li>✓ {t("free.f1")}</li>
                    <li>✓ {t("free.f2")}</li>
                    <li>✓ {t("free.f3")}</li>
                    <li>✓ {t("free.f4")}</li>
                    <li>✓ {t("free.f5")}</li>
                  </ul>
                  <Button variant="outline" asChild className="mt-4">
                    <Link href="/signup">{t("free.cta")}</Link>
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-primary/40">
                <div className="border-b bg-primary/5 p-5">
                  <p className="text-sm font-semibold">{t("paid.name")}</p>
                  <p className="mt-1.5 text-base font-semibold leading-tight text-primary">{t("paid.price")}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{t("paid.priceNote")}</p>
                </div>
                <div className="p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                    {t("paid.commitLabel")}
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1.5 text-sm">
                    <li>✓ {t("paid.f1")}</li>
                    <li>✓ {t("paid.f2")}</li>
                    <li>✓ {t("paid.f3")}</li>
                  </ul>
                  <Button asChild className="mt-4 hover-lift btn-sheen">
                    <Link href="/signup">{t("paid.cta")}</Link>
                  </Button>
                </div>
              </div>
            </Reveal>

            <Reveal delay={100} className="mt-4 rounded-lg border bg-primary/5 p-4">
              <p className="text-sm font-semibold">{t("trialTitle")}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t("trialDesc")}</p>
            </Reveal>
          </div>
        </section>

        <section className="border-b bg-muted/40">
          <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
            <Reveal>
              <h2 className="font-display text-xl font-semibold">{t("whyTitle")}</h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t("whyDesc")}</p>
            </Reveal>
            <Reveal delay={60} className="mt-5 overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-semibold">{t("colProduct")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("colSmall")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("colBig")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("colMethod")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-primary/5">
                    <td className="px-3 py-2.5 font-semibold">{t("ifanLabel")}</td>
                    <td colSpan={2} className="px-3 py-2.5 text-center font-semibold text-primary">
                      {t("ifanCell")}
                    </td>
                    <td className="px-3 py-2.5 font-semibold">{t("ifanMethod")}</td>
                  </tr>
                  {COMPETITORS.map((c) => (
                    <tr key={c.name} className="border-b last:border-b-0">
                      <td className="px-3 py-2.5">{c.name}</td>
                      <td className="px-3 py-2.5">{money(c.small)}</td>
                      <td className="px-3 py-2.5">{c.big !== null ? money(c.big) : "—"}</td>
                      <td className="px-3 py-2.5">{t(`methods.${c.method}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
            <p className="mt-2 text-xs text-muted-foreground/80">{t("tableNote")}</p>
          </div>
        </section>

        <section className="border-b">
          <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
            <Reveal>
              <h2 className="font-display text-xl font-semibold">{t("faqTitle")}</h2>
            </Reveal>
            <Reveal delay={60} className="mt-4 rounded-xl border bg-card p-5">
              {[1, 2, 3, 4].map((i, idx) => (
                <div key={i} className={idx > 0 ? "mt-4" : undefined}>
                  <p className="text-sm font-semibold">{t(`faq${i}q`)}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`faq${i}a`)}</p>
                </div>
              ))}
            </Reveal>
            <Reveal delay={100} className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm leading-relaxed text-destructive">{t("notPublishedNote")}</p>
            </Reveal>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
