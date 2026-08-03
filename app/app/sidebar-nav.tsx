"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Handshake, Inbox, Settings, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/app/inbox", label: "Hộp thư", icon: Inbox },
  { href: "/app/contacts", label: "Khách hàng", icon: Users },
] as const;

const DISABLED_ITEMS = [
  { label: "Cơ hội", icon: Handshake },
  { label: "Cài đặt", icon: Settings },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 p-2">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
            {label}
          </Link>
        );
      })}
      {DISABLED_ITEMS.map(({ label, icon: Icon }) => (
        <div
          key={label}
          aria-disabled
          className="flex h-8 cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground/50"
        >
          <Icon className="size-4" />
          {label}
          <Badge variant="secondary" className="ml-auto">
            sắp có
          </Badge>
        </div>
      ))}
    </nav>
  );
}
