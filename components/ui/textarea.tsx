import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Ô nhập nhiều dòng.
 *
 * Trước đây mỗi màn tự viết một chuỗi class riêng (livechat, biểu mẫu, hồ sơ
 * khách…) và chúng đã lệch nhau: nơi cho kéo cao, nơi không; và KHÔNG nơi nào
 * có trạng thái bị khóa — ô khóa trông y hệt ô gõ được, người dùng gõ mãi không
 * ăn mà không hiểu vì sao. Một nguồn duy nhất từ đây, khớp hệt `Input`.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-16 w-full min-w-0 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
