import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { changeForcedPassword } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

/**
 * Buộc đặt mật khẩu riêng lần đầu (31.29) — app/app/layout.tsx đá về đây khi
 * profiles.must_change_password = true, KHÔNG có nút "để sau". Đã đổi rồi mà
 * lỡ vào lại (bấm back) thì tự trôi vào app, không kẹt màn này.
 */
export default async function ForcePasswordChangePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.must_change_password) redirect("/app/today");

  const { error } = await searchParams;
  const t = await getTranslations("auth.forcePasswordChange");
  const tErrors = await getTranslations("auth.errors");
  const errorText = error
    ? tErrors.has(error)
      ? tErrors(error)
      : tErrors("generic")
    : null;

  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      {errorText && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorText}
        </p>
      )}
      <form action={changeForcedPassword} className="space-y-4">
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
