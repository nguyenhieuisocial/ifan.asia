import Link from "next/link";
import { MailCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requestPasswordReset } from "@/app/auth/actions";
import { Input } from "@/components/ui/input";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SubmitButton } from "@/components/submit-button";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const t = await getTranslations("auth.forgotPassword");
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
          // Gõ nhầm email là chuyện thường, mà lúc đó form đã biến mất: KHÔNG có
          // lối quay lại thì họ mắc kẹt ở màn "đã gửi" cho một hộp thư không
          // phải của mình. Luôn chừa đường thử lại.
          <div className="space-y-4">
            <div className="flex gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
              <MailCheck
                className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
              <p className="text-sm leading-relaxed text-emerald-800 dark:text-emerald-200">
                {t("sent")}
              </p>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {t("wrongEmail")}{" "}
              <Link
                href="/forgot-password"
                className="text-foreground underline"
              >
                {t("tryAgain")}
              </Link>
            </p>
          </div>
        ) : (
          <form action={requestPasswordReset} className="space-y-4">
            <Input
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder={t("emailPlaceholder")}
            />
            <SubmitButton className="w-full">{t("submit")}</SubmitButton>
          </form>
        )}
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-foreground underline">
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}
