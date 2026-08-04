import { getTranslations } from "next-intl/server";
import { BookOpen, Clock, Smartphone } from "lucide-react";

export async function PainPoints() {
  const t = await getTranslations("landing.pains");
  const pains = [
    { icon: Smartphone, title: t("p1Title"), desc: t("p1Desc") },
    { icon: BookOpen, title: t("p2Title"), desc: t("p2Desc") },
    { icon: Clock, title: t("p3Title"), desc: t("p3Desc") },
  ];
  return (
    <section className="border-b bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
          {t("title")}
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {pains.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border bg-card p-6">
              <Icon aria-hidden className="size-5 text-primary" />
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
