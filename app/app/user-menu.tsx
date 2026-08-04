"use client";

import Link from "next/link";
import { Check, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { signOut } from "@/app/auth/actions";
import { MOBILE_OVERFLOW_ITEMS } from "@/app/app/sidebar-nav";
import { setLocale } from "@/i18n/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEMES = ["light", "dark", "system"] as const;

export function UserMenu({
  email,
  displayName,
}: {
  email: string;
  displayName: string | null;
}) {
  const t = useTranslations("shell.userMenu");
  const tNav = useTranslations("shell.nav");
  const tTheme = useTranslations("common.theme");
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const shown = displayName || email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">
              {(shown[0] ?? "?").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-44 truncate text-sm sm:inline">
            {shown}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        {/* Chỉ <md: thanh đáy chỉ có 4 ô, các mục còn lại (Cài đặt, Công ty,
            Báo cáo, Duyệt) không có lối vào nào khác trên điện thoại. */}
        <div className="md:hidden">
          <DropdownMenuSeparator />
          {MOBILE_OVERFLOW_ITEMS.map(({ href, labelKey, icon: Icon }) => (
            <DropdownMenuItem key={href} asChild>
              <Link href={href}>
                <Icon />
                {tNav(labelKey)}
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("language")}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void setLocale("vi")}>
          {t("vietnamese")}
          {locale === "vi" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void setLocale("en")}>
          {t("english")}
          {locale === "en" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {tTheme("label")}
        </DropdownMenuLabel>
        {THEMES.map((mode) => (
          <DropdownMenuItem key={mode} onSelect={() => setTheme(mode)}>
            {tTheme(mode)}
            {theme === mode && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
