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
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
          className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/50"
        >
          <Icon className="size-4" />
          {label}
          <Badge variant="secondary" className="ml-auto text-[10px]">
            sắp có
          </Badge>
        </div>
      ))}
    </nav>
  );
}
