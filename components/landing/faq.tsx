import { getTranslations } from "next-intl/server";
import { ChevronDown } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

const ITEMS = [1, 2, 3, 4, 5] as const;

export async function Faq() {
  const t = await getTranslations("landing.faq");
  return (
    <section id="faq" className="scroll-mt-20 border-b">
      <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
        <Reveal>
          <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
            {t("title")}
          </h2>
        </Reveal>
        <Reveal className="mt-8 flex flex-col gap-3" delay={80}>
          {ITEMS.map((i) => (
            <details key={i} className="group rounded-lg border bg-card px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                {t(`q${i}`)}
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
                />
              </summary>
              <p className="pt-3 text-sm leading-relaxed text-muted-foreground">
                {t(`a${i}`)}
              </p>
              <p className="pt-2 text-sm font-semibold leading-relaxed">
                {t(`eq${i}`)}
              </p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
