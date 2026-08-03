import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function Home() {
  const t = await getTranslations("landing");
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <LocaleSwitcher className="absolute top-4 right-4" />
      <p className="rounded-full border px-4 py-1 text-sm tracking-wide text-muted-foreground">
        {t("badge")}
      </p>
      <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
        {t("headline")}
      </h1>
      <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
        {t("subheadline")}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("contact", { email: "hello@ifan.asia" })}
      </p>
    </main>
  );
}
