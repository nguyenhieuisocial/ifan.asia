import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth.login");
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
          {t("noAccount")}{" "}
          <Link href="/signup" className="text-foreground underline">
            {t("signupLink")}
          </Link>
        </p>
      }
    >
      {errorText && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorText}
        </p>
      )}
      <form action={signIn} className="space-y-3">
        {/* autoComplete chuẩn để trình quản lý mật khẩu tự điền được:
            username + current-password là cặp trình duyệt nhận diện lúc đăng nhập */}
        <Input
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder={t("emailPlaceholder")}
        />
        <PasswordInput
          name="password"
          required
          autoComplete="current-password"
          placeholder={t("passwordPlaceholder")}
        />
        <SubmitButton className="w-full">{t("submit")}</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link
          href="/forgot-password"
          className="text-muted-foreground underline hover:text-foreground"
        >
          {t("forgotLink")}
        </Link>
      </p>
    </AuthShell>
  );
}
