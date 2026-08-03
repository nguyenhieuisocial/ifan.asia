import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth.login");
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
        <form action={signIn} className="space-y-4">
          <Input
            name="email"
            type="email"
            required
            placeholder={t("emailPlaceholder")}
          />
          <Input
            name="password"
            type="password"
            required
            placeholder={t("passwordPlaceholder")}
          />
          <Button type="submit" className="w-full">
            {t("submit")}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/signup" className="text-foreground underline">
            {t("signupLink")}
          </Link>
        </p>
      </div>
    </main>
  );
}
