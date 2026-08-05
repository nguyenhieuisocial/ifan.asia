import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resetPassword } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { isRecoverySession } from "@/lib/auth/recovery-session";
import { Input } from "@/components/ui/input";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

/**
 * Đặt mật khẩu mới. Vào được đây nghĩa là /auth/confirm đã đổi mã trong thư lấy
 * phiên tạm — không có phiên thì link hỏng/hết hạn/đã dùng, đá về màn gửi lại.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=linkInvalid");
  // Đang đăng nhập bình thường thì đây KHÔNG phải chỗ của họ — đổi mật khẩu
  // trong Cài đặt (có hỏi mật khẩu hiện tại). Xem lib/auth/recovery-session.ts.
  if (!(await isRecoverySession(supabase))) redirect("/app/settings/account");

  const { error } = await searchParams;
  const t = await getTranslations("auth.resetPassword");
  const tErrors = await getTranslations("auth.errors");
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
          <p className="text-sm text-muted-foreground">
            {t("subtitle", { email: user.email ?? "" })}
          </p>
        </div>
        {errorText && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorText}
          </p>
        )}
        <form action={resetPassword} className="space-y-4">
          <Input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder={t("passwordPlaceholder")}
          />
          <Input
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder={t("confirmPlaceholder")}
          />
          <SubmitButton className="w-full">{t("submit")}</SubmitButton>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          {t("othersSignedOut")}
        </p>
      </div>
    </main>
  );
}
