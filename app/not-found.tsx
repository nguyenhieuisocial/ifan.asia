import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TileMessage } from "@/components/illustrations/tile-message";
import { Button } from "@/components/ui/button";

/** 404 toàn app — server component, dịch qua namespace "errors". */
export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <TileMessage className="size-16" />
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t("notFoundBody")}
      </p>
      <Button asChild variant="outline">
        <Link href="/">{t("backHome")}</Link>
      </Button>
    </main>
  );
}
