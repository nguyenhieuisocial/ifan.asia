import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signInStaffByPhone } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";

/**
 * /login/staff — đăng nhập nhân viên không cần email (31.29). SĐT + mã tiệm
 * thay cho email — 3 dòng chủ tiệm đã đưa lúc thêm vào Đội ngũ (thẻ design
 * design-system/auth-screens.html mục 5).
 */
export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth.staffLogin");
  const tErrors = await getTranslations("auth.errors");
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
          {t("hasEmail")}{" "}
          <Link href="/login" className="text-foreground underline">
            {t("emailLoginLink")}
          </Link>
        </p>
      }
    >
      {errorText && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorText}
        </p>
      )}
      <form action={signInStaffByPhone} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t("phoneLabel")}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            required
            autoComplete="username"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tenantSlug">{t("slugLabel")}</Label>
          <Input id="tenantSlug" name="tenantSlug" type="text" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("passwordLabel")}</Label>
          <PasswordInput
            id="password"
            name="password"
            required
            autoComplete="current-password"
          />
        </div>
        <SubmitButton className="w-full">{t("submit")}</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">{t("hint")}</p>
    </AuthShell>
  );
}
