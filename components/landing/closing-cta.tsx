import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export async function ClosingCta() {
  const t = await getTranslations("landing.closing");
  return (
    <section className="border-b bg-muted/40">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-6 py-16 text-center sm:py-20">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">
          {t("title")}
        </h2>
        <p className="text-muted-foreground">{t("subtitle")}</p>
        <Button size="lg" asChild className="mt-2">
          <Link href="/signup">{t("cta")}</Link>
        </Button>
      </div>
    </section>
  );
}
