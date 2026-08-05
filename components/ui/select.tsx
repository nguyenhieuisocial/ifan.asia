import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Ô chọn — dùng thẻ `select` gốc của trình duyệt, cố ý.
 *
 * Trên điện thoại, `select` gốc mở ra bánh xe chọn quen thuộc của hệ điều hành:
 * chủ tiệm dùng được ngay, không phải học. Danh sách tự làm trông "xịn" hơn
 * nhưng lại kém hơn đúng ở chỗ quan trọng nhất.
 *
 * Cỡ chữ `text-base` trên điện thoại là BẮT BUỘC: iPhone tự phóng to cả trang
 * khi chạm vào ô có chữ nhỏ hơn 16px, phóng xong không thu lại — bản viết tay
 * trước đây để `text-sm` nên dính đúng lỗi này.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Select }
