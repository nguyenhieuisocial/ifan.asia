import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/landing/reveal";
import { StatusBadge } from "@/components/landing/status-badge";
import { MODULE_REGISTRY } from "@/lib/feature-registry";

/**
 * "Một ngày của chủ tiệm" (thẻ landing-mot-ngay) — thay hẳn truc-grid.tsx
 * (lưới 6 trục) và story-flow.tsx (3 luồng) của bản cũ. ADR-0011 mục 5: cấm
 * đua số module — tầm vóc hiện qua ĐỘ PHỦ MỘT NGÀY, không qua đếm mảng.
 *
 * Mỗi chặng trỏ tới ĐÚNG một khóa trong feature-registry.ts — huy hiệu đọc
 * status thật từ đó (D1), không gõ tay "ready"/"building"/"planned" ở đây.
 * Cố ý xen chặng "planned" (18:00) vào giữa mạch thay vì giấu ở cuối — nói
 * thẳng chỗ thiếu ngay lúc kể, không để người dùng tự phát hiện sau.
 */
const STEPS = [
  { time: "7:00", id: "open", moduleKey: "today" },
  { time: "8:30", id: "inbox", moduleKey: "inbox" },
  { time: "10:00", id: "booking", moduleKey: "booking" },
  { time: "12:00", id: "ai", moduleKey: "aiWork" },
  { time: "15:00", id: "tasks", moduleKey: "tasks" },
  { time: "18:00", id: "closeBooks", moduleKey: "orders" },
  { time: "monthEnd", id: "sources", moduleKey: "reports" },
] as const;

export async function OneDayFlow() {
  const t = await getTranslations("landing.oneDay");
  return (
    <section id="features" className="scroll-mt-20 border-b bg-muted/40">
      <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
        <Reveal>
          <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-center text-muted-foreground">
            {t("subtitle")}
          </p>
        </Reveal>
        <Reveal className="mt-10 rounded-xl border bg-card px-5" delay={80}>
          {STEPS.map((step, i) => {
            const mod = MODULE_REGISTRY.find((m) => m.key === step.moduleKey);
            if (!mod) return null; // an toàn kiểu — không rớt trang nếu khóa lệch
            return (
              <div
                key={step.id}
                className={`flex gap-4 py-4 ${
                  i < STEPS.length - 1 ? "border-b" : ""
                }`}
              >
                <span className="w-16 shrink-0 pt-0.5 text-sm font-semibold text-primary">
                  {step.time === "monthEnd" ? t("monthEnd") : step.time}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">
                    {t(`steps.${step.id}.title`)}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {t(`steps.${step.id}.desc`)}
                  </p>
                </div>
                <div className="shrink-0 pt-0.5">
                  <StatusBadge status={mod.status} />
                </div>
              </div>
            );
          })}
        </Reveal>
        <Reveal className="mt-4 flex items-center justify-center gap-2" delay={120}>
          <Link
            href="/tinh-nang"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("seeAll")}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
