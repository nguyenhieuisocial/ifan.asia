"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleSettingsItems, type SettingsGroup } from "./access";

/**
 * Khung nav khu Cài đặt (task #132, design-system/man-cai-dat-khung.html).
 *
 * Trước đây MỘT dải cuộn ngang nhồi 19 mục — cụt cả hai đầu, chữ đầu bị xén,
 * và tự kéo mục đang mở vào giữa (đá nhau với tay người dùng đang cuộn).
 * Nhóm đã có sẵn trong access.ts (`item.group`), chỉ là giao diện cũ đổ phẳng
 * rồi vứt đi — không cần thêm dữ liệu, chỉ cần DÙNG LẠI.
 *
 * Máy tính: cột trái theo nhóm, cao hết khung, không cuộn ngang.
 * Điện thoại: KHÔNG hiện cột này — /app/settings (page.tsx) tự là trang danh
 * sách theo nhóm; vào một mục thì hiện thanh "‹ Tên mục" thay cho cột trái.
 */

// Thứ tự nhóm trên màn — khớp đúng thứ tự thẻ design (Tiệm → Kênh khách →
// Tự động & AI → Người & quyền → Tài khoản).
const GROUP_ORDER: readonly SettingsGroup[] = [
  "tenant",
  "channels",
  "automation",
  "team",
  "billing",
];

export function SettingsNav({ role }: { role: string }) {
  const pathname = usePathname();
  const t = useTranslations("settings.nav");
  const tCommon = useTranslations("common");
  const items = visibleSettingsItems(role);
  const activeItem = items.find(({ href }) => pathname.startsWith(href));

  return (
    <>
      {/* Điện thoại — chỉ hiện khi ĐANG ở một mục con; ở /app/settings thì
          page.tsx tự có tiêu đề riêng, không cần thanh này. */}
      {activeItem && (
        <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2 md:hidden">
          <Link
            href="/app/settings"
            aria-label={tCommon("back")}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-[--color-brand,#C94C18] transition-colors hover:bg-foreground/[0.04]"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <span className="truncate text-[13px] font-semibold">{t(activeItem.key)}</span>
        </div>
      )}

      {/* Máy tính — cột trái theo nhóm. */}
      <nav className="hidden w-[186px] shrink-0 flex-col overflow-y-auto border-r py-1 md:flex">
        {GROUP_ORDER.map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group}>
              <div className="px-3 pt-3 pb-1 text-[10.5px] font-bold tracking-wide text-muted-foreground uppercase">
                {t(`groups.${group}`)}
              </div>
              {groupItems.map(({ href, key }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={pathname.startsWith(href) ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center px-3 text-[12.5px] transition-colors",
                    pathname.startsWith(href)
                      ? "bg-[#FAF5EF] font-semibold text-[--color-brand,#C94C18] shadow-[inset_2px_0_0_var(--color-brand,#C94C18)]"
                      : "font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                >
                  {t(key)}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
    </>
  );
}
