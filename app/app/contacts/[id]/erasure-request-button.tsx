"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { taoYeuCauXoa } from "../../settings/data-erasure/actions";

/**
 * Lối mở một yêu cầu xoá dữ liệu ngay trên hồ sơ khách (Nghị định 13).
 *
 * Khách đòi xoá thì người tiếp nhận đang ĐỨNG Ở HỒ SƠ KHÁCH, không ở Cài đặt —
 * bắt họ nhớ đường sang Cài đặt rồi tìm lại đúng người là chỗ yêu cầu bị rơi.
 *
 * ⚠️ NÚT NÀY KHÔNG XOÁ GÌ CẢ, và câu chữ trong cửa sổ phải nói rõ điều đó:
 * nó chỉ GHI NHẬN yêu cầu. Việc thi hành nằm ở Cài đặt → Yêu cầu xoá dữ liệu
 * và cần một người bấm lần thứ hai — chốt (1) của migration #287, dựng ra
 * đúng để một cú bấm nhầm không xoá vĩnh viễn được thứ gì.
 *
 * Chỉ hiện với owner/admin (`canRequestErasure` ở page.tsx) — đúng chốt vai
 * của `erasure_request_create`, hàm ném 'forbidden' cho vai khác.
 */
export function ErasureRequestButton({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const t = useTranslations("settings.dataErasure");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await taoYeuCauXoa(contactId, note.trim());
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("toasts.created"));
      setOpen(false);
      setNote("");
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="max-md:h-11"
        onClick={() => setOpen(true)}
      >
        <ShieldOff className="size-4" aria-hidden />
        {t("create.button")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("create.title", { name: contactName })}</DialogTitle>
            <DialogDescription>{t("create.description")}</DialogDescription>
          </DialogHeader>

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("create.notePlaceholder")}
            aria-label={t("create.noteLabel")}
            maxLength={2000}
          />
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {t("create.twoStep")}{" "}
            <Link
              href="/app/settings/data-erasure"
              className="underline underline-offset-2"
            >
              {t("create.openList")}
            </Link>
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button onClick={submit} disabled={pending}>
              {t("create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
