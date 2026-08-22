"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { signOut } from "@/app/auth/actions";
import { setLocale } from "@/i18n/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * MENU TÀI KHOẢN CỦA KHU QUẢN TRỊ — và là lối ĐĂNG XUẤT duy nhất trong khu này.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ — đây là lỗ BẢO MẬT, không phải bất tiện
 * ═══════════════════════════════════════════════════════════════════
 * Founder hỏi 22/08 khi đang dùng thật: *"đang ở /admin thì đăng xuất kiểu gì?"*
 * Đo lại: đầu trang khu quản trị có 6 liên kết + đổi ngôn ngữ + đổi nền, **không
 * mục nào là đăng xuất**. Trên máy tính vẫn thoát được (Về app → menu người dùng
 * → Đăng xuất) nhưng tốn một lần tải trang; **trên điện thoại thì mất hẳn** vì ở
 * khổ 375px chính "Về app" bị cắt khỏi mép phải và khung ngoài chặn tràn nên
 * không cuộn tới được. Khu có quyền cao nhất mà không thoát ra được là lỗi bảo
 * mật: máy chung, máy mượn, phiên bỏ quên.
 *
 * Thẻ thiết kế (đã chốt, đã đẩy Claude Design): `design-system/man-quan-tri-khung.html`.
 *
 * ⚠️ NGÔN NGỮ VÀ GIAO DIỆN NẰM Ở ĐÂY, không còn nút riêng trên thanh. Trước 22/08
 *   thanh có hai nút riêng; bỏ chúng tiết kiệm 64px — đủ để khổ iPad dọc chứa CẢ
 *   SÁU mục điều hướng (đo: 701px cần / 768px có). Và nó khớp khu `/app`, nơi cả
 *   hai vốn đã nằm trong menu người dùng — hai nơi cho một việc là đúng bệnh D1.
 *
 * ⚠️ "ĐĂNG XUẤT" CỐ Ý **KHÔNG TÔ ĐỎ**. Bản vẽ đầu tô đỏ cho dễ thấy, nhưng khu
 *   `/app` đã cố ý không tô — và theo thứ tự ưu tiên của founder, **toàn vẹn
 *   chuẩn (hạng 2) thắng tiện cho giao diện (hạng 7)**. Muốn đỏ thì đổi cả hai
 *   nơi cùng lúc bằng một quyết định riêng.
 *
 * ⚠️ CHƯA CÓ ĐỔI TÀI KHOẢN — cố ý, không phải quên. Bản vẽ đợt 2 bị chính vòng
 *   phản biện bác vì có lỗ bảo mật: luật "đổi lên quyền thì xác nhận lại" KHÔNG
 *   bảo vệ được đúng tình huống nó phục vụ (đang ngồi trong /admin thì vé quản
 *   trị vẫn sống trong máy), và cổng gác của nó nằm ở phía máy khách. Sáu câu
 *   phải trả lời trước khi vẽ lại nằm ở mục ⑦ của thẻ.
 */
export function MenuTaiKhoan({
  email,
  tenHienThi,
  coDangNhapNhieuNoi,
}: {
  email: string;
  tenHienThi: string | null;
  /** Chừa sẵn cho đợt 2; hiện luôn `false`. Không có code nào bật nó. */
  coDangNhapNhieuNoi?: boolean;
}) {
  const t = useTranslations("admin.khung");
  const tMenu = useTranslations("shell.userMenu");
  const tTheme = useTranslations("common.theme");
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [dangChay, batDau] = useTransition();
  const [mo, datMo] = useState(false);

  const ten = tenHienThi || email;
  const chuDau = (ten.trim()[0] ?? "?").toUpperCase();

  /**
   * ⚠️ KHÔNG rời trang khi phiên CHƯA thật sự đóng.
   *
   * `signOut()` nay ném lỗi thay vì chuyển hướng nếu máy chủ từ chối (xem
   * `app/auth/actions.ts`). Chuyển về trang đăng nhập trong khi phiên vẫn sống
   * là **giả vờ đã đăng xuất** — đúng thứ nguy hiểm nhất ở màn này, vì người ta
   * rời máy vì tin là đã thoát. Hỏng thì ở nguyên và nói thẳng.
   *
   * ⚠️ Lời gọi thành công KHÔNG bao giờ chạy tới `catch`: nó kết thúc bằng
   *   `redirect()` phía máy chủ, và Next tự chuyển trang. Nên `catch` ở đây chỉ
   *   bắt đúng ca hỏng thật.
   */
  const dangXuat = () =>
    batDau(async () => {
      try {
        await signOut();
      } catch {
        toast.error(t("dangXuatHong"));
        datMo(false);
      }
    });

  return (
    <DropdownMenu open={mo} onOpenChange={datMo}>
      <DropdownMenuTrigger
        // Máy đọc màn hình đọc "H" thì không ai hiểu đó là nút gì.
        aria-label={t("tenMenuTaiKhoan", { ten })}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-primary",
          "text-sm font-semibold text-primary-foreground",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          // <768px là phía ngón tay (luật vùng chạm: 44px); từ 768px là phía
          // con trỏ chuột, giữ 36px như mọi nút biểu tượng khác trong app.
          "size-11 md:size-9",
        )}
      >
        {chuDau}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <div className="truncate text-sm font-medium">{ten}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {tMenu("language")}
        </DropdownMenuLabel>
        <DropdownMenuItem disabled={dangChay} onSelect={() => void setLocale("vi")}>
          {tMenu("vietnamese")}
          {locale === "vi" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={dangChay} onSelect={() => void setLocale("en")}>
          {tMenu("english")}
          {locale === "en" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {tTheme("label")}
        </DropdownMenuLabel>
        {(["light", "dark", "system"] as const).map((che) => (
          <DropdownMenuItem key={che} onSelect={() => setTheme(che)}>
            {tTheme(che)}
            {theme === che && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        {/* Ba mục dưới đây đều DẪN RA KHỎI khu quản trị — cùng một họ, nên cùng
            một nhóm. Trộn chúng với 6 mục điều hướng là mời người ta bấm nhầm. */}
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("roiKhuQuanTri")}
        </DropdownMenuLabel>
        <DropdownMenuItem disabled={dangChay} onSelect={() => router.push("/app/settings/account")}>
          {t("hoSoCuaToi")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={dangChay} onSelect={() => router.push("/app")}>
          {t("veApp")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={dangChay}
          onSelect={(e) => {
            // Giữ menu mở tới khi biết kết quả: hỏng thì người dùng còn thấy
            // mình đang ở đâu, thay vì menu đóng lại và không có gì thay đổi.
            e.preventDefault();
            dangXuat();
          }}
        >
          {tMenu("signOut")}
        </DropdownMenuItem>
        {coDangNhapNhieuNoi && null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
