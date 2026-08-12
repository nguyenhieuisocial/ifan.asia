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
        {/* ADR-0011 mục 5.3: 4 trang công khai mới thay 3 mỏ neo cuộn trang cũ
            — /tinh-nang và /lo-trinh là trang thật, /bang-gia và #faq vẫn
            trỏ về đúng khối trên trang chủ (giá gói trả phí chưa công bố,
            #pricing giờ nằm trong DifferentiatorsAndFree). */}
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link href="/tinh-nang" className="transition-colors hover:text-foreground">
            {t("features")}
          </Link>
          <Link href="/lo-trinh" className="transition-colors hover:text-foreground">
            {t("roadmap")}
          </Link>
          <Link href="/bang-gia" className="transition-colors hover:text-foreground">
            {t("pricing")}
          </Link>
          <Link href="/#faq" className="transition-colors hover:text-foreground">
            {t("faq")}
          </Link>
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
