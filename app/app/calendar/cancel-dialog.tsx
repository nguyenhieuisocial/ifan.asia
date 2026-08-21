"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cancelAppointment, huyChuoi } from "./actions";
import { CANCEL_REASONS } from "./types";

/**
 * Huỷ BẮT BUỘC chọn lý do (thẻ design man-lich-hen.html "3 luật cứng") —
 * không có lý do thì sau này không biết vì sao mất khách. Một chạm (radio),
 * không phải ô nhập tự do — 5 lý do cố định đủ phủ trường hợp thường gặp.
 */
export function CancelDialog({
  open,
  onOpenChange,
  appointmentId,
  chuoi = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string | null;
  /**
   * Buổi này thuộc một liệu trình lặp lại → phải HỎI PHẠM VI.
   *
   * ⚠️ Thiếu câu hỏi này thì lặp lại là cái bẫy chứ không phải tính năng: người
   *   ta định huỷ MỘT buổi mà bay cả liệu trình 8 buổi của khách, hoặc ngược
   *   lại — huỷ một buổi rồi tưởng đã huỷ hết, và bảy buổi kia vẫn nằm đó chờ.
   *   Google hỏi câu này mỗi lần đụng vào một sự kiện lặp, vì cùng lý do.
   */
  chuoi?: { index: number; total: number } | null;
}) {
  const t = useTranslations("calendar.cancel");
  const tError = useTranslations("calendar.error");
  const [reason, setReason] = useState<(typeof CANCEL_REASONS)[number] | "">("");
  // Mặc định "chỉ buổi này" — phép hẹp nhất. Mặc định rộng là cách làm bay dữ
  // liệu của người khác bằng một cú bấm thiếu chú ý.
  const [pham, setPham] = useState<"mot" | "tu_day" | "tat_ca">("mot");
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    if (!appointmentId || !reason) return;
    startTransition(async () => {
      const res = chuoi
        ? await huyChuoi({ appointmentId, pham, reason })
        : await cancelAppointment({ id: appointmentId, reason });
      if (res.error) {
        // Máy chủ nay chặn huỷ ca đã kết thúc / đã vào thùng rác. Nói đúng lý do
        // thay vì "thử lại" chung chung — thử lại bao nhiêu lần cũng vẫn hỏng,
        // cái người dùng cần là tải lại trang để thấy tình trạng thật.
        toast.error(res.error === "requires_active" ? tError("requiresActive") : t("errorSave"));
        return;
      }
      toast.success(
        chuoi && "soBuoi" in res && res.soBuoi > 1
          ? t("savedMany", { count: res.soBuoi })
          : t("saved"),
      );
      setReason("");
      setPham("mot");
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setReason("");
          setPham("mot");
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {chuoi && (
          <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="text-[12px] font-semibold text-amber-900 dark:text-amber-200">
              {t("seriesTitle", { index: chuoi.index, total: chuoi.total })}
            </p>
            {(
              [
                ["mot", t("scopeOne")],
                ["tu_day", t("scopeFollowing", { count: chuoi.total - chuoi.index + 1 })],
                ["tat_ca", t("scopeAll", { count: chuoi.total })],
              ] as const
            ).map(([v, nhan]) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="radio"
                  name="pham-vi-huy"
                  checked={pham === v}
                  onChange={() => setPham(v)}
                  className="size-4 accent-primary"
                />
                {nhan}
              </label>
            ))}
          </div>
        )}

        <div className="space-y-2 py-2">
          {CANCEL_REASONS.map((r) => (
            <label
              key={r}
              className="flex cursor-pointer items-center gap-2.5 rounded-md border border-input px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="cancel-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="size-4 accent-primary"
              />
              {r}
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("back")}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!reason || pending}>
            {pending ? t("saving") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
