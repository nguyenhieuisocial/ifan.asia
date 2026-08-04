"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Building2,
  ChartColumn,
  Gauge,
  Handshake,
  Inbox,
  ListChecks,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  // "Hôm nay" đứng đầu: đây là màn nhà hằng ngày của người bán (mở app là biết gọi ai)
  { href: "/app/today", labelKey: "today", icon: ListChecks },
  // exact: /app là Tổng quan — mọi route khác cũng bắt đầu bằng /app nên phải so khớp tuyệt đối
  { href: "/app", labelKey: "overview", icon: Gauge, exact: true },
  { href: "/app/inbox", labelKey: "inbox", icon: Inbox },
  { href: "/app/contacts", labelKey: "contacts", icon: Users },
  { href: "/app/companies", labelKey: "companies", icon: Building2 },
  { href: "/app/deals", labelKey: "deals", icon: Handshake },
  // /app/reports redirect sang /app/reports/sources (đợt này chỉ có "Nguồn nào ra tiền")
  { href: "/app/reports", labelKey: "reports", icon: ChartColumn },
  // /app/settings redirect sang /app/settings/channels (đợt 1 chỉ có Kênh kết nối)
  { href: "/app/settings", labelKey: "settings", icon: Settings },
] as const;

// Mobile VẪN ĐÚNG 4 ô: Hôm nay · Hộp thư · Khách hàng · Cơ hội.
// Ô thứ 5 sẽ bóp mỗi ô xuống ~75px ở 375px, nhãn tiếng Việt có dấu bắt đầu vỡ dòng
// (tiền lệ đã ghi khi bỏ Công ty khỏi nav mobile) — nên phải ĐỔI CHỖ, không thêm.
// Bỏ "Tổng quan" chứ không bỏ mục khác vì "Hôm nay" GỘP đúng phần Tổng quan dùng
// hằng ngày ("Cần làm ngay": hội thoại chưa trả lời + khách nóng chưa chăm) và bổ
// sung việc quá hạn/đến hạn; phần còn lại của Tổng quan là 4 ô số liệu + bản tin
// tuần — màn ĐỌC LẠI cuối ngày, không phải màn thao tác. Trên mobile vào Tổng quan
// bằng nút ngay trên đầu màn "Hôm nay"; trên desktop vẫn nằm nguyên ở sidebar.
const MOBILE_NAV_KEYS: string[] = ["today", "inbox", "contacts", "deals"];
const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((i) =>
  MOBILE_NAV_KEYS.includes(i.labelKey),
);

function isActive(pathname: string, item: (typeof NAV_ITEMS)[number]): boolean {
  return "exact" in item && item.exact
    ? pathname === item.href
    : pathname.startsWith(item.href);
}

export function SidebarNav() {
  const pathname = usePathname();
  const t = useTranslations("shell");

  return (
    <nav className="flex flex-1 flex-col gap-1 p-2">
      {NAV_ITEMS.map((item) => {
        const { href, labelKey, icon: Icon } = item;
        const active = isActive(pathname, item);
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
    </nav>
  );
}

/** Thanh điều hướng đáy cho mobile (<md) — 4 mục hằng ngày, chung nhãn với sidebar. */
export function MobileNav() {
  const pathname = usePathname();
  const t = useTranslations("shell");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {MOBILE_NAV_ITEMS.map((item) => {
        const { href, labelKey, icon: Icon } = item;
        const active = isActive(pathname, item);
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
