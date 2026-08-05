import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resetPassword } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { isRecoverySession } from "@/lib/auth/recovery-session";
import { AuthShell } from "@/components/auth/auth-shell";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
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
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle", { email: user.email ?? "" })}
      footer={<p className="text-xs">{t("othersSignedOut")}</p>}
    >
      {errorText && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorText}
        </p>
      )}
      <form action={resetPassword} className="space-y-4">
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
        <div className="space-y-1.5">
          <Label htmlFor="confirm">{t("confirmPlaceholder")}</Label>
          <PasswordInput
            id="confirm"
            name="confirm"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <SubmitButton className="w-full">{t("submit")}</SubmitButton>
      </form>
    </AuthShell>
  );
}
