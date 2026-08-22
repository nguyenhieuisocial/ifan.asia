import Link from "next/link";
import { noiQuayLai, NHA_SAU_DANG_NHAP } from "@/lib/auth/noi-quay-lai";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  // Lọc NGAY tại cửa: chuỗi này đi tiếp xuống nút vân tay, nơi trình duyệt tự
  // chuyển hướng. `NHA_SAU_DANG_NHAP` nghĩa là "không có chỗ nào đặc biệt" nên
  // không cần dựng ô ẩn.
  const daLoc = noiQuayLai(next);
  const quayLai = daLoc === NHA_SAU_DANG_NHAP ? null : daLoc;
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
      <LoginForm urlError={error ?? null} quayLai={quayLai} />
    </AuthShell>
  );
}
