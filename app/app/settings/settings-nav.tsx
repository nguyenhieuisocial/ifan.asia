"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app/settings/channels", labelKey: "channels" },
  { href: "/app/settings/replies", labelKey: "replies" },
  { href: "/app/settings/workflows", labelKey: "workflows" },
] as const;

/** Sub-nav ngang khu Cài đặt — style pill đồng bộ sidebar. */
export function SettingsNav() {
  const pathname = usePathname();
  const t = useTranslations("settings.nav");

  return (
    <nav className="flex h-11 shrink-0 items-center gap-1 border-b px-4">
      {ITEMS.map(({ href, labelKey }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex h-7 items-center rounded-md px-2.5 text-[13px] transition-colors",
            pathname.startsWith(href)
              ? "bg-foreground/[0.06] font-semibold text-foreground"
              : "font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
          )}
        >
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}
