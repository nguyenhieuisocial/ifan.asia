import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { defaultLocale, isLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";

const PLANS = [
  { ns: "trial", price: null, features: ["f1", "f2", "f3"], popular: false },
  { ns: "basic", price: 199_000, features: ["f1", "f2", "f3"], popular: false },
  {
    ns: "growth",
    price: 399_000,
    features: ["f1", "f2", "f3", "f4"],
    popular: true,
  },
] as const;

export async function Pricing() {
  const [t, rawLocale] = await Promise.all([
    getTranslations("landing.pricing"),
    getLocale(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;

  return (
    <section id="pricing" className="scroll-mt-20 border-b bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <h2 className="text-center text-2xl font-semibold sm:text-3xl">
          {t("title")}
        </h2>
        <p className="mt-3 text-center text-muted-foreground">{t("subtitle")}</p>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {t("note")}
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PLANS.map(({ ns, price, features, popular }) => (
            <div
              key={ns}
              className={`relative flex flex-col rounded-xl border bg-card p-6 ${
                popular ? "border-primary" : ""
              }`}
            >
              {popular && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  {t("popular")}
                </Badge>
              )}
              <h3 className="text-base font-semibold">{t(`${ns}.name`)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`${ns}.tagline`)}
              </p>
              <p className="mt-4 text-3xl font-semibold">
                {price === null ? (
                  t("free")
                ) : (
                  <>
                    {formatMoney(price, locale)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {t("perMonth")}
                    </span>
                  </>
                )}
              </p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2.5 text-sm leading-relaxed"
                  >
                    <Check
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-primary"
                    />
                    {t(`${ns}.${f}`)}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={popular ? "default" : "outline"}
                className="mt-6 w-full"
              >
                <Link href="/signup">{t("cta")}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
