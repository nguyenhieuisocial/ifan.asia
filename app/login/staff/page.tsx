import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signIn, signInStaffByPhone } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginTabs } from "@/components/auth/login-tabs";

/**
 * /login/staff — vẫn là route thật (signInStaffByPhone redirect lỗi về đây,
 * xem app/auth/actions.ts), nhưng nội dung render GIỐNG HỆT /login: cùng
 * khối LoginTabs, chỉ khác defaultTab="staff". Trước đây đây là 1 màn hoàn
 * toàn riêng — gộp lại để người mới không phải bấm thêm 1 bước mới thấy
 * được cách đăng nhập bằng SĐT (31.29).
 */
export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth.login");
  const tStaff = await getTranslations("auth.staffLogin");
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
      <LoginTabs
        defaultTab="staff"
        emailAction={signIn}
        staffAction={signInStaffByPhone}
        strings={{
          tabEmail: t("tabEmail"),
          tabStaff: t("tabStaff"),
          emailPlaceholder: t("emailPlaceholder"),
          passwordPlaceholder: t("passwordPlaceholder"),
          submit: t("submit"),
          forgotLink: t("forgotLink"),
          staffPhoneLabel: tStaff("phoneLabel"),
          staffSlugLabel: tStaff("slugLabel"),
          staffPasswordLabel: tStaff("passwordLabel"),
          staffSubmit: tStaff("submit"),
          staffHint: tStaff("hint"),
        }}
      />
    </AuthShell>
  );
}
