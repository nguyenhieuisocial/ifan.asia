import { cn } from "@/lib/utils";

// "iFan" — tên thương hiệu, không dịch (brand name, not translatable copy)
const BRAND = "iFan";

/**
 * Dấu hiệu thương hiệu duy nhất của iFan: chấm cam đất + chữ.
 *
 * Trước đây mỗi nơi một kiểu — trang chủ là chấm + "iFan", trong app lại là
 * "iFan.asia" đậm không chấm. Người dùng đi từ trang chủ vào app thấy hai logo
 * khác nhau thì thương hiệu không đọng lại được. Một nguồn duy nhất từ đây.
 *
 * Logo thuần token màu, không dùng ảnh: đổi màu thương hiệu là logo đổi theo,
 * và không tốn thêm một lượt tải nào.
 */
export function BrandMark({
  suffix = false,
  className,
}: {
  /** Kèm đuôi ".asia" — dùng ở nơi cần tên miền đầy đủ (trong app, màn đăng nhập). */
  suffix?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-lg font-semibold tracking-tight",
        className,
      )}
    >
      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-primary" />
      <span>
        {BRAND}
        {suffix && <span className="text-muted-foreground">.asia</span>}
      </span>
    </span>
  );
}
