"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app/settings/channels", labelKey: "channels" },
  { href: "/app/settings/replies", labelKey: "replies" },
  { href: "/app/settings/workflows", labelKey: "workflows" },
  { href: "/app/settings/forms", labelKey: "forms" },
  { href: "/app/settings/sla", labelKey: "sla" },
  { href: "/app/settings/tiers", labelKey: "tiers" },
  { href: "/app/settings/qr", labelKey: "qr" },
  { href: "/app/settings/team", labelKey: "team" },
  { href: "/app/settings/billing", labelKey: "billing" },
  { href: "/app/settings/account", labelKey: "account" },
] as const;

/** Sub-nav ngang khu Cài đặt — style pill đồng bộ sidebar. */
export function SettingsNav() {
  const pathname = usePathname();
  const t = useTranslations("settings.nav");
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Trên điện thoại thanh này cuộn ngang, mà mục đang mở thường nằm ngoài màn
  // hình: đang ở "Gói của tôi" mà chỉ thấy "Kênh kết nối… Cam k…" — nhìn như
  // lạc chỗ. Kéo mục đang mở vào giữa tầm nhìn.
  // Tính bằng getBoundingClientRect + cộng dồn scrollLeft để KHÔNG đụng tới
  // vùng cuộn nào khác (scrollIntoView có thể kéo cả trang).
  useEffect(() => {
    const nav = navRef.current;
    const active = activeRef.current;
    if (!nav || !active) return;
    const navBox = nav.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    nav.scrollLeft +=
      activeBox.left - navBox.left - (navBox.width - activeBox.width) / 2;
  }, [pathname]);

  return (
    // Mục thứ 5 làm hàng nav tràn ở 375px (chữ xuống dòng rồi bị cắt ngang).
    // Cho cuộn NGANG trong chính thanh nav — trang vẫn không tràn ngang.
    <nav
      ref={navRef}
      className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b px-4"
    >
      {ITEMS.map(({ href, labelKey }) => (
        <Link
          key={href}
          href={href}
          ref={pathname.startsWith(href) ? activeRef : undefined}
          aria-current={pathname.startsWith(href) ? "page" : undefined}
          className={cn(
            "flex h-7 shrink-0 items-center rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors",
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
