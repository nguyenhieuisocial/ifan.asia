import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signUp } from "@/app/auth/actions";
import { Input } from "@/components/ui/input";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SubmitButton } from "@/components/submit-button";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const t = await getTranslations("auth.signup");
  const tErrors = await getTranslations("auth.errors");
  // Whitelist: ?error= chỉ được là key trong "auth.errors" — không bao giờ render chuỗi thô
  const errorText = error
    ? tErrors.has(error)
      ? tErrors(error)
      : tErrors("generic")
    : null;
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-24">
      <LocaleSwitcher className="absolute top-4 right-4" />
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {errorText && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorText}
          </p>
        )}
        {sent ? (
          <p className="rounded-md border px-3 py-2 text-sm">{t("sent")}</p>
        ) : (
          <form action={signUp} className="space-y-4">
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
              minLength={8}
              placeholder={t("passwordPlaceholder")}
            />
            <SubmitButton className="w-full">{t("submit")}</SubmitButton>
          </form>
        )}
        <p className="text-center text-sm text-muted-foreground">
          {t("haveAccount")}{" "}
          <Link href="/login" className="text-foreground underline">
            {t("loginLink")}
          </Link>
        </p>
      </div>
    </main>
  );
}
