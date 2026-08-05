import { getTranslations } from "next-intl/server";
import { updatePassword } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Tài khoản. Đổi mật khẩu cho chính mình.
 *
 * Ai cũng vào được (nhân viên cũng cần đổi mật khẩu của họ) — khác các mục
 * khác trong Cài đặt vốn chỉ dành cho chủ tiệm.
 */
export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { error, done } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const t = await getTranslations("settings.account");
  const tErrors = await getTranslations("auth.errors");
  const errorText = error
    ? tErrors.has(error)
      ? tErrors(error)
      : tErrors("generic")
    : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("signedInAs", { email: user?.email ?? "" })}
          </p>
        </div>

        <section className="space-y-4 rounded-lg border p-4">
          <div className="space-y-1">
            <h2 className="font-medium">{t("changeTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("changeDescription")}
            </p>
          </div>

          {errorText && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorText}
            </p>
          )}
          {done && (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {t("done")}
            </p>
          )}

          <form action={updatePassword} className="space-y-3">
            {/* Trình quản lý mật khẩu cần biết đây là form của tài khoản nào */}
            <input
              type="hidden"
              name="username"
              autoComplete="username"
              defaultValue={user?.email ?? ""}
            />
            <Input
              name="current"
              type="password"
              required
              autoComplete="current-password"
              placeholder={t("currentPlaceholder")}
            />
            <Input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t("newPlaceholder")}
            />
            <Input
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t("confirmPlaceholder")}
            />
            <SubmitButton>{t("submit")}</SubmitButton>
          </form>

          <p className="text-xs text-muted-foreground">{t("othersSignedOut")}</p>
        </section>
      </div>
    </div>
  );
}
