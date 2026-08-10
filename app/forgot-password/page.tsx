import Link from "next/link";
import { MailCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requestPasswordReset } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <AuthShell
      // Tiêu đề ĐỔI sau khi gửi: giữ nguyên "Quên mật khẩu" thì nhìn y hệt lúc
      // chưa bấm, người ta tưởng chưa ăn và bấm gửi lại — mà mỗi lần gửi lại là
      // một thư nữa trong hạn mức, và link cũ chết.
      title={sent ? t("sentTitle") : t("title")}
      subtitle={sent ? undefined : t("subtitle")}
      footer={
        <p>
          <Link href="/login" className="text-foreground underline">
            {t("backToLogin")}
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
        // Gõ nhầm email là chuyện thường, mà lúc đó form đã biến mất: KHÔNG có
        // lối quay lại thì họ mắc kẹt ở màn "đã gửi" cho một hộp thư không phải
        // của mình. Luôn chừa đường thử lại.
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3.5">
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
            <Link href="/forgot-password" className="text-foreground underline">
              {t("tryAgain")}
            </Link>
          </p>
        </div>
      ) : (
        <form action={requestPasswordReset} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("emailPlaceholder")}</Label>
            <Input id="email" name="email" type="email" required autoComplete="username" />
          </div>
          <SubmitButton className="w-full">{t("submit")}</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
