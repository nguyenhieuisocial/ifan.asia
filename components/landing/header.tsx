import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export async function LandingHeader() {
  const t = await getTranslations("landing.header");
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link href="/" className="shrink-0">
          <BrandMark />
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">
            {t("features")}
          </a>
          <a href="#pricing" className="transition-colors hover:text-foreground">
            {t("pricing")}
          </a>
          <a href="#faq" className="transition-colors hover:text-foreground">
            {t("faq")}
          </a>
        </nav>
        {/* Trên điện thoại ĐỔI VAI: hiện "Đăng nhập", ẩn nút đăng ký.
            Lý do: khách ĐÃ TRẢ TIỀN mở ifan.asia trên điện thoại thì lối vào duy
            nhất nổi bật lại là "Dùng thử miễn phí" — bấm vào bị đá sang màn đăng
            ký. Còn người mới thì ngay bên dưới đã có nút "Dùng thử miễn phí" cỡ
            lớn trong phần đầu trang, không mất đường nào. Đặt cả hai ở 375px thì
            hàng nút tràn ngang. */}
        <div className="flex items-center gap-2 sm:gap-4">
          <ThemeToggle />
          <LocaleSwitcher />
          <Link
            href="/login"
            className="px-1 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("login")}
          </Link>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/signup">{t("signup")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
