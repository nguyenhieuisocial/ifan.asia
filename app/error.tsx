"use client";

import { useTranslations } from "next-intl";
import { TilePlug } from "@/components/illustrations/tile-plug";
import { Button } from "@/components/ui/button";

/** Error boundary toàn app — client component, dịch qua namespace "errors". */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  return (
    <main id="noi-dung-chinh" className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <TilePlug className="size-16" />
      <h1 className="text-2xl font-semibold">{t("errorTitle")}</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t("errorBody")}
      </p>
      <Button variant="outline" onClick={reset}>
        {t("retry")}
      </Button>
    </main>
  );
}
