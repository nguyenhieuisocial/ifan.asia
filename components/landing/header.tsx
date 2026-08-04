import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

// "iFan" — tên thương hiệu, không dịch (brand name, not translatable copy)
const BRAND = "iFan";

/** Wordmark chữ + chấm cam đất — logo thuần token, không ảnh. */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-semibold">
      <span aria-hidden className="size-2.5 rounded-full bg-primary" />
      {BRAND}
    </span>
  );
}

export async function LandingHeader() {
  const t = await getTranslations("landing.header");
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link href="/" className="shrink-0">
          <Wordmark />
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
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <LocaleSwitcher />
          <Link
            href="/login"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            {t("login")}
          </Link>
          <Button asChild size="sm">
            <Link href="/signup">{t("signup")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
