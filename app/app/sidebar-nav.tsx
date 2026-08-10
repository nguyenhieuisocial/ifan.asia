"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Building2,
  ChartColumn,
  ClipboardCheck,
  Gauge,
  Handshake,
  Inbox,
  ListChecks,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useInboxRealtime } from "@/lib/realtime/use-inbox-realtime";
import { fetchInboxCounts } from "./inbox/queries";

const NAV_ITEMS = [
  // "Hôm nay" đứng đầu: đây là màn nhà hằng ngày của người bán (mở app là biết gọi ai)
  { href: "/app/today", labelKey: "today", icon: ListChecks },
  // exact: /app là Tổng quan — mọi route khác cũng bắt đầu bằng /app nên phải so khớp tuyệt đối
  { href: "/app", labelKey: "overview", icon: Gauge, exact: true },
  { href: "/app/inbox", labelKey: "inbox", icon: Inbox },
  { href: "/app/contacts", labelKey: "contacts", icon: Users },
  { href: "/app/companies", labelKey: "companies", icon: Building2 },
  { href: "/app/deals", labelKey: "deals", icon: Handshake },
  // Phiếu chờ duyệt + gửi yêu cầu theo biểu mẫu tự tạo (migration #29).
  // Chỉ nằm ở sidebar: nav mobile giữ đúng 4 ô (xem ghi chú MOBILE_NAV_KEYS bên dưới).
  { href: "/app/approvals", labelKey: "approvals", icon: ClipboardCheck },
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

/**
 * Những mục KHÔNG có ô ở thanh đáy — menu tài khoản phải gánh, nếu không thì
 * trên điện thoại chúng hoàn toàn không tới được (Cài đặt, Công ty, Duyệt).
 */
export const MOBILE_OVERFLOW_ITEMS = NAV_ITEMS.filter(
  (i) => !MOBILE_NAV_KEYS.includes(i.labelKey),
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

/** Trên 99 thì con số cụ thể không còn giúp gì — bóp gọn để không vỡ huy hiệu (mẫu chuông thông báo). */
const BADGE_MAX = 99;

/** Thanh điều hướng đáy cho mobile (<md) — 4 mục hằng ngày, chung nhãn với sidebar. */
export function MobileNav({ tenantId }: { tenantId: string }) {
  const pathname = usePathname();
  const t = useTranslations("shell");
  const supabase = useMemo(() => createClient(), []);

  // Kênh realtime Hộp thư đăng ký TẠI ĐÂY — MobileNav nằm ở app shell nên luôn
  // sống, đứng màn nào tin mới về cũng invalidate ['inbox-counts'] cho badge
  // (và ['conversations']/['messages'] cho màn Hộp thư). ĐÚNG MỘT nơi đăng ký
  // cho cả app (như chuông thông báo): supabase-js trả CÙNG channel instance
  // theo topic, hai nơi cùng subscribe/removeChannel sẽ giẫm chân nhau.
  useInboxRealtime(tenantId);

  // Số hội thoại CHƯA TRẢ LỜI — tái dùng đúng khóa + COUNT trong CSDL của Hộp
  // thư (RPC inbox_counts), không thêm query nặng: chỉ refetch khi realtime
  // invalidate hoặc theo staleTime mặc định của app.
  const countsQuery = useQuery({
    queryKey: ["inbox-counts"],
    queryFn: () => fetchInboxCounts(supabase),
  });
  const unanswered = countsQuery.data?.unanswered ?? 0;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {MOBILE_NAV_ITEMS.map((item) => {
        const { href, labelKey, icon: Icon } = item;
        const active = isActive(pathname, item);
        const showBadge = labelKey === "inbox" && unanswered > 0;
        return (
          <Link
            key={href}
            href={href}
            // Badge vẽ aria-hidden (mẫu chuông) — nhãn trợ năng đọc kèm SỐ chưa
            // trả lời cho người dùng screen reader.
            aria-label={
              showBadge
                ? t("nav.inboxUnanswered", { count: unanswered })
                : undefined
            }
            className={cn(
              "flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
              active
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="relative">
              <Icon className="size-5" />
              {showBadge && (
                <span
                  aria-hidden
                  className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white"
                >
                  {unanswered > BADGE_MAX ? `${BADGE_MAX}+` : unanswered}
                </span>
              )}
            </span>
            {t(`nav.${labelKey}`)}
          </Link>
        );
      })}
    </nav>
  );
}
