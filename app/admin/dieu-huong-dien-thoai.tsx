"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { MUC_QUAN_TRI, mucDangMo } from "@/lib/admin/dieu-huong";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Điều hướng khu quản trị ở khổ **dưới 768px** — nút ☰ mở tấm phủ toàn màn.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI GOM LẠI SAU MỘT NÚT
 * ═══════════════════════════════════════════════════════════════════
 * Đo 22/08 trên CSS thật của app, khổ 375px: bày như cũ cần **954px**. Ô thương
 * hiệu bị bóp còn 0px (logo tràn ra và ĐÈ LÊN chữ "Người dùng"), và **5 mục bị
 * cắt** khỏi mép phải — trong đó có "Về app". Khung ngoài đặt `overflow-hidden`
 * nên chúng **không cuộn tới được**: chúng biến mất hẳn.
 * Bày lại kiểu này chỉ cần **224px**, dư 151px ở khổ 375.
 *
 * ⚠️ Dùng `Dialog` dùng chung của kho, KHÔNG tự dựng lớp phủ riêng — nó cho sẵn
 *   bốn thứ bắt buộc mà tự viết rất dễ sót: bẫy con trỏ bàn phím trong tấm phủ ·
 *   Esc đóng · trả con trỏ về đúng nút ☰ · khoá cuộn nền. (Hạ tầng dùng chung là
 *   bản duy nhất — bất biến 13.)
 *
 * ⚠️ "Về app" CỐ Ý không nằm trong danh sách này. Nó rời khỏi khu quản trị, nên
 *   nó sống trong menu tài khoản cùng nhóm với Đăng xuất. Trộn hai loại vào một
 *   danh sách là mời người ta bấm nhầm.
 */
export function DieuHuongDienThoai() {
  const t = useTranslations("admin");
  const duongDan = usePathname();
  const dangMo = mucDangMo(duongDan);
  const [mo, datMo] = useState(false);

  /**
   * ⚠️ NÚT BACK CỦA TRÌNH DUYỆT PHẢI ĐÓNG TẤM PHỦ, không rời trang.
   *   Trên điện thoại, Back là cách đóng lớp phủ mà ai cũng thử đầu tiên. Không
   *   xử thì người ta văng thẳng ra khỏi khu quản trị.
   *   Cách làm: mở thì ghi một mốc vào lịch sử; Back nhả mốc đó ⇒ `popstate` bắn
   *   ⇒ đóng. Đóng bằng đường khác (Esc, bấm mục) thì tự gỡ mốc đã ghi để không
   *   để lại một nấc lịch sử rỗng.
   */
  useEffect(() => {
    if (!mo) return;
    window.history.pushState({ tamPhuQuanTri: true }, "");
    const dong = () => datMo(false);
    window.addEventListener("popstate", dong);
    return () => {
      window.removeEventListener("popstate", dong);
      if (window.history.state?.tamPhuQuanTri) window.history.back();
    };
  }, [mo]);

  return (
    <Dialog open={mo} onOpenChange={datMo}>
      <DialogTrigger
        aria-label={t("khung.moMenu")}
        className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-md border md:hidden",
          "text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {mo ? <X className="size-5" /> : <Menu className="size-5" />}
      </DialogTrigger>

      {/* Tấm phủ TOÀN MÀN, không phải hộp thoại giữa màn: ở khổ này danh sách là
          thứ duy nhất người dùng cần thấy, và mỗi dòng phải đủ cao để ngón cái
          bấm không cần nhắm. */}
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 h-svh w-svw max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 p-0 sm:max-w-none"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
          <DialogTitle className="text-sm font-semibold">{t("khung.dieuHuong")}</DialogTitle>
          <button
            type="button"
            aria-label={t("khung.dongMenu")}
            onClick={() => datMo(false)}
            className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto">
          {MUC_QUAN_TRI.map((m) => (
            <Link
              key={m.khoa}
              href={m.duong}
              aria-current={m.khoa === dangMo ? "page" : undefined}
              // Đóng NGAY lúc bấm, không chờ đường dẫn đổi rồi mới đóng bằng
              // hiệu ứng phụ: gọi `setState` thẳng trong `useEffect` là mẫu bị
              // bộ lint của kho chặn, và nó cũng chậm hơn một nhịp vẽ.
              onClick={() => datMo(false)}
              className={cn(
                "flex h-12 items-center border-b px-4 text-sm",
                m.khoa === dangMo ? "bg-muted font-semibold" : "text-foreground",
              )}
            >
              {/* Tấm phủ có cả chiều rộng ⇒ dùng nhãn ĐẦY ĐỦ, không rút gọn. */}
              {t(m.nhan)}
            </Link>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
