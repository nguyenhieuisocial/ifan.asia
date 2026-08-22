import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/brand-mark";
import { createClient } from "@/lib/supabase/server";
import { noiQuayLai } from "@/lib/auth/noi-quay-lai";
import { DieuHuongDienThoai } from "./dieu-huong-dien-thoai";
import { MenuTaiKhoan } from "./menu-tai-khoan";
import { ThanhDieuHuong } from "./thanh-dieu-huong";

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
 *
 * ═══════════════════════════════════════════════════════════════════
 * KHUNG BA KHỔ MÀN — sửa 22/08, thẻ `design-system/man-quan-tri-khung.html`
 * ═══════════════════════════════════════════════════════════════════
 * Trước 22/08 khu này dựng cho đúng MỘT khổ máy: khung ngoài có **0 điểm gãy**
 * màn hình, và 4/6 màn con cũng vậy. Đo ở 375px thì đầu trang cần 954px — logo
 * bị bóp còn 0px rồi tràn ra đè lên chữ, và **5 mục bị cắt** khỏi mép phải mà
 * không cuộn tới được (khung ngoài chặn tràn). Cộng với chuyện **không có lối
 * đăng xuất**, mở khu quản trị trên điện thoại là không có lối ra nào cả.
 *
 * Nay: một chiều cao đầu trang duy nhất **48px** cho cả ba khổ; điểm gãy **768**
 * và **1024** — đúng hai mốc app đã dùng ở 340 và 62 chỗ khác, không đẻ mốc mới.
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
   *
   * ⚠️ MANG THEO ĐƯỜNG QUAY LẠI — vá 22/08. Cổng gác ngoài (`proxy.ts`) có đặt
   *   `?next=` cho `/admin`, nhưng lớp chặn NÀY thì trước đó gọi thẳng
   *   `redirect("/login")` và **đánh rơi địa chỉ đang xem**. Lớp này chỉ nổ khi
   *   vé vừa hết hạn giữa hai lớp — nhưng đó đúng là lúc nó hay nổ nhất, và khi
   *   đó founder bị ném về trang chủ app thay vì quay lại đúng màn đang đọc.
   *   Đường dẫn lấy từ tiêu đề `x-duong-dan` do `proxy.ts` gắn, và vẫn đi qua
   *   `noiQuayLai()` để lọc — không tin thẳng tiêu đề của yêu cầu.
   */
  if (!user) {
    const duongDan = (await headers()).get("x-duong-dan");
    const cho = noiQuayLai(duongDan);
    redirect(`/login?next=${encodeURIComponent(cho)}`);
  }

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

  const ten =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    (user.user_metadata?.name as string | undefined)?.trim() ||
    null;

  return (
    <NextIntlClientProvider messages={chuDayDu}>
      <div className="flex h-svh w-full flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3 md:px-4">
          <div className="flex min-w-0 items-center gap-2">
            {/* ⚠️ LOGO LÀ LIÊN KẾT — vá 22/08. Trước đó `BrandMark` là thẻ chữ
                thuần, nên từ màn Nhật ký muốn về Toàn cảnh chỉ còn nút Back của
                trình duyệt. Làm nó thành liên kết tốn 0px và chữa được ở cả ba
                khổ màn, kể cả khổ điện thoại nơi thanh điều hướng đã bị gom vào
                nút ☰. */}
            <Link
              href="/admin"
              aria-label={t("khung.tongQuan")}
              className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandMark suffix className="text-sm" />
            </Link>
            {/* Nhãn mô tả chỉ hiện từ 1024px. Ở 768px nó bị bóp còn 98px và cắt
                cụt — một nhãn cắt cụt tệ hơn không có nhãn. */}
            <span className="hidden truncate text-xs text-muted-foreground lg:inline">
              {t("shellLabel")}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <ThanhDieuHuong />
            <DieuHuongDienThoai />
            <MenuTaiKhoan email={user.email ?? ""} tenHienThi={ten} />
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
