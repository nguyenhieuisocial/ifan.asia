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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

  /**
   * Tiệm chỉ có ĐÚNG 1 người để giao thì chọn sẵn luôn, không bắt mở danh sách
   * chọn một-trong-một. Tính DẪN XUẤT chứ không setState: đỡ phải đồng bộ khi
   * danh sách người đổi giữa chừng, và không có trạng thái "nhìn thấy tên
   * nhưng máy vẫn coi là chưa chọn".
   */
  const toUserIdEffective = candidates.length === 1 ? candidates[0].user_id : toUserId;

  const reset = () => {
    setToUserId("");
    setReason("");
  };

  const submit = () => {
    if (pending || !toUserIdEffective || !reason.trim()) return;
    startTransition(async () => {
      const res = await handoffConversation({
        conversationId,
        toUserId: toUserIdEffective,
        reason: reason.trim(),
      });
      if (res.error) {
        toast.error(t(`errors.${ERROR_KEYS.has(res.error) ? res.error : "handoff_failed"}`));
        return;
      }
      toast.success(
        t("done", {
          name: memberLabel(toUserIdEffective, currentUserId, tInbox, memberNames),
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
            <Label htmlFor="handoff-to">{t("toLabel")}</Label>
            {candidates.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-[13px] text-muted-foreground">
                {t("noCandidates")}
              </p>
            ) : (
              <Select
                id="handoff-to"
                value={toUserIdEffective}
                onChange={(e) => setToUserId(e.target.value)}
                required
              >
                {/* Tiệm chỉ có ĐÚNG 1 người để giao thì không bày dòng "chọn
                    người..." — chọn sẵn luôn, người dùng vẫn phải bấm nút
                    "Bàn giao" nên không có chuyện giao nhầm sau lưng. */}
                {candidates.length > 1 && <option value="">{t("toPlaceholder")}</option>}
                {candidates.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {memberLabel(m.user_id, currentUserId, tInbox, memberNames)}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="handoff-reason">{t("reasonLabel")}</Label>
            <Textarea
              id="handoff-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              required
              placeholder={t("reasonPlaceholder")}
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
              disabled={pending || !toUserIdEffective || !reason.trim()}
            >
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
