import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signUp } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
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
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <p>
          {t("haveAccount")}{" "}
          <Link href="/login" className="text-foreground underline">
            {t("loginLink")}
          </Link>
        </p>
      }
    >
      {errorText && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorText}
        </p>
      )}
      {sent ? (
        <p className="rounded-md border bg-muted/40 px-3 py-3 text-sm leading-relaxed">
          {t("sent")}
        </p>
      ) : (
        <form action={signUp} className="space-y-4">
          {/* autoComplete chuẩn để trình quản lý mật khẩu đề xuất và LƯU được
              mật khẩu mới: new-password (không phải current-password) */}
          <div className="space-y-1.5">
            <Label htmlFor="displayName">{t("namePlaceholder")}</Label>
            <Input
              id="displayName"
              name="displayName"
              type="text"
              maxLength={80}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("emailPlaceholder")}</Label>
            <Input id="email" name="email" type="email" required autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("passwordPlaceholder")}</Label>
            <PasswordInput
              id="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <SubmitButton className="w-full">{t("submit")}</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
