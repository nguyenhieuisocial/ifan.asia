import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";
import { SPOTLIGHT_INDUSTRIES } from "@/lib/industries";

export async function LandingFooter() {
  const [t, tNav, tNganh] = await Promise.all([
    getTranslations("landing.footer"),
    getTranslations("landing.header"),
    getTranslations("common.industries"),
  ]);
  return (
    <footer>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-col justify-between gap-8 sm:flex-row">
          <div className="max-w-sm space-y-3">
            <BrandMark />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("description")}
            </p>
          </div>
          {/* `flex-wrap` + `gap-x-4` KHÔNG phải trang trí — đo 20/08 trên bản
              đang phục vụ: hàng này rộng 358px trong khung 375px trừ lề, nên
              MỌI trang công khai (trang chủ · bảng giá · tính năng · lộ trình ·
              trang ngành) đều TRÔI NGANG trên điện thoại. Sáu mục ép một hàng
              `gap-6` không bao giờ vừa khổ 375px, và càng không vừa 320px.
              Đây là lần thứ HAI cùng lớp bệnh: việc #39 đã sửa một thủ phạm
              khác (khối banner đầu trang) rồi thôi — không để lại cổng nào canh,
              nên thủ phạm thứ hai nằm im tới hôm nay. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 self-start text-sm text-muted-foreground sm:gap-x-6">
            <Link href="/tinh-nang" className="transition-colors hover:text-foreground">
              {tNav("features")}
            </Link>
            <Link href="/lo-trinh" className="transition-colors hover:text-foreground">
              {tNav("roadmap")}
            </Link>
            <Link href="/bang-gia" className="transition-colors hover:text-foreground">
              {tNav("pricing")}
            </Link>
            <Link href="/#faq" className="transition-colors hover:text-foreground">
              {tNav("faq")}
            </Link>
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </div>
        {/* SÁU TRANG NGÀNH — trước bản này chúng MỒ CÔI: không trang nào
            trong web trỏ tới, không có trong sơ đồ trang, chỉ trỏ lẫn nhau.
            Máy tìm kiếm gần như không có cách nào biết chúng tồn tại, và
            khách tìm "phần mềm quản lý spa" thì rơi vào trang chủ chung chung
            thay vì trang nói đúng ngành của họ.

            Chân trang là chỗ đúng: nó có mặt trên MỌI trang công khai, nên sáu
            đường này được trỏ tới từ khắp nơi chứ không chỉ một chỗ. */}
        <div className="border-t pt-6">
          <p className="text-xs font-medium text-muted-foreground">{t("industriesTitle")}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {SPOTLIGHT_INDUSTRIES.map((nganh) => (
              <Link
                key={nganh}
                href={`/nganh/${nganh}`}
                className="transition-colors hover:text-foreground"
              >
                {tNganh(`${nganh}.label`)}
              </Link>
            ))}
          </div>
        </div>

        {/* Điều khoản + Bảo mật để ở chân trang vì đó là chỗ người ta quen tìm,
            và vì Zalo/Meta đòi một đường dẫn chính sách bảo mật công khai mới
            xét duyệt ứng dụng. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-6 text-xs text-muted-foreground">
          <p>{t("copyright", { year: String(new Date().getFullYear()) })}</p>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            {t("terms")}
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            {t("privacy")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
