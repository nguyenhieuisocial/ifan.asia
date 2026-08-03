"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Handshake, Inbox, Settings, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/app/inbox", labelKey: "inbox", icon: Inbox },
  { href: "/app/contacts", labelKey: "contacts", icon: Users },
] as const;

const DISABLED_ITEMS = [
  { labelKey: "deals", icon: Handshake },
  { labelKey: "settings", icon: Settings },
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  const t = useTranslations("shell");

  return (
    <nav className="flex flex-1 flex-col gap-1 p-2">
      {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
              active
                ? "bg-foreground/[0.06] font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {t(`nav.${labelKey}`)}
          </Link>
        );
      })}
      {DISABLED_ITEMS.map(({ labelKey, icon: Icon }) => (
        <div
          key={labelKey}
          aria-disabled
          className="flex h-8 cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground/50"
        >
          <Icon className="size-4" />
          {t(`nav.${labelKey}`)}
          <Badge variant="secondary" className="ml-auto">
            {t("comingSoon")}
          </Badge>
        </div>
      ))}
    </nav>
  );
}

/** Thanh điều hướng đáy cho mobile (<md) — dùng chung NAV_ITEMS + nhãn với sidebar. */
export function MobileNav() {
  const pathname = usePathname();
  const t = useTranslations("shell");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
              active
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-5" />
            {t(`nav.${labelKey}`)}
          </Link>
        );
      })}
    </nav>
  );
}
