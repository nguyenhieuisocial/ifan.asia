"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Khóa nút 60 giây sau mỗi lần bấm — trần Supabase chỉ 2 thư/giờ, bấm dồn dập là tự đốt hạn mức. */
const COOLDOWN_S = 60;

/**
 * Nút "Gửi lại thư" cho các màn "đã gửi email" (xác nhận đăng ký, đặt lại mật khẩu).
 *
 * Email KHÔNG nằm ở đây — server action tự đọc từ cookie đã nhớ lúc gửi lần
 * đầu (xem app/auth/actions.ts), nên nút chỉ việc gọi action, không form nhập.
 *
 * Mốc hết khóa ghi vào sessionStorage chứ không chỉ state: server action điều
 * hướng lại trang làm component dựng lại, không ghi lại thì đếm ngược biến mất
 * và nút mở khóa sớm. sessionStorage đóng theo tab — đóng tab là hết, không
 * nằm lại trong máy như localStorage.
 */
export function ResendEmailButton({
  action,
  storageKey,
}: {
  /** Server action gửi lại đúng lá thư của màn đang đứng. */
  action: () => Promise<void>;
  /** Mỗi màn một khóa riêng để đếm ngược không lây giữa hai luồng thư. */
  storageKey: string;
}) {
  const [remaining, setRemaining] = useState(0);

  // Đồng hồ đọc mốc khóa từ sessionStorage mỗi giây. Lượt đọc ĐẦU đi qua
  // setTimeout(0) thay vì gọi thẳng trong effect: (1) setState đồng bộ trong
  // effect bị cấm (react-hooks/set-state-in-effect), (2) render đầu giữ
  // remaining=0 giống bản server nên không lệch hydration.
  useEffect(() => {
    const tick = () => {
      const until = Number(sessionStorage.getItem(storageKey) ?? 0);
      setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    };
    const timeoutId = setTimeout(tick, 0);
    const intervalId = setInterval(tick, 1000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [storageKey]);

  // Chạy TRƯỚC khi action gửi đi — khóa ngay lúc bấm, không đợi server trả lời
  function startCooldown() {
    sessionStorage.setItem(storageKey, String(Date.now() + COOLDOWN_S * 1000));
    setRemaining(COOLDOWN_S);
  }

  return (
    <form action={action} onSubmit={startCooldown}>
      <ResendButtonInner remaining={remaining} />
    </form>
  );
}

/** Tách riêng vì useFormStatus chỉ đọc được trạng thái khi đứng BÊN TRONG form. */
function ResendButtonInner({ remaining }: { remaining: number }) {
  const { pending } = useFormStatus();
  const t = useTranslations("auth.resend");
  return (
    <Button
      type="submit"
      variant="outline"
      className="w-full"
      disabled={pending || remaining > 0}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {remaining > 0 ? t("countdown", { seconds: remaining }) : t("button")}
    </Button>
  );
}
