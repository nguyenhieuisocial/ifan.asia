import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";
import {
  StatusBadge,
  type StatusBadgeVariant,
} from "@/components/landing/status-badge";
import { defaultLocale, isLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";

/**
 * Giá + hạn mức chép từ bảng `public.plans` (migration #27) — bảng đó là NGUỒN
 * SỰ THẬT DUY NHẤT. Đổi giá trong DB thì phải đổi đúng con số ở đây.
 *
 * `ns` là khóa i18n có sẵn, KHÔNG trùng mã gói trong DB:
 *   trial → free · basic → basic · growth → pro · business → business
 * (giữ tên khóa cũ để không phá messages/*.json; chữ hiển thị đã khớp DB).
 *
 * Trạng thái tính năng nói thật theo sản phẩm hôm nay: Zalo OA + trợ lý AI = sắp có.
 */
const PLANS = [
  {
    ns: "trial", // DB: free
    price: 0,
    priceYear: 0,
    aiCalls: 20,
    maxMembers: 3,
    features: [
      { key: "f1", status: "available" },
      { key: "f2", status: "available" },
      { key: "f3", status: "available" },
    ],
    popular: false,
  },
  {
    ns: "basic", // DB: basic
    price: 199_000,
    priceYear: 2_029_800,
    aiCalls: 200,
    maxMembers: 10,
    features: [
      { key: "f1", status: "coming" },
      { key: "f2", status: "available" },
    ],
    popular: false,
  },
  {
    ns: "growth", // DB: pro
    price: 399_000,
    priceYear: 4_069_800,
    aiCalls: 1_000,
    maxMembers: 30,
    features: [
      { key: "f1", status: "available" },
      { key: "f2", status: "coming" },
      { key: "f4", status: "available" },
    ],
    popular: true,
  },
  {
    ns: "business", // DB: business — null = không giới hạn người dùng
    price: 799_000,
    priceYear: 8_149_800,
    aiCalls: 5_000,
    maxMembers: null,
    features: [
      { key: "f1", status: "available" },
      { key: "f2", status: "available" },
    ],
    popular: false,
  },
] as const;

export async function Pricing() {
  const [t, tLimits, rawLocale] = await Promise.all([
    getTranslations("landing.pricing"),
    // Dùng lại đúng câu hạn mức của màn "Gói của tôi" — trang bán và trong app
    // không được nói hai kiểu về cùng một con số.
    getTranslations("billing.limits"),
    getLocale(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  // ICU `{n}` không tự chấm phần nghìn → tự định dạng để "1.000 lượt" đọc
  // giống "199.000đ" ngay cạnh nó.
  const nf = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US");

  return (
    <section id="pricing" className="scroll-mt-20 border-b bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <Reveal>
          <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-center text-muted-foreground">
            {t("subtitle")}
          </p>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {t("note")}
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm font-semibold">
            {t("eq")}
          </p>
        </Reveal>
        {/* 4 gói: xếp dọc ở điện thoại → 2 cột từ 640px → 4 cột từ 1024px.
            Xếp dọc (không cuộn ngang) để khớp cách các khối khác của landing
            xử lý màn hẹp, và để gói nào cũng được nhìn thấy. */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map(
            (
              { ns, price, priceYear, aiCalls, maxMembers, features, popular },
              i,
            ) => {
              // Hạn mức lên đầu để đọc ngang 4 gói là so được ngay; gói Doanh
              // nghiệp nhờ vậy khoe đúng thứ chủ chuỗi cần: không giới hạn người.
              const bullets: {
                id: string;
                text: string;
                status: StatusBadgeVariant;
                strong?: boolean;
              }[] = [
                {
                  id: "members",
                  text:
                    maxMembers === null
                      ? tLimits("membersUnlimited")
                      : tLimits("members", { n: nf.format(maxMembers) }),
                  status: "available",
                  strong: maxMembers === null,
                },
                {
                  id: "ai",
                  text: tLimits("ai", { n: nf.format(aiCalls) }),
                  status: "coming",
                },
                ...features.map(({ key, status }) => ({
                  id: key,
                  text: t(`${ns}.${key}`),
                  status: status as StatusBadgeVariant,
                })),
              ];

              return (
                <Reveal key={ns} className="grid" delay={i * 80}>
                  <div
                    className={`hover-lift relative flex flex-col rounded-xl border bg-card p-6 ${
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
                    <p className="mt-4 text-2xl font-semibold sm:text-3xl">
                      {formatMoney(price, locale)}
                      <span className="text-sm font-normal text-muted-foreground">
                        {t("perMonth")}
                      </span>
                    </p>
                    {priceYear > 0 && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t("perYearLine", {
                          price: formatMoney(priceYear, locale),
                          saving: formatMoney(price * 12 - priceYear, locale),
                        })}
                      </p>
                    )}
                    <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                      {bullets.map(({ id, text, status, strong }) => (
                        <li
                          key={id}
                          className="flex items-start gap-2.5 text-sm leading-relaxed"
                        >
                          <Check
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-primary"
                          />
                          <span
                            className={`flex-1 ${strong ? "font-semibold" : ""}`}
                          >
                            {text}
                          </span>
                          <StatusBadge variant={status} />
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
                </Reveal>
              );
            },
          )}
        </div>
      </div>
    </section>
  );
}
