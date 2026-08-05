import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Khu super-admin — màn DUY NHẤT nhìn xuyên tenant, chỉ founder của iFan vào được.
 *
 * CỔNG DUY NHẤT: RPC `is_platform_admin()` (migration #28) đối chiếu `auth.uid()`
 * với bảng `platform_admins` — bảng RLS bật, KHÔNG policy, người dùng không tự
 * ghi mình vào được. KHÔNG đọc claim trong JWT: claim phụ thuộc Custom Access
 * Token Hook (có thể tắt) nên không đáng tin cho quyết định quyền hạn.
 *
 * Không đủ quyền → 404 (không phải "cấm truy cập"): không hé lộ là có khu này.
 * Bảng để trống sau migration → mặc định KHÔNG AI vào được, kể cả owner.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: isAdmin, error } = await supabase.rpc("is_platform_admin");
  if (error || isAdmin !== true) notFound();

  const t = await getTranslations("admin");

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <BrandMark suffix className="text-sm" />
          <span className="truncate text-xs text-muted-foreground">
            {t("shellLabel")}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/app"
            className="rounded-md px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            {t("backToApp")}
          </Link>
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
