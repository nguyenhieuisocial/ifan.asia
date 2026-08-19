"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TenantPack } from "@/lib/tenant-pack";
import {
  NHOM_CUA_MUC,
  THU_TU_NHOM,
  mobileSheetItems,
  navLabelFor,
} from "./sidebar-nav";

/**
 * Bảng "Thêm" — lối vào MỌI mảng không có ô ở thanh dưới (ADR-0024).
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO LÀ BẢNG RIÊNG, KHÔNG PHẢI MENU SAU ẢNH ĐẠI DIỆN
 * ═══════════════════════════════════════════════════════════════════
 * Trước 19/08, 21 mục điều hướng nằm trong menu tài khoản. Hai cái sai:
 *
 *  · **Sai chỗ.** Ảnh đại diện là nơi người ta tìm "đăng xuất", "đổi mật khẩu",
 *    "đổi tiệm". Không ai đi tìm "Bảng lương" ở đó. Đặt điều hướng vào đấy
 *    không phải gọn — là **giấu**.
 *  · **Sai kích thước.** Đo được menu cao 646px trong khi nội dung 822px ⇒
 *    "Đăng xuất" nằm thấp hơn mép dưới 141px, menu cụt ngay tại "English".
 *    Vai chủ tiệm còn nhiều mục hơn nên tụt sâu hơn nữa.
 *
 * Tách ra bảng riêng **bỏ luôn nguyên nhân** của lỗi thứ hai: menu tài khoản
 * còn 6 mục thì không cần cuộn. Cách khác (ghim Đăng xuất xuống đáy menu) chỉ
 * chữa triệu chứng và vẫn để điều hướng nằm sai chỗ.
 *
 * Xếp theo NHÓM chứ không đổ phẳng: 20+ mục thành một dải dọc thì đọc như danh
 * bạ. Nhóm lấy theo bản đồ 9 nhóm của `lib/feature-registry.ts`, cùng cách bản
 * máy tính và trang tính năng công khai đang dùng.
 */
export function MobileMoreSheet({
  open,
  onOpenChange,
  role,
  pack,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: string;
  pack?: TenantPack;
}) {
  const t = useTranslations("shell");
  const locale = useLocale();
  const items = mobileSheetItems(role);

  // Nhóm nào không có mục nào (vai đó không thấy) thì KHÔNG hiện tiêu đề nhóm
  // trống — tiêu đề trống làm người dùng tưởng mình bị mất quyền gì đó.
  const theoNhom = THU_TU_NHOM.map((nhom) => ({
    nhom,
    muc: items.filter((x) => NHOM_CUA_MUC[x.labelKey] === nhom),
  })).filter((g) => g.muc.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-md">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-[15px]">{t("more.title")}</DialogTitle>
        </DialogHeader>

        <div className="pb-2">
          {theoNhom.map(({ nhom, muc }) => (
            <div key={nhom}>
              <div className="px-4 pt-3 pb-1 text-[10.5px] font-bold tracking-wide text-muted-foreground uppercase">
                {t(`more.groups.${nhom}`)}
              </div>
              {muc.map(({ href, labelKey, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => onOpenChange(false)}
                  // 44px: dưới mức này là chạm nhầm. Đo 19/08 cho thấy các nút
                  // điều hướng chính của bản điện thoại đều đang 32–36px.
                  className="flex min-h-11 items-center gap-2.5 px-4 py-2 text-[13px] text-foreground transition-colors hover:bg-foreground/[0.04]"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {navLabelFor(labelKey, t, pack, locale)}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
