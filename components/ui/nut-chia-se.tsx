"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * NÚT CHIA SẺ — gửi thẳng sang Zalo / Messenger / tin nhắn, không phải "chép
 * rồi tự đi dán".
 *
 * Trên điện thoại, `navigator.share` mở đúng bảng chia sẻ của hệ điều hành:
 * lễ tân bấm một cái là chọn được khách trong Zalo và gửi luôn. Không có nó
 * thì họ phải chép, thoát app, mở Zalo, tìm khách, dán — năm bước cho một
 * việc, và ở giữa rất dễ dán nhầm chỗ.
 *
 * ⚠️ TỰ LÙI VỀ "CHÉP" khi máy không có bảng chia sẻ (phần lớn máy tính để
 *   bàn). Và phải NÓI RÕ mình vừa làm gì — "đã chép" khác "đã gửi", người
 *   dùng cần biết bước tiếp theo là gì.
 *
 * ⚠️ Người dùng BẤM HUỶ ở bảng chia sẻ cũng ném lỗi `AbortError`. Đó KHÔNG
 *   phải hỏng — báo đỏ lúc đó là mắng người ta vì đã đổi ý.
 */
export function NutChiaSe({
  noiDung,
  tieuDe,
  nhan,
  className,
  bienThe = "outline",
}: {
  /** Chuỗi được chia sẻ / chép. Thường là một đường dẫn. */
  noiDung: string;
  /** Tiêu đề hiện trong bảng chia sẻ của hệ điều hành. */
  tieuDe?: string;
  nhan?: string;
  className?: string;
  bienThe?: "outline" | "ghost";
}) {
  const t = useTranslations("common.share");
  const [vuaChep, datVuaChep] = useState(false);
  const [coBangChiaSe] = useState(
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
  );

  async function lam() {
    if (coBangChiaSe) {
      try {
        await navigator.share({ title: tieuDe, text: noiDung });
        return;
      } catch (e) {
        // Bấm Huỷ ở bảng chia sẻ cũng vào đây — im lặng quay về, và thử chép
        // để người ta vẫn có đường dùng.
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(noiDung);
      datVuaChep(true);
      toast.success(t("copied"));
      setTimeout(() => datVuaChep(false), 2000);
    } catch {
      // Trình duyệt chặn chép (không phải HTTPS, hoặc chưa có thao tác người
      // dùng) — nói thẳng thay vì im lặng không làm gì.
      toast.error(t("cannotCopy"));
    }
  }

  return (
    <button
      type="button"
      onClick={lam}
      className={cn(
        "flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium max-md:min-h-11",
        bienThe === "outline" ? "border hover:bg-muted" : "hover:bg-muted",
        className,
      )}
    >
      {vuaChep ? (
        <Check className="size-3.5 text-primary" />
      ) : coBangChiaSe ? (
        <Share2 className="size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {nhan ?? (coBangChiaSe ? t("share") : t("copy"))}
    </button>
  );
}
