"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Ô mật khẩu có nút hiện/ẩn.
 *
 * Chủ tiệm gõ mật khẩu trên điện thoại, không nhìn thấy mình gõ gì, sai một ký
 * tự là bị đá ra mà không biết sai ở đâu — nhất là màn đặt lại mật khẩu vốn bắt
 * gõ đúng hai lần. Cho họ nhìn thấy cái mình vừa gõ là bớt hẳn vòng lặp bực bội.
 *
 * Mặc định vẫn ẨN: hiện sẵn thì người đứng sau lưng đọc được.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [shown, setShown] = useState(false);
  const t = useTranslations("common.password");
  const Icon = shown ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        {...props}
        type={shown ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t("hide") : t("show")}
        aria-pressed={shown}
        // Vùng bấm 36px cho ngón tay, nhưng không đẩy ô input cao lên
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </div>
  );
}
