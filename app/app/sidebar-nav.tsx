"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Boxes,
  Building2,
  Calendar,
  ChartColumn,
  ClipboardCheck,
  Gauge,
  Handshake,
  Inbox,
  ListChecks,
  Lock,
  Package,
  Receipt,
  ScrollText,
  Settings,
  SquareCheckBig,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useInboxRealtime } from "@/lib/realtime/use-inbox-realtime";
import { capitalizeFirst, type TenantPack } from "@/lib/tenant-pack";
import { fetchInboxCounts } from "./inbox/queries";

const NAV_ITEMS = [
  // "Hôm nay" đứng đầu: đây là màn nhà hằng ngày của người bán (mở app là biết gọi ai)
  { href: "/app/today", labelKey: "today", icon: ListChecks },
  // exact: /app là Tổng quan — mọi route khác cũng bắt đầu bằng /app nên phải so khớp tuyệt đối
  { href: "/app", labelKey: "overview", icon: Gauge, exact: true },
  { href: "/app/inbox", labelKey: "inbox", icon: Inbox },
  // Việc 4 của ADR-0009 (V2 Lịch hẹn) — "nav trục 2" trong hồ sơ, ngay sau Hộp thư
  // vì lịch hẹn phần lớn sinh ra TỪ cuộc trò chuyện (thẻ design man-lich-hen.html).
  { href: "/app/calendar", labelKey: "calendar", icon: Calendar },
  { href: "/app/contacts", labelKey: "contacts", icon: Users },
  { href: "/app/companies", labelKey: "companies", icon: Building2 },
  { href: "/app/deals", labelKey: "deals", icon: Handshake },
  // V3 "Tiền thật" (ADR-0019 mục 8 việc 3-4) — Hàng hoá đứng TRƯỚC Đơn hàng vì
  // đơn hàng phải chọn từ catalog đã có, đúng thứ tự thao tác thật.
  { href: "/app/items", labelKey: "items", icon: Package },
  { href: "/app/orders", labelKey: "orders", icon: Receipt },
  // V3 việc 6 (ADR-0019 mục 8) — cùng nhóm quyền với giá vốn (RLS cash_entries_rw
  // chỉ owner/admin/manager), ẨN khỏi nav với staff/viewer (khuôn "reports" trên).
  { href: "/app/cashbook", labelKey: "cashbook", icon: Wallet, roles: ["owner", "admin", "manager"] },
  // V5 Két sắt (ADR-0022) — chốt ca + công nợ NCC: cùng nhóm quyền giá vốn.
  { href: "/app/ketsat", labelKey: "ketsat", icon: Lock, roles: ["owner", "admin", "manager"] },
  // V4 Kho hàng (ADR-0021) — xem tồn: MỌI VAI (RLS stock_moves_select mở cho cả tiệm).
  // Chỉ owner/admin/manager thấy giá vốn + vào Phiếu nhập/Kiểm kê (kiểm tra bằng canManage bên trong màn).
  { href: "/app/stock", labelKey: "stock", icon: Boxes },
  // V5 Hợp đồng & Gói định kỳ (ADR-0022) — mọi vai xem; đổi buổi: mọi vai.
  { href: "/app/contracts", labelKey: "contracts", icon: ScrollText },
  // Bảng kéo-thả cho việc (ADR-0012 mục 4 M13) — cùng dữ liệu activities với
  // "Việc đang chờ" trên hồ sơ khách/cơ hội, đây là màn xem TOÀN BỘ việc.
  { href: "/app/tasks", labelKey: "tasks", icon: SquareCheckBig },
  // Phiếu chờ duyệt + gửi yêu cầu theo biểu mẫu tự tạo (migration #29).
  // Chỉ nằm ở sidebar: nav mobile giữ đúng 4 ô (xem ghi chú MOBILE_NAV_KEYS bên dưới).
  { href: "/app/approvals", labelKey: "approvals", icon: ClipboardCheck },
  // /app/reports redirect sang /app/reports/sources (đợt này chỉ có "Nguồn nào ra tiền").
  // roles PHẢI khớp REPORT_ROLES của các page báo cáo — staff/viewer mở ra chỉ
  // gặp "không có quyền" nên ẨN hẳn khỏi nav (lịch sự UI, quyền thật ở page).
  { href: "/app/reports", labelKey: "reports", icon: ChartColumn, roles: ["owner", "admin", "manager"] },
  // V6 Đánh giá khách (csatQc) — đọc bình luận khách là việc quản lý, không phải
  // việc hằng ngày của nhân viên; roles PHẢI khớp MANAGE_ROLES của /app/csat và
  // policy select của satisfaction_surveys (ba nơi cùng một danh sách).
  { href: "/app/csat", labelKey: "csat", icon: Star, roles: ["owner", "admin", "manager"] },
  // /app/settings là trang index 4 cụm card; ai cũng có mục để vào (Tài khoản…)
  { href: "/app/settings", labelKey: "settings", icon: Settings },
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

/** Mục này có dành cho vai đang đăng nhập không (không khai roles = mọi vai). */
export function canSeeNavItem(item: NavItem, role: string): boolean {
  return !("roles" in item) || (item.roles as readonly string[]).includes(role);
}

/**
 * Khung nav theo pack (Quy hoạch mục 35.1 việc 8): 2 mục "contacts"/"deals"
 * đổi nhãn theo từ vựng ngành đang chọn — CHỈ đổi CHỮ, không đổi cấu trúc
 * nav/route. Tenant chưa chọn ngành (terminology rỗng) → chuỗi mặc định
 * `shell.nav.*` như cũ.
 */
function navLabel(
  labelKey: string,
  t: (key: string) => string,
  pack: TenantPack | undefined,
): string {
  if (labelKey === "contacts" && pack?.terminology?.contact) {
    return capitalizeFirst(pack.terminology.contact);
  }
  if (labelKey === "deals" && pack?.terminology?.deal) {
    return capitalizeFirst(pack.terminology.deal);
  }
  return t(`nav.${labelKey}`);
}

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

function isActive(pathname: string, item: NavItem): boolean {
  return "exact" in item && item.exact
    ? pathname === item.href
    : pathname.startsWith(item.href);
}

/** `role` từ app layout — mục có khai roles chỉ hiện với vai đủ quyền xem. */
export function SidebarNav({ role, pack }: { role: string; pack?: TenantPack }) {
  const pathname = usePathname();
  const t = useTranslations("shell");

  return (
    <nav className="flex flex-1 flex-col gap-1 p-2">
      {NAV_ITEMS.filter((item) => canSeeNavItem(item, role)).map((item) => {
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
            {navLabel(labelKey, t, pack)}
          </Link>
        );
      })}
    </nav>
  );
}

/** Trên 99 thì con số cụ thể không còn giúp gì — bóp gọn để không vỡ huy hiệu (mẫu chuông thông báo). */
const BADGE_MAX = 99;

/** Thanh điều hướng đáy cho mobile (<md) — 4 mục hằng ngày, chung nhãn với sidebar. */
export function MobileNav({ tenantId, pack }: { tenantId: string; pack?: TenantPack }) {
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
            {navLabel(labelKey, t, pack)}
          </Link>
        );
      })}
    </nav>
  );
}
