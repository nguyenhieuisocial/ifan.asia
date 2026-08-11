"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rescheduleNextAction } from "./actions";

/**
 * B17 — Dialog nhanh "Hẹn tiếp": đúng 2 trường (ngày hẹn mới + ghi chú) để dời
 * hạn việc kế tiếp trong 2 chạm, khỏi mở form sửa cơ hội đầy đủ. Gọi từ:
 *   (a) card "Việc kế tiếp" ở màn chi tiết cơ hội;
 *   (b) dòng cơ hội trên màn "Hôm nay gọi ai".
 * Mobile: DialogContent tự thành bottom-sheet (components/ui/dialog.tsx).
 * Mẫu mount: cha render `{open && <RescheduleDialog open …>}` — đóng là unmount,
 * state tự reset (cùng quy ước với DealFormDialog).
 */
export function RescheduleDialog({
  open,
  onOpenChange,
  dealId,
  dealTitle,
  initialDate,
  initialNote,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  dealTitle: string;
  /** yyyy-MM-dd — ngày hẹn hiện tại (cha truyền ngày mai nếu chưa có hẹn). */
  initialDate: string;
  initialNote: string;
  onSuccess?: () => void;
}) {
  const t = useTranslations("deals.reschedule");
  const tForm = useTranslations("deals.form");
  const tCommon = useTranslations("common");
  const [date, setDate] = useState(initialDate);
  const [note, setNote] = useState(initialNote);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (pending || date === "") return;
    startTransition(async () => {
      const res = await rescheduleNextAction(dealId, {
        nextActionDate: date,
        nextActionNote: note.trim() || null,
      });
      if (res.error) {
        toast.error(res.error);
        return; // giữ dialog để người dùng sửa lại
      }
      toast.success(t("success"));
      onOpenChange(false);
      onSuccess?.();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { deal: dealTitle })}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="rs-date">
              {t("dateLabel")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rs-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              autoFocus
            />
            {/* Cùng luật với form đầy đủ: hạn = hết ngày đã chọn theo giờ VN */}
            <p className="text-xs text-muted-foreground">{tForm("nextActionHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-note">{t("noteLabel")}</Label>
            <Input
              id="rs-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tForm("nextActionNotePlaceholder")}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending || date === ""}>
              {t("confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
