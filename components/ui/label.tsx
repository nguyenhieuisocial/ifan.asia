import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Nhãn của ô nhập.
 *
 * VÌ SAO CẦN NHÃN THẬT, không chỉ chữ mờ trong ô: chữ mờ BIẾN MẤT ngay khi
 * người ta bắt đầu gõ. Màn đặt lại mật khẩu có hai ô mật khẩu, màn Cài đặt →
 * Tài khoản có ba — gõ vào rồi thì cả ba trông y hệt nhau, quay lại sửa là
 * không biết ô nào là ô nào.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-[13px] leading-none font-medium select-none",
        "has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
