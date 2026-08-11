import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  ChartColumn,
  Heart,
  MessageSquare,
  Sparkle,
  SquareCheckBig,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/landing/reveal";
import { StatusBadge } from "@/components/landing/status-badge";
import { FEATURE_REGISTRY, TRUCS, type Truc } from "@/lib/feature-registry";

/**
 * Lưới 6 trục (thẻ landing-6-truc) — bố cục khóa cứng: 3 cột desktop, tự
 * xuống 2 rồi 1 cột khi hẹp. Trạng thái từng dòng đọc từ lib/feature-registry.ts
 * (luật D1) — component này KHÔNG tự gõ chữ "Sẵn sàng" ở đâu cả.
 */
const TRUC_ICONS: Record<Truc, LucideIcon> = {
  ban: MessageSquare,
  cham: Heart,
  viec: SquareCheckBig,
  tien: Banknote,
  baocao: ChartColumn,
  ai: Sparkle,
};

export async function TrucGrid() {
  const [t, tFeature] = await Promise.all([
    getTranslations("landing.truc"),
    getTranslations("landing.features"),
  ]);
  return (
    <section id="features" className="scroll-mt-20 border-b bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <Reveal>
          <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-center text-muted-foreground">
            {t("subtitle")}
          </p>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TRUCS.map((truc, i) => {
            const Icon = TRUC_ICONS[truc];
            return (
              <Reveal key={truc} className="grid" delay={i * 80}>
                {/* truc-card: hover nâng nhẹ + viền cam ấm dần (globals.css) */}
                <div className="truc-card rounded-xl border bg-card p-5 text-card-foreground">
                  <p className="flex items-center gap-2 text-sm font-semibold tracking-wider uppercase">
                    <Icon aria-hidden className="size-4.5 shrink-0 text-primary" />
                    {t(truc)}
                  </p>
                  <ul className="mt-3.5 flex flex-col gap-2">
                    {FEATURE_REGISTRY.filter((f) => f.truc === truc).map(
                      (f) => (
                        // Chữ + huy hiệu cùng hàng: chữ dài xuống dòng trong
                        // phần chữ (min-w-0 flex-1), huy hiệu shrink-0 không rơi.
                        <li
                          key={f.key}
                          className="flex items-center gap-2 text-sm leading-snug"
                        >
                          <span className="min-w-0 flex-1">
                            {tFeature(f.key)}
                          </span>
                          <StatusBadge
                            variant={
                              f.status === "ready" ? "available" : "coming"
                            }
                          />
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
