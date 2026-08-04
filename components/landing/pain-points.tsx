import { getTranslations } from "next-intl/server";
import { TileContact } from "@/components/illustrations/tile-contact";
import { TileMessage } from "@/components/illustrations/tile-message";
import { TileSpark } from "@/components/illustrations/tile-spark";
import { Reveal } from "@/components/landing/reveal";

export async function PainPoints() {
  const t = await getTranslations("landing.pains");
  // Gạch gốm thay icon lucide: tin nhắn rải rác / sổ khách / trả lời trễ
  const pains = [
    { Tile: TileMessage, title: t("p1Title"), desc: t("p1Desc") },
    { Tile: TileContact, title: t("p2Title"), desc: t("p2Desc") },
    { Tile: TileSpark, title: t("p3Title"), desc: t("p3Desc") },
  ];
  return (
    <section className="border-b bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <Reveal>
          <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
            {t("title")}
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {pains.map(({ Tile, title, desc }, i) => (
            <Reveal key={title} className="grid" delay={i * 80}>
              <div className="hover-lift rounded-xl border bg-card p-6">
                <Tile className="size-10" />
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
