import Link from "next/link";
import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Khung chung cho mọi màn tài khoản (đăng nhập, đăng ký, quên/đặt lại mật khẩu).
 *
 * VÌ SAO CÓ: trước đó mỗi màn là một ô nhỏ trôi giữa khoảng trắng mênh mông,
 * KHÔNG có logo — ai lạc vào không biết đây là sản phẩm gì, và đó là màn đầu
 * tiên khách gặp. Giờ: chấm thương hiệu + thẻ có viền và bóng để nội dung có
 * chỗ đứng, kèm một cột giới thiệu bên phải trên máy tính.
 *
 * Trên điện thoại cột giới thiệu ẩn đi — chủ tiệm mở app để ĐĂNG NHẬP, không
 * phải để đọc quảng cáo, và màn hẹp thì mỗi dòng thừa đẩy nút xuống dưới tầm tay.
 */
export async function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Khối rộng hơn — dùng cho màn tạo tiệm (lưới chọn ngành cần 2 cột). */
  wide?: boolean;
}) {
  const t = await getTranslations("auth.panel");
  const points = [t("point1"), t("point2"), t("point3")];

  return (
    <main id="noi-dung-chinh" className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Cột trái — nội dung thao tác */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-14 sm:py-20">
        <div className="absolute top-4 right-4 flex items-center gap-1">
          <ThemeToggle />
          <LocaleSwitcher />
        </div>

        <div className={cn("w-full space-y-6", wide ? "max-w-md" : "max-w-sm")}>
          {/* Bấm được về trang giới thiệu: trên điện thoại cột giới thiệu bên
              phải bị ẩn, nên đây là ĐƯỜNG DUY NHẤT ra khỏi màn tài khoản nếu ai
              đó vào nhầm hoặc muốn xem sản phẩm là gì trước khi đăng ký. */}
          <Link
            href="/"
            className="mx-auto block w-fit rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <BrandMark suffix className="text-xl" />
          </Link>

          <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-7">
            <div className="mb-5 space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              {subtitle && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
            {children}
          </div>

          {footer && (
            <div className="space-y-2 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          )}
        </div>
      </div>

      {/* Cột phải — nói tiệm được gì. Ẩn dưới 1024px. */}
      <aside className="hidden w-[38%] max-w-lg shrink-0 flex-col justify-center border-l bg-sidebar px-12 lg:flex">
        <p className="font-display text-3xl leading-tight font-semibold">
          {t("headline")}
        </p>
        <ul className="mt-7 space-y-3.5">
          {points.map((point) => (
            <li key={point} className="flex gap-3 text-sm leading-relaxed">
              <Check
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
