import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Ô tích. Dùng thẻ gốc + `accent-primary` để dấu tích mang màu cam thương hiệu
 * thay vì màu đen mặc định của trình duyệt — trước đây đây là chỗ duy nhất
 * trong biểu mẫu không thấy màu iFan.
 *
 * `size-4` kèm vùng bấm rộng hơn nhờ nhãn đi kèm (dùng `Label` bọc ngoài).
 */
function Checkbox({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        className
      )}
      {...props}
    />
  )
}

export { Checkbox }
