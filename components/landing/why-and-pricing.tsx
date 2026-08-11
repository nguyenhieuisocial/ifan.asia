import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  ChartColumn,
  Lock,
  MessageSquare,
  Smartphone,
  Zap,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/landing/reveal";
import { PLANS, Pricing } from "@/components/landing/pricing";
import { defaultLocale, isLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";

/**
 * "Vì sao tiệm nhỏ chọn iFan" + dải 4 gói rút gọn (thẻ landing-vi-sao-va-gia),
 * bảng giá chi tiết (pricing.tsx cũ, nguồn sự thật public.plans) đứng ngay dưới.
 * Dải rút gọn đọc CÙNG danh sách PLANS với bảng chi tiết — một con số, một chỗ.
 */
const REASONS: { id: "r1" | "r2" | "r3" | "r4" | "r5" | "r6"; icon: LucideIcon }[] = [
  { id: "r1", icon: Zap },
  { id: "r2", icon: Banknote },
  { id: "r3", icon: MessageSquare },
  { id: "r4", icon: Smartphone },
  { id: "r5", icon: ChartColumn },
  { id: "r6", icon: Lock },
];

export async function WhyAndPricing() {
  const [t, tPricing, tLimits, rawLocale] = await Promise.all([
    getTranslations("landing.why"),
    getTranslations("landing.pricing"),
    // Cùng câu hạn mức với màn "Gói của tôi" và bảng giá chi tiết — trang bán
    // và trong app không nói hai kiểu về cùng một con số.
    getTranslations("billing.limits"),
    getLocale(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const nf = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US");

  return (
    <>
      <section className="border-b">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <Reveal>
            <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
              {t("title")}
            </h2>
          </Reveal>
          {/* 6 lý do đối chứng thật — 2 cột desktop, 1 cột khi hẹp */}
          <Reveal
            className="mx-auto mt-10 grid max-w-3xl gap-x-10 gap-y-6 sm:grid-cols-2"
            delay={80}
          >
            {REASONS.map(({ id, icon: Icon }) => (
              <p
                key={id}
                className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"
              >
                <Icon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />
                <span className="min-w-0">
                  <span className="font-semibold text-foreground">
                    {t(`${id}Title`)}
                  </span>{" "}
                  {t(`${id}Desc`)}
                </span>
              </p>
            ))}
          </Reveal>
          {/* Dải 4 gói rút gọn: tên + giá + 2 hạn mức so được bằng mắt; bấm
              vào xem bảng chi tiết (#pricing ngay dưới). Gói nổi bật duy nhất
              viền cam + nhãn "Phổ biến". */}
          <Reveal
            className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-4 lg:grid-cols-4"
            delay={160}
          >
            {PLANS.map(({ ns, price, aiCalls, maxMembers, popular }) => (
              <a
                key={ns}
                href="#pricing"
                className={`hover-lift relative block rounded-lg border bg-card p-4 text-card-foreground ${
                  popular ? "border-primary" : ""
                }`}
              >
                {popular && (
                  <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    {tPricing("popular")}
                  </Badge>
                )}
                <p className="text-sm font-semibold">{tPricing(`${ns}.name`)}</p>
                {/* data-countup: giá đếm chạy khi vào tầm nhìn (landing-fx.tsx
                    khóa min-width trước khi đếm → không xê dịch; 0đ đứng yên) */}
                <p className="mt-1.5 text-lg font-semibold tabular-nums">
                  <span data-countup>{formatMoney(price, locale)}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {tPricing("perMonth")}
                  </span>
                </p>
                <p
                  className={`mt-1.5 text-xs leading-relaxed ${
                    maxMembers === null
                      ? "font-semibold"
                      : "text-muted-foreground"
                  }`}
                >
                  {maxMembers === null
                    ? tLimits("membersUnlimited")
                    : tLimits("members", { n: nf.format(maxMembers) })}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {tLimits("ai", { n: nf.format(aiCalls) })}
                </p>
              </a>
            ))}
          </Reveal>
        </div>
      </section>
      <Pricing />
    </>
  );
}
