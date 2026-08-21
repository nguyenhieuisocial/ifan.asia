import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Khu super-admin — màn DUY NHẤT nhìn xuyên tenant, chỉ founder của iFan vào được.
 *
 * CỔNG DUY NHẤT: RPC `is_platform_admin()` (migration #28) đối chiếu `auth.uid()`
 * với bảng `platform_admins` — bảng RLS bật, KHÔNG policy, người dùng không tự
 * ghi mình vào được. KHÔNG đọc claim trong JWT: claim phụ thuộc Custom Access
 * Token Hook (có thể tắt) nên không đáng tin cho quyết định quyền hạn.
 *
 * Không đủ quyền → 404 (không phải "cấm truy cập"): không hé lộ là có khu này.
 * Bảng để trống sau migration → mặc định KHÔNG AI vào được, kể cả owner.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  /**
   * ⚠️ HAI CẢNH KHÁC NHAU, HAI CÁCH TRẢ LỜI KHÁC NHAU.
   *
   * · CHƯA ĐĂNG NHẬP ⇒ mời đăng nhập. Trước 22/08 chỗ này cũng trả "không tìm
   *   thấy trang", và founder — người DUY NHẤT có quyền — gặp đúng nó khi phiên
   *   hết hạn: tài khoản đúng, quyền đúng, mà màn nói là không có trang này.
   *   Giấu ở đây cũng chẳng giấu được gì: mọi màn `/app` đều đưa người chưa
   *   đăng nhập về `/login`, nên `/admin` im lặng không thêm một chút kín đáo
   *   nào — chỉ thêm một người bị kẹt.
   *
   * · ĐÃ ĐĂNG NHẬP MÀ KHÔNG PHẢI CHỦ SAAS ⇒ 404, KHÔNG phải "cấm truy cập".
   *   Đây mới là chỗ cần giấu: không hé lộ là có khu này.
   */
  if (!user) redirect("/login");

  const { data: isAdmin, error } = await supabase.rpc("is_platform_admin");
  if (error || isAdmin !== true) notFound();

  const t = await getTranslations("admin");
  /**
   * ⚠️ LỚP CÂU CHỮ ĐẦY ĐỦ cho khu quản trị. Khung gốc CỐ Ý chỉ trao phần công
   *   khai (xem `i18n/nhanh-cong-khai.ts`): đo 22/08, trao cả kho làm mọi trang
   *   giới thiệu cõng thêm 219 KB chữ của các màn chỉ dùng sau đăng nhập. Lớp
   *   này chỉ dựng cho người ĐÃ vào được khu admin, nên phần nặng nằm đúng chỗ
   *   có người dùng tới nó.
   */
  const chuDayDu = await getMessages();

  return (
    <NextIntlClientProvider messages={chuDayDu}>
      <div className="flex h-svh w-full flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
          <div className="flex min-w-0 items-baseline gap-2">
            <BrandMark suffix className="text-sm" />
            <span className="truncate text-xs text-muted-foreground">
              {t("shellLabel")}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* Lối vào quyển nhật ký (việc #207). Đặt ở LAYOUT chứ không ở trang
              chủ khu admin: màn đọc được mà không có lối bấm tới thì lại rơi
              đúng lớp bệnh "dựng xong rồi chôn". */}
            {/* Lối vào danh sách người dùng — cùng lý do với nhật ký: đặt ở
              LAYOUT để mọi màn trong khu admin đều bấm tới được. */}
            <Link
              href="/admin/nguoi-dung"
              className="rounded-md px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              {t("users.navLabel")}
            </Link>
            {/* Cong tac tinh nang (#331) — dat o LAYOUT vi day la man phai voi
              toi duoc NHANH lúc dang co su co, khong phai man di tim. */}
            <Link
              href="/admin/cong-tac"
              className="rounded-md px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              {t("flags.navLabel")}
            </Link>
            <Link
              href="/admin/nhat-ky"
              className="rounded-md px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              {t("auditLog.navLabel")}
            </Link>
            <Link
              href="/app"
              className="rounded-md px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              {t("backToApp")}
            </Link>
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main
          id="noi-dung-chinh"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
