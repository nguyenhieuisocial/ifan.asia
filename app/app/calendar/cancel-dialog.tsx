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
import { cancelAppointment } from "./actions";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string | null;
}) {
  const t = useTranslations("calendar.cancel");
  const [reason, setReason] = useState<(typeof CANCEL_REASONS)[number] | "">("");
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    if (!appointmentId || !reason) return;
    startTransition(async () => {
      const res = await cancelAppointment({ id: appointmentId, reason });
      if (res.error) {
        toast.error(t("errorSave"));
        return;
      }
      toast.success(t("saved"));
      setReason("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

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
