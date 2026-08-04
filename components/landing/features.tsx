import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Check, Inbox, Sparkles, Users } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import inboxShot from "@/public/screens/inbox.png";
import contactsShot from "@/public/screens/contacts.png";
import aiShot from "@/public/screens/ai.png";

// Ảnh sản phẩm THẬT chụp từ tiệm demo "Spa Hương Sen":
// inbox → block Hộp thư (bubbles + ghi chú nội bộ + chip 48h),
// contacts → block CRM (điểm/phân hạng/thẻ),
// ai → block Trợ lý AI (hàng nút Trợ lý AI ngay trong hộp thư).
const FEATURES = [
  { ns: "inbox", icon: Inbox, bullets: ["b1", "b2", "b3", "b4"], shot: inboxShot },
  { ns: "crm", icon: Users, bullets: ["b1", "b2", "b3"], shot: contactsShot },
  { ns: "ai", icon: Sparkles, bullets: ["b1", "b2", "b3"], shot: aiShot },
] as const;

export async function Features() {
  const t = await getTranslations("landing.features");
  return (
    <section id="features" className="scroll-mt-20 border-b">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <Reveal>
          <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
            {t("title")}
          </h2>
        </Reveal>
        <div className="mt-10 flex flex-col gap-6">
          {FEATURES.map(({ ns, icon: Icon, bullets, shot }) => (
            <Reveal key={ns}>
              <article className="hover-lift grid gap-8 rounded-xl border bg-card p-6 sm:p-8 lg:grid-cols-2 lg:items-center">
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
                  <ul className="mt-6 flex flex-col gap-3">
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
                </div>
                <Image
                  src={shot}
                  alt={t(`${ns}.imageAlt`)}
                  className="w-full rounded-lg border shadow-sm"
                  sizes="(min-width: 1024px) 512px, (min-width: 640px) 90vw, 100vw"
                />
                <p className="border-t pt-4 text-sm font-medium leading-relaxed lg:col-span-2">
                  {t(`${ns}.impact`)}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
