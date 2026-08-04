"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { handoffConversation } from "./handoff-actions";
import { memberLabel, type Member, type MemberNames } from "./types";

/** Mã lỗi có chuỗi dịch riêng; ngoài danh sách này gom về thông báo chung. */
const ERROR_KEYS = new Set([
  "receiver_not_member",
  "conversation_not_found",
  "already_assigned",
  "reason_required",
  "not_authenticated",
  "forbidden",
  "invalid_input",
]);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  /** Người đang phụ trách — không cho chọn lại chính người đó. */
  currentAssigneeId: string | null;
  currentUserId: string;
  members: Member[];
  memberNames: MemberNames;
};

/**
 * Hộp thoại "Bàn giao khách": chọn người nhận + ghi lý do.
 * Lý do là BẮT BUỘC — đó là thứ giúp người nhận vào việc ngay mà không phải
 * đọc lại hội thoại từ đầu, và là giá trị của sổ lịch sử bàn giao.
 */
export function HandoffDialog({
  open,
  onOpenChange,
  conversationId,
  currentAssigneeId,
  currentUserId,
  members,
  memberNames,
}: Props) {
  const t = useTranslations("inbox.handoff");
  const tInbox = useTranslations("inbox"); // memberLabel dùng inbox.thread.me/member
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [toUserId, setToUserId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const candidates = members.filter((m) => m.user_id !== currentAssigneeId);

  const reset = () => {
    setToUserId("");
    setReason("");
  };

  const submit = () => {
    if (pending || !toUserId || !reason.trim()) return;
    startTransition(async () => {
      const res = await handoffConversation({
        conversationId,
        toUserId,
        reason: reason.trim(),
      });
      if (res.error) {
        toast.error(t(`errors.${ERROR_KEYS.has(res.error) ? res.error : "handoff_failed"}`));
        return;
      }
      toast.success(
        t("done", {
          name: memberLabel(toUserId, currentUserId, tInbox, memberNames),
        }),
      );
      reset();
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["handoffs", conversationId] });
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="handoff-to" className="text-[13px] font-medium">
              {t("toLabel")}
            </label>
            {candidates.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-[13px] text-muted-foreground">
                {t("noCandidates")}
              </p>
            ) : (
              <select
                id="handoff-to"
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                required
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="">{t("toPlaceholder")}</option>
                {candidates.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {memberLabel(m.user_id, currentUserId, tInbox, memberNames)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="handoff-reason" className="text-[13px] font-medium">
              {t("reasonLabel")}
            </label>
            <textarea
              id="handoff-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              required
              placeholder={t("reasonPlaceholder")}
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
            <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={pending || !toUserId || !reason.trim()}
            >
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
