"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MUC_QUAN_TRI, mucDangMo } from "@/lib/admin/dieu-huong";
import { cn } from "@/lib/utils";

/**
 * Thanh điều hướng khu quản trị — chỉ hiện từ **768px** trở lên.
 * Dưới 768px dùng `DieuHuongDienThoai` (nút ☰ + tấm phủ toàn màn).
 *
 * ⚠️ Danh sách mục đọc từ `lib/admin/dieu-huong.ts`, KHÔNG gõ lại ở đây — luật
 *   giao diện G10 và luật D1. Ba khổ màn, ba cách bày, MỘT nguồn.
 *
 * ⚠️ Hai nhãn khác nhau theo khổ, và đó là số đo chứ không phải thẩm mỹ:
 *   - 768–1023px dùng `nhanNgan` ("Nhật ký"). Đo 22/08 trên CSS thật: bày đủ
 *     với nhãn dài cần **760px** ⇒ TRÀN ở 768px; với nhãn ngắn cần **701px** ⇒
 *     vừa, dư 67px.
 *   - Từ 1024px dùng nhãn đầy đủ ("Nhật ký quản trị"): cần **906px**, dư 118px.
 *   Cách làm: render CẢ HAI rồi ẩn/hiện bằng CSS — đổi nhãn theo JavaScript sẽ
 *   lệch giữa bản dựng ở máy chủ và bản trình duyệt tính lại.
 */
export function ThanhDieuHuong() {
  const t = useTranslations("admin");
  const duongDan = usePathname();
  const dangMo = mucDangMo(duongDan);

  return (
    <nav className="hidden items-center gap-0.5 md:flex" aria-label={t("khung.dieuHuong")}>
      {MUC_QUAN_TRI.map((m) => {
        const mo = m.khoa === dangMo;
        return (
          <Link
            key={m.khoa}
            href={m.duong}
            aria-current={mo ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors",
              "hover:bg-foreground/[0.04] hover:text-foreground",
              mo ? "bg-muted font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {m.nhanNgan ? (
              <>
                <span className="lg:hidden">{t(m.nhanNgan)}</span>
                <span className="hidden lg:inline">{t(m.nhan)}</span>
              </>
            ) : (
              t(m.nhan)
            )}
          </Link>
        );
      })}
    </nav>
  );
}
