import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";

export async function LandingFooter() {
  const [t, tNav] = await Promise.all([
    getTranslations("landing.footer"),
    getTranslations("landing.header"),
  ]);
  return (
    <footer>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-col justify-between gap-8 sm:flex-row">
          <div className="max-w-sm space-y-3">
            <BrandMark />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <div className="flex items-center gap-6 self-start text-sm text-muted-foreground">
            <a href="#features" className="transition-colors hover:text-foreground">
              {tNav("features")}
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              {tNav("pricing")}
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              {tNav("faq")}
            </a>
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </div>
        {/* Điều khoản + Bảo mật để ở chân trang vì đó là chỗ người ta quen tìm,
            và vì Zalo/Meta đòi một đường dẫn chính sách bảo mật công khai mới
            xét duyệt ứng dụng. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-6 text-xs text-muted-foreground">
          <p>{t("copyright", { year: String(new Date().getFullYear()) })}</p>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            {t("terms")}
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            {t("privacy")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
