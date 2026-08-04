import { getTranslations } from "next-intl/server";
import { Check, Inbox, Sparkles, Users } from "lucide-react";

const FEATURES = [
  { ns: "inbox", icon: Inbox, bullets: ["b1", "b2", "b3", "b4"] },
  { ns: "crm", icon: Users, bullets: ["b1", "b2", "b3"] },
  { ns: "ai", icon: Sparkles, bullets: ["b1", "b2", "b3"] },
] as const;

export async function Features() {
  const t = await getTranslations("landing.features");
  return (
    <section id="features" className="scroll-mt-20 border-b">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
          {t("title")}
        </h2>
        <div className="mt-10 flex flex-col gap-6">
          {FEATURES.map(({ ns, icon: Icon, bullets }) => (
            <article
              key={ns}
              className="grid gap-8 rounded-xl border bg-card p-6 sm:p-8 md:grid-cols-2 md:items-center"
            >
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Icon aria-hidden className="size-4" />
                  {t(`${ns}.label`)}
                </p>
                <h3 className="mt-3 text-xl font-semibold sm:text-2xl">
                  {t(`${ns}.title`)}
                </h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  {t(`${ns}.description`)}
                </p>
              </div>
              <ul className="flex flex-col gap-3">
                {bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-3 rounded-lg bg-muted/50 px-4 py-3 text-sm leading-relaxed"
                  >
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                    {t(`${ns}.${b}`)}
                  </li>
                ))}
              </ul>
              <p className="border-t pt-4 text-sm font-medium leading-relaxed md:col-span-2">
                {t(`${ns}.impact`)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
