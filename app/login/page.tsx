import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth.login");

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
      {/* ?error= chỉ mang KEY trong "auth.errors" — form dịch qua whitelist,
          không bao giờ render chuỗi thô từ URL. */}
      <LoginForm urlError={error ?? null} />
    </AuthShell>
  );
}
