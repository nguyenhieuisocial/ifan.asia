import type { LucideIcon } from "lucide-react";
import { CalendarClock, Layers, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";

/**
 * "Bốn điều đối thủ không làm được" + "Miễn phí thế nào" (thẻ
 * landing-khac-biet-va-mien-phi) — thay hẳn why-and-pricing.tsx (bảng giá 4
 * gói cũ đã bị founder bác 13/08). ADR-0011 mục 4c: giá gói trả phí CHƯA
 * công bố — khối này chỉ hiện số thật của gói Miễn phí, gói trả phí ghi
 * "công bố khi mở bán" kèm 3 cam kết. Bảng đối chiếu giá đối thủ nằm ở
 * /bang-gia, không lặp ở đây.
 */
const DIFFS: { id: "booking" | "industry" | "pricing" | "selfServe"; icon: LucideIcon }[] = [
  { id: "booking", icon: CalendarClock },
  { id: "industry", icon: Layers },
  { id: "pricing", icon: UsersRound },
  { id: "selfServe", icon: ShieldCheck },
];

export async function DifferentiatorsAndFree() {
  const t = await getTranslations("landing.diff");
  const tFree = await getTranslations("landing.free");
  return (
    <>
      <section className="border-b">
        <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
          <Reveal>
            <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
              {t("title")}
            </h2>
            <p className="mt-3 text-center text-muted-foreground">
              {t("subtitle")}
            </p>
          </Reveal>
          <Reveal
            className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2"
            delay={80}
          >
            {DIFFS.map(({ id, icon: Icon }) => (
              <div key={id} className="rounded-lg border bg-card p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Icon aria-hidden className="size-4 shrink-0 text-primary" />
                  {t(`${id}Title`)}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t(`${id}Desc`)}
                </p>
                <p className="mt-2.5 border-t pt-2.5 text-[11px] leading-relaxed text-muted-foreground/80">
                  {t(`${id}Why`)}
                </p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-b bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
          <Reveal>
            <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
              {tFree("title")}
            </h2>
            <p className="mt-3 text-center text-muted-foreground">
              {tFree("subtitle")}
            </p>
          </Reveal>
          <Reveal
            className="mt-10 overflow-hidden rounded-xl border bg-card"
            delay={80}
          >
            <div className="grid sm:grid-cols-2">
              <div className="border-b p-6 sm:border-r sm:border-b-0">
                <StatusPill state="ready">{tFree("nowLabel")}</StatusPill>
                <p className="mt-3 text-base font-semibold">{tFree("freeName")}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {tFree("freeDesc")}
                </p>
                <p className="mt-4 text-base font-semibold">{tFree("trialName")}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {tFree("trialDesc")}
                </p>
              </div>
              <div className="p-6">
                <StatusPill state="planned">{tFree("laterLabel")}</StatusPill>
                <p className="mt-3 text-base font-semibold">{tFree("paidName")}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {tFree("paidDesc")}
                </p>
                <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                  <li>{tFree("commit1")}</li>
                  <li>{tFree("commit2")}</li>
                  <li>{tFree("commit3")}</li>
                </ul>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t bg-card px-6 py-4">
              <Button asChild>
                <Link href="/signup">{tFree("cta")}</Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {tFree("ctaNote")}
              </span>
            </div>
          </Reveal>
          <Reveal className="mt-4 flex justify-center" delay={120}>
            <Link
              href="/bang-gia"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {tFree("seeCompare")}
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function StatusPill({
  state,
  children,
}: {
  state: "ready" | "planned";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
        state === "ready"
          ? "bg-status-closed text-status-closed-foreground"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          state === "ready" ? "bg-status-closed-foreground" : "bg-muted-foreground"
        }`}
      />
      {children}
    </span>
  );
}
