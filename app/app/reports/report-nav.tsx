"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const REPORT_TABS = [
  { href: "/app/reports/sources", key: "sources" },
  { href: "/app/reports/lost-reasons", key: "lostReasons" },
  { href: "/app/reports/kpi", key: "kpi" },
  // V3 việc 7 (ADR-0019 mục 8) — vế "biết lời lỗ", lộ giá vốn nên chỉ
  // owner/admin/manager thấy tab này thật sự có nội dung (page tự kiểm lại).
  { href: "/app/reports/gross-margin", key: "grossMargin" },
] as const;

/**
 * Chuyển giữa các màn trong khu Báo cáo (spec CRM §4.6). Dựng bằng link thường
 * (không phải Tabs của radix): mỗi màn là một ROUTE riêng có dữ liệu server
 * riêng, bấm là điều hướng thật chứ không đổi state.
 */
export function ReportNav() {
  const t = useTranslations("reports.nav");
  const pathname = usePathname();
  return (
    <nav
      aria-label={t("label")}
      className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1"
    >
      {REPORT_TABS.map(({ href, key }) => {
        const active = pathname === href;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
