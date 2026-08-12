"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { submitHelpRequest } from "@/app/app/support/actions";

/**
 * Màn "Cần giúp?" (mục 36.8-5, thẻ design man-ho-tro-chi-doc.html) — mô tả
 * chỗ kẹt + hộp kiểm "Cho iFan xem màn hình tiệm tôi để hỗ trợ (chỉ xem)".
 * MẶC ĐỊNH KHÔNG TICK: cho người lạ xem dữ liệu khách của mình là quyết định
 * của chủ tiệm, không phải mặc định của phần mềm (ADR-0006 mục 6). Không tick
 * vẫn gửi được — hỗ trợ chỉ qua chữ.
 */
export function HelpRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("support.helpRequest");
  const [message, setMessage] = useState("");
  const [allowScreenView, setAllowScreenView] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (pending || message.trim().length === 0) return;
    startTransition(async () => {
      const res = await submitHelpRequest({ message: message.trim(), allowScreenView });
      if (res.error) {
        toast.error(t(`errors.${res.error}` as "errors.sendFailed"));
        return;
      }
      toast.success(t("sent"));
      onOpenChange(false);
      setMessage("");
      setAllowScreenView(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy className="size-4" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("placeholder")}
          rows={3}
          maxLength={1000}
          disabled={pending}
        />
        <Label className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-[13px] leading-relaxed font-normal">
          <Checkbox
            checked={allowScreenView}
            onChange={(e) => setAllowScreenView(e.target.checked)}
            disabled={pending}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-foreground">{t("allowScreenView")}</span>
            <br />
            <span className="text-muted-foreground">{t("allowScreenViewHint")}</span>
          </span>
        </Label>
        <DialogFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || message.trim().length === 0}
          >
            {pending ? t("sending") : t("submit")}
          </Button>
        </DialogFooter>
        <p className="text-center text-xs text-muted-foreground">{t("noTickHint")}</p>
      </DialogContent>
    </Dialog>
  );
}
