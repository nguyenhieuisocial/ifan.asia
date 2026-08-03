import { getTranslations } from "next-intl/server";
import { createWorkspace } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth.onboarding");
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-24">
      <LocaleSwitcher className="absolute top-4 right-4" />
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <form action={createWorkspace} className="space-y-4">
          <Input
            name="name"
            required
            maxLength={120}
            placeholder={t("namePlaceholder")}
          />
          <Input
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9-]{1,28}[a-z0-9]"
            placeholder={t("slugPlaceholder")}
            className="lowercase"
          />
          <Button type="submit" className="w-full">
            {t("submit")}
          </Button>
        </form>
      </div>
    </main>
  );
}
